import {
  BLOCK_PUSH_PCT,
  BLOCK_STUN_PCT,
  CHIP_PCT,
  COMBO_SCALE,
  DEFAULT_HITSTOP,
  DEFAULT_HITSTUN,
  EV,
  FS,
  GUARD_BREAK_DAMAGE_PCT,
  GUARD_BREAK_FRAMES,
  JUGGLE_DECAY_PCT,
  JUGGLE_LIMIT,
  PHASE,
  ULT_GAIN_DEALT_PCT,
  ULT_GAIN_TAKEN_PCT,
  ULT_MAX,
} from './constants';
import { areaSpec, explode, projectileSpec } from './entities';
import { pushEvent } from './events';
import {
  actionOf,
  airborne,
  hasArmor,
  heroOf,
  isInvulnerable,
  releaseHeld,
  setState,
  startAction,
} from './fighter';
import { dist2, localToWorld, normalize, pct, sphereHitsCylinder } from './math';
import { ROSTER } from './roster';
import type { FighterState, GameState, HitSpec } from './types';

export const HURT_R = 380;
export const HURT_H = 1700;

/** The fighter's hurt cylinder (feet-relative bottom/top in world mm). */
export function hurtCylinder(f: FighterState): { r: number; y0: number; y1: number } {
  const low = f.state === FS.DOWN || f.state === FS.GETUP;
  return { r: HURT_R, y0: f.y, y1: f.y + (low ? 500 : HURT_H) };
}

interface Contact {
  attacker: number;
  victim: number;
  hit: HitSpec;
  srcX: number;
  srcZ: number;
  /** Skills and ultimates chip through guard. */
  chip: boolean;
  release: boolean;
  /** What to mark when it connects. */
  kind: 0 | 1 | 2;
  ref: number;
  sub: number;
}

/** Phase 1: find every contact this frame (nothing changes yet). */
function collect(s: GameState): Contact[] {
  const out: Contact[] = [];
  for (const i of [0, 1] as const) {
    const f = s.fighters[i];
    const v = s.fighters[1 - i]!;
    const a = actionOf(f);
    if (f.state === FS.ACTION && a?.strikes) {
      const kindOf = kindOfAction(f, f.action);
      a.strikes.forEach((st, k) => {
        if (f.actionFrame < st.frames[0] || f.actionFrame > st.frames[1]) return;
        if (st.rehit) {
          if (f.actionFrame - f.lastHitFrame < st.rehit) return;
        } else if (f.hitMask & (1 << k)) return;
        if (st.release) {
          if (v.heldBy === i) {
            out.push({
              attacker: i,
              victim: 1 - i,
              hit: st.hit,
              srcX: f.x,
              srcZ: f.z,
              chip: false,
              release: true,
              kind: 0,
              ref: i,
              sub: k,
            });
          }
          return;
        }
        const p = localToWorld(f, st.at[0], st.at[1], st.at[2]);
        const c = hurtCylinder(v);
        if (sphereHitsCylinder(p.x, p.y, p.z, st.r, v.x, v.z, c.r, c.y0, c.y1)) {
          out.push({
            attacker: i,
            victim: 1 - i,
            hit: st.hit,
            srcX: f.x,
            srcZ: f.z,
            chip: kindOf,
            release: false,
            kind: 0,
            ref: i,
            sub: k,
          });
        }
      });
    }
  }
  s.projectiles.forEach((p, idx) => {
    if (p.hit === 1) return;
    const spec = projectileSpec(p.char, p.action, p.spec);
    if (p.age < (spec.armAfter ?? 0)) return;
    const v = s.fighters[1 - p.owner]!;
    const c = hurtCylinder(v);
    if (sphereHitsCylinder(p.x, p.y, p.z, spec.r, v.x, v.z, c.r, c.y0, c.y1)) {
      const chip = kindOfActionIdx(p.char, p.action);
      out.push({
        attacker: p.owner,
        victim: 1 - p.owner,
        hit: spec.hit,
        srcX: p.x - p.vx * 4,
        srcZ: p.z - p.vz * 4,
        chip,
        release: false,
        kind: 1,
        ref: idx,
        sub: 0,
      });
    }
  });
  s.areas.forEach((ar, idx) => {
    const spec = areaSpec(ar.char, ar.action, ar.spec);
    if (ar.age < spec.delay || ar.age >= spec.delay + spec.active) return;
    const vi = 1 - ar.owner;
    const v = s.fighters[vi]!;
    if (spec.every) {
      if (ar.age - ar.lastHit < spec.every) return;
    } else if (ar.hitMask & (1 << vi)) return;
    const rr = spec.r + HURT_R;
    if (v.y < 2600 && dist2(ar.x, ar.z, v.x, v.z) <= rr * rr) {
      const chip = kindOfActionIdx(ar.char, ar.action);
      out.push({
        attacker: ar.owner,
        victim: vi,
        hit: spec.hit,
        srcX: ar.x,
        srcZ: ar.z,
        chip,
        release: false,
        kind: 2,
        ref: idx,
        sub: 0,
      });
    }
  });
  return out;
}

