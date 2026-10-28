import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { ServerMsgSchema, type ServerMsg } from '@neonfist/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startLobbyServer } from '../src/node-server';

let server: Server;
let base: string;

beforeAll(async () => {
  server = await startLobbyServer(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function client(code: string) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/api/rooms/${code}/ws`);
  const inbox: ServerMsg[] = [];
  const binary: Buffer[] = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) binary.push(data as Buffer);
    else inbox.push(ServerMsgSchema.parse(JSON.parse(data.toString())));
  });
  const opened = new Promise<void>((r) => ws.on('open', () => r()));
  const waitFor = async (pred: (m: ServerMsg) => boolean, ms = 2000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const m = inbox.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timeout waiting for message');
  };
  return { ws, inbox, binary, opened, waitFor, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

describe('Node lobby server', () => {
  it('health check', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('full flow: create, join, select, config, signal, relay, start', async () => {
    const res = await fetch(`${base}/api/rooms`, { method: 'POST' });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(await (await fetch(`${base}/api/rooms/${code}`)).json()).toMatchObject({ exists: true, players: 0 });

    const a = client(code);
    const b = client(code);
    await Promise.all([a.opened, b.opened]);
    a.send({ t: 'hello', name: 'Edwin', clientId: 'client-aaaa', simVersion: 'test' });
    await a.waitFor((m) => m.t === 'room');
    b.send({ t: 'hello', name: 'Friend', clientId: 'client-bbbb', simVersion: 'test' });
    await b.waitFor((m) => m.t === 'room' && m.phase === 'select');
    await a.waitFor((m) => m.t === 'ice');

    a.send({ t: 'select', fighter: 'kaito' });
    b.send({ t: 'select', fighter: 'magnus' });
    a.send({ t: 'ready', ready: true, viewMirrored: false });
    b.send({ t: 'ready', ready: true, viewMirrored: false });
    const cfg = await b.waitFor((m) => m.t === 'config');
    expect(cfg).toMatchObject({ t: 'config', config: { fighters: ['kaito', 'magnus'] } });

    a.send({ t: 'signal', data: { kind: 'candidate', candidate: { candidate: 'x' } } });
    await b.waitFor((m) => m.t === 'signal');

    a.send({ t: 'relay', on: true });
    await b.waitFor((m) => m.t === 'relay');
    a.ws.send(new Uint8Array([1, 0, 9]), { binary: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(b.binary[0] && [...b.binary[0]]).toEqual([1, 0, 9]);

    a.send({ t: 'loaded' });
    b.send({ t: 'loaded' });
    await a.waitFor((m) => m.t === 'start');
    await b.waitFor((m) => m.t === 'start');
    a.ws.close();
    b.ws.close();
  });

  it('unknown room: explains instead of silently failing', async () => {
    const c = client('ZZZZZZ');
    const err = await c.waitFor((m) => m.t === 'error');
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
  });
});
