'use client';

import { BTN } from '@neonfist/shared';
import { DEFAULT_ROUND_FRAMES } from '@neonfist/shared';
import { FS, getCharacter, isActionable, randomBot, type GameState } from '@neonfist/sim';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalDriver } from '../../src/game/driver';
import { GameView } from '../../src/game/GameView';
import { SOLO_KEYS } from '../../src/game/input/bindings';
import { createPlayerInput, createScriptedInput } from '../../src/game/input/sampler';
import { FighterSelect } from '../../src/ui/FighterSelect';

type DummyMode = 'stand' | 'crouch' | 'guard' | 'random-guard' | 'cpu';
const MODES: [DummyMode, string][] = [
  ['stand', 'Stand still'],
  ['crouch', 'Crouch'],
  ['guard', 'Guard everything'],
  ['random-guard', 'Guess high or low'],
  ['cpu', 'Random CPU'],
];

/** Training (PLAN §2.10): dummy behaviour, health refill, frame advantage readout. */
export default function Training() {
  const [picks, setPicks] = useState<[string | null, string | null]>(['kaito', 'magnus']);
  const [driver, setDriver] = useState<LocalDriver | null>(null);
  const [mode, setMode] = useState<DummyMode>('stand');
  const modeRef = useRef(mode);
  const [advantage, setAdvantage] = useState<string>('—');
  const track = useRef({ wasBusy: false, p1Free: -1, p2Free: -1, measuring: false });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const start = useCallback(() => {
    if (!picks[0] || !picks[1]) return;
    let stateRef: GameState | null = null;
    const bot = randomBot(Date.now() & 0xffff);
    let guessLow = false;
    const dummy = createScriptedInput(() => {
      const s = stateRef;
      const m = modeRef.current;
      if (!s) return 0;
      // P2 is on the right unless sides switched: "back" for P2 is RIGHT when P1 is on the left
      const back = s.p1OnLeft ? BTN.RIGHT : BTN.LEFT;
      if (m === 'cpu') return bot();
      if (m === 'crouch') return BTN.DOWN;
      if (m === 'guard') {
        const att = s.fighters[0];
        const mv = att.moveId >= 0 ? getCharacter(att.char).moves[att.moveId] : null;
        return mv?.height === 'low' ? BTN.DOWN | back : back;
      }
      if (m === 'random-guard') {
        if (s.frame % 40 === 0) guessLow = Math.random() < 0.5;
        return guessLow ? BTN.DOWN | back : back;
      }
      return 0;
    });
    const d = new LocalDriver(
      { seed: 1, fighters: [picks[0], picks[1]], roundsToWin: 3, roundFrames: DEFAULT_ROUND_FRAMES, viewMirrored: [false, false] },
      createPlayerInput(SOLO_KEYS, 'any'),
      dummy,
    );
    d.training = true;
    d.beforeTick = (s) => {
      stateRef = s;
    };
    setDriver(d);
  }, [picks]);

  useEffect(() => () => driver?.dispose(), [driver]);

  // Frame advantage: when both fighters can act again after an exchange, who could act first?
  const onFrame = useCallback((s: GameState) => {
    const t = track.current;
    const [a, b] = s.fighters;
    const busy = !isActionable(a) || !isActionable(b);
    if (busy && !t.wasBusy) {
      t.measuring = a.state === FS.ATTACK;
      t.p1Free = -1;
      t.p2Free = -1;
    }
    if (t.measuring) {
      if (t.p1Free < 0 && isActionable(a)) t.p1Free = s.frame;
      if (t.p2Free < 0 && isActionable(b)) t.p2Free = s.frame;
      if (t.p1Free >= 0 && t.p2Free >= 0) {
        const adv = t.p2Free - t.p1Free;
        setAdvantage(`${adv > 0 ? '+' : ''}${adv}`);
        t.measuring = false;
      }
    }
    t.wasBusy = busy;
  }, []);

  if (driver) {
    return (
      <GameView driver={driver} names={{ p1: getCharacter(picks[0]!).short, p2: 'DUMMY' }} onFrame={onFrame}>
        <div className="corner-menu">
          <button className="btn ghost small" onClick={() => setDriver(null)}>
            Quit
          </button>
        </div>
        <div className="corner-menu left" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div className="slab" style={{ padding: '10px 18px' }}>
            <div className="toggle-row">
              {MODES.map(([m, label]) => (
                <button key={m} className="chip-btn" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {label}
                </button>
              ))}
            </div>
            <p style={{ margin: '8px 0 0' }}>
              Frame advantage of your last move: <b className="display" style={{ fontSize: '1.6rem' }}>{advantage}</b>
              <span className="muted"> · F1 hitboxes · F2 frame data · F4 inputs</span>
            </p>
          </div>
        </div>
      </GameView>
    );
  }

  return (
    <main className="screen">
      <div className="screen-head">
        <h1 className="screen-title display">Training</h1>
        <Link className="back" href="/">
          Back
        </Link>
      </div>
      <p>Pick your fighter (P1) and the dummy (P2). Health refills after every combo; the timer never runs out.</p>
      <FighterSelect picks={picks} active={null} onPick={(p, id) => setPicks((cur) => (p === 0 ? [id, cur[1]] : [cur[0], id]))} />
      <div className="actions">
        <button className="btn amber" onClick={start}>
          Start training
        </button>
      </div>
    </main>
  );
}
