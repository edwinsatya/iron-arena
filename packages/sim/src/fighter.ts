import {
  AIR_CONTROL,
  ARENA_R,
  ARENA_WALK_R,
  BUFFER_FRAMES,
  CHARGE_FULL,
  CHARGE_START,
  CHORD_WINDOW,
  DASH_FRAMES,
  DOWN_FRAMES,
  EV,
  FRICTION_PCT,
  FS,
  GETUP_FRAMES,
  GRAVITY,
  JUMP_SQUAT,
  LAND_FRAMES,
  MAX_FALL,
  ULT_FREEZE,
  ULT_MAX,
} from './constants';
import { spawnFor } from './entities';
import { pushEvent } from './events';
import { REQ, type Intent } from './input';
import { DIR8, dist2, isqrt, localToWorld, normalize, pct } from './math';
import { ROSTER } from './roster';
import type { ActionData, CompiledHero, FighterState, GameState } from './types';

export function heroOf(f: FighterState): CompiledHero {
  return ROSTER[f.char]!;
}

export function actionOf(f: FighterState): ActionData | null {
  return f.action >= 0 ? (heroOf(f).actions[f.action] ?? null) : null;
}

export function airborne(f: FighterState): boolean {
  return f.y > 0 || f.vy !== 0;
}

export function setState(f: FighterState, state: number, stun = 0): void {
  f.state = state;
  f.stateFrame = 0;
  f.stun = stun;
  if (state !== FS.ACTION) f.action = -1;
}

/** States that take input. */
function free(f: FighterState): boolean {
  return (
    f.state === FS.IDLE ||
    f.state === FS.RUN ||
    f.state === FS.DASH ||
    f.state === FS.GUARD ||
    f.state === FS.CHARGE
  );
}

export function isInvulnerable(f: FighterState): boolean {
  if (f.invulnFrames > 0) return true;
  if (
    f.state === FS.DOWN ||
    f.state === FS.GETUP ||
    f.state === FS.KO ||
    f.state === FS.FALLING ||
    f.state === FS.WIN
  )
    return true;
  const a = actionOf(f);
  if (f.state === FS.ACTION && a?.invuln && f.actionFrame >= a.invuln[0] && f.actionFrame <= a.invuln[1])
    return true;
  return false;
}

export function hasArmor(f: FighterState): boolean {
  if (f.buffFrames > 0 && f.buffArmor === 1 && f.heldBy < 0) return true;
  const a = actionOf(f);
  return f.state === FS.ACTION && !!a?.armor && f.actionFrame >= a.armor[0] && f.actionFrame <= a.armor[1];
}

function faceDir(f: FighterState, dir: number): void {
  if (dir < 0) return;
  [f.fx, f.fz] = DIR8[dir]!;
}

/** Turn toward the opponent if they're within `range` (and roughly where the stick points). */
function lockOnto(f: FighterState, o: FighterState, range: number, dir: number): void {
  if (dist2(f.x, f.z, o.x, o.z) > range * range) return;
  const [tx, tz] = normalize(o.x - f.x, o.z - f.z, [f.fx, f.fz]);
  if (dir >= 0) {
    const [dx, dz] = DIR8[dir]!;
    if (dx * tx + dz * tz < 400 * 1024) return; // pointing well away from them: trust the stick
  }
  f.fx = tx;
  f.fz = tz;
}

export function startAction(s: GameState, i: number, actionIdx: number, dir: number): void {
  const f = s.fighters[i]!;
  const o = s.fighters[1 - i]!;
  const a = heroOf(f).actions[actionIdx]!;
  faceDir(f, dir);
  if (a.lockOn) lockOnto(f, o, a.lockOn, dir);
  setState(f, FS.ACTION);
  f.action = actionIdx;
  f.actionFrame = 0;
  f.hitMask = 0;
  f.lastHitFrame = -999;
  f.buf = REQ.NONE;
  if (!airborne(f)) {
    f.vx = 0;
    f.vz = 0;
  }
}

