import { dummy } from '../data/characters/dummy';
import { kaito } from '../data/characters/kaito';
import { magnus } from '../data/characters/magnus';
import { compileCharacter, type CompiledCharacter } from './moves';

/**
 * The roster, compiled once at load. A fighter's `char` is an index into this array, so both
 * peers must run the same build (the lobby enforces this with simVersion).
 */
export const ROSTER: readonly CompiledCharacter[] = [kaito, magnus, dummy].map((c, i) => compileCharacter(c, i));

export function characterIndex(id: string): number {
  const i = ROSTER.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`Unknown character "${id}"`);
  return i;
}

export function getCharacter(idOrIndex: string | number): CompiledCharacter {
  const c = typeof idOrIndex === 'number' ? ROSTER[idOrIndex] : ROSTER[characterIndex(idOrIndex)];
  if (!c) throw new Error(`Unknown character ${idOrIndex}`);
  return c;
}

/** Characters shown on the select screen. */
export function selectableCharacters(): CompiledCharacter[] {
  return ROSTER.filter((c) => !c.hidden);
}
