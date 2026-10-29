import { ROSTER, type GameState } from '@neonfist/sim';
import type { ReactNode } from 'react';
import { LOOKS } from '../game/render/looks';
import { Portrait } from './usePortrait';

/** End-of-match card: the winner's art, who won, and the numbers. */
export function ResultCard({
  state,
  names,
  children,
}: {
  state: GameState;
  names: [string, string];
  children: ReactNode;
}) {
  const w = state.matchWinner;
  const f = w >= 0 ? state.fighters[w]! : null;
  const hero = f ? ROSTER[f.char]! : null;
  const color = hero ? LOOKS[hero.id]!.color : 'var(--hazard)';
  return (
    <div className="overlay" role="dialog" aria-label="Match result">
      <div className="result panel" style={{ '--hero': color } as React.CSSProperties}>
        <div className="result-art">{hero && <Portrait heroId={hero.id} kind="full" />}</div>
        <div>
          <h2>{w < 0 ? 'Draw' : `${names[w]!.toUpperCase()} WINS`}</h2>
          <p className="sub">{hero ? `${hero.name}, ${hero.title}` : 'Nobody takes the roof today'}</p>
          <dl className="result-stats">
            <div>
              <dt>Rounds</dt>
              <dd>
                {state.fighters[0].roundsWon} – {state.fighters[1].roundsWon}
              </dd>
            </div>
            <div>
              <dt>Best chain</dt>
              <dd>{Math.max(state.fighters[0].bestCombo, state.fighters[1].bestCombo)} hits</dd>
            </div>
            <div>
              <dt>{names[0]} dealt</dt>
              <dd>{state.fighters[0].totalDamage}</dd>
            </div>
            <div>
              <dt>{names[1]} dealt</dt>
              <dd>{state.fighters[1].totalDamage}</dd>
            </div>
          </dl>
          <div className="actions">{children}</div>
        </div>
      </div>
    </div>
  );
}
