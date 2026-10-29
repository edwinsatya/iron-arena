import { actionOf, FS, ROSTER, type ActionData, type FighterState, type GameState } from '@neonfist/sim';
import { LOOKS, WEAPON_OF, type AnimStyle } from './looks';

/**
 * Procedural poses computed from simulation state (PLAN §5.2): no animation clips and no
 * animation clock of their own, so a rollback simply re-poses the hero. Every strike reaches its
 * "hit" pose exactly on the action's impact frame, so what you see matches the hitbox.
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
  twist: number; // torso yaw; + brings the right shoulder back
  head: number; // head pitch, − = looking up / snapped back
  pitch: number; // whole body tilted backward (lying = π/2)
  yaw: number; // whole body spin (rad)
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

const L = (raise: number, out: number, bend: number): Limb => ({ raise, out, bend });

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
  return {
    raise: a.raise + (b.raise - a.raise) * t,
    out: a.out + (b.out - a.out) * t,
    bend: a.bend + (b.bend - a.bend) * t,
  };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = Math.max(0, Math.min(1, t));
  const n = (x: number, y: number) => x + (y - x) * k;
  return {
    lean: n(a.lean, b.lean),
    twist: n(a.twist, b.twist),
    head: n(a.head, b.head),
    pitch: n(a.pitch, b.pitch),
    yaw: n(a.yaw, b.yaw),
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
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/* ------------------------------------------------------------------ stances */

const NEUTRAL: Pose = {
  lean: 0.05,
  twist: 0,
  head: 0,
  pitch: 0,
  yaw: 0,
  lift: 0,
  ground: true,
  forward: 0,
  la: L(0.15, 0.18, 0.35),
  ra: L(0.15, 0.18, 0.35),
  ll: L(0.18, 0.08, 0.32),
  rl: L(-0.12, 0.08, 0.26),
};

const STANCE: Record<string, Pose> = {
  katana: withPose(NEUTRAL, {
    twist: 0.25,
    lean: 0.1,
    ra: L(0.95, 0.05, 1.15),
    la: L(0.75, 0.1, 1.45),
    ll: L(0.32, 0.1, 0.42),
    rl: L(-0.25, 0.1, 0.32),
  }),
  gauntlets: withPose(NEUTRAL, {
    twist: 0.3,
    lean: 0.12,
    la: L(0.95, 0.12, 1.95),
    ra: L(0.62, 0.18, 2.35),
    ll: L(0.28, 0.12, 0.4),
    rl: L(-0.22, 0.12, 0.34),
  }),
  pistols: withPose(NEUTRAL, {
    la: L(0.55, 0.28, 0.65),
    ra: L(0.55, 0.28, 0.65),
    ll: L(0.2, 0.1, 0.3),
    rl: L(-0.14, 0.1, 0.26),
  }),
  staff: withPose(NEUTRAL, {
    ra: L(0.45, 0.12, 1.35),
    la: L(0.25, 0.22, 0.45),
    ll: L(0.16, 0.08, 0.28),
    rl: L(-0.1, 0.08, 0.22),
  }),
  none: withPose(NEUTRAL, { la: L(0.9, 0.12, 1.9), ra: L(0.6, 0.18, 2.3) }),
};

const CROUCH: PoseOverride = { lean: 0.35, ll: { raise: 1.0, bend: 1.8 }, rl: { raise: 0.5, bend: 1.6 } };

/* --------------------------------------------------- action key poses (wind → hit) */

