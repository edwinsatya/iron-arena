/** Working title — rename the whole game here. */
export const GAME_TITLE = 'NEON FIST';
export const TOURNAMENT_NAME = 'The Skyline Crown';

/** Room codes: 6 characters without look-alikes (no O/0/I/1/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export const MAX_NAME_LENGTH = 16;
export const DEFAULT_LOBBY_PORT = 8787;

/** Rooms with nobody connected are deleted after this long. */
export const ROOM_IDLE_MS = 30 * 60 * 1000;

/** Lobby keepalive (the lobby WebSocket is idle during P2P matches). */
export const LOBBY_PING_INTERVAL_MS = 25_000;

export const TICK_RATE = 60;
export const MAX_ROLLBACK_FRAMES = 8;
export const CHECKSUM_INTERVAL_FRAMES = 60;

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/** Pick an input delay from the measured round trip (PLAN §4.5). */
export function inputDelayForPing(pingMs: number): number {
  return Math.max(1, Math.min(4, Math.ceil(pingMs / 55)));
}

/** Fighters on the select screen (must match the sim roster — a sim test checks it). */
export const SELECTABLE_FIGHTERS = ['benika', 'lysa', 'hyoga', 'hyoshin', 'reo', 'kage', 'homura'] as const;
export type FighterId = (typeof SELECTABLE_FIGHTERS)[number];

/** Arenas (the simulation is identical on both; only the look changes). */
export const STAGES = [
  { id: 'rooftop-dusk', name: 'Lantern Harbor', time: 'Sunset' },
  { id: 'rooftop-night', name: 'Neon Rooftop', time: 'Midnight' },
] as const;
export type StageId = (typeof STAGES)[number]['id'];
export const DEFAULT_STAGE: StageId = 'rooftop-dusk';
export const DEFAULT_ROUND_FRAMES = 3600;
