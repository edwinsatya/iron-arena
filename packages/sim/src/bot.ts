import { BTN } from '@neonfist/shared';
import { FS, ULT_MAX } from './constants';
import { dist2, isqrt } from './math';
import { ROSTER } from './roster';
import type { GameState } from './types';

function makeRng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  0,
  0,
  BTN.UP,
  BTN.DOWN,
  BTN.LEFT,
  BTN.RIGHT,
  BTN.UP | BTN.RIGHT,
  BTN.UP | BTN.LEFT,
  BTN.DOWN | BTN.RIGHT,
  BTN.DOWN | BTN.LEFT,
];
const BUTTONS = [
  0,
  BTN.ATTACK,
  BTN.ATTACK,
  BTN.ATTACK,
  BTN.GUARD,
  BTN.JUMP,
  BTN.ATTACK | BTN.GUARD,
  BTN.ATTACK | BTN.JUMP,
  BTN.GUARD | BTN.JUMP,
  BTN.SKILL1,
  BTN.SKILL2,
  BTN.SKILL3,
  BTN.ULT,
];

/**
 * A random "player" for soak tests and synctests: holds directions, taps and holds buttons,
 * double-taps to dash, chords skills. Exercises every system without looking at the state.
 */
export function randomBot(seed: number): () => number {
  const r = makeRng(seed);
  let dir = 0;
  let hold = 0;
  let btn = 0;
  let btnHold = 0;
  let script: number[] = [];
  return () => {
    if (script.length) return script.shift()!;
    if (hold-- <= 0) {
      dir = DIRS[Math.floor(r() * DIRS.length)]!;
      hold = 2 + Math.floor(r() * 20);
      if (r() < 0.07 && dir) script = [dir, 0, dir, dir, dir, dir];
    }
    if (btnHold-- <= 0) {
      btn = r() < 0.3 ? BUTTONS[Math.floor(r() * BUTTONS.length)]! : 0;
      btnHold = btn === BTN.ATTACK && r() < 0.15 ? 40 : 1 + Math.floor(r() * 4);
    }
    return dir | btn;
  };
}

/** World direction → screen bits (screen-up is world −z, as the default camera sees it). */
function bitsToward(dx: number, dz: number, dead = 250): number {
  let b = 0;
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (dx > dead && dx * 5 > az * 2) b |= BTN.RIGHT;
  if (dx < -dead && -dx * 5 > az * 2) b |= BTN.LEFT;
  if (dz > dead && dz * 5 > ax * 2) b |= BTN.DOWN;
  if (dz < -dead && -dz * 5 > ax * 2) b |= BTN.UP;
  return b;
}

export interface CpuOptions {
  /** 0 = easy, 1 = normal, 2 = hard. */
  level: number;
}

/**
 * The computer opponent: reads the state and presses buttons like a player would.
 * Runs on the client only (vs CPU, training, attract mode) — never part of the simulation.
 */
export function cpuBot(seed: number, opts: CpuOptions = { level: 1 }) {
  const r = makeRng(seed);
  const react = [0.2, 0.45, 0.7][opts.level] ?? 0.45;
  let prev = 0;
  let wander = 0;
  let wanderBits = 0;
  let holdCharge = 0;
  return (s: GameState, me: number): number => {
    const f = s.fighters[me]!;
    const o = s.fighters[1 - me]!;
    const hero = ROSTER[f.char]!;
    const ranged = hero.role === 'Gunner' || hero.role === 'Mage';
    const dx = o.x - f.x;
    const dz = o.z - f.z;
    const dist = isqrt(dx * dx + dz * dz);
    const toward = bitsToward(dx, dz);
    // Back off toward the middle of the roof, never straight at the edge
    const away = bitsToward(-dx * 2 - f.x, -dz * 2 - f.z);
    const radius = isqrt(f.x * f.x + f.z * f.z);
    let out = 0;

    const press = (b: number) => {
      // Buttons must be released between presses
      if ((prev & b) === b) return 0;
      return b;
    };

    if (s.phase !== 1) {
      prev = 0;
      return 0;
    }

    // Charging: hold Attack, then let go
    if (holdCharge > 0) {
      holdCharge--;
      out = holdCharge > 0 ? BTN.ATTACK : 0;
      prev = out;
      return out;
    }

    const threatened =
      o.state === FS.ACTION &&
      dist < (ROSTER[o.char]!.role === 'Brawler' || ROSTER[o.char]!.role === 'Swordsman' ? 2600 : 9000);
    const projectileIncoming = s.projectiles.some(
      (p) => p.owner !== me && dist2(p.x, p.z, f.x, f.z) < 2200 * 2200,
    );

    // Stay away from the edge
    if (radius > (ranged ? 5600 : 6400)) {
      out |= bitsToward(-f.x, -f.z, 0);
      if (r() < 0.05) out |= press(BTN.JUMP);
      prev = out;
      return out;
    }

    const free = f.state === FS.IDLE || f.state === FS.RUN || f.state === FS.GUARD || f.state === FS.DASH;
    if ((threatened || projectileIncoming) && free && r() < react) {
      out = BTN.GUARD | (r() < 0.2 ? toward : 0);
      prev = out;
      return out;
    }

    // Ranged heroes escape when someone is in their face
    if (ranged && dist < 2000 && free) {
      const k = hero.role === 'Gunner' ? 1 : 2;
      if (f.cd[k] === 0 && r() < 0.08 + react * 0.1) {
        out = away | press([BTN.SKILL1, BTN.SKILL2, BTN.SKILL3][k]!);
        prev = out;
        return out;
      }
    }

    // Ultimate when it will land
    if (f.ult >= ULT_MAX && dist < (ranged ? 11000 : 7000) && r() < 0.05 + react * 0.1) {
      out = press(BTN.ULT);
      prev = out;
      return out;
    }

    // Skills
    const ready = [0, 1, 2].filter((k) => f.cd[k] === 0);
    if (ready.length && r() < 0.03 + react * 0.05) {
      const k = ready[Math.floor(r() * ready.length)]!;
      const range = ranged ? 8500 : k === 2 ? 3000 : 5500;
      if (dist < range) {
        out = (toward | press([BTN.SKILL1, BTN.SKILL2, BTN.SKILL3][k]!)) & ~BTN.GUARD;
        prev = out;
        return out;
      }
    }

    const want = ranged ? 5200 : 1300;
    if (wander > 0) {
      wander--;
      out |= wanderBits;
    } else if (dist > want + 900) {
      out |= toward;
      if (dist > 6000 && r() < 0.03) out |= toward; // keep running
    } else if (ranged && dist < want - 1800) {
      out |= away;
    } else if (r() < 0.02) {
      wander = 10 + Math.floor(r() * 25);
      wanderBits = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT][Math.floor(r() * 4)]!;
    }

    const inRange = dist < (ranged ? 9000 : 1700);
    if (inRange && f.state !== FS.HITSTUN) {
      if (r() < 0.04 * (1 + opts.level)) {
        holdCharge = 32;
        out = BTN.ATTACK | toward;
        prev = out;
        return out;
      }
      if (r() < 0.25 + react * 0.3) out = toward | press(BTN.ATTACK);
    }
    if (r() < 0.006) out |= press(BTN.JUMP);
    prev = out;
    return out;
  };
}
