'use client';

import { BTN, DEFAULT_ROUND_FRAMES, DEFAULT_STAGE } from '@neonfist/shared';
import { getCharacter, PHASE, selectableCharacters, type GameState } from '@neonfist/sim';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalDriver } from '../game/driver';
import { GameView } from '../game/GameView';
import { KEY_HINTS, P1_KEYS, P2_KEYS, SOLO_KEYS } from '../game/input/bindings';
import {
  createCpuInput,
  createPlayerInput,
  createScriptedInput,
  type InputSource,
} from '../game/input/sampler';
import { HeroSelect } from './HeroSelect';
import { ResultCard } from './ResultCard';
import { StagePicker } from './StagePicker';
import { Steps, Topbar } from './Topbar';

export type OfflineKind = 'cpu' | 'local' | 'training';

type DummyMode = 'stand' | 'guard' | 'jump' | 'cpu';
const DUMMY_MODES: [DummyMode, string][] = [
  ['stand', 'Stand still'],
  ['guard', 'Guard'],
  ['jump', 'Keep jumping'],
  ['cpu', 'Fight back'],
];

const LEVELS = ['Easy', 'Normal', 'Hard'];

const COPY: Record<
  OfflineKind,
  { title: string; small: string; steps: string[]; labels: [string, string]; fight: string }
> = {
  cpu: {
    title: 'Select your hero',
    small: 'Versus computer',
    steps: ['Player', 'Rival', 'Arena'],
    labels: ['P1, your hero', 'CPU, your rival'],
    fight: 'Fight',
  },
  local: {
    title: 'Select your heroes',
    small: 'Local versus',
    steps: ['Player 1', 'Player 2', 'Arena'],
    labels: ['Player 1', 'Player 2'],
    fight: 'Fight',
  },
  training: {
    title: 'Training',
    small: 'Practice',
    steps: ['Your hero', 'Sparring partner', 'Arena'],
    labels: ['You', 'Sparring partner'],
    fight: 'Start training',
  },
};

