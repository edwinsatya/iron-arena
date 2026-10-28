import type { ClientMsg, ServerMsg } from '@neonfist/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { newRoomState, RoomLogic, type RoomIO, type Slot } from '../src/room-logic';

class FakeIO implements RoomIO {
  sent: [Slot, ServerMsg][] = [];
  binary: [Slot, ArrayBuffer][] = [];
  seed = 1000;
  send(slot: Slot, msg: ServerMsg) {
    this.sent.push([slot, msg]);
  }
  sendBinary(slot: Slot, data: ArrayBuffer) {
    this.binary.push([slot, data]);
  }
  closeSlot() {}
  async getIceServers() {
    return [{ urls: 'stun:example.org' }];
  }
  randomUint32() {
    return this.seed++;
  }
  now() {
    return 0;
  }
  last(slot: Slot, t: ServerMsg['t']) {
    return [...this.sent].reverse().find(([s, m]) => s === slot && m.t === t)?.[1];
  }
  clear() {
    this.sent = [];
  }
}

function hello(name: string, clientId: string, simVersion = 'v1'): Extract<ClientMsg, { t: 'hello' }> {
  return { t: 'hello', name, clientId, simVersion };
}

describe('room logic', () => {
  let io: FakeIO;
  let room: RoomLogic;
  const join = (name: string, id: string, v = 'v1') => {
    const replies: ServerMsg[] = [];
    const r = room.hello(hello(name, id, v), (m) => replies.push(m));
    if (r.ok) room.welcome(r.slot, r.reconnected);
    return { r, replies };
  };

  beforeEach(() => {
    io = new FakeIO();
    room = new RoomLogic(newRoomState('K7Q2XM', 0), io);
  });

  it('two players join: P1 is slot 0, then the room moves to character select', () => {
    expect(join('Edwin', 'client-aaaa').r).toEqual({ ok: true, slot: 0, reconnected: false });
    expect(room.state.phase).toBe('waiting');
    expect(join('Friend', 'client-bbbb').r).toEqual({ ok: true, slot: 1, reconnected: false });
    expect(room.state.phase).toBe('select');
    const msg = io.last(1, 'room') as Extract<ServerMsg, { t: 'room' }>;
    expect(msg.you).toBe(1);
    expect(msg.players.map((p) => p?.name)).toEqual(['Edwin', 'Friend']);
  });

  it('a third player is turned away', () => {
    join('A', 'client-aaaa');
    join('B', 'client-bbbb');
    const { r, replies } = join('C', 'client-cccc');
    expect(r.ok).toBe(false);
    expect(replies[0]).toMatchObject({ t: 'error', code: 'ROOM_FULL' });
  });

  it('a different game version is rejected', () => {
    join('A', 'client-aaaa', 'v1');
    const { r, replies } = join('B', 'client-bbbb', 'v2');
    expect(r.ok).toBe(false);
    expect(replies[0]).toMatchObject({ t: 'error', code: 'VERSION_MISMATCH' });
  });

  function toLoading() {
    join('A', 'client-aaaa');
    join('B', 'client-bbbb');
    room.message(0, { t: 'select', fighter: 'kaito' });
    room.message(1, { t: 'select', fighter: 'magnus' });
    room.message(0, { t: 'ready', ready: true, viewMirrored: false });
    room.message(1, { t: 'ready', ready: true, viewMirrored: true });
  }

  it('both ready → match config with a seed, fighters and views', () => {
    toLoading();
    expect(room.state.phase).toBe('loading');
    const cfg = io.last(0, 'config') as Extract<ServerMsg, { t: 'config' }>;
    expect(cfg.config).toMatchObject({
      fighters: ['kaito', 'magnus'],
      viewMirrored: [false, true],
      simVersion: 'v1',
      roundsToWin: 2,
      roundFrames: 3600,
    });
    expect(io.last(1, 'config')).toEqual(cfg);
  });

  it('rejects unknown fighters and readying without a fighter', () => {
    join('A', 'client-aaaa');
    join('B', 'client-bbbb');
    room.message(0, { t: 'select', fighter: 'tekken-guy' });
    expect(io.last(0, 'error')).toMatchObject({ code: 'BAD_MESSAGE' });
    room.message(1, { t: 'ready', ready: true, viewMirrored: false });
    expect(io.last(1, 'error')).toMatchObject({ code: 'BAD_STATE' });
  });

  it('forwards WebRTC signaling to the other player', () => {
    toLoading();
    room.message(0, { t: 'signal', data: { kind: 'description', description: { type: 'offer', sdp: 'x' } } });
    expect(io.last(1, 'signal')).toEqual({ t: 'signal', data: { kind: 'description', description: { type: 'offer', sdp: 'x' } } });
    expect(io.last(0, 'signal')).toBeUndefined();
  });

  it('both loaded → start; result → results; rematch → new seed', () => {
    toLoading();
    const first = (io.last(0, 'config') as Extract<ServerMsg, { t: 'config' }>).config.seed;
    room.message(0, { t: 'loaded' });
    expect(io.last(0, 'start')).toBeUndefined();
    room.message(1, { t: 'loaded' });
    expect(io.last(0, 'start')).toEqual({ t: 'start' });
    expect(room.state.phase).toBe('match');
    room.message(0, { t: 'result', winner: 0, finalChecksum: 123 });
    expect(room.state.phase).toBe('results');
    io.clear();
    room.message(0, { t: 'rematch' });
    expect(io.last(0, 'config')).toBeUndefined();
    room.message(1, { t: 'rematch' });
    const second = (io.last(0, 'config') as Extract<ServerMsg, { t: 'config' }>).config.seed;
    expect(second).not.toBe(first);
    expect(room.state.phase).toBe('loading');
  });

  it('reselect goes back to character select', () => {
    toLoading();
    room.message(0, { t: 'loaded' });
    room.message(1, { t: 'loaded' });
    room.message(1, { t: 'result', winner: 1, finalChecksum: 1 });
    room.message(1, { t: 'reselect' });
    expect(room.state.phase).toBe('select');
    expect(room.state.players.every((p) => p && !p.ready)).toBe(true);
  });

  it('leaving during select frees the seat and tells the other player', () => {
    join('A', 'client-aaaa');
    join('B', 'client-bbbb');
    room.disconnect(1);
    expect(room.state.players[1]).toBeNull();
    expect(room.state.phase).toBe('waiting');
    expect(io.last(0, 'peer_left')).toEqual({ t: 'peer_left', reason: 'closed' });
  });

  it('a lobby disconnect during a match keeps the seat; reconnecting resends the config', () => {
    toLoading();
    room.message(0, { t: 'loaded' });
    room.message(1, { t: 'loaded' });
    room.disconnect(1);
    expect(room.state.players[1]?.connected).toBe(false);
    expect(room.state.phase).toBe('match');
    io.clear();
    expect(join('B', 'client-bbbb').r).toEqual({ ok: true, slot: 1, reconnected: true });
    expect(io.last(1, 'config')).toBeDefined();
  });

  it('relays binary frames only in relay mode', () => {
    toLoading();
    const data = new Uint8Array([1, 2, 3]).buffer;
    room.binary(0, data);
    expect(io.binary).toHaveLength(0);
    room.message(0, { t: 'relay', on: true });
    expect(io.last(1, 'relay')).toEqual({ t: 'relay', on: true });
    room.binary(0, data);
    expect(io.binary).toEqual([[1, data]]);
  });

  it('answers keepalive pings', () => {
    join('A', 'client-aaaa');
    room.message(0, { t: 'ping' });
    expect(io.last(0, 'pong')).toEqual({ t: 'pong' });
  });
});
