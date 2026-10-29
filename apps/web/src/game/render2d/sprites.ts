import { actionOf, FS, ROSTER, type ActionData, type GameState } from '@neonfist/sim';
import { lookFor, type AnimRef, type Puppet } from '../looks';
import type { View2D } from './view';

/**
 * Sprite-sheet heroes (elie automata packs converted by `pnpm sprites` into
 * /sprites/<hero>/atlas.json + PNG sheets).
 *
 * Every frame shown is picked from the simulation state alone (no clock of its own, so a
 * rollback simply re-picks), and attack animations are time-warped so their contact frame
 * shows exactly on the action's impact frame. Missing animations (hurt, jump, guard…) are made
 * from what the pack has: frames of the death animation, squash and stretch, tilts.
 */

export interface AtlasAnim {
  /** [sheet, x, y, w, h, anchorX, anchorY] per frame (anchor = feet, in frame pixels). */
  frames: [number, number, number, number, number, number, number][];
  fps: number;
  loop?: boolean;
  /** Frame index where an attack connects. */
  hit: number;
}

export interface Atlas {
  sheets: string[];
  /** Source pixels per metre. */
  pxPerM: number;
  /** Direction the art faces: 1 = right. */
  facing: 1 | -1;
  anims: Record<string, AtlasAnim>;
  art: Record<string, string>;
}

/** The frame an action "lands" — first strike, shot, area, teleport, buff or counter window. */
export function impactFrame(a: ActionData): { at: number; until: number } {
  const c: [number, number][] = [];
  for (const s of a.strikes ?? []) c.push([s.frames[0], s.frames[1]]);
  for (const p of a.projectiles ?? []) c.push([p.frame, p.frame + 3]);
  for (const ar of a.areas ?? []) c.push([ar.frame, ar.frame + 4]);
  if (a.teleport) c.push([a.teleport.frame, a.teleport.frame + 4]);
  if (a.buff) c.push([a.buff.frame, a.buff.frame + 10]);
  if (a.counter) c.push([a.counter.frames[0], a.counter.frames[1]]);
  if (!c.length) return { at: Math.max(1, Math.floor(a.total / 3)), until: Math.floor(a.total / 2) };
  c.sort((x, y) => x[0] - y[0]);
  const at = Math.max(1, c[0]![0]);
  return { at, until: Math.max(at + 2, Math.min(c[0]![1], at + 14)) };
}

/** What to draw: an animation frame plus a little squash, stretch and tilt. */
export interface SpritePick {
  anim: AtlasAnim;
  frame: number;
  sx: number;
  sy: number;
  /** Tilt (radians, + = leaning back). */
  rot: number;
  alpha: number;
  /** Offset in source pixels (+x = forward, +y = down). */
  dx?: number;
  dy?: number;
}

const ease = (k: number) => 1 - (1 - k) * (1 - k);

