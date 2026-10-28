import { describe, expect, it } from 'vitest';
import { checksum } from '../src/checksum';
import { cloneState, createInitialState } from '../src/state';
import { step } from '../src/step';
import type { GameState } from '../src/types';
import { randomBot as humanBot } from '../src/bot';

function newMatch(p1: string, p2: string, seed = 7): GameState {
  return createInitialState({ seed, fighters: [p1, p2], roundsToWin: 3, roundFrames: 3600, viewMirrored: [false, false] });
}

/**
 * Synctest (PLAN §10.2): every frame, roll back `depth` frames, re-simulate, compare checksums.
 * Catches anything that leaks state outside GameState or isn't copied by cloneState().
 */
function synctest(p1: string, p2: string, frames: number, depth: number, seed: number): void {
  const s = newMatch(p1, p2, seed);
  const bots = [humanBot(seed * 3 + 1), humanBot(seed * 3 + 2)];
  const inputs: [number, number][] = [];
  const history: GameState[] = [];
  for (let f = 0; f < frames; f++) {
    inputs.push([bots[0]!(), bots[1]!()]);
    history.push(cloneState(s));
    step(s, inputs[f]!);
    const from = Math.max(0, f - depth + 1);
    const r = cloneState(history[from]!);
    for (let g = from; g <= f; g++) step(r, inputs[g]!);
    if (checksum(r) !== checksum(s)) throw new Error(`desync at frame ${f} (${p1} vs ${p2})`);
    if (history.length > depth + 2) history[f - depth - 2] = undefined as unknown as GameState;
  }
}

describe('determinism', () => {
  it.each([
    ['kaito', 'magnus'],
    ['magnus', 'kaito'],
    ['kaito', 'kaito'],
    ['magnus', 'magnus'],
    ['dummy', 'kaito'],
  ])('synctest %s vs %s: 10,000 frames, 8-frame rollback every frame', (p1, p2) => {
    expect(() => synctest(p1, p2, 10_000, 8, p1.length * 100 + p2.length)).not.toThrow();
  });

  it('the same inputs give the same result', () => {
    const run = () => {
      const s = newMatch('kaito', 'magnus');
      const bots = [humanBot(1), humanBot(2)];
      for (let i = 0; i < 5000; i++) step(s, [bots[0]!(), bots[1]!()]);
      return checksum(s);
    };
    expect(run()).toBe(run());
  });

  it('a real match happens in the synctest (hits, KOs, rounds)', () => {
    const s = newMatch('kaito', 'magnus');
    const bots = [humanBot(11), humanBot(12)];
    let events = 0;
    for (let i = 0; i < 20_000; i++) {
      step(s, [bots[0]!(), bots[1]!()]);
      events += s.recentEvents.filter((e) => e.frame === s.frame && e.type <= 3).length;
    }
    expect(events).toBeGreaterThan(50);
    expect(s.round + s.fighters[0].roundsWon + s.fighters[1].roundsWon).toBeGreaterThan(2);
  });
});

describe('state copying and checksums', () => {
  function midFight(): GameState {
    const s = newMatch('kaito', 'magnus');
    const bots = [humanBot(3), humanBot(4)];
    for (let i = 0; i < 400; i++) step(s, [bots[0]!(), bots[1]!()]);
    // make sure there are events to cover
    s.recentEvents.push({ frame: s.frame, fighter: 0, type: 1, value: 7, x: 1, y: 2, z: 3 });
    return s;
  }

  /** Visit every numeric leaf of plain data with a setter. */
  function leaves(obj: unknown, path: string, out: { path: string; get: () => number; set: (v: number) => void }[]) {
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => {
        if (typeof v === 'number') out.push({ path: `${path}[${i}]`, get: () => obj[i], set: (n) => (obj[i] = n) });
        else leaves(v, `${path}[${i}]`, out);
      });
    } else if (obj && typeof obj === 'object') {
      const o = obj as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'number') out.push({ path: `${path}.${k}`, get: () => o[k] as number, set: (n) => (o[k] = n) });
        else leaves(v, `${path}.${k}`, out);
      }
    }
    return out;
  }

  it('the checksum covers every field', () => {
    const s = midFight();
    const base = checksum(s);
    const fields = leaves(s, 'state', []);
    expect(fields.length).toBeGreaterThan(100);
    for (const f of fields) {
      const old = f.get();
      f.set(old + 1);
      expect(checksum(s), f.path).not.toBe(base);
      f.set(old);
    }
    expect(checksum(s)).toBe(base);
  });

  it('cloneState is a deep copy', () => {
    const s = midFight();
    const base = checksum(s);
    const c = cloneState(s);
    expect(checksum(c)).toBe(base);
    for (const f of leaves(c, 'clone', [])) f.set(f.get() + 1);
    expect(checksum(s)).toBe(base);
  });

  it('state is plain JSON data', () => {
    const s = midFight();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
