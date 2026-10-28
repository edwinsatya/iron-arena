import { BTN } from '@neonfist/shared';
import { FS, PHASE } from '../src/constants';
import { startMove } from '../src/fighter';
import { ROSTER } from '../src/roster';
import { createInitialState } from '../src/state';
import { step } from '../src/step';
import type { GameState } from '../src/types';

export function fightState(p1 = 'dummy', p2 = 'dummy', roundFrames = 3600): GameState {
  const s = createInitialState({
    seed: 12345,
    fighters: [p1, p2],
    roundsToWin: 2,
    roundFrames,
    viewMirrored: [false, false],
  });
  while (s.phase !== PHASE.FIGHT) step(s, [0, 0]);
  return s;
}

/** Put the fighters `gap` mm apart around the stage centre, facing each other. */
export function place(s: GameState, gap: number): void {
  s.fighters[0].x = -Math.trunc(gap / 2);
  s.fighters[1].x = gap - Math.trunc(gap / 2);
  s.fighters[0].dirX = 1024;
  s.fighters[1].dirX = -1024;
}

export function moveIndex(s: GameState, p: number, id: string): number {
  const i = ROSTER[s.fighters[p]!.char]!.moves.findIndex((m) => m.id === id);
  if (i < 0) throw new Error(`no move ${id}`);
  return i;
}

/** Start a move directly (bypasses input parsing — that is tested separately). */
export function force(s: GameState, p: number, id: string): void {
  startMove(s, p, ROSTER[s.fighters[p]!.char]!, moveIndex(s, p, id));
}

export function run(s: GameState, frames: number, inputs: [number, number] = [0, 0]): void {
  for (let i = 0; i < frames; i++) step(s, inputs);
}

/** Step until `pred` is true (returns frames taken) or throw after `max` frames. */
export function runUntil(
  s: GameState,
  pred: (s: GameState) => boolean,
  inputs: (s: GameState) => [number, number] = () => [0, 0],
  max = 600,
): number {
  for (let i = 1; i <= max; i++) {
    step(s, inputs(s));
    if (pred(s)) return i;
  }
  throw new Error('runUntil: condition never met');
}

/**
 * After a contact, both players mash 1 on alternating frames; the press is buffered, so each
 * fighter starts a new move on its first actionable frame. Returns defender − attacker frames.
 */
export function measureAdvantage(s: GameState, attacker: number, defenderHold = 0): number {
  // Move them far apart so the mashed jabs can't interact (timing doesn't depend on position).
  s.fighters[0].x = -3500;
  s.fighters[1].x = 3500;
  const startFrame: [number, number] = [-1, -1];
  for (let i = 0; i < 300 && (startFrame[0] < 0 || startFrame[1] < 0); i++) {
    const press = i % 2 === 0 ? BTN.B1 : 0;
    const inp: [number, number] = [press, press];
    inp[1 - attacker] |= defenderHold;
    step(s, inp);
    for (const p of [0, 1]) {
      const f = s.fighters[p]!;
      if (startFrame[p]! < 0 && f.state === FS.ATTACK && f.moveFrame === 1) startFrame[p] = s.frame;
    }
  }
  if (startFrame[0] < 0 || startFrame[1] < 0) throw new Error('measureAdvantage: nobody acted');
  return startFrame[1 - attacker]! - startFrame[attacker]!;
}
