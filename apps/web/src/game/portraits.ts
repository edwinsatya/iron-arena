import { getCharacter } from '@neonfist/sim';
import { lookFor } from './looks';
import { chooseSpriteForAction, heroArt, loadSpriteHero, type SpriteHero } from './render2d/sprites';

/**
 * Hero pictures for the HUD, menus and skill cards. Heroes from complete packs use the pack's
 * painted art (portraits, skill cards, full art); the others get pictures drawn from their
 * sprites (a skill's contact frame on the hero's colour), cached as image URLs.
 */

export type PortraitKind = 'face' | 'full' | 'cutin' | `skill:${string}`;

const cache = new Map<string, Promise<string>>();

function cardKey(heroId: string, actionId: string): 'cardS1' | 'cardS2' | 'cardS3' | 'cardUlt' | null {
  const h = getCharacter(heroId);
  const idx = h.ids[actionId];
  if (idx === undefined) return null;
  if (idx === h.ultIdx) return 'cardUlt';
  const slot = h.skillIdx.indexOf(idx);
  return slot >= 0 ? (['cardS1', 'cardS2', 'cardS3'] as const)[slot]! : null;
}

/** Draw a sprite frame on a coloured card (for heroes without painted art). */
async function spriteCard(heroId: string, actionId: string | null, w: number, h: number, frac: number): Promise<string> {
  const sprite: SpriteHero | null = await loadSpriteHero(heroId);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const look = lookFor(heroId);
  const bg = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.7);
  bg.addColorStop(0, look.color);
  bg.addColorStop(1, '#140f1e');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (actionId) {
    // A burst of the hero's colour behind the pose
    g.save();
    g.translate(w / 2, h * 0.55);
    for (let k = 0; k < 18; k++) {
      g.rotate((Math.PI * 2) / 18);
      g.fillStyle = k % 2 ? look.glow : look.color;
      g.globalAlpha = 0.35;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, -w * 0.09);
      g.lineTo(w, w * 0.09);
      g.fill();
    }
    g.restore();
    const ring = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, w * 0.45);
    ring.addColorStop(0, 'rgba(255,255,255,0.55)');
    ring.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ring;
    g.fillRect(0, 0, w, h);
  }
  if (sprite) {
    const pick = chooseSpriteForAction(sprite.atlas, heroId, actionId);
    // Same body height on every card, whatever the source resolution
    const zoom = (h * frac) / (sprite.atlas.pxPerM * 1.8);
    sprite.drawPick(g, pick, w / 2, h * 0.92, zoom, 1);
  }
  return c.toDataURL('image/png');
}

export function portrait(heroId: string, kind: PortraitKind): Promise<string> {
  const key = `${heroId}:${kind}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (kind === 'face') return heroArt(heroId, 'face')!;
      if (kind === 'full' || kind === 'cutin') return heroArt(heroId, 'full') ?? spriteCard(heroId, null, 360, 540, 0.82);
      const actionId = kind.slice(6);
      const card = cardKey(heroId, actionId);
      return (card && heroArt(heroId, card)) || spriteCard(heroId, actionId, 240, 240, 0.78);
    })();
    cache.set(key, p);
  }
  return p;
}

/** Preload the pictures a fight needs (resolves when they're decoded). */
export function portraitsReady(ids: string[]): Promise<void> {
  const urls: Promise<string>[] = [];
  for (const id of ids) {
    const h = getCharacter(id);
    urls.push(portrait(id, 'face'), portrait(id, 'cutin'));
    for (const i of [...h.skillIdx, h.ultIdx]) urls.push(portrait(id, `skill:${h.actions[i]!.id}`));
  }
  return Promise.all(
    urls.map((u) =>
      u.then(
        (src) =>
          new Promise<void>((res) => {
            const im = new Image();
            im.onload = im.onerror = () => res();
            im.src = src;
          }),
      ),
    ),
  ).then(() => undefined);
}
