import {
  BACKDASH_LOCK_FRAMES,
  BUFFER_FRAMES,
  DOWN_MAX_FRAMES,
  DOWN_MIN_FRAMES,
  EV,
  FS,
  IN,
  IN_DIRS,
  JUMP_LIFT_FRAME,
  JUMP_VX,
  JUMP_VY,
  LAND_FRAMES,
  MULTI_PRESS_LENIENCY,
  WAKEUP_FRAMES,
} from './constants';
import { pushEvent } from './events';
import { clearBuffer, doubleTap, intentAt, recentDoubleTap } from './input';
import { along, facingDir } from './math';
import { findExactMove, findMove, matchesCancel, type CompiledCharacter, type CompiledMove } from './moves';
import { ROSTER } from './roster';
import type { FighterState, GameState } from './types';

export function setState(f: FighterState, state: number): void {
  f.state = state;
  f.stateFrame = 0;
}

/** Combo counters reset once the victim can act again. */
export function endCombo(f: FighterState): void {
  f.comboHits = 0;
  f.comboDamage = 0;
  f.juggleLeft = 0;
}

export function moveOf(f: FighterState): CompiledMove | null {
  return f.moveId >= 0 ? ROSTER[f.char]!.moves[f.moveId]! : null;
}

function faceOpponent(s: GameState, p: number): void {
  const f = s.fighters[p]!;
  const o = s.fighters[1 - p]!;
  const [dx, dz] = facingDir(f.x, f.z, o.x, o.z);
  f.dirX = dx;
  f.dirZ = dz;
}

export function startMove(s: GameState, p: number, ch: CompiledCharacter, index: number): void {
  const f = s.fighters[p]!;
  const m = ch.moves[index]!;
  faceOpponent(s, p);
  f.prevMoveId = f.moveId;
  f.prevMoveFrame = f.moveFrame;
  setState(f, FS.ATTACK);
  f.moveId = index;
  f.moveFrame = 1;
  f.hitLanded = 0;
  f.crouching = m.stance === 'crouch' ? 1 : 0;
  f.armorLeft = m.armor ? m.armor.hits : 0;
}

function endMove(f: FighterState, m: CompiledMove): void {
  f.prevMoveId = f.moveId;
  f.prevMoveFrame = f.moveFrame - 1;
  f.moveId = -1;
  f.moveFrame = 0;
  f.hitLanded = 0;
  f.armorLeft = 0;
  const crouch = m.endStance === 'crouch';
  f.crouching = crouch ? 1 : 0;
  setState(f, crouch ? FS.CROUCH : FS.IDLE);
}

function moveAlong(f: FighterState, distance: number): void {
  f.x += along(f.dirX, distance);
  f.z += along(f.dirZ, distance);
}

/** States in which a fighter may start an attack or change stance this frame. */
function canAct(f: FighterState): boolean {
  switch (f.state) {
    case FS.IDLE:
    case FS.WALK_F:
    case FS.WALK_B:
    case FS.CROUCH:
    case FS.DASH:
      return true;
    case FS.BACKDASH:
      return f.stateFrame > BACKDASH_LOCK_FRAMES;
    default:
      return false;
  }
}

/** Is a buffered press allowed to wait (a string window of the current move is still ahead)? */
function keepBuffered(f: FighterState): boolean {
  if (f.state !== FS.ATTACK) return false;
  const m = moveOf(f);
  return m !== null && f.moveFrame <= m.lastCancelFrame;
}

function ageBuffer(f: FighterState): void {
  if (!f.bufBtn) return;
  f.bufAge++;
  if (f.bufAge > BUFFER_FRAMES && !keepBuffered(f)) clearBuffer(f);
}

function computeGuard(f: FighterState, dir: number): void {
  switch (f.state) {
    case FS.IDLE:
    case FS.WALK_B:
      f.guard = 1;
      break;
    case FS.CROUCH:
      f.guard = dir & IN.F ? 0 : 2; // d and d/b guard low; d/f crouches without guarding
      break;
    case FS.BLOCKSTUN:
      f.guard = f.crouching ? 2 : 1;
      break;
    default:
      f.guard = 0;
  }
}

/** Strings, and upgrading 1 into 1+2 when the second button arrives a frame late. */
function tryCancel(s: GameState, p: number, ch: CompiledCharacter, dir: number): void {
  const f = s.fighters[p]!;
  const m = moveOf(f);
  if (!m || !f.bufBtn) return;

  if (m.cmd && f.moveFrame <= MULTI_PRESS_LENIENCY + 1) {
    const combined = m.cmd.buttons | f.bufBtn;
    if (combined !== m.cmd.buttons) {
      const idx = findExactMove(ch, combined, dir);
      if (idx >= 0 && idx !== f.moveId) {
        startMove(s, p, ch, idx);
        clearBuffer(f);
        return;
      }
    }
  }

  for (const c of m.cancelList) {
    if (f.moveFrame >= c.from && f.moveFrame <= c.to && matchesCancel(c.cmd, f.bufBtn, f.bufDir)) {
      f.prevMoveId = f.moveId;
      f.prevMoveFrame = f.moveFrame;
      startMove(s, p, ch, c.into);
      clearBuffer(f);
      return;
    }
  }
}

