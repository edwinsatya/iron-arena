/**
 * Bits from the on-screen touch controls. The overlay writes here; the player's input source reads
 * it alongside the keyboard and gamepad. Presses are latched so a quick tap is never lost.
 */
export const touchInput = {
  held: 0,
  latched: 0,
  press(bit: number) {
    this.held |= bit;
    this.latched |= bit;
  },
  release(bit: number) {
    this.held &= ~bit;
  },
  setDirection(bits: number, mask: number) {
    this.held = (this.held & ~mask) | bits;
    this.latched |= bits;
  },
  sample(): number {
    const v = this.held | this.latched;
    this.latched = 0;
    return v;
  },
  reset() {
    this.held = 0;
    this.latched = 0;
  },
};
