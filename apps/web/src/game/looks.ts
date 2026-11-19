/**
 * Render-only hero looks: colours, sound family and which sprite animation plays for each
 * action. Gameplay data lives in packages/sim/data/heroes; sprites in public/sprites/<hero>/
 * (made by `pnpm sprites` from the elie automata packs).
 */

/**
 * A sprite animation for an action. The animation's contact frame lands on the action's impact
 * frame. `until`: switch to `after` from this action frame on (vanishes, stances).
 * `cycle`: from action frame `[0]` on, loop the animation every `[1]` frames (volleys, flurries).
 * `swap`: from action frame `[0]` on, show animation `[1]` instead (a turn in the middle of a move).
 * `end`: finish the animation by this action frame (before a `swap`).
 * `still`: the move's picture in menus and on the HUD comes from this animation instead.
 */
export type AnimRef =
  | string
  | {
      anim: string;
      until?: number;
      after?: string;
      cycle?: [number, number];
      hold?: number;
      puppet?: Puppet;
      swap?: [number, string];
      /** The animation's recovery ends at this action frame instead of the action's last (a
       * `swap` takes over from there). */
      end?: number;
      /** Animation whose contact frame is the move's picture (skill icons, the ultimate cut-in)
       * when its own contact frame isn't one: a beam of light, say. */
      still?: string;
    };

/**
 * Body motion added on top of the frames, for packs that lack an animation: the sprite is
 * leaned, pushed, squashed and stretched around the action's impact frame.
 * lunge = wind back, then thrust forward · cast = raise, then push out a spell · raise = rear up
 * (shouts, buffs) · guard = crouch behind the weapon · spin = loop the whole animation (turns)
 * · vanish = fade out into the impact and back in · thrust = draw back, then drive a spell out
 * with the whole body · slam = rise on the toes, then strike the ground · whirl = one full turn
 * through the facings, ending on the impact · levitate = float up and hover through the move.
 */
export type Puppet =
  'lunge' | 'cast' | 'raise' | 'guard' | 'spin' | 'vanish' | 'thrust' | 'slam' | 'whirl' | 'levitate';

export interface Look {
  /** Signature colour (UI, slashes, aura). */
  color: string;
  /** Second colour for gradients and effects. */
  glow: string;
  /** Sound family for hits and swings. */
  weapon:
    | 'axe'
    | 'bow'
    | 'hammer'
    | 'sword'
    | 'dagger'
    | 'fire'
    | 'ice'
    | 'anchor'
    | 'scythe'
    | 'claw'
    | 'lantern'
    | 'sting'
    | 'gauntlet'
    | 'rod'
    | 'staff'
    | 'horn'
    | 'optic'
    | 'none';
  /** Sprite animation per action id. */
  actions: Record<string, AnimRef>;
  /** Victory pose. */
  win: AnimRef;
  /** Hue shift (degrees) for the second costume when both players pick this hero. */
  altHue: number;
  /** The pack has no walk cycle: lean and bob over the idle frames while moving. */
  glide?: boolean;
  /**
   * Where the staff's flame is in each animation, in metres from the feet (right, up in the
   * art): one point, or one per frame. Spell flares are drawn on it.
   */
  staffTip?: Record<string, [number, number] | [number, number][]>;
}