/** Puppet motion at action frame t, impact at `imp`, action length `total` (see looks.ts). */
function puppetPose(kind: Puppet, t: number, imp: number, total: number, time: number): Partial<SpritePick> {
  const pre = clamp(t / Math.max(1, imp), 0, 1); // 0 → 1 during startup
  const post = clamp((t - imp) / Math.max(1, Math.min(18, total - imp)), 0, 1); // 0 → 1 after impact
  const hitK = t < imp ? 0 : 1 - ease(post); // 1 at impact, fading
  switch (kind) {
    case 'lunge':
      return t < imp
        ? { rot: 0.14 * ease(pre), sx: 1 - 0.05 * pre, dx: -4 * pre }
        : { rot: -0.2 * hitK, sx: 1 + 0.1 * hitK, sy: 1 - 0.06 * hitK, dx: 16 * hitK };
    case 'cast':
      return t < imp
        ? { rot: 0.1 * ease(pre), sy: 1 + 0.05 * pre, dy: -3 * pre }
        : { rot: -0.12 * hitK, sx: 1 + 0.08 * hitK, sy: 1 - 0.05 * hitK, dx: 8 * hitK };
    case 'raise':
      return t < imp
        ? { sy: 1 - 0.08 * pre, sx: 1 + 0.05 * pre }
        : { sy: 1 + 0.1 * hitK, sx: 1 - 0.04 * hitK, rot: 0.08 * hitK, dy: -6 * hitK };
    case 'guard':
      return { sx: 1.05, sy: 0.92, rot: -0.06 + Math.sin(time * 9) * 0.01 };
    case 'vanish': {
      const d = Math.abs(t - imp);
      return { alpha: clamp(d / 6, 0, 1), sx: 1 - 0.3 * clamp(1 - d / 6, 0, 1), sy: 1 + 0.2 * clamp(1 - d / 6, 0, 1) };
    }
    case 'spin':
      return { sy: 1 + Math.sin(time * 30) * 0.03 };
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function chooseSprite(atlas: Atlas, s: GameState, i: number, time: number): SpritePick | null {
  const f = s.fighters[i]!;
  const hero = ROSTER[f.char]!;
  const look = lookFor(hero.id);
  const A = atlas.anims;
  const idle = A.idle!;
  const death = A.death;
  const pick = (anim: AtlasAnim, frame: number, extra: Partial<SpritePick> = {}): SpritePick => ({
    anim,
    frame: clamp(Math.floor(frame), 0, anim.frames.length - 1),
    sx: 1,
    sy: 1,
    rot: 0,
    alpha: 1,
    ...extra,
  });
  const loop = (anim: AtlasAnim, t: number, rate = 1, extra: Partial<SpritePick> = {}) =>
    pick(anim, (((t * anim.fps * rate) % anim.frames.length) + anim.frames.length) % anim.frames.length, extra);
  /** Spread an animation over `frames` sim frames (0 → first frame, frames → last). */
  const over = (anim: AtlasAnim, t: number, frames: number, extra: Partial<SpritePick> = {}) =>
    pick(anim, (clamp(t / Math.max(1, frames), 0, 1)) * (anim.frames.length - 1), extra);
  const at = (anim: AtlasAnim, k: number, extra: Partial<SpritePick> = {}) =>
    pick(anim, k * (anim.frames.length - 1), extra);
  const walk = A.walk ?? idle;
  const t = f.stateFrame;

  switch (f.state) {
    case FS.IDLE:
      return loop(idle, time + i * 0.37);
    case FS.RUN:
      return loop(walk, time + i * 0.21, Math.max(0.8, hero.speed / 62));
    case FS.DASH:
      return loop(walk, time, 2.2, { sx: 1.04, sy: 0.97 });
    case FS.JUMP_SQUAT:
      return pick(idle, 0, { sx: 1.08, sy: 0.88 });
    case FS.AIR:
      return f.vy > 0
        ? at(walk, 0.25, { sx: 0.94, sy: 1.08 })
        : at(walk, 0.75, { sx: 0.97, sy: 1.04, rot: -0.05 });
    case FS.LAND:
      return pick(idle, 0, { sx: 1.1 - Math.min(0.1, t * 0.012), sy: 0.86 + Math.min(0.14, t * 0.018) });
    case FS.GUARD:
    case FS.BLOCKSTUN:
      return pick(idle, 0, { sx: 0.97, sy: 0.98, rot: f.state === FS.BLOCKSTUN ? 0.06 : 0 });
    case FS.HITSTUN:
    case FS.GUARD_BREAK: {
      const k = Math.min(1, t / 6);
      const back = 0.22 * (1 - Math.max(0, (t - 8) / 14));
      return death
        ? at(death, 0.12 + 0.06 * k, { rot: Math.max(0, back) * 0.5 })
        : pick(idle, 0, { rot: Math.max(0, back) });
    }
    case FS.HELD:
      return death ? at(death, 0.2) : pick(idle, 0, { rot: 0.3 });
    case FS.LAUNCHED:
    case FS.FALLING:
      return death ? over(death, t, 26, { rot: 0.15 }) : pick(idle, 0, { rot: Math.min(1.4, 0.3 + t * 0.06) });
    case FS.DOWN:
      return death ? at(death, 1) : pick(idle, 0, { rot: Math.PI / 2, sy: 1 });
    case FS.GETUP:
      return death
        ? pick(death, (death.frames.length - 1) * (1 - clamp(t / 20, 0, 1)))
        : pick(idle, 0, { rot: (Math.PI / 2) * (1 - clamp(t / 20, 0, 1)) });
    case FS.KO:
      return death ? over(death, t, 46) : pick(idle, 0, { rot: Math.min(Math.PI / 2, t * 0.08) });
    case FS.DIZZY:
      return loop(idle, time, 0.5, { rot: Math.sin(time * 6) * 0.08 });
    case FS.WIN:
      return fromRef(atlas, look.win, null, t, time) ?? loop(idle, time);
    case FS.CHARGE: {
      const a = hero.actions[hero.chargeIdx]!;
      const ref = look.actions[a.id];
      const name = typeof ref === 'string' ? ref : ref?.anim;
      const anim = (name && A[name]) || idle;
      // Hold the wind-up, trembling as it charges
      const k = clamp(t / 20, 0, 1);
      return pick(anim, Math.max(0, anim.hit - 2) * k, { rot: Math.sin(time * 50) * 0.015 * k });
    }
    case FS.ACTION: {
      const a = actionOf(f);
      if (!a) return loop(idle, time);
      return fromRef(atlas, look.actions[a.id] ?? 'attack', a, f.actionFrame, time) ?? loop(idle, time);
    }
  }
  return loop(idle, time);
}

/** Resolve an AnimRef for an action (or the win pose when `a` is null). */
function fromRef(atlas: Atlas, ref: AnimRef, a: ActionData | null, t: number, time: number): SpritePick | null {
  const r = typeof ref === 'string' ? { anim: ref } : ref;
  const anim = atlas.anims[r.anim] ?? atlas.anims.attack ?? atlas.anims.idle;
  if (!anim) return null;
  const base = (frame: number): SpritePick => ({
    anim,
    frame: clamp(Math.floor(frame), 0, anim.frames.length - 1),
    sx: 1,
    sy: 1,
    rot: 0,
    alpha: 1,
  });
  const n = anim.frames.length;
  if (!a) {
    // Win pose: play once, then hold (or loop the idle-type animations)
    if (anim.loop) return base((time * anim.fps) % n);
    return base(Math.min(r.hold ?? n - 1, t / 3));
  }
  if (r.until !== undefined && t >= r.until) {
    const after = atlas.anims[r.after ?? 'idle'] ?? atlas.anims.idle!;
    return {
      anim: after,
      frame: Math.floor((time * after.fps) % after.frames.length),
      sx: 1,
      sy: 1,
      rot: 0,
      alpha: clamp((t - r.until) / 8, 0, 1),
    };
  }
  const imp = impactFrame(a).at;
  if (r.puppet) {
    const extra = puppetPose(r.puppet, t, imp, a.total, time);
    const frame =
      r.puppet === 'spin' || anim.loop
        ? (time * anim.fps * (r.puppet === 'spin' ? 1.4 : 1)) % n
        : t <= imp
          ? (Math.min(n - 1, anim.hit) * t) / Math.max(1, imp)
          : anim.hit + ((n - 1 - anim.hit) * (t - imp)) / Math.max(1, a.total - imp);
    return { ...base(frame), ...extra };
  }
  if (anim.loop) return base((time * anim.fps) % n);
  if (r.cycle && t >= r.cycle[0]) {
    // Flurries: a quick loop around the contact frame
    const k = ((t - r.cycle[0]) % r.cycle[1]) / r.cycle[1];
    const from = Math.max(0, anim.hit - 3);
    const to = Math.min(n - 1, anim.hit + 3);
    return base(from + (to - from) * k);
  }
  // Time-warp: frames before `hit` cover the startup, the rest the recovery
  const hit = Math.min(n - 1, anim.hit);
  const end = r.until ?? a.total;
  const frame = t <= imp ? (hit * t) / Math.max(1, imp) : hit + ((n - 1 - hit) * (t - imp)) / Math.max(1, end - imp);
  return base(frame);
}

/* ------------------------------------------------------------------ loading and drawing */

export class SpriteHero {
  /** Sheets in the second costume (hue-shifted), made on first use. */
  private alt: HTMLCanvasElement[] | null = null;
  private flashBuf: HTMLCanvasElement | null = null;

  constructor(
    readonly id: string,
    readonly atlas: Atlas,
    private sheets: HTMLImageElement[],
  ) {}

  private altSheets(): HTMLCanvasElement[] {
    if (this.alt) return this.alt;
    const deg = lookFor(this.id).altHue;
    this.alt = this.sheets.map((img) => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      hueShift(d.data, deg);
      g.putImageData(d, 0, 0);
      return c;
    });
    return this.alt;
  }

  /** Draw a pick with the feet at canvas (x, y), `scale` canvas px per source px. */
  drawPick(
    g: CanvasRenderingContext2D,
    p: SpritePick,
    x: number,
    y: number,
    scale: number,
    facing: number,
    opts: { flash?: number; alt?: boolean; alpha?: number } = {},
  ) {
    const fr = p.anim.frames[p.frame]!;
    const [sheet, sx, sy, w, h, ax, ay] = fr;
    const img: CanvasImageSource = opts.alt ? this.altSheets()[sheet]! : this.sheets[sheet]!;
    const dir = facing * this.atlas.facing;
    g.save();
    g.translate(x + (p.dx ?? 0) * scale * dir, y + (p.dy ?? 0) * scale);
    g.rotate(-p.rot * dir);
    g.scale(scale * dir * p.sx, scale * p.sy);
    g.globalAlpha = (opts.alpha ?? 1) * p.alpha;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, sx, sy, w, h, -ax, -ay, w, h);
    const flash = opts.flash ?? 0;
    if (flash > 0) {
      const c = (this.flashBuf ??= document.createElement('canvas'));
      if (c.width < w || c.height < h) {
        c.width = Math.max(c.width, w);
        c.height = Math.max(c.height, h);
      }
      const t = c.getContext('2d')!;
      t.clearRect(0, 0, c.width, c.height);
      t.globalCompositeOperation = 'source-over';
      t.drawImage(img, sx, sy, w, h, 0, 0, w, h);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = '#ffffff';
      t.fillRect(0, 0, w, h);
      g.globalAlpha = flash * (opts.alpha ?? 1);
      g.drawImage(c, 0, 0, w, h, -ax, -ay, w, h);
    }
    g.restore();
  }

  /** Draw fighter `i` from the state. */
  draw(g: CanvasRenderingContext2D, v: View2D, s: GameState, i: number, facing: number, time: number, opts: { flash?: number; alt?: boolean; alpha?: number }) {
    const p = chooseSprite(this.atlas, s, i, time);
    if (!p) return;
    const f = s.fighters[i]!;
    this.drawPick(g, p, v.sx(f.x), v.sy(f.y), this.scaleFor(v), facing, opts);
  }

  /** Canvas pixels per source pixel at the current zoom. */
  scaleFor(v: View2D): number {
    return (v.scale * 1000) / this.atlas.pxPerM;
  }
}

