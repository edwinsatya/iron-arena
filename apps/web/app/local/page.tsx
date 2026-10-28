'use client';

import { DEFAULT_ROUND_FRAMES } from '@neonfist/shared';
import { getCharacter, PHASE, type GameState } from '@neonfist/sim';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { LocalDriver } from '../../src/game/driver';
import { GameView } from '../../src/game/GameView';
import { P1_KEYS, P2_KEYS } from '../../src/game/input/bindings';
import { createPlayerInput } from '../../src/game/input/sampler';
import { Controls } from '../../src/ui/Controls';
import { FighterSelect } from '../../src/ui/FighterSelect';

/** Two players, one keyboard (or two gamepads). Also the main dev testbed (PLAN Phase 1). */
export default function LocalVersus() {
  const [picks, setPicks] = useState<[string | null, string | null]>(['kaito', 'magnus']);
  const [driver, setDriver] = useState<LocalDriver | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [seed, setSeed] = useState(1);

  const start = useCallback(() => {
    if (!picks[0] || !picks[1]) return;
    const d = new LocalDriver(
      { seed, fighters: [picks[0], picks[1]], roundsToWin: 2, roundFrames: DEFAULT_ROUND_FRAMES, viewMirrored: [false, false] },
      createPlayerInput(P1_KEYS, 0),
      createPlayerInput(P2_KEYS, 1),
    );
    setOver(null);
    setSeed((s) => s + 1);
    setDriver(d);
  }, [picks, seed]);

  useEffect(() => () => driver?.dispose(), [driver]);

  const onFrame = useCallback((s: GameState) => {
    if (s.phase === PHASE.MATCH_END && s.phaseFrame > 150) setOver((o) => (o === null ? s.matchWinner : o));
  }, []);

  if (driver) {
    const names = { p1: getCharacter(picks[0]!).short, p2: getCharacter(picks[1]!).short };
    return (
      <GameView driver={driver} names={names} onFrame={onFrame}>
        <div className="corner-menu">
          <button className="btn ghost small" onClick={() => setDriver(null)}>
            Quit
          </button>
        </div>
        {over !== null && (
          <div className="overlay">
            <div className="overlay-card slab">
              <h2 className="results-title display">{over < 0 ? 'Draw' : `${over === 0 ? 'P1' : 'P2'} wins`}</h2>
              <div className="actions">
                <button className="btn" onClick={start}>
                  Rematch
                </button>
                <button className="btn ghost" onClick={() => setDriver(null)}>
                  Change fighters
                </button>
              </div>
            </div>
          </div>
        )}
      </GameView>
    );
  }

  return (
    <main className="screen">
      <div className="screen-head">
        <h1 className="screen-title display">Local versus</h1>
        <Link className="back" href="/">
          Back
        </Link>
      </div>
      <FighterSelect picks={picks} active={null} onPick={(p, id) => setPicks((cur) => (p === 0 ? [id, cur[1]] : [cur[0], id]))} />
      <div className="panel-row">
        <div className="slab">
          <Controls local />
        </div>
        <div>
          <p>Two players on one keyboard, or plug in two gamepads (first pad is P1).</p>
          <button className="btn amber" onClick={start} disabled={!picks[0] || !picks[1]}>
            Fight
          </button>
        </div>
      </div>
    </main>
  );
}
