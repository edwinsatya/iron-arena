import { SELECTABLE_FIGHTERS } from '@neonfist/shared';
import { describe, expect, it } from 'vitest';
import { selectableCharacters } from '../src/roster';

describe('roster', () => {
  it('matches the lobby list of selectable heroes', () => {
    expect(selectableCharacters().map((c) => c.id)).toEqual([...SELECTABLE_FIGHTERS]);
  });

  it('every hero has a full kit with sane frame data', () => {
    for (const h of selectableCharacters()) {
      expect(h.basicIdx.length).toBeGreaterThanOrEqual(2);
      for (const a of h.actions) {
        expect(a.total, a.id).toBeGreaterThan(0);
        for (const st of a.strikes ?? []) expect(st.frames[1], a.id).toBeLessThanOrEqual(a.total);
        for (const p of a.projectiles ?? []) expect(p.frame, a.id).toBeLessThan(a.total);
        for (const ar of a.areas ?? []) expect(ar.frame, a.id).toBeLessThan(a.total);
        if (a.chain) expect(a.chain.to, a.id).toBeLessThan(a.total);
      }
      for (const i of h.skillIdx) expect(h.actions[i]!.cooldown, h.actions[i]!.id).toBeGreaterThan(0);
    }
  });
});
