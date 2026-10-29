/**
 * Cloudflare Worker + one Durable Object per room (PLAN §4.7). Uses the WebSocket Hibernation API:
 * idle rooms (e.g. while players fight peer-to-peer) cost nothing. Room state lives in Durable
 * Object storage and socket attachments, because in-memory fields are lost on hibernation.
 */
import { DurableObject } from 'cloudflare:workers';
import { ClientMsgSchema, isValidRoomCode, parseJson, ROOM_IDLE_MS, type ServerMsg } from '@neonfist/shared';
import { corsHeaders, cryptoUint32, fetchIceServers, generateRoomCode } from './common';
import { newRoomState, RoomLogic, type RoomIO, type RoomState, type Slot } from './room-logic';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  ALLOWED_ORIGINS?: string;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

interface Attachment {
  slot: Slot | null;
}

function slotOf(ws: WebSocket): Slot | null {
  return (ws.deserializeAttachment() as Attachment | null)?.slot ?? null;
}

export class RoomDO extends DurableObject<Env> {
  private logic: RoomLogic | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private io(): RoomIO {
    const sockets = (slot: Slot) => this.ctx.getWebSockets().filter((ws) => slotOf(ws) === slot);
    const trySend = (ws: WebSocket, data: string | ArrayBuffer) => {
      try {
        ws.send(data);
      } catch {
        // socket already closing
      }
    };
    return {
      send: (slot, msg) => {
        const data = JSON.stringify(msg);
        for (const ws of sockets(slot)) trySend(ws, data);
      },
      sendBinary: (slot, data) => {
        for (const ws of sockets(slot)) trySend(ws, data);
      },
      closeSlot: (slot, code, reason) => {
        for (const ws of sockets(slot)) ws.close(code, reason);
      },
      getIceServers: () => fetchIceServers(this.env),
      randomUint32: cryptoUint32,
      now: () => Date.now(),
    };
  }

  private async load(): Promise<RoomLogic | null> {
    if (this.logic) return this.logic;
    const st = await this.ctx.storage.get<RoomState>('room');
    if (!st) return null;
    this.logic = new RoomLogic(st, this.io());
    return this.logic;
  }

  private async save(): Promise<void> {
    if (this.logic) await this.ctx.storage.put('room', this.logic.state);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init') {
      if (await this.load()) return new Response('exists', { status: 409 });
      const code = url.searchParams.get('code') ?? '';
      this.logic = new RoomLogic(newRoomState(code, Date.now()), this.io());
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS);
      return new Response('created', { status: 201 });
    }
    if (url.pathname === '/info') {
      const logic = await this.load();
      if (!logic) return Response.json({ exists: false }, { status: 404 });
      const st = logic.state;
      return Response.json({ exists: true, phase: st.phase, players: st.players.filter(Boolean).length });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket')
        return new Response('expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ slot: null } satisfies Attachment);
      if (!(await this.load())) {
        const msg: ServerMsg = {
          t: 'error',
          code: 'NOT_FOUND',
          message: 'Room not found. Check the code or create a new room.',
        };
        server.send(JSON.stringify(msg));
        server.close(4004, 'not found');
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const logic = await this.load();
    if (!logic) {
      ws.close(4004, 'not found');
      return;
    }
    const slot = slotOf(ws);
    if (typeof message !== 'string') {
      if (slot !== null) logic.binary(slot, message); // relay fallback: no state change
      return;
    }
    const msg = parseJson(ClientMsgSchema, message);
    if (!msg) {
      ws.send(
        JSON.stringify({ t: 'error', code: 'BAD_MESSAGE', message: 'Invalid message' } satisfies ServerMsg),
      );
      return;
    }
    if (msg.t === 'hello') {
      if (slot !== null) return;
      const res = logic.hello(msg, (m) => ws.send(JSON.stringify(m)));
      if (!res.ok) {
        ws.close(4001, 'rejected');
        await this.save();
        return;
      }
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && slotOf(other) === res.slot) {
          other.serializeAttachment({ slot: null } satisfies Attachment);
          other.close(4000, 'replaced by a new connection');
        }
      }
      ws.serializeAttachment({ slot: res.slot } satisfies Attachment);
      logic.welcome(res.slot, res.reconnected);
      await this.save();
      await logic.sendIce(res.slot);
      return;
    }
    if (slot === null) {
      ws.send(
        JSON.stringify({ t: 'error', code: 'BAD_STATE', message: 'Say hello first' } satisfies ServerMsg),
      );
      return;
    }
    logic.message(slot, msg);
    await this.save();
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const slot = slotOf(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    if (slot === null) return;
    const logic = await this.load();
    if (!logic) return;
    const stillConnected = this.ctx.getWebSockets().some((o) => o !== ws && slotOf(o) === slot);
    if (!stillConnected) {
      logic.disconnect(slot);
      await this.save();
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011, 'error');
  }

  override async alarm(): Promise<void> {
    const logic = await this.load();
    if (!logic) return;
    const idle = Date.now() - logic.state.lastActivity;
    if (this.ctx.getWebSockets().length === 0 && idle > ROOM_IDLE_MS) {
      await this.ctx.storage.deleteAll();
      this.logic = null;
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGINS ?? '*');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/api/health') return Response.json({ ok: true }, { headers: cors });

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateRoomCode(cryptoUint32);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST' });
        if (res.status === 201) return Response.json({ code }, { status: 201, headers: cors });
      }
      return Response.json({ error: 'could not create a room' }, { status: 503, headers: cors });
    }

    const m = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(\/ws)?$/);
    if (m && isValidRoomCode(m[1]!)) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]!));
      if (m[2]) return stub.fetch(new Request('https://room/ws', request));
      const res = await stub.fetch('https://room/info');
      return new Response(res.body, {
        status: res.status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    return Response.json({ error: 'not found' }, { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;
