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
import {
  abyssEye,
  crescent,
  crow,
  crystalLance,
  embers,
  flame,
  flameWall,
  flask,
  hash,
  lightning,
  miasma,
  PLAGUE_FIRE,
  rays,
  smoke,
  starBurst,
  waterCurl,
} from './fxdraw';
import { fireball, fireColumn, fireDome, firePool, fireRing, meteorRock, rocks, shockRing } from './fire';
import { hexA, type View2D } from './view';

export interface EffectCallbacks {
  /** Rollback-safe: called once per real event (PLAN §5.6). */
  onEvent?: (e: SimEvent) => void;
  /** The event turned out never to have happened (a rollback undid it). */
  onCancel?: (e: SimEvent) => void;
}

/** A one-shot effect in world millimetres; returns false when finished. */
type Fx = {
  age: number;
  life: number;
  draw: (g: CanvasRenderingContext2D, v: View2D, k: number, dt: number) => void;
};

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
  /** Areas seen last frame, so the fire can linger after one ends (see trackAreas). */
  private areaSeen = new Map<string, GameState['areas'][number]>();

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
    this.trackAreas(state);
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
        if (LOOKS[ROSTER[s.fighters[e.fighter]?.char ?? 0]!.id]?.weapon === 'lantern') {
          // A flask shatters: glass, a splash of green and a puff of plague
          this.burst(e.x, Math.max(200, e.y), 18, '#e8fbff', 6000, 0.3);
          this.burst(e.x, Math.max(200, e.y), 22, '#8fe05a', 5000, 0.45);
          this.ring(e.x, 0, 200, 1300, '#8fe05a', 0.35, true);
          this.shake = Math.max(this.shake, 4);
          break;
        }
        this.burst(e.x, Math.max(200, e.y), 30, '#ffb066', 8000, 0.45);
        this.ring(e.x, 0, 300, 1700, '#ffb066', 0.35, true);
        this.shake = Math.max(this.shake, 10);
        break;
      case EV.TELEPORT: {
        const w = LOOKS[ROSTER[s.fighters[e.fighter]?.char ?? 0]!.id]?.weapon;
        if (w === 'dagger') this.smoke(e.x);
        else if (w === 'lantern') {
          // Dissolves into plague smoke and a burst of crows
          this.smoke(e.x, '80, 150, 70');
          this.crows(e.x, 1100, 7);
        } else if (w === 'fire') {
          this.burst(e.x, 900, 22, '#ffb43a', 6000, 0.35);
          this.ring(e.x, 0, 100, 900, '#ff6a2a', 0.3, true);
        } else {
          this.pillar(e.x, own, 1);
          this.burst(e.x, 900, 14, this.glow(s, e.fighter), 4000, 0.3);
        }
        break;
      }
      case EV.DASH:
        this.dust(e.x, 8);
        break;
      case EV.JUMP:
        if (e.value === 1) {
          // Double jump: a burst of wind under the feet
          this.ring(e.x, e.y + 100, 150, 900, '#ffffff', 0.3, true);
          this.ring(e.x, e.y + 100, 80, 600, own, 0.25, true);
          this.burst(e.x, e.y + 200, 10, '#ffffff', 3000, 0.25);
        } else this.dust(e.x, 8);
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
      case EV.WALL:
        // Slammed into the wall: debris, a crack and a jolt
        this.burst(e.x, e.y, 22, '#e8dcc8', 7000, 0.4);
        this.impact(e.x, e.y, 800, '#ffd23f');
        this.dust(e.x, 10);
        this.popup(e.x - Math.sign(e.x) * 600, e.y + 700, 'WALL!', '#ffd23f', 34);
        this.shake = Math.max(this.shake, 14);
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

  /** Crows bursting out of a point and flying off. */
  private crows(x: number, y: number, n: number) {
    const birds = Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const sp = 3500 + Math.random() * 2500;
      return { vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp, ph: i * 1.7, s: 380 + Math.random() * 200 };
    });
    this.add(0.7, (g, v, k) => {
      const t = k * 0.7;
      for (const b of birds) {
        g.save();
        g.translate(v.sx(x + b.vx * t), v.sy(y + b.vy * t + 900 * t));
        g.scale(Math.sign(b.vx * v.flip) || 1, 1);
        g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
        crow(g, v.px(b.s), Math.sin(this.time * 28 + b.ph));
        g.restore();
      }
      g.globalAlpha = 1;
    });
  }

  /** Smoke puff (teleports); `rgb` tints it. */
  private smoke(x: number, rgb = '70, 60, 95') {
    const puffs = Array.from({ length: 9 }, () => ({
      ox: (Math.random() - 0.5) * 900,
      oy: 300 + Math.random() * 1300,
      r: 260 + Math.random() * 220,
    }));
    this.add(0.55, (g, v, k) => {
      g.fillStyle = `rgba(${rgb}, ${0.75 * (1 - k)})`;
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
      g.font = `900 ${Math.round(px * 1.2)}px "Grenze", Georgia, serif`;
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
      const seed = a.action * 7 + a.spec;
      if (a.age >= spec.delay) {
        // Homura's ring of fire: the far half burns behind the heroes
        if (spec.kind === 'firering') this.flameRing(g, v, a.x, spec.r, a.age - spec.delay, 'back', seed);
        continue;
      }
      const k = a.age / Math.max(1, spec.delay);
      if (spec.kind === 'pillar' || spec.kind === 'meteor') {
        this.scorch(g, v, a.x, spec.r, k, seed);
        continue;
      }
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
        if (look.weapon === 'fire') {
          // Fireball: a flaming tail behind a white-hot core
          g.rotate(ang);
          g.save();
          g.rotate(Math.PI / 2);
          for (let q = 0; q < 3; q++)
            flame(
              g,
              (q - 1) * r * 0.35,
              r * 0.4,
              r * 1.3,
              r * (4.2 - Math.abs(q - 1)),
              this.time + q,
              p.age + q,
            );
          g.restore();
          const core = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.2);
          core.addColorStop(0, '#fffbe8');
          core.addColorStop(0.5, '#ffc04a');
          core.addColorStop(1, 'rgba(255, 90, 30, 0)');
          g.fillStyle = core;
          g.beginPath();
          g.arc(0, 0, r * 1.2, 0, TAU);
          g.fill();
          embers(g, -r * 2, 0, r * 2, r * 2, this.time, 8, '#ffd27a', p.age);
          break;
        }
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
        break;
      }
      case 'lance': {
        g.rotate(ang);
        crystalLance(g, v.px(1900), Math.max(6, r * 0.55), look.color, look.glow);
        embers(g, -v.px(900), 0, v.px(700), v.px(300), this.time, 6, '#e8fbff', p.age);
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
          spec.kind === 'grenade'
            ? Math.sin(p.age * (0.3 + p.age / 60)) > 0
            : armed && Math.sin(p.age * 0.25) > 0;
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
      case 'flask': {
        // Spinning flask with a trail of green droplets
        const dir = (p.vx >= 0 ? 1 : -1) * v.flip;
        for (let q = 1; q <= 5; q++) {
          g.fillStyle = hexA('#8fe05a', 0.55 - q * 0.09);
          g.beginPath();
          g.arc(
            -p.vx * q * 0.9 * v.px(1) * v.flip,
            p.vy * q * 0.9 * v.px(1),
            Math.max(1.5, r * (0.32 - q * 0.04)),
            0,
            TAU,
          );
          g.fill();
        }
        g.rotate(p.age * 0.32 * dir);
        flask(g, Math.max(18, r * 2.4), this.time);
        break;
      }
      case 'crow': {
        // A crow diving at the enemy, wings beating
        const dir = (p.vx >= 0 ? 1 : -1) * v.flip;
        g.scale(dir, 1);
        g.rotate(Math.atan2(-p.vy, Math.abs(p.vx) + 1) * 0.8);
        smoke(g, -r * 1.2, r * 0.2, r * 0.5, this.time * 2, 4, '#1a1426', p.age + p.spec * 7);
        crow(g, Math.max(18, r * 2.6), Math.sin(this.time * 26 + p.age * 0.4 + p.spec * 2.1));
        break;
      }
      case 'spark': {
        // A crackling star of stinging light, little arcs jumping off it (Kurage)
        const R = Math.max(9, r * 1.5);
        const beat = 1 + Math.sin(this.time * 42 + p.age) * 0.16;
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 2.2 * beat);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.25, hexA(look.glow, 0.95));
        gr.addColorStop(0.55, hexA(look.color, 0.55));
        gr.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(0, 0, R * 2.2 * beat, 0, TAU);
        g.fill();
        for (let q = 0; q < 3; q++) {
          const a = hash(q * 3.1 + Math.floor(this.time * 20) + p.spec) * TAU;
          lightning(
            g,
            0,
            0,
            Math.cos(a) * R * 2.4,
            Math.sin(a) * R * 2.4,
            1.2,
            this.time,
            look.color,
            q + p.age,
          );
        }
        g.rotate(this.time * 5 + p.age * 0.15);
        g.fillStyle = '#ffffff';
        g.beginPath();
        for (let q = 0; q < 8; q++) {
          const a = (q / 8) * TAU;
          const rr = q % 2 ? R * 0.3 : R * 1.35 * beat;
          g[q ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        break;
      }
      case 'bolt': {
        // Shiden: purple lightning streaking ahead of a white-hot head
        g.rotate(ang);
        const len = v.px(1500);
        const R = Math.max(6, r * 0.9);
        const tail = g.createLinearGradient(-len, 0, 0, 0);
        tail.addColorStop(0, hexA(look.color, 0));
        tail.addColorStop(1, hexA(look.color, 0.45));
        g.fillStyle = tail;
        g.beginPath();
        g.moveTo(0, -R);
        g.lineTo(-len, 0);
        g.lineTo(0, R);
        g.fill();
        lightning(g, -len, 0, 0, 0, 3, this.time, look.color, p.age);
        lightning(g, -len * 0.7, 0, 0, 0, 1.6, this.time + 0.37, look.glow, p.age + 9);
        const head = g.createRadialGradient(0, 0, 0, 0, 0, R * 2);
        head.addColorStop(0, '#ffffff');
        head.addColorStop(0.4, hexA(look.glow, 0.9));
        head.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = head;
        g.beginPath();
        g.arc(0, 0, R * 2, 0, TAU);
        g.fill();
        break;
      }
      case 'fireball': {
        g.rotate(ang);
        const big = spec.r >= 400;
        fireball(g, r * 1.1, this.time, p.owner * 11 + p.action * 3 + p.spec, 1, big ? 1.4 : 1);
        if (big) embers(g, -r * 2.5, 0, r * 3, r * 2.5, this.time, 10, '#ffd27a', p.spec);
        break;
      }
      case 'flamewall': {
        const dir = (p.vx >= 0 ? 1 : -1) * v.flip;
        g.scale(dir, 1);
        const seed = p.owner * 11 + p.action * 3 + p.spec;
        const H = v.px(2000);
        // Fire left burning on the ground it has rolled over
        const crossed = Math.min(v.px(spec.speed * p.age), r * 4);
        for (let q = 1; q <= 4; q++) {
          const back = (q / 4) * crossed;
          if (back < r * 0.6) continue;
          const kk = 1 - q / 5;
          fireColumn(g, -back, 0, r * 0.6 * kk, H * 0.32 * kk, this.time, seed + q * 5, 0.8 * kk);
        }
        firePool(g, -r * 0.3, 0, r * 1.5, this.time, 0.85, seed, 0);
        // The wall itself, leaning into its roll
        g.save();
        g.transform(1, 0, -0.2, 1, 0, 0);
        fireColumn(g, -r * 0.85, 0, r * 0.9, H * 0.62, this.time, seed + 1);
        fireColumn(g, r * 0.45, 0, r * 0.85, H * 0.78, this.time, seed + 2);
        fireColumn(g, -r * 0.15, 0, r * 1.15, H, this.time, seed + 3);
        g.restore();
        embers(g, 0, -H * 0.3, r * 2.4, H, this.time, 14, '#ffd27a', seed);
        break;
      }
      case 'wave': {
        const dir = (p.vx >= 0 ? 1 : -1) * v.flip;
        g.scale(dir, 1);
        const H = v.px(1700);
        if (look.weapon === 'fire') {
          // A rolling wall of flame
          flameWall(g, -r * 1.6, r * 1.2, 0, H, this.time, p.age);
          embers(g, 0, -H * 0.5, r * 3, H, this.time, 14, '#ffd27a', p.age);
        } else if (look.weapon === 'anchor') {
          waterCurl(g, r * 3, H, this.time);
        } else {
          // A big crescent slash of light (sword) or of void (scythe) with an afterimage trail
          const dark = look.weapon === 'scythe';
          const S = v.px(1250);
          g.translate(0, -S * 0.75);
          g.rotate(-0.35 + Math.sin(this.time * 6) * 0.03);
          for (let q = 3; q >= 1; q--) {
            g.save();
            g.translate(-q * S * 0.22, 0);
            g.globalAlpha = 0.18 * (4 - q);
            crescent(g, S, S * 0.34, look.color, look.color, 2.6);
            g.restore();
          }
          g.globalAlpha = 1;
          g.shadowColor = look.color;
          g.shadowBlur = 18;
          crescent(g, S, S * 0.34, dark ? '#1a0826' : look.color, dark ? look.color : '#fffbe8', 2.6);
          g.shadowBlur = 0;
          g.strokeStyle = dark ? look.glow : '#ffffff';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(0, 0, S * 0.99, -1.25, 1.25);
          g.stroke();
          if (dark) smoke(g, -S * 0.6, S * 0.6, S * 0.5, this.time, 7, '#2a0f3a', p.age);
          else embers(g, -S * 0.5, S * 0.7, S * 0.9, S * 1.2, this.time, 12, '#fff4c8', p.age);
        }
        break;
      }
    }
    g.restore();
  }

  private area(g: CanvasRenderingContext2D, v: View2D, a: GameState['areas'][number]) {
    const spec = areaSpec(a.char, a.action, a.spec);
    if (a.age < spec.delay) {
      if (spec.kind === 'meteor') this.fallingMeteor(g, v, a.x, a.age / Math.max(1, spec.delay), spec.r);
      // Kaen Pillar bursts out of the ground just before it can hit, so it's up when it does
      else if (spec.kind === 'pillar' && a.age >= spec.delay - 3)
        this.firePillar(g, v, a.x, spec.r, a.age - spec.delay, a.action * 7 + a.spec);
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
      case 'pillar':
        g.globalAlpha = 1;
        this.firePillar(g, v, a.x, spec.r, a.age - spec.delay, a.action * 7 + a.spec);
        break;
      case 'firering':
        g.globalAlpha = 1;
        this.flameRing(g, v, a.x, spec.r, a.age - spec.delay, 'front', a.action * 7 + a.spec);
        break;
      case 'thunder':
      case 'storm': {
        for (let b = 0; b < (spec.kind === 'storm' ? 3 : 1); b++) {
          const bx =
            x + (b - 1) * rx * 0.6 * (spec.kind === 'storm' ? 1 : 0) + Math.sin(this.time * 40 + b) * 4;
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
        // A pillar of dawn: a beam from the sky, rays, rings of light and sparks
        const h = v.sy(0) + 40;
        const w = rx * 0.55 * (0.4 + 0.6 * Math.min(1, k * 4));
        const gr = g.createLinearGradient(x - w, 0, x + w, 0);
        gr.addColorStop(0, 'rgba(255,240,190,0)');
        gr.addColorStop(0.5, 'rgba(255,252,236,0.95)');
        gr.addColorStop(1, 'rgba(255,240,190,0)');
        g.fillStyle = gr;
        g.fillRect(x - w, y0 - h, w * 2, h);
        rays(g, x, y0, rx * 2.2, 9, this.time, '#ffe9a8');
        for (let n = 0; n < 3; n++) {
          const ry = y0 - v.px(600 + n * 900) - k * v.px(400);
          g.strokeStyle = hexA(look.color, 0.85 - n * 0.2);
          g.lineWidth = 4 - n;
          g.beginPath();
          g.ellipse(x, ry, rx * (0.9 - n * 0.2), rx * 0.18, 0, 0, TAU);
          g.stroke();
        }
        embers(g, x, y0, rx * 1.6, v.px(3000), this.time, 24, '#fff6c8', a.age);
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
        // Arrows raining down, each with a streak of light
        for (let i = 0; i < 14; i++) {
          const sx = x + (hash(i * 7.1) - 0.5) * rx * 1.8;
          const fall = ((a.age * 0.09 + hash(i * 3.3)) % 1) * v.px(2600);
          const sy = y0 - v.px(2600) + fall;
          g.save();
          g.translate(sx, sy);
          g.rotate(Math.PI / 2 + 0.12);
          const tr = g.createLinearGradient(-v.px(700), 0, 0, 0);
          tr.addColorStop(0, hexA(look.glow, 0));
          tr.addColorStop(1, hexA(look.glow, 0.8));
          g.fillStyle = tr;
          g.fillRect(-v.px(700), -2, v.px(700), 4);
          g.fillStyle = '#e8f0f2';
          g.beginPath();
          g.moveTo(v.px(120), 0);
          g.lineTo(0, -4);
          g.lineTo(0, 4);
          g.fill();
          g.restore();
        }
        g.strokeStyle = hexA(look.color, 0.8);
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.18, 0, 0, TAU);
        g.stroke();
        embers(g, x, y0, rx * 1.6, v.px(500), this.time, 10, look.glow, a.age);
        break;
      }
      case 'meteor':
        g.globalAlpha = 1;
        this.meteorBlast(g, v, a.x, spec.r, a.age - spec.delay, a.action * 7 + a.spec);
        break;
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
          g.ellipse(
            x,
            y0,
            rx * (0.3 + n * 0.25),
            rx * 0.2 * (0.3 + n * 0.25),
            0,
            a.age * 0.15 + n,
            a.age * 0.15 + n + 4,
          );
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
      case 'reap': {
        const S = v.px(1300);
        const cy = y0 - v.px(1000);
        if (a.spec === 0) {
          // Kokū Harvest: crescents of the void cut through the target from every side
          g.fillStyle = hexA('#14081f', 0.45);
          g.beginPath();
          g.ellipse(x, y0, rx, rx * 0.2, 0, 0, TAU);
          g.fill();
          for (let q = 0; q < 4; q++) {
            const n = Math.floor(a.age / 5) * 4 + q;
            const life = (a.age % 5) / 5;
            g.save();
            g.translate(x + (hash(n * 1.7) - 0.5) * rx * 0.8, cy + (hash(n * 2.3) - 0.5) * v.px(900));
            g.rotate(hash(n * 3.9) * TAU);
            g.translate((life - 0.5) * S * 0.9, 0);
            g.globalAlpha = Math.max(0, fade) * (1 - life);
            g.shadowColor = look.color;
            g.shadowBlur = 14;
            crescent(g, S * 0.6, S * 0.2, look.color, q % 2 ? '#1a0826' : look.glow, 2.4);
            g.restore();
          }
          smoke(g, x, y0 - v.px(300), rx * 0.6, this.time, 6, '#2a0f3a', a.age);
          embers(g, x, y0, rx * 1.6, v.px(2400), this.time, 14, look.glow, a.age);
        } else {
          // The last cut: two great crescents cross in an X, then the void bursts
          const cross = Math.min(1, k * 3);
          for (const side of [-1, 1]) {
            g.save();
            g.translate(x, cy);
            g.rotate(side * 0.8);
            g.translate((cross - 0.5) * S * 1.4, 0);
            g.globalAlpha = Math.max(0, 1 - k * 1.2);
            g.shadowColor = look.color;
            g.shadowBlur = 22;
            crescent(g, S * 1.2, S * 0.36, look.color, '#1a0826', 2.6);
            g.restore();
          }
          starBurst(g, x, cy, rx * 1.3, k, look.color, look.glow, a.age);
          smoke(g, x, y0 - v.px(600), rx * 0.8, this.time, 8, '#2a0f3a', a.age + 5);
        }
        break;
      }
      case 'pulse': {
        // Hakkō: the bell flares and a ring of light rolls out from it
        const cy = y0 - v.px(1000);
        const R = rx * (0.3 + 0.95 * Math.min(1, k * 1.5));
        const flash = g.createRadialGradient(x, cy, 0, x, cy, R * 1.25);
        flash.addColorStop(0, hexA('#ffffff', 0.9 * (1 - k)));
        flash.addColorStop(0.35, hexA(look.glow, 0.55 * (1 - k)));
        flash.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = flash;
        g.beginPath();
        g.arc(x, cy, R * 1.25, 0, TAU);
        g.fill();
        for (let n = 0; n < 3; n++) {
          g.strokeStyle = hexA(n ? look.color : '#ffffff', (1 - k) * (0.9 - n * 0.25));
          g.lineWidth = Math.max(1, v.px(90) * (1 - n * 0.3) * (1 - k * 0.6));
          g.beginPath();
          g.ellipse(x, cy, R * (1 - n * 0.16), R * 0.82 * (1 - n * 0.16), 0, 0, TAU);
          g.stroke();
        }
        rays(g, x, cy, R * 1.5, 11, this.time, look.glow);
        g.strokeStyle = hexA(look.color, 0.8 * (1 - k));
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(x, y0, R, R * 0.18, 0, 0, TAU);
        g.stroke();
        break;
      }
      case 'abyss': {
        const cy = y0 - v.px(1700);
        if (a.spec === 0) {
          // Shinkai: the deep closes over the target, lightning stings in the dark, the eye opens
          const swell = Math.min(1, k * 5);
          const deep = g.createRadialGradient(x, y0 - v.px(900), 0, x, y0 - v.px(900), rx * 1.4);
          deep.addColorStop(0, hexA('#2a0f4a', 0.7 * swell));
          deep.addColorStop(0.7, hexA('#12062a', 0.55 * swell));
          deep.addColorStop(1, hexA('#12062a', 0));
          g.fillStyle = deep;
          g.beginPath();
          g.arc(x, y0 - v.px(900), rx * 1.4, 0, TAU);
          g.fill();
          for (let q = 0; q < 3; q++) {
            const n = Math.floor(a.age / 6) * 3 + q;
            if (hash(n * 4.1) < 0.35) continue;
            const sx = x + (hash(n * 1.3) - 0.5) * rx * 1.4;
            lightning(
              g,
              sx,
              cy,
              x + (hash(n * 2.9) - 0.5) * rx * 0.6,
              y0 - v.px(500),
              2.2,
              this.time,
              look.color,
              n,
            );
          }
          // Bubbles drifting up through the dark
          g.strokeStyle = hexA(look.glow, 0.7);
          g.lineWidth = 1.2;
          for (let n = 0; n < 12; n++) {
            const life = (this.time * (0.35 + hash(n) * 0.3) + hash(n * 5)) % 1;
            g.globalAlpha = Math.max(0, fade) * (1 - life);
            g.beginPath();
            g.arc(x + (hash(n * 7) - 0.5) * rx * 1.6, y0 - life * v.px(2600), 2 + hash(n * 3) * 3, 0, TAU);
            g.stroke();
          }
          g.globalAlpha = Math.max(0, fade);
          abyssEye(g, x, cy - v.px(500), rx * 0.75, Math.min(1, k * 1.6), this.time, look.color, look.glow);
        } else {
          // The eye bursts with light
          abyssEye(g, x, cy - v.px(500), rx * 0.75 * (1 + k * 0.4), 1 - k, this.time, look.color, look.glow);
          starBurst(g, x, y0 - v.px(900), rx * 1.5, k, look.color, look.glow, a.age);
          rays(g, x, y0, rx * 2.4, 12, this.time, look.glow);
        }
        break;
      }
      case 'miasma': {
        miasma(g, x, y0, rx, this.time, k, a.action * 3 + a.spec);
        break;
      }
      case 'plague': {
        // The Black Death: a churning storm of plague with crows wheeling through it
        miasma(g, x, y0, rx * 1.1, this.time * 1.6, k, 5);
        miasma(g, x, y0 - v.px(600), rx * 0.8, this.time * 2.2, k, 11);
        for (let n = 0; n < 8; n++) {
          const ang = this.time * (2.4 + (n % 3) * 0.3) + (n * TAU) / 8;
          const px = x + Math.cos(ang) * rx * 0.85;
          const py = y0 - v.px(700 + (n % 3) * 450) + Math.sin(ang) * rx * 0.18;
          g.save();
          g.translate(px, py);
          g.scale(-Math.sin(ang) >= 0 ? 1 : -1, 1);
          crow(g, v.px(520), Math.sin(this.time * 30 + n * 1.3));
          g.restore();
        }
        embers(g, x, y0, rx * 1.8, v.px(2600), this.time, 18, '#c8ff8a', a.age);
        break;
      }
      case 'pyre': {
        // The lantern's fire erupts: a towering pillar of green flame, crows scattering. Already
        // half-risen on its first frame (the hit freezes the action right there).
        const rise = 0.5 + 0.5 * Math.min(1, k * 4);
        g.fillStyle = 'rgba(20, 40, 16, 0.5)';
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.18, 0, 0, TAU);
        g.fill();
        flameWall(g, x - rx * 0.8, x + rx * 0.8, y0, v.px(2700) * rise, this.time, a.action, PLAGUE_FIRE);
        flame(g, x, y0, rx * 0.9, v.px(3800) * rise, this.time, 99, PLAGUE_FIRE);
        smoke(g, x, y0 - v.px(2700) * rise, rx * 0.6, this.time, 6, '#24331c', a.age);
        embers(g, x, y0, rx * 2, v.px(3400), this.time, 20, '#e2ffb5', a.age);
        if (k < 0.3) starBurst(g, x, y0 - v.px(300), rx * 1.2, k / 0.3, '#5fd04a', '#e2ffb5', a.age);
        for (let n = 0; n < 6; n++) {
          const side = n % 2 ? 1 : -1;
          g.save();
          g.translate(x + side * k * v.px(2600 + n * 300), y0 - v.px(1200 + n * 260) - k * v.px(1800));
          g.scale(side, 1);
          crow(g, v.px(480), Math.sin(this.time * 30 + n));
          g.restore();
        }
        break;
      }
      case 'smoke': {
        g.fillStyle = hexA('#2b2340', 0.6);
        for (let n = 0; n < 7; n++) {
          const a2 = (n / 7) * TAU + a.age * 0.05;
          g.beginPath();
          g.arc(
            x + Math.cos(a2) * rx * 0.5 * (0.6 + k),
            y0 - rx * 0.6 + Math.sin(a2) * rx * 0.35,
            rx * 0.4,
            0,
            TAU,
          );
          g.fill();
        }
        break;
      }
      case 'blast': {
        // A pillar of fire bursting out of the ground
        const rise = Math.min(1, k * 4);
        g.fillStyle = 'rgba(40, 14, 10, 0.5)';
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.18, 0, 0, TAU);
        g.fill();
        flameWall(g, x - rx * 0.8, x + rx * 0.8, y0, v.px(2600) * rise, this.time, a.action);
        flame(g, x, y0, rx * 0.9, v.px(3400) * rise, this.time, 99);
        smoke(g, x, y0 - v.px(2600) * rise, rx * 0.6, this.time, 5, '#3a2a2a', a.age);
        embers(g, x, y0, rx * 2, v.px(3200), this.time, 18, '#ffd27a', a.age);
        if (k < 0.3) starBurst(g, x, y0 - v.px(300), rx * 1.2, k / 0.3, '#ff7a2a', '#ffe08a', a.age);
        break;
      }
      case 'burst':
      default: {
        // A star-shaped blast in the hero's colours
        starBurst(
          g,
          x,
          y0 - v.px(900),
          rx * 1.1,
          Math.min(1, k * 1.4),
          look.color,
          look.glow,
          a.age + a.action,
        );
        if (look.weapon === 'fire')
          flameWall(g, x - rx * 0.7, x + rx * 0.7, y0, v.px(1400) * (1 - k), this.time, a.age);
        else embers(g, x, y0 - v.px(400), rx * 1.6, v.px(1600), this.time, 14, look.glow, a.age);
        break;
      }
    }
    g.restore();
  }

  /* ------------------------------------------------------------ Homura's fire (see fire.ts) */

  /** Kaen Pillar and Flare Burst: `u` frames since the ground erupted (cooled off by 36). */
  private firePillar(g: CanvasRenderingContext2D, v: View2D, wx: number, r: number, u: number, seed: number) {
    const die = Math.min(1, Math.max(0, (u - 14) / 22));
    if (die >= 1) return;
    const x = v.sx(wx);
    const y0 = v.sy(0);
    const rx = v.px(r);
    const big = r >= 880;
    const a = 1 - die;
    const rise = 1 - (1 - Math.min(1, Math.max(0, (u + 3) / 4))) ** 3;
    const H = v.px(big ? 3600 : 2500) * rise * (1 - die * 0.7);
    firePool(g, x, y0, rx * 1.15, this.time, a, seed);
    fireColumn(g, x - rx * 0.55, y0, rx * 0.62, H * 0.66, this.time, seed + 1, a);
    fireColumn(g, x + rx * 0.55, y0, rx * 0.62, H * 0.74, this.time, seed + 2, a);
    fireColumn(g, x, y0, rx * 0.95, H, this.time, seed + 3, a);
    rocks(g, x, y0, rx * 1.5, v.px(big ? 2600 : 1800), v.px(big ? 80 : 60), u / 30, big ? 9 : 6, seed);
    embers(g, x, y0 - v.px(300), rx * 2, v.px(3000), this.time, 16, '#ffd27a', seed);
    if (die > 0) smoke(g, x, y0 - H * 0.85, rx * 0.7, this.time, 5, '#3a2622', seed);
    // The ground bursting open: a flash of fire at the root
    if (u >= -1 && u < 12) fireDome(g, x, y0, rx * 1.25, (u + 1) / 13);
  }

  /** Hōen Ward and Blaze Step: a ring of fire bursting out around her; `u` frames since. */
  private flameRing(
    g: CanvasRenderingContext2D,
    v: View2D,
    wx: number,
    r: number,
    u: number,
    part: 'back' | 'front' | 'all',
    seed: number,
  ) {
    const die = Math.min(1, Math.max(0, (u - 6) / 14));
    if (die >= 1) return;
    const x = v.sx(wx);
    const grow = 1 - (1 - Math.min(1, u / 10)) ** 2;
    const R = v.px(r) * (0.5 + 0.55 * grow);
    // Born at her waist where the staff swept it, it drops to the floor as it spreads
    const cy = v.sy(0) - v.px(700) * (1 - grow);
    const h = v.px(900) * (1 - 0.4 * grow) * (1 - die);
    fireRing(g, x, cy, R, R * 0.22, 0, TAU, h, this.time, seed, part, 1 - die);
    if (part === 'back') return;
    shockRing(g, x, v.sy(0), v.px(r) * 1.1, Math.min(1, u / 16));
    embers(g, x, cy, R * 2, v.px(1600), this.time, 12, '#ffd27a', seed);
  }

  /** A meteor strike: `u` frames since it hit (the big one burns longer). */
  private meteorBlast(
    g: CanvasRenderingContext2D,
    v: View2D,
    wx: number,
    r: number,
    u: number,
    seed: number,
  ) {
    const big = r >= 1500;
    const hold = big ? 12 : 6;
    const end = big ? 50 : 30;
    const die = Math.min(1, Math.max(0, (u - hold) / (end - hold)));
    if (die >= 1) return;
    const x = v.sx(wx);
    const y0 = v.sy(0);
    const rx = v.px(r);
    const a = 1 - die;
    const rise = 1 - (1 - Math.min(1, (u + 2) / 5)) ** 3;
    const H = v.px(big ? 4200 : 2400) * rise * (1 - die * 0.75);
    firePool(g, x, y0, rx * 1.1, this.time, a, seed);
    fireDome(g, x, y0, rx * (big ? 1.5 : 1.1), Math.min(1, (u + 2) / (big ? 28 : 18)));
    if (big) {
      fireColumn(g, x - rx * 0.5, y0, rx * 0.5, H * 0.62, this.time, seed + 1, a);
      fireColumn(g, x + rx * 0.5, y0, rx * 0.5, H * 0.7, this.time, seed + 2, a);
    }
    fireColumn(g, x, y0, rx * (big ? 0.85 : 0.75), H, this.time, seed + 3, a);
    shockRing(g, x, y0, rx * (big ? 1.6 : 1.3), Math.min(1, u / (big ? 22 : 16)));
    rocks(
      g,
      x,
      y0,
      rx * 1.6,
      v.px(big ? 3200 : 1800),
      v.px(big ? 110 : 70),
      u / (big ? 40 : 26),
      big ? 12 : 6,
      seed,
    );
    embers(
      g,
      x,
      y0 - v.px(300),
      rx * 2.2,
      v.px(big ? 4000 : 2600),
      this.time,
      big ? 24 : 12,
      '#ffd27a',
      seed,
    );
    if (die > 0) smoke(g, x, y0 - H * 0.8, rx * 0.8, this.time, big ? 8 : 4, '#3a2622', seed);
  }

  /** The ground heating up before Kaen Pillar erupts or a meteor lands: k = 0 → 1. */
  private scorch(g: CanvasRenderingContext2D, v: View2D, wx: number, r: number, k: number, seed: number) {
    const x = v.sx(wx);
    const y0 = v.sy(0);
    const rx = v.px(r);
    firePool(g, x, y0, rx * (0.4 + 0.7 * k), this.time, 0.35 + 0.6 * k, seed, k);
    g.save();
    g.translate(x, y0);
    g.scale(1, 0.2);
    g.rotate(this.time * (1 + 2 * k));
    g.strokeStyle = `rgba(255, 120, 40, ${0.45 + 0.5 * k})`;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, rx, 0, TAU);
    for (let q = 0; q < 10; q++) {
      const ang = (q / 10) * TAU;
      g.moveTo(Math.cos(ang) * rx * 0.84, Math.sin(ang) * rx * 0.84);
      g.lineTo(Math.cos(ang + 0.12) * rx, Math.sin(ang + 0.12) * rx);
    }
    g.stroke();
    g.restore();
    // A bright ring closing in: it erupts when the ring meets the middle
    g.strokeStyle = `rgba(255, 240, 200, ${0.4 + 0.5 * k})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x, y0, Math.max(1, rx * (1 - k)), Math.max(1, rx * (1 - k) * 0.2), 0, 0, TAU);
    g.stroke();
    embers(g, x, y0, rx * 1.4, v.px(900), this.time, 8, '#ffb347', seed);
  }

  /** Track areas between frames: when one of Homura's ends, its fire burns on for a moment. */
  private trackAreas(s: GameState) {
    const live = new Set<string>();
    for (const a of s.areas) {
      const key = `${a.owner}:${a.char}:${a.action}:${a.spec}:${a.x}`;
      live.add(key);
      this.areaSeen.set(key, { ...a });
    }
    for (const [key, a] of this.areaSeen) {
      if (live.has(key)) continue;
      this.areaSeen.delete(key);
      const spec = areaSpec(a.char, a.action, a.spec);
      // Cut short (a rollback took it back): nothing to linger
      if (a.age + 3 < spec.delay + spec.active) continue;
      this.remnant(a, spec);
    }
  }

  private remnant(a: GameState['areas'][number], spec: ReturnType<typeof areaSpec>) {
    const seed = a.action * 7 + a.spec;
    const from = spec.active;
    const to =
      spec.kind === 'pillar'
        ? 36
        : spec.kind === 'firering'
          ? 20
          : spec.kind === 'meteor'
            ? spec.r >= 1500
              ? 50
              : 30
            : 0;
    if (to <= from) return;
    this.fx.push({
      age: 0,
      life: (to - from) / 60,
      draw: (g, v, k) => {
        const u = from + k * (to - from);
        if (spec.kind === 'pillar') this.firePillar(g, v, a.x, spec.r, u, seed);
        else if (spec.kind === 'firering') this.flameRing(g, v, a.x, spec.r, u, 'all', seed);
        else this.meteorBlast(g, v, a.x, spec.r, u, seed);
      },
    });
  }

  /** A burning rock streaking down onto x (k: 0 → 1 as it lands), trailing smoke. */
  private fallingMeteor(g: CanvasRenderingContext2D, v: View2D, x: number, k: number, r: number) {
    const sx = v.sx(x + (1 - k) * 4500 * v.flip);
    const sy = v.sy((1 - k) * 9000);
    const R = Math.max(8, v.px(r * 0.3));
    const ang = Math.atan2(v.px(9000), -v.px(4500) * v.flip);
    g.save();
    g.translate(sx, sy);
    g.rotate(ang);
    for (let q = 1; q <= 5; q++) {
      g.fillStyle = `rgba(48, 30, 30, ${0.32 * (1 - q / 6)})`;
      g.beginPath();
      g.arc(-R * (2 + q * 1.5), Math.sin(this.time * 6 + q) * R * 0.3, R * (0.6 + q * 0.18), 0, TAU);
      g.fill();
    }
    meteorRock(g, R, this.time, Math.abs(x) % 97);
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
