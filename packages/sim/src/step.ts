import { KO_SLOWMO_FRAMES, PHASE, SLOWMO_DIVISOR } from './constants';
import { resolveCombat, updateThrows } from './combat';
import { pruneEvents } from './events';
import { updateFighter } from './fighter';
import { processInput } from './input';
import { applyPhysics, pushApart, updateFacing } from './physics';
import { roundLogic } from './round';
import type { GameState } from './types';

/**
 * Advance the game by exactly one frame (1/60 s). Depends on nothing but `state` and `inputs`
 * (raw input bits of P1 and P2), so both peers compute identical results (PLAN §4.4).
 */
export function step(s: GameState, inputs: readonly [number, number]): void {
  s.frame++;
  s.phaseFrame++;
  const ctrl = s.phase === PHASE.FIGHT;

  processInput(s, 0, inputs[0], ctrl);
  processInput(s, 1, inputs[1], ctrl);

  const slowmoSkip =
    s.phase === PHASE.KO && s.phaseFrame <= KO_SLOWMO_FRAMES && s.phaseFrame % SLOWMO_DIVISOR !== 0;

  if (s.hitstop > 0) {
    s.hitstop--;
  } else if (!slowmoSkip) {
    updateFighter(s, 0, ctrl);
    updateFighter(s, 1, ctrl);
    updateThrows(s);
    applyPhysics(s, 0);
    applyPhysics(s, 1);
    pushApart(s);
    updateFacing(s);
    if (ctrl) resolveCombat(s);
  }

  roundLogic(s);
  pruneEvents(s);
}