/** Rotate hues in place (keeps lightness; used for the mirror-match costume). */
function hueShift(px: Uint8ClampedArray, deg: number) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Hue rotation matrix in RGB (luma-preserving approximation)
  const m = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ];
  for (let k = 0; k < px.length; k += 4) {
    if (px[k + 3] === 0) continue;
    const r = px[k]!;
    const gg = px[k + 1]!;
    const b = px[k + 2]!;
    px[k] = m[0]! * r + m[1]! * gg + m[2]! * b;
    px[k + 1] = m[3]! * r + m[4]! * gg + m[5]! * b;
    px[k + 2] = m[6]! * r + m[7]! * gg + m[8]! * b;
  }
}

const cache = new Map<string, Promise<SpriteHero | null>>();

export function loadSpriteHero(id: string): Promise<SpriteHero | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/sprites/${id}/atlas.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Atlas>) : null))
      .then(async (atlas) => {
        if (!atlas) return null;
        const sheets = await Promise.all(
          atlas.sheets.map(
            (src) =>
              new Promise<HTMLImageElement>((res, rej) => {
                const im = new Image();
                im.onload = () => res(im);
                im.onerror = rej;
                im.src = `/sprites/${id}/${src}`;
              }),
          ),
        );
        return new SpriteHero(id, atlas, sheets);
      })
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

