import { MAX_NAME_LENGTH } from '@iron-arena/shared';

/** Per-browser conveniences in localStorage (wrapped: storage may be unavailable). */
export interface Settings {
  name: string;
  quality: 'low' | 'medium' | 'high';
  volume: number;
  announcer: boolean;
  /** Online: see yourself on the left even as P2. */
  alwaysLeft: boolean;
  /** Override the automatic input delay (0 = automatic). */
  inputDelay: number;
  /** Touch buttons give a short buzz (phones that can vibrate). */
  haptics: boolean;
}

const DEFAULTS: Settings = {
  name: '',
  quality: 'medium',
  volume: 0.7,
  announcer: true,
  alwaysLeft: true,
  inputDelay: 0,
  haptics: true,
};

const KEY = 'iron-arena.settings.v1';
/** Where settings were saved before the rename; read once so nobody loses their name or volume. */
const OLD_KEY = 'neonfist.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.removeItem(OLD_KEY);
  } catch {
    // private mode etc.
  }
  return next;
}

export function cleanName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** One id per browser tab, so two tabs in the same browser are two different players. */
export function clientId(): string {
  try {
    let id = sessionStorage.getItem('iron-arena.client');
    if (!id) {
      id = `c-${crypto.randomUUID()}`;
      sessionStorage.setItem('iron-arena.client', id);
    }
    return id;
  } catch {
    return `c-${Math.random().toString(36).slice(2)}${Date.now()}`;
  }
}
