import { cpuBot, type CpuOptions, type GameState } from '@neonfist/sim';
import type { KeyBindings } from './bindings';
import { GamepadSampler } from './gamepad';
import { KeyboardSampler } from './keyboard';
import { touchInput } from './touch';

export interface InputSource {
  /** Bits for this frame. Computer players read the state; humans ignore it. */
  sample(state?: GameState): number;
  dispose(): void;
}

/** Keyboard + gamepad (+ on-screen touch controls) combined into one player's input. */
export function createPlayerInput(keys: KeyBindings, pad: number | 'any' | null, touch = false): InputSource {
  const kb = new KeyboardSampler(keys);
  const gp = pad === null ? null : new GamepadSampler(pad);
  if (touch) touchInput.reset();
  return {
    sample: () => kb.sample() | (gp ? gp.sample() : 0) | (touch ? touchInput.sample() : 0),
    dispose: () => kb.dispose(),
  };
}

/** A computer-controlled source (training dummy, random CPU). */
export function createScriptedInput(next: () => number): InputSource {
  return { sample: next, dispose: () => {} };
}

/** The computer opponent (vs CPU, training, the landing page exhibition). */
export function createCpuInput(me: 0 | 1, seed: number, opts: CpuOptions): InputSource {
  const bot = cpuBot(seed, opts);
  return { sample: (s) => (s ? bot(s, me) : 0), dispose: () => {} };
}
