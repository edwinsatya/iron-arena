import { BTN } from '@neonfist/shared';
import { INTRO_FRAMES, PHASE } from '../src/constants';
import { createInitialState } from '../src/state';
import { step } from '../src/step';
import type { GameState } from '../src/types';

export { BTN };

export function newMatch(p1 = 'benika', p2 = 'hyoga', seed = 7): GameState {
  return createInitialState({
    seed,
    fighters: [p1, p2],
    roundsToWin: 2,
    roundFrames: 3600,
    viewMirrored: [false, false],
  });
}

/** Skip the round intro. */
export function toFight(s: GameState): GameState {
  for (let i = 0; i <= INTRO_FRAMES + 2 && s.phase !== PHASE.FIGHT; i++) step(s, [0, 0]);
  return s;
}

/** Fight-ready match with fighters at x positions (mm), facing each other. */
export function setup(p1 = 'benika', p2 = 'hyoga', ax = -1000, bx = 1000): GameState {
  const s = toFight(newMatch(p1, p2));
  const [a, b] = s.fighters;
  a.x = ax;
  b.x = bx;
  a.z = b.z = 0;
  a.fx = ax < bx ? 1024 : -1024;
  b.fx = -a.fx;
  a.fz = b.fz = 0;
  return s;
}

/** Run n frames with constant inputs (or a function of the frame index). */
export function run(
  s: GameState,
  n: number,
  p1: number | ((k: number) => number) = 0,
  p2: number | ((k: number) => number) = 0,
): void {
  for (let k = 0; k < n; k++) {
    step(s, [typeof p1 === 'function' ? p1(k) : p1, typeof p2 === 'function' ? p2(k) : p2]);
  }
}

/** Press a button for one frame then release (with `hold` frames held). */
export function tap(s: GameState, who: 0 | 1, bits: number, hold = 1, other = 0): void {
  for (let k = 0; k < hold; k++) step(s, who === 0 ? [bits, other] : [other, bits]);
  step(s, who === 0 ? [0, other] : [other, 0]);
}

export function eventsOf(s: GameState, type: number): number {
  return s.recentEvents.filter((e) => e.type === type).length;
}
