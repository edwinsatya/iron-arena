'use client';

import { cpuBot, createInitialState, PHASE, selectableCharacters, step, type GameState } from '@neonfist/sim';
import { useEffect, useRef } from 'react';
import { FixedStepLoop } from '../game/loop';
import { GameRenderer } from '../game/render2d/renderer2d';

/** Background exhibition match: two CPU heroes fighting on the stage (landing page). */
export function AttractMode({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const ids = selectableCharacters().map((h) => h.id);
    let seed = 1 + Math.floor(Math.random() * 1000);
    const fresh = (): GameState => {
      seed++;
      const a = ids[seed % ids.length]!;
      const b = ids[(seed * 7 + 1) % ids.length]!;
      return createInitialState({
        seed,
        fighters: [a, b === a ? ids[(seed + 1) % ids.length]! : b],
        roundsToWin: 1,
        roundFrames: 3600,
        viewMirrored: [false, false],
      });
    };
    let state = fresh();
    let bots = [cpuBot(seed * 3, { level: 2 }), cpuBot(seed * 5, { level: 2 })];
    const renderer = new GameRenderer(host, { showcase: true, quality: 'low', stage: 'rooftop-dusk' });
    const loop = new FixedStepLoop(
      () => {
        step(state, [bots[0]!(state, 0), bots[1]!(state, 1)]);
        if (state.phase === PHASE.MATCH_END && state.phaseFrame > 180) {
          state = fresh();
          bots = [cpuBot(seed * 3, { level: 2 }), cpuBot(seed * 5, { level: 2 })];
        }
      },
      (dt) => renderer.render(state, dt),
    );
    loop.start();
    return () => {
      loop.stop();
      renderer.dispose();
    };
  }, []);
  return <div ref={ref} className={className} aria-hidden="true" />;
}
