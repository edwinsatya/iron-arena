import { getCharacter } from '@iron-arena/sim';
import { lookFor } from './looks';
import { chooseSpriteForAction, loadSpriteHero, type SpritePick, type SpriteHero } from './render2d/sprites';

/**
 * Hero pictures for the HUD, menus and skill icons, all from the sprites so every hero matches:
 * a bust cropped from the 3/4 idle frame (made by `pnpm sprites`), and the sprite itself in a
 * pose (a skill's contact frame, the ultimate, the victory pose) over a soft glow in the hero's
 * colour. Cached as image URLs.
 */

export type PortraitKind = 'face' | 'full' | 'win' | 'vs' | 'cutin' | `skill:${string}`;

const cache = new Map<string, Promise<string>>();

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A soft glow in the hero's colour behind the sprite, darkening to the card's edges (or fading to
 * nothing when `open`, for art laid over other things, like the ultimate cut-in).
 */
function heroGlow(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  color: string,
  open = false,
) {
  const [cr, cg, cb] = rgb(color);
  if (!open) {
    g.fillStyle = '#15121c';
    g.fillRect(0, 0, w, h);
  }
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.62)`);
  glow.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, 0.22)`);
  glow.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  // A pool of light on the floor
  g.save();
  g.translate(cx, h * 0.94);
  g.scale(1, 0.18);
  const pool = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.34);
  pool.addColorStop(0, 'rgba(255, 236, 200, 0.28)');
  pool.addColorStop(1, 'rgba(255, 236, 200, 0)');
  g.fillStyle = pool;
  g.beginPath();
  g.arc(0, 0, w * 0.34, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** The sprite in a pose over the hero's glow. `frac`: body height as a share of the card. */
async function spriteCard(
  heroId: string,
  pose: (sprite: SpriteHero) => SpritePick,
  w: number,
  h: number,
  frac: number,
  open = false,
): Promise<string> {
  const sprite = await loadSpriteHero(heroId);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  heroGlow(g, w, h, w / 2, h * 0.66, Math.max(w, h) * (open ? 0.5 : 0.62), lookFor(heroId).color, open);
  if (sprite) {
    // Same body height on every card, whatever the source resolution
    const zoom = (h * frac) / (sprite.atlas.pxPerM * 1.8);
    sprite.drawPick(g, pose(sprite), w / 2, h * 0.94, zoom, 1);
  }
  return c.toDataURL('image/png');
}

function winPose(sprite: SpriteHero, heroId: string): SpritePick {
  const ref = lookFor(heroId).win;
  const r = typeof ref === 'string' ? { anim: ref } : ref;
  const anim = sprite.atlas.anims[r.anim] ?? sprite.atlas.anims.idle!;
  const frame = Math.min(anim.frames.length - 1, r.hold ?? anim.frames.length - 1);
  return { anim, frame: anim.loop ? 0 : frame, sx: 1, sy: 1, rot: 0, alpha: 1 };
}

export function portrait(heroId: string, kind: PortraitKind): Promise<string> {
  const key = `${heroId}:${kind}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (kind === 'face') return `/sprites/${heroId}/bust.webp`;
      if (kind === 'full')
        return spriteCard(heroId, (s) => chooseSpriteForAction(s.atlas, heroId, null), 240, 320, 0.8);
      if (kind === 'win') return spriteCard(heroId, (s) => winPose(s, heroId), 240, 320, 0.8);
      if (kind === 'vs') return spriteCard(heroId, (s) => winPose(s, heroId), 360, 420, 0.82, true);
      if (kind === 'cutin') {
        const h = getCharacter(heroId);
        const ult = h.actions[h.ultIdx]!.id;
        return spriteCard(heroId, (s) => chooseSpriteForAction(s.atlas, heroId, ult), 360, 360, 0.86, true);
      }
      const actionId = kind.slice(6);
      return spriteCard(heroId, (s) => chooseSpriteForAction(s.atlas, heroId, actionId), 192, 192, 0.8);
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
    urls.push(portrait(id, 'face'), portrait(id, 'cutin'), portrait(id, 'vs'));
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
