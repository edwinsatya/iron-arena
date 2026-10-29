import {
  actionOf,
  ARENA_R,
  areaSpec,
  EV,
  FS,
  hurtCylinder,
  localToWorld,
  PHASE,
  projectileSpec,
  ROSTER,
  ULT_FREEZE,
  type GameState,
  type SimEvent,
} from '@neonfist/sim';
import { lookFor } from '../looks';
import { Effects2D } from './effects2d';
import { chooseSprite, impactFrame, loadSpriteHero, type SpritePick, type SpriteHero } from './sprites';
import { buildStage2D, drawBackdrop, GROUND, type Stage2D } from './stage2d';
import { hexA, View2D } from './view';

export type Quality = 'low' | 'medium' | 'high';

export interface RendererOptions {
  /** This viewer sees the stage mirrored (online P2 who always plays on the left). */
  mirrored?: boolean;
  quality?: Quality;
  stage?: string;
  onEvent?: (e: SimEvent) => void;
  onCancel?: (e: SimEvent) => void;
  /** Wide drifting camera for menus (landing page). */
  showcase?: boolean;
}

export const PLAYER_COLORS = { p1: '#ff4b3e', p2: '#3d8bff' } as const;

interface Ambient {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
}

/**
 * Side-view 2D renderer (canvas 2D): painted parallax stage, heroes (sprite packs, or vector
 * figures until a pack is installed), effects and the camera. Reads GameState only.
 */
export class GameRenderer {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private v = new View2D();
  private stage: Stage2D;
  private effects: Effects2D;
  private dpr = 1;
  private time = 0;
  private resizeObs: ResizeObserver;
  private flashEl: HTMLDivElement;
  private lastState: GameState | null = null;
  private heroes = new Map<string, SpriteHero | null>();
  private loading = new Map<string, Promise<void>>();
  private flashT = [0, 0];
  private camX = 0;
  private viewW = 12000;
  private ambient: Ambient[] = [];
  private trails: { x: number; y: number; pick: SpritePick; facing: number }[][] = [[], []];
  showHitboxes = false;

  constructor(
    private host: HTMLElement,
    private opts: RendererOptions = {},
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    host.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d', { alpha: false })!;
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'screen-flash';
    host.appendChild(this.flashEl);
    const q = opts.quality ?? 'medium';
    this.dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    this.v.flip = opts.mirrored ? -1 : 1;
    this.stage = buildStage2D(opts.stage ?? 'rooftop-dusk');
    this.effects = new Effects2D({
      onEvent: (e) => {
        if (e.type === EV.HIT || e.type === EV.GUARD_BREAK) this.flashT[e.fighter] = 0.12;
        opts.onEvent?.(e);
      },
      onCancel: opts.onCancel,
    });
    for (let i = 0; i < 70; i++)
      this.ambient.push({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, s: 0.5 + Math.random() });
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.v.w = w;
    this.v.h = h;
  }

  private ensure(id: string): void {
    if (this.loading.has(id)) return;
    this.loading.set(
      id,
      loadSpriteHero(id).then((h) => {
        this.heroes.set(id, h);
      }),
    );
  }

  /** Resolves once the heroes' sprites have loaded (or turned out to be missing). */
  whenReady(s: GameState): Promise<void> {
    for (const f of s.fighters) this.ensure(ROSTER[f.char]!.id);
    return Promise.allSettled([...this.loading.values()]).then(() => undefined);
  }

  get state(): GameState | null {
    return this.lastState;
  }

  /** Screen position (0–1) of a world point in mm (for the HUD). */
  project(x: number, y: number): { x: number; y: number } {
    return { x: this.v.sx(x) / this.v.w, y: this.v.sy(y) / this.v.h };
  }

  /* ------------------------------------------------------------------ camera */

