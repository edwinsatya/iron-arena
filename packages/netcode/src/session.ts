import { MAX_INPUTS_PER_PACKET, decodeInputPacket, encodeInputPacket } from './packet';

/**
 * GGPO-style rollback session for two players (PLAN §4.5, Appendix C).
 * Tested with a lossy, jittery, reordering simulated network: 0 desyncs (see test/soak.test.ts).
 */

export interface SimAdapter<S> {
  /** Advance exactly one frame, in place. */
  step(state: S, inputs: [number, number]): void;
  /** Deep copy (plain data). */
  clone(state: S): S;
  /** uint32 hash of everything in S. */
  checksum(state: S): number;
}

export interface SessionOpts<S> {
  localPlayer: 0 | 1;
  /** Frames of local input delay (PLAN §4.5 table). */
  inputDelay: number;
  /** Max predicted frames before the session waits (8). */
  maxRollback: number;
  initialState: S;
  sim: SimAdapter<S>;
  /** Unreliable, unordered channel. */
  send: (packet: ArrayBuffer) => void;
  /** Called once per frame as soon as its state is final (desync checks, replays, tests). */
  onConfirmedFrame?: (frame: number, checksum: number) => void;
  /** Match id carried in every packet; packets from other epochs are ignored. */
  epoch?: number;
}

export type TickResult = 'advanced' | 'stalled' | 'skipped';

export class RollbackSession<S> {
  /** Next frame to simulate. */
  frame = 0;
  state: S;
  readonly stats = { rollbacks: 0, resimFrames: 0, maxRollback: 0, stalls: 0, skips: 0, lastRollback: 0 };
  /** Every local input by frame (replays, tests). */
  readonly localLog: number[] = [];
  /** Every confirmed remote input by frame (replays). */
  readonly remoteLog: number[] = [];
  /** frame → checksum of the state at the start of that frame (last ~10 s). */
  readonly confirmedChecksums = new Map<number, number>();

  private o: SessionOpts<S>;
  private epoch: number;
  private local = new Map<number, number>();
  private remote = new Map<number, number>();
  private used = new Map<number, number>();
  private snaps = new Map<number, S>();
  private lastLocalFrame = -1;
  private remoteConfirmed = -1;
  private remoteAcked = -1;
  private remoteFrame = -1;
  private remoteAdv = 0;
  private rollbackTo = Infinity;
  private lastChecksumFrame = -1;
  private aheadHistory: number[] = [];
  private ticksSinceSkip = 0;

  constructor(o: SessionOpts<S>) {
    this.o = o;
    this.epoch = (o.epoch ?? 0) & 0xff;
    this.state = o.sim.clone(o.initialState);
    for (let f = 0; f < o.inputDelay; f++) this.setLocal(f, 0); // the first `delay` frames are empty
  }

  get localPlayer(): 0 | 1 {
    return this.o.localPlayer;
  }

  get inputDelay(): number {
    return this.o.inputDelay;
  }

  /** All remote inputs up to this frame have arrived. */
  get confirmedFrame(): number {
    return this.remoteConfirmed;
  }

  /** Frames we are ahead of the peer (smoothed time-sync estimate). */
  get framesAhead(): number {
    if (!this.aheadHistory.length) return 0;
    return this.aheadHistory.reduce((a, b) => a + b, 0) / this.aheadHistory.length;
  }

  /** Call once per 60 Hz tick with this player's raw input bits. */
  tick(localInput: number): TickResult {
    this.stats.lastRollback = 0;
    if (this.rollbackTo < this.frame) this.rollback();
    this.recordConfirmedChecksums();

    if (this.frame - this.remoteConfirmed > this.o.maxRollback) {
      this.stats.stalls++;
      this.sendInputs();
      return 'stalled';
    }
    if (this.shouldSkipForTimeSync()) {
      this.stats.skips++;
      this.sendInputs();
      return 'skipped';
    }

    this.setLocal(this.frame + this.o.inputDelay, localInput);
    this.sendInputs();
    this.snaps.set(this.frame, this.o.sim.clone(this.state));
    this.simulate(this.frame);
    this.frame++;
    this.prune();
    return 'advanced';
  }

