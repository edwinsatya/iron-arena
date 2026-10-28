/** Render-only character looks and per-move animation kinds (gameplay data lives in the sim). */

export interface Look {
  scale: number;
  primary: string; // jacket / top
  secondary: string; // pants
  skin: string;
  hair: string;
  accent: string; // headband, belt, gloves
  build: 'lean' | 'heavy';
}

export const LOOKS: Record<string, Look> = {
  kaito: {
    scale: 1,
    primary: '#e8304a',
    secondary: '#f2eeff',
    skin: '#e9b896',
    hair: '#1b1533',
    accent: '#ffd23f',
    build: 'lean',
  },
  magnus: {
    scale: 1.1,
    primary: '#3b4157',
    secondary: '#6f4428',
    skin: '#cf9466',
    hair: '#cfc8bd',
    accent: '#ffb43a',
    build: 'heavy',
  },
  dummy: {
    scale: 1,
    primary: '#8a8fa8',
    secondary: '#5d6178',
    skin: '#b9bdd0',
    hair: '#5d6178',
    accent: '#d8dbe8',
    build: 'lean',
  },
};

/** Alternate palette when both players pick the same fighter. */
export const MIRROR_LOOKS: Record<string, Partial<Look>> = {
  kaito: { primary: '#2a6df4', secondary: '#1d1a2e', accent: '#2ee6ff' },
  magnus: { primary: '#7c2d3a', secondary: '#2b2b33', accent: '#ff2e88' },
  dummy: { primary: '#6f8a7c' },
};

export function lookFor(charId: string, mirrored: boolean): Look {
  const base = LOOKS[charId] ?? LOOKS.dummy!;
  return mirrored ? { ...base, ...(MIRROR_LOOKS[charId] ?? {}) } : base;
}

export type MoveKind =
  | 'jab'
  | 'cross'
  | 'upper'
  | 'elbow'
  | 'frontkick'
  | 'highkick'
  | 'lowjab'
  | 'lowkick'
  | 'sweep'
  | 'comet'
  | 'phantom'
  | 'palm'
  | 'backfist'
  | 'stomp'
  | 'hook'
  | 'overhead'
  | 'charge'
  | 'grab';

export const MOVE_KINDS: Record<string, MoveKind> = {
  kaito_1: 'jab',
  kaito_1_2: 'cross',
  kaito_2: 'cross',
  kaito_3: 'frontkick',
  kaito_4: 'highkick',
  kaito_d1: 'lowjab',
  kaito_d3: 'lowkick',
  kaito_d4: 'sweep',
  kaito_df1: 'elbow',
  kaito_df2: 'upper',
  kaito_ff3: 'comet',
  kaito_b3: 'phantom',
  kaito_b12: 'palm',
  kaito_ss2: 'backfist',
  kaito_13: 'grab',
  kaito_24: 'grab',
  magnus_1: 'jab',
  magnus_1_2: 'cross',
  magnus_2: 'cross',
  magnus_3: 'frontkick',
  magnus_4: 'overhead',
  magnus_d1: 'lowjab',
  magnus_d3: 'stomp',
  magnus_df2: 'upper',
  magnus_b2: 'hook',
  magnus_ff2: 'charge',
  magnus_f12: 'grab',
  magnus_13: 'grab',
  magnus_24: 'grab',
  dummy_1: 'jab',
  dummy_1_2: 'cross',
  dummy_2: 'cross',
  dummy_3: 'frontkick',
  dummy_d3: 'lowkick',
  dummy_df2: 'upper',
  dummy_throw: 'grab',
};