function canUseSkill(f: FighterState, slot: number): boolean {
  const h = heroOf(f);
  const a = h.actions[h.skillIdx[slot]!]!;
  return f.cd[slot] === 0 && (!airborne(f) || !!a.air);
}

/** Try to act on a request; true if it was used. */
function tryRequest(s: GameState, i: number, req: number, dir: number): boolean {
  const f = s.fighters[i]!;
  const h = heroOf(f);
  const a = actionOf(f);
  const inAir = airborne(f);
  const inAction = f.state === FS.ACTION && a;
  // A chord's first button already started something: let the skill replace it.
  const chordUpgrade =
    (f.state === FS.ACTION &&
      f.actionFrame <= CHORD_WINDOW &&
      (f.action === h.basicIdx[0] || f.action === h.dashIdx)) ||
    (f.state === FS.JUMP_SQUAT && f.stateFrame <= CHORD_WINDOW) ||
    (f.state === FS.AIR && f.stateFrame <= CHORD_WINDOW && f.y < 300);
  const cancellable = !!inAction && a.cancelFrom !== undefined && f.actionFrame >= a.cancelFrom;
  const open = free(f) || f.state === FS.LAND || cancellable || chordUpgrade;

  if (req === REQ.ULT) {
    if (f.ult < ULT_MAX || !open || inAir) return false;
    if (chordUpgrade && f.y > 0) f.y = 0;
    f.vy = 0;
    f.ult -= ULT_MAX;
    startAction(s, i, h.ultIdx, dir);
    s.freeze = ULT_FREEZE;
    s.freezeOwner = i;
    pushEvent(s, i, EV.ULT, f.char, f.x, f.y, f.z);
    return true;
  }
  if (req >= REQ.SKILL1 && req <= REQ.SKILL3) {
    const slot = req - REQ.SKILL1;
    if (!open) return false;
    if (chordUpgrade && f.state !== FS.ACTION && f.y < 300) {
      f.y = 0;
      f.vy = 0;
    }
    if (!canUseSkill(f, slot)) return false;
    const idx = h.skillIdx[slot]!;
    f.cd[slot] = h.actions[idx]!.cooldown ?? 300;
    startAction(s, i, idx, dir);
    pushEvent(s, i, EV.SKILL, slot, f.x, f.y, f.z);
    return true;
  }
  if (req === REQ.ATTACK) {
    if (inAction && a.chain && f.actionFrame >= a.chain.from && f.actionFrame <= a.chain.to) {
      startAction(s, i, h.ids[a.chain.into]!, dir);
      pushEvent(s, i, EV.SWING, f.action, f.x, f.y, f.z);
      return true;
    }
    if (f.state === FS.AIR) {
      startAction(s, i, h.airIdx, dir);
      pushEvent(s, i, EV.SWING, f.action, f.x, f.y, f.z);
      return true;
    }
    if (f.state === FS.DASH) {
      startAction(s, i, h.dashIdx, dir);
      pushEvent(s, i, EV.SWING, f.action, f.x, f.y, f.z);
      return true;
    }
    if (free(f) || f.state === FS.LAND) {
      startAction(s, i, h.basicIdx[0]!, dir);
      pushEvent(s, i, EV.SWING, f.action, f.x, f.y, f.z);
      return true;
    }
    return false;
  }
  if (req === REQ.JUMP) {
    if (inAir || !(free(f) || cancellable || f.state === FS.LAND)) return false;
    faceDir(f, dir);
    setState(f, FS.JUMP_SQUAT);
    return true;
  }
  if (req === REQ.DASH) {
    if (inAir || !(free(f) || cancellable)) return false;
    faceDir(f, dir);
    setState(f, FS.DASH);
    pushEvent(s, i, EV.DASH, 0, f.x, f.y, f.z);
    return true;
  }
  return false;
}