/** Skills, ultimates and their follow-ups chip through guard. */
function kindOfActionIdx(char: number, action: number): boolean {
  const h = ROSTER[char]!;
  return h.skillIdx.includes(action) || action === h.ultIdx || h.actions[action]?.cooldown !== undefined;
}

function kindOfAction(f: FighterState, action: number): boolean {
  return kindOfActionIdx(f.char, action);
}

/** Phase 2: apply contacts. */
export function resolveCombat(s: GameState): void {
  const contacts = collect(s);
  for (const c of contacts) {
    const before = c.kind === 0 ? s.fighters[c.ref]!.action : -1;
    const connected = applyHit(s, c);
    if (!connected) continue;
    if (c.kind === 0) {
      const f = s.fighters[c.ref]!;
      if (f.action !== before) continue; // switched into a follow-up (grab): its strikes start fresh
      f.hitMask |= 1 << c.sub;
      f.lastHitFrame = f.actionFrame;
    } else if (c.kind === 1) {
      const p = s.projectiles[c.ref]!;
      p.hit = 1;
      if (projectileSpec(p.char, p.action, p.spec).explode) explode(s, p);
    } else {
      const ar = s.areas[c.ref]!;
      ar.hitMask |= 1 << c.victim;
      ar.lastHit = ar.age;
    }
  }
}

