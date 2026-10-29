'use client';

import { createLoopbackPair, RollbackSession } from '@neonfist/netcode';
import { checksum, cloneState, createInitialState, step, type GameState } from '@neonfist/sim';
import { useEffect, useState } from 'react';
import type { MatchDriver } from '../../../src/game/driver';
import { GameView } from '../../../src/game/GameView';
import { KEY_HINTS, P1_KEYS, P2_KEYS } from '../../../src/game/input/bindings';
import { createPlayerInput } from '../../../src/game/input/sampler';

/**
 * Rollback in one browser: two sessions connected by a simulated network (latency, jitter, loss).
 * P1 plays with WASD+UIJK, P2 with arrows+numpad; you watch P1's session. Use it to feel rollback.
 */
export default function NetSim() {
  const [latency, setLatency] = useState(60);
  const [loss, setLoss] = useState(0.05);
  const [key, setKey] = useState(0);

  const [driver, setDriver] = useState<MatchDriver | null>(null);

  useEffect(() => {
    const cfg = {
      seed: 3,
      fighters: ['kaito', 'magnus'] as [string, string],
      roundsToWin: 2,
      roundFrames: 3600,
      viewMirrored: [false, false] as [boolean, boolean],
    };
    const [la, lb] = createLoopbackPair({ latencyMs: latency, jitterMs: latency / 3, loss });
    const sim = { step, clone: cloneState, checksum };
    const mk = (p: 0 | 1, link: typeof la) => {
      const s = new RollbackSession<GameState>({
        localPlayer: p,
        inputDelay: 2,
        maxRollback: 8,
        initialState: createInitialState(cfg),
        sim,
        send: (b) => link.sendInput(b),
      });
      link.onInput = (b) => s.onPacket(b);
      return s;
    };
    const a = mk(0, la);
    const b = mk(1, lb);
    const in1 = createPlayerInput(P1_KEYS, 0);
    const in2 = createPlayerInput(P2_KEYS, 1);
    let last: [number, number] = [0, 0];
    const d: MatchDriver = {
      tick() {
        last = [in1.sample(), in2.sample()];
        a.tick(last[0]);
        b.tick(last[1]);
      },
      get state() {
        return a.state;
      },
      get lastInputs() {
        return last;
      },
      netStats() {
        const st = a.stats;
        return {
          path: 'loopback',
          pingMs: latency * 2,
          inputDelay: 2,
          rollbacks: st.rollbacks,
          avgRollback: st.rollbacks ? st.resimFrames / st.rollbacks : 0,
          maxRollback: st.maxRollback,
          stalls: st.stalls,
          framesAhead: a.framesAhead,
        };
      },
      dispose() {
        in1.dispose();
        in2.dispose();
        la.close();
      },
    };
    setDriver(d);
    return () => d.dispose();
  }, [latency, loss, key]);

  if (!driver) return <main className="screen" />;

  return (
    <GameView
      driver={driver}
      hud={{ names: { p1: 'P1', p2: 'P2 (remote)' }, trays: [KEY_HINTS.p1, KEY_HINTS.p2] }}
    >
      <div className="corner-menu left">
        <div className="slab" style={{ padding: '10px 18px' }}>
          <label>
            One-way latency {latency} ms{' '}
            <input
              type="range"
              min={0}
              max={200}
              step={10}
              value={latency}
              onChange={(e) => setLatency(Number(e.target.value))}
            />
          </label>{' '}
          <label>
            Loss {Math.round(loss * 100)}%{' '}
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={loss}
              onChange={(e) => setLoss(Number(e.target.value))}
            />
          </label>{' '}
          <button className="chip-btn" onClick={() => setKey((k) => k + 1)}>
            Restart
          </button>
          <span className="muted"> · F3 shows rollback stats</span>
        </div>
      </div>
    </GameView>
  );
}
