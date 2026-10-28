import type { CharacterData, Cylinder } from '../../src/types';

/** Hurt cylinders for an average build (mm, relative to the feet). PLAN §5.4 */
export const STAND_HURT: Cylinder[] = [
  { r: 150, y0: 1380, y1: 1780, zone: 'high' },
  { r: 200, y0: 780, y1: 1380, zone: 'mid' },
  { r: 180, y0: 0, y1: 780, zone: 'low' },
];

export const CROUCH_HURT: Cylinder[] = [
  { r: 220, y0: 480, y1: 1080, zone: 'mid' },
  { r: 200, y0: 0, y1: 480, zone: 'low' },
];

/** Airborne (juggled) body: lying, wide. Relative to the fighter's root height. */
export const AIR_HURT: Cylinder[] = [{ r: 340, y0: -100, y1: 750, zone: 'mid' }];

/** Forward dash: 12 frames, 1.2 m. */
export const DASH_PROFILE = [140, 140, 130, 120, 110, 100, 100, 90, 80, 70, 60, 60];

/** Backdash: 18 frames, 1.0 m. */
export const BACKDASH_PROFILE = [110, 105, 100, 95, 88, 80, 72, 64, 56, 48, 42, 36, 30, 25, 20, 15, 10, 4];

export type CharacterBase = Omit<CharacterData, 'moves'>;
