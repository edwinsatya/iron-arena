# Heroes and sprite packs

Heroes are pixel-art sprites from free packs, all by **elie automata** (itch.io) except Kamakiri's
(the Void Mantis pack, see CREDITS.md). Each pack has every animation in 8 directions; the game
uses the side view (`east`, mirrored for facing left).
Complete packs also have painted art: portraits, full-length art and skill cards, which the HUD,
select screen and ultimate cut-in use.

## Adding or updating packs

1. Download the pack zip(s) from itch.io and put them, still zipped, in `assets-src/sprites/`
   (ignored by git — the licence forbids redistributing the raw assets).
2. Add the hero to `HEROES` in `tools/sprites.ts`: which pack, the hero's height in metres, which
   animation folder plays as which game animation (`idle`, `walk`, `attack`, skill names, `death`)
   and, for complete packs, the art prefix and which skill card goes with which skill.
3. Run `pnpm sprites`. It writes `apps/web/public/sprites/<hero>/`: `atlas.json`, `sheet0.png`
   (trimmed frames with feet anchors and each attack's contact frame), `face.webp`, and for
   complete packs `art.webp` and `card-s1/s2/s3/ult.webp`.
4. Give the hero gameplay data in `packages/sim/data/heroes/` (and add it to `roster.ts` and
   `SELECTABLE_FIGHTERS`), then map each action to an animation in `apps/web/src/game/looks.ts`.

The renderer lines each attack's contact frame up with the action's impact frame, so timing in
the sim decides the speed of every animation.

## What packs are missing and how the game fills in

| Missing | Made from |
|---|---|
| Hurt, launched, knocked down, getting up | Frames of the Death animation (reversed to get up); tilts when there's no Death |
| Jump, land | Walk frames with stretch and squash |
| Guard, counter stance | First idle frame plus a code-drawn barrier |
| Dash | Walk sped up, with afterimages |
| Skills with no animation (Rime Bastion, Aegis, Daybreak…) | Idle or attack frames plus effects drawn in code |
| Portraits for packs without art | Cropped from a front-facing sprite frame, scaled up crisply |

Packs that only include an idle animation can still become casters: their spells are drawn in
code, so the body barely needs to move.

### Building missing moves from a pack's own frames

`tools/sprites.ts` can make new animations out of the frames a pack already has (the licence
allows modifications). Karasu, the Plague Doctor, is built this way from a free pack with only
idle, walk, jump and one lantern swing:

| Move | Made from |
|---|---|
| Run | Walk frames, faster, leaning into the stride (`xf` tilt) |
| Jump, landing, guard | Hand-picked jump frames (crouch, spring, tuck, cloak flare; huddled crouch) |
| Hurt, knockdown, KO | Crouch and idle frames tilted back around the feet and laid on the floor (`xf` with `ground`) |
| Basic combo | The side swing, the same swing seen from three quarters, then the front-facing slam |
| Flask throw, crow call | The swing re-timed without its fire arc / with the lantern held out (`pick`) |
| Plague attacks, ultimate | Frames recoloured: the lantern, flames, sparks and their light turn green (`plague`) |

Options per animation: `pick` (frames in any order, repeats, `[folder, frame]` from another
animation), `dir` (another facing), `plague` (fire → green), `xf` (tilt, shift, `ground`) and
`noHover`. Per hero: `hover` (floats that many pixels above the floor), `bust` (a manual crop when
the automatic portrait misses the head) and `credit`.

Two more heroes are built the same way:

| Hero | The pack has | Made from it |
|---|---|---|
| Kamakiri, Void Mantis | A walk and one slash in 8 directions; one-frame idle, flying and dead poses (stored as `<State>/<facing>.png`, which the converter reads as one-frame animations) | Idle breathing (the idle pose rising and settling), run (tilted walk), jump and hover (the flying pose), guard (blades folded, from the walk), flinch and knockdown (tilts, then the dead pose), the slash seen side-on, from three quarters (a full circle) and from the front (both blades), the slash twice, the snare (a lunge), the dive (flying pose and slash, nose down) |
| Kurage, Abyssal Jelly | Idle, move, a tentacle lash and death (complete pack) | It floats (`hover`); guard = shrinking into its bell, flinch = the first death frames, knockdown = collapsing into a puddle (getting up re-forms it), the pulse = the bell swelling, the gaze = the front view with the great eye |

Kamakiri's snare is the game's first grab (`grab` / `release` in the action data): the forelegs
catch the enemy through guard, hold them, cut and kick them away.

## Current roster

- **Benika, Crimson Axemaiden** (Battle Axemaiden): Chiwari Shatter, Tsumuji Whirl, Otakebi War Cry; ultimate Guren Judgment
- **Lysa, Windfeather Scout** (Elven Bow Scout): Hayate Piercer, Kazekiri Dash, Konoha Vortex; ultimate Takanome Volley
- **Hyōga, Glacierbreaker** (Glacierbreaker Knight): Hyōtsui Hammerfall, Fubuki Cyclone, Hyōheki Bastion; ultimate Eikyū Permafrost
- **Hyōshin, Glacial Heart** (Glacial Heart): Hyōsō Bolt, Frost Barrier, Death Shatter; ultimate Absolute Zero
- **Akari, Dawn Blade** (Young Swordswoman): Shōten Rising, Senkō Flash, Kabuto-wari; ultimate Reimei Sky Blade
- **Reo, Aegis Knight** (Shield Knight): Hakō Wave, Shōryū Rising, Kōbō Aegis; ultimate Akatsuki Daybreak
- **Kage, Hooded Shadow** (Black Assassin): Senbon Fan, Shunpo Behind, Utsusemi Decoy; ultimate Senjin Thousand Cuts
- **Homura, Ember Witch** (Fire Witch, idle only + puppet motion): Kaen Pillar, Homura Wave, Hōen Ward; ultimate Ryūsei Meteor
- **Gōkai, Drowned Admiral** (Tentaclebeard Admiral): Uzushio Maelstrom, Tsunami Wall, Barnacle Hide; ultimate Daikaishō Leviathan
- **Yomi, Faceless Reaper** (Faceless Void Reaper): Yamigiri Crescent, Soul Snatch, Grave Hands; ultimate Yomi Gate
- **Kuma, Black Bear Bandit** (Black Bear Bandit): Grizzly Roar, Frenzy Claws, Hibernate; ultimate Ōkuma Rampage
- **Karasu, Plague Doctor** (Plague Doctor, free pack: idle, walk, jump, one lantern swing): Ekibyō Flask, Kurobane Swarm, Miasma Veil; ultimate Kokushibyō. Every missing move is built from the pack's own frames (see below)
- **Kamakiri, Void Mantis** (Void Mantis Pixel Art v1.0, free pack): Kamaitachi, Hanemai Dive, Kamae Snare; ultimate Kokū Harvest
- **Kurage, Abyssal Jelly** (Abyssal Jelly, free complete pack): Shiden Bolt, Abyssal Tether, Hakkō Pulse; ultimate Shinkai Gaze
