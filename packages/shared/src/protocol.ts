import { z } from 'zod';
import { MAX_NAME_LENGTH } from './constants';

/* ------------------------------------------------------------------ */
/* Match config — built by the lobby, identical on both clients        */
/* ------------------------------------------------------------------ */

export const MatchConfigSchema = z.object({
  /** Seeds the simulation PRNG (int32). */
  seed: z.number().int(),
  /** Character ids, P1 then P2. */
  fighters: z.tuple([z.string().max(32), z.string().max(32)]),
  stage: z.string().max(32),
  roundsToWin: z.union([z.literal(2), z.literal(3)]),
  /** 3600 = 60 seconds. */
  roundFrames: z
    .number()
    .int()
    .min(600)
    .max(99 * 60),
  /** "Always on the left" per player (PLAN §2.7). */
  viewMirrored: z.tuple([z.boolean(), z.boolean()]),
  /** Build id; both clients must run the same simulation code. */
  simVersion: z.string().max(64),
});
export type MatchConfig = z.infer<typeof MatchConfigSchema>;

/* ------------------------------------------------------------------ */
/* Lobby protocol (WebSocket, JSON) — PLAN §6.4                        */
/* ------------------------------------------------------------------ */

export type RoomPhase = 'waiting' | 'select' | 'loading' | 'match' | 'results';

export const PlayerInfoSchema = z.object({
  name: z.string(),
  fighter: z.string().nullable(),
  ready: z.boolean(),
  connected: z.boolean(),
  loaded: z.boolean(),
  rematch: z.boolean(),
});
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

const playerName = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NAME_LENGTH)
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'letters, numbers, spaces, _ . - only');

export const ClientMsgSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    name: playerName,
    simVersion: z.string().max(64),
    clientId: z.string().min(8).max(64),
  }),
  z.object({ t: z.literal('select'), fighter: z.string().max(32) }),
  z.object({ t: z.literal('ready'), ready: z.boolean(), viewMirrored: z.boolean() }),
  z.object({ t: z.literal('signal'), data: z.unknown() }),
  z.object({ t: z.literal('loaded') }),
  z.object({ t: z.literal('relay'), on: z.boolean() }),
  z.object({
    t: z.literal('result'),
    winner: z.union([z.literal(0), z.literal(1), z.literal(-1)]),
    finalChecksum: z.number().int(),
  }),
  z.object({ t: z.literal('rematch') }),
  z.object({ t: z.literal('reselect') }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('ping') }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

export const IceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export type IceServer = z.infer<typeof IceServerSchema>;

export const ErrorCodeSchema = z.enum([
  'ROOM_FULL',
  'NOT_FOUND',
  'VERSION_MISMATCH',
  'BAD_MESSAGE',
  'BAD_STATE',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ServerMsgSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('room'),
    code: z.string(),
    you: z.union([z.literal(0), z.literal(1)]),
    players: z.tuple([PlayerInfoSchema.nullable(), PlayerInfoSchema.nullable()]),
    phase: z.enum(['waiting', 'select', 'loading', 'match', 'results']),
    roundsToWin: z.union([z.literal(2), z.literal(3)]),
  }),
  z.object({ t: z.literal('ice'), iceServers: z.array(IceServerSchema) }),
  z.object({ t: z.literal('signal'), data: z.unknown() }),
  z.object({ t: z.literal('config'), config: MatchConfigSchema }),
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('relay'), on: z.boolean() }),
  z.object({ t: z.literal('peer_left'), reason: z.enum(['closed', 'timeout', 'left']) }),
  z.object({ t: z.literal('error'), code: ErrorCodeSchema, message: z.string() }),
  z.object({ t: z.literal('pong') }),
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;

/* ------------------------------------------------------------------ */
/* Peer control channel (reliable, ordered, JSON) — PLAN §6.5          */
/* ------------------------------------------------------------------ */

export const ControlMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ping'), id: z.number().int(), sentAt: z.number() }),
  z.object({ t: z.literal('pong'), id: z.number().int(), sentAt: z.number() }),
  z.object({ t: z.literal('delay'), inputDelay: z.number().int().min(0).max(8) }),
  z.object({
    t: z.literal('checksum'),
    frame: z.number().int(),
    sum: z.number().int(),
    epoch: z.number().int(),
  }),
  z.object({ t: z.literal('pause'), reason: z.enum(['hidden', 'menu']) }),
  z.object({ t: z.literal('resume') }),
  z.object({ t: z.literal('quit') }),
]);
export type ControlMsg = z.infer<typeof ControlMsgSchema>;

/** Parse JSON safely; returns null for anything invalid. */
export function parseJson<T>(schema: z.ZodType<T>, raw: string): T | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