/** Art URLs from the pack (portraits, skill cards, full art). */
export function heroArt(id: string, key: 'face' | 'faceShout' | 'full' | 'cardS1' | 'cardS2' | 'cardS3' | 'cardUlt'): string | null {
  const files: Record<string, string> = {
    face: 'face.webp',
    faceShout: 'face-shout.webp',
    full: 'art.webp',
    cardS1: 'card-s1.webp',
    cardS2: 'card-s2.webp',
    cardS3: 'card-s3.webp',
    cardUlt: 'card-ult.webp',
  };
  return HAS_ART[id]?.includes(key) ? `/sprites/${id}/${files[key]}` : key === 'face' ? `/sprites/${id}/face.webp` : null;
}

/** Which heroes have painted art (complete packs). Others use sprite-made portraits. */
const HAS_ART: Record<string, string[]> = {
  benika: ['face', 'faceShout', 'full', 'cardS1', 'cardS2', 'cardS3', 'cardUlt'],
  lysa: ['face', 'faceShout', 'full', 'cardS1', 'cardS2', 'cardS3', 'cardUlt'],
  hyoga: ['face', 'faceShout', 'full', 'cardS1', 'cardS2', 'cardS3', 'cardUlt'],
  hyoshin: ['face', 'full', 'cardS1', 'cardS2', 'cardS3', 'cardUlt'],
};

/** A still for menus and cards: an action at its contact frame, or the first idle frame. */
export function chooseSpriteForAction(atlas: Atlas, heroId: string, actionId: string | null): SpritePick {
  const ref = actionId ? lookFor(heroId).actions[actionId] : null;
  const name = ref ? (typeof ref === 'string' ? ref : ref.anim) : 'idle';
  const anim = atlas.anims[name] ?? atlas.anims.idle!;
  return { anim, frame: name === 'idle' ? 0 : anim.hit, sx: 1, sy: 1, rot: 0, alpha: 1 };
}
