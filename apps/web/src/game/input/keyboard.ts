import type { KeyBindings } from './bindings';

/**
 * Keyboard sampling with latched presses (PLAN §4.9): a tap shorter than one frame is never lost.
 * Several samplers can share the keyboard (local versus); each only listens to its own keys.
 */
export class KeyboardSampler {
  private held = 0;
  private latched = 0;
  private keys = new Map<string, number>();

  constructor(private bindings: KeyBindings) {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onDown = (e: KeyboardEvent) => {
    const bit = this.bindings[e.code];
    if (!bit) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault(); // no page scrolling on arrows/space
    if (e.repeat) return;
    this.keys.set(e.code, bit);
    this.recompute();
    this.latched |= bit;
  };

  private onUp = (e: KeyboardEvent) => {
    if (!this.keys.has(e.code)) return;
    this.keys.delete(e.code);
    this.recompute();
  };

  private onBlur = () => {
    this.keys.clear();
    this.held = 0;
  };

  private recompute() {
    let h = 0;
    for (const bit of this.keys.values()) h |= bit;
    this.held = h;
  }

  sample(): number {
    const v = this.held | this.latched;
    this.latched = 0;
    return v;
  }

  dispose() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