function decide(s: GameState, p: number, ch: CompiledCharacter, dir: number): void {
  const f = s.fighters[p]!;
  if (f.state === FS.ATTACK) {
    tryCancel(s, p, ch, dir);
    return;
  }
  if (!canAct(f)) return;

  // 1. Attacks (f,f+3 may be pressed together with the second f)
  if (f.bufBtn) {
    const dashing = f.state === FS.DASH || recentDoubleTap(f, IN.F, 2);
    const idx = findMove(ch, f.bufBtn, f.bufDir, dashing);
    if (idx >= 0) {
      startMove(s, p, ch, idx);
      clearBuffer(f);
      return;
    }
  }

  // 2. Dash / backdash
  if (doubleTap(f, IN.F)) {
    f.crouching = 0;
    setState(f, FS.DASH);
    pushEvent(s, p, EV.STEP, 0, f.x, 0, f.z);
    return;
  }
  if (doubleTap(f, IN.B)) {
    f.crouching = 0;
    setState(f, FS.BACKDASH);
    pushEvent(s, p, EV.STEP, 1, f.x, 0, f.z);
    return;
  }

  // 3. Keep dashing unless the player does something else
  if (f.state === FS.DASH && !(dir & (IN.B | IN.D | IN.U))) return;
  if (f.state === FS.BACKDASH && !(dir & (IN.F | IN.D | IN.U))) return;

  // 4. Stance from the held direction
  if (dir & IN.D) {
    f.crouching = 1;
    if (f.state !== FS.CROUCH) setState(f, FS.CROUCH);
    return;
  }
  f.crouching = 0;
  if (dir & IN.U) {
    setState(f, FS.JUMP);
    return;
  }
  const next = dir & IN.F ? FS.WALK_F : dir & IN.B ? FS.WALK_B : FS.IDLE;
  if (f.state !== next) setState(f, next);
}

/** Advance timers and state progression that happen whether or not the player presses anything. */
function progress(s: GameState, p: number, ch: CompiledCharacter, ctrl: boolean): boolean {
  const f = s.fighters[p]!;
  switch (f.state) {
    case FS.ATTACK: {
      f.moveFrame++;
      const m = ch.moves[f.moveId]!;
      if (f.moveFrame > m.total) endMove(f, m);
      else if (f.moveFrame === m.startup && m.height !== 'throw') {
        const tip = m.hitboxes[0];
        pushEvent(s, p, EV.SWING, m.damage, f.x + along(f.dirX, tip ? tip.at[0] : 500), tip ? tip.at[1] : 1200, f.z);
      }
      return true;
    }
    case FS.HITSTUN:
    case FS.BLOCKSTUN:
      if (f.stun > 0) f.stun--;
      if (f.stun === 0) {
        setState(f, f.crouching ? FS.CROUCH : FS.IDLE);
        endCombo(f);
        return false; // actionable from the next frame (PLAN Appendix B)
      }
      return false;
    case FS.DASH:
      if (f.stateFrame >= ch.dash.length) setState(f, FS.IDLE);
      return true;
    case FS.BACKDASH:
      if (f.stateFrame >= ch.backdash.length) setState(f, FS.IDLE);
      return true;
    case FS.JUMP:
      if (f.stateFrame === JUMP_LIFT_FRAME) {
        const dir = intentAt(f, 0);
        const h = dir & IN.F ? JUMP_VX : dir & IN.B ? -JUMP_VX : 0;
        f.vy = JUMP_VY;
        f.vx = along(f.dirX, h);
        f.vz = along(f.dirZ, h);
        pushEvent(s, p, EV.JUMP, 0, f.x, 0, f.z);
      }
      return false;
    case FS.LAND:
      if (f.stateFrame >= LAND_FRAMES) setState(f, FS.IDLE);
      return true;
    case FS.DOWN:
      if (
        f.stateFrame >= DOWN_MAX_FRAMES ||
        (ctrl && f.stateFrame >= DOWN_MIN_FRAMES && (intentAt(f, 0) & (IN_DIRS | 0xf0)) !== 0)
      ) {
        setState(f, FS.WAKEUP);
      }
      return false;
    case FS.WAKEUP:
      if (f.stateFrame >= WAKEUP_FRAMES) {
        setState(f, FS.IDLE);
        endCombo(f);
        return true;
      }
      return false;
    default:
      return true;
  }
}

function applyMovement(f: FighterState, ch: CompiledCharacter): void {
  switch (f.state) {
    case FS.WALK_F:
      moveAlong(f, ch.walkF);
      break;
    case FS.WALK_B:
      moveAlong(f, -ch.walkB);
      break;
    case FS.DASH:
      if (f.stateFrame < ch.dash.length) moveAlong(f, ch.dash[f.stateFrame]!);
      break;
    case FS.BACKDASH:
      if (f.stateFrame < ch.backdash.length) moveAlong(f, -ch.backdash[f.stateFrame]!);
      break;
    case FS.ATTACK: {
      const m = ch.moves[f.moveId]!;
      if (m.movement) {
        for (const mv of m.movement) {
          if (f.moveFrame >= mv.frames[0] && f.moveFrame <= mv.frames[1]) moveAlong(f, mv.forward);
        }
      }
      break;
    }
  }
}

/** One frame of a fighter's own logic: timers, decisions (if `ctrl`), guard, movement. */
export function updateFighter(s: GameState, p: number, ctrl: boolean): void {
  const f = s.fighters[p]!;
  const ch = ROSTER[f.char]!;
  f.stateFrame++;
  const dir = intentAt(f, 0) & IN_DIRS;

  const mayDecide = progress(s, p, ch, ctrl);
  if (ctrl && mayDecide) decide(s, p, ch, dir);

  computeGuard(f, dir);
  ageBuffer(f);
  applyMovement(f, ch);
}