  private updateCamera(s: GameState, dt: number) {
    const v = this.v;
    const [a, b] = s.fighters;
    const aOut = a.state === FS.FALLING || a.y < -1500;
    const bOut = b.state === FS.FALLING || b.y < -1500;
    let cx = aOut ? b.x : bOut ? a.x : (a.x + b.x) / 2;
    const sep = aOut || bOut ? 3000 : Math.abs(a.x - b.x);
    const portrait = v.w / v.h < 1;
    let want = Math.min(portrait ? 10000 : 15500, Math.max(portrait ? 6500 : 10000, sep * 1.3 + 6000));
    let k = 1 - Math.exp(-dt * 5);
    if (this.opts.showcase) {
      want = 13000;
      cx += Math.sin(this.time * 0.15) * 1500;
      k = 1 - Math.exp(-dt * 1.5);
    } else if (s.freeze > 0 && s.freezeOwner >= 0) {
      const f = s.fighters[s.freezeOwner]!;
      cx = f.x + (f.fx >= 0 ? 600 : -600);
      want = portrait ? 4500 : 6000;
      k = 1 - Math.exp(-dt * 10);
    } else if (s.phase === PHASE.INTRO) {
      const t = Math.min(1, s.phaseFrame / 100);
      want += (1 - (1 - (1 - t) ** 3)) * 4000;
    } else if (s.phase === PHASE.KO) {
      want *= 1 - 0.18 * Math.min(1, s.phaseFrame / 60);
    } else if (s.phase === PHASE.ROUND_END || s.phase === PHASE.MATCH_END) {
      const w = s.phase === PHASE.MATCH_END ? s.matchWinner : s.endWinner;
      if (w >= 0) {
        cx = s.fighters[w]!.x;
        want = portrait ? 5000 : 7500;
      }
    }
    this.viewW += (want - this.viewW) * k;
    this.camX += (cx - this.camX) * k;
    // Keep the camera over the stage (a little void may show at the ends)
    const half = this.viewW / 2;
    const lim = Math.max(0, ARENA_R + 2600 - half);
    this.camX = Math.max(-lim, Math.min(lim, this.camX));
    v.scale = v.w / this.viewW;
    v.camX = this.camX;
    // Raise the view when someone flies high
    const top = Math.max(a.y, b.y) + 2300;
    const room = v.h * GROUND - 40;
    const lift = Math.max(0, top * v.scale - room);
    v.groundY = v.h * GROUND + lift * 0.9;
    const sh = this.effects.shake;
    v.ox = sh ? (Math.random() - 0.5) * sh : 0;
    v.oy = sh ? (Math.random() - 0.5) * sh * 0.6 : 0;
  }

  /* ------------------------------------------------------------------ render */

  render(s: GameState, dtMs: number): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.time += dt;
    this.lastState = s;
    for (const f of s.fighters) this.ensure(ROSTER[f.char]!.id);
    this.effects.sync(s);
    this.updateCamera(s, dt);
    const g = this.g;
    const v = this.v;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.imageSmoothingQuality = 'high';

    drawBackdrop(g, this.stage, v);
    this.stage.floor(g, v, this.time);
    this.effects.drawBack(g, s, v);

    // Ultimate cut-in: darken the world behind the user
    const freezeK = s.freeze > 0 ? Math.min(1, (ULT_FREEZE - s.freeze) / 8, s.freeze / 6) : 0;
    if (freezeK > 0) {
      g.fillStyle = `rgba(14, 8, 30, ${0.55 * freezeK})`;
      g.fillRect(0, 0, v.w, v.h);
      this.speedLines(g, s, freezeK);
    }

    // Shadows, then heroes (the one acting drawn last, on top)
    for (const f of s.fighters) this.shadow(g, f);
    const order = [0, 1].sort((i, j) => this.priority(s, i) - this.priority(s, j));
    for (const i of order) this.drawHero(g, s, i, dt);

    this.effects.drawFront(g, s, v, dt);
    this.drawAmbient(g, dt);
    if (this.showHitboxes) this.hitboxes(g, s);

    // Vignette
    const vg = g.createRadialGradient(v.w / 2, v.h * 0.55, v.h * 0.35, v.w / 2, v.h * 0.55, v.w * 0.75);
    vg.addColorStop(0, 'rgba(10, 6, 20, 0)');
    vg.addColorStop(1, 'rgba(10, 6, 20, 0.38)');
    g.fillStyle = vg;
    g.fillRect(0, 0, v.w, v.h);