const KEYS: Record<AnimStyle, { wind: PoseOverride; hit: PoseOverride }> = {
  slash: {
    wind: { twist: 0.8, ra: { raise: 1.7, out: 1.1, bend: 0.5 }, la: { raise: 0.6 } },
    hit: {
      twist: -0.8,
      lean: 0.25,
      ra: { raise: 1.45, out: -0.6, bend: 0.1 },
      la: { raise: 0.4, out: 0.5 },
      ll: { raise: 0.55, bend: 0.6 },
    },
  },
  backslash: {
    wind: { twist: -0.8, ra: { raise: 1.4, out: -0.7, bend: 0.8 } },
    hit: { twist: 0.75, lean: 0.2, ra: { raise: 1.45, out: 1.3, bend: 0.05 }, la: { raise: 0.3, out: 0.6 } },
  },
  risingSlash: {
    wind: { lean: 0.4, ra: { raise: 0.2, out: 0.3, bend: 0.2 }, ...CROUCH },
    hit: {
      lean: -0.2,
      lift: 0.08,
      head: -0.25,
      ra: { raise: 2.9, out: 0.2, bend: 0 },
      la: { raise: 0.2, out: 0.7 },
      ll: { raise: 0.1 },
      rl: { raise: -0.5 },
    },
  },
  overhead: {
    wind: { lean: -0.15, ra: { raise: 3.0, bend: 0.7 }, la: { raise: 2.7, bend: 0.9 } },
    hit: {
      lean: 0.4,
      ra: { raise: 1.2, bend: 0 },
      la: { raise: 1.1, bend: 0.3 },
      ll: { raise: 0.7, bend: 0.8 },
    },
  },
  thrust: {
    wind: { twist: 0.6, ra: { raise: 1.2, bend: 2.1 }, ...CROUCH },
    hit: {
      twist: -0.45,
      lean: 0.35,
      forward: 0.15,
      ra: { raise: 1.55, bend: 0, out: 0 },
      la: { raise: 0.1, out: 0.6 },
      ll: { raise: 1.0, bend: 1.0 },
      rl: { raise: -0.6, bend: 0.1 },
    },
  },
  spin: {
    wind: { ra: { raise: 1.5, out: 1.4, bend: 0.1 }, la: { raise: 1.4, out: 1.4, bend: 0.2 }, lean: 0.15 },
    hit: { ra: { raise: 1.55, out: 1.5, bend: 0 }, la: { raise: 1.5, out: 1.5, bend: 0.1 }, lean: 0.1 },
  },
  iai: {
    wind: {
      twist: -0.7,
      ra: { raise: 0.6, out: -0.4, bend: 1.4 },
      la: { raise: 0.5, out: -0.2, bend: 1.2 },
      ...CROUCH,
    },
    hit: {
      twist: 0.9,
      lean: 0.35,
      forward: 0.2,
      ra: { raise: 1.5, out: 1.4, bend: 0 },
      la: { raise: 0.2, out: 0.7 },
      ll: { raise: 1.1, bend: 1.1 },
      rl: { raise: -0.7, bend: 0.1 },
    },
  },
  dashCut: {
    wind: { twist: -0.7, lean: 0.55, ra: { raise: 0.4, out: -0.5, bend: 1.2 }, ...CROUCH },
    hit: {
      twist: 1.0,
      lean: 0.65,
      ra: { raise: 1.3, out: 1.6, bend: 0 },
      la: { raise: -0.4, out: 0.4 },
      ll: { raise: 1.1, bend: 1.0 },
      rl: { raise: -0.8, bend: 0.2 },
    },
  },
  counter: {
    wind: {
      lean: 0.15,
      ra: { raise: 1.6, out: -0.3, bend: 0.7 },
      la: { raise: 1.5, out: -0.1, bend: 1.0 },
      ll: { raise: 0.6, out: 0.3, bend: 1.0 },
      rl: { raise: -0.4, out: 0.3, bend: 0.6 },
    },
    hit: {
      lean: 0.15,
      ra: { raise: 1.6, out: -0.3, bend: 0.7 },
      la: { raise: 1.5, out: -0.1, bend: 1.0 },
      ll: { raise: 0.6, out: 0.3, bend: 1.0 },
      rl: { raise: -0.4, out: 0.3, bend: 0.6 },
    },
  },
  jab: {
    wind: { twist: 0.4, la: { raise: 1.2, bend: 2.2 } },
    hit: { twist: -0.6, lean: 0.2, la: { raise: 1.55, out: 0, bend: 0.05 }, ra: { raise: 0.7, bend: 2.3 } },
  },
  hook: {
    wind: { twist: 0.5, ra: { raise: 1.2, out: 0.9, bend: 1.9 } },
    hit: {
      twist: -0.95,
      lean: 0.25,
      ra: { raise: 1.55, out: -0.25, bend: 1.05 },
      la: { raise: 0.8, bend: 2.0 },
    },
  },
  uppercut: {
    wind: { lean: 0.4, ra: { raise: 0.3, bend: 2.0 }, ...CROUCH },
    hit: {
      lean: -0.25,
      lift: 0.12,
      head: -0.3,
      ra: { raise: 2.95, out: 0, bend: 0.5 },
      la: { raise: 0.5, bend: 1.8 },
      ll: { raise: 0.2 },
      rl: { raise: -0.4 },
    },
  },
  tackle: {
    wind: {
      twist: -0.9,
      lean: 0.5,
      la: { raise: 0.9, out: -0.3, bend: 1.5 },
      ra: { raise: 0.5, bend: 2.0 },
      ...CROUCH,
    },
    hit: {
      twist: -1.0,
      lean: 0.65,
      forward: 0.12,
      la: { raise: 1.0, out: -0.3, bend: 1.5 },
      ll: { raise: 1.0, bend: 1.0 },
      rl: { raise: -0.7, bend: 0.2 },
    },
  },
  hammer: {
    wind: { lean: -0.25, head: -0.2, ra: { raise: 3.0, bend: 0.6 }, la: { raise: 3.0, bend: 0.6 } },
    hit: {
      lean: 0.7,
      ra: { raise: 1.1, bend: 0.2 },
      la: { raise: 1.1, bend: 0.2 },
      ll: { raise: 1.0, bend: 1.4 },
      rl: { raise: -0.2, bend: 1.0 },
    },
  },
  dive: {
    wind: {
      lean: 0.3,
      ra: { raise: 2.2, bend: 0.5 },
      la: { raise: 2.0, bend: 0.6 },
      ll: { raise: 1.2, bend: 1.8 },
      rl: { raise: 0.8, bend: 1.6 },
    },
    hit: {
      lean: 0.65,
      ra: { raise: 0.5, bend: 0.1 },
      la: { raise: 0.5, bend: 0.2 },
      ll: { raise: 0.6, bend: 1.0 },
      rl: { raise: 0.2, bend: 0.8 },
    },
  },
  leap: {
    wind: {
      lean: -0.1,
      head: -0.2,
      ra: { raise: 2.9, out: 0.4, bend: 0.4 },
      la: { raise: 2.9, out: 0.4, bend: 0.4 },
      ll: { raise: 1.3, bend: 2.0 },
      rl: { raise: 1.0, bend: 2.0 },
    },
    hit: {
      lean: 0.6,
      ra: { raise: 0.9, out: 0.4, bend: 0.2 },
      la: { raise: 0.9, out: 0.4, bend: 0.2 },
      ll: { raise: 1.1, bend: 1.6 },
      rl: { raise: 0.2, bend: 1.4 },
    },
  },
  flex: {
    wind: {
      lean: 0.2,
      ra: { raise: 0.6, out: 0.6, bend: 1.8 },
      la: { raise: 0.6, out: 0.6, bend: 1.8 },
      ...CROUCH,
    },
    hit: {
      lean: -0.12,
      head: -0.15,
      ra: { raise: 0.9, out: 1.2, bend: 2.4 },
      la: { raise: 0.9, out: 1.2, bend: 2.4 },
      ll: { raise: 0.3, out: 0.3 },
      rl: { raise: -0.1, out: 0.3 },
    },
  },
  grab: {
    wind: { lean: 0.3, ra: { raise: 0.8, out: 0.6, bend: 1.0 }, la: { raise: 0.8, out: 0.6, bend: 1.0 } },
    hit: {
      lean: 0.45,
      forward: 0.1,
      ra: { raise: 1.5, out: 0.25, bend: 0.4 },
      la: { raise: 1.5, out: 0.25, bend: 0.4 },
    },
  },
  carry: {
    wind: {
      lean: -0.15,
      head: -0.35,
      ra: { raise: 2.85, out: 0.25, bend: 0.5 },
      la: { raise: 2.85, out: 0.25, bend: 0.5 },
    },
    hit: {
      lean: 0.75,
      ra: { raise: 1.0, out: 0.3, bend: 0.2 },
      la: { raise: 1.0, out: 0.3, bend: 0.2 },
      ll: { raise: 1.1, bend: 1.5 },
      rl: { raise: -0.1, bend: 1.0 },
    },
  },
  shootR: {
    wind: { twist: 0.45, ra: { raise: 1.55, out: -0.05, bend: 0.1 } },
    hit: { twist: 0.45, ra: { raise: 1.8, out: -0.05, bend: 0.35 } },
  },
  shootL: {
    wind: { twist: -0.45, la: { raise: 1.55, out: -0.05, bend: 0.1 } },
    hit: { twist: -0.45, la: { raise: 1.8, out: -0.05, bend: 0.35 } },
  },
  shootBoth: {
    wind: {
      lean: 0.15,
      ra: { raise: 1.55, out: 0.05, bend: 0.05 },
      la: { raise: 1.55, out: 0.05, bend: 0.05 },
    },
    hit: { lean: 0.05, ra: { raise: 1.85, out: 0.1, bend: 0.3 }, la: { raise: 1.85, out: 0.1, bend: 0.3 } },
  },
  shootDown: {
    wind: {
      lean: 0.4,
      ra: { raise: 0.7, bend: 0.05 },
      la: { raise: 0.7, bend: 0.05 },
      ll: { raise: 1.1, bend: 1.6 },
      rl: { raise: 0.7, bend: 1.4 },
    },
    hit: {
      lean: 0.45,
      ra: { raise: 0.85, bend: 0.25 },
      la: { raise: 0.85, bend: 0.25 },
      ll: { raise: 1.1, bend: 1.6 },
      rl: { raise: 0.7, bend: 1.4 },
    },
  },
  aim: {
    wind: {
      twist: 0.35,
      lean: 0.12,
      ra: { raise: 1.57, out: -0.1, bend: 0 },
      la: { raise: 1.45, out: -0.35, bend: 0.7 },
      ll: { raise: 0.45, out: 0.2 },
      rl: { raise: -0.3, out: 0.2 },
    },
    hit: {
      twist: 0.35,
      lean: -0.15,
      head: -0.1,
      ra: { raise: 2.1, out: -0.1, bend: 0.3 },
      la: { raise: 1.9, out: -0.35, bend: 0.8 },
    },
  },
  spread: {
    wind: { lean: 0.1, ra: { raise: 1.5, out: 0.45, bend: 0.05 }, la: { raise: 1.5, out: 0.45, bend: 0.05 } },
    hit: { lean: -0.2, ra: { raise: 1.9, out: 0.9, bend: 0.3 }, la: { raise: 1.9, out: 0.9, bend: 0.3 } },
  },
  backflip: {
    wind: { lean: 0.2, ...CROUCH, ra: { raise: 0.2, out: 0.5 }, la: { raise: 0.2, out: 0.5 } },
    hit: {
      ra: { raise: 2.6, out: 0.4 },
      la: { raise: 2.6, out: 0.4 },
      ll: { raise: 1.5, bend: 2.2 },
      rl: { raise: 1.4, bend: 2.2 },
    },
  },
  toss: {
    wind: { lean: 0.2, ra: { raise: -0.5, out: 0.2, bend: 0.3 }, ...CROUCH },
    hit: { lean: 0.15, ra: { raise: 1.4, out: 0.1, bend: 0.3 } },
  },
  cast: {
    wind: { twist: 0.2, ra: { raise: 1.0, bend: 1.3 }, la: { raise: 0.9, out: 0.3, bend: 1.4 } },
    hit: {
      twist: -0.15,
      lean: 0.15,
      ra: { raise: 1.45, bend: 0.4 },
      la: { raise: 1.5, out: 0.2, bend: 0.15 },
    },
  },
  castWide: {
    wind: { lean: -0.05, ra: { raise: 1.2, out: 1.0, bend: 0.6 }, la: { raise: 1.2, out: 1.0, bend: 0.4 } },
    hit: { lean: 0.15, ra: { raise: 1.6, out: 0.35, bend: 0.2 }, la: { raise: 1.6, out: 0.35, bend: 0.1 } },
  },
  castUp: {
    wind: { head: -0.25, ra: { raise: 2.4, out: 0.3, bend: 0.4 }, la: { raise: 2.0, out: 0.6, bend: 0.3 } },
    hit: {
      head: -0.4,
      lean: -0.15,
      ra: { raise: 3.0, out: 0.15, bend: 0.1 },
      la: { raise: 2.6, out: 0.7, bend: 0.1 },
    },
  },
  castDown: {
    wind: { lean: 0.1, ra: { raise: 1.6, bend: 0.8 }, la: { raise: 1.2, out: 0.5 } },
    hit: { lean: 0.5, ra: { raise: 0.5, bend: 0.2 }, la: { raise: 0.8, out: 0.7 }, ...CROUCH },
  },
  blink: {
    wind: { lean: 0.35, ra: { raise: -0.5, out: 0.3 }, la: { raise: -0.5, out: 0.3 }, ...CROUCH },
    hit: { lean: 0.1, ra: { raise: 0.8, out: 0.9, bend: 0.3 }, la: { raise: 0.8, out: 0.9, bend: 0.3 } },
  },
  summon: {
    wind: { head: -0.2, ra: { raise: 2.6, out: 0.5, bend: 0.1 }, la: { raise: 2.6, out: 0.5, bend: 0.1 } },
    hit: {
      head: -0.35,
      ra: { raise: 2.95, out: 0.35, bend: 0.25 },
      la: { raise: 2.95, out: 0.35, bend: 0.25 },
    },
  },
};