function runSpeed(f: FighterState): number {
  return pct(heroOf(f).speed, 100 + (f.buffFrames > 0 ? f.buffSpeedPct : 0));
}

/** Keep self-propelled movement on the roof. */
function clampToRoof(f: FighterState): void {
  const d2 = f.x * f.x + f.z * f.z;
  if (d2 <= ARENA_WALK_R * ARENA_WALK_R) return;
  const d = isqrt(d2);
  f.x = Math.trunc((f.x * ARENA_WALK_R) / d);
  f.z = Math.trunc((f.z * ARENA_WALK_R) / d);
}

/** Free-state control: movement, guard, charge, and new actions. */
function control(s: GameState, i: number, it: Intent): void {
  const f = s.fighters[i]!;
  // New request, or a recent one waiting in the buffer
  let req = it.req;
  if (req !== REQ.NONE) {
    f.buf = req;
    f.bufAge = 0;
  } else if (f.buf !== REQ.NONE && f.bufAge <= BUFFER_FRAMES) {
    req = f.buf;
  }
  f.bufAge++;
  if (f.bufAge > BUFFER_FRAMES) f.buf = REQ.NONE;
  if (req !== REQ.NONE && tryRequest(s, i, req, it.dir)) {
    f.buf = REQ.NONE;
    return;
  }

  switch (f.state) {
    case FS.IDLE:
    case FS.RUN:
    case FS.GUARD: {
      if (it.guard) {
        if (f.state !== FS.GUARD) {
          setState(f, FS.GUARD);
          lockOnto(f, s.fighters[1 - i]!, 6000, -1);
        }
        faceDir(f, it.dir);
        f.vx = 0;
        f.vz = 0;
        return;
      }
      if (it.dir >= 0) {
        if (f.state !== FS.RUN) setState(f, FS.RUN);
        faceDir(f, it.dir);
        const sp = runSpeed(f);
        f.vx = (f.fx * sp) >> 10;
        f.vz = (f.fz * sp) >> 10;
      } else {
        if (f.state !== FS.IDLE) setState(f, FS.IDLE);
        f.vx = 0;
        f.vz = 0;
      }
      return;
    }
    case FS.DASH: {
      faceDir(f, it.dir);
      const sp = pct(runSpeed(f), 195);
      f.vx = (f.fx * sp) >> 10;
      f.vz = (f.fz * sp) >> 10;
      if (f.stateFrame >= DASH_FRAMES) setState(f, it.dir >= 0 ? FS.RUN : FS.IDLE);
      return;
    }
    case FS.CHARGE: {
      faceDir(f, it.dir);
      f.vx = 0;
      f.vz = 0;
      if (f.stateFrame === CHARGE_FULL - CHARGE_START) pushEvent(s, i, EV.CHARGED, 0, f.x, f.y, f.z);
      if (!it.attackHeld) {
        if (f.stateFrame >= CHARGE_FULL - CHARGE_START) {
          startAction(s, i, heroOf(f).chargeIdx, it.dir);
          pushEvent(s, i, EV.SWING, f.action, f.x, f.y, f.z);
        } else setState(f, FS.IDLE);
      }
      return;
    }
  }
}

