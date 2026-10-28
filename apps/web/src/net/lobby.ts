import {
  DEFAULT_LOBBY_PORT,
  LOBBY_PING_INTERVAL_MS,
  ServerMsgSchema,
  parseJson,
  type ClientMsg,
  type ServerMsg,
} from '@neonfist/shared';
import type { BinarySocket } from '@neonfist/netcode';

/** Lobby base URL: NEXT_PUBLIC_LOBBY_URL, or port 8787 on the same host (local dev, LAN play). */
export function lobbyBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_LOBBY_URL;
  if (env) return env.replace(/\/$/, '');
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${DEFAULT_LOBBY_PORT}`;
}

export async function createRoom(): Promise<string> {
  const res = await fetch(`${lobbyBaseUrl()}/api/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`Couldn't create a room (lobby answered ${res.status}).`);
  const body = (await res.json()) as { code: string };
  return body.code;
}

export async function roomExists(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${lobbyBaseUrl()}/api/rooms/${code}`);
    return res.ok;
  } catch {
    return false;
  }
}

/** WebSocket to one room. Also the binary socket for the relay fallback. */
export class LobbyClient implements BinarySocket {
  private ws: WebSocket;
  private ping: ReturnType<typeof setInterval>;
  onMessage: ((msg: ServerMsg) => void) | null = null;
  onBinary: ((data: ArrayBuffer) => void) | null = null;
  onClose: ((code: number, reason: string) => void) | null = null;
  onOpen: (() => void) | null = null;

  constructor(code: string) {
    const url = `${lobbyBaseUrl().replace(/^http/, 'ws')}/api/rooms/${code}/ws`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.onOpen?.();
    this.ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        this.onBinary?.(e.data);
        return;
      }
      const msg = parseJson(ServerMsgSchema, String(e.data));
      if (msg) this.onMessage?.(msg);
    };
    this.ws.onclose = (e) => {
      clearInterval(this.ping);
      this.onClose?.(e.code, e.reason);
    };
    this.ping = setInterval(() => this.send({ t: 'ping' }), LOBBY_PING_INTERVAL_MS);
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendBinary(data: ArrayBuffer): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  close(): void {
    clearInterval(this.ping);
    this.ws.close(1000, 'bye');
  }
}
