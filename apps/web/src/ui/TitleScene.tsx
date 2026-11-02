'use client';

import { type CompiledHero } from '@iron-arena/sim';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { lookFor } from '../game/looks';
import { buildStage2D, drawBackdrop, GROUND } from '../game/render2d/stage2d';
import { loadSpriteHero, type SpriteHero } from '../game/render2d/sprites';
import { View2D } from '../game/render2d/view';
import { uiSound } from './uiSound';

/** Where the line-up stands: near the bottom of the screen, in front of the stage floor. */
const FRONT = 0.95;

interface Slot {
  id: string;
  name: string;
  x: number;
  top: number;
  w: number;
  h: number;
}

/**
 * The title screen's backdrop: the harbour at sunset with every hero lined up on the quay,
 * breathing through their idle animation. Point at one and they show off their first skill;
 * each one links to their page in the codex.
 */
export function TitleScene({ heroes }: { heroes: CompiledHero[] }) {
  const host = useRef<HTMLDivElement>(null);
  const hover = useRef(-1);
  const [slots, setSlots] = useState<Slot[]>([]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const canvas = document.createElement('canvas');
    el.prepend(canvas);
    const g = canvas.getContext('2d')!;
    const back = document.createElement('canvas');
    const stage = buildStage2D('rooftop-dusk');
    const sprites: (SpriteHero | null)[] = heroes.map(() => null);
    heroes.forEach((h, i) => void loadSpriteHero(h.id).then((s) => (sprites[i] = s)));
    let W = 0;
    let H = 0;
    let dpr = 1;
    let shown = heroes.length;
    let spacing = 0;
    let x0 = 0;
    let bodyH = 0;

    const layout = () => {
      // Leaving the page shrinks the scene to nothing: keep the last layout
      if (!el.clientWidth || !el.clientHeight) return;
      W = el.clientWidth;
      H = el.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      back.width = canvas.width;
      back.height = canvas.height;
      const b = back.getContext('2d')!;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      const v = new View2D();
      v.w = W;
      v.h = H;
      v.camX = 0;
      v.scale = W / 15000;
      v.groundY = H * GROUND;
      drawBackdrop(b, stage, v, dpr);
      stage.floor(b, v, 0);
      // As many heroes as fit, centred at the front of the quay
      bodyH = Math.max(64, Math.min(150, H * 0.17, W * 0.2));
      const minGap = bodyH * 0.62;
      shown = Math.max(1, Math.min(heroes.length, Math.floor((W * 0.94) / minGap)));
      spacing = Math.min(bodyH * 0.95, (W * 0.94) / shown);
      x0 = W / 2 - (spacing * (shown - 1)) / 2;
      setSlots(
        heroes.slice(0, shown).map((h, i) => ({
          id: h.id,
          name: h.name,
          x: x0 + i * spacing,
          top: H * FRONT - bodyH * 1.05,
          w: spacing * 0.9,
          h: bodyH * 1.1,
        })),
      );
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(el);

    const start = performance.now();
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / 30) return;
      last = now;
      const t = (now - start) / 1000;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(back, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ground = H * FRONT;
      for (let i = 0; i < shown; i++) {
        const s = sprites[i];
        if (!s) continue;
        const hero = heroes[i]!;
        const look = lookFor(hero.id);
        let anim = s.atlas.anims.idle!;
        let k = t + i * 0.37;
        if (hover.current === i) {
          // Show off: the first skill's animation, on a loop
          const ref = look.actions[hero.skills[0]];
          const name = typeof ref === 'string' ? ref : ref?.anim;
          anim = (name && s.atlas.anims[name]) || s.atlas.anims.attack || anim;
          k = t;
        }
        const n = anim.frames.length;
        const zoom = bodyH / (s.atlas.pxPerM * 1.75);
        const facing = i < shown / 2 ? 1 : -1;
        // Shadow on the quay
        g.fillStyle = 'rgba(12, 8, 18, 0.35)';
        g.fillRect(
          Math.round(x0 + i * spacing - bodyH * 0.22),
          Math.round(ground - 3),
          Math.round(bodyH * 0.44),
          6,
        );
        s.drawPick(
          g,
          { anim, frame: Math.floor((k * anim.fps) % n), sx: 1, sy: 1, rot: 0, alpha: 1 },
          x0 + i * spacing,
          ground,
          zoom,
          facing,
        );
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.remove();
    };
  }, [heroes]);

  return (
    <div ref={host} className="title-scene">
      <nav className="lineup" aria-label="Heroes">
        {slots.map((s, i) => (
          <Link
            key={s.id}
            href={`/how-to-play#${s.id}`}
            aria-label={s.name}
            style={{ left: s.x, top: s.top, width: s.w, height: s.h }}
            onMouseEnter={() => {
              hover.current = i;
              uiSound('move');
            }}
            onMouseLeave={() => (hover.current = -1)}
            onFocus={() => (hover.current = i)}
            onBlur={() => (hover.current = -1)}
          >
            <span className="tag">{s.name}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
