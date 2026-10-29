import { dummy } from '../data/heroes/dummy';
import { kaito } from '../data/heroes/kaito';
import { magnus } from '../data/heroes/magnus';
import { riko } from '../data/heroes/riko';
import { seren } from '../data/heroes/seren';
import type { CompiledHero, HeroData } from './types';

function compileHero(h: HeroData, index: number): CompiledHero {
  const ids: Record<string, number> = {};
  h.actions.forEach((a, i) => {
    if (ids[a.id] !== undefined) throw new Error(`${h.id}: duplicate action ${a.id}`);
    ids[a.id] = i;
  });
  const idx = (id: string) => {
    const i = ids[id];
    if (i === undefined) throw new Error(`${h.id}: unknown action "${id}"`);
    return i;
  };
  for (const a of h.actions) {
    if (a.chain) idx(a.chain.into);
    if (a.counter) idx(a.counter.into);
    for (const s of a.strikes ?? []) if (s.hit.grab) idx(s.hit.grab);
    for (const p of a.projectiles ?? [])
      for (const ang of p.angles ?? []) if (ang % 5 !== 0) throw new Error(`${a.id}: angle ${ang}`);
  }
  return {
    ...h,
    index,
    ids,
    basicIdx: h.basic.map(idx),
    dashIdx: idx(h.dashAttack),
    airIdx: idx(h.airAttack),
    chargeIdx: idx(h.charge),
    skillIdx: [idx(h.skills[0]), idx(h.skills[1]), idx(h.skills[2])],
    ultIdx: idx(h.ultimate),
  };
}

/**
 * The roster, compiled once at load. A fighter's `char` is an index into this array, so both
 * peers must run the same build (the lobby enforces this with simVersion).
 */
export const ROSTER: readonly CompiledHero[] = [kaito, magnus, riko, seren, dummy].map((h, i) =>
  compileHero(h, i),
);

export function characterIndex(id: string): number {
  const i = ROSTER.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`Unknown character "${id}"`);
  return i;
}

export function getCharacter(idOrIndex: string | number): CompiledHero {
  const c = typeof idOrIndex === 'number' ? ROSTER[idOrIndex] : ROSTER[characterIndex(idOrIndex)];
  if (!c) throw new Error(`Unknown character ${idOrIndex}`);
  return c;
}

/** Heroes shown on the select screen. */
export function selectableCharacters(): CompiledHero[] {
  return ROSTER.filter((c) => !c.hidden);
}