/** The frame an action "lands" — first strike, shot, area, teleport or buff. */
export function impactFrame(a: ActionData): { at: number; until: number } {
  const c: [number, number][] = [];
  for (const s of a.strikes ?? []) c.push([s.frames[0], s.frames[1]]);
  for (const p of a.projectiles ?? []) c.push([p.frame, p.frame + 3]);
  for (const ar of a.areas ?? []) c.push([ar.frame, ar.frame + 4]);
  if (a.teleport) c.push([a.teleport.frame, a.teleport.frame + 4]);
  if (a.buff) c.push([a.buff.frame, a.buff.frame + 10]);
  if (a.counter) c.push([a.counter.frames[0], a.counter.frames[1]]);
  if (!c.length) return { at: Math.max(1, Math.floor(a.total / 3)), until: Math.floor(a.total / 2) };
  c.sort((x, y) => x[0] - y[0]);
  const at = Math.max(1, c[0]![0]);
  return { at, until: Math.max(at + 2, Math.min(c[0]![1], at + 14)) };
}

function stanceOf(char: number): Pose {
  return STANCE[WEAPON_OF[ROSTER[char]!.id] ?? 'none'] ?? STANCE.none!;
}

function actionPose(f: FighterState, stance: Pose, a: ActionData, style: AnimStyle): Pose {
  const keys = KEYS[style];
  const wind = withPose(stance, keys.wind);
  const hit = withPose(stance, keys.hit);
  const t = f.actionFrame;
  const { at, until } = impactFrame(a);
  let p: Pose;
  if (t < at) {
    const k = t / at;
    p = k < 0.6 ? lerpPose(stance, wind, easeOut(k / 0.6)) : lerpPose(wind, hit, easeIn((k - 0.6) / 0.4));
  } else if (t <= until) {
    p = hit;
  } else {
    p = lerpPose(hit, stance, easeOut(clamp01((t - until) / Math.max(1, a.total - until))));
  }
  // Continuous motions
  if (style === 'spin') {
    const strikes = a.strikes ?? [];
    const end = Math.max(...strikes.map((s) => s.frames[1]), at + 10);
    p = {
      ...p,
      yaw: -clamp01((t - at + 4) / Math.max(1, end - at + 4)) * Math.PI * 2 * (a.total > 90 ? 6 : 3),
    };
  }
  if (style === 'backflip' && a.jump) {
    const k = clamp01((t - a.jump.frame) / 26);
    p = { ...p, pitch: k * Math.PI * 2, ground: false };
  }
  if (
    style === 'carry' ||
    style === 'leap' ||
    style === 'dive' ||
    style === 'shootDown' ||
    style === 'summon'
  )
    p = { ...p, ground: false };
  return p;
}

