import { loadSettings } from './settings';

/**
 * Menu blips in the spirit of old console menus: a tick when the cursor moves, a two-note chime
 * to confirm, a drop to go back and a thud for the wax seal. Plain Web Audio square waves,
 * quiet, and silent until the page has had a click or key press (browsers' autoplay rules).
 */

let ctx: AudioContext | null = null;
let unlocked = false;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended' && unlocked) void ctx.resume();
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true;
    void audio()?.resume();
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

function tone(
  a: AudioContext,
  freq: number,
  at: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'square',
) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export type UiSound = 'move' | 'confirm' | 'back' | 'stamp';

export function uiSound(kind: UiSound): void {
  const a = audio();
  if (!a || a.state !== 'running') return;
  const v = loadSettings().volume;
  if (v <= 0) return;
  const t = a.currentTime;
  const k = v * 0.6;
  switch (kind) {
    case 'move':
      tone(a, 1046, t, 0.04, 0.035 * k);
      break;
    case 'confirm':
      tone(a, 784, t, 0.07, 0.05 * k);
      tone(a, 1175, t + 0.07, 0.12, 0.05 * k);
      break;
    case 'back':
      tone(a, 523, t, 0.06, 0.045 * k);
      tone(a, 392, t + 0.06, 0.1, 0.045 * k);
      break;
    case 'stamp':
      tone(a, 110, t, 0.18, 0.12 * k, 'triangle');
      tone(a, 1568, t + 0.02, 0.08, 0.03 * k);
      break;
  }
}
