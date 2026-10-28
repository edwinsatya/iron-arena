import {
  CH_BONUS_STUN,
  DEFAULT_PUSH_BLOCK,
  DEFAULT_PUSH_HIT,
  EV,
  FS,
  JUGGLE_CARRY,
  JUGGLE_POP,
  KND_VX,
  KND_VY,
  LOW_WHIFF_HEIGHT,
  MAX_JUGGLE_HITS,
  WAKEUP_INVULN_FRAMES,
} from './constants';
import { pushEvent } from './events';
import { moveOf, setState } from './fighter';
import { clearBuffer } from './input';
import { along, localToWorld, scaledDamage, sphereHitsCylinder, stunFromAdvantage } from './math';
import type { CompiledMove } from './moves';
import { ROSTER } from './roster';
import type { Cylinder, FighterState, GameState } from './types';

/** Lying on the ground: only groundHit moves can touch this. */
const DOWN_HURT: Cylinder[] = [{ r: 420, y0: 0, y1: 320, zone: 'low' }];

interface Contact {
  a: number;
  move: CompiledMove;
  isThrow: boolean;
  x: number;
  y: number;
  z: number;
}

/** The defender's situation at the moment contacts are found (before any are applied). */
interface DefenderSnapshot {
  state: number;
  guard: number;
  inStartupOrActive: boolean;
  armored: boolean;
}

export function hurtCylinders(f: FighterState): Cylinder[] {
  const ch = ROSTER[f.char]!;
  if (f.state === FS.AIR) return ch.hurt.air;
  if (f.state === FS.DOWN) return DOWN_HURT;
  return f.crouching ? ch.hurt.crouch : ch.hurt.stand;
}

function crushActive(f: FighterState, type: 'high' | 'low'): boolean {
  if (f.state !== FS.ATTACK) return false;
  const c = moveOf(f)!.crush;
  return !!c && c.type === type && f.moveFrame >= c.frames[0] && f.moveFrame <= c.frames[1];
}

/** Invulnerability and hit-height rules (PLAN §2.4): can `m` touch the defender at all? */
function hittable(def: FighterState, m: CompiledMove): boolean {
  switch (def.state) {
    case FS.KO:
    case FS.THROW:
    case FS.THROWN:
      return false;
    case FS.DOWN:
      return m.has('groundHit');
    case FS.WAKEUP:
      return def.stateFrame > WAKEUP_INVULN_FRAMES;
    case FS.AIR:
      return def.juggleLeft > 0;
  }
  if (m.height === 'high' && (def.crouching === 1 || crushActive(def, 'high'))) return false;
  if (m.height === 'low' && ((def.state === FS.JUMP && def.y > LOW_WHIFF_HEIGHT) || crushActive(def, 'low'))) {
    return false;
  }
  return true;
}

function throwable(def: FighterState): boolean {
  if (def.y !== 0 || def.crouching) return false;
  switch (def.state) {
    case FS.IDLE:
    case FS.WALK_F:
    case FS.WALK_B:
    case FS.DASH:
    case FS.BACKDASH:
    case FS.LAND:
    case FS.ATTACK:
      return true;
    default:
      return false;
  }
}

function findContact(s: GameState, a: number): Contact | null {
  const att = s.fighters[a]!;
  const def = s.fighters[1 - a]!;
  if (att.state !== FS.ATTACK || att.hitLanded) return null;
  const m = moveOf(att)!;

  if (m.height === 'throw') {
    if (att.moveFrame < m.startup || att.moveFrame > m.lastActive || !throwable(def)) return null;
    const dx = def.x - att.x;
    const dz = def.z - att.z;
    const range = m.throw!.range;
    if (dx * dx + dz * dz > range * range) return null;
    if (dx * att.dirX + dz * att.dirZ <= 0) return null; // must be in front
    return {
      a,
      move: m,
      isThrow: true,
      x: Math.trunc((att.x + def.x) / 2),
      y: 1200,
      z: Math.trunc((att.z + def.z) / 2),
    };
  }

  if (!hittable(def, m)) return null;
  const cylinders = hurtCylinders(def);
  for (const hb of m.hitboxes) {
    if (att.moveFrame < hb.frames[0] || att.moveFrame > hb.frames[1]) continue;
    const c = localToWorld(att, hb.at[0], hb.at[1], hb.at[2]);
    for (const cy of cylinders) {
      if (sphereHitsCylinder(c.x, c.y, c.z, hb.r, def.x, def.z, cy.r, def.y + cy.y0, def.y + cy.y1)) {
        return { a, move: m, isThrow: false, x: c.x, y: c.y, z: c.z };
      }
    }
  }
  return null;
}

function snapshot(f: FighterState): DefenderSnapshot {
  const m = moveOf(f);
  const inAttack = f.state === FS.ATTACK && m !== null;
  return {
    state: f.state,
    guard: f.guard,
    inStartupOrActive: inAttack && f.moveFrame <= m.lastActive,
    armored:
      inAttack &&
      !!m.armor &&
      f.armorLeft > 0 &&
      f.moveFrame >= m.armor.frames[0] &&
      f.moveFrame <= m.armor.frames[1],
  };
}

