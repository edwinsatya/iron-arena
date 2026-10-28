/**
 * Input packet (PLAN Appendix C), sent every tick on the unreliable channel:
 * [u8 type][u8 epoch][i32 start][i32 ack][i32 frame][i8 adv][u8 count][u16 × count]   (little-endian)
 *
 * `epoch` identifies the match (it changes on every rematch), so late packets from a previous
 * match can never leak into the next one.
 */
export const PKT_INPUT = 1;
/** Control messages on the relay transport: [u8 PKT_CONTROL][utf-8 JSON]. */
export const PKT_CONTROL = 2;
export const INPUT_HEADER_BYTES = 16;
export const MAX_INPUTS_PER_PACKET = 64;

export interface InputPacket {
  epoch: number;
  /** Frame of the first input in `inputs`. */
  start: number;
  /** Highest frame for which the sender has all of the receiver's inputs. */
  ack: number;
  /** The sender's current frame (for time sync). */
  frame: number;
  /** The sender's measured frame advantage (for time sync). */
  adv: number;
  inputs: number[];
}

export function encodeInputPacket(p: InputPacket): ArrayBuffer {
  const buf = new ArrayBuffer(INPUT_HEADER_BYTES + p.inputs.length * 2);
  const v = new DataView(buf);
  v.setUint8(0, PKT_INPUT);
  v.setUint8(1, p.epoch & 0xff);
  v.setInt32(2, p.start, true);
  v.setInt32(6, p.ack, true);
  v.setInt32(10, p.frame, true);
  v.setInt8(14, Math.max(-128, Math.min(127, Math.round(p.adv))));
  v.setUint8(15, p.inputs.length);
  p.inputs.forEach((inp, i) => v.setUint16(INPUT_HEADER_BYTES + i * 2, inp, true));
  return buf;
}

export function decodeInputPacket(buf: ArrayBuffer): InputPacket {
  const v = new DataView(buf);
  if (buf.byteLength < INPUT_HEADER_BYTES || v.getUint8(0) !== PKT_INPUT) throw new Error('not an input packet');
  const count = v.getUint8(15);
  if (buf.byteLength < INPUT_HEADER_BYTES + count * 2) throw new Error('truncated input packet');
  const inputs: number[] = [];
  for (let i = 0; i < count; i++) inputs.push(v.getUint16(INPUT_HEADER_BYTES + i * 2, true));
  return {
    epoch: v.getUint8(1),
    start: v.getInt32(2, true),
    ack: v.getInt32(6, true),
    frame: v.getInt32(10, true),
    adv: v.getInt8(14),
    inputs,
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeControlPacket(json: string): ArrayBuffer {
  const body = encoder.encode(json);
  const out = new Uint8Array(body.length + 1);
  out[0] = PKT_CONTROL;
  out.set(body, 1);
  return out.buffer;
}

export function decodeControlPacket(buf: ArrayBuffer): string {
  return decoder.decode(new Uint8Array(buf, 1));
}

export function packetType(buf: ArrayBuffer): number {
  return buf.byteLength > 0 ? new Uint8Array(buf)[0]! : 0;
}
