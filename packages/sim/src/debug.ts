import { FS } from './constants';
import type { FighterState } from './types';

/** Could this fighter start an action on the next frame? (training frame-advantage display) */
export function isActionable(f: FighterState): boolean {
  return f.state === FS.IDLE || f.state === FS.RUN || f.state === FS.DASH || f.state === FS.GUARD;
}

/** Field-by-field differences between two plain-data states (desync debugging). */
export function diffStates(a: unknown, b: unknown, path = 'state', out: string[] = [], limit = 50): string[] {
  if (out.length >= limit) return out;
  if (typeof a !== typeof b) {
    out.push(`${path}: ${String(a)} ≠ ${String(b)}`);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length: ${a.length} ≠ ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++)
      diffStates(a[i], b[i], `${path}[${i}]`, out, limit);
    return out;
  }
  if (a && b && typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b as object)]);
    for (const k of keys) {
      diffStates(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
        out,
        limit,
      );
    }
    return out;
  }
  if (a !== b) out.push(`${path}: ${String(a)} ≠ ${String(b)}`);
  return out;
}