function defaultHitstop(damage: number): number {
  return damage < 10 ? 6 : damage < 16 ? 8 : damage < 22 ? 10 : 12;
}

function interrupt(f: FighterState): void {
  if (f.moveId >= 0) {
    f.prevMoveId = f.moveId;
    f.prevMoveFrame = f.moveFrame;
  }
  f.moveId = -1;
  f.moveFrame = 0;
  f.hitLanded = 0;
  f.armorLeft = 0;
}

/** Push `f` away from the attacker by about `distance` mm over the next few frames. */
function knockback(f: FighterState, att: FighterState, distance: number): void {
  f.kbX = along(att.dirX, distance >> 2);
  f.kbZ = along(att.dirZ, distance >> 2);
}

function airborne(f: FighterState, att: FighterState, vy: number, vx: number): void {
  setState(f, FS.AIR);
  f.crouching = 0;
  f.vy = vy;
  f.vx = along(att.dirX, vx);
  f.vz = along(att.dirZ, vx);
  f.kbX = 0;
  f.kbZ = 0;
}

function addHitstop(s: GameState, frames: number): void {
  if (frames > s.hitstop) s.hitstop = frames;
}

function dealDamage(def: FighterState, base: number): number {
  const dmg = scaledDamage(base, def.comboHits);
  def.hp = Math.max(0, def.hp - dmg);
  def.comboHits++;
  def.comboDamage += dmg;
  return dmg;
}

function applyBlock(s: GameState, c: Contact): void {
  const att = s.fighters[c.a]!;
  const def = s.fighters[1 - c.a]!;
  const m = c.move;
  interrupt(def);
  setState(def, FS.BLOCKSTUN);
  def.stun = m.blockstun;
  def.comboHits = 0;
  def.comboDamage = 0;
  knockback(def, att, m.pushback?.block ?? DEFAULT_PUSH_BLOCK);
  att.hitLanded = 2;
  addHitstop(s, Math.max(4, (m.hitstop ?? defaultHitstop(m.damage)) - 2));
  pushEvent(s, c.a, EV.BLOCK, m.damage, c.x, c.y, c.z);
}

function applyArmor(s: GameState, c: Contact): void {
  const att = s.fighters[c.a]!;
  const def = s.fighters[1 - c.a]!;
  def.hp = Math.max(0, def.hp - c.move.damage);
  def.armorLeft--;
  att.hitLanded = 1;
  addHitstop(s, defaultHitstop(c.move.damage));
  pushEvent(s, c.a, EV.ARMOR, c.move.damage, c.x, c.y, c.z);
}

function applyGroundHit(s: GameState, c: Contact): void {
  const att = s.fighters[c.a]!;
  const def = s.fighters[1 - c.a]!;
  const dmg = dealDamage(def, c.move.damage);
  def.stateFrame = 0; // keeps them down a little longer
  att.hitLanded = 1;
  addHitstop(s, c.move.hitstop ?? defaultHitstop(c.move.damage));
  pushEvent(s, c.a, EV.HIT, dmg, c.x, c.y, c.z);
}

function applyJuggle(s: GameState, c: Contact): void {
  const att = s.fighters[c.a]!;
  const def = s.fighters[1 - c.a]!;
  const m = c.move;
  const dmg = dealDamage(def, m.damage);
  def.juggleLeft--;
  if (m.onHit === 'knockdown' || m.onHit === 'wallSplat') {
    // Combo ender: knocks them away, no more juggling.
    def.vy = 18;
    def.vx = along(att.dirX, 30);
    def.vz = along(att.dirZ, 30);
    def.juggleLeft = 0;
  } else {
    def.vy = JUGGLE_POP + (m.onHit === 'launch' && m.launch ? m.launch.vy >> 2 : 0);
    def.vx = along(att.dirX, JUGGLE_CARRY);
    def.vz = along(att.dirZ, JUGGLE_CARRY);
  }
  att.hitLanded = 1;
  addHitstop(s, m.hitstop ?? defaultHitstop(m.damage));
  pushEvent(s, c.a, EV.HIT, dmg, c.x, c.y, c.z);
}

function applyHit(s: GameState, c: Contact, counter: boolean): void {
  const att = s.fighters[c.a]!;
  const def = s.fighters[1 - c.a]!;
  const m = c.move;
  const dmg = dealDamage(def, m.damage);
  const outcome = counter && m.onCounterHit !== undefined ? m.onCounterHit : m.onHit;
  const bonus = counter && m.onCounterHit === undefined ? CH_BONUS_STUN : 0;
  interrupt(def);
  if (typeof outcome === 'number') {
    setState(def, FS.HITSTUN);
    def.stun = stunFromAdvantage(outcome, m.active, m.recovery) + bonus;
    knockback(def, att, m.pushback?.hit ?? DEFAULT_PUSH_HIT);
  } else if (outcome === 'launch') {
    const l = m.launch ?? { vy: 90, vx: 4 };
    airborne(def, att, l.vy, l.vx);
    def.juggleLeft = MAX_JUGGLE_HITS - 1;
  } else {
    // knockdown (wallSplat behaves like a knockdown until walls exist — PLAN Phase 4)
    airborne(def, att, KND_VY, KND_VX);
    def.juggleLeft = 0;
  }
  att.hitLanded = 1;
  addHitstop(s, (m.hitstop ?? defaultHitstop(m.damage)) + (counter ? 3 : 0));
  pushEvent(s, c.a, counter ? EV.COUNTER : EV.HIT, dmg, c.x, c.y, c.z);
}

