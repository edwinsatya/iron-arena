/**
 * Integer-only math helpers (PLAN Appendix B). No floats are stored in GameState and no
 * transcendental functions are used, so every JS engine computes identical results.
 */

/** Author moves in advantage; derive stun (contact on the first active frame). */
export function stunFromAdvantage(advantage: number, active: number, recovery: number): number {
  return Math.max(1, advantage + (active - 1) + recovery);
}

/** % damage by hit index in a combo. */
export const JUGGLE_SCALE = [100, 100, 80, 70, 60, 50, 45, 40, 35, 30];

export function scaledDamage(base: number, hitIndex: number): number {
  const pct = JUGGLE_SCALE[Math.min(hitIndex, JUGGLE_SCALE.length - 1)]!;
  return Math.max(1, Math.trunc((base * pct) / 100));
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

/** Facing toward a point as a unit vector × 1024. */
export function facingDir(fromX: number, fromZ: number, toX: number, toZ: number): [number, number] {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = isqrt(dx * dx + dz * dz);
  if (len === 0) return [1024, 0];
  return [Math.trunc((dx * 1024) / len), Math.trunc((dz * 1024) / len)];
}

/** Fighter-local (forward, up, right) in mm → world mm. "Right" matches three.js (Y up). */
export function localToWorld(
  f: { x: number; y: number; z: number; dirX: number; dirZ: number },
  fwd: number,
  up: number,
  right: number,
): { x: number; y: number; z: number } {
  return {
    x: f.x + Math.trunc((fwd * f.dirX - right * f.dirZ) / 1024),
    y: f.y + up,
    z: f.z + Math.trunc((fwd * f.dirZ + right * f.dirX) / 1024),
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
  const dx = sx - cx;
  const dz = sz - cz;
  const rr = r + cr;
  return dx * dx + dz * dz <= rr * rr;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Scale a unit vector (× 1024) by a length in mm. */
export function along(dir: number, length: number): number {
  return Math.trunc((dir * length) / 1024);
}
