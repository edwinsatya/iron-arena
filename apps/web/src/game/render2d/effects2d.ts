import {
  areaSpec,
  EV,
  EVENT_WINDOW,
  FS,
  projectileSpec,
  ROSTER,
  type GameState,
  type SimEvent,
} from '@neonfist/sim';
import { LOOKS } from '../looks';
import { hexA, type View2D } from './view';

export interface EffectCallbacks {
  /** Rollback-safe: called once per real event (PLAN §5.6). */
  onEvent?: (e: SimEvent) => void;
  /** The event turned out never to have happened (a rollback undid it). */
  onCancel?: (e: SimEvent) => void;
}

/** A one-shot effect in world millimetres; returns false when finished. */
type Fx = { age: number; life: number; draw: (g: CanvasRenderingContext2D, v: View2D, k: number, dt: number) => void };

const TAU = Math.PI * 2;

/**
 * 2D effects: sparks, slashes, rings, damage numbers, projectiles and skill areas. One-shot
 * effects come from GameState.recentEvents and are diffed against what was shown, so a rollback
 * never doubles or ghosts an effect; projectiles and areas are redrawn from the state each frame.
 */
export class Effects2D {
  private fx: Fx[] = [];
  private shown = new Map<string, { frame: number; event: SimEvent; fx: Fx[] }>();
  private time = 0;
  shake = 0;
  flash = 0;

  constructor(private cb: EffectCallbacks = {}) {}

  sync(state: GameState): void {
    const live = new Set<string>();
    for (const e of state.recentEvents) {
      const key = `${e.frame}:${e.fighter}:${e.type}:${e.value}`;
      live.add(key);
      if (this.shown.has(key)) continue;
      const before = this.fx.length;
      this.spawn(e, state);
      this.shown.set(key, { frame: e.frame, event: e, fx: this.fx.slice(before) });
      this.cb.onEvent?.(e);
    }
    for (const [key, s] of this.shown) {
      const inWindow = s.frame > state.frame - EVENT_WINDOW;
      if (inWindow && !live.has(key)) {
        for (const f of s.fx) f.age = f.life;
        this.cb.onCancel?.(s.event);
        this.shown.delete(key);
      } else if (!inWindow && state.frame - s.frame > 120) this.shown.delete(key);
    }
  }

  private color(state: GameState, i: number): string {
    const f = state.fighters[i];
    return f ? (LOOKS[ROSTER[f.char]!.id]?.color ?? '#ffffff') : '#ffffff';
  }

  private glow(state: GameState, i: number): string {
    const f = state.fighters[i];
    return f ? (LOOKS[ROSTER[f.char]!.id]?.glow ?? '#ffffff') : '#ffffff';
  }