export const LOOKS: Record<string, Look> = {
  benika: {
    color: '#ff4a3d',
    glow: '#ffb36b',
    weapon: 'axe',
    altHue: 200,
    win: { anim: 's3', hold: 9 },
    actions: {
      bn_b1: 'attack',
      bn_b2: 'attack',
      bn_b3: 'spin',
      bn_dash: 'attack',
      bn_air: 'spin',
      bn_charge: 's1',
      bn_s1: 's1',
      bn_s2: 's2',
      bn_s3: 's3',
      bn_ult: 'ult',
    },
  },
  lysa: {
    color: '#5fd46a',
    glow: '#d8ff8c',
    weapon: 'bow',
    altHue: 160,
    win: 'idle',
    actions: {
      ly_b1: 'attack',
      ly_b2: 'attack',
      ly_b3: 'attack',
      ly_dash: 'dash',
      ly_air: 'attack',
      ly_charge: 'attack',
      ly_s1: 'attack',
      ly_s2: 'dash',
      ly_s3: { anim: 'vortex', until: 34, after: 'idle' },
      ly_ult: { anim: 'attack', cycle: [24, 10] },
    },
  },
  hyoga: {
    color: '#5cc8ff',
    glow: '#dff6ff',
    weapon: 'hammer',
    altHue: 150,
    win: 'idle',
    actions: {
      hy_b1: 'hammerfall',
      hy_b2: 'cyclone',
      hy_dash: 'hammerfall',
      hy_air: 'hammerfall',
      hy_charge: 'hammerfall',
      hy_s1: 'hammerfall',
      hy_s2: 'cyclone',
      hy_s3: { anim: 'idle', puppet: 'raise' },
      hy_ult: 'hammerfall',
    },
  },
  hyoshin: {
    color: '#4fb6ff',
    glow: '#c9f1ff',
    weapon: 'ice',
    altHue: 280,
    win: { anim: 'barrier', hold: 10 },
    actions: {
      hs_b1: 'bolt',
      hs_b2: 'bolt',
      hs_b3: 'bolt',
      hs_dash: { anim: 'idle', puppet: 'vanish' },
      hs_air: 'bolt',
      hs_charge: 'bolt',
      hs_s1: 'bolt',
      hs_s2: { anim: 'barrier', until: 40, after: 'idle' },
      hs_s3: { anim: 'shatter', until: 30, after: 'idle' },
      hs_ult: { anim: 'zero', cycle: [24, 14] },
    },
  },
  akari: {
    color: '#ffb02e',
    glow: '#fff3b0',
    weapon: 'sword',
    altHue: 190,
    win: { anim: 'chant', hold: 8 },
    actions: {
      ak_b1: 'down',
      ak_b2: 'rise',
      ak_b3: 'over',
      ak_dash: { anim: 'down', puppet: 'lunge' },
      ak_air: 'down',
      ak_charge: 'over',
      ak_s1: 'rise',
      ak_s2: { anim: 'down', puppet: 'lunge' },
      ak_s3: 'over',
      ak_ult: 'chant',
    },
  },
  reo: {
    color: '#ffc94a',
    glow: '#9fc4ff',
    weapon: 'sword',
    altHue: 140,
    win: 'idle',
    actions: {
      re_b1: 'attack',
      re_b2: 'attack',
      re_b3: 'attack',
      re_dash: { anim: 'walk', puppet: 'lunge' },
      re_air: 'attack',
      re_charge: 'attack',
      re_s1: 'attack',
      re_s2: 'attack',
      re_s3: { anim: 'idle', puppet: 'guard' },
      re_s3_strike: 'attack',
      re_ult: { anim: 'attack', cycle: [10, 10] },
    },
  },
  kage: {
    color: '#a477ff',
    glow: '#e2d4ff',
    weapon: 'dagger',
    altHue: 120,
    win: 'front',
    actions: {
      kg_b1: 'attack',
      kg_b2: 'attack',
      kg_b3: { anim: 'attack', puppet: 'lunge' },
      kg_dash: { anim: 'attack', puppet: 'lunge' },
      kg_air: 'throw',
      kg_charge: { anim: 'attack', puppet: 'lunge' },
      kg_s1: 'throw',
      kg_s2: { anim: 'attack', puppet: 'vanish' },
      kg_s3: { anim: 'idle', puppet: 'guard' },
      kg_s3_strike: { anim: 'attack', puppet: 'lunge' },
      kg_ult: { anim: 'turn', puppet: 'spin' },
    },
  },
  homura: {
    color: '#ff6a2a',
    glow: '#ffd27a',
    weapon: 'fire',
    altHue: 210,
    win: 'front',
    glide: true,
    actions: {
      // Fireballs: turned to the viewer with the staff up, then a snap into profile as it flies
      hm_b1: { anim: 'cast', puppet: 'thrust', swap: [9, 'idle'] },
      hm_b2: { anim: 'cast', puppet: 'thrust', swap: [9, 'idle'] },
      hm_b3: { anim: 'cast', puppet: 'thrust', swap: [12, 'idle'] },
      hm_dash: { anim: 'idle', puppet: 'vanish' },
      hm_air: { anim: 'idle', puppet: 'thrust' },
      hm_charge: { anim: 'cast', puppet: 'thrust', swap: [16, 'idle'] },
      // Kaen Pillar: faces the viewer, rises on her toes and drives the staff down
      hm_s1: { anim: 'front', puppet: 'slam' },
      // Homura Wave: the staff strikes the ground and the fire rolls out from it
      hm_s2: { anim: 'idle', puppet: 'slam' },
      // Hōen Ward: one full turn, the staff tracing the ring of fire around her
      hm_s3: { anim: 'turn', puppet: 'whirl' },
      // Ryūsei Meteor: she floats up off the ground and calls the sky down
      hm_ult: { anim: 'front', puppet: 'levitate' },
    },
    // Measured from the free pack's frames (the bright flame on top of the staff)
    staffTip: {
      idle: [
        [0.12, 1.17],
        [0.11, 1.18],
        [0.12, 1.18],
        [0.13, 1.19],
        [0.16, 1.19],
        [0.16, 1.21],
        [0.17, 1.22],
        [0.17, 1.22],
        [0.15, 1.21],
        [0.14, 1.21],
        [0.1, 1.16],
        [0.07, 1.13],
        [0.11, 1.15],
      ],
      cast: [
        [0.45, 1.27],
        [0.43, 1.28],
        [0.45, 1.3],
        [0.36, 1.24],
        [0.3, 1.24],
        [0.29, 1.26],
        [0.27, 1.23],
        [0.3, 1.27],
        [0.33, 1.28],
        [0.33, 1.25],
        [0.41, 1.27],
        [0.42, 1.25],
        [0.44, 1.28],
      ],
      front: [0.29, 1.23],
      turn: [
        [0.11, 1.13],
        [0.45, 1.27],
        [0.29, 1.22],
        [-0.41, 1.27],
        [-0.07, 1.13],
        [-0.05, 1.32],
        [-0.39, 1.35],
        [0.09, 1.32],
      ],
    },
  },
  gokai: {
    color: '#3fe0c0',
    glow: '#b8fff0',
    weapon: 'anchor',
    altHue: 160,
    win: 'front',
    actions: {
      gk_b1: 'attack',
      gk_b2: 'attack',
      gk_b3: { anim: 'attack', puppet: 'lunge' },
      gk_dash: { anim: 'walk', puppet: 'lunge' },
      gk_air: 'attack',
      gk_charge: { anim: 'attack', puppet: 'lunge' },
      gk_s1: { anim: 'cast', puppet: 'cast' },
      gk_s2: { anim: 'cast', puppet: 'cast' },
      gk_s3: { anim: 'cast', puppet: 'raise' },
      gk_ult: { anim: 'cast', puppet: 'raise' },
    },
  },
  yomi: {
    color: '#c04cff',
    glow: '#ff9cf0',
    weapon: 'scythe',
    altHue: 100,
    win: 'front',
    actions: {
      ym_b1: 'attack',
      ym_b2: 'attack',
      ym_b3: { anim: 'attack', puppet: 'lunge' },
      ym_dash: { anim: 'attack', puppet: 'lunge' },
      ym_air: 'attack',
      ym_charge: { anim: 'attack', puppet: 'lunge' },
      ym_s1: 'attack',
      ym_s2: { anim: 'attack', puppet: 'lunge' },
      ym_s3: { anim: 'front', puppet: 'raise' },
      ym_ult: { anim: 'front', puppet: 'raise' },
    },
  },
  kuma: {
    color: '#ff8a3a',
    glow: '#ffd9a8',
    weapon: 'claw',
    altHue: 180,
    win: 'front',
    actions: {
      km_b1: 'attack',
      km_b2: 'attack',
      km_b3: { anim: 'attack', puppet: 'lunge' },
      km_dash: { anim: 'walk', puppet: 'lunge' },
      km_air: 'attack',
      km_charge: { anim: 'attack', puppet: 'lunge' },
      km_s1: { anim: 'front', puppet: 'raise' },
      km_s2: { anim: 'attack', cycle: [8, 6] },
      km_s3: { anim: 'idle', puppet: 'guard' },
      km_ult: { anim: 'attack', cycle: [10, 8] },
    },
  },
  karasu: {
    color: '#8fe05a',
    glow: '#e2ffb5',
    weapon: 'lantern',
    altHue: 250,
    win: { anim: 'win', hold: 6 },
    actions: {
      kr_b1: 'attack',
      kr_b2: 'swing2',
      kr_b3: 'slam',
      kr_dash: { anim: 'attack', puppet: 'lunge' },
      kr_air: 'toss',
      kr_charge: 'plague',
      kr_s1: 'toss',
      kr_s2: 'present',
      kr_s3: { anim: 'veil', until: 22, after: 'idle' },
      kr_ult: 'ultcast',
    },
  },
  kamakiri: {
    color: '#a8f5cf',
    glow: '#effff7',
    weapon: 'scythe',
    altHue: 130,
    win: { anim: 'win', hold: 3 },
    actions: {
      mt_b1: 'attack',
      mt_b2: 'spin',
      mt_b3: 'twin',
      mt_dash: { anim: 'attack', puppet: 'lunge' },
      mt_air: 'dive',
      mt_charge: 'twin',
      mt_s1: 'double',
      mt_s2: 'dive',
      mt_s3: 'snare',
      mt_s3_maul: { anim: 'spin', cycle: [6, 10] },
      mt_ult: 'hover',
    },
  },
  kurage: {
    color: '#d667ff',
    glow: '#ffc8ff',
    weapon: 'sting',
    altHue: 150,
    win: 'win',
    actions: {
      jl_b1: 'attack',
      jl_b2: 'lash',
      jl_b3: 'attack',
      jl_dash: { anim: 'walk', puppet: 'lunge' },
      jl_air: 'attack',
      jl_charge: 'lash',
      jl_s1: 'attack',
      jl_s2: { anim: 'pulse', puppet: 'raise' },
      jl_s3: 'attack',
      jl_ult: { anim: 'front', puppet: 'raise' },
    },
  },
  kemuri: {
    color: '#ff3b6b',
    glow: '#e7a8ff',
    weapon: 'gauntlet',
    altHue: 150,
    win: 'front',
    actions: {
      // One punch in the pack: the combo also uses its 3/4 view and the ultimate's straight arm
      ke_b1: 'jab',
      ke_b2: 'jab2',
      ke_b3: 'cross',
      ke_b4: 'smokestrike',
      ke_dash: { anim: 'cross', puppet: 'lunge' },
      // Facing out: the hammer fist
      ke_air: 'slam',
      ke_charge: 'slam',
      ke_s1: 'brand',
      ke_s2: 'prime',
      ke_s3: 'screen',
      // Blow after blow: the charged arm drawn back and driven out again
      ke_ult: { anim: 'ult', cycle: [28, 7] },
    },
  },
  raika: {
    color: '#ff58e0',
    glow: '#c6f7ff',
    weapon: 'sword',
    altHue: 140,
    win: { anim: 'win', hold: 8 },
    actions: {
      ra_b1: 'cut',
      ra_b2: 'thrust',
      // The alternate view of the seam cut, so the combo ender isn't Shisen Seam Ripper again
      ra_b3: 'seam',
      ra_dash: 'lunge',
      ra_air: 'cut',
      ra_charge: 'breaker',
      ra_s1: 'ripper',
      ra_s2: 'lock',
      ra_s3: 'decoy',
      ra_ult: 'ult',
    },
  },
  ikazuchi: {
    color: '#ffb21e',
    glow: '#fff1b0',
    weapon: 'rod',
    altHue: 200,
    win: { anim: 'win', hold: 8 },
    actions: {
      ik_b1: 'jab',
      ik_b2: 'knuckle',
      ik_b3: 'discharge',
      ik_dash: { anim: 'knuckle', puppet: 'lunge' },
      ik_air: 'jab',
      ik_charge: 'discharge',
      ik_s1: 'imprint',
      ik_s2: 'relay',
      // Wrapped in the cloak until it is struck
      ik_s3: { anim: 'cloak', until: 10, after: 'guard' },
      ik_s3_strike: 'reversal',
      ik_ult: { anim: 'theorem', cycle: [26, 12] },
    },
  },
  amane: {
    color: '#ffd76a',
    glow: '#fffaf0',
    weapon: 'staff',
    altHue: 300,
    win: { anim: 'win', hold: 8 },
    actions: {
      am_b1: 'staff',
      am_b2: 'wing',
      am_b3: 'point',
      am_dash: { anim: 'wing', puppet: 'lunge' },
      am_air: 'wing',
      am_charge: 'staff',
      am_s1: 'verdict',
      am_s2: 'wingbeat',
      am_s3: 'oath',
      am_ult: 'halo',
    },
  },
  tsuno: {
    color: '#9fd4ff',
    glow: '#f2fbff',
    weapon: 'horn',
    altHue: 30,
    win: 'win',
    actions: {
      ts_b1: 'butt',
      ts_b2: 'rear',
      ts_b3: 'butt',
      ts_dash: 'ram',
      ts_air: 'rear',
      ts_charge: { anim: 'butt', puppet: 'lunge' },
      ts_s1: 'jump',
      ts_s2: 'trail',
      ts_s3: 'hunker',
      // Rears up, then the stampede
      ts_ult: { anim: 'rear', swap: [20, 'ram'] },
    },
  },
  shirogane: {
    color: '#8fb8ff',
    glow: '#fff3cf',
    weapon: 'sword',
    altHue: 160,
    win: { anim: 'win', hold: 8 },
    actions: {
      sg_b1: 'cut',
      sg_b2: 'cut2',
      sg_b3: 'slash',
      sg_dash: { anim: 'cut', puppet: 'lunge' },
      sg_air: 'slash',
      // Facing out: the wide sweep
      sg_charge: 'sweep',
      sg_s1: 'cast',
      // Facing out: the blade coiled overhead and brought down
      sg_s2: 'coil',
      sg_s3: 'bless',
      sg_ult: 'judgment',
    },
  },
  roga: {
    color: '#7fd8ff',
    glow: '#e6fbff',
    weapon: 'axe',
    altHue: 200,
    win: { anim: 'win', hold: 7 },
    actions: {
      rg_b1: 'chop',
      rg_b2: 'hew',
      rg_b3: 'slam',
      rg_dash: { anim: 'chop', puppet: 'lunge' },
      rg_air: 'hew',
      rg_charge: 'execute',
      rg_s1: 'cleave',
      rg_s2: 'decree',
      rg_s3: 'oath',
      // The hand thrust out at the enemy, the frost flaring through him while the crown holds
      rg_ult: { anim: 'crown', cycle: [30, 12] },
    },
  },
  mitsume: {
    color: '#ff3346',
    glow: '#ffe2a0',
    weapon: 'optic',
    altHue: 180,
    win: { anim: 'win', hold: 7 },
    actions: {
      mi_b1: 'zap',
      mi_b2: 'zap',
      mi_b3: 'pulse',
      mi_dash: 'hop',
      mi_air: 'zap',
      mi_charge: 'pulse',
      mi_s1: 'lock',
      mi_s2: 'burst',
      mi_s3: 'calibrate',
      // The array's lenses flare over and over while the panels hold the target
      mi_ult: { anim: 'array', cycle: [28, 16] },
    },
  },
  juki: {
    color: '#f2b31c',
    glow: '#ff4a3a',
    weapon: 'hammer',
    altHue: 200,
    win: { anim: 'win', hold: 8 },
    actions: {
      jk_b1: 'stomp',
      jk_b2: 'stamp',
      // Both stomps, one per strike
      jk_b3: 'slam',
      jk_dash: 'rush',
      jk_air: 'stamp',
      jk_charge: { anim: 'stomp', puppet: 'slam' },
      jk_s1: 'slam',
      jk_s2: 'charge',
      jk_s3: 'brace',
      // The boost across the stage, then stamping over and over until the reactor blows
      jk_ult: { anim: 'charge', swap: [38, 'slam'], cycle: [42, 8] },
    },
  },
  shinku: {
    color: '#e8243c',
    glow: '#ffb0a8',
    weapon: 'sword',
    altHue: 230,
    win: { anim: 'win', hold: 7 },
    actions: {
      sk_b1: 'cut',
      sk_b2: 'brand',
      sk_b3: { anim: 'wings', puppet: 'lunge' },
      sk_dash: 'glide',
      sk_air: 'cut',
      sk_charge: { anim: 'impale', puppet: 'slam' },
      sk_s1: 'impale',
      sk_s2: 'consecrate',
      // Up into the beam, across the stage as light, down as a beam in front of the enemy
      sk_s3: { anim: 'descent', still: 'wings' },
      // The descent onto the enemy, then roaring over the planted blade while the seal burns
      sk_ult: { anim: 'descent', end: 54, swap: [54, 'roar'], still: 'roar' },
    },
  },
  dummy: {
    color: '#b8b2c8',
    glow: '#ffffff',
    weapon: 'none',
    altHue: 0,
    win: 'idle',
    actions: { d_jab: 'idle' },
  },
};

export function lookFor(heroId: string): Look {
  return LOOKS[heroId] ?? LOOKS.dummy!;
}

export const WEAPON_OF: Record<string, Look['weapon']> = Object.fromEntries(
  Object.entries(LOOKS).map(([k, v]) => [k, v.weapon]),
);
