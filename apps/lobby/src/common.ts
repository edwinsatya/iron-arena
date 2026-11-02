import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type IceServer } from '@iron-arena/shared';

export function generateRoomCode(randomUint32: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++)
    code += ROOM_CODE_ALPHABET[randomUint32() % ROOM_CODE_ALPHABET.length];
  return code;
}

export function cryptoUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

export interface TurnEnv {
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

/**
 * Short-lived TURN credentials from Cloudflare Realtime (PLAN §4.6). The API token stays on the
 * server. Without credentials configured, players get STUN only (direct connections + relay fallback).
 */
export async function fetchIceServers(env: TurnEnv, fetchFn: typeof fetch = fetch): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return DEFAULT_ICE_SERVERS;
  try {
    const res = await fetchFn(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 6 * 60 * 60 }),
      },
    );
    if (!res.ok) throw new Error(`TURN API ${res.status}`);
    const body = (await res.json()) as { iceServers?: IceServer[] };
    const servers = (body.iceServers ?? []).map((s) => ({
      ...s,
      // Browsers block port 53; drop those URLs so ICE doesn't wait for them to time out.
      urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)),
    }));
    return servers.length ? servers : DEFAULT_ICE_SERVERS;
  } catch (err) {
    console.warn('[lobby] TURN credentials unavailable, using STUN only:', err);
    return DEFAULT_ICE_SERVERS;
  }
}

/**
 * CORS for the lobby API. `allowed` (ALLOWED_ORIGINS): comma-separated sites, each a full origin
 * (`https://iron-arena.example.com`) or just its host (`iron-arena.example.com`), or `*`.
 */
export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = list.includes('*')
    ? '*'
    : origin && list.some((entry) => originMatches(entry, origin))
      ? origin
      : withScheme(list[0] ?? '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/** Browsers send the full origin (`https://host`); an entry written without a scheme matches by host. */
function originMatches(entry: string, origin: string): boolean {
  const e = entry.replace(/\/+$/, '').toLowerCase();
  const o = origin.toLowerCase();
  if (e === o) return true;
  if (e.includes('://')) return false;
  try {
    return new URL(o).host === e;
  } catch {
    return false;
  }
}

const withScheme = (entry: string) => (entry === '*' || entry.includes('://') ? entry : `https://${entry}`);
