/**
 * Integer-only math helpers. No floats are stored in GameState and no transcendental functions
 * are used at runtime, so every JS engine computes identical results.
 */

/** sin(d°) × 1024 for d = 0, 5, 10 … 355 (precomputed literals). */
const SIN5 = [
  0, 89, 178, 265, 350, 433, 512, 587, 658, 724, 784, 839, 887, 928, 962, 989, 1008, 1020, 1024, 1020, 1008,
  989, 962, 928, 887, 839, 784, 724, 658, 587, 512, 433, 350, 265, 178, 89, 0, -89, -178, -265, -350, -433,
  -512, -587, -658, -724, -784, -839, -887, -928, -962, -989, -1008, -1020, -1024, -1020, -1008, -989, -962,
  -928, -887, -839, -784, -724, -658, -587, -512, -433, -350, -265, -178, -89,
];

function sinDeg(deg: number): number {
  const i = ((Math.trunc(deg / 5) % 72) + 72) % 72;
  return SIN5[i]!;
}

/** Rotate a ×1024 vector by `deg` degrees (multiple of 5). Positive turns toward +right. */
export function rotate(x: number, z: number, deg: number): [number, number] {
  const s = sinDeg(deg);
  const c = sinDeg(deg + 90);
  // "right" of facing (fx, fz) is (−fz, fx) — see localToWorld
  return [Math.trunc((x * c - z * s) / 1024), Math.trunc((z * c + x * s) / 1024)];
}

/** floor(sqrt(n)) with integer-only steps. */
export function isqrt(n: number): number {
  if (n < 2) return n < 0 ? 0 : n;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** Unit vector × 1024 pointing along (dx, dz); `fallback` when the length is zero. */
export function normalize(dx: number, dz: number, fallback: [number, number] = [1024, 0]): [number, number] {
  const len = isqrt(dx * dx + dz * dz);
  if (len === 0) return fallback;
  return [Math.trunc((dx * 1024) / len), Math.trunc((dz * 1024) / len)];
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * Fighter-local (forward, up, right) in mm → world mm. Side view: everything lives on the z = 0
 * plane, so the sideways ("right") offset is ignored.
 */
export function localToWorld(
  f: { x: number; y: number; z: number; fx: number; fz: number },
  fwd: number,
  up: number,
  _right = 0,
): { x: number; y: number; z: number } {
  return {
    x: f.x + Math.trunc((fwd * f.fx) / 1024),
    y: f.y + up,
    z: f.z,
  };
}

/** Hit sphere vs vertical hurt cylinder — squared distances only. */
export function sphereHitsCylinder(
  sx: number,
  sy: number,
  sz: number,
  r: number,
  cx: number,
  cz: number,
  cr: number,
  y0: number,
  y1: number,
): boolean {
  if (sy + r < y0 || sy - r > y1) return false;
  const rr = r + cr;
  return dist2(sx, sz, cx, cz) <= rr * rr;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Scale a unit vector (× 1024) by a length in mm. */
export function along(dir: number, length: number): number {
  return Math.trunc((dir * length) / 1024);
}

/** Integer percent. */
export function pct(v: number, p: number): number {
  return Math.trunc((v * p) / 100);
}

/** The 8 input directions as unit vectors × 1024 (index 0 = screen-up, clockwise). */
export const DIR8: readonly [number, number][] = [
  [0, -1024],
  [724, -724],
  [1024, 0],
  [724, 724],
  [0, 1024],
  [-724, 724],
  [-1024, 0],
  [-724, -724],
];
