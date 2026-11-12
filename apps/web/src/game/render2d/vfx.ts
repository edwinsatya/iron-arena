import type { View2D } from './view';

/**
 * Pixel-art effect clips from a pack's VFX update (converted by `pnpm sprites` into
 * /sprites/<hero>/vfx.json + vfx<N>.png). Camera-facing frames on a square canvas, drawn at the
 * hero's own pixel density so they match the sprite. Which frame shows is picked by the caller
 * from the state (an area's age, an action frame), so a rollback simply re-picks.
 */

export interface VfxAtlas {
  sheets: string[];
  /** Source pixels per metre (the hero's). */
  pxPerM: number;
  /** [sheet, x, y, w, h, anchorX, anchorY] per frame; w = 0 for an empty frame. */
  clips: Record<string, { frames: [number, number, number, number, number, number, number][] }>;
}

export interface VfxDraw {
  /** Size against the hero's pixel density (1 = same pixels as the sprite). */
  size?: number;
  /** Vertical squash (flattens a ring seen from above onto the side-view floor). */
  squash?: number;
  alpha?: number;
  /** Mirror left–right. */
  flip?: boolean;
  /** Only the part above ('back': the far side) or below ('front') the anchor. */
  part?: 'back' | 'front';
}

export class VfxSet {
  constructor(
    readonly atlas: VfxAtlas,
    private sheets: HTMLImageElement[],
  ) {}

  count(clip: string): number {
    return this.atlas.clips[clip]?.frames.length ?? 0;
  }

  /** Draw frame `frame` of `clip` with its anchor on canvas point (x, y). */
  draw(
    g: CanvasRenderingContext2D,
    v: View2D,
    clip: string,
    frame: number,
    x: number,
    y: number,
    o: VfxDraw = {},
  ) {
    const frames = this.atlas.clips[clip]?.frames;
    if (!frames?.length) return;
    const fr = frames[Math.max(0, Math.min(frames.length - 1, Math.floor(frame)))]!;
    const [sheet, sx, sy, w, h, ax, ay] = fr;
    if (!w || !h) return;
    const alpha = o.alpha ?? 1;
    if (alpha <= 0) return;
    const k = ((v.scale * 1000) / this.atlas.pxPerM) * (o.size ?? 1);
    g.save();
    g.translate(x, y);
    g.scale(k * (o.flip ? -1 : 1), k * (o.squash ?? 1));
    if (o.part) {
      g.beginPath();
      if (o.part === 'back') g.rect(-ax - 1, -ay - 1, w + 2, ay + 1);
      else g.rect(-ax - 1, 0, w + 2, h - ay + 1);
      g.clip();
    }
    g.globalAlpha *= alpha;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.sheets[sheet]!, sx, sy, w, h, -ax, -ay, w, h);
    g.restore();
  }
}

/** Frame of a clip at time u, by keyframes [u, frame] (linear between, held at the ends). */
export function keyed(u: number, keys: readonly (readonly [number, number])[]): number {
  if (u <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [u1, f1] = keys[i]!;
    if (u <= u1) {
      const [u0, f0] = keys[i - 1]!;
      return f0 + ((u - u0) / Math.max(1e-6, u1 - u0)) * (f1 - f0);
    }
  }
  return keys[keys.length - 1]![1];
}

const cache = new Map<string, Promise<VfxSet | null>>();

export function loadVfx(id: string, file: string): Promise<VfxSet | null> {
  const key = `${id}/${file}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/sprites/${id}/${file}`)
      .then((r) => (r.ok ? (r.json() as Promise<VfxAtlas>) : null))
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
        return new VfxSet(atlas, sheets);
      })
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}