function runPose(stance: Pose, weapon: string, phase: number, dash: boolean): Pose {
  const sw = Math.sin(phase);
  const amp = dash ? 0.95 : 0.75;
  const armsFree = weapon === 'none' || weapon === 'gauntlets';
  return withPose(stance, {
    lean: dash ? 0.55 : 0.28,
    twist: sw * 0.18,
    ll: { raise: sw * amp + 0.15, bend: 0.5 + Math.max(0, -sw) * 1.2, out: 0.06 },
    rl: { raise: -sw * amp + 0.15, bend: 0.5 + Math.max(0, sw) * 1.2, out: 0.06 },
    la:
      armsFree || weapon === 'staff'
        ? { raise: -sw * 0.8 + 0.2, bend: 1.3, out: 0.15 }
        : { raise: -sw * 0.35 + 0.2, bend: 0.9, out: 0.2 },
    ra:
      weapon === 'katana'
        ? { raise: -0.35, out: 0.25, bend: 0.3 } // blade trailing behind
        : weapon === 'staff'
          ? { raise: 0.35, bend: 1.2, out: 0.1 }
          : { raise: sw * (armsFree ? 0.8 : 0.35) + 0.2, bend: armsFree ? 1.3 : 0.9, out: 0.2 },
    lift: Math.abs(Math.cos(phase)) * 0.05,
  });
}

