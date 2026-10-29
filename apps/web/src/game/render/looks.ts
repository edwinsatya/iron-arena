/**
 * Render-only hero looks: colours, model, weapon, accessories and per-action animation styles.
 * Gameplay data lives in packages/sim/data/heroes.
 */

export type AnimStyle =
  | 'slash'
  | 'backslash'
  | 'risingSlash'
  | 'overhead'
  | 'thrust'
  | 'spin'
  | 'iai'
  | 'dashCut'
  | 'counter'
  | 'jab'
  | 'hook'
  | 'uppercut'
  | 'tackle'
  | 'hammer'
  | 'dive'
  | 'leap'
  | 'flex'
  | 'grab'
  | 'carry'
  | 'shootR'
  | 'shootL'
  | 'shootBoth'
  | 'shootDown'
  | 'aim'
  | 'spread'
  | 'backflip'
  | 'toss'
  | 'cast'
  | 'castWide'
  | 'castUp'
  | 'castDown'
  | 'blink'
  | 'summon';

export interface Look {
  /** Signature colour (UI, trails, aura). */
  color: string;
  /** Second colour for gradients and effects. */
  glow: string;
  /** Multiply tints applied to the anime model's materials. */
  tint: { hair: string; top: string; bottom: string; skin?: string };
  /** Width multiplier (bulkier heroes). */
  bulk: number;
  scale: number;
  accessory: 'headband' | 'scarf' | 'cap' | 'halo' | 'none';
  /** Parts of the stand-in model to hide (mesh or material name fragments). */
  hide?: string[];
  /** Mannequin fallback colours. */
  primary: string;
  secondary: string;
  skin: string;
  hairColor: string;
  accent: string;
  build: 'lean' | 'heavy';
  anims: Record<string, AnimStyle>;
}

export const LOOKS: Record<string, Look> = {
  kaito: {
    color: '#ffd23f',
    glow: '#7fd8ff',
    tint: { hair: '#3a3f66', top: '#ff5a4a', bottom: '#e8e6f2' },
    bulk: 1,
    scale: 1,
    accessory: 'headband',
    hide: ['robo_arm', 'backpack', 'green_emit'],
    primary: '#e8304a',
    secondary: '#f2eeff',
    skin: '#e9b896',
    hairColor: '#1b1533',
    accent: '#ffd23f',
    build: 'lean',
    anims: {
      k_b1: 'slash',
      k_b2: 'backslash',
      k_b3: 'slash',
      k_b4: 'risingSlash',
      k_dash: 'thrust',
      k_air: 'dive',
      k_charge: 'iai',
      k_s1: 'dashCut',
      k_s2: 'spin',
      k_s3: 'counter',
      k_s3_strike: 'overhead',
      k_ult: 'spin',
    },
  },
  magnus: {
    color: '#ff8a2a',
    glow: '#ffd27a',
    tint: { hair: '#bfbfc4', top: '#6d7488', bottom: '#5b4030' },
    bulk: 1.18,
    scale: 1.1,
    accessory: 'scarf',
    hide: ['backpack', 'green_emit'],
    primary: '#3b4157',
    secondary: '#6f4428',
    skin: '#cf9466',
    hairColor: '#cfc8bd',
    accent: '#ffb43a',
    build: 'heavy',
    anims: {
      m_b1: 'jab',
      m_b2: 'hook',
      m_b3: 'uppercut',
      m_dash: 'tackle',
      m_air: 'dive',
      m_charge: 'hammer',
      m_s1: 'tackle',
      m_s2: 'leap',
      m_s3: 'flex',
      m_ult: 'grab',
      m_ult_slam: 'carry',
    },
  },
  riko: {
    color: '#ff3d8b',
    glow: '#ffb3d1',
    tint: { hair: '#ff8fb8', top: '#ff6aa2', bottom: '#3c3a58' },
    bulk: 1,
    scale: 0.97,
    accessory: 'cap',
    primary: '#ff3d8b',
    secondary: '#2c2a44',
    skin: '#f0c4a4',
    hairColor: '#ff7fb0',
    accent: '#ffe066',
    build: 'lean',
    anims: {
      r_b1: 'shootR',
      r_b2: 'shootL',
      r_b3: 'shootR',
      r_b4: 'shootBoth',
      r_dash: 'shootBoth',
      r_air: 'shootDown',
      r_charge: 'aim',
      r_s1: 'spread',
      r_s2: 'backflip',
      r_s3: 'toss',
      r_ult: 'summon',
    },
  },
  seren: {
    color: '#9b7bff',
    glow: '#d9ccff',
    tint: { hair: '#dcdcff', top: '#b9a8ff', bottom: '#4a3f7a' },
    bulk: 1,
    scale: 1,
    accessory: 'halo',
    primary: '#7b5cff',
    secondary: '#f2eeff',
    skin: '#f3d2bc',
    hairColor: '#e6e6ff',
    accent: '#c9f0ff',
    build: 'lean',
    anims: {
      s_b1: 'cast',
      s_b2: 'cast',
      s_b3: 'castWide',
      s_dash: 'castDown',
      s_air: 'castDown',
      s_charge: 'aim',
      s_s1: 'castWide',
      s_s2: 'castDown',
      s_s3: 'blink',
      s_ult: 'castUp',
    },
  },
  dummy: {
    color: '#a8adc4',
    glow: '#ffffff',
    tint: { hair: '#8a8fa8', top: '#8a8fa8', bottom: '#5d6178' },
    bulk: 1,
    scale: 1,
    accessory: 'none',
    primary: '#8a8fa8',
    secondary: '#5d6178',
    skin: '#b9bdd0',
    hairColor: '#5d6178',
    accent: '#d8dbe8',
    build: 'lean',
    anims: { d_jab: 'jab' },
  },
};

/** Second costume when both players pick the same hero. */
const ALT: Record<string, Partial<Look>> = {
  kaito: {
    tint: { hair: '#e8e8f0', top: '#3d7bff', bottom: '#2a2838' },
    primary: '#2a6df4',
    accent: '#7fd8ff',
  },
  magnus: { tint: { hair: '#4a3a30', top: '#8c2f3c', bottom: '#2b2b33' }, primary: '#7c2d3a' },
  riko: { tint: { hair: '#7fe0ff', top: '#3fc6ff', bottom: '#2d2a3f' }, primary: '#2fb5ff' },
  seren: { tint: { hair: '#ffd9a8', top: '#ffcf8a', bottom: '#5a3a2a' }, primary: '#ffb44a' },
  dummy: {},
};

export function lookFor(charId: string, alt: boolean): Look {
  const base = LOOKS[charId] ?? LOOKS.dummy!;
  return alt ? { ...base, ...ALT[charId] } : base;
}

export const WEAPON_OF: Record<string, 'katana' | 'gauntlets' | 'pistols' | 'staff' | 'none'> = {
  kaito: 'katana',
  magnus: 'gauntlets',
  riko: 'pistols',
  seren: 'staff',
  dummy: 'none',
};
