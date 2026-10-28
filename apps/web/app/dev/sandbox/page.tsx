'use client';

import { describeInput } from '@neonfist/shared';
import { useEffect, useRef, useState } from 'react';
import { P1_KEYS, P2_KEYS } from '../../../src/game/input/bindings';
import { createPlayerInput } from '../../../src/game/input/sampler';
import { FixedStepLoop } from '../../../src/game/loop';

/** Phase 0 testbed: the 60 Hz loop and the raw input bits for both players. */
export default function Sandbox() {
  const [view, setView] = useState({ fps: 0, ticks: 0, p1: '·', p2: '·', b1: 0, b2: 0 });
  const loopRef = useRef<FixedStepLoop | null>(null);
  useEffect(() => {
    const p1 = createPlayerInput(P1_KEYS, 0);
    const p2 = createPlayerInput(P2_KEYS, 1);
    let last = [0, 0];
    const loop = new FixedStepLoop(
      () => {
        last = [p1.sample(), p2.sample()];
      },
      () =>
        setView({
          fps: loop.fps,
          ticks: loop.ticks,
          p1: describeInput(last[0]!),
          p2: describeInput(last[1]!),
          b1: last[0]!,
          b2: last[1]!,
        }),
    );
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      p1.dispose();
      p2.dispose();
    };
  }, []);
  return (
    <main className="screen">
      <h1 className="screen-title display">Input sandbox</h1>
      <p>
        {view.fps} fps · tick {view.ticks}
      </p>
      <p className="display" style={{ fontSize: '3rem' }}>
        P1 {view.p1} <span className="muted">({view.b1.toString(2).padStart(8, '0')})</span>
      </p>
      <p className="display" style={{ fontSize: '3rem' }}>
        P2 {view.p2} <span className="muted">({view.b2.toString(2).padStart(8, '0')})</span>
      </p>
    </main>
  );
}
