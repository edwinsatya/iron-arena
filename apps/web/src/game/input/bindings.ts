import { BTN } from '@neonfist/shared';

/** KeyboardEvent.code → input bits (physical keys, so any keyboard layout works). */
export type KeyBindings = Record<string, number>;

/**
 * Playing alone (online, vs CPU, training): move with WASD or the arrows,
 * J attack · K guard · L / Space jump, U I O skills, P ultimate.
 * Chords work too: J+K = skill 1, J+L = skill 2, K+L = skill 3, J+K+L = ultimate.
 */
export const SOLO_KEYS: KeyBindings = {
  KeyW: BTN.UP,
  KeyS: BTN.DOWN,
  KeyA: BTN.LEFT,
  KeyD: BTN.RIGHT,
  ArrowUp: BTN.UP,
  ArrowDown: BTN.DOWN,
  ArrowLeft: BTN.LEFT,
  ArrowRight: BTN.RIGHT,
  KeyJ: BTN.ATTACK,
  KeyK: BTN.GUARD,
  KeyL: BTN.JUMP,
  Space: BTN.JUMP,
  KeyU: BTN.SKILL1,
  KeyI: BTN.SKILL2,
  KeyO: BTN.SKILL3,
  KeyP: BTN.ULT,
};

/** Local versus, left side of the keyboard. */
export const P1_KEYS: KeyBindings = {
  KeyW: BTN.UP,
  KeyS: BTN.DOWN,
  KeyA: BTN.LEFT,
  KeyD: BTN.RIGHT,
  KeyF: BTN.ATTACK,
  KeyG: BTN.GUARD,
  KeyH: BTN.JUMP,
  KeyR: BTN.SKILL1,
  KeyT: BTN.SKILL2,
  KeyY: BTN.SKILL3,
  KeyV: BTN.ULT,
};

/** Local versus, right side: arrows + numpad (or , . / and K L ; ' on laptops). */
export const P2_KEYS: KeyBindings = {
  ArrowUp: BTN.UP,
  ArrowDown: BTN.DOWN,
  ArrowLeft: BTN.LEFT,
  ArrowRight: BTN.RIGHT,
  Numpad1: BTN.ATTACK,
  Numpad2: BTN.GUARD,
  Numpad3: BTN.JUMP,
  Numpad4: BTN.SKILL1,
  Numpad5: BTN.SKILL2,
  Numpad6: BTN.SKILL3,
  Numpad0: BTN.ULT,
  Comma: BTN.ATTACK,
  Period: BTN.GUARD,
  Slash: BTN.JUMP,
  KeyK: BTN.SKILL1,
  KeyL: BTN.SKILL2,
  Semicolon: BTN.SKILL3,
  Quote: BTN.ULT,
};

/** Key labels shown on the HUD skill cards and the controls panel. */
export const KEY_HINTS = {
  solo: { attack: 'J', guard: 'K', jump: 'L', skills: ['U', 'I', 'O'], ult: 'P', move: 'WASD' },
  p1: { attack: 'F', guard: 'G', jump: 'H', skills: ['R', 'T', 'Y'], ult: 'V', move: 'WASD' },
  p2: {
    attack: 'Num1',
    guard: 'Num2',
    jump: 'Num3',
    skills: ['Num4', 'Num5', 'Num6'],
    ult: 'Num0',
    move: 'Arrows',
  },
} as const;
export type KeyHintSet = (typeof KEY_HINTS)[keyof typeof KEY_HINTS];

export function keyLabel(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '');
}
