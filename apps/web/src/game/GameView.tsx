'use client';

import { checksum, type GameState } from '@neonfist/sim';
import { useEffect, useRef } from 'react';
import { Sfx } from './audio/sfx';
import type { MatchDriver } from './driver';
import { Hud, type HudNames } from './hud/hud';
import { FixedStepLoop } from './loop';
import { GameRenderer, type Quality } from './render/renderer';
import { loadSettings } from '../ui/settings';

export interface GameViewProps {
  driver: MatchDriver;
  names: HudNames;
  /** This viewer sees the fight from the other side ("always on the left" for P2). */
  mirrored?: boolean;
  /** Called after every render with the newest state (results detection, training panels). */
  onFrame?: (s: GameState) => void;
  children?: React.ReactNode;
}

declare global {
  interface Window {
    /** Test hooks (Playwright e2e and debugging). */
    __neonfist?: { state: () => GameState; checksum: () => number; driver: MatchDriver };
  }
}

/** Canvas + HUD + 60 Hz loop. React mounts it once; everything per-frame is imperative. */
export function GameView({ driver, names, mirrored, onFrame, children }: GameViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onFrameRef = useRef(onFrame);
  const namesRef = useRef(names);
  const hudRef = useRef<Hud | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    namesRef.current = names;
    hudRef.current?.setNames(names);
  }, [names]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const settings = loadSettings();
    const sfx = new Sfx();
    sfx.setVolume(settings.volume);
    sfx.announcer = settings.announcer;
    const hud = new Hud(host, namesRef.current);
    hudRef.current = hud;
    hud.onAnnounce = (t) => sfx.say(t);
    // ?render=0 skips 3D rendering (automated tests on machines without a GPU)
    const noRender = new URLSearchParams(window.location.search).get('render') === '0';
    const renderer = noRender ? null : new GameRenderer(host, {
      mirrored,
      quality: settings.quality as Quality,
      onEvent: (e) => {
        sfx.play(e);
        hud.event(e);
      },
    });
    hud.root.parentElement?.appendChild(hud.root); // HUD above the canvas

    const loop = new FixedStepLoop(
      () => driver.tick(),
      (dt) => {
        const s = driver.state;
        renderer?.render(s, dt);
        hud.update(s, dt, { net: driver.netStats(), fps: loop.fps, inputs: driver.lastInputs });
        onFrameRef.current?.(s);
      },
    );
    loop.start();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F1' && renderer) renderer.showHitboxes = !renderer.showHitboxes;
      else if (e.code === 'F2') hud.showFrames = !hud.showFrames;
      else if (e.code === 'F3') hud.showNet = !hud.showNet;
      else if (e.code === 'F4') hud.showInputs = !hud.showInputs;
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.__neonfist = { state: () => driver.state, checksum: () => checksum(driver.state), driver };

    return () => {
      loop.stop();
      window.removeEventListener('keydown', onKey);
      renderer?.dispose();
      hud.dispose();
      sfx.dispose();
      hudRef.current = null;
      if (window.__neonfist?.driver === driver) delete window.__neonfist;
    };
  }, [driver, mirrored]);

  return (
    <div className="game-view" ref={hostRef}>
      {children}
    </div>
  );
}
