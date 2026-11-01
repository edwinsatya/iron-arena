'use client';

import { useEffect, useState } from 'react';
import { ICONS } from '../game/hud/touchPad';

type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type Orientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

const doc = () => document as FsDocument;
const isFullscreen = () => !!(document.fullscreenElement ?? doc().webkitFullscreenElement);

/** Full screen and, where the browser allows it (Android), the screen locked sideways. */
export async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    return;
  }
  try {
    await (screen.orientation as Orientation | undefined)?.lock?.('landscape');
  } catch {
    // not supported (iPad, desktop): the match turns itself sideways instead
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await doc().webkitExitFullscreen?.();
  } catch {
    // already windowed
  }
}

/**
 * Starting a fight on a phone or tablet: go full screen and lock the screen sideways where the
 * browser allows it (Android). Needs the tap that starts the fight; does nothing on iPhone, where the
 * match turns itself sideways instead.
 */
export function playFullscreen(): void {
  if (!window.matchMedia('(pointer: coarse)').matches || isFullscreen()) return;
  if (!(document.fullscreenEnabled || doc().webkitFullscreenEnabled)) return;
  void enterFullscreen();
}

/** Full-screen toggle for touch screens; renders nothing where the page can't go full screen (iPhone). */
export function FullscreenButton() {
  const [can, setCan] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    setCan(!!(document.fullscreenEnabled || doc().webkitFullscreenEnabled));
    const sync = () => setOn(isFullscreen());
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);
  if (!can) return null;
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={on ? 'Leave full screen' : 'Full screen'}
      title={on ? 'Leave full screen' : 'Full screen'}
      onClick={() => void (on ? exitFullscreen() : enterFullscreen())}
      dangerouslySetInnerHTML={{ __html: on ? ICONS.windowed : ICONS.fullscreen }}
    />
  );
}
