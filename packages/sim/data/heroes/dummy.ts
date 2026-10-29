import type { HeroData } from '../../src/types';

/** Training dummy: a wasteland juggernaut who stands there and takes it. Hidden from the select screen. */
export const dummy: HeroData = {
  id: 'dummy',
  name: 'Training Dummy',
  title: 'Sparring Partner',
  kana: 'ダミー',
  role: 'Dummy',
  weapon: 'none',
  difficulty: 1,
  blurb: 'Stands there. Takes it.',
  hp: 1000,
  speed: 60,
  jumpVy: 125,
  defensePct: 100,
  hidden: true,
  basic: ['d_jab'],
  dashAttack: 'd_jab',
  airAttack: 'd_jab',
  charge: 'd_jab',
  skills: ['d_jab', 'd_jab', 'd_jab'],
  ultimate: 'd_jab',
  actions: [
    {
      id: 'd_jab',
      name: 'Jab',
      total: 22,
      lockOn: 3000,
      strikes: [{ frames: [7, 9], at: [600, 1100, 0], r: 450, hit: { damage: 30, hitstun: 16, kb: 10 } }],
      cooldown: 300,
      cancelFrom: 12,
    },
  ],
};
