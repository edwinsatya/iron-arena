import {
  FS,
  PHASE,
  ROSTER,
  type CompiledMove,
  type FighterState,
  type GameState,
} from '@neonfist/sim';
import { MOVE_KINDS, type MoveKind } from './looks';

/**
 * Procedural poses computed purely from simulation state (PLAN §5.2): no animation clock, so a
 * rollback simply re-poses the fighter. Strikes reach full extension exactly on the move's first
 * active frame, so what you see always matches the hitbox.
 */

export interface Limb {
  /** Forward raise (rad). */
  raise: number;
  /** Outward from the body (rad). */
  out: number;
  /** Elbow / knee bend (rad). */
  bend: number;
}

export interface Pose {
  lean: number; // torso forward (+) / back (−)
  twist: number; // torso yaw; − brings the left (lead) shoulder forward
  head: number; // head pitch, − = snapped back
  pitch: number; // whole body tilted backward (lying = π/2)
  lift: number; // extra height (m)
  ground: boolean; // keep the lowest foot on the floor
  forward: number; // body offset forward (m)
  la: Limb;
  ra: Limb;
  ll: Limb;
  rl: Limb;
}

type PoseOverride = Partial<Omit<Pose, 'la' | 'ra' | 'll' | 'rl'>> & {
  la?: Partial<Limb>;
  ra?: Partial<Limb>;
  ll?: Partial<Limb>;
  rl?: Partial<Limb>;
};

export const LIMBS = { thigh: 0.45, shin: 0.45, upperArm: 0.3, forearm: 0.28, torso: 0.52 };

function limb(raise: number, out: number, bend: number): Limb {
  return { raise, out, bend };
}

export function withPose(base: Pose, o: PoseOverride): Pose {
  return {
    ...base,
    ...o,
    la: { ...base.la, ...o.la },
    ra: { ...base.ra, ...o.ra },
    ll: { ...base.ll, ...o.ll },
    rl: { ...base.rl, ...o.rl },
  };
}

