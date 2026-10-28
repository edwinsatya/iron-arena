import { SELECTABLE_FIGHTERS } from '@neonfist/shared';
import { describe, expect, it } from 'vitest';
import { ROSTER, selectableCharacters } from '../src/roster';

describe('roster', () => {
  it('matches the lobby list of selectable fighters', () => {
    expect(selectableCharacters().map((c) => c.id)).toEqual([...SELECTABLE_FIGHTERS]);
  });

  it('every move has hitboxes inside its active frames (or is a throw)', () => {
    for (const c of ROSTER) {
      for (const m of c.moves) {
        if (m.height === 'throw') {
          expect(m.throw, m.id).toBeDefined();
          continue;
        }
        expect(m.hitboxes.length, m.id).toBeGreaterThan(0);
        for (const hb of m.hitboxes) {
          expect(hb.frames[0], m.id).toBeGreaterThanOrEqual(m.startup);
          expect(hb.frames[1], m.id).toBeLessThanOrEqual(m.startup + m.active - 1);
        }
        expect(m.blockstun, m.id).toBeGreaterThan(0);
      }
    }
  });

  it('names are English (no leftover placeholder names)', () => {
    for (const c of ROSTER) {
      expect(c.name).toMatch(/^[A-Za-z .'-]+$/);
      for (const m of c.moves) expect(m.name, m.id).toMatch(/^[A-Za-z ,.'→-]+$/);
    }
  });
});