const GUARD_POSE: Record<string, PoseOverride> = {
  katana: {
    lean: 0.12,
    ra: { raise: 1.45, out: -0.45, bend: 0.9 },
    la: { raise: 1.3, out: -0.2, bend: 1.2 },
    ll: { raise: 0.45, bend: 0.7 },
    rl: { raise: -0.3, bend: 0.5 },
  },
  gauntlets: {
    lean: 0.18,
    la: { raise: 1.85, out: -0.45, bend: 2.3 },
    ra: { raise: 1.85, out: -0.45, bend: 2.3 },
    ll: { raise: 0.45, bend: 0.7 },
    rl: { raise: -0.3, bend: 0.5 },
  },
  pistols: {
    lean: 0.15,
    la: { raise: 1.6, out: -0.55, bend: 1.9 },
    ra: { raise: 1.6, out: -0.55, bend: 1.9 },
    ll: { raise: 0.4, bend: 0.6 },
  },
  staff: {
    lean: 0.12,
    ra: { raise: 1.35, out: -0.1, bend: 1.0 },
    la: { raise: 1.35, out: -0.5, bend: 1.0 },
    ll: { raise: 0.4, bend: 0.6 },
  },
  none: { la: { raise: 1.85, out: -0.45, bend: 2.3 }, ra: { raise: 1.85, out: -0.45, bend: 2.3 } },
};

