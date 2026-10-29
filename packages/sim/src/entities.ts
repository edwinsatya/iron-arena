import { ARENA_R, EV, GRAVITY, MAX_FALL } from './constants';
import { pushEvent } from './events';
import { dist2, localToWorld, normalize, rotate } from './math';
import { ROSTER } from './roster';
import type { ActionData, AreaSpec, GameState, ProjectileSpec } from './types';

const FAR2 = (ARENA_R + 6000) * (ARENA_R + 6000);

export function projectileSpec(char: number, action: number, spec: number): ProjectileSpec {
  return ROSTER[char]!.actions[action]!.projectiles![spec]!;
}

/** Area spec; spec ≥ 1000 means "the explosion of projectile spec − 1000". */
export function areaSpec(char: number, action: number, spec: number): AreaSpec {
  const a = ROSTER[char]!.actions[action]!;
  return spec >= 1000 ? a.projectiles![spec - 1000]!.explode! : a.areas![spec]!;
}

/** Spawn the projectiles and areas an action creates on this frame. */
export function spawnFor(s: GameState, i: number, a: ActionData, t: number): void {
  const f = s.fighters[i]!;
  const o = s.fighters[1 - i]!;
  a.projectiles?.forEach((p, k) => {
    if (p.frame !== t) return;
    const at = localToWorld(f, p.at[0], p.at[1], p.at[2]);
    for (const ang of p.angles ?? [0]) {
      // Side view: a fan of shots spreads up and down instead of sideways
      const [c, sn] = ang ? rotate(1024, 0, ang) : [1024, 0];
      const dir = f.fx >= 0 ? 1 : -1;
      s.projectiles.push({
        owner: i,
        char: f.char,
        action: f.action,
        spec: k,
        x: at.x,
        y: Math.max(0, at.y),
        z: 0,
        vx: (dir * c * p.speed) >> 10,
        vy: (p.vy ?? 0) + ((sn * p.speed) >> 10),
        vz: 0,
        age: 0,
        hit: 0,
      });
    }
    pushEvent(s, i, EV.FIRE, k, at.x, at.y, at.z);
  });
  a.areas?.forEach((ar, k) => {
    if (ar.frame !== t) return;
    let x: number;
    let z: number;
    if (ar.onTarget && dist2(f.x, f.z, o.x, o.z) <= ar.onTarget * ar.onTarget) {
      x = o.x;
      z = o.z;
    } else {
      const p = localToWorld(f, ar.forward, 0, 0);
      x = p.x;
      z = p.z;
    }
    s.areas.push({
      owner: i,
      char: f.char,
      action: f.action,
      spec: k,
      x,
      z,
      age: 0,
      lastHit: -999,
      hitMask: 0,
    });
    pushEvent(s, i, EV.AREA, k, x, 0, z);
  });
}

export function explode(s: GameState, p: GameState['projectiles'][number]): void {
  const spec = projectileSpec(p.char, p.action, p.spec);
  if (!spec.explode) return;
  s.areas.push({
    owner: p.owner,
    char: p.char,
    action: p.action,
    spec: 1000 + p.spec,
    x: p.x,
    z: p.z,
    age: 0,
    lastHit: -999,
    hitMask: 0,
  });
  pushEvent(s, p.owner, EV.EXPLODE, p.spec, p.x, p.y, p.z);
}

/** Move projectiles (homing, stopping, gravity) and age areas; drop the finished ones. */
export function updateEntities(s: GameState): void {
  for (const p of s.projectiles) {
    const spec = projectileSpec(p.char, p.action, p.spec);
    p.age++;
    if (spec.homing && p.hit === 0) {
      const o = s.fighters[1 - p.owner]!;
      const speed = spec.speed;
      // Steer toward the target's chest in the x/y plane
      const [tx, ty] = normalize(o.x - p.x, o.y + 900 - p.y, [p.vx, p.vy]);
      const [cx, cy] = normalize(p.vx, p.vy);
      const [nx, ny] = normalize(cx * 1024 + tx * spec.homing, cy * 1024 + ty * spec.homing, [cx, cy]);
      p.vx = (nx * speed) >> 10;
      p.vy = (ny * speed) >> 10;
    }
    if (spec.stopAfter !== undefined && p.age >= spec.stopAfter) {
      p.vx = 0;
      p.vz = 0;
      if (spec.vy === undefined) p.vy = 0;
    }
    p.x += p.vx;
    p.z += p.vz;
    if (spec.vy === undefined && p.vy !== 0) {
      // Angled or homing shot without gravity
      p.y += p.vy;
      if (p.y <= 0) {
        p.y = 0;
        p.age = spec.life;
      }
    } else if (spec.vy !== undefined) {
      p.vy = Math.max(-MAX_FALL, p.vy - GRAVITY);
      p.y += p.vy;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        if (spec.stopAfter === undefined) p.age = spec.life; // shots that hit the floor end
      }
    }
  }
  // Remove expired (explode at end of life)
  let w = 0;
  for (let r = 0; r < s.projectiles.length; r++) {
    const p = s.projectiles[r]!;
    const spec = projectileSpec(p.char, p.action, p.spec);
    const gone = p.age >= spec.life || (p.hit === 1 && !spec.pierce) || p.x * p.x + p.z * p.z > FAR2;
    if (gone) {
      if (p.age >= spec.life && p.hit === 0) explode(s, p);
      continue;
    }
    s.projectiles[w++] = p;
  }
  s.projectiles.length = w;

  w = 0;
  for (let r = 0; r < s.areas.length; r++) {
    const a = s.areas[r]!;
    const spec = areaSpec(a.char, a.action, a.spec);
    a.age++;
    if (a.age >= spec.delay + spec.active) continue;
    s.areas[w++] = a;
  }
  s.areas.length = w;
}
