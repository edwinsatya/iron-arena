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

  private burst(opts: { freq: number; q: number; dur: number; gain: number; type?: BiquadFilterType; sweepTo?: number }) {
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

  play(e: SimEvent): void {
    switch (e.type) {
      case EV.HIT:
      case EV.COUNTER: {
        const heavy = Math.min(1, e.value / 25);
        this.burst({ freq: 1800 - heavy * 900, q: 0.9, dur: 0.12 + heavy * 0.1, gain: 0.55 + heavy * 0.3, type: 'lowpass' });
        this.thump(150 - heavy * 50, 0.18 + heavy * 0.12, 0.8);
        if (e.type === EV.COUNTER) this.thump(880, 0.12, 0.25);
        break;
      }
      case EV.BLOCK:
        this.burst({ freq: 3200, q: 4, dur: 0.07, gain: 0.45 });
        this.thump(320, 0.06, 0.3);
        break;
      case EV.ARMOR:
        this.burst({ freq: 900, q: 6, dur: 0.2, gain: 0.5 });
        break;
      case EV.SWING:
        this.burst({ freq: 700, q: 1.2, dur: 0.14, gain: 0.18 + Math.min(0.2, e.value / 100), sweepTo: 2600 });
        break;
      case EV.LAND:
        this.thump(90, 0.22, e.value ? 0.7 : 0.25);
        if (e.value) this.burst({ freq: 400, q: 0.8, dur: 0.18, gain: 0.35, type: 'lowpass' });
        break;
      case EV.THROW:
        this.thump(70, 0.4, 1);
        this.burst({ freq: 500, q: 0.7, dur: 0.3, gain: 0.6, type: 'lowpass' });
        break;
      case EV.THROW_BREAK:
        this.burst({ freq: 2500, q: 3, dur: 0.1, gain: 0.45 });
        break;
      case EV.KO:
        this.thump(60, 0.9, 1);
        this.burst({ freq: 300, q: 0.5, dur: 0.8, gain: 0.5, type: 'lowpass' });
        break;
      case EV.STEP:
        this.burst({ freq: 600, q: 1, dur: 0.05, gain: 0.12, type: 'lowpass' });
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
