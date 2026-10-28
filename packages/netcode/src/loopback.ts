import type { ControlMsg } from '@neonfist/shared';
import type { PeerLink } from './link';

export interface LoopbackOptions {
  /** One-way delay (ms). */
  latencyMs?: number;
  /** Extra random delay 0..jitterMs (ms) for input packets. */
  jitterMs?: number;
  /** Probability 0..1 that an input packet is dropped. */
  loss?: number;
  /** Random source (deterministic in tests). */
  random?: () => number;
}

class LoopbackLink implements PeerLink {
  readonly kind = 'loopback' as const;
  onInput: ((packet: ArrayBuffer) => void) | null = null;
  onControl: ((msg: ControlMsg) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  peer!: LoopbackLink;
  open = true;
  private controlClock = 0;

  constructor(private opts: Required<LoopbackOptions>) {}

  sendInput(packet: ArrayBuffer): void {
    if (!this.open || this.opts.random() < this.opts.loss) return;
    const delay = this.opts.latencyMs + this.opts.random() * this.opts.jitterMs;
    const copy = packet.slice(0);
    setTimeout(() => this.peer.open && this.peer.onInput?.(copy), delay);
  }

  sendControl(msg: ControlMsg): void {
    if (!this.open) return;
    // Reliable and ordered: never earlier than the previous control message.
    const at = Math.max(performance.now() + this.opts.latencyMs, this.controlClock);
    this.controlClock = at;
    const json = JSON.stringify(msg);
    setTimeout(() => this.peer.open && this.peer.onControl?.(JSON.parse(json) as ControlMsg), at - performance.now());
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.onClose?.('closed');
    this.peer.open = false;
    this.peer.onClose?.('peer closed');
  }
}

/** Two connected in-memory links with simulated latency, jitter and loss (dev netsim, tests). */
export function createLoopbackPair(options: LoopbackOptions = {}): [PeerLink, PeerLink] {
  const opts: Required<LoopbackOptions> = {
    latencyMs: options.latencyMs ?? 0,
    jitterMs: options.jitterMs ?? 0,
    loss: options.loss ?? 0,
    random: options.random ?? Math.random,
  };
  const a = new LoopbackLink(opts);
  const b = new LoopbackLink(opts);
  a.peer = b;
  b.peer = a;
  return [a, b];
}
