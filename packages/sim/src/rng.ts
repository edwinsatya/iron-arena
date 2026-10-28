/** mulberry32 — deterministic PRNG whose state lives in GameState.rng. Returns 0..n-1. */
export function rand(s: { rng: number }, n: number): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) % n;
}
