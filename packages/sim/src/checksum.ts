import type { GameState } from './types';

/** FNV-1a style hash over int32 words. */
export function hashInts(values: Iterable<number>): number {
  let h = 0x811c9dc5 | 0;
  for (const v of values) h = Math.imul(h ^ (v | 0), 0x01000193);
  return h >>> 0;
}

/** Every number in the state, in a fixed order (array lengths included), so nothing is missed. */
function* words(v: unknown): Generator<number> {
  if (typeof v === 'number') {
    yield v;
    return;
  }
  if (Array.isArray(v)) {
    yield v.length;
    for (const x of v) yield* words(x);
    return;
  }
  if (v && typeof v === 'object') {
    for (const k in v) yield* words((v as Record<string, unknown>)[k]);
  }
}

/** uint32 checksum of the entire state. */
export function checksum(s: GameState): number {
  return hashInts(words(s));
}