function grab(s: GameState, c: Contact): void {
  const att = s.fighters[c.a]!;
  const def = s.fighters[1 - c.a]!;
  const m = c.move;
  att.hitLanded = 1;
  setState(att, FS.THROW); // keeps moveId so the renderer knows which throw
  interrupt(def);
  setState(def, FS.THROWN);
  def.crouching = 0;
  def.thrownBy = m.index;
  def.breakLeft = m.throw!.breakWindow;
  for (const f of [att, def]) {
    f.vx = 0;
    f.vy = 0;
    f.vz = 0;
    f.kbX = 0;
    f.kbZ = 0;
  }
  clearBuffer(def); // the break must be pressed after the grab
}

function separate(s: GameState, a: number, distance: number): void {
  const att = s.fighters[a]!;
  const def = s.fighters[1 - a]!;
  att.kbX = along(att.dirX, -(distance >> 2));
  att.kbZ = along(att.dirZ, -(distance >> 2));
  def.kbX = along(att.dirX, distance >> 2);
  def.kbZ = along(att.dirZ, distance >> 2);
}

function breakThrow(s: GameState, a: number): void {
  const att = s.fighters[a]!;
  const def = s.fighters[1 - a]!;
  for (const f of [att, def]) {
    interrupt(f);
    setState(f, FS.BLOCKSTUN);
    f.stun = 18;
    f.crouching = 0;
    f.thrownBy = -1;
    f.breakLeft = 0;
  }
  separate(s, a, 320);
  clearBuffer(def);
  pushEvent(s, 1 - a, EV.THROW_BREAK, 0, Math.trunc((att.x + def.x) / 2), 1300, Math.trunc((att.z + def.z) / 2));
}

function completeThrow(s: GameState, a: number, m: CompiledMove): void {
  const att = s.fighters[a]!;
  const def = s.fighters[1 - a]!;
  if (m.throw!.switchSides) {
    const x = att.x;
    const z = att.z;
    att.x = def.x;
    att.z = def.z;
    def.x = x;
    def.z = z;
  }
  const dmg = dealDamage(def, m.damage);
  def.thrownBy = -1;
  def.breakLeft = 0;
  def.juggleLeft = 0;
  setState(def, def.hp > 0 ? FS.DOWN : FS.KO);
  interrupt(att);
  setState(att, FS.LAND);
  addHitstop(s, 8);
  pushEvent(s, a, EV.THROW, dmg, def.x, 300, def.z);
}

/** Grabbed fighters may break the throw; otherwise it completes after its animation. */
export function updateThrows(s: GameState): void {
  for (let d = 0; d < 2; d++) {
    const def = s.fighters[d]!;
    if (def.state !== FS.THROWN) continue;
    const a = 1 - d;
    const att = s.fighters[a]!;
    const m = ROSTER[att.char]!.moves[def.thrownBy]!;
    const t = m.throw!;
    if (def.breakLeft > 0) {
      if (def.bufBtn && (def.bufBtn & t.breakButtons) === t.breakButtons) {
        breakThrow(s, a);
        continue;
      }
      def.breakLeft--;
    } else if (def.stateFrame >= t.breakWindow + t.duration) {
      completeThrow(s, a, m);
    }
  }
}

/**
 * Two-phase hit resolution (PLAN §2.4): find contacts for both fighters first, then apply them
 * together. Both hitting on the same frame is a trade — no "P1 wins ties" bias.
 */
export function resolveCombat(s: GameState): void {
  const c0 = findContact(s, 0);
  const c1 = findContact(s, 1);
  if (!c0 && !c1) return;

  if (c0 && c1 && c0.isThrow && c1.isThrow) {
    breakThrow(s, 0); // simultaneous throws cancel out
    return;
  }
  // A strike beats a throw on the same frame.
  let list: Contact[];
  if (c0 && c1) list = c0.isThrow ? [c1] : c1.isThrow ? [c0] : [c0, c1];
  else list = [(c0 ?? c1)!];
  const trade = list.length === 2;
  const snaps = list.map((c) => snapshot(s.fighters[1 - c.a]!));

  list.forEach((c, i) => {
    const snap = snaps[i]!;
    if (c.isThrow) {
      grab(s, c);
      return;
    }
    if (snap.state === FS.DOWN) return applyGroundHit(s, c);
    if (snap.state === FS.AIR) return applyJuggle(s, c);
    const h = c.move.height;
    const blocked = (snap.guard === 1 && (h === 'high' || h === 'mid')) || (snap.guard === 2 && h === 'low');
    if (blocked) return applyBlock(s, c);
    if (snap.armored && h !== 'low') return applyArmor(s, c);
    applyHit(s, c, !trade && snap.inStartupOrActive);
  });
}