/** True if the attack connected (hit, block, armor or counter) and should be used up. */
function applyHit(s: GameState, c: Contact): boolean {
  const atk = s.fighters[c.attacker]!;
  const v = s.fighters[c.victim]!;
  const hit = c.hit;
  if (!c.release) {
    if (isInvulnerable(v) || v.state === FS.HELD) return false;
    // Too many air hits: the victim drops out of the juggle
    if (v.state === FS.LAUNCHED && v.airHits >= JUGGLE_LIMIT) return false;
  }
  // Mines and grenades only explode
  if (hit.damage === 0 && !hit.kb && !hit.stun && !hit.grab && !hit.vy) return true;

  // Counter stance
  const va = actionOf(v);
  if (!c.release && v.state === FS.ACTION && va?.counter && !hit.unblockable && !hit.grab) {
    if (v.actionFrame >= va.counter.frames[0] && v.actionFrame <= va.counter.frames[1]) {
      startAction(s, c.victim, heroOf(v).ids[va.counter.into]!, -1);
      v.invulnFrames = 4;
      pushEvent(s, c.victim, EV.COUNTER, 0, v.x, v.y + 1000, v.z);
      s.hitstop = Math.max(s.hitstop, 10);
      return true;
    }
  }

  const [ax, az] = normalize(v.x - c.srcX, v.z - c.srcZ, [atk.fx, atk.fz]);
  const [kx, kz] = hit.kbAlongFacing ? [atk.fx, atk.fz] : [ax, az];
  const hx = v.x;
  const hy = v.y + 1100;
  const hz = v.z;

  // Guard: front-facing, standing, not unblockable
  const guarding =
    (v.state === FS.GUARD || v.state === FS.BLOCKSTUN) && !hit.unblockable && !hit.grab && !c.release;
  if (guarding) {
    const front = v.fx * (c.srcX - v.x) + v.fz * (c.srcZ - v.z) > 0;
    if (front) {
      if (hit.guardBreak) {
        const dmg = Math.max(1, pct(scaled(s, c, hit.damage), GUARD_BREAK_DAMAGE_PCT));
        damage(s, c, dmg);
        setState(v, FS.GUARD_BREAK, GUARD_BREAK_FRAMES);
        v.vx = (kx * 30) >> 10;
        v.vz = (kz * 30) >> 10;
        pushEvent(s, c.victim, EV.GUARD_BREAK, dmg, hx, hy, hz);
        s.hitstop = Math.max(s.hitstop, 10);
        return true;
      }
      const chip = c.chip ? Math.max(1, pct(hit.damage, CHIP_PCT)) : 0;
      if (chip) damage(s, c, chip);
      setState(v, FS.BLOCKSTUN, Math.max(6, pct(hit.hitstun ?? DEFAULT_HITSTUN, BLOCK_STUN_PCT)));
      const push = Math.max(14, pct(Math.abs(hit.kb ?? 20), BLOCK_PUSH_PCT));
      v.vx = (kx * push) >> 10;
      v.vz = (kz * push) >> 10;
      pushEvent(s, c.victim, EV.BLOCK, chip, hx, hy, hz);
      s.hitstop = Math.max(s.hitstop, 3);
      return true;
    }
  }

  const dmg = scaled(s, c, hit.damage);

  // Armor: take the damage, keep going (grabs and held releases ignore armor)
  if (!hit.grab && !c.release && hasArmor(v) && v.hp - dmg > 0) {
    damage(s, c, Math.max(1, pct(dmg, 70)));
    pushEvent(s, c.victim, EV.ARMOR, dmg, hx, hy, hz);
    s.hitstop = Math.max(s.hitstop, 4);
    return true;
  }

  damage(s, c, dmg);
  v.comboHits++;
  v.comboDamage += dmg;
  if (v.comboHits > atk.bestCombo) atk.bestCombo = v.comboHits;
  pushEvent(s, c.victim, EV.HIT, dmg, hx, hy, hz);
  s.hitstop = Math.max(s.hitstop, hit.hitstop ?? DEFAULT_HITSTOP);

  // A holder who gets hit lets go
  if (atk.heldBy === c.victim) releaseHeld(s, c.attacker);
  if (c.release) v.heldBy = -1;

  if (v.hp <= 0 && s.phase === PHASE.FIGHT) {
    setState(v, FS.KO);
    v.vy = 70;
    v.vx = (kx * Math.max(30, hit.kb ?? 30)) >> 10;
    v.vz = (kz * Math.max(30, hit.kb ?? 30)) >> 10;
    pushEvent(s, c.victim, EV.KO, 0, hx, hy, hz);
    return true;
  }

  if (hit.grab) {
    setState(v, FS.HELD);
    v.heldBy = c.attacker;
    startAction(s, c.attacker, heroOf(atk).ids[hit.grab]!, -1);
    pushEvent(s, c.attacker, EV.GRAB, 0, hx, hy, hz);
    return true;
  }

  const kb = hit.kb ?? 0;
  const inAir = airborne(v) || v.state === FS.LAUNCHED;
  if (hit.vy || hit.knockdown || inAir) {
    const base = hit.vy ?? (hit.knockdown ? 34 : 40);
    const vy = Math.max(18, pct(base, 100 - JUGGLE_DECAY_PCT * v.airHits));
    setState(v, FS.LAUNCHED);
    v.vy = vy;
    if (v.y === 0) v.y = 1;
    v.airHits++;
  } else if (hit.stun) {
    setState(v, FS.DIZZY, hit.stun);
    pushEvent(s, c.victim, EV.DIZZY, hit.stun, hx, hy, hz);
  } else {
    setState(v, FS.HITSTUN, hit.hitstun ?? DEFAULT_HITSTUN);
  }
  v.vx = (kx * kb) >> 10;
  v.vz = (kz * kb) >> 10;
  // Face the attacker when hit on the ground
  if (!inAir && v.state !== FS.LAUNCHED) [v.fx, v.fz] = normalize(c.srcX - v.x, c.srcZ - v.z, [v.fx, v.fz]);
  return true;
}

function scaled(s: GameState, c: Contact, base: number): number {
  const atk = s.fighters[c.attacker]!;
  const v = s.fighters[c.victim]!;
  const step = COMBO_SCALE[Math.min(v.comboHits, COMBO_SCALE.length - 1)]!;
  let d = pct(base, step);
  if (atk.buffFrames > 0) d = pct(d, 100 + atk.buffDamagePct);
  d = pct(d, heroOf(v).defensePct);
  return Math.max(base > 0 ? 1 : 0, d);
}

function damage(s: GameState, c: Contact, dmg: number): void {
  const atk = s.fighters[c.attacker]!;
  const v = s.fighters[c.victim]!;
  v.hp = Math.max(0, v.hp - dmg);
  atk.totalDamage += dmg;
  if (atk.state === FS.ACTION && atk.action === heroOf(atk).ultIdx) return; // no meter from the ultimate itself
  atk.ult = Math.min(ULT_MAX, atk.ult + pct(dmg, ULT_GAIN_DEALT_PCT));
  v.ult = Math.min(ULT_MAX, v.ult + pct(dmg, ULT_GAIN_TAKEN_PCT));
}
