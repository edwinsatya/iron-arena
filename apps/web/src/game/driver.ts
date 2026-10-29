import { CHECKSUM_INTERVAL_FRAMES, MAX_ROLLBACK_FRAMES, type ControlMsg } from '@neonfist/shared';
import { RollbackSession, type PeerLink } from '@neonfist/netcode';
import {
  checksum,
  cloneState,
  createInitialState,
  PHASE,
  ROSTER,
  step,
  type GameState,
  type SimConfig,
} from '@neonfist/sim';
import type { NetStats } from './hud/hud';
import type { InputSource } from './input/sampler';

/** Something the 60 Hz loop can drive: local play, training, or an online rollback session. */
export interface MatchDriver {
  tick(): void;
  readonly state: GameState;
  /** Inputs used on the last tick (input display). */
  readonly lastInputs: [number, number];
  netStats(): NetStats | null;
  dispose(): void;
}

export class LocalDriver implements MatchDriver {
  state: GameState;
  lastInputs: [number, number] = [0, 0];
  paused = false;
  /** Training: refill health once a combo is over and freeze the timer. */
  training = false;
  /** Training: called before each tick so the dummy can react to the state. */
  beforeTick: ((s: GameState) => void) | null = null;
  /** Frame advance (training): run exactly this many ticks while paused. */
  private advance = 0;

  constructor(
    config: SimConfig,
    private p1: InputSource,
    private p2: InputSource,
  ) {
    this.state = createInitialState(config);
  }

  stepOnce(): void {
    this.advance++;
  }

  tick(): void {
    const i1 = this.p1.sample(this.state);
    const i2 = this.p2.sample(this.state);
    if (this.paused && this.advance === 0) return;
    if (this.advance > 0) this.advance--;
    this.beforeTick?.(this.state);
    this.lastInputs = [i1, i2];
    step(this.state, this.lastInputs);
    if (this.training) {
      const s = this.state;
      s.timer = s.roundFrames;
      for (const f of s.fighters) {
        if (s.phase === PHASE.FIGHT && f.comboHits === 0 && f.stun === 0 && f.hp < ROSTER[f.char]!.hp)
          f.hp = ROSTER[f.char]!.hp;
      }
    }
  }

  netStats(): NetStats | null {
    return null;
  }

  dispose(): void {
    this.p1.dispose();
    this.p2.dispose();
  }
}

export interface DesyncBundle {
  config: SimConfig;
  localPlayer: number;
  frame: number;
  localSum: number;
  remoteSum: number;
  inputs: [number[], number[]];
}

export interface OnlineDriverOptions {
  config: SimConfig;
  localPlayer: 0 | 1;
  inputDelay: number;
  epoch: number;
  link: PeerLink;
  input: InputSource;
  pingMs: number | null;
  onDesync: (bundle: DesyncBundle) => void;
  onPeerPause: (paused: boolean) => void;
}

/** Online match: rollback session over a PeerLink, with desync checks and pause handling (PLAN §4.9–4.10). */
export class OnlineDriver implements MatchDriver {
  readonly session: RollbackSession<GameState>;
  lastInputs: [number, number] = [0, 0];
  private peerSums = new Map<number, number>();
  private desynced = false;

  constructor(private o: OnlineDriverOptions) {
    this.session = new RollbackSession<GameState>({
      localPlayer: o.localPlayer,
      inputDelay: o.inputDelay,
      maxRollback: MAX_ROLLBACK_FRAMES,
      initialState: createInitialState(o.config),
      sim: { step, clone: cloneState, checksum },
      epoch: o.epoch,
      send: (pkt) => o.link.sendInput(pkt),
      onConfirmedFrame: (frame, sum) => {
        if (frame > 0 && frame % CHECKSUM_INTERVAL_FRAMES === 0) {
          o.link.sendControl({ t: 'checksum', frame, sum, epoch: o.epoch });
          this.compare(frame);
        }
      },
    });
    o.link.onInput = (pkt) => this.session.onPacket(pkt);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Control messages for this match (the room controller forwards them). */
  control(msg: ControlMsg): void {
    if (msg.t === 'checksum') {
      if (msg.epoch !== this.o.epoch) return;
      this.peerSums.set(msg.frame, msg.sum);
      this.compare(msg.frame);
    } else if (msg.t === 'pause') {
      this.o.onPeerPause(true);
    } else if (msg.t === 'resume') {
      this.o.onPeerPause(false);
    }
  }

  private compare(frame: number) {
    const mine = this.session.confirmedChecksums.get(frame);
    const theirs = this.peerSums.get(frame);
    if (mine === undefined || theirs === undefined || this.desynced) return;
    this.peerSums.delete(frame);
    if (mine !== theirs) {
      this.desynced = true;
      const local = this.session.localLog;
      const remote = this.session.remoteLog;
      this.o.onDesync({
        config: this.o.config,
        localPlayer: this.o.localPlayer,
        frame,
        localSum: mine,
        remoteSum: theirs,
        inputs: this.o.localPlayer === 0 ? [local.slice(), remote.slice()] : [remote.slice(), local.slice()],
      });
    }
  }

  private onVisibility = () => {
    this.o.link.sendControl(document.hidden ? { t: 'pause', reason: 'hidden' } : { t: 'resume' });
  };

  get state(): GameState {
    return this.session.state;
  }

  tick(): void {
    const input = this.o.input.sample();
    this.lastInputs = this.o.localPlayer === 0 ? [input, 0] : [0, input];
    this.session.tick(input);
  }

  netStats(): NetStats {
    const s = this.session.stats;
    return {
      path: this.o.link.kind,
      pingMs: this.o.pingMs,
      inputDelay: this.o.inputDelay,
      rollbacks: s.rollbacks,
      avgRollback: s.rollbacks ? s.resimFrames / s.rollbacks : 0,
      maxRollback: s.maxRollback,
      stalls: s.stalls,
      framesAhead: this.session.framesAhead,
    };
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.o.input.dispose();
    if (this.o.link.onInput) this.o.link.onInput = null;
  }
}
