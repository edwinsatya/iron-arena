import { BTN } from '@neonfist/shared';

/** KeyboardEvent.code → input bits (physical keys, so any keyboard layout works). Appendix A. */
export type KeyBindings = Record<string, number>;

export const P1_KEYS: KeyBindings = {
  KeyW: BTN.UP,
  KeyS: BTN.DOWN,
  KeyA: BTN.LEFT,
  KeyD: BTN.RIGHT,
  KeyU: BTN.B1,
  KeyI: BTN.B2,
  KeyJ: BTN.B3,
  KeyK: BTN.B4,
  KeyO: BTN.B1 | BTN.B2,
  KeyL: BTN.B3 | BTN.B4,
};

/** Second player on the same keyboard (local versus). Numpad, or [ ] ; ' on laptops. */
export const P2_KEYS: KeyBindings = {
  ArrowUp: BTN.UP,
  ArrowDown: BTN.DOWN,
  ArrowLeft: BTN.LEFT,
  ArrowRight: BTN.RIGHT,
  Numpad4: BTN.B1,
  Numpad5: BTN.B2,
  Numpad1: BTN.B3,
  Numpad2: BTN.B4,
  Numpad6: BTN.B1 | BTN.B2,
  Numpad3: BTN.B3 | BTN.B4,
  BracketLeft: BTN.B1,
  BracketRight: BTN.B2,
  Semicolon: BTN.B3,
  Quote: BTN.B4,
};

/** When you play alone (online, training) the arrow keys also move you. */
export const SOLO_KEYS: KeyBindings = {
  ...P1_KEYS,
  ArrowUp: BTN.UP,
  ArrowDown: BTN.DOWN,
  ArrowLeft: BTN.LEFT,
  ArrowRight: BTN.RIGHT,
};

export function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ').replace(/^Arrow/, '');
}