/** One frame of the current action's timeline (spawns happen in entities.ts via `spawnFor`). */
function runAction(s: GameState, i: number, it: Intent): void {
  const f = s.fighters[i]!;
  const a = actionOf(f)!;
  f.actionFrame++;
  const t = f.actionFrame;
  const o = s.fighters[1 - i]!;

  // Movement
  let moving = false;
  for (const m of a.motion ?? []) {
    if (t >= m.frames[0] && t <= m.frames[1]) {
      f.vx = (f.fx * m.speed) >> 10;
      f.vz = (f.fz * m.speed) >> 10;
      moving = true;
    }
  }
  if (!moving && !airborne(f)) {
    f.vx = 0;
    f.vz = 0;
  }
  if (a.jump && t === a.jump.frame) {
    f.vy = a.jump.vy;
    if (f.y === 0 && f.vy > 0) pushEvent(s, i, EV.JUMP, 0, f.x, f.y, f.z);
  }
  if (a.teleport && t === a.teleport.frame) teleport(s, i, a, o);
  if (a.buff && t === a.buff.frame) {
    f.buffFrames = a.buff.frames;
    f.buffArmor = a.buff.armor ? 1 : 0;
    f.buffDamagePct = a.buff.damagePct ?? 0;
    f.buffSpeedPct = a.buff.speedPct ?? 0;
    if (a.buff.heal) f.hp = Math.min(heroOf(f).hp, f.hp + a.buff.heal);
  }

  spawnFor(s, i, a, t);

  // Charge: keep holding Attack through the first strike to start charging
  if (f.action === heroOf(f).basicIdx[0] && t >= a.total && it.attackHeld && f.holdA >= CHARGE_START) {
    setState(f, FS.CHARGE);
    return;
  }

  if (t >= a.total) endAction(s, i);
}

function teleport(s: GameState, i: number, a: ActionData, o: FighterState): void {
  const f = s.fighters[i]!;
  const tp = a.teleport!;
  const from = { x: f.x, z: f.z };
  if (tp.behind) {
    const p = localToWorld(o, -900, 0, 0);
    f.x = p.x;
    f.z = p.z;
    [f.fx, f.fz] = normalize(o.x - f.x, o.z - f.z, [o.fx, o.fz]);
  } else if (tp.toTarget) {
    if (dist2(f.x, f.z, o.x, o.z) <= tp.distance * tp.distance) {
      const [dx, dz] = normalize(f.x - o.x, f.z - o.z, [-o.fx, -o.fz]);
      f.x = o.x + ((dx * 850) >> 10);
      f.z = o.z + ((dz * 850) >> 10);
      [f.fx, f.fz] = [-dx, -dz];
    }
  } else {
    f.x += (f.fx * tp.distance) >> 10;
    f.z += (f.fz * tp.distance) >> 10;
  }
  clampToRoof(f);
  pushEvent(s, i, EV.TELEPORT, from.x, f.x, f.y, f.z);
  // value carries the start x; start z is recoverable from the action — renderer only needs a flash at both ends
  pushEvent(s, i, EV.TELEPORT, -1, from.x, f.y, from.z);
}

export function endAction(s: GameState, i: number): void {
  const f = s.fighters[i]!;
  const o = s.fighters[1 - i]!;
  if (o.heldBy === i) releaseHeld(s, 1 - i);
  if (airborne(f)) setState(f, FS.AIR);
  else setState(f, FS.IDLE);
}

export function releaseHeld(s: GameState, victim: number): void {
  const v = s.fighters[victim]!;
  v.heldBy = -1;
  setState(v, FS.HITSTUN, 12);
  v.vy = 30;
}

