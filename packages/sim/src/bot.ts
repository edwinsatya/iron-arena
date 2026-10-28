import { BTN } from '@neonfist/shared';

function makeRng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  0,
  0,
  BTN.RIGHT,
  BTN.RIGHT,
  BTN.LEFT,
  BTN.DOWN,
  BTN.DOWN | BTN.RIGHT,
  BTN.DOWN | BTN.LEFT,
  BTN.UP,
  BTN.UP | BTN.RIGHT,
];
const BUTTONS = [0, 0, 0, BTN.B1, BTN.B2, BTN.B3, BTN.B4, BTN.B1 | BTN.B2, BTN.B1 | BTN.B3, BTN.B2 | BTN.B4];

/**
 * A random "player" (soak tests, training partner): holds a direction for a few frames, taps buttons, sometimes double-taps
 * forward/back. Exercises walking, dashing, crouching, jumping, strings, throws and breaks.
 */
export function randomBot(seed: number): () => number {
  const r = makeRng(seed);
  let dir = 0;
  let hold = 0;
  let script: number[] = [];
  return () => {
    if (script.length) return script.shift()!;
    if (hold-- <= 0) {
      dir = DIRS[Math.floor(r() * DIRS.length)]!;
      hold = 1 + Math.floor(r() * 14);
      if (r() < 0.08) {
        const d = r() < 0.6 ? BTN.RIGHT : BTN.LEFT;
        script = [d, 0, d, d, d];
      }
    }
    const press = r() < 0.18 ? BUTTONS[Math.floor(r() * BUTTONS.length)]! : 0;
    return dir | press;
  };
}
