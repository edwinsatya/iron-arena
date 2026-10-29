import { FS, KO_SLOWMO_FRAMES, PHASE, SLOWMO_DIVISOR } from './constants';
import { resolveCombat } from './combat';
import { updateEntities } from './entities';
import { pruneEvents } from './events';
import { applyPhysics, pushApart, setState, updateFighter } from './fighter';
import { readInput, type Intent } from './input';
import { roundLogic } from './round';
import type { GameState } from './types';

/**
 * Advance the game by exactly one frame (1/60 s). Depends on nothing but `state` and `inputs`
 * (raw input bits of P1 and P2), so both peers compute identical results (PLAN §4.4).
 */
export function step(s: GameState, inputs: readonly [number, number]): void {
  s.frame++;
  s.phaseFrame++;
  const it: [Intent, Intent] = [readInput(s, 0, inputs[0]), readInput(s, 1, inputs[1])];

  // Ultimate cut-in: the world holds still
  if (s.freeze > 0) {
    s.freeze--;
    s.phaseFrame--;
    pruneEvents(s);
    return;
  }
  if (s.hitstop > 0) {
    s.hitstop--;
    s.phaseFrame--;
    pruneEvents(s);
    return;
  }
  const slowmo =
    s.phase === PHASE.KO && s.phaseFrame <= KO_SLOWMO_FRAMES && s.phaseFrame % SLOWMO_DIVISOR !== 0;
  if (!slowmo) {
    const ctrl = s.phase === PHASE.FIGHT;
    updateFighter(s, 0, it[0], ctrl);
    updateFighter(s, 1, it[1], ctrl);
    applyPhysics(s, 0);
    applyPhysics(s, 1);
    pushApart(s);
    updateEntities(s);
    if (s.phase === PHASE.FIGHT) resolveCombat(s);
    // Safety: nobody stays held without a holder
    for (const f of s.fighters) if (f.state === FS.HELD && f.heldBy < 0) setState(f, FS.HITSTUN, 8);
  }
  roundLogic(s);
  flatten(s);
  pruneEvents(s);
}

/** Side view: everything stays on the z = 0 plane and faces straight left or right. */
function flatten(s: GameState): void {
  for (const f of s.fighters) {
    f.z = 0;
    f.vz = 0;
    if (f.fz !== 0 || (f.fx !== 1024 && f.fx !== -1024)) {
      f.fx = f.fx >= 0 ? 1024 : -1024;
      f.fz = 0;
    }
  }
  for (const p of s.projectiles) {
    p.z = 0;
    p.vz = 0;
  }
  for (const a of s.areas) a.z = 0;
}