/** Advance timers and the state machine for one fighter (before physics). */
export function updateFighter(s: GameState, i: number, it: Intent, ctrl: boolean): void {
  const f = s.fighters[i]!;
  f.stateFrame++;
  if (f.invulnFrames > 0) f.invulnFrames--;
  if (f.buffFrames > 0) f.buffFrames--;
  for (let k = 0; k < 3; k++) if (f.cd[k]! > 0) f.cd[k]!--;

  switch (f.state) {
    case FS.IDLE:
    case FS.RUN:
    case FS.DASH:
    case FS.GUARD:
    case FS.CHARGE:
      if (ctrl) control(s, i, it);
      else {
        f.vx = 0;
        f.vz = 0;
        if (f.state !== FS.IDLE) setState(f, FS.IDLE);
      }
      break;
    case FS.JUMP_SQUAT:
      if (ctrl && it.req >= REQ.SKILL1) tryRequest(s, i, it.req, it.dir);
      if (f.state === FS.JUMP_SQUAT && f.stateFrame >= JUMP_SQUAT) {
        const h = heroOf(f);
        f.vy = h.jumpVy;
        const sp = it.dir >= 0 ? runSpeed(f) : 0;
        f.vx = (f.fx * sp) >> 10;
        f.vz = (f.fz * sp) >> 10;
        setState(f, FS.AIR);
        pushEvent(s, i, EV.JUMP, 0, f.x, f.y, f.z);
      }
      break;
    case FS.AIR:
      if (ctrl && it.req !== REQ.NONE) {
        if (tryRequest(s, i, it.req, it.dir)) break;
      }
      if (it.dir >= 0) {
        const [dx, dz] = DIR8[it.dir]!;
        const sp = runSpeed(f);
        f.vx = clampMag(f.vx + ((dx * AIR_CONTROL) >> 10), sp);
        f.vz = clampMag(f.vz + ((dz * AIR_CONTROL) >> 10), sp);
        faceDir(f, it.dir);
      }
      break;
    case FS.LAND:
      if (ctrl && it.req !== REQ.NONE && tryRequest(s, i, it.req, it.dir)) break;
      f.vx = 0;
      f.vz = 0;
      if (f.stateFrame >= LAND_FRAMES) setState(f, FS.IDLE);
      break;
    case FS.ACTION:
      if (ctrl && it.req !== REQ.NONE) {
        // Chains, cancels and chord upgrades; otherwise remember the press briefly
        if (!tryRequest(s, i, it.req, it.dir)) {
          f.buf = it.req;
          f.bufAge = 0;
        } else break;
      } else if (ctrl && f.buf !== REQ.NONE && f.bufAge <= BUFFER_FRAMES) {
        if (tryRequest(s, i, f.buf, it.dir)) {
          f.buf = REQ.NONE;
          break;
        }
      }
      f.bufAge++;
      if (f.state === FS.ACTION && it.guard && ctrl) {
        const a = actionOf(f)!;
        if (a.cancelFrom !== undefined && f.actionFrame >= a.cancelFrom && !airborne(f)) {
          setState(f, FS.GUARD);
          break;
        }
      }
      runAction(s, i, it);
      break;
    case FS.HITSTUN:
    case FS.BLOCKSTUN:
    case FS.GUARD_BREAK:
    case FS.DIZZY:
      f.vx = pct(f.vx, FRICTION_PCT);
      f.vz = pct(f.vz, FRICTION_PCT);
      if (f.stun > 0) f.stun--;
      if (f.stun === 0 && !airborne(f)) recover(f);
      break;
    case FS.LAUNCHED:
      break; // physics lands it
    case FS.DOWN:
      f.vx = pct(f.vx, 80);
      f.vz = pct(f.vz, 80);
      if (f.stateFrame >= DOWN_FRAMES) setState(f, FS.GETUP);
      break;
    case FS.GETUP:
      if (f.stateFrame >= GETUP_FRAMES) {
        setState(f, FS.IDLE);
        f.invulnFrames = 6;
      }
      break;
    case FS.HELD:
      break;
    case FS.KO:
    case FS.FALLING:
      f.vx = pct(f.vx, 97);
      f.vz = pct(f.vz, 97);
      break;
  }
}

function recover(f: FighterState): void {
  setState(f, FS.IDLE);
  f.comboHits = 0;
  f.comboDamage = 0;
  f.airHits = 0;
}

function clampMag(v: number, m: number): number {
  return v > m ? m : v < -m ? -m : v;
}

