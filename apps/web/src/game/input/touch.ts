import { BTN, DIRECTION_MASK } from '@iron-arena/shared';

/**
 * Bits from the on-screen touch controls. The overlay writes here; the player's input source reads
 * it alongside the keyboard and gamepad, once per tick. Presses are latched so a quick tap is never
 * lost.
 */
export const touchInput = {
  held: 0,
  latched: 0,
  /** Direction bits to send on the next ticks instead of the stick (the dash button's double tap). */
  seq: [] as number[],
  /** Direction bits sent on the last tick. */
  lastDir: 0,
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
  /**
   * Dash toward `dir` (BTN.LEFT or BTN.RIGHT, as seen on screen). The game dashes on a double tap
   * of a direction, so the button plays one: tap, let go, tap — over three or four ticks.
   */
  dash(dir: number) {
    this.seq = this.lastDir & dir ? [0, dir, 0, dir] : [dir, 0, dir];
  },
  sample(): number {
    let v = this.held | this.latched;
    this.latched = 0;
    const next = this.seq.shift();
    if (next !== undefined) v = (v & ~DIRECTION_MASK) | next;
    this.lastDir = v & (BTN.LEFT | BTN.RIGHT);
    return v;
  },
  reset() {
    this.held = 0;
    this.latched = 0;
    this.seq = [];
    this.lastDir = 0;
  },
};
