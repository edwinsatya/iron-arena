import { AIR_GRAVITY, AIR_GRAVITY_STEP, EV, FS, GRAVITY, PUSH_HEIGHT, STAGE_HALF } from './constants';
import { pushEvent } from './events';
import { setState } from './fighter';
import { along, clamp, facingDir, isqrt } from './math';
import { ROSTER } from './roster';
import type { FighterState, GameState } from './types';

function gravityFor(f: FighterState): number {
  // Juggled bodies fall a little faster as the combo grows, so combos end.
  if (f.state === FS.AIR || f.state === FS.KO) return AIR_GRAVITY + Math.trunc(f.comboHits / AIR_GRAVITY_STEP);
  return GRAVITY;
}

function land(s: GameState, p: number): void {
  const f = s.fighters[p]!;
  f.y = 0;
  f.vy = 0;
  f.vx = 0;
  f.vz = 0;
  switch (f.state) {
    case FS.JUMP:
      setState(f, FS.LAND);
      pushEvent(s, p, EV.LAND, 0, f.x, 0, f.z);
      break;
    case FS.AIR:
      f.juggleLeft = 0;
      setState(f, f.hp > 0 ? FS.DOWN : FS.KO);
      pushEvent(s, p, EV.LAND, 1, f.x, 0, f.z);
      break;
    case FS.KO:
      pushEvent(s, p, EV.LAND, 1, f.x, 0, f.z);
      break;
  }
}

/** Knockback, airborne motion, gravity and landing. */
export function applyPhysics(s: GameState, p: number): void {
  const f = s.fighters[p]!;
  if (f.kbX !== 0 || f.kbZ !== 0) {
    f.x += f.kbX;
    f.z += f.kbZ;
    f.kbX = Math.trunc((f.kbX * 3) / 4);
    f.kbZ = Math.trunc((f.kbZ * 3) / 4);
  }
  if (f.y > 0 || f.vy > 0) {
    f.x += f.vx;
    f.z += f.vz;
    f.y += f.vy;
    f.vy -= gravityFor(f);
    if (f.y <= 0) land(s, p);
  }
  const lim = STAGE_HALF - ROSTER[f.char]!.bodyRadius;
  f.x = clamp(f.x, -lim, lim);
  f.z = clamp(f.z, -lim, lim);
}

function solid(f: FighterState): boolean {
  return f.state !== FS.AIR && f.state !== FS.THROW && f.state !== FS.THROWN;
}

/** Bodies can't overlap: push both apart equally; if one is against the edge, push the other. */
export function pushApart(s: GameState): void {
  const a = s.fighters[0];
  const b = s.fighters[1];
  if (!solid(a) || !solid(b)) return;
  if (Math.abs(a.y - b.y) > PUSH_HEIGHT) return;
  const minDist = ROSTER[a.char]!.bodyRadius + ROSTER[b.char]!.bodyRadius;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = isqrt(dx * dx + dz * dz);
  if (dist >= minDist) return;

  // Unit vector from a to b (× 1024). Exactly on top of each other: use P1's facing.
  const ux = dist === 0 ? a.dirX : Math.trunc((dx * 1024) / dist);
  const uz = dist === 0 ? a.dirZ : Math.trunc((dz * 1024) / dist);
  const overlap = minDist - dist;
  const half = Math.trunc((overlap + 1) / 2);
  a.x -= along(ux, half);
  a.z -= along(uz, half);
  b.x += along(ux, overlap - half);
  b.z += along(uz, overlap - half);

  // Stage edges: whatever one fighter can't move, the other moves instead.
  const limA = STAGE_HALF - ROSTER[a.char]!.bodyRadius;
  const limB = STAGE_HALF - ROSTER[b.char]!.bodyRadius;
  const ax = clamp(a.x, -limA, limA);
  const az = clamp(a.z, -limA, limA);
  b.x += ax - a.x;
  b.z += az - a.z;
  a.x = ax;
  a.z = az;
  const bx = clamp(b.x, -limB, limB);
  const bz = clamp(b.z, -limB, limB);
  a.x = clamp(a.x + (bx - b.x), -limA, limA);
  a.z = clamp(a.z + (bz - b.z), -limA, limA);
  b.x = bx;
  b.z = bz;
}

/** Fighters in neutral-ish states turn to face each other; side state updates on the ground. */
export function updateFacing(s: GameState): void {
  for (let p = 0; p < 2; p++) {
    const f = s.fighters[p]!;
    const o = s.fighters[1 - p]!;
    switch (f.state) {
      case FS.IDLE:
      case FS.WALK_F:
      case FS.WALK_B:
      case FS.CROUCH:
      case FS.DASH:
      case FS.BACKDASH:
      case FS.LAND:
      case FS.BLOCKSTUN:
      case FS.WAKEUP: {
        const [dx, dz] = facingDir(f.x, f.z, o.x, o.z);
        f.dirX = dx;
        f.dirZ = dz;
        break;
      }
    }
  }
  const a = s.fighters[0];
  const b = s.fighters[1];
  if (a.y === 0 && b.y === 0 && solid(a) && solid(b)) {
    if (a.x < b.x - 50) s.p1OnLeft = 1;
    else if (a.x > b.x + 50) s.p1OnLeft = 0;
  }
}
