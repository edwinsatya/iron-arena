import { BTN } from '@neonfist/shared';
import { DOUBLE_TAP_WINDOW, IN, IN_BUTTONS, IN_DIRS, INPUT_RING, MULTI_PRESS_LENIENCY } from './constants';
import type { FighterState, GameState } from './types';

const RING_MASK = INPUT_RING - 1;

/**
 * Raw input → intent (PLAN §2.7):
 * SOCD cleaning, mirrored view, then forward/back from the simulation's own side state.
 */
export function mapInput(s: GameState, p: number, raw: number): number {
  let bits = raw & 0xff;
  if (bits & BTN.LEFT && bits & BTN.RIGHT) bits &= ~(BTN.LEFT | BTN.RIGHT);
  if (bits & BTN.UP && bits & BTN.DOWN) bits &= ~(BTN.UP | BTN.DOWN);
  if (s.viewMirrored[p]) {
    const l = bits & BTN.LEFT;
    const r = bits & BTN.RIGHT;
    bits = (bits & ~(BTN.LEFT | BTN.RIGHT)) | (l ? BTN.RIGHT : 0) | (r ? BTN.LEFT : 0);
  }
  const isLeft = (p === 0) === (s.p1OnLeft === 1);
  const fwd = isLeft ? BTN.RIGHT : BTN.LEFT;
  const back = isLeft ? BTN.LEFT : BTN.RIGHT;
  return (
    (bits & (BTN.UP | BTN.DOWN)) | (bits & fwd ? IN.F : 0) | (bits & back ? IN.B : 0) | (bits & IN_BUTTONS)
  );
}

/**
 * Record this frame's intent in the fighter's input ring and buffer new button presses.
 * Runs every frame (also during hitstop) so presses are never lost.
 */
export function processInput(s: GameState, p: number, raw: number, ctrl: boolean): void {
  const f = s.fighters[p]!;
  const intent = ctrl ? mapInput(s, p, raw) : 0;
  const prev = f.inputRing[f.inputHead]!;
  f.inputHead = (f.inputHead + 1) & RING_MASK;
  f.inputRing[f.inputHead] = intent;
  const edge = intent & ~prev & IN_BUTTONS;
  if (!edge) return;
  if (f.bufBtn && f.bufAge <= MULTI_PRESS_LENIENCY) {
    f.bufBtn |= edge; // e.g. 1 then 3 within 2 frames = 1+3
  } else {
    f.bufBtn = edge;
    f.bufDir = intent & IN_DIRS;
    f.bufAge = 0;
  }
}

/** Intent `back` frames ago (0 = this frame). */
export function intentAt(f: FighterState, back: number): number {
  return f.inputRing[(f.inputHead - back) & RING_MASK]!;
}

export function clearBuffer(f: FighterState): void {
  f.bufBtn = 0;
  f.bufDir = 0;
  f.bufAge = 0;
}

/** f,f or b,b completed `ago` frames back: a fresh tap of `bit` then, and another tap before it. */
function doubleTapAt(f: FighterState, bit: number, ago: number): boolean {
  if ((intentAt(f, ago) & IN_DIRS) !== bit) return false;
  if (intentAt(f, ago + 1) & bit) return false;
  for (let i = ago + 2; i <= ago + DOUBLE_TAP_WINDOW; i++) {
    if ((intentAt(f, i) & IN_DIRS) === bit) return true;
  }
  return false;
}

/** f,f or b,b: a fresh tap of `bit` now, and another tap of it within the window. */
export function doubleTap(f: FighterState, bit: number): boolean {
  return doubleTapAt(f, bit, 0);
}

/** Was f,f completed this frame or within the last `within` frames? (f,f+3 pressed together) */
export function recentDoubleTap(f: FighterState, bit: number, within: number): boolean {
  for (let ago = 0; ago <= within; ago++) if (doubleTapAt(f, bit, ago)) return true;
  return false;
}