const WIN_POSE: Record<string, PoseOverride> = {
  katana: {
    lean: -0.05,
    head: -0.15,
    ra: { raise: 2.95, out: 0.15, bend: 0.1 },
    la: { raise: 0.2, out: 0.5 },
  },
  gauntlets: {
    lean: -0.1,
    head: -0.15,
    ra: { raise: 0.9, out: 1.2, bend: 2.4 },
    la: { raise: 0.9, out: 1.2, bend: 2.4 },
  },
  pistols: {
    twist: 0.4,
    head: -0.1,
    ra: { raise: 2.8, out: 0.3, bend: 0.4 },
    la: { raise: 1.5, out: -0.4, bend: 1.9 },
  },
  staff: { head: -0.25, ra: { raise: 2.9, out: 0.2, bend: 0.2 }, la: { raise: 1.3, out: 0.9, bend: 0.2 } },
  none: { ra: { raise: 2.9, bend: 0.2 } },
};

const LYING: PoseOverride = {
  pitch: Math.PI / 2,
  lean: 0,
  twist: 0,
  head: 0.15,
  la: { raise: 0.4, out: 0.7, bend: 0.4 },
  ra: { raise: 0.2, out: 0.9, bend: 0.3 },
  ll: { raise: 0.2, out: 0.15, bend: 0.3 },
  rl: { raise: 0.05, out: 0.2, bend: 0.1 },
};

