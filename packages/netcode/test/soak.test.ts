import { checksum, cloneState, createInitialState, randomBot, step, type GameState } from '@neonfist/sim';
import { describe, expect, it } from 'vitest';
import { decodeInputPacket, encodeInputPacket } from '../src/packet';
import type { SimAdapter } from '../src/session';
import { randomConfig, runNet } from './harness';

const sim: SimAdapter<GameState> = { step, clone: cloneState, checksum };
const initial = () =>
  createInitialState({
    seed: 99,
    fighters: ['kaito', 'magnus'],
    roundsToWin: 3,
    roundFrames: 3600,
    viewMirrored: [false, true],
  });

describe('packet codec', () => {
  it('round-trips', () => {
    const p = {
      epoch: 3,
      start: 123456,
      ack: 123440,
      frame: 123460,
      adv: -3,
      inputs: [0, 5, 255, 65535, 16],
    };
    expect(decodeInputPacket(encodeInputPacket(p))).toEqual(p);
    expect(encodeInputPacket(p).byteLength).toBe(16 + 5 * 2);
  });

  it('rejects garbage', () => {
    expect(() => decodeInputPacket(new ArrayBuffer(3))).toThrow();
    const bad = encodeInputPacket({ epoch: 0, start: 0, ack: 0, frame: 0, adv: 0, inputs: [1, 2] });
    expect(() => decodeInputPacket(bad.slice(0, 17))).toThrow();
  });
});

describe('rollback soak with the real game simulation', () => {
  const named = [
    [
      'LAN',
      { latency: 0, jitter: 0, loss: 0, delay: [2, 2], lateStart: 0, maxRollback: 8, ticks: 3000, seed: 1 },
    ],
    [
      '50–83 ms, 5% loss',
      {
        latency: 3,
        jitter: 2,
        loss: 0.05,
        delay: [2, 2],
        lateStart: 0,
        maxRollback: 8,
        ticks: 3000,
        seed: 3,
      },
    ],
    [
      '133–200 ms, 20% loss',
      { latency: 8, jitter: 4, loss: 0.2, delay: [3, 1], lateStart: 0, maxRollback: 8, ticks: 3000, seed: 5 },
    ],
    [
      'late start + stray packets from an old match',
      {
        latency: 2,
        jitter: 1,
        loss: 0.02,
        delay: [2, 2],
        lateStart: 20,
        maxRollback: 8,
        ticks: 3000,
        seed: 6,
        strayEpochPackets: true,
      },
    ],
  ] as const;

  it.each(named)('%s: 0 desyncs', (_name, cfg) => {
    const r = runNet(sim, initial, randomBot, { ...cfg, delay: [cfg.delay[0], cfg.delay[1]] });
    expect(r.compared).toBeGreaterThan(cfg.ticks);
    expect(r.mismatches).toBe(0);
  });

  it('40 random networks: 0 desyncs (pnpm soak runs 300)', () => {
    let compared = 0;
    let mismatches = 0;
    for (let i = 0; i < 40; i++) {
      const r = runNet(sim, initial, randomBot, randomConfig(i, 2000));
      compared += r.compared;
      mismatches += r.mismatches;
    }
    expect(compared).toBeGreaterThan(100_000);
    expect(mismatches).toBe(0);
  });
});
