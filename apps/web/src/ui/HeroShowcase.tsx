'use client';

import { useEffect, useRef, useState } from 'react';
import { lookFor } from '../game/looks';
import { chooseSpriteForAction, heroArt, loadSpriteHero } from '../game/render2d/sprites';

/**
 * The hero on the select screen: the pack's full-length painting when there is one, otherwise
 * the sprite itself, scaled up crisply and breathing through its idle animation.
 */
export function HeroShowcase({ heroId, side, alt = false }: { heroId: string; side: 0 | 1; alt?: boolean }) {
  const art = heroArt(heroId, 'full');
  const filter = alt ? `hue-rotate(${lookFor(heroId).altHue}deg)` : undefined;
  if (art)
    return (
      <img
        src={art}
        alt=""
        draggable={false}
        className="showcase-art"
        style={{ filter, transform: side === 1 ? 'scaleX(-1)' : undefined }}
        aria-hidden="true"
      />
    );
  return <SpriteShowcase heroId={heroId} side={side} filter={filter} />;
}

function SpriteShowcase({ heroId, side, filter }: { heroId: string; side: 0 | 1; filter?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0;
    let live = true;
    void loadSpriteHero(heroId).then((sprite) => {
      if (!live || !sprite) return;
      setReady(true);
      const g = c.getContext('2d')!;
      const start = performance.now();
      const idle = sprite.atlas.anims.idle!;
      const frame = (now: number) => {
        const w = c.clientWidth;
        const h = c.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
        if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        const t = (now - start) / 1000;
        const pick = chooseSpriteForAction(sprite.atlas, heroId, null);
        pick.frame = Math.floor((t * idle.fps) % idle.frames.length);
        const zoom = (h * 0.8) / (sprite.atlas.pxPerM * 1.9);
        sprite.drawPick(g, pick, w / 2, h * 0.92, zoom, side === 1 ? -1 : 1);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, [heroId, side]);
  return (
    <canvas
      ref={ref}
      className="showcase-sprite"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter, opacity: ready ? 1 : 0 }}
      aria-hidden="true"
    />
  );
}
