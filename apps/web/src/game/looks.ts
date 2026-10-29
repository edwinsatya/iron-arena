/**
 * Render-only hero looks: colours, sound family and which sprite animation plays for each
 * action. Gameplay data lives in packages/sim/data/heroes; sprites in public/sprites/<hero>/
 * (made by `pnpm sprites` from the elie automata packs).
 */

/**
 * A sprite animation for an action. The animation's contact frame lands on the action's impact
 * frame. `until`: switch to `after` from this action frame on (vanishes, stances).
 * `cycle`: from action frame `[0]` on, loop the animation every `[1]` frames (volleys, flurries).
 */
export type AnimRef =
  | string
  | { anim: string; until?: number; after?: string; cycle?: [number, number]; hold?: number; puppet?: Puppet };

/**
 * Body motion added on top of the frames, for packs that lack an animation: the sprite is
 * leaned, pushed, squashed and stretched around the action's impact frame.
 * lunge = wind back, then thrust forward · cast = raise, then push out a spell · raise = rear up
 * (shouts, buffs) · guard = crouch behind the weapon · spin = loop the whole animation (turns)
 * · vanish = fade out into the impact and back in.
 */
export type Puppet = 'lunge' | 'cast' | 'raise' | 'guard' | 'spin' | 'vanish';

export interface Look {
  /** Signature colour (UI, slashes, aura). */
  color: string;
  /** Second colour for gradients and effects. */
  glow: string;
  /** Sound family for hits and swings. */
  weapon: 'axe' | 'bow' | 'hammer' | 'sword' | 'dagger' | 'fire' | 'ice' | 'none';
  /** Sprite animation per action id. */
  actions: Record<string, AnimRef>;
  /** Victory pose. */
  win: AnimRef;
  /** Hue shift (degrees) for the second costume when both players pick this hero. */
  altHue: number;
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
      kg_air: 'attack',
      kg_charge: { anim: 'attack', puppet: 'lunge' },
      kg_s1: 'attack',
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
    actions: {
      hm_b1: { anim: 'idle', puppet: 'cast' },
      hm_b2: { anim: 'idle', puppet: 'cast' },
      hm_b3: { anim: 'idle', puppet: 'cast' },
      hm_dash: { anim: 'idle', puppet: 'vanish' },
      hm_air: { anim: 'idle', puppet: 'cast' },
      hm_charge: { anim: 'idle', puppet: 'cast' },
      hm_s1: { anim: 'front', puppet: 'raise' },
      hm_s2: { anim: 'idle', puppet: 'cast' },
      hm_s3: { anim: 'turn', puppet: 'spin' },
      hm_ult: { anim: 'front', puppet: 'raise' },
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
