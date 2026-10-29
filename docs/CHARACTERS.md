# Making the heroes (free, anime style)

The game draws heroes from **VRM** files — the open anime-avatar format made by **VRoid Studio**,
a free character creator. You design the look; the game supplies the poses, the weapon and the
effects, so you don't animate anything. Portraits, skill cards and the ultimate cut-in are rendered
from the same model automatically.

Until you add your own, two free sample models stand in (see `CREDITS.md`): Kaito and Magnus share
one, Riko and Seren share the other, told apart by outfit colours, weapons and accessories.

## 1. Install VRoid Studio (free)

Download it from the official site (vroid.com) or Steam. It runs on Windows and macOS.

## 2. Design each hero

**Kaito Arashi — "Stormblade"** (katana, fast)
- Slim athletic build, average height; spiky dark hair, yellow headband
- Crimson gi or jacket, light trousers; sharp, confident eyes

**Magnus Thorne — "Iron Mountain"** (gauntlets, heavy)
- Tall and broad (widen body and shoulders); short grey hair, thick beard
- Dark sleeveless top, brown trousers, orange scarf; a mechanical arm suits him

**Riko Kanzaki — "Crossfire"** (twin pistols, mobile)
- Petite and quick; pink hair, a cap worn backwards or a visor
- Courier jacket or hoodie in hot pink, dark shorts, sneakers

**Seren Mikazuki — "Moon Oracle"** (staff, mage)
- Calm, tall; long silver or lavender hair
- Shrine-inspired robe in white and violet; the game adds a crescent halo

Tips: keep outfits close to the body (long coats clip during kicks and spins); fewer accessories =
smaller file. The game hands each hero their weapon — don't model one.

## 3. Export as VRM

**Export → Export as VRM** (VRM 1.0 or 0.x). Reduce polygons and use a 2048 texture atlas to stay
under ~10 MB. Fill in the license fields; for your own characters you can allow everything.

## 4. Put them in the game

1. Copy the files to `apps/web/public/models/`, e.g. `kaito.vrm`.
2. Edit `apps/web/public/models/manifest.json`:

```json
{
  "kaito": { "file": "kaito.vrm", "height": 1.62 },
  "magnus": { "file": "magnus.vrm", "height": 1.66 },
  "riko": { "file": "riko.vrm", "height": 1.56 },
  "seren": { "file": "seren.vrm", "height": 1.6 }
}
```

`height` is the head height in metres the model is scaled to. Magnus is also scaled ×1.1 and made
bulkier by the game.

3. In `apps/web/src/game/render/looks.ts`, set that hero's `tint` colours to white (`#ffffff`) so
   your own colours show, and empty the `hide` list (it hides parts of the stand-in model).
4. Reload. If a file is missing the game falls back to a capsule mannequin, so nothing breaks.

## 5. Check the fit

- **Training** → press **F1** to see hitboxes: the sword or fist should sweep through the red
  spheres on impact. If a model is much taller or shorter, adjust `height`.
- Remove the stand-in rows from `CREDITS.md` once you've replaced them.

## Hand-drawn art (optional)

Prefer painted portraits? Put PNGs in `apps/web/public/portraits/` named `<hero>-<kind>.png`
(`kaito-face.png`, `kaito-full.png`, `kaito-cutin.png`, `kaito-skill-k_s1.png` …) and list the file
names in `apps/web/public/portraits/manifest.json`. Listed files replace the rendered ones.

## Hand-made animations later?

Poses are generated in code (`apps/web/src/game/render/poses.ts`) and timed from each action's
impact frame, so they always line up with the hitboxes. Each action picks a style in `looks.ts`
(`slash`, `thrust`, `spin`, `shootR`, `cast` …); add a new style there to change how a move looks.