/** Move, fall, land, and fall off the roof. */
export function applyPhysics(s: GameState, i: number): void {
  const f = s.fighters[i]!;
  if (f.state === FS.HELD) {
    const h = s.fighters[f.heldBy]!;
    const p = localToWorld(h, 700, 0, 0);
    f.x = p.x;
    f.z = p.z;
    f.y = h.y + 250;
    f.vx = f.vy = f.vz = 0;
    return;
  }
  const a = actionOf(f);
  f.x += f.vx;
  f.z += f.vz;
  const selfPropelled =
    f.state === FS.RUN ||
    f.state === FS.DASH ||
    f.state === FS.AIR ||
    f.state === FS.JUMP_SQUAT ||
    f.state === FS.LAND ||
    f.state === FS.IDLE ||
    f.state === FS.GUARD ||
    f.state === FS.CHARGE ||
    f.state === FS.ACTION;
  if (selfPropelled) clampToRoof(f);

  const overVoid = f.x * f.x + f.z * f.z > ARENA_R * ARENA_R;
  if (f.y > 0 || f.vy !== 0 || overVoid) {
    f.vy = Math.max(-MAX_FALL, f.vy - GRAVITY);
    f.y += f.vy;
    if (f.y <= 0 && !overVoid) {
      f.y = 0;
      const fallSpeed = f.vy;
      f.vy = 0;
      land(s, i, fallSpeed, a);
    } else if (overVoid && f.y <= 0 && f.state !== FS.FALLING && f.state !== FS.KO) {
      setState(f, FS.FALLING);
      f.action = -1;
      pushEvent(s, i, EV.FALL, 0, f.x, f.y, f.z);
    }
  }
}

function land(s: GameState, i: number, fallSpeed: number, a: ActionData | null): void {
  const f = s.fighters[i]!;
  switch (f.state) {
    case FS.AIR:
      setState(f, FS.LAND);
      f.vx = 0;
      f.vz = 0;
      pushEvent(s, i, EV.LAND, fallSpeed, f.x, f.y, f.z);
      break;
    case FS.ACTION:
      if (a?.endOnLand) {
        endAction(s, i);
        setState(f, FS.LAND, 0);
        f.stateFrame = -4; // heavier landing after an air attack
        pushEvent(s, i, EV.LAND, fallSpeed, f.x, f.y, f.z);
      }
      break;
    case FS.LAUNCHED:
      setState(f, FS.DOWN);
      f.vx = pct(f.vx, 50);
      f.vz = pct(f.vz, 50);
      f.comboHits = 0;
      f.comboDamage = 0;
      f.airHits = 0;
      pushEvent(s, i, EV.LAND, fallSpeed, f.x, f.y, f.z);
      break;
    case FS.KO:
      f.vx = pct(f.vx, 40);
      f.vz = pct(f.vz, 40);
      break;
    case FS.HITSTUN:
    case FS.DIZZY:
    case FS.BLOCKSTUN:
    case FS.GUARD_BREAK:
      break;
    case FS.JUMP_SQUAT:
      break;
    default:
      if (f.state !== FS.HELD && f.state !== FS.DOWN && f.state !== FS.GETUP && f.state !== FS.WIN) {
        setState(f, FS.IDLE);
      }
  }
}

/** Fighters can't overlap; held fighters are exempt. */
export function pushApart(s: GameState): void {
  const [a, b] = s.fighters;
  if (a.state === FS.HELD || b.state === FS.HELD) return;
  if (a.y > 1500 + b.y || b.y > 1500 + a.y) return;
  const min = 2 * 400;
  const d2 = dist2(a.x, a.z, b.x, b.z);
  if (d2 >= min * min) return;
  const d = isqrt(d2);
  // Exactly on top of each other: whoever faces right moves left (side view has no sideways)
  const [nx, nz] = normalize(b.x - a.x, b.z - a.z, [a.fx >= 0 ? 1024 : -1024, 0]);
  const push = Math.trunc((min - d + 1) / 2);
  a.x -= (nx * push) >> 10;
  a.z -= (nz * push) >> 10;
  b.x += (nx * push) >> 10;
  b.z += (nz * push) >> 10;
}
