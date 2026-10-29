import type { ControlMsg } from '@neonfist/shared';
import { parseControl, type LinkKind, type PeerLink } from './link';

/** Signaling messages exchanged through the lobby (opaque to it). */
export type SignalData =
  | { kind: 'description'; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; candidate: RTCIceCandidateInit };

export function isSignalData(v: unknown): v is SignalData {
  if (!v || typeof v !== 'object') return false;
  const k = (v as { kind?: unknown }).kind;
  return (
    (k === 'description' && typeof (v as { description?: unknown }).description === 'object') ||
    (k === 'candidate' && typeof (v as { candidate?: unknown }).candidate === 'object')
  );
}

export interface WebRtcOptions {
  iceServers: RTCIceServer[];
  /** The host (P1) makes the offer; the guest answers. */
  initiator: boolean;
  /** Send a signaling message to the peer (through the lobby). */
  signal: (data: SignalData) => void;
  /** Relay everything through TURN (hides IP addresses; also useful for testing). */
  relayOnly?: boolean;
  /** Restart ICE once if not connected after this long (ms). */
  restartAfterMs?: number;
}

const MAX_BUFFERED = 64 * 1024;

/**
 * Peer-to-peer link over two pre-negotiated DataChannels (PLAN §4.6):
 * 'inputs' (unordered, no retransmits) and 'control' (reliable, ordered).
 */
export class WebRtcLink implements PeerLink {
  kind: LinkKind = 'direct';
  onInput: ((packet: ArrayBuffer) => void) | null = null;
  onControl: ((msg: ControlMsg) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;

  readonly pc: RTCPeerConnection;
  private inputs: RTCDataChannel;
  private control: RTCDataChannel;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private closed = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readyPromise: Promise<void>;

  constructor(private opts: WebRtcOptions) {
    this.pc = new RTCPeerConnection({
      iceServers: opts.iceServers,
      iceTransportPolicy: opts.relayOnly ? 'relay' : 'all',
    });
    this.inputs = this.pc.createDataChannel('inputs', {
      negotiated: true,
      id: 0,
      ordered: false,
      maxRetransmits: 0,
    });
    this.control = this.pc.createDataChannel('control', { negotiated: true, id: 1, ordered: true });
    this.inputs.binaryType = 'arraybuffer';
    this.control.binaryType = 'arraybuffer';

    this.inputs.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) this.onInput?.(e.data);
    };
    this.control.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const msg = parseControl(e.data);
      if (msg) this.onControl?.(msg);
    };
    this.inputs.onclose = () => this.shutdown('channel closed');
    this.control.onclose = () => this.shutdown('channel closed');

    this.pc.onicecandidate = (e) => {
      if (e.candidate) opts.signal({ kind: 'candidate', candidate: e.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => {
      const st = this.pc.connectionState;
      if (st === 'failed' || st === 'closed') this.shutdown(`connection ${st}`);
    };

    this.readyPromise = Promise.all([waitOpen(this.inputs), waitOpen(this.control)]).then(() => {
      if (this.restartTimer) clearTimeout(this.restartTimer);
    });

    if (opts.initiator) {
      void this.makeOffer();
      this.restartTimer = setTimeout(() => {
        if (!this.open && !this.closed) {
          this.pc.restartIce();
          void this.makeOffer();
        }
      }, opts.restartAfterMs ?? 8000);
    }
  }

  get open(): boolean {
    return !this.closed && this.inputs.readyState === 'open' && this.control.readyState === 'open';
  }

  /** Resolves once both channels are open; rejects after `timeoutMs`. */
  ready(timeoutMs = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WebRTC connection timed out')), timeoutMs);
      this.readyPromise.then(
        () => {
          clearTimeout(t);
          resolve();
        },
        (err) => {
          clearTimeout(t);
          reject(err);
        },
      );
    });
  }

  /** Feed a signaling message that came from the peer. */
  async handleSignal(data: SignalData): Promise<void> {
    if (this.closed) return;
    if (data.kind === 'description') {
      await this.pc.setRemoteDescription(data.description);
      if (data.description.type === 'offer') {
        await this.pc.setLocalDescription();
        this.opts.signal({ kind: 'description', description: this.pc.localDescription!.toJSON() });
      }
      for (const c of this.pendingCandidates.splice(0)) await this.addCandidate(c);
    } else if (this.pc.remoteDescription) {
      await this.addCandidate(data.candidate);
    } else {
      this.pendingCandidates.push(data.candidate);
    }
  }

  /** Inspect the selected candidate pair: 'turn' when traffic goes through a relay server. */
  async detectPath(): Promise<LinkKind> {
    try {
      const stats = await this.pc.getStats();
      let pairId: string | undefined;
      stats.forEach((r) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId as string;
      });
      let localId: string | undefined;
      stats.forEach((r) => {
        if (
          r.type === 'candidate-pair' &&
          (r.id === pairId || (!pairId && r.nominated && r.state === 'succeeded'))
        ) {
          localId = r.localCandidateId as string;
        }
      });
      stats.forEach((r) => {
        if (r.type === 'local-candidate' && r.id === localId) {
          this.kind = r.candidateType === 'relay' ? 'turn' : 'direct';
        }
      });
    } catch {
      // keep the previous value
    }
    return this.kind;
  }

  sendInput(packet: ArrayBuffer): void {
    if (this.inputs.readyState === 'open' && this.inputs.bufferedAmount < MAX_BUFFERED)
      this.inputs.send(packet);
  }

  sendControl(msg: ControlMsg): void {
    if (this.control.readyState === 'open') this.control.send(JSON.stringify(msg));
  }

  close(): void {
    this.shutdown('closed');
  }

  private async makeOffer(): Promise<void> {
    try {
      await this.pc.setLocalDescription();
      this.opts.signal({ kind: 'description', description: this.pc.localDescription!.toJSON() });
    } catch (err) {
      console.warn('[webrtc] offer failed', err);
    }
  }

  private async addCandidate(c: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(c);
    } catch (err) {
      console.warn('[webrtc] bad candidate', err);
    }
  }

  private shutdown(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    try {
      this.inputs.close();
      this.control.close();
      this.pc.close();
    } catch {
      // already closed
    }
    this.onClose?.(reason);
  }
}

function waitOpen(ch: RTCDataChannel): Promise<void> {
  if (ch.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    ch.addEventListener('open', () => resolve(), { once: true });
    ch.addEventListener('close', () => reject(new Error('channel closed')), { once: true });
  });
}
