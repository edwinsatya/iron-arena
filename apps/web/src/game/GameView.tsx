'use client';

import { checksum, EV, ROSTER, type GameState } from '@neonfist/sim';
import { WEAPON_OF } from './looks';
import { portraitsReady } from './portraits';
import { useEffect, useRef } from 'react';
import { Sfx } from './audio/sfx';
import type { MatchDriver } from './driver';
import { Hud, type HudOptions } from './hud/hud';
import { FixedStepLoop } from './loop';
import { GameRenderer, type Quality } from './render2d/renderer2d';
import { loadSettings } from '../ui/settings';
import { TouchControls } from '../ui/TouchControls';

export interface GameViewProps {
  driver: MatchDriver;
  hud: HudOptions;
  /** This viewer sees the fight from the other side ("always on the left" for P2). */
  mirrored?: boolean;
  /** Show the on-screen stick and buttons on touch screens. */
  touch?: boolean;
  /** Wait for models and portraits before the first tick (local modes). */
  holdForAssets?: boolean;
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
export function GameView({
  driver,
  hud: hudOptions,
  mirrored,
  holdForAssets = false,
  touch = false,
  onFrame,
  children,
}: GameViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onFrameRef = useRef(onFrame);
  const hudRef0 = useRef(hudOptions);
  const hudRef = useRef<Hud | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const namesKey = `${hudOptions.names.p1}|${hudOptions.names.p2}`;
  useEffect(() => {
    hudRef0.current = hudOptions;
    hudRef.current?.setNames(hudOptions.names);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const settings = loadSettings();
    const sfx = new Sfx();
    sfx.setVolume(settings.volume);
    sfx.announcer = settings.announcer;
    const hud = new Hud(host, hudRef0.current);
    hudRef.current = hud;
    hud.onAnnounce = (t) => sfx.say(t);
    // ?render=0 skips drawing the stage (automated tests on slow machines)
    const noRender = new URLSearchParams(window.location.search).get('render') === '0';
    const renderer = noRender
      ? null
      : new GameRenderer(host, {
          mirrored,
          quality: settings.quality as Quality,
          stage: hudRef0.current.stage,
          onEvent: (e) => {
            const f =
              driver.state.fighters[
                e.type === EV.HIT || e.type === EV.BLOCK || e.type === EV.GUARD_BREAK
                  ? 1 - e.fighter
                  : e.fighter
              ];
            sfx.play(e, f ? (WEAPON_OF[ROSTER[f.char]!.id] ?? 'sword') : 'sword');
          },
        });
    hud.root.parentElement?.appendChild(hud.root); // HUD above the canvas

    // Hold the first tick until the heroes and their portraits are loaded (max 6 s), so the
    // round intro never stutters. Online play is unaffected: the session waits for both sides.
    const ids = driver.state.fighters.map((f) => ROSTER[f.char]!.id);
    let ready = noRender || !holdForAssets;
    if (!ready) {
      const timeout = new Promise<void>((r) => setTimeout(r, 6000));
      void Promise.race([
        Promise.all([renderer!.whenReady(driver.state), portraitsReady(ids)]),
        timeout,
      ]).then(() => (ready = true));
    }
    const loop = new FixedStepLoop(
      () => {
        if (ready) driver.tick();
      },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver, mirrored]);

  return (
    <div className="game-view" ref={hostRef}>
      {touch && <TouchControls />}
      {children}
    </div>
  );
}