  private spawn(e: SimEvent, s: GameState): void {
    const atk = this.color(s, 1 - e.fighter);
    const own = this.color(s, e.fighter);
    switch (e.type) {
      case EV.HIT: {
        const big = e.value >= 60;
        this.burst(e.x, e.y, big ? 28 : 16, atk, big ? 9000 : 6000, 0.35);
        this.burst(e.x, e.y, 8, '#ffffff', 5000, 0.2);
        this.impact(e.x, e.y, big ? 900 : 600, atk);
        this.popup(e.x, e.y + 400, String(e.value), big ? '#ffd23f' : '#ffffff', big ? 44 : 32);
        this.shake = Math.max(this.shake, big ? 12 : 5);
        if (big) this.flash = Math.max(this.flash, 0.16);
        break;
      }
      case EV.BLOCK:
        this.burst(e.x, e.y, 10, '#9fe8ff', 4000, 0.22);
        this.ring(e.x, e.y, 200, 700, '#9fe8ff', 0.2, false);
        if (e.value > 0) this.popup(e.x, e.y + 300, String(e.value), '#9fb6d8', 24);
        break;
      case EV.GUARD_BREAK:
        this.burst(e.x, e.y, 30, '#ffb43a', 8000, 0.4);
        this.ring(e.x, e.y, 200, 1500, '#ffb43a', 0.3, false);
        this.popup(e.x, e.y + 700, 'GUARD BREAK', '#ffb43a', 30);
        this.shake = Math.max(this.shake, 10);
        break;
      case EV.ARMOR:
        this.burst(e.x, e.y, 10, '#ffd27a', 3500, 0.25);
        this.popup(e.x, e.y + 500, 'ARMOR', '#ffd27a', 22);
        break;
      case EV.COUNTER:
        this.ring(e.x, e.y, 300, 2000, '#ffffff', 0.3, false);
        this.popup(e.x, e.y + 800, 'COUNTER!', '#ff4b6e', 38);
        this.flash = Math.max(this.flash, 0.3);
        break;
      case EV.FIRE:
        this.burst(e.x, e.y, 6, own, 3000, 0.12);
        this.ring(e.x, e.y, 60, 380, '#ffffff', 0.12, false);
        break;
      case EV.EXPLODE:
        this.burst(e.x, Math.max(200, e.y), 30, '#ffb066', 8000, 0.45);
        this.ring(e.x, 0, 300, 1700, '#ffb066', 0.35, true);
        this.shake = Math.max(this.shake, 10);
        break;
      case EV.TELEPORT: {
        const w = LOOKS[ROSTER[s.fighters[e.fighter]?.char ?? 0]!.id]?.weapon;
        if (w === 'dagger') this.smoke(e.x);
        else if (w === 'fire') {
          this.burst(e.x, 900, 22, '#ffb43a', 6000, 0.35);
          this.ring(e.x, 0, 100, 900, '#ff6a2a', 0.3, true);
        } else {
          this.pillar(e.x, own, 1);
          this.burst(e.x, 900, 14, this.glow(s, e.fighter), 4000, 0.3);
        }
        break;
      }
      case EV.DASH:
      case EV.JUMP:
        this.dust(e.x, 8);
        break;
      case EV.LAND:
        this.dust(e.x, e.value < -60 ? 16 : 6);
        if (e.value < -100) this.shake = Math.max(this.shake, 6);
        break;
      case EV.SKILL:
        this.ring(e.x, 0, 200, 1300, own, 0.3, true);
        break;
      case EV.ULT:
        this.ring(e.x, 0, 300, 4000, own, 0.8, true);
        this.pillar(e.x, own, 2.2);
        this.flash = Math.max(this.flash, 0.45);
        break;
      case EV.CHARGED:
        this.ring(e.x, 1000, 100, 900, own, 0.25, false);
        break;
      case EV.KO:
        this.burst(e.x, e.y, 60, '#ffffff', 12000, 0.6);
        this.ring(e.x, e.y, 300, 3500, '#ffffff', 0.5, false);
        this.shake = Math.max(this.shake, 22);
        this.flash = Math.max(this.flash, 0.55);
        break;
      case EV.RING_OUT:
      case EV.FALL:
        this.shake = Math.max(this.shake, 8);
        this.popup(e.x, 1600, 'RING OUT', '#ffd23f', 40);
        break;
      case EV.GRAB:
        this.ring(e.x, e.y, 150, 1000, '#ffd27a', 0.25, false);
        break;
      case EV.DIZZY:
        this.popup(e.x, e.y + 1100, 'STUN', '#c9f0ff', 26);
        break;
    }
  }

  /* --------------------------------------------------------------- one-shot primitives */

  private add(life: number, draw: Fx['draw']): void {
    this.fx.push({ age: 0, life, draw });
  }

  /** Spark streaks flying out from a point (speed in mm/s). */
  private burst(x: number, y: number, n: number, color: string, speed: number, life: number) {
    const parts = Array.from({ length: n }, () => {
      const a = Math.random() * TAU;
      const v = speed * (0.35 + Math.random() * 0.8);
      return { vx: Math.cos(a) * v, vy: Math.sin(a) * v + speed * 0.2 };
    });
    this.add(life, (g, v, k) => {
      const t = k * life;
      g.strokeStyle = color;
      g.lineCap = 'round';
      g.lineWidth = Math.max(1.5, v.px(40) * (1 - k));
      g.globalAlpha = 1 - k * k;
      g.beginPath();
      for (const p of parts) {
        const px = x + p.vx * t;
        const py = y + p.vy * t - 9000 * t * t;
        const tail = 0.035;
        g.moveTo(v.sx(px), v.sy(py));
        g.lineTo(v.sx(px - p.vx * tail), v.sy(py - (p.vy - 18000 * t) * tail));
      }
      g.stroke();
      g.globalAlpha = 1;
    });
  }

