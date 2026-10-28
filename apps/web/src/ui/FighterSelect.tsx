'use client';

import { selectableCharacters } from '@neonfist/sim';
import { LOOKS } from '../game/render/looks';

/** Signature moves shown on the select card. */
const SIGNATURE: Record<string, string[]> = {
  kaito: ['Skyward Uppercut', 'Comet Kick', 'Phantom Kick'],
  magnus: ['Avalanche Uppercut', 'Iron Wall Hook', 'Landslide'],
};

const BLURB: Record<string, string> = {
  kaito: 'Fast, evasive, easy to learn. Pokes, sweeps and long juggles.',
  magnus: 'Slow and brutal. Armor through attacks, then grab them off their feet.',
};

export interface FighterSelectProps {
  /** Who picked what: P1's and P2's fighter ids. */
  picks: [string | null, string | null];
  /** Which player this screen controls (null = both, local versus). */
  active: 0 | 1 | null;
  onPick: (player: 0 | 1, id: string) => void;
  locked?: [boolean, boolean];
}

export function FighterSelect({ picks, active, onPick, locked = [false, false] }: FighterSelectProps) {
  const chars = selectableCharacters();
  return (
    <div className="select-grid">
      {chars.map((c) => {
        const look = LOOKS[c.id]!;
        const pickedBy = ([0, 1] as const).filter((p) => picks[p] === c.id);
        return (
          <div
            key={c.id}
            className="fighter-card"
            style={{ '--c': look.primary, '--a': look.accent } as React.CSSProperties}
            data-picked={pickedBy.map((p) => `p${p + 1}`).join(' ')}
          >
            <div className="fighter-art" aria-hidden="true">
              <span className="display">{c.short}</span>
            </div>
            <div className="fighter-info">
              <h3 className="display">{c.name}</h3>
              <p className="fighter-title">{c.title}</p>
              <p className="muted">{BLURB[c.id]}</p>
              <p className="fighter-style">
                {c.style} · {SIGNATURE[c.id]?.join(', ')}
              </p>
              <div className="fighter-actions">
                {([0, 1] as const)
                  .filter((p) => active === null || active === p)
                  .map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`btn small ${p === 1 ? 'p2' : ''} ${picks[p] === c.id ? '' : 'ghost'}`}
                      disabled={locked[p]}
                      onClick={() => onPick(p, c.id)}
                    >
                      {active === null ? `P${p + 1}: ` : ''}
                      {picks[p] === c.id ? 'Picked' : 'Pick'}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
