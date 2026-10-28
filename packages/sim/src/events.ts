import type { GameState } from './types';

/** Events older than this many frames are dropped (PLAN §5.6). */
export const EVENT_WINDOW = 16;

export function pushEvent(
  s: GameState,
  fighter: number,
  type: number,
  value: number,
  x: number,
  y: number,
  z: number,
): void {
  s.recentEvents.push({ frame: s.frame, fighter, type, value, x, y, z });
}

export function pruneEvents(s: GameState): void {
  const oldest = s.frame - EVENT_WINDOW;
  let i = 0;
  while (i < s.recentEvents.length && s.recentEvents[i]!.frame <= oldest) i++;
  if (i > 0) s.recentEvents.splice(0, i);
}
