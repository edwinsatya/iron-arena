import { IN } from './constants';
import { stunFromAdvantage } from './math';
import type { CharacterData, MoveData } from './types';

/** Command motion prefix. */
export const MOTION = { NONE: 0, FF: 1, SS: 2 } as const;

export interface Command {
  motion: number;
  /** Required direction as intent bits (0 = neutral). */
  dir: number;
  /** Required buttons as intent bits. */
  buttons: number;
}

export interface CompiledCancel {
  cmd: Command;
  from: number;
  to: number;
  into: number;
}

export interface CompiledMove extends MoveData {
  index: number;
  cmd: Command | null;
  /** Total frames: startup - 1 + active + recovery. */
  total: number;
  /** Last move frame on which the hitbox (or grab) is active. */
  lastActive: number;
  blockstun: number;
  cancelList: CompiledCancel[];
  /** Last frame of any cancel window (buffered presses are kept until then). */
  lastCancelFrame: number;
  has: (p: NonNullable<MoveData['properties']>[number]) => boolean;
}

export interface CompiledCharacter extends Omit<CharacterData, 'moves'> {
  index: number;
  moves: CompiledMove[];
  /** Moves that have their own command (not string follow-ups). */
  topLevel: CompiledMove[];
}

const DIRS: Record<string, number> = {
  n: 0,
  f: IN.F,
  b: IN.B,
  u: IN.U,
  d: IN.D,
  df: IN.D | IN.F,
  db: IN.D | IN.B,
  uf: IN.U | IN.F,
  ub: IN.U | IN.B,
};
const BUTTONS: Record<string, number> = { '1': IN.B1, '2': IN.B2, '3': IN.B3, '4': IN.B4 };

/** Parse 'df+2', 'f,f+3', 'b+1+2', '1+3', 'SS+2'. */
export function parseCommand(text: string): Command {
  const parts = text.split('+').map((p) => p.trim());
  let motion: number = MOTION.NONE;
  let dir = 0;
  let buttons = 0;
  let i = 0;
  const head = parts[0] ?? '';
  if (head === 'f,f') {
    motion = MOTION.FF;
    i = 1;
  } else if (head.toUpperCase() === 'SS') {
    motion = MOTION.SS;
    i = 1;
  } else if (head in DIRS) {
    dir = DIRS[head]!;
    i = 1;
  }
  for (; i < parts.length; i++) {
    const bit = BUTTONS[parts[i]!];
    if (!bit) throw new Error(`Invalid command "${text}"`);
    buttons |= bit;
  }
  if (!buttons) throw new Error(`Command without buttons: "${text}"`);
  return { motion, dir, buttons };
}

export function compileCharacter(data: CharacterData, index: number): CompiledCharacter {
  const ids = new Map<string, number>();
  data.moves.forEach((m, i) => {
    if (ids.has(m.id)) throw new Error(`${data.id}: duplicate move id ${m.id}`);
    ids.set(m.id, i);
  });

  const moves: CompiledMove[] = data.moves.map((m, i) => {
    if (m.startup < 1 || m.active < 1 || m.recovery < 0) throw new Error(`${m.id}: bad frame data`);
    if (m.height === 'throw' && !m.throw) throw new Error(`${m.id}: throw without throw data`);
    const cancelList = (m.cancels ?? []).map((c) => {
      const into = ids.get(c.into);
      if (into === undefined) throw new Error(`${m.id}: cancel into unknown move ${c.into}`);
      return { cmd: parseCommand(c.input), from: c.window[0], to: c.window[1], into };
    });
    const props = new Set(m.properties ?? []);
    return {
      ...m,
      index: i,
      cmd: m.command ? parseCommand(m.command) : null,
      total: m.startup - 1 + m.active + m.recovery,
      lastActive: m.startup + m.active - 1,
      blockstun: stunFromAdvantage(m.onBlock, m.active, m.recovery),
      cancelList,
      lastCancelFrame: cancelList.reduce((mx, c) => Math.max(mx, c.to), 0),
      has: (p) => props.has(p),
    };
  });

  const topLevel = moves.filter((m) => m.cmd !== null);
  return { ...data, index, moves, topLevel };
}

function popcount(v: number): number {
  let n = 0;
  for (let x = v; x; x &= x - 1) n++;
  return n;
}

/** Directions to try, most specific first: exact → plain down (for df/db) → neutral. */
function dirFallbacks(dir: number): number[] {
  const list = [dir];
  if (dir & IN.D && dir !== IN.D) list.push(IN.D);
  if (dir !== 0) list.push(0);
  return list;
}

/**
 * Pick the move for a button press. Tries an exact button match first (e.g. 1+2), then each
 * single button. Dash moves (f,f+3) win while dashing; then exact direction, then fallbacks.
 */
export function findMove(ch: CompiledCharacter, buttons: number, dir: number, dashing: boolean): number {
  const sets = [buttons];
  if (popcount(buttons) > 1) {
    for (const b of [IN.B1, IN.B2, IN.B3, IN.B4]) if (buttons & b) sets.push(b);
  }
  for (const bs of sets) {
    if (dashing) {
      const m = ch.topLevel.find((mv) => mv.cmd!.motion === MOTION.FF && mv.cmd!.buttons === bs);
      if (m) return m.index;
    }
    for (const d of dirFallbacks(dir)) {
      const m = ch.topLevel.find(
        (mv) => mv.cmd!.motion === MOTION.NONE && mv.cmd!.buttons === bs && mv.cmd!.dir === d,
      );
      if (m) return m.index;
    }
  }
  return -1;
}

/** Exact match only (used to upgrade 1 into 1+2 when the second button arrives a frame later). */
export function findExactMove(ch: CompiledCharacter, buttons: number, dir: number): number {
  for (const d of dirFallbacks(dir)) {
    const m = ch.topLevel.find(
      (mv) => mv.cmd!.motion === MOTION.NONE && mv.cmd!.buttons === buttons && mv.cmd!.dir === d,
    );
    if (m) return m.index;
  }
  return -1;
}

/** Does a buffered press satisfy a cancel input? A cancel without a direction accepts any. */
export function matchesCancel(cmd: Command, buttons: number, dir: number): boolean {
  if (cmd.buttons !== buttons) return false;
  return cmd.dir === 0 || cmd.dir === dir;
}
