'use client';

import { getCharacter } from '@iron-arena/sim';
import { useEffect, useRef } from 'react';
import { lookFor } from '../game/looks';
import { loadSpriteHero, type AtlasAnim } from '../game/render2d/sprites';

export type ShowcaseMode = 'idle' | 'preview' | 'locked';

/** The animation a hero strikes when you lock them in: their victory pose, or their first skill. */
function poseAnim(heroId: string, anims: Record<string, AtlasAnim>): AtlasAnim | null {
  const look = lookFor(heroId);
  const win = typeof look.win === 'string' ? look.win : look.win.anim;
  const w = anims[win];
  if (w && !w.loop && win !== 'idle') return w;
  const hero = getCharacter(heroId);
  const ref = look.actions[hero.skills[0]];
  const name = typeof ref === 'string' ? ref : ref?.anim;
  return (name && anims[name]) || anims.attack || null;
}

/**
 * The hero standing in their alcove on the select screen: the sprite itself, scaled up crisply
 * and breathing through its idle animation. While you browse it shows faintly; when you lock
 * the hero in, they strike a pose once and then settle back to idle.
 */
export function HeroShowcase({
  heroId,
  side,
  alt = false,
  mode = 'idle',
}: {
  heroId: string;
  side: 0 | 1;
  alt?: boolean;
  mode?: ShowcaseMode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const poseAt = useRef<number | null>(null);

  useEffect(() => {
    if (mode === 'locked' && modeRef.current !== 'locked') poseAt.current = performance.now();
    if (mode !== 'locked') poseAt.current = null;
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0;
    let live = true;
    // A hero chosen while the select screen opens strikes the pose too
    if (modeRef.current === 'locked' && poseAt.current === null) poseAt.current = performance.now();
    void loadSpriteHero(heroId).then((sprite) => {
      if (!live || !sprite) return;
      const g = c.getContext('2d')!;
      const start = performance.now();
      const idle = sprite.atlas.anims.idle!;
      const pose = poseAnim(heroId, sprite.atlas.anims);
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (!w || !h) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
        if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        let anim = idle;
        let k = Math.floor(((now - start) / 1000) * idle.fps) % idle.frames.length;
        const since = poseAt.current === null ? -1 : (now - poseAt.current) / 1000;
        if (pose && since >= 0) {
          const f = Math.floor(since * Math.max(10, pose.fps));
          // Play the pose once, hold its last frame for a beat, then breathe again
          if (f < pose.frames.length + 8) {
            anim = pose;
            k = Math.min(pose.frames.length - 1, f);
          }
        }
        const zoom = (h * 0.68) / (sprite.atlas.pxPerM * 1.75);
        sprite.drawPick(
          g,
          { anim, frame: k, sx: 1, sy: 1, rot: 0, alpha: 1 },
          w / 2,
          h - 20,
          zoom,
          side === 1 ? -1 : 1,
          { alt, alpha: modeRef.current === 'preview' ? 0.55 : 1 },
        );
      };
      raf = requestAnimationFrame(frame);
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, [heroId, side, alt]);

  return <canvas ref={ref} aria-hidden="true" />;
}