/**
 * The pose for fighter `index` in state `s`. `time` (seconds) only drives idle breathing and
 * wobble — never anything that must match the simulation.
 */
export function poseFor(s: GameState, index: number, time = 0): Pose {
  const f = s.fighters[index]!;
  const hero = ROSTER[f.char]!;
  const weapon = WEAPON_OF[hero.id] ?? 'none';
  const stance = stanceOf(f.char);
  const look = LOOKS[hero.id];
  const breathe = Math.sin(time * 2.2 + index) * 0.03;

  switch (f.state) {
    case FS.IDLE:
      return withPose(stance, { lean: stance.lean + breathe, head: -breathe });
    case FS.RUN:
      return runPose(stance, weapon, f.stateFrame * 0.42 + index, false);
    case FS.DASH:
      return runPose(stance, weapon, f.stateFrame * 0.6, true);
    case FS.JUMP_SQUAT:
    case FS.LAND:
      return withPose(stance, CROUCH);
    case FS.AIR:
      return withPose(stance, {
        ground: false,
        lean: 0.15,
        ll: { raise: 1.0, bend: 1.6 },
        rl: { raise: 0.4, bend: 1.3 },
        la: { raise: 0.9, out: 0.8 },
        ra: { raise: weapon === 'katana' ? 0.6 : 0.9, out: 0.8 },
      });
    case FS.GUARD:
    case FS.BLOCKSTUN:
      return withPose(stance, {
        ...GUARD_POSE[weapon],
        lean: f.state === FS.BLOCKSTUN ? -0.1 : (GUARD_POSE[weapon]?.lean ?? 0.1),
      });
    case FS.CHARGE: {
      const style = look?.anims[hero.actions[hero.chargeIdx]!.id] ?? 'slash';
      const tremble = Math.sin(time * 60) * 0.02;
      return withPose(withPose(stance, KEYS[style].wind), { lean: (KEYS[style].wind.lean ?? 0.2) + tremble });
    }
    case FS.ACTION: {
      const a = actionOf(f);
      if (!a) return stance;
      const style = look?.anims[a.id] ?? 'slash';
      return actionPose(f, stance, a, style);
    }
    case FS.HITSTUN: {
      const k = clamp01(f.stun / 18);
      return withPose(stance, {
        lean: -0.35 * k,
        head: -0.45 * k,
        twist: 0.3 * k,
        la: { raise: 0.5, out: 0.7 * k },
        ra: { raise: 0.4, out: 0.8 * k },
      });
    }
    case FS.GUARD_BREAK:
      return withPose(stance, {
        lean: -0.35,
        head: -0.35,
        la: { raise: 1.1, out: 1.3, bend: 0.2 },
        ra: { raise: 1.0, out: 1.3, bend: 0.2 },
      });
    case FS.DIZZY:
      return withPose(stance, {
        lean: 0.25 + Math.sin(time * 5) * 0.12,
        twist: Math.sin(time * 3.2) * 0.35,
        head: 0.35,
        la: { raise: 0.1, out: 0.25, bend: 0.2 },
        ra: { raise: 0.1, out: 0.25, bend: 0.2 },
        ll: { raise: 0.25, bend: 0.5 },
        rl: { raise: 0.1, bend: 0.5 },
      });
    case FS.LAUNCHED:
    case FS.KO: {
      const spin = Math.min(1.45, f.stateFrame * 0.07);
      const p = withPose(stance, {
        ground: false,
        pitch: spin,
        lean: -0.2,
        head: -0.4,
        la: { raise: 2.0, out: 0.8, bend: 0.3 },
        ra: { raise: 2.2, out: 0.9, bend: 0.4 },
        ll: { raise: 0.5, bend: 0.9 },
        rl: { raise: 0.2, bend: 0.5 },
      });
      if (f.y <= 0 && f.state === FS.KO) return withPose(stance, LYING);
      return p;
    }
    case FS.DOWN:
      return withPose(stance, LYING);
    case FS.GETUP:
      return lerpPose(withPose(stance, LYING), stance, easeOut(clamp01(f.stateFrame / 16)));
    case FS.HELD:
      return withPose(stance, {
        ground: false,
        pitch: 0.25,
        head: 0.3,
        la: { raise: 0.3, out: 0.6, bend: 0.2 },
        ra: { raise: 0.3, out: 0.6, bend: 0.2 },
        ll: { raise: 0.2, bend: 0.6 },
        rl: { raise: -0.1, bend: 0.5 },
      });
    case FS.FALLING:
      return withPose(stance, {
        ground: false,
        pitch: -0.3 + Math.sin(time * 9) * 0.2,
        head: -0.5,
        la: { raise: 2.6 + Math.sin(time * 14) * 0.4, out: 0.8 },
        ra: { raise: 2.6 + Math.cos(time * 14) * 0.4, out: 0.8 },
        ll: { raise: 0.6 + Math.sin(time * 12) * 0.5, bend: 0.8 },
        rl: { raise: 0.3 - Math.sin(time * 12) * 0.5, bend: 0.8 },
      });
    case FS.WIN:
      return withPose(stance, { ...WIN_POSE[weapon], lean: (WIN_POSE[weapon]?.lean ?? 0) + breathe });
    default:
      return stance;
  }
}

export function groundedHipHeight(p: Pose): number {
  const leg = (l: Limb) =>
    Math.cos(l.out) * (LIMBS.thigh * Math.cos(l.raise) + LIMBS.shin * Math.cos(l.raise - l.bend));
  return Math.max(leg(p.ll), leg(p.rl));
}

/** A stance for menus and portraits. */
export function stancePose(heroId: string, kind: 'idle' | 'win' | 'guard' = 'idle'): Pose {
  const weapon = WEAPON_OF[heroId] ?? 'none';
  const stance = STANCE[weapon] ?? STANCE.none!;
  if (kind === 'win') return withPose(stance, WIN_POSE[weapon] ?? {});
  if (kind === 'guard') return withPose(stance, GUARD_POSE[weapon] ?? {});
  return stance;
}

/** The hit pose of an action (ultimate cut-ins). */
export function actionHitPose(heroId: string, actionId: string): Pose {
  const weapon = WEAPON_OF[heroId] ?? 'none';
  const stance = STANCE[weapon] ?? STANCE.none!;
  const style = LOOKS[heroId]?.anims[actionId] ?? 'slash';
  return withPose(stance, KEYS[style].hit);
}