/** Versus CPU, local versus and training: hero select → arena → fight → result. */
export function OfflineMode({ kind }: { kind: OfflineKind }) {
  const router = useRouter();
  const copy = COPY[kind];
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<[string | null, string | null]>([null, null]);
  const [stage, setStage] = useState<string>(DEFAULT_STAGE);
  const [level, setLevel] = useState(1);
  const [driver, setDriver] = useState<LocalDriver | null>(null);
  const [over, setOver] = useState<GameState | null>(null);
  const [paused, setPaused] = useState(false);
  const [dummy, setDummy] = useState<DummyMode>('stand');
  const dummyRef = useRef(dummy);
  const seed = useRef(1);

  useEffect(() => {
    dummyRef.current = dummy;
  }, [dummy]);

  const pick = (id: string) => {
    if (step > 1) return;
    setPicks((cur) => (step === 0 ? [id, cur[1]] : [cur[0], id]));
    setStep((s) => Math.min(2, s + 1));
  };

  const start = useCallback(() => {
    if (!picks[0] || !picks[1]) return;
    seed.current++;
    let p1: InputSource;
    let p2: InputSource;
    if (kind === 'local') {
      p1 = createPlayerInput(P1_KEYS, 0);
      p2 = createPlayerInput(P2_KEYS, 1);
    } else {
      p1 = createPlayerInput(SOLO_KEYS, 'any', true);
      if (kind === 'cpu') p2 = createCpuInput(1, seed.current * 7919, { level });
      else {
        const cpu = createCpuInput(1, seed.current, { level: 1 });
        p2 = createScriptedInput(() => 0);
        let k = 0;
        p2.sample = (s) => {
          k++;
          const m = dummyRef.current;
          if (m === 'cpu') return cpu.sample(s);
          if (m === 'guard') return BTN.GUARD;
          if (m === 'jump') return k % 50 < 2 ? BTN.JUMP : 0;
          return 0;
        };
      }
    }
    const d = new LocalDriver(
      {
        seed: seed.current,
        fighters: [picks[0], picks[1]],
        roundsToWin: kind === 'training' ? 99 : 2,
        roundFrames: DEFAULT_ROUND_FRAMES,
        viewMirrored: [false, false],
      },
      p1,
      p2,
    );
    d.training = kind === 'training';
    setOver(null);
    setPaused(false);
    setDriver(d);
  }, [picks, kind, level]);

  useEffect(() => () => driver?.dispose(), [driver]);

  useEffect(() => {
    if (!driver) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      setPaused((p) => {
        driver.paused = !p;
        return !p;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [driver]);

  const onFrame = useCallback((s: GameState) => {
    if (s.phase === PHASE.MATCH_END && s.phaseFrame > 120) setOver((o) => o ?? s);
  }, []);

  const random = () => {
    const all = selectableCharacters();
    pick(all[Math.floor(Math.random() * all.length)]!.id);
  };

  if (driver && picks[0] && picks[1]) {
    const h1 = getCharacter(picks[0]);
    const h2 = getCharacter(picks[1]);
    const names: [string, string] =
      kind === 'local'
        ? ['Player 1', 'Player 2']
        : kind === 'cpu'
          ? [h1.name.split(' ')[0]!, h2.name.split(' ')[0]!]
          : ['You', h2.name.split(' ')[0]!];
    return (
      <GameView
        driver={driver}
        hud={{
          names: { p1: names[0], p2: names[1] },
          trays: kind === 'local' ? [KEY_HINTS.p1, KEY_HINTS.p2] : [KEY_HINTS.solo, null],
          stats: kind !== 'local',
          stage,
          badges: kind === 'cpu' ? ['P1', 'CPU'] : kind === 'local' ? ['P1', 'P2'] : ['YOU', 'DUMMY'],
        }}
        onFrame={onFrame}
        holdForAssets
        touch={kind !== 'local'}
      >
        <div className="corner-menu">
          <button
            className="btn ghost small"
            style={{ pointerEvents: 'auto' }}
            onClick={() => {
              driver.paused = true;
              setPaused(true);
            }}
          >
            Pause
          </button>
        </div>
        {kind === 'training' && (
          <div className="training-panel">
            <h3>Partner</h3>
            <div className="chips">
              {DUMMY_MODES.map(([m, label]) => (
                <button key={m} className="chip" aria-pressed={dummy === m} onClick={() => setDummy(m)}>
                  {label}
                </button>
              ))}
            </div>
            <p>
              Health refills after every combo and the clock never runs out. F1 shows hitboxes, F2 frame data,
              F4 your inputs.
            </p>
          </div>
        )}
        {paused && !over && (
          <div className="overlay" role="dialog" aria-label="Paused">
            <div className="card panel">
              <h2>Paused</h2>
              <p className="muted">Press Esc to keep fighting.</p>
              <div className="actions">
                <button
                  className="btn"
                  onClick={() => {
                    driver.paused = false;
                    setPaused(false);
                  }}
                >
                  Resume
                </button>
                <button className="btn ghost" onClick={() => setDriver(null)}>
                  Change heroes
                </button>
                <Link className="btn ghost" href="/">
                  Main menu
                </Link>
              </div>
            </div>
          </div>
        )}
        {over && (
          <ResultCard state={over} names={names}>
            <button className="btn" onClick={start}>
              Rematch
            </button>
            <button className="btn ghost" onClick={() => setDriver(null)}>
              Change heroes
            </button>
            <Link className="btn ghost" href="/">
              Main menu
            </Link>
          </ResultCard>
        )}
      </GameView>
    );
  }

  return (
    <main className="screen">
      <Topbar
        title={copy.title}
        small={copy.small}
        onBack={() => {
          if (step === 0) router.push('/');
          else setStep((s) => s - 1);
        }}
      />
      <Steps steps={copy.steps} at={step} />
      <HeroSelect
        picks={picks}
        picking={step <= 1 ? (step as 0 | 1) : null}
        onPick={pick}
        sideLabels={copy.labels}
        keys={kind === 'local' ? (step === 1 ? KEY_HINTS.p2 : KEY_HINTS.p1) : KEY_HINTS.solo}
      >
        {step <= 1 ? (
          <div className="picker-actions">
            <button className="btn ghost" onClick={random}>
              Random hero
            </button>
          </div>
        ) : (
          <>
            <StagePicker value={stage} onChange={setStage} />
            {kind === 'cpu' && (
              <div className="cpu-level" role="group" aria-label="CPU level">
                CPU level
                <div className="chips">
                  {LEVELS.map((l, i) => (
                    <button key={l} className="chip" aria-pressed={level === i} onClick={() => setLevel(i)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="picker-actions">
              <button className="btn" onClick={start}>
                {copy.fight}
              </button>
              <button className="btn ghost" onClick={() => setStep(0)}>
                Change heroes
              </button>
            </div>
          </>
        )}
      </HeroSelect>
    </main>
  );
}
