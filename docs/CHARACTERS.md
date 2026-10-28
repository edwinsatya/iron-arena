# Making Kaito and Magnus (free, anime style)

The game draws fighters from **VRM** files — the open anime-avatar format made by **VRoid Studio**,
a free character creator. You design the look; the game supplies all the fighting poses, so you
don't animate anything.

Until you add your own, two free sample models stand in (see `CREDITS.md`).

## 1. Install VRoid Studio (free)

Download it from the official site (vroid.com) or Steam. It runs on Windows and macOS.

## 2. Design each fighter

Start from a male base model and shape it with the sliders: face, hair, body, outfit.

**Kaito Arashi — "The Storm Prodigy"** (young, fast, evasive)
- Slim athletic build, average height
- Spiky dark hair, yellow headband
- Crimson jacket or gi top, light trousers, fingerless gloves
- Confident, sharp eyes

**Magnus Thorne — "The Iron Mountain"** (heavy power)
- Broad, tall, heavy build (make the body and shoulders wide)
- Shaved head or short grey hair, thick grey beard
- Dark sleeveless top, brown trousers, gold belt and wrist wraps
- Scarred, stern face

Tips:
- Keep outfits fairly close to the body. Long coats and skirts clip through the legs during kicks.
- Hair physics is fine; the game simulates it.
- Fewer accessories = smaller file = faster loading.

## 3. Export as VRM

In VRoid Studio choose **Export → Export as VRM** (VRM 1.0 or 0.x both work).
In the export options, **reduce polygons** and use a **2048 texture atlas** to keep the file small
(aim for under 10 MB). Fill in the license fields; for your own characters you can allow everything.

## 4. Put them in the game

1. Copy the files to `apps/web/public/models/`, e.g. `kaito.vrm` and `magnus.vrm`.
2. Edit `apps/web/public/models/manifest.json`:

```json
{
  "kaito": { "file": "kaito.vrm", "height": 1.62 },
  "magnus": { "file": "magnus.vrm", "height": 1.72 }
}
```

`height` is the head height in metres the model is scaled to (Magnus is also scaled ×1.1 by the
game). Keep these close to the defaults so the model matches the hitboxes.

3. Reload the page. The fighters load as soon as the files are there; if a file is missing the game
   falls back to the capsule mannequin, so nothing breaks.

## 5. Check the fit

- Open `/dev/poses` to see the mannequin and the model side by side on any move frame.
- In a fight, press **F1** to show hitboxes: on the impact frame the fist or foot should sit on the
  red sphere. If a model is much taller or shorter, adjust `height` in the manifest.
- Remove the stand-in rows from `CREDITS.md` once you've replaced them.

## Want hand-made animations later?

The poses are generated in code (`apps/web/src/game/render/poses.ts`) and timed from the frame data,
so they always line up with the hitboxes. If you later want motion-captured animations (Mixamo, free
with an Adobe account), PLAN §5.2–5.3 describes how to drive clips from the simulation frames instead.
