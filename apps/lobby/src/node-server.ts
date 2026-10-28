/**
 * Node lobby server — the same protocol as the Cloudflare Worker, for local development
 * (`pnpm dev`) and for self-hosting (e.g. Fly.io region `sin`, PLAN §4.7). No account needed.
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  ClientMsgSchema,
  DEFAULT_LOBBY_PORT,
  isValidRoomCode,
  parseJson,
  ROOM_IDLE_MS,
  type ServerMsg,
} from '@neonfist/shared';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { corsHeaders, cryptoUint32, fetchIceServers, generateRoomCode } from './common';
import { newRoomState, RoomLogic, type RoomIO, type Slot } from './room-logic';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? '*';

interface Conn {
  ws: WebSocket;
  slot: Slot | null;
}
interface Room {
  logic: RoomLogic;
  conns: Set<Conn>;
}

/** Start the lobby on `port` (0 = any free port). Resolves with the server once listening. */
export function startLobbyServer(port: number): Promise<http.Server> {
  const rooms = new Map<string, Room>();

  function roomIO(room: Room): RoomIO {
    return {
      send(slot, msg) {
        const data = JSON.stringify(msg);
        for (const c of room.conns) if (c.slot === slot && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
      },
      sendBinary(slot, data) {
        for (const c of room.conns) {
          if (c.slot === slot && c.ws.readyState === WebSocket.OPEN) c.ws.send(data, { binary: true });
        }
      },
      closeSlot(slot, code, reason) {
        for (const c of room.conns) if (c.slot === slot) c.ws.close(code, reason);
      },
      getIceServers: () => fetchIceServers(process.env),
      randomUint32: cryptoUint32,
      now: () => Date.now(),
    };
  }

  function createRoom(): string {
    let code: string;
    do code = generateRoomCode(cryptoUint32);
    while (rooms.has(code));
    const room = { conns: new Set<Conn>() } as Room;
    room.logic = new RoomLogic(newRoomState(code, Date.now()), roomIO(room));
    rooms.set(code, room);
    return code;
  }

  function json(res: http.ServerResponse, status: number, body: unknown, origin: string | null): void {
    res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(origin, ALLOWED_ORIGINS) });
    res.end(JSON.stringify(body));
  }

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin ?? null;
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(origin, ALLOWED_ORIGINS));
      res.end();
      return;
    }
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size }, origin);
    if (url.pathname === '/api/rooms' && req.method === 'POST') return json(res, 201, { code: createRoom() }, origin);
    const m = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})$/);
    if (m && req.method === 'GET') {
      const room = rooms.get(m[1]!);
      if (!room) return json(res, 404, { exists: false }, origin);
      const st = room.logic.state;
      return json(res, 200, { exists: true, phase: st.phase, players: st.players.filter(Boolean).length }, origin);
    }
    json(res, 404, { error: 'not found' }, origin);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const m = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (!m) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, m[1]!));
  });

  function send(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function toArrayBuffer(data: RawData): ArrayBuffer {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  function onConnection(ws: WebSocket, code: string): void {
    const room = isValidRoomCode(code) ? rooms.get(code) : undefined;
    if (!room) {
      send(ws, { t: 'error', code: 'NOT_FOUND', message: 'Room not found. Check the code or create a new room.' });
      ws.close(4004, 'not found');
      return;
    }
    const conn: Conn = { ws, slot: null };
    room.conns.add(conn);

    ws.on('message', (data, isBinary) => {
      try {
        if (isBinary) {
          if (conn.slot !== null) room.logic.binary(conn.slot, toArrayBuffer(data));
          return;
        }
        const msg = parseJson(ClientMsgSchema, data.toString());
        if (!msg) return send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Invalid message' });
        if (msg.t === 'hello') {
          if (conn.slot !== null) return;
          const res = room.logic.hello(msg, (m) => send(ws, m));
          if (!res.ok) {
            ws.close(4001, 'rejected');
            return;
          }
          for (const c of room.conns) {
            if (c !== conn && c.slot === res.slot) {
              c.slot = null;
              c.ws.close(4000, 'replaced by a new connection');
            }
          }
          conn.slot = res.slot;
          room.logic.welcome(res.slot, res.reconnected);
          void room.logic.sendIce(res.slot);
          return;
        }
        if (conn.slot === null) return send(ws, { t: 'error', code: 'BAD_STATE', message: 'Say hello first' });
        room.logic.message(conn.slot, msg);
      } catch (err) {
        console.error('[lobby] message error', err);
      }
    });

    ws.on('close', () => {
      room.conns.delete(conn);
      if (conn.slot !== null && ![...room.conns].some((c) => c.slot === conn.slot)) room.logic.disconnect(conn.slot);
    });
  }

  // Delete rooms nobody has used for a while.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.conns.size === 0 && now - room.logic.state.lastActivity > ROOM_IDLE_MS) rooms.delete(code);
    }
  }, 60_000);
  cleanup.unref();
  server.on('close', () => clearInterval(cleanup));

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? DEFAULT_LOBBY_PORT);
  void startLobbyServer(port).then(() => console.log(`[lobby] NEON FIST lobby listening on http://localhost:${port}`));
}
