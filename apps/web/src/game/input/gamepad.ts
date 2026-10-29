import { BTN } from '@neonfist/shared';

/** W3C "standard" mapping: X attack, B guard, A jump, LB/RB/Y skills, RT ultimate. */
const BUTTONS: [number, number][] = [
  [2, BTN.ATTACK], // X / Square
  [1, BTN.GUARD], // B / Circle
  [0, BTN.JUMP], // A / Cross
  [4, BTN.SKILL1], // LB / L1
  [5, BTN.SKILL2], // RB / R1
  [3, BTN.SKILL3], // Y / Triangle
  [7, BTN.ULT], // RT / R2
  [6, BTN.GUARD], // LT / L2
  [12, BTN.UP],
  [13, BTN.DOWN],
  [14, BTN.LEFT],
  [15, BTN.RIGHT],
];

const DEADZONE = 0.5;

/** Reads one gamepad by index (or the first connected pad when index is 'any'). */
export class GamepadSampler {
  private latched = 0;
  private prev = 0;

  constructor(private index: number | 'any') {}

  private pad(): Gamepad | null {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.index === 'any') return pads.find((p) => p && p.connected) ?? null;
    return pads[this.index] ?? null;
  }

  /** Poll and latch (call from requestAnimationFrame too, so taps between ticks aren't lost). */
  poll(): number {
    const p = this.pad();
    if (!p) return 0;
    let bits = 0;
    for (const [i, bit] of BUTTONS) if (p.buttons[i]?.pressed) bits |= bit;
    const x = p.axes[0] ?? 0;
    const y = p.axes[1] ?? 0;
    if (x < -DEADZONE) bits |= BTN.LEFT;
    if (x > DEADZONE) bits |= BTN.RIGHT;
    if (y < -DEADZONE) bits |= BTN.UP;
    if (y > DEADZONE) bits |= BTN.DOWN;
    this.latched |= bits & ~this.prev;
    this.prev = bits;
    return bits;
  }

  sample(): number {
    const v = this.poll() | this.latched;
    this.latched = 0;
    return v;
  }

  get connected(): boolean {
    return this.pad() !== null;
  }
}