    this.flashEl.style.opacity = String(Math.min(0.85, this.effects.flash));
  }

  private priority(s: GameState, i: number): number {
    const f = s.fighters[i]!;
    if (s.freezeOwner === i) return 3;
    if (f.state === FS.ACTION) return 2;
    if (f.state === FS.HITSTUN || f.state === FS.LAUNCHED) return 0;
    return 1;
  }

  private shadow(g: CanvasRenderingContext2D, f: GameState['fighters'][number]) {
    if (Math.abs(f.x) > ARENA_R || f.y < -200) return;
    const v = this.v;
    const k = Math.max(0.35, 1 - f.y / 3000);
    g.fillStyle = `rgba(20, 10, 30, ${0.32 * k})`;
    g.beginPath();
    g.ellipse(v.sx(f.x), v.sy(0), v.px(480) * k, v.px(110) * k, 0, 0, Math.PI * 2);
    g.fill();
  }

  private drawHero(g: CanvasRenderingContext2D, s: GameState, i: number, dt: number) {
    const v = this.v;
    const f = s.fighters[i]!;
    const hero = ROSTER[f.char]!;
    const a = actionOf(f);
    const look = lookFor(hero.id);
    const sprite = this.heroes.get(hero.id);
    const trail = this.trails[i]!;
    // Vanish for a moment when teleporting
    if (s.freeze === 0 && f.state === FS.ACTION && a?.teleport && Math.abs(f.actionFrame - a.teleport.frame) <= 2) {
      trail.length = 0;
      return;
    }
    const alt = i === 1 && s.fighters[0]!.char === f.char;
    this.flashT[i] = Math.max(0, this.flashT[i]! - dt);
    const flash = (this.flashT[i]! / 0.12) * 0.75;

    // Aura: ultimate, charging, buffs
    const isUlt = (f.state === FS.ACTION && f.action === hero.ultIdx) || (s.freeze > 0 && s.freezeOwner === i);
    let aura = 0;
    let auraColor = look.color;
    if (isUlt) aura = 0.75 + Math.sin(this.time * 18) * 0.15;
    else if (f.state === FS.CHARGE) {
      aura = Math.min(0.7, f.stateFrame / 24) * (0.7 + Math.sin(this.time * 30) * 0.3);
      auraColor = look.glow;
    } else if (f.buffFrames > 0) {
      aura = 0.38 + Math.sin(this.time * 6) * 0.08;
      auraColor = f.buffDamagePct > 0 ? '#ff5a3a' : '#9fe0ff';
    }
    if (aura > 0) this.aura(g, f.x, f.y, auraColor, aura);

    const facing = (f.fx >= 0 ? 1 : -1) * v.flip;
    const x = v.sx(f.x);
    const y = v.sy(f.y);
    if (!sprite) {
      // Still loading: a soft silhouette
      g.fillStyle = hexA(look.color, 0.5);
      g.beginPath();
      g.ellipse(x, y - v.px(850), v.px(320), v.px(850), 0, 0, Math.PI * 2);
      g.fill();
      return;
    }
    const pick = chooseSprite(sprite.atlas, s, i, this.time);
    if (!pick) return;
    const scale = sprite.scaleFor(v);

    // Afterimages while dashing or lunging
    const fast = f.state === FS.DASH || (f.state === FS.ACTION && Math.abs(f.vx) > 80) || f.state === FS.LAUNCHED;
    if (fast) {
      trail.unshift({ x: f.x, y: f.y, pick, facing });
      if (trail.length > 6) trail.length = 6;
    } else if (trail.length) trail.pop();
    for (let k = trail.length - 1; k >= 1; k -= 2) {
      const t = trail[k]!;
      sprite.drawPick(g, t.pick, v.sx(t.x), v.sy(t.y), scale, t.facing, { alt, alpha: 0.28 * (1 - k / 7), flash: 1 });
    }

    // Guard: a hexagonal barrier in front
    const guarding = f.state === FS.GUARD || f.state === FS.BLOCKSTUN;
    const countering = f.state === FS.ACTION && a?.counter && f.actionFrame >= a.counter.frames[0] && f.actionFrame <= a.counter.frames[1];
    if (guarding || countering) this.barrier(g, f.x, f.y, facing, countering ? look.glow : look.color, f.state === FS.BLOCKSTUN);

    // Hit shake
    const shake = f.state === FS.HITSTUN && f.stateFrame < 8 ? Math.sin(f.stateFrame * 3) * v.px(40) : 0;
    sprite.drawPick(g, pick, x + shake, y, scale, facing, { flash, alt });

    // Skill-specific overlays drawn in code (the packs have no art for these moves)
    if (f.state === FS.ACTION && a) this.overlay(g, s, i, a.id, f.actionFrame, look.color, look.glow);

    // Player tag over the head
    if (!this.opts.showcase && s.phase !== PHASE.MATCH_END && f.state !== FS.FALLING) {
      const tx = v.sx(f.x);
      const ty = v.sy(f.y + 2250) + Math.sin(this.time * 4 + i) * 3;
      const c = i === 0 ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2;
      g.fillStyle = c;
      g.strokeStyle = '#140f1e';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(tx - 9, ty - 8);
      g.lineTo(tx + 9, ty - 8);
      g.lineTo(tx, ty + 4);
      g.closePath();
      g.fill();
      g.stroke();
      g.font = '700 12px "Zen Kaku Gothic New", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.lineWidth = 3;
      g.strokeText(i === 0 ? 'P1' : 'P2', tx, ty - 10);
      g.fillText(i === 0 ? 'P1' : 'P2', tx, ty - 10);
    }
  }

  private barrier(g: CanvasRenderingContext2D, x: number, y: number, facing: number, color: string, hit: boolean) {
    const v = this.v;
    const cx = v.sx(x) + facing * v.px(420);
    const cy = v.sy(y + 950);
    const h = v.px(1050);
    const w = v.px(260);
    g.save();
    g.translate(cx, cy);
    g.scale(facing, 1);
    const pulse = hit ? 1 : 0.55 + Math.sin(this.time * 8) * 0.1;
    const grd = g.createLinearGradient(-w, 0, w, 0);
    grd.addColorStop(0, hexA(color, 0));
    grd.addColorStop(1, hexA(color, 0.45 * pulse));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-w * 0.2, -h);
    g.quadraticCurveTo(w * 1.3, 0, -w * 0.2, h);
    g.quadraticCurveTo(w * 0.5, 0, -w * 0.2, -h);
    g.fill();
    g.strokeStyle = hexA('#ffffff', 0.8 * pulse);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-w * 0.2, -h);
    g.quadraticCurveTo(w * 1.3, 0, -w * 0.2, h);
    g.stroke();
    // Hex pattern
    g.strokeStyle = hexA('#ffffff', 0.25 * pulse);
    g.lineWidth = 1;
    for (let k = -3; k <= 3; k++) {
      const yy = (k / 3.5) * h;
      const xx = w * 0.9 * (1 - (yy / h) ** 2) - w * 0.25;
      g.beginPath();
      g.arc(xx, yy, v.px(80), 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  /** Code-drawn extras for moves the sprite packs don't illustrate. */
  private overlay(g: CanvasRenderingContext2D, s: GameState, i: number, id: string, t: number, color: string, glow: string) {
    const v = this.v;
    const f = s.fighters[i]!;
    const o = s.fighters[1 - i]!;
    const dir = (f.fx >= 0 ? 1 : -1) * v.flip;
    if (id === 'hy_s3') {
      // Rime Bastion: ice crystals burst up around him
      const k = Math.min(1, Math.max(0, (t - 8) / 6));
      const fade = t > 30 ? Math.max(0, 1 - (t - 30) / 12) : 1;
      for (let n = -3; n <= 3; n++) {
        const px = v.sx(f.x + n * 330);
        const h = v.px(500 + (3 - Math.abs(n)) * 300) * k;
        g.globalAlpha = 0.9 * fade;
        g.fillStyle = n % 2 ? '#bfefff' : '#e8fbff';
        g.strokeStyle = '#4aa8e0';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(px - v.px(150), v.sy(0));
        g.lineTo(px, v.sy(0) - h);
        g.lineTo(px + v.px(150), v.sy(0));
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.globalAlpha = 1;
    } else if (id === 'ly_ult' && t < 92) {
      // Hawk's eye: a reticle locks onto the target
      const k = Math.min(1, t / 20);
      const cx = v.sx(o.x);
      const cy = v.sy(o.y + 1000);
      const r = v.px(900 - 450 * k);
      g.save();
      g.translate(cx, cy);
      g.rotate(this.time * 2);
      g.strokeStyle = hexA('#ffd36a', 0.9);
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
      for (let q = 0; q < 4; q++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.moveTo(r * 0.55, 0);
        g.lineTo(r * 1.35, 0);
        g.stroke();
      }
      g.restore();
    } else if (id === 're_ult' && t >= 10 && t <= 82) {
      // Seven light cuts across the target
      const n = Math.floor((t - 10) / 10);
      const k = ((t - 10) % 10) / 10;
      const cx = v.sx(o.x);
      const cy = v.sy(o.y + 1000);
      const ang = n * 2.1;
      const len = v.px(1500);
      g.save();
      g.translate(cx, cy);
      g.rotate(ang);
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#ffffff';
      g.shadowColor = color;
      g.shadowBlur = 16;
      g.lineWidth = v.px(70) * (1 - k);
      g.beginPath();
      g.moveTo(-len, 0);
      g.lineTo(len, 0);
      g.stroke();
      g.restore();
    } else if (id === 'kg_ult' && t >= 12 && t <= 84) {
      // A storm of shadow cuts around the target, from every angle
      const cx = v.sx(o.x);
      const cy = v.sy(o.y + 1000);
      g.save();
      g.translate(cx, cy);
      for (let q = 0; q < 3; q++) {
        const n = Math.floor((t - 12) / 4) * 3 + q;
        const k = ((t - 12) % 4) / 4;
        g.save();
        g.rotate(n * 2.39);
        g.globalAlpha = 1 - k;
        g.strokeStyle = q ? glow : '#ffffff';
        g.shadowColor = color;
        g.shadowBlur = 12;
        g.lineWidth = v.px(40) * (1 - k);
        const len = v.px(1200);
        g.beginPath();
        g.moveTo(-len, 0);
        g.lineTo(len, 0);
        g.stroke();
        g.restore();
      }
      g.restore();
    } else if (id.startsWith('hm_') && id !== 'hm_dash') {
      // Spell circle at the staff while casting, burning brighter until it fires
      const a = ROSTER[f.char]!.actions.find((x) => x.id === id)!;
      const imp = impactFrame(a).at;
      if (t <= imp + 6) {
        const k = Math.min(1, t / Math.max(1, imp));
        const big = id === 'hm_ult' || id === 'hm_s1';
        const cx = v.sx(f.x) + (big ? 0 : dir * v.px(520));
        const cy = v.sy(f.y + (big ? 2300 : 1250));
        const r = v.px(big ? 700 : 300) * (0.4 + 0.6 * k);
        g.save();
        g.translate(cx, cy);
        g.scale(big ? 1 : 0.45, big ? 0.35 : 1);
        g.rotate(this.time * 3);
        g.globalAlpha = t > imp ? 1 - (t - imp) / 6 : 0.9;
        g.strokeStyle = glow;
        g.shadowColor = color;
        g.shadowBlur = 14;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        for (let q = 0; q < 6; q++) {
          const a1 = (q / 6) * Math.PI * 2;
          const a2 = a1 + (Math.PI * 2 * 2) / 6;
          g.moveTo(Math.cos(a1) * r, Math.sin(a1) * r);
          g.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
        }
        g.stroke();
        g.restore();
      }
    } else if ((id === 're_s1' || id === 're_charge') && t >= 8 && t <= 18) {
      // Sword glints before the wave leaves
      const k = (t - 8) / 10;
      g.fillStyle = hexA(glow, 0.7 * (1 - k));
      g.beginPath();
      g.arc(v.sx(f.x) + dir * v.px(500), v.sy(f.y + 1100), v.px(260) * (0.5 + k), 0, Math.PI * 2);
      g.fill();
    }
  }

  private aura(g: CanvasRenderingContext2D, x: number, y: number, color: string, k: number) {
    const v = this.v;
    const cx = v.sx(x);
    const base = v.sy(y);
    const h = v.px(2100);
    const w = v.px(650);
    const gr = g.createRadialGradient(cx, base - h * 0.45, 0, cx, base - h * 0.45, h * 0.7);
    gr.addColorStop(0, hexA(color, 0.45 * k));
    gr.addColorStop(1, hexA(color, 0));
    g.fillStyle = gr;
    g.fillRect(cx - h, base - h * 1.2, h * 2, h * 1.4);
    g.strokeStyle = hexA('#ffffff', 0.6 * k);
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const t = (this.time * 1.6 + i / 7) % 1;
      const sx = cx + Math.sin(i * 2.3) * w;
      const sy = base - t * h;
      g.globalAlpha = Math.sin(t * Math.PI);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx, sy - v.px(300));
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private speedLines(g: CanvasRenderingContext2D, s: GameState, k: number) {
    const v = this.v;
    const f = s.fighters[s.freezeOwner]!;
    const cx = v.sx(f.x);
    const cy = v.sy(f.y + 1000);
    const look = lookFor(ROSTER[f.char]!.id);
    g.save();
    g.globalAlpha = 0.5 * k;
    g.strokeStyle = look.color;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + Math.floor(this.time * 20) * 0.37;
      const r0 = v.h * (0.35 + ((i * 0.618) % 0.3));
      g.lineWidth = 1 + (i % 3) * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * v.w, cy + Math.sin(a) * v.w);
      g.stroke();
    }
    g.restore();
  }

  private drawAmbient(g: CanvasRenderingContext2D, dt: number) {
    const v = this.v;
    const kind = this.stage.ambient;
    if (kind === 'none') return;
    g.save();
    for (const p of this.ambient) {
      if (kind === 'embers') {
        p.y -= dt * 0.03 * p.s;
        p.x += dt * 0.01 * Math.sin(this.time + p.s * 9);
        if (p.y < 0) p.y += 1;
        g.fillStyle = `rgba(255, ${180 + Math.round(p.s * 40)}, 120, ${0.35 * p.s})`;
        g.beginPath();
        g.arc((((p.x * v.w - v.camX * v.scale * 0.6 * v.flip) % v.w) + v.w) % v.w, p.y * v.h * 0.85, 1.5 * p.s, 0, Math.PI * 2);
        g.fill();
      } else {
        p.y += dt * 1.6 * p.s;
        if (p.y > 1) p.y -= 1;
        const x = (((p.x * v.w - v.camX * v.scale * 0.9 * v.flip) % v.w) + v.w) % v.w;
        g.strokeStyle = `rgba(190, 200, 255, ${0.25 * p.s})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, p.y * v.h);
        g.lineTo(x - 3, p.y * v.h + 14 * p.s);
        g.stroke();
      }
    }
    g.restore();
  }

  /** F1: hit spheres (red), projectiles (orange), areas and hurt boxes (cyan), from sim data. */
  private hitboxes(g: CanvasRenderingContext2D, s: GameState) {
    const v = this.v;
    g.save();
    g.lineWidth = 2;
    for (const f of s.fighters) {
      const c = hurtCylinder(f);
      g.strokeStyle = 'rgba(46, 230, 255, 0.8)';
      g.strokeRect(v.sx(f.x) - v.px(c.r), v.sy(c.y1), v.px(c.r * 2), v.px(c.y1 - c.y0));
      const a = actionOf(f);
      if (f.state === FS.ACTION && a?.strikes)
        for (const st of a.strikes) {
          if (f.actionFrame < st.frames[0] || f.actionFrame > st.frames[1] || st.release) continue;
          const p = localToWorld(f, st.at[0], st.at[1], 0);
          g.strokeStyle = '#ff3355';
          g.beginPath();
          g.arc(v.sx(p.x), v.sy(p.y), v.px(st.r), 0, Math.PI * 2);
          g.stroke();
        }
    }
    for (const p of s.projectiles) {
      const spec = projectileSpec(p.char, p.action, p.spec);
      g.strokeStyle = '#ffa033';
      g.beginPath();
      g.arc(v.sx(p.x), v.sy(p.y), v.px(spec.r), 0, Math.PI * 2);
      g.stroke();
    }
    for (const a of s.areas) {
      const spec = areaSpec(a.char, a.action, a.spec);
      g.strokeStyle = a.age >= spec.delay ? '#ff3355' : '#ffa033';
      g.strokeRect(v.sx(a.x) - v.px(spec.r), v.sy(2600), v.px(spec.r * 2), v.px(2600));
    }
    g.restore();
  }

  dispose(): void {
    this.resizeObs.disconnect();
    this.canvas.remove();
    this.flashEl.remove();
  }
}