  /** Call from the transport's onmessage (any order; duplicates are fine). */
  onPacket(buf: ArrayBuffer): void {
    let p;
    try {
      p = decodeInputPacket(buf);
    } catch {
      return;
    }
    if (p.epoch !== this.epoch) return;
    for (let i = 0; i < p.inputs.length; i++) {
      const f = p.start + i;
      if (f <= this.remoteConfirmed || this.remote.has(f)) continue;
      this.remote.set(f, p.inputs[i]!);
      if (f < this.frame && this.used.get(f) !== p.inputs[i]) {
        this.rollbackTo = Math.min(this.rollbackTo, f); // we guessed wrong at frame f
      }
    }
    while (this.remote.has(this.remoteConfirmed + 1)) {
      this.remoteConfirmed++;
      this.remoteLog[this.remoteConfirmed] = this.remote.get(this.remoteConfirmed)!;
    }
    this.remoteAcked = Math.max(this.remoteAcked, p.ack);
    if (p.frame > this.remoteFrame) {
      this.remoteFrame = p.frame;
      this.remoteAdv = p.adv;
    }
  }

  private setLocal(f: number, input: number): void {
    this.local.set(f, input);
    this.localLog[f] = input;
    this.lastLocalFrame = f;
  }

  private simulate(f: number): void {
    const localIn = this.local.get(f) ?? 0;
    const known = this.remote.get(f);
    const remoteIn = known !== undefined ? known : (this.remote.get(this.remoteConfirmed) ?? 0); // predict: repeat last
    this.used.set(f, remoteIn);
    this.o.sim.step(this.state, this.o.localPlayer === 0 ? [localIn, remoteIn] : [remoteIn, localIn]);
  }

  private rollback(): void {
    const from = this.rollbackTo;
    const snap = this.snaps.get(from);
    if (!snap) throw new Error(`no snapshot for frame ${from} (now ${this.frame})`);
    this.state = this.o.sim.clone(snap);
    const n = this.frame - from;
    this.stats.rollbacks++;
    this.stats.resimFrames += n;
    this.stats.lastRollback = n;
    this.stats.maxRollback = Math.max(this.stats.maxRollback, n);
    for (let f = from; f < this.frame; f++) {
      this.snaps.set(f, this.o.sim.clone(this.state));
      this.simulate(f);
    }
    this.rollbackTo = Infinity;
  }

  private sendInputs(): void {
    const start = this.remoteAcked + 1;
    const count = Math.max(0, Math.min(this.lastLocalFrame - start + 1, MAX_INPUTS_PER_PACKET));
    const inputs: number[] = [];
    for (let i = 0; i < count; i++) inputs.push(this.local.get(start + i)!);
    this.o.send(
      encodeInputPacket({
        epoch: this.epoch,
        start,
        ack: this.remoteConfirmed,
        frame: this.frame,
        adv: this.localAdvantage(),
        inputs,
      }),
    );
  }

  private localAdvantage(): number {
    return this.remoteFrame < 0 ? 0 : this.frame - this.remoteFrame;
  }

  // Each side measures (myFrame − peerFrame + latency). Subtracting the peer's measurement cancels the
  // latency and leaves 2 × (frames I am ahead). If I'm ahead, skip a tick now and then.
  private shouldSkipForTimeSync(): boolean {
    if (this.remoteFrame < 0) return false;
    const ahead = (this.localAdvantage() - this.remoteAdv) / 2;
    this.aheadHistory.push(ahead);
    if (this.aheadHistory.length > 32) this.aheadHistory.shift();
    const avg = this.aheadHistory.reduce((a, b) => a + b, 0) / this.aheadHistory.length;
    if (avg >= 1 && this.ticksSinceSkip >= 8) {
      this.ticksSinceSkip = 0;
      return true;
    }
    this.ticksSinceSkip++;
    return false;
  }

  // The state at the start of frame f is final once every input before f is confirmed.
  private recordConfirmedChecksums(): void {
    const upTo = Math.min(this.remoteConfirmed + 1, this.frame);
    for (let f = this.lastChecksumFrame + 1; f <= upTo; f++) {
      const s = f === this.frame ? this.state : this.snaps.get(f);
      if (!s) throw new Error(`missing snapshot for checksum frame ${f}`);
      const sum = this.o.sim.checksum(s);
      this.confirmedChecksums.set(f, sum);
      this.o.onConfirmedFrame?.(f, sum);
      this.lastChecksumFrame = f;
    }
  }

  private prune(): void {
    const keep = this.frame - this.o.maxRollback - 4;
    for (const k of this.snaps.keys()) if (k < keep) this.snaps.delete(k);
    for (const k of this.used.keys()) if (k < keep) this.used.delete(k);
    for (const k of this.remote.keys()) if (k < Math.min(keep, this.remoteConfirmed)) this.remote.delete(k);
    const keepLocal = Math.min(keep, this.remoteAcked + 1);
    for (const k of this.local.keys()) if (k < keepLocal) this.local.delete(k);
    for (const k of this.confirmedChecksums.keys()) if (k < this.frame - 600) this.confirmedChecksums.delete(k);
  }
}
