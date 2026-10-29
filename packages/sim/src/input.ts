import { BTN } from '@neonfist/shared';
import { CHORD_WINDOW, DASH_TAP_WINDOW } from './constants';
import type { FighterState, GameState } from './types';

/** Requests a fighter can make (also the input buffer's values). */
export const REQ = {
  NONE: 0,
  ATTACK: 1,
  JUMP: 2,
  DASH: 3,
  SKILL1: 4,
  SKILL2: 5,
  SKILL3: 6,
  ULT: 7,
} as const;

export interface Intent {
  /** Held direction, 0–7 clockwise from screen-up, or −1. */
  dir: number;
  guard: boolean;
  attackHeld: boolean;
  /** Request made this frame (REQ.*). */
  req: number;
}

const CAP = 99;

/** Screen-space bits → direction index (0 = up, clockwise), or −1. */
export function dirIndex(bits: number, mirrored: boolean): number {
  let up = (bits & BTN.UP) !== 0;
  let down = (bits & BTN.DOWN) !== 0;
  let left = (bits & BTN.LEFT) !== 0;
  let right = (bits & BTN.RIGHT) !== 0;
  if (mirrored) {
    // The mirrored viewer's camera is turned 180°: screen-up is world +z.
    [up, down] = [down, up];
    [left, right] = [right, left];
  }
  const v = up && !down ? -1 : down && !up ? 1 : 0;
  const h = left && !right ? -1 : right && !left ? 1 : 0;
  if (v === -1 && h === 0) return 0;
  if (v === -1 && h === 1) return 1;
  if (v === 0 && h === 1) return 2;
  if (v === 1 && h === 1) return 3;
  if (v === 1 && h === 0) return 4;
  if (v === 1 && h === -1) return 5;
  if (v === 0 && h === -1) return 6;
  if (v === -1 && h === -1) return 7;
  return -1;
}

/**
 * Read one frame of raw input for fighter `i`: track press ages, double taps and chords.
 * Chords (pressed within CHORD_WINDOW frames of each other): Attack+Guard = skill 1,
 * Attack+Jump = skill 2, Guard+Jump = skill 3, all three = ultimate.
 */
export function readInput(s: GameState, i: number, raw: number): Intent {
  const f: FighterState = s.fighters[i]!;
  const bits = raw & 0xffff;
  const pressed = bits & ~f.prevBits;
  const mirrored = s.viewMirrored[i] === 1;
  const dir = dirIndex(bits, mirrored);
  const prevDir = dirIndex(f.prevBits, mirrored);
  f.prevBits = bits;

  f.ageA = pressed & BTN.ATTACK ? 0 : Math.min(CAP, f.ageA + 1);
  f.ageG = pressed & BTN.GUARD ? 0 : Math.min(CAP, f.ageG + 1);
  f.ageJ = pressed & BTN.JUMP ? 0 : Math.min(CAP, f.ageJ + 1);
  f.holdA = bits & BTN.ATTACK ? Math.min(CAP, f.holdA + 1) : 0;
  f.tapAge = Math.min(CAP, f.tapAge + 1);

  let req: number = REQ.NONE;
  // Double-tap a direction to dash
  if (dir >= 0 && dir !== prevDir) {
    if (prevDir < 0 && f.tapDir === dir && f.tapAge <= DASH_TAP_WINDOW) {
      req = REQ.DASH;
      f.tapDir = -1;
    } else {
      f.tapDir = dir;
    }
    f.tapAge = 0;
  }

  const w = CHORD_WINDOW;
  const fresh = f.ageA === 0 || f.ageG === 0 || f.ageJ === 0;
  const a = f.ageA <= w;
  const g = f.ageG <= w;
  const j = f.ageJ <= w;
  if (pressed & BTN.ULT || (fresh && a && g && j)) req = REQ.ULT;
  else if (pressed & BTN.SKILL1 || (fresh && a && g)) req = REQ.SKILL1;
  else if (pressed & BTN.SKILL2 || (fresh && a && j)) req = REQ.SKILL2;
  else if (pressed & BTN.SKILL3 || (fresh && g && j)) req = REQ.SKILL3;
  else if (pressed & BTN.ATTACK) req = REQ.ATTACK;
  else if (pressed & BTN.JUMP) req = REQ.JUMP;

  // A chord upgrades into a skill: once used, its buttons don't fire again.
  if (req >= REQ.SKILL1) {
    f.ageA = f.ageG = f.ageJ = CAP;
  }

  return { dir, guard: (bits & BTN.GUARD) !== 0, attackHeld: (bits & BTN.ATTACK) !== 0, req };
}
