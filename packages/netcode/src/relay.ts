import type { ControlMsg } from '@neonfist/shared';
import { parseControl, type PeerLink } from './link';
import { decodeControlPacket, encodeControlPacket, packetType, PKT_CONTROL, PKT_INPUT } from './packet';

/** The parts of a WebSocket the relay needs (the lobby client provides them). */
export interface BinarySocket {
  sendBinary(data: ArrayBuffer): void;
  onBinary: ((data: ArrayBuffer) => void) | null;
}

/**
 * Fallback link through the lobby WebSocket (PLAN §4.6): works through strict firewalls,
 * at the cost of a little extra latency. Inputs and control messages share the socket.
 */
export class RelayLink implements PeerLink {
  readonly kind = 'relay' as const;
  onInput: ((packet: ArrayBuffer) => void) | null = null;
  onControl: ((msg: ControlMsg) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  open = true;

  constructor(private socket: BinarySocket) {
    socket.onBinary = (data) => {
      if (!this.open) return;
      const type = packetType(data);
      if (type === PKT_INPUT) this.onInput?.(data);
      else if (type === PKT_CONTROL) {
        const msg = parseControl(decodeControlPacket(data));
        if (msg) this.onControl?.(msg);
      }
    };
  }

  sendInput(packet: ArrayBuffer): void {
    if (this.open) this.socket.sendBinary(packet);
  }

  sendControl(msg: ControlMsg): void {
    if (this.open) this.socket.sendBinary(encodeControlPacket(JSON.stringify(msg)));
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.socket.onBinary = null;
    this.onClose?.('closed');
  }
}
