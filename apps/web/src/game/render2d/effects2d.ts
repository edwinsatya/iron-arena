import {
  areaSpec,
  EV,
  EVENT_WINDOW,
  FS,
  projectileSpec,
  ROSTER,
  type GameState,
  type SimEvent,
} from '@iron-arena/sim';
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
import { keyed, type VfxSet } from './vfx';

/** Ikazuchi's areas, drawn by magisterArea (the pack's clips, or code without them). */
const MAGISTER_KINDS = new Set<string>(['arc', 'imprint', 'circuit', 'reversal', 'theorem']);
/** Rōga's crown and Mitsume's scan, signal and array (their packs' clips, or code without them). */
const NORTH_KINDS = new Set<string>(['crown', 'scan', 'signal', 'array']);
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
/** Frames Shinku's crimson beam takes to burst and fray away after it stops hitting. */
const BEAM_FADE = 14;

/* Clip timing from the packs' VFX updates: [frames since the effect landed, clip frame]. */
const PILLAR_KEYS = [
  [-3, 0],
  [0, 3],
  [3, 5],
  [20, 12],
  [36, 19.99],
] as const;
const RING_KEYS = [
  [0, 0],
  [4, 3],
  [10, 7],
  [28, 15],
  [34, 17.99],
] as const;
const METEOR_KEYS = [
  [0, 4],
  [4, 6],
  [12, 8],
  [30, 11.99],
] as const;
const BIG_METEOR_KEYS = [
  [0, 3],
  [34, 29],
  [50, 36.99],
] as const;
/** Frames the ring of fire burns: drawn in code, or the pack's clip (it plays longer). */
const RING_END = 20;
const RING_END_VFX = 34;

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
  /** Pixel-art effect clips by hero id (packs with a VFX update; see vfx.ts). */
  private vfx = new Map<string, VfxSet>();

  constructor(private cb: EffectCallbacks = {}) {}

  setVfx(id: string, set: VfxSet): void {
    this.vfx.set(id, set);
  }

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
        else if (w === 'gauntlet') this.smoke(e.x, '190, 40, 90');
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
        // The pack's rune circle opens where a meteor will land
        const fx = this.vfx.get('homura');
        if (fx && spec.kind === 'meteor' && spec.r < 1500)
          fx.draw(
            g,
            v,
            'Infernal_Cataclysm_Gothic',
            keyed(k, [
              [0, 1],
              [1, 3.99],
            ]),
            v.sx(a.x),
            v.sy(0),
            {
              size: spec.r / 1000,
              squash: 0.8,
            },
          );
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
      case 'laser': {
        // Mitsume's beams: a red streak with a white-hot core, a flare at the head
        g.rotate(ang);
        const big = spec.r >= 300;
        const len = v.px(big ? 2200 : 1300);
        const W = Math.max(3, r * (big ? 0.5 : 0.4));
        const glow = g.createLinearGradient(-len, 0, 0, 0);
        glow.addColorStop(0, hexA(look.color, 0));
        glow.addColorStop(1, hexA(look.color, 0.75));
        g.fillStyle = glow;
        g.shadowColor = look.color;
        g.shadowBlur = 16;
        g.beginPath();
        g.moveTo(0, -W);
        g.lineTo(-len, -W * 0.3);
        g.lineTo(-len, W * 0.3);
        g.lineTo(0, W);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        const core = g.createLinearGradient(-len * 0.8, 0, 0, 0);
        core.addColorStop(0, 'rgba(255, 255, 255, 0)');
        core.addColorStop(1, '#ffffff');
        g.fillStyle = core;
        g.fillRect(-len * 0.8, -W * 0.28, len * 0.8, W * 0.56);
        const head = g.createRadialGradient(0, 0, 0, 0, 0, W * 2.6);
        head.addColorStop(0, '#ffffff');
        head.addColorStop(0.35, hexA(look.color, 0.85));
        head.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = head;
        g.beginPath();
        g.arc(0, 0, W * 2.6 * (1 + 0.15 * Math.sin(this.time * 40 + p.age)), 0, TAU);
        g.fill();
        break;
      }
      case 'feather': {
        // Amane's feathers: white plumes with a gold quill, a streak of light behind them
        g.rotate(ang);
        const L = Math.max(14, r * 2.4);
        const tr = g.createLinearGradient(-L * 3, 0, 0, 0);
        tr.addColorStop(0, hexA(look.color, 0));
        tr.addColorStop(1, hexA(look.glow, 0.55));
        g.fillStyle = tr;
        g.beginPath();
        g.moveTo(0, -L * 0.18);
        g.lineTo(-L * 3, 0);
        g.lineTo(0, L * 0.18);
        g.fill();
        g.rotate(Math.sin(this.time * 18 + p.age * 0.7 + p.spec) * 0.18);
        g.shadowColor = look.color;
        g.shadowBlur = 10;
        g.fillStyle = '#fbf7ee';
        g.beginPath();
        g.moveTo(L * 0.55, 0);
        g.quadraticCurveTo(L * 0.1, -L * 0.32, -L * 0.6, -L * 0.12);
        g.lineTo(-L * 0.45, 0);
        g.lineTo(-L * 0.6, L * 0.12);
        g.quadraticCurveTo(L * 0.1, L * 0.3, L * 0.55, 0);
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = look.color;
        g.lineWidth = Math.max(1, L * 0.06);
        g.beginPath();
        g.moveTo(L * 0.5, 0);
        g.lineTo(-L * 0.75, 0);
        g.stroke();
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
      else if (spec.kind === 'void') {
        const fx = this.vfx.get(ROSTER[a.char]!.id);
        if (fx) this.voidFx(g, v, fx, a, spec, a.age - spec.delay, 'over');
      } else if (spec.kind === 'brand' || spec.kind === 'lock') {
        const l = LOOKS[ROSTER[a.char]!.id]!;
        const t = a.age / Math.max(1, spec.delay);
        const kfx = this.kemuriFx(a);
        if (spec.kind === 'brand' && kfx) this.kemuriArea(g, v, kfx, a, spec, a.age - spec.delay);
        else if (spec.kind === 'brand') this.reticle(g, v, a.x, spec.r, t, l.color);
        else this.polarity(g, v, a.x, spec.r, t, l.color, l.glow, false);
      } else if (MAGISTER_KINDS.has(spec.kind)) this.magisterArea(g, v, a, spec, a.age - spec.delay);
      else if (spec.kind === 'verdict' || spec.kind === 'halo') this.seraphArea(g, v, a, spec, a.age - spec.delay);
      else if (NORTH_KINDS.has(spec.kind)) this.northArea(g, v, a, spec, a.age - spec.delay);
      else if (spec.kind === 'beam') this.crimsonBeam(g, v, a, spec, a.age - spec.delay);
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
        // Absolute Zero's last blow: the vortex clip (renderer2d) bursts instead
        if (ROSTER[a.char]!.id === 'hyoshin' && spec.r >= 2000 && this.vfx.has('hyoshin')) break;
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
        const fx = this.vfx.get(ROSTER[a.char]!.id);
        if (fx) {
          g.save();
          g.globalAlpha = 1;
          this.voidFx(g, v, fx, a, spec, a.age - spec.delay, 'under');
          g.restore();
        }
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
        if (fx) {
          g.save();
          g.globalAlpha = 1;
          this.voidFx(g, v, fx, a, spec, a.age - spec.delay, 'over');
          g.restore();
        }
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
      case 'haze': {
        const kfx = this.kemuriFx(a);
        if (kfx) {
          g.globalAlpha = 1;
          this.kemuriArea(g, v, kfx, a, spec, a.age - spec.delay);
          break;
        }
        // Kurenai Smokescreen: a bank of crimson smoke, violet at its heart, rolling and thinning
        const u = a.age - spec.delay;
        const grow = 1 - (1 - Math.min(1, u / 12)) ** 2;
        const H = v.px(1700);
        for (let n = 0; n < 26; n++) {
          const drift = Math.sin(this.time * 0.8 + n * 1.9) * rx * 0.07;
          // Puff centres stay inside 3/4 of the radius so the cloud's edge is where it stops hurting
          const px = x + (hash(n * 1.3 + 4) - 0.5) * 1.5 * rx * grow + drift;
          const py = y0 - H * (0.08 + hash(n * 2.1 + 9) * 0.9) * grow - Math.sin(this.time * 0.6 + n) * 4;
          const pr = rx * (0.3 + hash(n * 3.7 + 2) * 0.24) * (0.6 + 0.4 * grow);
          const c = n % 3 === 0 ? look.glow : n % 3 === 1 ? look.color : '#5a1230';
          const puff = g.createRadialGradient(px, py, 0, px, py, pr);
          puff.addColorStop(0, hexA(c, n % 3 === 0 ? 0.42 : 0.66));
          puff.addColorStop(0.55, hexA(c, n % 3 === 0 ? 0.22 : 0.36));
          puff.addColorStop(1, hexA(c, 0));
          g.fillStyle = puff;
          g.beginPath();
          g.arc(px, py, pr, 0, TAU);
          g.fill();
        }
        smoke(g, x, y0 - H * 0.5, rx * 0.8, this.time, 7, look.glow, a.action);
        if (u < 8) starBurst(g, x, y0 - v.px(900), rx * 0.9, u / 8, look.color, look.glow, a.action);
        break;
      }
      case 'brand': {
        // Hibana Brand goes off: the mark flares white and throws cinders up
        const cy = y0 - v.px(1050);
        const kfx = this.kemuriFx(a);
        if (kfx) {
          g.save();
          g.globalAlpha = 1;
          this.kemuriArea(g, v, kfx, a, spec, a.age - spec.delay);
          g.restore();
        } else starBurst(g, x, cy, rx * 1.7, Math.min(1, k * 1.2), look.color, '#ffe9c0', a.action);
        const col = g.createLinearGradient(x - rx * 0.5, 0, x + rx * 0.5, 0);
        col.addColorStop(0, hexA(look.color, 0));
        col.addColorStop(0.5, hexA('#fff1d6', 0.8 * (1 - k)));
        col.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = col;
        g.fillRect(x - rx * 0.5, y0 - v.px(3000), rx, v.px(3000));
        embers(g, x, y0, rx * 1.8, v.px(2600), this.time, 16, '#ffc27a', a.action);
        break;
      }
      case 'lock': {
        // Jiryoku Polarity Lock snaps shut
        this.polarity(g, v, a.x, spec.r, k, look.color, look.glow, true);
        break;
      }
      case 'decoy': {
        // The mantle left behind tears itself apart
        const cy = y0 - v.px(950);
        starBurst(g, x, cy, rx * 1.2, Math.min(1, k * 1.3), look.color, look.glow, a.action);
        smoke(g, x, y0 - v.px(500), rx * 0.7, this.time, 8, '#5a2a78', a.action);
        embers(g, x, cy, rx * 1.8, v.px(1800), this.time, 14, look.color, a.action);
        break;
      }
      case 'seam': {
        const cy = y0 - v.px(1000);
        if (a.spec === 0) {
          // Shūen Last Circuit: every cut of the thrust opens again, one after another
          for (let q = 0; q < 3; q++) {
            const n = Math.floor(a.age / 4) * 3 + q;
            const life = (a.age % 4) / 4;
            g.save();
            g.translate(x + (hash(n * 1.7) - 0.5) * rx * 0.7, cy + (hash(n * 2.3) - 0.5) * v.px(1000));
            g.rotate((hash(n * 3.9) - 0.5) * 2.4);
            const L = rx * (1.1 + hash(n * 5.1) * 0.6);
            g.globalAlpha = Math.max(0, fade) * (1 - life * 0.7);
            g.shadowColor = look.color;
            g.shadowBlur = 14;
            for (const [w, c] of [
              [v.px(150), look.color],
              [v.px(60), '#ffffff'],
            ] as const) {
              g.fillStyle = c;
              g.beginPath();
              g.moveTo(-L, 0);
              g.quadraticCurveTo(0, -w * (1 - life), L, 0);
              g.quadraticCurveTo(0, w * (1 - life), -L, 0);
              g.fill();
            }
            g.restore();
          }
          embers(g, x, cy, rx * 1.6, v.px(2000), this.time, 12, look.glow, a.action);
        } else {
          // The last seam: the air splits from the floor up and the plasma pours out
          const open = Math.min(1, k * 2.5);
          const H = v.px(3600) * open;
          const W = rx * 0.3 * (1 - k * 0.6);
          g.shadowColor = look.color;
          g.shadowBlur = 24;
          for (const [w, c] of [
            [W, look.color],
            [W * 0.45, '#ffffff'],
          ] as const) {
            g.fillStyle = c;
            g.beginPath();
            g.moveTo(x, y0);
            for (let n = 1; n <= 8; n++)
              g.lineTo(x + (n % 2 ? -1 : 1) * w * (0.4 + hash(n * 2.9)) * (1 - n / 9), y0 - (H * n) / 8);
            for (let n = 7; n >= 1; n--)
              g.lineTo(x + (n % 2 ? -1 : 1) * w * (hash(n * 2.9) - 0.6) * (1 - n / 9), y0 - (H * n) / 8);
            g.closePath();
            g.fill();
          }
          g.shadowBlur = 0;
          starBurst(g, x, cy, rx * 1.3, Math.min(1, k * 1.4), look.color, look.glow, a.action);
          embers(g, x, y0, rx * 2, v.px(3200), this.time, 18, look.glow, a.action);
        }
        break;
      }
      case 'arc':
      case 'imprint':
      case 'circuit':
      case 'reversal':
      case 'theorem':
        g.globalAlpha = 1;
        this.magisterArea(g, v, a, spec, a.age - spec.delay);
        break;
      case 'verdict':
      case 'halo':
        this.seraphArea(g, v, a, spec, a.age - spec.delay);
        break;
      case 'crown':
      case 'scan':
      case 'signal':
      case 'array':
        g.globalAlpha = 1;
        this.northArea(g, v, a, spec, a.age - spec.delay);
        break;
      case 'beam':
        g.globalAlpha = 1;
        this.crimsonBeam(g, v, a, spec, a.age - spec.delay);
        break;
      case 'sanctuary':
        g.globalAlpha = 1;
        this.sanctuary(g, v, x, y0, rx, a.age - spec.delay, spec.active, look.color, look.glow);
        break;
      case 'gate':
        g.globalAlpha = 1;
        this.voidGate(g, v, x, y0, rx, k, a.age, look.color, look.glow);
        break;
      case 'umbra': {
        // Umbral Triad: a ring of the dark under the circling orbs, motes drifting up
        g.globalAlpha = Math.max(0, fade);
        const glow = g.createRadialGradient(x, y0, 0, x, y0, rx);
        glow.addColorStop(0, hexA('#1a0b26', 0.7));
        glow.addColorStop(0.7, hexA(look.color, 0.25));
        glow.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = glow;
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.2, 0, 0, TAU);
        g.fill();
        g.strokeStyle = hexA(look.color, 0.85);
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(x, y0, rx * 0.85, rx * 0.17, 0, a.age * 0.12, a.age * 0.12 + 4.6);
        g.stroke();
        embers(g, x, y0, rx * 1.4, v.px(1800), this.time, 14, look.glow, a.age);
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
        const kfx = spec.kind === 'burst' ? this.kemuriFx(a) : undefined;
        if (kfx) {
          // Imawa Last Breath: the cage around them shatters
          g.globalAlpha = 1;
          this.kemuriArea(g, v, kfx, a, spec, a.age - spec.delay);
          embers(g, x, y0 - v.px(400), rx * 1.6, v.px(1600), this.time, 14, look.glow, a.age);
          break;
        }
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

  /**
   * Tekkan's Iron Sanctuary: a dome of golden light over the floor (`u` frames since it rose, out
   * of `life`), bands of light climbing it and motes drifting inside.
   */
  private sanctuary(
    g: CanvasRenderingContext2D,
    v: View2D,
    x: number,
    y0: number,
    rx: number,
    u: number,
    life: number,
    color: string,
    glow: string,
  ) {
    const grow = 1 - (1 - Math.min(1, u / 10)) ** 3;
    const alpha = Math.min(1, (life - u) / 20);
    if (alpha <= 0) return;
    const R = rx * grow;
    const H = R * 1.05;
    g.save();
    g.globalAlpha = alpha;
    // The dome
    const body = g.createLinearGradient(0, y0 - H, 0, y0);
    body.addColorStop(0, hexA(glow, 0.32));
    body.addColorStop(0.6, hexA(color, 0.14));
    body.addColorStop(1, hexA(color, 0.3));
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(x, y0, R, H, 0, Math.PI, TAU);
    g.ellipse(x, y0, R, R * 0.18, 0, 0, Math.PI);
    g.fill();
    g.strokeStyle = hexA(glow, 0.85);
    g.lineWidth = Math.max(2, v.px(40));
    g.beginPath();
    g.ellipse(x, y0, R, H, 0, Math.PI, TAU);
    g.stroke();
    // A shine down the left of the dome
    g.strokeStyle = hexA('#ffffff', 0.35);
    g.lineWidth = Math.max(2, v.px(70));
    g.beginPath();
    g.ellipse(x, y0, R * 0.8, H * 0.86, 0, Math.PI * 1.15, Math.PI * 1.4);
    g.stroke();
    // Bands of light climbing the dome
    for (let n = 0; n < 3; n++) {
      const h = (((u / 70 + n / 3) % 1) * 0.9 + 0.05) * H;
      const w = R * Math.sqrt(Math.max(0, 1 - (h / H) ** 2));
      g.strokeStyle = hexA(color, 0.75 * (1 - h / H));
      g.lineWidth = Math.max(1.5, v.px(30));
      g.beginPath();
      g.ellipse(x, y0 - h, w, w * 0.18, 0, 0, TAU);
      g.stroke();
    }
    // The floor ring
    g.strokeStyle = hexA(color, 0.9);
    g.lineWidth = Math.max(2, v.px(45));
    g.beginPath();
    g.ellipse(x, y0, R, R * 0.18, 0, 0, TAU);
    g.stroke();
    embers(g, x, y0, R * 1.6, H, this.time, 16, glow, Math.floor(u / 40));
    g.restore();
  }

  /**
   * Kuon's void gate: an upright ring of violet fire around a whirling dark, opening fast and
   * breaking into shards as it closes (k = 0 → 1 over its active frames).
   */
  private voidGate(
    g: CanvasRenderingContext2D,
    v: View2D,
    x: number,
    y0: number,
    rx: number,
    k: number,
    age: number,
    color: string,
    glow: string,
  ) {
    const open = 1 - (1 - Math.min(1, k * 4)) ** 3;
    const close = Math.max(0, (k - 0.55) / 0.45);
    const w = rx * 0.42 * open * (1 - close * 0.7);
    const h = rx * 1.05 * open;
    const cy = y0 - rx * 1.1;
    g.save();
    g.globalAlpha = 1 - close;
    // The dark inside, whirling
    const dark = g.createRadialGradient(x, cy, 0, x, cy, Math.max(1, h));
    dark.addColorStop(0, hexA('#05010a', 0.95));
    dark.addColorStop(0.7, hexA('#1a0b26', 0.9));
    dark.addColorStop(1, hexA(color, 0.5));
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(x, cy, Math.max(1, w), Math.max(1, h), 0, 0, TAU);
    g.fill();
    g.strokeStyle = hexA(color, 0.7);
    g.lineWidth = Math.max(1.5, v.px(30));
    for (let n = 0; n < 3; n++) {
      const t0 = age * 0.25 + n * 2.1;
      g.beginPath();
      g.ellipse(x, cy, Math.max(1, w * (0.35 + n * 0.2)), Math.max(1, h * (0.35 + n * 0.2)), 0, t0, t0 + 2.4);
      g.stroke();
    }
    // The burning rim
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.strokeStyle = glow;
    g.lineWidth = Math.max(2, v.px(60));
    g.beginPath();
    g.ellipse(x, cy, Math.max(1, w), Math.max(1, h), 0, 0, TAU);
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = hexA(color, 0.9);
    g.lineWidth = Math.max(2, v.px(110));
    g.globalAlpha *= 0.5;
    g.stroke();
    g.restore();
    // Breaking apart: shards flung out of the rim
    if (close > 0) {
      g.save();
      for (let n = 0; n < 14; n++) {
        const ang = hash(n * 2.7) * TAU;
        const d = rx * (0.4 + close * 1.1) * (0.6 + hash(n * 5.1) * 0.6);
        g.globalAlpha = 1 - close;
        g.fillStyle = n % 2 ? color : '#1a0b26';
        g.save();
        g.translate(x + Math.cos(ang) * d * 0.6, cy + Math.sin(ang) * d);
        g.rotate(ang + close * 4);
        g.fillRect(-v.px(60), -v.px(25), v.px(120), v.px(50));
        g.restore();
      }
      g.restore();
    }
    g.save();
    g.globalAlpha = 1 - close;
    g.fillStyle = hexA(color, 0.3);
    g.beginPath();
    g.ellipse(x, y0, rx * 0.6 * open, rx * 0.11 * open, 0, 0, TAU);
    g.fill();
    g.restore();
    embers(g, x, cy + h, w * 2.5, h * 2, this.time, 12, glow, age);
  }

  /** Hibana Brand taking aim: brackets close on the enemy's chest around a four-pointed star. */
  private reticle(g: CanvasRenderingContext2D, v: View2D, wx: number, r: number, k: number, color: string) {
    const R = v.px(r) * (1.9 - 1.1 * k);
    g.save();
    g.translate(v.sx(wx), v.sy(1050));
    g.strokeStyle = hexA(color, 0.45 + 0.55 * k);
    g.lineWidth = Math.max(2, v.px(45));
    g.lineCap = 'round';
    g.save();
    g.rotate(k * Math.PI * 0.75);
    for (let q = 0; q < 4; q++) {
      g.rotate(TAU / 4);
      g.beginPath();
      g.arc(0, 0, R, -0.45, 0.45);
      g.stroke();
      g.beginPath();
      g.moveTo(R * 1.08, 0);
      g.lineTo(R * 1.3, 0);
      g.stroke();
    }
    g.restore();
    // The brand itself: a star that fills in as it locks, blinking faster at the end
    const blink = k > 0.6 ? 0.6 + 0.4 * Math.sin(this.time * 50) : 1;
    const S = R * (0.3 + 0.35 * k);
    g.fillStyle = hexA('#fff1d6', (0.35 + 0.6 * k) * blink);
    g.shadowColor = color;
    g.shadowBlur = 16;
    g.beginPath();
    for (let n = 0; n < 8; n++) {
      const rr = n % 2 ? S * 0.2 : S;
      g[n ? 'lineTo' : 'moveTo'](Math.cos((n / 8) * TAU) * rr, Math.sin((n / 8) * TAU) * rr);
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  /** Jiryoku Polarity Lock: magnetic rings spin in on the enemy (k 0 → 1), then snap shut. */
  private polarity(
    g: CanvasRenderingContext2D,
    v: View2D,
    wx: number,
    r: number,
    k: number,
    color: string,
    glow: string,
    shut: boolean,
  ) {
    const x = v.sx(wx);
    const y = v.sy(1000);
    const R = v.px(r) * (shut ? 1.05 - 0.2 * k : 2.6 - 1.55 * k);
    g.save();
    g.translate(x, y);
    if (shut) {
      const flash = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.6);
      flash.addColorStop(0, hexA('#ffffff', 0.8 * (1 - k)));
      flash.addColorStop(0.4, hexA(color, 0.4 * (1 - k)));
      flash.addColorStop(1, hexA(color, 0));
      g.fillStyle = flash;
      g.beginPath();
      g.arc(0, 0, R * 1.6, 0, TAU);
      g.fill();
    }
    g.shadowColor = color;
    g.shadowBlur = shut ? 18 : 8;
    for (let n = 0; n < 3; n++) {
      g.save();
      g.rotate((n * TAU) / 6 + (shut ? 0 : this.time * 4 * (n % 2 ? 1 : -1)));
      g.strokeStyle = hexA(n === 1 ? glow : color, shut ? 1 : 0.3 + 0.65 * k);
      g.lineWidth = Math.max(2, v.px(shut ? 80 : 50));
      g.beginPath();
      g.ellipse(0, 0, R, R * 0.36, 0, 0, TAU);
      g.stroke();
      g.restore();
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
    const fx = this.vfx.get('homura');
    if (fx) {
      // The pack's Inferno Pillar on a glowing pool, rocks and embers thrown up around it
      firePool(g, x, y0, rx * 1.15, this.time, a * 0.8, seed);
      fx.draw(g, v, 'Inferno_Pillar', keyed(u, PILLAR_KEYS), x, y0, { size: r / 700 });
      rocks(g, x, y0, rx * 1.5, v.px(big ? 2600 : 1800), v.px(big ? 80 : 60), u / 30, big ? 9 : 6, seed);
      embers(g, x, y0 - v.px(300), rx * 2, v.px(3000), this.time, 12, '#ffd27a', seed);
      return;
    }
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
    const x = v.sx(wx);
    const fx = this.vfx.get('homura');
    if (fx) {
      // The pack's Protective Fire Ring, flattened onto the floor: far half behind her
      if (u >= RING_END_VFX) return;
      fx.draw(g, v, 'Protective_Fire_Ring', keyed(u, RING_KEYS), x, v.sy(0), {
        size: r / 1270,
        squash: 0.5,
        ...(part === 'all' ? {} : { part }),
      });
      if (part === 'back') return;
      shockRing(g, x, v.sy(0), v.px(r) * 1.1, Math.min(1, u / 16));
      embers(g, x, v.sy(0), v.px(r) * 2, v.px(1600), this.time, 10, '#ffd27a', seed);
      return;
    }
    const die = Math.min(1, Math.max(0, (u - 6) / (RING_END - 6)));
    if (die >= 1) return;
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
    const fx = this.vfx.get('homura');
    if (fx) {
      // Infernal Cataclysm: a burst of flame for each meteor, a firestorm for the big one
      firePool(g, x, y0, rx * 1.1, this.time, a * 0.8, seed);
      if (big) fx.draw(g, v, 'Infernal_Cataclysm_Area', keyed(u, BIG_METEOR_KEYS), x, y0, { size: r / 1300 });
      else
        fx.draw(g, v, 'Infernal_Cataclysm_Gothic', keyed(u, METEOR_KEYS), x, y0, {
          size: r / 1000,
          squash: 0.8,
        });
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
        big ? 18 : 10,
        '#ffd27a',
        seed,
      );
      return;
    }
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

  /** Track areas between frames: when one of Homura's (or Yomi's void) ends, it burns on for a moment. */
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
          ? this.vfx.has('homura')
            ? RING_END_VFX
            : RING_END
          : spec.kind === 'meteor'
            ? spec.r >= 1500
              ? 50
              : 30
            : spec.kind === 'void' && this.vfx.has(ROSTER[a.char]!.id)
              ? spec.active + 12
              : (spec.kind === 'brand' || spec.kind === 'burst') && this.kemuriFx(a)
                ? spec.active + 10
                : MAGISTER_KINDS.has(spec.kind) || NORTH_KINDS.has(spec.kind) || spec.kind === 'halo'
                  ? spec.active + 12
                  : spec.kind === 'beam'
                    ? spec.active + BEAM_FADE
                    : 0;
    if (to <= from) return;
    this.fx.push({
      age: 0,
      life: (to - from) / 60,
      draw: (g, v, k) => {
        const u = from + k * (to - from);
        if (spec.kind === 'pillar') this.firePillar(g, v, a.x, spec.r, u, seed);
        else if (spec.kind === 'brand' || spec.kind === 'burst') {
          const fx = this.kemuriFx(a);
          if (fx) this.kemuriArea(g, v, fx, a, spec, u);
        } else if (spec.kind === 'void') {
          const fx = this.vfx.get(ROSTER[a.char]!.id);
          if (fx) {
            this.voidFx(g, v, fx, a, spec, u, 'under');
            this.voidFx(g, v, fx, a, spec, u, 'over');
          }
        } else if (spec.kind === 'firering') this.flameRing(g, v, a.x, spec.r, u, 'all', seed);
        else if (MAGISTER_KINDS.has(spec.kind)) this.magisterArea(g, v, a, spec, u);
        else if (spec.kind === 'halo') this.seraphArea(g, v, a, spec, u);
        else if (NORTH_KINDS.has(spec.kind)) this.northArea(g, v, a, spec, u);
        else if (spec.kind === 'beam') this.crimsonBeam(g, v, a, spec, u);
        else this.meteorBlast(g, v, a.x, spec.r, u, seed);
      },
    });
  }

  /* ---------------------------------------------------- Kemuri's smoke (the pack's VFX clips) */

  /** Kemuri's clips, for an area of hers. */
  private kemuriFx(a: GameState['areas'][number]): VfxSet | undefined {
    return ROSTER[a.char]!.id === 'kemuri' ? this.vfx.get('kemuri') : undefined;
  }

  /**
   * Hibana Brand: marks converge on the enemy's chest into a blinking star that bursts.
   * Kurenai Smokescreen: a canister drops, smoke rings out and banks up, rolls, then thins away.
   * Imawa Last Breath's last blow: the cage around the target flares and shatters.
   * `u` frames since the area went live (negative while it gathers).
   */
  private kemuriArea(
    g: CanvasRenderingContext2D,
    v: View2D,
    fx: VfxSet,
    a: GameState['areas'][number],
    spec: ReturnType<typeof areaSpec>,
    u: number,
  ) {
    const x = v.sx(a.x);
    const y0 = v.sy(0);
    const end = spec.active;
    if (spec.kind === 'brand') {
      const f =
        u < 0
          ? keyed(u, [
              [-spec.delay, 0],
              [0, 9.99],
            ])
          : keyed(u, [
              [0, 10],
              [4, 13],
              [end + 10, 17.99],
            ]);
      fx.draw(g, v, 'Cindertrace_Brand', f, x, y0 - v.px(1050), { size: spec.r / 750 });
    } else if (spec.kind === 'haze') {
      // Rolls back and forth through its densest frames while it lasts
      const roll = [13, 14, 15, 16, 17, 18, 17, 16, 15, 14];
      const f =
        u < 12
          ? keyed(u, [
              [-spec.delay, 0],
              [0, 1],
              [12, 13],
            ])
          : u < end - 24
            ? roll[Math.floor((u - 12) / 6) % roll.length]!
            : keyed(u, [
                [end - 24, 19],
                [end, 27.99],
              ]);
      // A little see-through, so whoever is inside never quite disappears
      fx.draw(g, v, 'Crimson_Smokescreen_Order', f, x, y0, { size: spec.r / 1450, alpha: 0.82 });
    } else if (spec.kind === 'burst' && u >= 0) {
      fx.draw(
        g,
        v,
        'Last_Breath_Protocol',
        keyed(u, [
          [0, 12],
          [4, 14],
          [end + 10, 20.99],
        ]),
        x,
        y0 - v.px(1000),
        {
          size: spec.r / 1150,
        },
      );
    }
  }

  /* ------------------------------------------- Ikazuchi's lightning (the pack's VFX clips) */

  /**
   * Arc Discharge: amber darts fly out from the rod. Charge Imprint: the sigil writes itself on
   * the enemy's chest, then discharges. Circuit Relay: bolts keep striking the ground around him.
   * Polarity Reversal: the grounded blow comes back as a burst. Resonance Theorem: a rune circle
   * over the enemy, bolts on every hit, then it rings out. `u` frames since the area went live.
   * Without the pack's clips the same moments are drawn in code.
   */
  private magisterArea(
    g: CanvasRenderingContext2D,
    v: View2D,
    a: GameState['areas'][number],
    spec: ReturnType<typeof areaSpec>,
    u: number,
  ) {
    const fx = this.vfx.get(ROSTER[a.char]!.id);
    const look = LOOKS[ROSTER[a.char]!.id]!;
    const x = v.sx(a.x);
    const y0 = v.sy(0);
    const cy = v.sy(1050);
    const rx = v.px(spec.r);
    const end = spec.active;
    const out = Math.max(0, 1 - Math.max(0, u - end) / 12);
    g.save();
    switch (spec.kind) {
      case 'arc': {
        if (u < 0) break;
        const f = keyed(u, [
          [0, 2],
          [end + 12, 13.99],
        ]);
        if (fx) fx.draw(g, v, 'Outward_Projectiles', f, x, cy, { size: spec.r / 950 });
        else if (u < end) starBurst(g, x, cy, rx * 1.2, Math.min(1, u / end), look.color, look.glow, a.action);
        if (u < end)
          for (let q = 0; q < 3; q++) {
            const ang = hash(q * 2.7 + a.age) * TAU;
            lightning(g, x, cy, x + Math.cos(ang) * rx, cy + Math.sin(ang) * rx * 0.7, 1.4, this.time, look.color, q + a.age);
          }
        break;
      }
      case 'imprint': {
        const f =
          u < 0
            ? keyed(u, [
                [-spec.delay, 3],
                [0, 13.99],
              ])
            : keyed(u, [
                [0, 14],
                [3, 15],
                [end + 12, 19.99],
              ]);
        if (fx) fx.draw(g, v, 'Distant_Target', f, x, cy, { size: spec.r / 600 });
        else if (u < 0) this.reticle(g, v, a.x, spec.r, 1 + u / Math.max(1, spec.delay), look.color);
        else if (u < end) starBurst(g, x, cy, rx * 1.4, Math.min(1, u / end), look.color, look.glow, a.action);
        // The sigil discharges: a bolt from above into it
        if (u >= 0 && u < end + 2) {
          g.globalAlpha = out;
          lightning(g, x + rx * 0.2, cy - v.px(2600), x, cy, 3, this.time, look.color, a.age);
          lightning(g, x - rx * 0.1, cy - v.px(2200), x, cy, 1.6, this.time + 0.3, '#ffffff', a.age + 5);
        }
        break;
      }
      case 'circuit': {
        if (u < 0) break;
        const fade = u < end ? 1 : out;
        if (fx) {
          // The bolts flicker through the clip for as long as the relay holds
          const f = u < end ? (u * 0.75) % 17 : keyed(u - end, [
            [0, 14],
            [12, 17.99],
          ]);
          g.globalAlpha = fade;
          fx.draw(g, v, 'Stationary_Area', f, x - rx * 0.45, y0, { size: spec.r / 1900 });
          fx.draw(g, v, 'Stationary_Area', (f + 7) % 17, x + rx * 0.45, y0, { size: spec.r / 1900, flip: true });
        } else if (u < end) {
          for (let q = 0; q < 3; q++) {
            const bx = x + (hash(q * 3.1 + Math.floor(u / 3)) - 0.5) * rx * 1.6;
            lightning(g, bx, y0 - v.px(2800), bx, y0, 3, this.time, look.color, q + a.age);
          }
        }
        // The circuit's ring on the floor
        g.globalAlpha = 0.8 * fade;
        g.strokeStyle = look.color;
        g.lineWidth = 3;
        g.shadowColor = look.color;
        g.shadowBlur = 12;
        g.beginPath();
        g.ellipse(x, y0, rx, rx * 0.16, 0, 0, TAU);
        g.stroke();
        g.shadowBlur = 0;
        embers(g, x, y0, rx * 1.6, v.px(1800), this.time, 12, look.glow, a.action);
        break;
      }
      case 'reversal': {
        if (u < 0) break;
        const f = keyed(u, [
          [0, 3],
          [4, 8],
          [end + 12, 23.99],
        ]);
        if (fx) fx.draw(g, v, 'Defensive_Counter', f, x, cy, { size: spec.r / 1250 });
        else if (u < end) starBurst(g, x, cy, rx * 1.3, Math.min(1, u / end), look.color, look.glow, a.action);
        break;
      }
      case 'theorem': {
        const last = a.spec === 1;
        const size = spec.r / 1550;
        const ccy = v.sy(1150);
        let f: number;
        if (u < 0) f = keyed(u, [
          [-spec.delay, last ? 11 : 2],
          [0, last ? 12 : 4],
        ]);
        else if (!last) f = u < end ? 4 + (Math.floor(u / 3) % 8) : keyed(u - end, [
          [0, 16],
          [12, 19.99],
        ]);
        else f = keyed(u, [
          [0, 12],
          [3, 13],
          [8, 15],
          [end + 12, 19.99],
        ]);
        if (fx) fx.draw(g, v, 'Area_Ultimate', f, x, ccy, { size });
        else {
          g.globalAlpha = out;
          g.strokeStyle = look.color;
          g.lineWidth = 4;
          g.shadowColor = look.color;
          g.shadowBlur = 16;
          for (const rr of [1, 0.75]) {
            g.beginPath();
            g.arc(x, ccy, rx * rr * (last && u >= 0 ? 1 + u / 20 : 1), 0, TAU);
            g.stroke();
          }
          g.shadowBlur = 0;
        }
        // A bolt from the sky on every hit, a storm of them on the proof
        if (u >= 0 && u < end) {
          g.globalAlpha = 1;
          const n = last ? 4 : 1;
          const tick = spec.every ? u % spec.every : u;
          if (last || tick < 4)
            for (let q = 0; q < n; q++) {
              const bx = x + (q - (n - 1) / 2) * rx * 0.4 + (hash(a.age + q) - 0.5) * rx * 0.3;
              lightning(g, bx, v.sy(4200), x, ccy, last ? 4 : 2.6, this.time, look.color, a.age + q);
              lightning(g, bx, v.sy(4200), x, ccy, 1.2, this.time + 0.2, '#ffffff', a.age + q + 7);
            }
          if (last) starBurst(g, x, ccy, rx * 1.5, Math.min(1, u / end), look.color, '#ffffff', a.action);
        }
        break;
      }
    }
    g.restore();
  }

  /* -------------------------------- Rōga's crown and Mitsume's lenses (the packs' VFX clips) */

  /**
   * Crown of Endless Winter: ice spikes break the floor under the enemy and a crown of crystal
   * closes round them, holding through the hits; on the last it bursts white and sinks away.
   * Tri-Lens Lock: a reticle closes on the target's chest, goes solid, and the strike flashes.
   * Signal Burst: rings of red signal race out over the floor. Surveillance Array: panels box the
   * target in, flaring each time the lenses fire, and slam shut on the last hit.
   * `u` frames since the area went live (negative while it gathers). Without the clips the same
   * moments are drawn in code.
   */
  private northArea(
    g: CanvasRenderingContext2D,
    v: View2D,
    a: GameState['areas'][number],
    spec: ReturnType<typeof areaSpec>,
    u: number,
  ) {
    const fx = this.vfx.get(ROSTER[a.char]!.id);
    const look = LOOKS[ROSTER[a.char]!.id]!;
    const x = v.sx(a.x);
    const y0 = v.sy(0);
    const cy = v.sy(1000);
    const rx = v.px(spec.r);
    const end = spec.active;
    const out = Math.max(0, 1 - Math.max(0, u - end) / 12);
    const last = a.spec === 1;
    g.save();
    switch (spec.kind) {
      case 'crown': {
        let f: number;
        if (u < 0)
          f = last
            ? 12
            : keyed(u, [
                [-spec.delay, 0],
                [0, 3.99],
              ]);
        else if (!last) f = u < 6 ? keyed(u, [
          [0, 4],
          [6, 9.99],
        ]) : 10 + (Math.floor((u - 6) / 3) % 20);
        else
          f = keyed(u, [
            [0, 5],
            [3, 8],
            [6, 10],
            [end + 12, 33.99],
          ]);
        if (fx) {
          g.globalAlpha = (last ? 1 : out) * 0.92;
          fx.draw(g, v, 'Crown_of_the_Endless_Winter', f, x, y0, { size: spec.r / 1300 });
        } else {
          // Spikes of ice in a ring, the tallest at the back
          const rise = u < 0 ? 0.3 * (1 + u / Math.max(1, spec.delay)) : Math.min(1, 0.3 + u / 6);
          g.globalAlpha = last ? Math.max(0, 1 - Math.max(0, u - end) / 12) : out;
          for (let i = -3; i <= 3; i++) {
            const sx = x + (i / 3) * rx * 0.8;
            const h = v.px(700 + (3 - Math.abs(i)) * 240) * rise;
            g.fillStyle = i % 2 ? '#bfefff' : '#e8fbff';
            g.strokeStyle = '#4aa8e0';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(sx - v.px(160), y0);
            g.lineTo(sx, y0 - h);
            g.lineTo(sx + v.px(160), y0);
            g.closePath();
            g.fill();
            g.stroke();
          }
        }
        // The crown bursts on the verdict
        if (last && u >= 0 && u < end) {
          g.globalAlpha = 1;
          starBurst(g, x, v.sy(1100), rx * 1.4, Math.min(1, u / end), look.color, '#ffffff', a.action);
        }
        if (u >= 0) embers(g, x, y0, rx * 1.4, v.px(2200), this.time, 12, look.glow, a.action + a.spec);
        break;
      }
      case 'scan': {
        const size = spec.r / 500;
        const f =
          u < 0
            ? keyed(u, [
                [-spec.delay, 3.5],
                [0, 9.99],
              ])
            : keyed(u, [
                [0, 10],
                [2, 11],
                [end + 12, 15.99],
              ]);
        if (fx) fx.draw(g, v, 'Recon_Sensor_Calibration', f, x, cy, { size });
        else if (u < 0) this.reticle(g, v, a.x, spec.r, 1 + u / Math.max(1, spec.delay), look.color);
        // The strike: three beams from on high meet at the mark
        if (u >= 0 && u < end + 3) {
          g.globalAlpha = out;
          g.strokeStyle = look.color;
          g.shadowColor = look.color;
          g.shadowBlur = 14;
          for (let q = -1; q <= 1; q++) {
            g.lineWidth = q ? 3 : 6;
            g.beginPath();
            g.moveTo(x + q * rx * 1.6, v.sy(4200));
            g.lineTo(x, cy);
            g.stroke();
          }
          g.shadowBlur = 0;
          starBurst(g, x, cy, rx * 1.1, Math.min(1, u / Math.max(1, end)), look.color, '#ffffff', a.action);
        }
        break;
      }
      case 'signal': {
        if (u < 0) break;
        // Three rings of signal racing out over the floor, a flash at the core
        for (let q = 0; q < 3; q++) {
          const k = (u - q * 3) / (end + 8);
          if (k <= 0 || k >= 1) continue;
          g.globalAlpha = (1 - k) * 0.9;
          g.strokeStyle = q === 1 ? '#ffffff' : look.color;
          g.lineWidth = 4 - q;
          g.shadowColor = look.color;
          g.shadowBlur = 12;
          g.beginPath();
          g.ellipse(x, y0 - v.px(300), rx * (0.25 + 0.95 * k), rx * (0.25 + 0.95 * k) * 0.3, 0, 0, TAU);
          g.stroke();
        }
        g.shadowBlur = 0;
        if (u < end) {
          g.globalAlpha = 1;
          starBurst(g, x, v.sy(600), rx * 0.7, Math.min(1, u / end), look.color, look.glow, a.action);
          for (let q = 0; q < 4; q++) {
            const ang = hash(q * 1.9 + a.age) * TAU;
            lightning(g, x, v.sy(600), x + Math.cos(ang) * rx, v.sy(600) + Math.sin(ang) * rx * 0.3, 1.4, this.time, look.color, q + a.age);
          }
        }
        break;
      }
      case 'array': {
        const size = spec.r / 1300;
        const tick = spec.every ? u % spec.every : u;
        let f: number;
        if (u < 0) f = last ? 10 : keyed(u, [
          [-spec.delay, 0],
          [0, 2],
        ]);
        else if (!last) f = u < end ? (tick < 4 ? 5 + tick : 1 + (Math.floor(u / 3) % 4)) : 3;
        else f = keyed(u, [
          [0, 11],
          [3, 12],
          [end + 12, 13.99],
        ]);
        if (fx) {
          g.globalAlpha = last ? 1 : out;
          fx.draw(g, v, 'Surveillance_Dominion_Array', f, x, y0, { size });
        } else {
          // Six red panels standing round the target
          g.globalAlpha = last ? Math.max(0, 1 - u / (end + 12)) : out;
          g.fillStyle = hexA(look.color, 0.75);
          g.strokeStyle = '#1a1018';
          g.lineWidth = 2;
          for (let q = 0; q < 6; q++) {
            const px = x + Math.cos((q / 6) * TAU) * rx * 0.85;
            const ph = v.px(1500) * (0.7 + 0.3 * Math.abs(Math.sin((q / 6) * TAU)));
            g.fillRect(px - v.px(150), y0 - ph - v.px(300), v.px(300), ph);
            g.strokeRect(px - v.px(150), y0 - ph - v.px(300), v.px(300), ph);
          }
        }
        // Every lens fires at the target
        if (u >= 0 && u < end && (last || tick < 3)) {
          g.globalAlpha = 1;
          g.strokeStyle = look.color;
          g.shadowColor = look.color;
          g.shadowBlur = 12;
          const n = last ? 6 : 3;
          for (let q = 0; q < n; q++) {
            const ang = (q / n) * TAU + a.age * 0.3;
            g.lineWidth = last ? 4 : 2.5;
            g.beginPath();
            g.moveTo(x + Math.cos(ang) * rx * 0.9, cy - v.px(500) + Math.sin(ang) * rx * 0.45);
            g.lineTo(x, cy);
            g.stroke();
          }
          g.shadowBlur = 0;
          if (last) starBurst(g, x, cy, rx * 1.5, Math.min(1, u / end), look.color, '#ffffff', a.action);
        }
        break;
      }
    }
    g.restore();
  }

  /* ------------------------------------------------------------- Amane's light (code-drawn) */

  /**
   * Sunspoke Verdict: a sun wheel turns over the enemy, then a spoke of light comes down.
   * Unbroken Halo: a halo sinks around the enemy and spins, burning, then shatters outward.
   */
  /**
   * Shinku's lance of crimson light (`u` frames after it can hit; negative = telegraph): a seal
   * glows on the floor under the spot, then the pack's beam comes down on it, bursts at its foot
   * and frays away. Drawn in code without the clip.
   */
  private crimsonBeam(
    g: CanvasRenderingContext2D,
    v: View2D,
    a: GameState['areas'][number],
    spec: ReturnType<typeof areaSpec>,
    u: number,
  ) {
    const fx = this.vfx.get(ROSTER[a.char]!.id);
    const look = LOOKS[ROSTER[a.char]!.id]!;
    const x = v.sx(a.x);
    const y0 = v.sy(0);
    const rx = v.px(spec.r);
    const end = spec.active;
    g.save();
    if (u < 0) {
      // The seal under the spot, and a thread of light finding it from above
      const k = 1 + u / Math.max(1, spec.delay);
      g.strokeStyle = hexA(look.color, 0.35 + 0.55 * k);
      g.lineWidth = 3;
      g.shadowColor = look.color;
      g.shadowBlur = 12;
      g.beginPath();
      g.ellipse(x, y0, rx * (0.4 + 0.6 * k), rx * 0.18 * (0.4 + 0.6 * k), 0, 0, TAU);
      g.stroke();
      g.fillStyle = hexA(look.color, 0.12 + 0.18 * k);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = hexA(look.glow, 0.15 + 0.45 * k);
      const w = Math.max(2, rx * 0.06 * k);
      g.fillRect(x - w / 2, 0, w, y0);
      g.restore();
      return;
    }
    const alpha = Math.max(0, 1 - Math.max(0, u - end) / BEAM_FADE);
    if (fx && fx.count('Crimson_Beam')) {
      // Down (frames 0–2) while it can hit, then the burst at its foot and the fade
      const f = keyed(u, [
        [0, 0],
        [end, 2.99],
        [end + 4, 3],
        [end + BEAM_FADE, 4.99],
      ]);
      fx.draw(g, v, 'Crimson_Beam', f, x, y0, { size: spec.r / 900 });
    } else {
      const w = rx * (u < end ? 0.9 : 0.9 * alpha);
      const gr = g.createLinearGradient(x - w, 0, x + w, 0);
      gr.addColorStop(0, hexA(look.color, 0));
      gr.addColorStop(0.3, hexA(look.color, 0.85 * alpha));
      gr.addColorStop(0.5, hexA('#ffffff', 0.95 * alpha));
      gr.addColorStop(0.7, hexA(look.color, 0.85 * alpha));
      gr.addColorStop(1, hexA(look.color, 0));
      g.fillStyle = gr;
      g.fillRect(x - w, 0, w * 2, y0);
      g.fillStyle = hexA(look.color, 0.5 * alpha);
      g.beginPath();
      g.ellipse(x, y0, rx, rx * 0.2, 0, 0, TAU);
      g.fill();
    }
    if (u < end) starBurst(g, x, y0 - v.px(200), rx * 1.2, Math.min(1, u / end), look.color, '#ffffff', a.action);
    embers(g, x, y0, rx * 1.4, v.px(2600), this.time, 12, look.glow, a.action + a.spec);
    g.restore();
  }

  private seraphArea(
    g: CanvasRenderingContext2D,
    v: View2D,
    a: GameState['areas'][number],
    spec: ReturnType<typeof areaSpec>,
    u: number,
  ) {
    const look = LOOKS[ROSTER[a.char]!.id]!;
    const x = v.sx(a.x);
    const y0 = v.sy(0);
    const rx = v.px(spec.r);
    const end = spec.active;
    g.save();
    if (spec.kind === 'verdict') {
      const wy = v.sy(3000);
      const k = u < 0 ? 1 + u / Math.max(1, spec.delay) : 1;
      // The wheel overhead, its spokes lighting one by one
      const W = rx * 0.55;
      g.globalAlpha = u < 0 ? 0.4 + 0.6 * k : Math.max(0, 1 - u / (end + 4));
      g.translate(x, wy);
      g.rotate(this.time * 1.5 + a.spec);
      g.strokeStyle = look.color;
      g.lineWidth = 3;
      g.shadowColor = look.color;
      g.shadowBlur = 14;
      g.beginPath();
      g.arc(0, 0, W, 0, TAU);
      g.stroke();
      for (let n = 0; n < 8; n++) {
        if (n / 8 > k) break;
        const ang = (n / 8) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(ang) * W * 0.25, Math.sin(ang) * W * 0.25);
        g.lineTo(Math.cos(ang) * W * 1.45, Math.sin(ang) * W * 1.45);
        g.stroke();
      }
      g.restore();
      g.save();
      if (u < 0) {
        // A thin guide line to the spot
        g.strokeStyle = hexA(look.glow, 0.25 + 0.4 * k);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, wy);
        g.lineTo(x, y0);
        g.stroke();
      } else if (u < end + 4) {
        // The spoke comes down: a spear of light, white at the core
        const kk = u / (end + 4);
        const w = rx * 0.45 * (1 - kk * 0.6);
        const gr = g.createLinearGradient(x - w, 0, x + w, 0);
        gr.addColorStop(0, hexA(look.color, 0));
        gr.addColorStop(0.5, hexA('#fffdf4', 0.95 * (1 - kk)));
        gr.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = gr;
        g.fillRect(x - w, wy, w * 2, y0 - wy);
        rays(g, x, y0, rx * 1.4, 7, this.time, look.glow);
        if (u < end) starBurst(g, x, y0 - v.px(300), rx, u / end, look.color, '#ffffff', a.action + a.spec);
      }
    } else {
      // The halo
      const last = a.spec === 1;
      const cy = v.sy(1100);
      const sink = u < 0 ? -u / Math.max(1, spec.delay) : 0;
      const R = rx * (last && u >= 0 ? 0.85 + u / 10 : 0.85);
      const fade = u < end ? 1 : Math.max(0, 1 - (u - end) / 12);
      g.globalAlpha = fade * (u < 0 ? 1 - sink * 0.7 : 1);
      g.translate(x, cy - v.px(2600) * sink);
      // Burning light inside
      if (u >= 0 && !last) {
        const glowR = R * 0.9;
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, glowR);
        gr.addColorStop(0, hexA('#fffdf4', 0.55));
        gr.addColorStop(0.6, hexA(look.color, 0.25));
        gr.addColorStop(1, hexA(look.color, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(0, 0, glowR, 0, TAU);
        g.fill();
      }
      g.scale(1, 0.92);
      g.rotate(this.time * (last ? 4 : 1.2));
      g.shadowColor = look.color;
      g.shadowBlur = 18;
      g.strokeStyle = look.color;
      g.lineWidth = Math.max(3, v.px(70));
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.stroke();
      g.strokeStyle = '#fffaf0';
      g.lineWidth = Math.max(1, v.px(25));
      g.stroke();
      // Its spikes, pointing in
      g.fillStyle = look.color;
      for (let n = 0; n < 12; n++) {
        const ang = (n / 12) * TAU;
        const L = R * (n % 2 ? 0.14 : 0.24);
        g.beginPath();
        g.moveTo(Math.cos(ang - 0.06) * R, Math.sin(ang - 0.06) * R);
        g.lineTo(Math.cos(ang) * (R - L), Math.sin(ang) * (R - L));
        g.lineTo(Math.cos(ang + 0.06) * R, Math.sin(ang + 0.06) * R);
        g.fill();
      }
      g.shadowBlur = 0;
      g.restore();
      g.save();
      g.globalAlpha = fade;
      if (u >= 0 && last && u < end) {
        starBurst(g, x, cy, rx * 1.6, u / end, look.color, '#ffffff', a.action);
        rays(g, x, cy, rx * 2.4, 12, this.time, look.glow);
      }
      if (u >= 0) embers(g, x, cy, rx * 1.5, v.px(2400), this.time, 16, '#fff6c8', a.action + a.spec);
    }
    g.restore();
  }

  /* ------------------------------------------------------- Yomi's void (the pack's VFX clips) */

  /**
   * Grave Hands: a ring of void crescents spins up around the hands. Yomi Gate: the gate opens
   * around the target with claws raking through it, and the last cut tears it apart. `u` frames
   * since the area went live (negative while it gathers); 'under' is drawn behind the hands.
   */
  private voidFx(
    g: CanvasRenderingContext2D,
    v: View2D,
    fx: VfxSet,
    a: GameState['areas'][number],
    spec: ReturnType<typeof areaSpec>,
    u: number,
    layer: 'under' | 'over',
  ) {
    const hero = ROSTER[a.char]!;
    const x = v.sx(a.x);
    const y0 = v.sy(0);
    const end = spec.active;
    if (hero.actions[a.action]?.id !== hero.ultimate) {
      // Grave Hands: the star gathers over the spot, then the ring turns around the hands
      const cy = y0 - v.px(spec.r);
      const size = spec.r / 1200;
      if (u < 0 && layer === 'over')
        fx.draw(
          g,
          v,
          'Void_Arcane_Surge',
          keyed(u, [
            [-spec.delay, 0],
            [0, 7.99],
          ]),
          x,
          cy,
          { size },
        );
      else if (u >= 0 && layer === 'under')
        fx.draw(
          g,
          v,
          'Void_Arcane_Surge',
          keyed(u, [
            [0, 8],
            [end + 12, 18.99],
          ]),
          x,
          cy,
          { size },
        );
      return;
    }
    const cy = y0 - v.px(1100);
    if (a.spec === 0) {
      // The gate: a mote of void swells, stretches and splits into two great crescents that
      // hold open (looping) while the claws rake, then fade
      if (layer === 'under') {
        const f =
          u < 0
            ? keyed(u, [
                [-spec.delay, 3],
                [0, 7.99],
              ])
            : u < 8
              ? keyed(u, [
                  [0, 8],
                  [8, 12],
                ])
              : u < end - 8
                ? 12 + (Math.floor((u - 8) / 3) % 4)
                : keyed(u, [
                    [end - 8, 16],
                    [end + 6, 19.99],
                  ]);
        fx.draw(g, v, 'Void_Awakening', f, x, cy, { size: spec.r / 1465 });
      } else if (u >= 0 && u < end) {
        // A flash as it opens, then the claws rake on every hit
        const f = u < 2 ? 0 : 1 + (Math.floor(u / 2) % 12);
        fx.draw(g, v, 'Void_Triple_Claw', f, x, cy + v.px(100), { size: spec.r / 2100 });
      }
    } else if (layer === 'over') {
      // The last cut: a flash, then the great claws tear outwards
      fx.draw(
        g,
        v,
        'Void_Triple_Claw',
        keyed(u, [
          [0, 0],
          [2, 13],
          [end + 12, 23.99],
        ]),
        x,
        cy,
        {
          size: spec.r / 1580,
        },
      );
    }
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
