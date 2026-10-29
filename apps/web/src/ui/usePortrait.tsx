'use client';

import { useEffect, useState } from 'react';
import { portrait, type PortraitKind } from '../game/render/portraits';

/** Image URL of a hero portrait rendered from the 3D model (null while rendering). */
export function usePortrait(heroId: string | null, kind: PortraitKind): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!heroId) return;
    portrait(heroId, kind)
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [heroId, kind]);
  return url;
}

export function Portrait({
  heroId,
  kind,
  className,
}: {
  heroId: string;
  kind: PortraitKind;
  className?: string;
}) {
  const url = usePortrait(heroId, kind);
  return url ? <img src={url} alt="" className={className} draggable={false} /> : null;
}
