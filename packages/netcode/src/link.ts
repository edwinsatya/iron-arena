import { ControlMsgSchema, type ControlMsg } from '@neonfist/shared';

/** How the two browsers are connected. Shown in the network overlay (PLAN §4.6). */
export type LinkKind = 'loopback' | 'direct' | 'turn' | 'relay';

/**
 * A connection to the other player: an unreliable channel for input packets and a reliable,
 * ordered channel for control messages (PLAN §4.1).
 */
export interface PeerLink {
  readonly kind: LinkKind;
  sendInput(packet: ArrayBuffer): void;
  sendControl(msg: ControlMsg): void;
  onInput: ((packet: ArrayBuffer) => void) | null;
  onControl: ((msg: ControlMsg) => void) | null;
  onClose: ((reason: string) => void) | null;
  readonly open: boolean;
  close(): void;
}

export function parseControl(json: string): ControlMsg | null {
  try {
    const r = ControlMsgSchema.safeParse(JSON.parse(json));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Measure round-trip time over the control channel: `count` pings, returns the median (ms). */
export function measureRtt(link: PeerLink, count = 10, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const samples: number[] = [];
    let id = 0;
    const prev = link.onControl;
    const done = (fn: () => void) => {
      clearTimeout(timer);
      link.onControl = prev;
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('ping timeout'))), timeoutMs);
    link.onControl = (msg) => {
      if (msg.t === 'pong') {
        samples.push(performance.now() - msg.sentAt);
        if (samples.length >= count) {
          const sorted = samples.slice().sort((a, b) => a - b);
          done(() => resolve(sorted[Math.floor(sorted.length / 2)]!));
        } else {
          link.sendControl({ t: 'ping', id: ++id, sentAt: performance.now() });
        }
        return;
      }
      if (msg.t === 'ping') {
        link.sendControl({ t: 'pong', id: msg.id, sentAt: msg.sentAt });
        return;
      }
      prev?.(msg);
    };
    link.sendControl({ t: 'ping', id: ++id, sentAt: performance.now() });
  });
}

/** Answer pings automatically (wrap any control handler with this). */
export function withPongs(link: PeerLink, handler: (msg: ControlMsg) => void): (msg: ControlMsg) => void {
  return (msg) => {
    if (msg.t === 'ping') link.sendControl({ t: 'pong', id: msg.id, sentAt: msg.sentAt });
    else handler(msg);
  };
}
