/**
 * Side-view camera: world millimetres → canvas pixels. The world lives on one line (z = 0):
 * x runs left → right, y up from the floor.
 */
export class View2D {
  /** Canvas size in CSS pixels. */
  w = 1;
  h = 1;
  /** Camera centre x (mm) and pixels per mm. */
  camX = 0;
  scale = 0.1;
  /** Floor line in canvas pixels (y). */
  groundY = 1;
  /** Shake offset (px). */
  ox = 0;
  oy = 0;
  /** −1 when this viewer sees the stage mirrored (online P2 who always plays on the left). */
  flip: 1 | -1 = 1;

  sx(x: number): number {
    return this.w / 2 + (x - this.camX) * this.scale * this.flip + this.ox;
  }

  sy(y: number): number {
    return this.groundY - y * this.scale + this.oy;
  }

  /** Length in mm → px. */
  px(mm: number): number {
    return mm * this.scale;
  }
}

/** Small seeded PRNG for painting backgrounds (same look every load). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}
