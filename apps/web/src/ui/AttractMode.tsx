'use client';

import { createInitialState, PHASE, randomBot, step, type GameState } from '@neonfist/sim';
import { useEffect, useRef } from 'react';
import { FixedStepLoop } from '../game/loop';
import { GameRenderer } from '../game/render/renderer';

/** Background exhibition fight: two random "CPU" players on the rooftop (landing page hero). */
export function AttractMode({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let seed = 1;
    const fresh = (): GameState =>
      createInitialState({
        seed: seed++,
        fighters: seed % 2 ? ['kaito', 'magnus'] : ['magnus', 'kaito'],
        roundsToWin: 2,
        roundFrames: 3600,
        viewMirrored: [false, false],
      });
    let state = fresh();
    const bots = [randomBot(11), randomBot(23)];
    const renderer = new GameRenderer(host, { showcase: true, quality: 'medium' });
    const loop = new FixedStepLoop(
      () => {
        step(state, [bots[0]!(), bots[1]!()]);
        if (state.phase === PHASE.MATCH_END && state.phaseFrame > 240) state = fresh();
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
