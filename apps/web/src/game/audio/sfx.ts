import { EV, type SimEvent } from '@neonfist/sim';

/**
 * Procedural sound effects with the Web Audio API (no audio files needed) and an English
 * announcer through the browser's speech synthesis. Replace with recorded audio later (PLAN §3.3).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.7;
  announcer = true;

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private burst(opts: {
    freq: number;
    q: number;
    dur: number;
    gain: number;
    type?: BiquadFilterType;
    sweepTo?: number;
  }) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur);
    f.Q.value = opts.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + opts.dur + 0.02);
  }

  private thump(freq: number, dur: number, gain: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.35, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private tone(
    freq: number,
    to: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    delay = 0,
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** `weapon` of the hero who caused the event (axe, bow, hammer, sword, dagger, fire). */
  play(e: SimEvent, weapon = 'sword'): void {
    switch (e.type) {
      case EV.HIT: {
        const heavy = Math.min(1, e.value / 90);
        if (weapon === 'sword' || weapon === 'axe' || weapon === 'scythe' || weapon === 'claw') this.burst({ freq: 4200, q: 2, dur: 0.09, gain: 0.35, sweepTo: 1800 });
        if (weapon === 'dagger') this.burst({ freq: 6000, q: 3, dur: 0.06, gain: 0.3, sweepTo: 3000 });
        if (weapon === 'fire') this.burst({ freq: 900, q: 0.7, dur: 0.3, gain: 0.35, type: 'lowpass', sweepTo: 300 });
        if (weapon === 'ice') this.burst({ freq: 5200, q: 5, dur: 0.18, gain: 0.3, sweepTo: 7000 });
        if (weapon === 'hammer' || weapon === 'anchor') this.thump(70, 0.25, 0.7);
        this.burst({
          freq: 1800 - heavy * 900,
          q: 0.9,
          dur: 0.12 + heavy * 0.12,
          gain: 0.5 + heavy * 0.3,
          type: 'lowpass',
        });
        this.thump(150 - heavy * 60, 0.18 + heavy * 0.15, 0.8);
        break;
      }
      case EV.COUNTER:
        this.tone(1320, 1320, 0.35, 0.3, 'triangle');
        this.tone(1980, 1980, 0.3, 0.18, 'triangle', 0.03);
        break;
      case EV.BLOCK:
        this.burst({ freq: 3200, q: 4, dur: 0.07, gain: 0.45 });
        this.thump(320, 0.06, 0.3);
        break;
      case EV.GUARD_BREAK:
        this.burst({ freq: 2200, q: 1.5, dur: 0.3, gain: 0.6, sweepTo: 300 });
        this.thump(80, 0.4, 0.9);
        break;
      case EV.ARMOR:
        this.burst({ freq: 900, q: 6, dur: 0.2, gain: 0.5 });
        break;
      case EV.SWING:
        if (weapon === 'bow' || weapon === 'fire' || weapon === 'ice') break;
        this.burst({
          freq: weapon === 'dagger' ? 1400 : 700,
          q: 1.2,
          dur: weapon === 'dagger' ? 0.08 : 0.15,
          gain: 0.22,
          sweepTo: weapon === 'sword' || weapon === 'dagger' || weapon === 'scythe' ? 3800 : 1600,
        });
        break;
      case EV.FIRE:
        if (weapon === 'bow') {
          // Bowstring twang and a whistle
          this.tone(180, 120, 0.12, 0.35, 'triangle');
          this.burst({ freq: 3000, q: 3, dur: 0.18, gain: 0.25, sweepTo: 1200 });
        } else if (weapon === 'fire') {
          // Whoosh of a fireball
          this.burst({ freq: 600, q: 0.8, dur: 0.35, gain: 0.4, type: 'lowpass', sweepTo: 1600 });
          this.thump(110, 0.2, 0.4);
        } else if (weapon === 'ice') {
          this.tone(1800, 2600, 0.18, 0.2, 'triangle');
          this.burst({ freq: 4200, q: 3, dur: 0.2, gain: 0.25, sweepTo: 2000 });
        } else if (weapon === 'dagger') {
          this.burst({ freq: 5200, q: 4, dur: 0.1, gain: 0.25, sweepTo: 2600 });
        } else {
          this.tone(380, 980, 0.22, 0.25, 'triangle');
        }
        break;
      case EV.EXPLODE:
        this.thump(55, 0.6, 1);
        this.burst({ freq: 700, q: 0.6, dur: 0.5, gain: 0.7, type: 'lowpass', sweepTo: 120 });
        break;
      case EV.AREA:
        this.tone(220, 660, 0.4, 0.15, 'sawtooth');
        break;
      case EV.SKILL:
        this.burst({ freq: 500, q: 1, dur: 0.25, gain: 0.3, sweepTo: 3000 });
        break;
      case EV.ULT:
        this.tone(110, 440, 0.8, 0.35, 'sawtooth');
        this.tone(165, 660, 0.8, 0.25, 'sawtooth', 0.05);
        this.thump(50, 1.0, 1);
        break;
      case EV.TELEPORT:
        if (e.value === -1) this.tone(1600, 200, 0.18, 0.25, 'square');
        break;
      case EV.DASH:
        this.burst({ freq: 900, q: 1, dur: 0.12, gain: 0.15, sweepTo: 400 });
        break;
      case EV.JUMP:
        this.burst({ freq: 500, q: 1, dur: 0.08, gain: 0.12, type: 'lowpass' });
        break;
      case EV.LAND:
        this.thump(90, 0.2, e.value < -80 ? 0.7 : 0.25);
        break;
      case EV.CHARGED:
        this.tone(880, 1760, 0.18, 0.22, 'triangle');
        break;
      case EV.DIZZY:
        this.tone(1400, 1800, 0.12, 0.15, 'sine');
        this.tone(1600, 2000, 0.12, 0.15, 'sine', 0.14);
        break;
      case EV.GRAB:
        this.thump(100, 0.3, 0.8);
        break;
      case EV.KO:
        this.thump(60, 0.9, 1);
        this.burst({ freq: 300, q: 0.5, dur: 0.8, gain: 0.5, type: 'lowpass' });
        break;
      case EV.WALL:
        this.thump(55, 0.5, 1);
        this.burst({ freq: 900, q: 0.7, dur: 0.35, gain: 0.5, type: 'lowpass', sweepTo: 200 });
        break;
    }
  }

  /** The announcer (English). */
  say(text: string): void {
    if (!this.announcer || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.pitch = 0.55;
      u.rate = 0.92;
      u.volume = Math.min(1, this.volume * 1.3);
      speechSynthesis.speak(u);
    } catch {
      // speech not available
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