  /** Comic impact star. */
  private impact(x: number, y: number, r: number, color: string) {
    const spikes = 10;
    const jag = Array.from({ length: spikes * 2 }, (_, i) => (i % 2 ? 0.38 : 0.8 + Math.random() * 0.4));
    const rot = Math.random() * TAU;
    this.add(0.16, (g, v, k) => {
      const R = v.px(r) * (0.6 + k * 0.6);
      g.save();
      g.translate(v.sx(x), v.sy(y));
      g.rotate(rot);
      g.globalAlpha = 1 - k;
      g.beginPath();
      jag.forEach((m, i) => {
        const a = (i / jag.length) * TAU;
        g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R * m, Math.sin(a) * R * m);
      });
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.scale(0.55, 0.55);
      g.fillStyle = '#ffffff';
      g.fill();
      g.restore();
      g.globalAlpha = 1;
    });
  }

  private ring(x: number, y: number, r0: number, r1: number, color: string, life: number, flat: boolean) {
    this.add(life, (g, v, k) => {
      const r = v.px(r0 + (r1 - r0) * (1 - (1 - k) ** 2));
      g.strokeStyle = hexA(color.length === 7 ? color : '#ffffff', 1 - k);
      g.lineWidth = Math.max(1, v.px(90) * (1 - k));
      g.beginPath();
      g.ellipse(v.sx(x), v.sy(y), r, flat ? r * 0.18 : r, 0, 0, TAU);
      g.stroke();
    });
  }

  private pillar(x: number, color: string, scale: number) {
    this.add(0.45, (g, v, k) => {
      const w = v.px(380 * scale) * (1 - k * 0.6);
      const h = v.px(3200 * scale);
      const gr = g.createLinearGradient(v.sx(x) - w, 0, v.sx(x) + w, 0);
      gr.addColorStop(0, hexA(color, 0));
      gr.addColorStop(0.5, hexA('#ffffff', 0.85 * (1 - k)));
      gr.addColorStop(1, hexA(color, 0));
      g.fillStyle = gr;
      g.fillRect(v.sx(x) - w, v.sy(0) - h, w * 2, h);
    });
  }

  /** Ninja smoke puff (teleports). */
  private smoke(x: number) {
    const puffs = Array.from({ length: 9 }, () => ({
      ox: (Math.random() - 0.5) * 900,
      oy: 300 + Math.random() * 1300,
      r: 260 + Math.random() * 220,
    }));
    this.add(0.55, (g, v, k) => {
      g.fillStyle = `rgba(70, 60, 95, ${0.75 * (1 - k)})`;
      for (const p of puffs) {
        g.beginPath();
        g.arc(v.sx(x + p.ox * (1 + k)), v.sy(p.oy + k * 300), v.px(p.r * (0.7 + k * 0.6)), 0, TAU);
        g.fill();
      }
    });
  }

  private dust(x: number, n: number) {
    const puffs = Array.from({ length: n }, () => ({
      vx: (Math.random() - 0.5) * 3000,
      vy: 300 + Math.random() * 600,
      r: 80 + Math.random() * 120,
    }));
    this.add(0.45, (g, v, k) => {
      const t = k * 0.45;
      g.fillStyle = `rgba(235, 225, 210, ${0.5 * (1 - k)})`;
      for (const p of puffs) {
        g.beginPath();
        g.arc(v.sx(x + p.vx * t), v.sy(p.vy * t), v.px(p.r * (1 + k)), 0, TAU);
        g.fill();
      }
    });
  }

  private popup(x: number, y: number, text: string, color: string, size: number) {
    const dx = (Math.random() - 0.5) * 300;
    this.add(0.85, (g, v, k) => {
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.8);
      const px = Math.round(size * pop * Math.min(1.25, Math.max(0.8, v.h / 720)));
      g.font = `${px}px "Dela Gothic One", "Arial Black", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const sx = v.sx(x + dx);
      const sy = v.sy(y) - k * 50;
      g.lineWidth = px * 0.24;
      g.strokeStyle = '#140f1e';
      g.strokeText(text, sx, sy);
      g.fillStyle = color;
      g.fillText(text, sx, sy);
      g.globalAlpha = 1;
    });
  }

  /* --------------------------------------------------------------- per-frame drawing */

  /** Behind the heroes: area telegraphs and ground effects. */
  drawBack(g: CanvasRenderingContext2D, s: GameState, v: View2D): void {
    for (const a of s.areas) {
      const spec = areaSpec(a.char, a.action, a.spec);
      if (a.age >= spec.delay) continue;
      const k = a.age / Math.max(1, spec.delay);
      const color = LOOKS[ROSTER[a.char]!.id]?.color ?? '#ffffff';
      const rx = v.px(spec.r);
      g.fillStyle = hexA(color, 0.15 + 0.15 * k);
      g.beginPath();
      g.ellipse(v.sx(a.x), v.sy(0), rx, rx * 0.16, 0, 0, TAU);
      g.fill();
      g.strokeStyle = hexA(color, 0.9);
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = hexA('#ffffff', 0.8);
      g.beginPath();
      g.ellipse(v.sx(a.x), v.sy(0), rx * k, rx * k * 0.16, 0, 0, TAU);
      g.stroke();
    }
  }

  /** In front of the heroes: slashes, projectiles, active areas, one-shots. */
  drawFront(g: CanvasRenderingContext2D, s: GameState, v: View2D, dt: number): void {
    this.time += dt;
    for (const p of s.projectiles) this.projectile(g, v, p);
    for (const a of s.areas) this.area(g, v, a);
    this.dizzy(g, s, v);
    g.save();
    for (const f of this.fx) {
      f.age += dt;
      const k = Math.min(1, f.age / f.life);
      if (k < 1) f.draw(g, v, k, dt);
    }
    g.restore();
    this.fx = this.fx.filter((f) => f.age < f.life);
    this.shake = Math.max(0, this.shake - dt * 60);
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  private projectile(g: CanvasRenderingContext2D, v: View2D, p: GameState['projectiles'][number]) {
    const spec = projectileSpec(p.char, p.action, p.spec);
    const id = ROSTER[p.char]!.id;
    const look = LOOKS[id]!;
    const x = v.sx(p.x);
    const y = v.sy(p.y);
    const r = Math.max(4, v.px(spec.r));
    const ang = Math.atan2(-p.vy, p.vx * v.flip);
    g.save();
    g.translate(x, y);
    switch (spec.kind) {
      case 'bullet':
      case 'slug': {
        g.rotate(ang);
        const len = v.px(spec.kind === 'slug' ? 900 : 650);
        const w = spec.kind === 'slug' ? 7 : 4;
        const gr = g.createLinearGradient(-len, 0, 0, 0);
        gr.addColorStop(0, hexA(look.color, 0));
        gr.addColorStop(1, hexA(look.color, 0.9));
        g.fillStyle = gr;
        g.fillRect(-len, -w, len, w * 2);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(0, 0, w * 2.2, w * 0.9, 0, 0, TAU);
        g.fill();
        break;
      }
      case 'orb':
      case 'foxfire': {
        const c = spec.kind === 'foxfire' ? '#5ec8ff' : look.color;
        const flick = 1 + Math.sin(this.time * 30 + p.age) * 0.12;
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * 2 * flick);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.35, hexA(c, 0.9));
        gr.addColorStop(1, hexA(c, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(0, 0, r * 2 * flick, 0, TAU);
        g.fill();
        // Trail
        g.rotate(ang);
        g.fillStyle = hexA(c, 0.35);
        g.beginPath();
        g.moveTo(0, -r * 0.8);
        g.lineTo(-r * 4, 0);
        g.lineTo(0, r * 0.8);
        g.fill();
        break;
      }
      case 'lance': {
        g.rotate(ang);
        const L = v.px(2400);
        g.fillStyle = hexA(look.color, 0.5);
        g.beginPath();
        g.moveTo(L * 0.5, 0);
        g.lineTo(-L * 0.5, -r * 1.2);
        g.lineTo(-L * 0.5, r * 1.2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(L * 0.5, 0);
        g.lineTo(-L * 0.4, -r * 0.5);
        g.lineTo(-L * 0.4, r * 0.5);
        g.fill();
        break;
      }
      case 'shard': {
        if (look.weapon === 'dagger') {
          // Kunai: a blade flying point-first with a ring at the back
          g.rotate(ang);
          const L = Math.max(14, r * 2.4);
          g.strokeStyle = hexA(look.color, 0.5);
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(-L * 1.8, 0);
          g.lineTo(-L * 0.6, 0);
          g.stroke();
          g.fillStyle = '#d9dcef';
          g.strokeStyle = '#1b1526';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(L * 0.6, 0);
          g.lineTo(0, -L * 0.18);
          g.lineTo(-L * 0.25, 0);
          g.lineTo(0, L * 0.18);
          g.closePath();
          g.fill();
          g.stroke();
          g.beginPath();
          g.arc(-L * 0.45, 0, L * 0.12, 0, TAU);
          g.stroke();
          break;
        }
        g.rotate(this.time * 14);
        g.fillStyle = look.glow;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, -r * 1.4);
        g.lineTo(r, 0);
        g.lineTo(0, r * 1.4);
        g.lineTo(-r, 0);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      }
      case 'mine':
      case 'grenade': {
        const armed = p.age >= (spec.armAfter ?? 0) && spec.armAfter !== 999;
        const blink =
          spec.kind === 'grenade' ? Math.sin(p.age * (0.3 + p.age / 60)) > 0 : armed && Math.sin(p.age * 0.25) > 0;
        const R = v.px(spec.kind === 'mine' ? 260 : 140);
        g.fillStyle = '#2e2a3d';
        g.strokeStyle = '#140f1e';
        g.lineWidth = 2;
        g.beginPath();
        if (spec.kind === 'mine') g.ellipse(0, -R * 0.2, R, R * 0.35, 0, 0, TAU);
        else g.arc(0, -R, R, 0, TAU);
        g.fill();
        g.stroke();
        if (blink) {
          const ly = spec.kind === 'mine' ? -R * 0.45 : -R * 1.6;
          const gr = g.createRadialGradient(0, ly, 0, 0, ly, R);
          gr.addColorStop(0, '#ffffff');
          gr.addColorStop(0.3, '#ff3d6e');
          gr.addColorStop(1, 'rgba(255,61,110,0)');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(0, ly, R, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'arrow': {
        g.rotate(ang);
        const big = spec.r >= 300;
        const len = v.px(big ? 1300 : 800);
        // Wind trail
        const tr = g.createLinearGradient(-len * 1.6, 0, 0, 0);
        tr.addColorStop(0, hexA(look.color, 0));
        tr.addColorStop(1, hexA(look.glow, big ? 0.9 : 0.6));
        g.fillStyle = tr;
        g.beginPath();
        g.moveTo(0, -(big ? 7 : 4));
        g.lineTo(-len * 1.6, 0);
        g.lineTo(0, big ? 7 : 4);
        g.fill();
        // Shaft, head and fletching
        g.strokeStyle = '#6b4a2e';
        g.lineWidth = big ? 4 : 3;
        g.beginPath();
        g.moveTo(-len * 0.55, 0);
        g.lineTo(0, 0);
        g.stroke();
        g.fillStyle = '#e8f0f2';
        g.beginPath();
        g.moveTo(v.px(160), 0);
        g.lineTo(0, -5);
        g.lineTo(0, 5);
        g.fill();
        g.fillStyle = look.color;
        g.beginPath();
        g.moveTo(-len * 0.55, 0);
        g.lineTo(-len * 0.45, -6);
        g.lineTo(-len * 0.4, 0);
        g.lineTo(-len * 0.45, 6);
        g.fill();
        if (big) {
          g.fillStyle = hexA('#ffffff', 0.85);
          g.beginPath();
          g.arc(v.px(120), 0, 9, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'wave': {
        g.scale((p.vx >= 0 ? 1 : -1) * v.flip, 1);
        const H = v.px(1600);
        g.fillStyle = hexA(look.color, 0.55);
        g.beginPath();
        g.moveTo(r, 0);
        g.quadraticCurveTo(r * 2, -H * 0.5, r * 0.4, -H);
        g.quadraticCurveTo(-r, -H * 0.5, -r * 2, 0);
        g.fill();
        break;
      }
    }
    g.restore();
  }

  private area(g: CanvasRenderingContext2D, v: View2D, a: GameState['areas'][number]) {
    const spec = areaSpec(a.char, a.action, a.spec);
    if (a.age < spec.delay) {
      if (spec.kind === 'meteor') this.fallingMeteor(g, v, a.x, a.age / Math.max(1, spec.delay), spec.r);
      return;
    }
    const k = (a.age - spec.delay) / Math.max(1, spec.active);
    const look = LOOKS[ROSTER[a.char]!.id]!;
    const x = v.sx(a.x);
    const y0 = v.sy(0);
    const rx = v.px(spec.r);
    const fade = 1 - Math.max(0, k - 0.6) / 0.4;
    g.save();
    g.globalAlpha = Math.max(0, fade);
    switch (spec.kind) {
      case 'thunder':
      case 'storm': {
        for (let b = 0; b < (spec.kind === 'storm' ? 3 : 1); b++) {
          const bx = x + (b - 1) * rx * 0.6 * (spec.kind === 'storm' ? 1 : 0) + Math.sin(this.time * 40 + b) * 4;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 6;
          g.shadowColor = '#9ad8ff';
          g.shadowBlur = 20;
          g.beginPath();
          g.moveTo(bx, 0);
          let yy = 0;
          while (yy < y0) {
            yy += 30 + Math.random() * 40;
            g.lineTo(bx + (Math.random() - 0.5) * 50, Math.min(yy, y0));
          }
          g.stroke();
          g.shadowBlur = 0;
        }
        g.fillStyle = hexA('#9ad8ff', 0.35);
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.2, 0, 0, TAU);
        g.fill();
        break;
      }
      case 'frost': {
        for (let i = -3; i <= 3; i++) {
          const sx = x + (i / 3) * rx * 0.85;
          const h = v.px(500 + (3 - Math.abs(i)) * 260) * Math.min(1, k * 5);
          g.fillStyle = i % 2 ? '#bfefff' : '#e8fbff';
          g.strokeStyle = '#5ab8e6';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(sx - v.px(140), y0);
          g.lineTo(sx, y0 - h);
          g.lineTo(sx + v.px(140), y0);
          g.closePath();
          g.fill();
          g.stroke();
        }
        break;
      }
      case 'quake': {
        g.fillStyle = '#7a6a5a';
        for (let i = -4; i <= 4; i++) {
          const sx = x + (i / 4) * rx;
          const h = v.px(250 + ((i * 37) % 5) * 80) * Math.sin(Math.min(1, k * 3) * Math.PI);
          g.beginPath();
          g.moveTo(sx - v.px(160), y0);
          g.lineTo(sx - v.px(60), y0 - h);
          g.lineTo(sx + v.px(90), y0 - h * 0.8);
          g.lineTo(sx + v.px(160), y0);
          g.fill();
        }
        g.strokeStyle = hexA(look.color, 0.9);
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(x, y0, rx * (0.5 + k), rx * 0.18 * (0.5 + k), 0, 0, TAU);
        g.stroke();
        break;
      }
      case 'moon': {
        const h = v.px(2600);
        const gr = g.createLinearGradient(x - rx, 0, x + rx, 0);
        gr.addColorStop(0, hexA(look.color, 0));
        gr.addColorStop(0.5, hexA(look.glow, 0.85));
        gr.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = gr;
        g.fillRect(x - rx, y0 - h, rx * 2, h);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(x, y0 - h * 0.8, rx * 0.5, 0, TAU);
        g.arc(x + rx * 0.2, y0 - h * 0.82, rx * 0.42, 0, TAU, true);
        g.fill('evenodd');
        break;
      }
      case 'crimson': {
        // The sprite paints the blades; add a blood-red ground seal and rising motes
        g.strokeStyle = hexA('#ff3a3a', 0.9);
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.2, 0, 0, TAU);
        g.stroke();
        g.fillStyle = hexA('#ff2a2a', 0.22);
        g.fill();
        for (let n = 0; n < 12; n++) {
          const px = x + Math.sin(n * 7.3 + a.age * 0.05) * rx * 0.9;
          const py = y0 - ((a.age * 6 + n * 37) % 260);
          g.fillStyle = hexA('#ffb0a0', 0.8);
          g.fillRect(px, py, 3, 9);
        }
        break;
      }
      case 'leaf': {
        for (let n = 0; n < 22; n++) {
          const ang2 = n * 0.9 + a.age * 0.25;
          const rr = rx * (0.4 + ((n * 37) % 60) / 100);
          const px = x + Math.cos(ang2) * rr;
          const py = y0 - v.px(900) + Math.sin(ang2) * rr * 0.45 - (n % 4) * 8;
          g.save();
          g.translate(px, py);
          g.rotate(ang2 * 2);
          g.fillStyle = n % 3 ? '#6bd46a' : '#c8f58a';
          g.beginPath();
          g.ellipse(0, 0, 8, 3.5, 0, 0, TAU);
          g.fill();
          g.restore();
        }
        g.strokeStyle = hexA('#9cf07a', 0.5);
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(x, y0 - v.px(900), rx * 0.9, rx * 0.4, 0, a.age * 0.2, a.age * 0.2 + 4.5);
        g.stroke();
        break;
      }
      case 'holy': {
        const h = v.sy(0) + 40;
        const w = rx * (0.5 + 0.5 * Math.min(1, k * 4));
        const gr = g.createLinearGradient(x - w, 0, x + w, 0);
        gr.addColorStop(0, 'rgba(255,240,190,0)');
        gr.addColorStop(0.5, 'rgba(255,250,230,0.95)');
        gr.addColorStop(1, 'rgba(255,240,190,0)');
        g.fillStyle = gr;
        g.fillRect(x - w, y0 - h, w * 2, h);
        g.strokeStyle = hexA(look.color, 0.9);
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(x, y0, rx * 1.1, rx * 0.22, 0, 0, TAU);
        g.stroke();
        break;
      }
      case 'shout': {
        g.strokeStyle = hexA(look.color, 0.8);
        g.lineWidth = 6;
        for (let n = 0; n < 3; n++) {
          const rr = rx * (0.3 + k + n * 0.25);
          g.beginPath();
          g.ellipse(x, y0 - v.px(900), rr, rr * 0.9, 0, 0, TAU);
          g.stroke();
        }
        break;
      }
      case 'barrage': {
        g.strokeStyle = look.color;
        g.lineWidth = 3;
        for (let i = 0; i < 10; i++) {
          const sx = x + (((i * 73 + a.age * 13) % 100) / 100 - 0.5) * rx * 2;
          const sy = y0 - ((a.age * 40 + i * 60) % 400);
          g.beginPath();
          g.moveTo(sx, sy - 40);
          g.lineTo(sx, sy);
          g.stroke();
        }
        g.fillStyle = hexA(look.color, 0.3);
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.18, 0, 0, TAU);
        g.fill();
        break;
      }
      case 'meteor': {
        // Impact: a fireball crater with flames shooting up
        const R = rx * (0.6 + 0.6 * Math.min(1, k * 3));
        const gr = g.createRadialGradient(x, y0 - R * 0.3, 0, x, y0 - R * 0.3, R);
        gr.addColorStop(0, '#fff6d0');
        gr.addColorStop(0.35, '#ffb43a');
        gr.addColorStop(0.7, hexA('#ff4a1a', 0.8));
        gr.addColorStop(1, hexA('#ff4a1a', 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y0 - R * 0.3, R, 0, TAU);
        g.fill();
        g.fillStyle = hexA('#ffd27a', 0.9);
        for (let n = -3; n <= 3; n++) {
          const fx = x + (n / 3) * rx * 0.8;
          const h = v.px(500 + (3 - Math.abs(n)) * 280) * Math.sin(Math.min(1, k * 2) * Math.PI);
          g.beginPath();
          g.moveTo(fx - v.px(110), y0);
          g.quadraticCurveTo(fx, y0 - h * 1.1, fx + v.px(110), y0);
          g.fill();
        }
        break;
      }
      case 'tide': {
        // A whirlpool with water spouts and tentacles curling up
        g.fillStyle = hexA('#1d6f8f', 0.55);
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.2, 0, 0, TAU);
        g.fill();
        g.strokeStyle = hexA('#b8fff0', 0.8);
        g.lineWidth = 3;
        for (let n = 0; n < 3; n++) {
          g.beginPath();
          g.ellipse(x, y0, rx * (0.3 + n * 0.25), rx * 0.2 * (0.3 + n * 0.25), 0, a.age * 0.15 + n, a.age * 0.15 + n + 4);
          g.stroke();
        }
        const rise = Math.sin(Math.min(1, k * 2.5) * Math.PI * 0.5);
        for (let n = -2; n <= 2; n++) {
          const tx = x + (n / 2) * rx * 0.7;
          const h = v.px(900 + (2 - Math.abs(n)) * 500) * rise;
          const sway = Math.sin(a.age * 0.2 + n) * v.px(160);
          g.strokeStyle = n % 2 ? '#2fb39a' : '#46d6b6';
          g.lineCap = 'round';
          g.lineWidth = v.px(150) * (1 - Math.abs(n) * 0.12);
          g.beginPath();
          g.moveTo(tx, y0);
          g.quadraticCurveTo(tx + sway, y0 - h * 0.6, tx - sway * 0.6, y0 - h);
          g.stroke();
        }
        g.fillStyle = hexA('#e6fffb', 0.8);
        for (let n = 0; n < 10; n++) {
          const px = x + (((n * 37 + a.age * 7) % 100) / 100 - 0.5) * rx * 1.6;
          const py = y0 - ((a.age * 9 + n * 41) % Math.max(1, v.px(1600)));
          g.beginPath();
          g.arc(px, py, 3, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'void': {
        // Grave hands reaching out of a dark rift
        g.fillStyle = hexA('#1a0b26', 0.75);
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.2, 0, 0, TAU);
        g.fill();
        g.strokeStyle = hexA('#c04cff', 0.9);
        g.lineWidth = 3;
        g.stroke();
        const rise = Math.sin(Math.min(1, k * 2.5) * Math.PI * 0.5);
        for (let n = -3; n <= 3; n++) {
          const hx = x + (n / 3) * rx * 0.8;
          const h = v.px(500 + ((n * 53 + 300) % 5) * 160) * rise;
          g.strokeStyle = '#2b1838';
          g.lineCap = 'round';
          g.lineWidth = v.px(110);
          g.beginPath();
          g.moveTo(hx, y0);
          g.lineTo(hx + Math.sin(n) * v.px(80), y0 - h);
          g.stroke();
          // Fingers
          g.lineWidth = v.px(40);
          for (let q = -1; q <= 1; q++) {
            g.beginPath();
            g.moveTo(hx + Math.sin(n) * v.px(80), y0 - h);
            g.lineTo(hx + Math.sin(n) * v.px(80) + q * v.px(90), y0 - h - v.px(140));
            g.stroke();
          }
        }
        const glow = g.createRadialGradient(x, y0, 0, x, y0, rx);
        glow.addColorStop(0, hexA('#ff9cf0', 0.35));
        glow.addColorStop(1, hexA('#c04cff', 0));
        g.fillStyle = glow;
        g.fillRect(x - rx, y0 - rx, rx * 2, rx * 1.2);
        break;
      }
      case 'smoke': {
        g.fillStyle = hexA('#2b2340', 0.6);
        for (let n = 0; n < 7; n++) {
          const a2 = (n / 7) * TAU + a.age * 0.05;
          g.beginPath();
          g.arc(x + Math.cos(a2) * rx * 0.5 * (0.6 + k), y0 - rx * 0.6 + Math.sin(a2) * rx * 0.35, rx * 0.4, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'blast':
      case 'burst':
      default: {
        const R = rx * (0.5 + 0.7 * Math.min(1, k * 3));
        const gr = g.createRadialGradient(x, y0 - R * 0.4, 0, x, y0 - R * 0.4, R);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.4, spec.kind === 'blast' ? '#ffcf6a' : hexA(look.glow, 0.95));
        gr.addColorStop(1, hexA(spec.kind === 'blast' ? '#ff6a3a' : look.color, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y0 - R * 0.4, R, 0, TAU);
        g.fill();
        break;
      }
    }
    g.restore();
  }

  /** A burning rock streaking down onto x (k: 0 → 1 as it lands). */
  private fallingMeteor(g: CanvasRenderingContext2D, v: View2D, x: number, k: number, r: number) {
    const sx = v.sx(x + (1 - k) * 4500 * v.flip);
    const sy = v.sy((1 - k) * 9000);
    const R = Math.max(8, v.px(r * 0.32));
    const ang = Math.atan2(v.px(9000), -v.px(4500) * v.flip);
    g.save();
    g.translate(sx, sy);
    g.rotate(ang);
    const tail = g.createLinearGradient(-R * 7, 0, 0, 0);
    tail.addColorStop(0, 'rgba(255, 90, 30, 0)');
    tail.addColorStop(1, 'rgba(255, 170, 60, 0.85)');
    g.fillStyle = tail;
    g.beginPath();
    g.moveTo(0, -R);
    g.lineTo(-R * 7, 0);
    g.lineTo(0, R);
    g.fill();
    const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.4);
    core.addColorStop(0, '#fff3c8');
    core.addColorStop(0.45, '#ff9a3a');
    core.addColorStop(1, 'rgba(255, 60, 20, 0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, R * 1.4, 0, TAU);
    g.fill();
    g.fillStyle = '#5a2a1e';
    g.beginPath();
    g.arc(0, 0, R * 0.6, 0, TAU);
    g.fill();
    g.restore();
  }

  private dizzy(g: CanvasRenderingContext2D, s: GameState, v: View2D) {
    for (const f of s.fighters) {
      if (f.state !== FS.DIZZY && f.state !== FS.GUARD_BREAK) continue;
      for (let k = 0; k < 3; k++) {
        const a = this.time * 5 + (k * TAU) / 3;
        const x = v.sx(f.x + Math.cos(a) * 320);
        const y = v.sy(f.y + 1950) + Math.sin(a) * 6;
        g.fillStyle = '#fff4a8';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 4 : 10;
          const b = (i / 10) * TAU + this.time * 3;
          g[i ? 'lineTo' : 'moveTo'](x + Math.cos(b) * r, y + Math.sin(b) * r);
        }
        g.fill();
      }
    }
  }
}