function lerpLimb(a: Limb, b: Limb, t: number): Limb {
  return { raise: a.raise + (b.raise - a.raise) * t, out: a.out + (b.out - a.out) * t, bend: a.bend + (b.bend - a.bend) * t };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = Math.max(0, Math.min(1, t));
  const n = (x: number, y: number) => x + (y - x) * k;
  return {
    lean: n(a.lean, b.lean),
    twist: n(a.twist, b.twist),
    head: n(a.head, b.head),
    pitch: n(a.pitch, b.pitch),
    lift: n(a.lift, b.lift),
    ground: k < 0.5 ? a.ground : b.ground,
    forward: n(a.forward, b.forward),
    la: lerpLimb(a.la, b.la, k),
    ra: lerpLimb(a.ra, b.ra, k),
    ll: lerpLimb(a.ll, b.ll, k),
    rl: lerpLimb(a.rl, b.rl, k),
  };
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/* ---------------------------------------------------------------- base poses */

export const GUARD: Pose = {
  lean: 0.08,
  twist: -0.32,
  head: 0.05,
  pitch: 0,
  lift: 0,
  ground: true,
  forward: 0,
  la: limb(0.95, 0.12, 1.95),
  ra: limb(0.62, 0.18, 2.35),
  ll: limb(0.28, 0.06, 0.38),
  rl: limb(-0.22, 0.06, 0.32),
};

export const CROUCH: Pose = withPose(GUARD, {
  lean: 0.32,
  twist: -0.2,
  la: { raise: 0.75, bend: 2.0 },
  ra: { raise: 0.55, bend: 2.3 },
  ll: { raise: 1.25, out: 0.12, bend: 2.15 },
  rl: { raise: 0.75, out: 0.12, bend: 2.2 },
});

const LYING: Pose = withPose(GUARD, {
  lean: 0,
  twist: 0,
  head: 0.15,
  pitch: Math.PI / 2,
  lift: 0.14,
  ground: false,
  la: { raise: 0.3, out: 0.6, bend: 0.6 },
  ra: { raise: 0.2, out: 0.7, bend: 0.4 },
  ll: { raise: 0.25, out: 0.12, bend: 0.5 },
  rl: { raise: 0.1, out: 0.1, bend: 0.2 },
});

const VICTORY: Pose = withPose(GUARD, {
  lean: -0.05,
  twist: 0.1,
  head: -0.15,
  ra: { raise: 3.0, out: 0.25, bend: 0.25 },
  la: { raise: 0.4, out: 0.3, bend: 1.6 },
  ll: { raise: 0.12, bend: 0.1 },
  rl: { raise: -0.12, bend: 0.1 },
});

/* ---------------------------------------------------------------- strikes */

interface Strike {
  windup: PoseOverride;
  strike: PoseOverride;
  crouchBase?: boolean;
}

const STRIKES: Record<MoveKind, Strike> = {
  jab: {
    windup: { twist: -0.2, la: { raise: 1.1, bend: 2.2 } },
    strike: { twist: -0.55, lean: 0.14, la: { raise: 1.57, out: 0.02, bend: 0.04 } },
  },
  cross: {
    windup: { twist: -0.5, ra: { raise: 0.9, bend: 2.3 } },
    strike: { twist: 0.45, lean: 0.18, ra: { raise: 1.57, out: -0.02, bend: 0.04 }, la: { raise: 0.8, bend: 2.3 } },
  },
  upper: {
    windup: { lean: 0.35, lift: -0.18, ra: { raise: 0.15, out: 0.1, bend: 1.3 }, ll: { raise: 0.7, bend: 1.3 }, rl: { raise: 0.2, bend: 1.2 } },
    strike: { lean: -0.12, twist: 0.35, lift: 0.04, ra: { raise: 2.75, out: 0.05, bend: 0.55 }, ll: { raise: 0.2, bend: 0.1 }, rl: { raise: -0.3, bend: 0.2 } },
  },
  elbow: {
    windup: { twist: -0.55, ra: { raise: 0.6, bend: 2.6 } },
    strike: { twist: 0.55, lean: 0.3, ra: { raise: 1.45, out: -0.25, bend: 2.65 }, ll: { raise: 0.5, bend: 0.6 } },
  },
  frontkick: {
    windup: { lean: -0.05, ll: { raise: 1.25, bend: 1.9 } },
    strike: { lean: -0.2, ll: { raise: 1.5, out: 0.02, bend: 0.06 }, rl: { raise: -0.1, bend: 0.15 } },
  },
  highkick: {
    windup: { twist: 0.3, rl: { raise: 0.9, out: 0.4, bend: 1.9 } },
    strike: { twist: -0.95, lean: -0.32, rl: { raise: 1.75, out: 0.55, bend: 0.12 }, ll: { raise: 0.05, bend: 0.2 } },
  },
  lowjab: {
    crouchBase: true,
    windup: { la: { raise: 0.9, bend: 2.0 } },
    strike: { lean: 0.45, twist: -0.5, la: { raise: 1.45, bend: 0.05 } },
  },
  lowkick: {
    crouchBase: true,
    windup: { ll: { raise: 0.9, bend: 2.2 } },
    strike: { lean: 0.15, twist: -0.4, ll: { raise: 1.35, out: 0.05, bend: 0.06 }, rl: { raise: 0.6, bend: 1.9 } },
  },
  sweep: {
    crouchBase: true,
    windup: { twist: 0.4, lean: 0.55, rl: { raise: 0.6, out: 0.4, bend: 1.8 } },
    strike: { twist: -1.25, lean: 0.62, rl: { raise: 1.45, out: 0.45, bend: 0.08 }, la: { raise: 0.3, out: 0.2, bend: 0.2 }, ll: { raise: 1.35, bend: 2.5 } },
  },
  comet: {
    windup: { lean: 0.25, lift: 0.1, ll: { raise: 0.9, bend: 1.5 }, rl: { raise: -0.3, bend: 0.8 } },
    strike: { lean: -0.32, lift: 0.32, ll: { raise: 1.55, bend: 0.05 }, rl: { raise: 0.5, bend: 2.1 }, la: { raise: 0.4, out: 0.6, bend: 0.4 }, ra: { raise: 0.2, out: 0.7, bend: 0.4 } },
  },
  phantom: {
    crouchBase: true,
    windup: { lean: 0.5, rl: { raise: 0.8, bend: 2.2 } },
    strike: { lean: -0.25, twist: -0.4, rl: { raise: 1.45, out: 0.1, bend: 0.1 }, ll: { raise: 0.1, bend: 0.25 } },
  },
  palm: {
    windup: { lean: -0.1, la: { raise: 0.6, bend: 2.3 }, ra: { raise: 0.6, bend: 2.3 } },
    strike: { lean: 0.32, twist: 0, lift: -0.06, la: { raise: 1.5, out: -0.05, bend: 0.12 }, ra: { raise: 1.5, out: -0.05, bend: 0.12 }, ll: { raise: 0.6, bend: 0.9 } },
  },
  backfist: {
    windup: { twist: -1.2, ra: { raise: 1.2, out: -0.6, bend: 1.8 } },
    strike: { twist: 0.9, ra: { raise: 1.3, out: 1.2, bend: 0.25 } },
  },
  stomp: {
    windup: { lean: -0.1, rl: { raise: 1.5, bend: 1.9 } },
    strike: { lean: 0.25, rl: { raise: 0.75, bend: 0.25 }, ll: { raise: 0.1, bend: 0.4 } },
  },
  hook: {
    windup: { twist: 0.6, lean: -0.05, ra: { raise: 1.0, out: 1.1, bend: 1.3 } },
    strike: { twist: -0.75, lean: 0.2, ra: { raise: 1.4, out: 0.95, bend: 1.45 } },
  },
  overhead: {
    windup: { twist: 0.55, lean: -0.15, ra: { raise: 2.6, out: 0.5, bend: 1.2 } },
    strike: { twist: -0.6, lean: 0.3, ra: { raise: 1.45, out: 0.35, bend: 0.2 } },
  },
  charge: {
    windup: { lean: 0.25, twist: -0.7, la: { raise: 0.5, bend: 2.4 }, ra: { raise: 0.4, bend: 2.4 } },
    strike: { lean: 0.6, twist: -0.85, la: { raise: 0.8, out: 0.3, bend: 2.2 }, ll: { raise: 0.8, bend: 0.9 }, rl: { raise: -0.5, bend: 0.3 } },
  },
  grab: {
    windup: { lean: 0.1, la: { raise: 1.0, out: 0.4, bend: 1.2 }, ra: { raise: 1.0, out: 0.4, bend: 1.2 } },
    strike: { lean: 0.22, twist: 0, la: { raise: 1.45, out: 0.22, bend: 0.5 }, ra: { raise: 1.45, out: 0.22, bend: 0.5 } },
  },
};

function kindOf(m: CompiledMove): MoveKind {
  const k = MOVE_KINDS[m.id];
  if (k) return k;
  if (m.height === 'throw') return 'grab';
  const b = m.cmd?.buttons ?? 16;
  return b & 16 ? 'jab' : b & 32 ? 'cross' : b & 64 ? 'frontkick' : 'highkick';
}

function attackPose(f: FighterState, m: CompiledMove): Pose {
  const def = STRIKES[kindOf(m)];
  const base = def.crouchBase || m.stance === 'crouch' ? CROUCH : GUARD;
  const end = m.endStance === 'crouch' ? CROUCH : GUARD;
  const windup = withPose(base, def.windup);
  const strike = withPose(base, def.strike);
  const s = m.startup;
  const fr = f.moveFrame;
  if (fr < s) {
    const t = (fr - 1) / Math.max(1, s - 1);
    if (t < 0.55) return lerpPose(base, windup, easeOut(t / 0.55));
    return lerpPose(windup, strike, easeIn((t - 0.55) / 0.45));
  }
  if (fr <= m.lastActive) return strike;
  const rec = (fr - m.lastActive) / Math.max(1, m.total - m.lastActive);
  return lerpPose(strike, end, easeInOut(clamp01(rec * 1.2 - 0.12)));
}

/* ---------------------------------------------------------------- state → pose */

export interface PoseContext {
  state: GameState;
  index: number;
}

export function poseFor(ctx: PoseContext): Pose {
  const { state: s, index } = ctx;
  const f = s.fighters[index]!;
  const ch = ROSTER[f.char]!;
  const breathe = Math.sin(s.frame * 0.09 + index) * 0.03;

  // Round over: the winner celebrates once everyone has landed.
  const won = s.endWinner === index || (s.phase === PHASE.MATCH_END && s.matchWinner === index);
  if ((s.phase === PHASE.ROUND_END || s.phase === PHASE.MATCH_END) && won && f.state !== FS.ATTACK) {
    const t = s.phase === PHASE.MATCH_END ? 1 : clamp01(s.phaseFrame / 20);
    return lerpPose(GUARD, withPose(VICTORY, { lift: Math.abs(breathe) * 0.5 }), easeOut(t));
  }

  switch (f.state) {
    case FS.ATTACK: {
      const m = f.moveId >= 0 ? ch.moves[f.moveId] : undefined;
      return m ? attackPose(f, m) : GUARD;
    }
    case FS.CROUCH:
      return withPose(CROUCH, { la: { raise: f.guard === 2 ? 0.95 : 0.75 } });
    case FS.WALK_F:
    case FS.WALK_B: {
      const dir = f.state === FS.WALK_F ? 1 : -1;
      const ph = s.frame * 0.28 * dir;
      return withPose(GUARD, {
        lean: GUARD.lean + 0.04 * dir,
        ll: { raise: 0.28 + Math.sin(ph) * 0.3, bend: 0.38 + Math.max(0, Math.cos(ph)) * 0.45 },
        rl: { raise: -0.22 - Math.sin(ph) * 0.3, bend: 0.32 + Math.max(0, -Math.cos(ph)) * 0.45 },
      });
    }
    case FS.DASH:
      return withPose(GUARD, { lean: 0.38, ll: { raise: 0.75, bend: 0.9 }, rl: { raise: -0.55, bend: 0.5 } });
    case FS.BACKDASH:
      return withPose(GUARD, { lean: -0.22, ll: { raise: -0.3, bend: 0.5 }, rl: { raise: 0.6, bend: 0.9 } });
    case FS.JUMP: {
      if (f.y <= 0) return lerpPose(GUARD, CROUCH, 0.6);
      return withPose(GUARD, { lean: 0.15, ll: { raise: 1.1, bend: 1.7 }, rl: { raise: 0.7, bend: 1.9 }, ground: false, lift: 0 });
    }
    case FS.LAND:
      return lerpPose(CROUCH, GUARD, f.stateFrame / 4);
    case FS.BLOCKSTUN: {
      const base = f.crouching ? CROUCH : GUARD;
      const k = clamp01(f.stun / 8);
      return withPose(base, {
        lean: base.lean - 0.12 * k,
        head: -0.1 * k,
        la: { raise: 1.35, out: 0.05, bend: 2.5 },
        ra: { raise: 1.25, out: 0.1, bend: 2.55 },
      });
    }
    case FS.HITSTUN: {
      const base = f.crouching ? CROUCH : GUARD;
      const snap = f.stateFrame < 4 ? 1 : clamp01(f.stun / 10);
      return withPose(base, {
        lean: base.lean - 0.4 * snap,
        head: -0.55 * snap,
        twist: base.twist + 0.25 * snap,
        la: { raise: 0.35, out: 0.55 * snap, bend: 0.9 },
        ra: { raise: 0.3, out: 0.65 * snap, bend: 0.7 },
      });
    }
    case FS.AIR: {
      const t = clamp01(f.stateFrame / 18);
      return withPose(lerpPose(withPose(GUARD, { ground: false }), LYING, t), {
        lift: 0.3,
        head: -0.3,
        pitch: (Math.PI / 2) * (0.35 + 0.55 * t),
        la: { raise: 0.6 + breathe, out: 0.9, bend: 0.5 },
        ra: { raise: 0.4, out: 1.0, bend: 0.4 },
        ll: { raise: 0.6, bend: 0.9 },
        rl: { raise: 0.3, bend: 0.5 },
      });
    }
    case FS.DOWN:
    case FS.KO:
      if (f.y > 0) return withPose(LYING, { lift: 0.3, pitch: 1.2 });
      return LYING;
    case FS.WAKEUP:
      return lerpPose(LYING, GUARD, easeInOut(clamp01(f.stateFrame / 22)));
    case FS.THROW: {
      const m = f.moveId >= 0 ? ch.moves[f.moveId] : undefined;
      const grab = withPose(GUARD, STRIKES.grab.strike);
      const t = m?.throw ? clamp01((f.stateFrame - m.throw.breakWindow) / m.throw.duration) : 0;
      if (t <= 0) return grab;
      const up = Math.sin(t * Math.PI);
      return withPose(grab, {
        lean: 0.2 - 0.5 * up + 0.6 * easeIn(t),
        la: { raise: 1.45 + 1.2 * up },
        ra: { raise: 1.45 + 1.2 * up },
        twist: -0.6 * t,
      });
    }
    case FS.THROWN: {
      const opp = s.fighters[1 - index]!;
      const m = opp.moveId >= 0 ? ROSTER[opp.char]!.moves[opp.moveId] : undefined;
      const t = m?.throw ? clamp01((f.stateFrame - m.throw.breakWindow) / m.throw.duration) : 0;
      const held = withPose(GUARD, { lean: -0.25, head: -0.3, la: { raise: 0.5, out: 0.6, bend: 0.6 }, ra: { raise: 0.5, out: 0.6, bend: 0.6 } });
      if (t <= 0) return held;
      return withPose(held, { ground: false, lift: 0.9 * Math.sin(t * Math.PI) + 0.14 * t, pitch: (Math.PI / 2) * easeIn(t) });
    }
    default:
      return withPose(GUARD, { lift: breathe * 0.25, la: { raise: GUARD.la.raise + breathe } });
  }
}

/** Hip height that keeps the lowest foot on the ground (m, before character scale). */
export function groundedHipHeight(p: Pose): number {
  const leg = (l: Limb) =>
    Math.cos(l.out) * (LIMBS.thigh * Math.cos(l.raise) + LIMBS.shin * Math.cos(l.raise - l.bend));
  return Math.max(leg(p.ll), leg(p.rl));
}
