/**
 * Two fake players walk through the whole lobby flow against a running lobby.
 * Use it to check local dev or a real deployment:
 *
 *   pnpm lobby:smoke                          # http://localhost:8787
 *   pnpm lobby:smoke https://neon-fist-lobby.<you>.workers.dev
 */
import { ServerMsgSchema, type ServerMsg } from '@neonfist/shared';
import WebSocket from 'ws';

const base = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '');

function client(code: string) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${code}/ws`);
  const inbox: ServerMsg[] = [];
  const binary: Buffer[] = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) binary.push(data as Buffer);
    else inbox.push(ServerMsgSchema.parse(JSON.parse(data.toString())));
  });
  const opened = new Promise<void>((r, j) => {
    ws.on('open', () => r());
    ws.on('error', j);
  });
  const waitFor = async (what: string, pred: (m: ServerMsg) => boolean, ms = 5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const m = inbox.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout waiting for ${what}`);
  };
  return { ws, binary, opened, waitFor, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

async function main() {
  const t0 = Date.now();
  const step = (s: string) => console.log(`✓ ${s} (${Date.now() - t0} ms)`);
  const health = await (await fetch(`${base}/api/health`)).json();
  step(`health ${JSON.stringify(health)}`);
  const { code } = (await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json()) as { code: string };
  step(`room created: ${code}`);
  const a = client(code);
  const b = client(code);
  await Promise.all([a.opened, b.opened]);
  a.send({ t: 'hello', name: 'Smoke A', clientId: 'smoke-aaaa', simVersion: 'smoke' });
  b.send({ t: 'hello', name: 'Smoke B', clientId: 'smoke-bbbb', simVersion: 'smoke' });
  await b.waitFor('select phase', (m) => m.t === 'room' && m.phase === 'select');
  const ice = await a.waitFor('ICE servers', (m) => m.t === 'ice');
  step(`both joined; ICE: ${JSON.stringify((ice as Extract<ServerMsg, { t: 'ice' }>).iceServers.map((s) => s.urls))}`);
  a.send({ t: 'select', fighter: 'kaito' });
  b.send({ t: 'select', fighter: 'magnus' });
  a.send({ t: 'ready', ready: true, viewMirrored: false });
  b.send({ t: 'ready', ready: true, viewMirrored: true });
  const cfg = await b.waitFor('config', (m) => m.t === 'config');
  step(`config ${JSON.stringify((cfg as Extract<ServerMsg, { t: 'config' }>).config)}`);
  a.send({ t: 'signal', data: { kind: 'candidate', candidate: { candidate: 'smoke' } } });
  await b.waitFor('signal', (m) => m.t === 'signal');
  step('signaling forwarded');
  a.send({ t: 'relay', on: true });
  await b.waitFor('relay', (m) => m.t === 'relay');
  a.ws.send(new Uint8Array([1, 2, 3]), { binary: true });
  const t1 = Date.now();
  while (!b.binary.length && Date.now() - t1 < 3000) await new Promise((r) => setTimeout(r, 10));
  if (!b.binary.length) throw new Error('relay frame not delivered');
  step('relay frame delivered');
  a.send({ t: 'loaded' });
  b.send({ t: 'loaded' });
  await a.waitFor('start', (m) => m.t === 'start');
  await b.waitFor('start', (m) => m.t === 'start');
  step('match started');
  a.ws.close();
  b.ws.close();
  console.log('\nLOBBY SMOKE TEST PASSED');
}

main().catch((err) => {
  console.error('LOBBY SMOKE TEST FAILED:', err.message);
  process.exit(1);
});
