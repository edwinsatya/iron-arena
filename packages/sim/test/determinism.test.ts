import { describe, expect, it } from 'vitest';
import { cpuBot, randomBot } from '../src/bot';
import { checksum } from '../src/checksum';
import { PHASE } from '../src/constants';
import { cloneState } from '../src/state';
import { step } from '../src/step';
import type { GameState } from '../src/types';
import { newMatch } from './helpers';

const HEROES = ['kaito', 'magnus', 'riko', 'seren'];

/**
 * Synctest (PLAN §10.2): every frame, roll back `depth` frames, re-simulate, compare checksums.
 * Catches anything that leaks state outside GameState or isn't copied by cloneState().
 */
function synctest(p1: string, p2: string, frames: number, depth: number, seed: number, smart: boolean): void {
  const s = newMatch(p1, p2, seed);
  const r1 = randomBot(seed * 3 + 1);
  const r2 = randomBot(seed * 3 + 2);
  const c1 = cpuBot(seed * 5 + 1, { level: 2 });
  const c2 = cpuBot(seed * 5 + 2, { level: 2 });
  const inputs: [number, number][] = [];
  const history: GameState[] = [];
  for (let f = 0; f < frames; f++) {
    inputs.push(smart ? [c1(s, 0), c2(s, 1)] : [r1(), r2()]);
    history.push(cloneState(s));
    step(s, inputs[f]!);
    const from = Math.max(0, f - depth + 1);
    const r = cloneState(history[from]!);
    for (let g = from; g <= f; g++) step(r, inputs[g]!);
    if (checksum(r) !== checksum(s)) throw new Error(`desync at frame ${f} (${p1} vs ${p2})`);
    if (history.length > depth + 2) history[f - depth - 2] = undefined as unknown as GameState;
  }
}

function allIntegers(v: unknown, path = 's'): string | null {
  if (typeof v === 'number') return Number.isInteger(v) ? null : `${path} = ${v}`;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const bad = allIntegers(v[i], `${path}[${i}]`);
      if (bad) return bad;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const bad = allIntegers(x, `${path}.${k}`);
      if (bad) return bad;
    }
    return null;
  }
  return `${path} is ${typeof v}`;
}

describe('determinism', () => {
  const pairs = HEROES.flatMap((a) => HEROES.map((b) => [a, b] as const));
  it.each(pairs)('synctest %s vs %s (random inputs and CPU play, 8-frame rollback every frame)', (p1, p2) => {
    expect(() => synctest(p1, p2, 2500, 8, p1.length * 100 + p2.length, false)).not.toThrow();
    expect(() => synctest(p1, p2, 2500, 8, p1.length * 7 + p2.length, true)).not.toThrow();
  });

  it('the same inputs give the same result', () => {
    const run = () => {
      const s = newMatch('riko', 'seren');
      const bots = [randomBot(1), randomBot(2)];
      for (let i = 0; i < 5000; i++) step(s, [bots[0]!(), bots[1]!()]);
      return checksum(s);
    };
    expect(run()).toBe(run());
  });

  it('every number in the state stays an integer', () => {
    for (const [a, b] of pairs) {
      const s = newMatch(a, b, 3);
      const bots = [cpuBot(1, { level: 2 }), cpuBot(2, { level: 2 })];
      for (let i = 0; i < 3000; i++) {
        step(s, [bots[0]!(s, 0), bots[1]!(s, 1)]);
        if (i % 50 === 0) expect(allIntegers(s)).toBeNull();
      }
    }
  });

  it('CPU matches finish with a winner', () => {
    const s = newMatch('kaito', 'riko', 9);
    const bots = [cpuBot(3, { level: 2 }), cpuBot(4, { level: 2 })];
    for (let i = 0; i < 60 * 60 * 8 && s.phase !== PHASE.MATCH_END; i++)
      step(s, [bots[0]!(s, 0), bots[1]!(s, 1)]);
    expect(s.phase).toBe(PHASE.MATCH_END);
  });

  it('a cloned state is independent of the original', () => {
    const s = newMatch();
    const c = cloneState(s);
    c.fighters[0].cd[0] = 99;
    c.fighters[1].x = 5;
    expect(s.fighters[0].cd[0]).toBe(0);
    expect(s.fighters[1].x).not.toBe(5);
    expect(checksum(cloneState(s))).toBe(checksum(s));
  });
});
