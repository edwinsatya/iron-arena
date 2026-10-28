import type { KeyBindings } from './bindings';
import { GamepadSampler } from './gamepad';
import { KeyboardSampler } from './keyboard';

export interface InputSource {
  sample(): number;
  dispose(): void;
}

/** Keyboard + gamepad combined into one player's input. */
export function createPlayerInput(keys: KeyBindings, pad: number | 'any' | null): InputSource {
  const kb = new KeyboardSampler(keys);
  const gp = pad === null ? null : new GamepadSampler(pad);
  return {
    sample: () => kb.sample() | (gp ? gp.sample() : 0),
    dispose: () => kb.dispose(),
  };
}

/** A computer-controlled source (training dummy, random CPU). */
export function createScriptedInput(next: () => number): InputSource {
  return { sample: next, dispose: () => {} };
}
