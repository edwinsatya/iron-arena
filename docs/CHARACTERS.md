# Heroes and sprite packs

Heroes are pixel-art sprites from free packs by **elie automata** (itch.io). Each pack has every
animation in 8 directions; the game uses the side view (`east`, mirrored for facing left).
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

## Current roster

- **Benika, Crimson Axemaiden** (Battle Axemaiden): Chiwari Shatter, Tsumuji Whirl, Otakebi War Cry; ultimate Guren Judgment
- **Lysa, Windfeather Scout** (Elven Bow Scout): Hayate Piercer, Kazekiri Dash, Konoha Vortex; ultimate Takanome Volley
- **Hyōga, Glacierbreaker** (Glacierbreaker Knight): Hyōtsui Hammerfall, Fubuki Cyclone, Hyōheki Bastion; ultimate Eikyū Permafrost
- **Hyōshin, Glacial Heart** (Glacial Heart): Hyōsō Bolt, Frost Barrier, Death Shatter; ultimate Absolute Zero
- **Reo, Aegis Knight** (Shield Knight): Hakō Wave, Shōryū Rising, Kōbō Aegis; ultimate Akatsuki Daybreak
- **Kage, Hooded Shadow** (Black Assassin): Senbon Fan, Shunpo Behind, Utsusemi Decoy; ultimate Senjin Thousand Cuts
- **Homura, Ember Witch** (Fire Witch, idle only + puppet motion): Kaen Pillar, Homura Wave, Hōen Ward; ultimate Ryūsei Meteor
- **Gōkai, Drowned Admiral** (Tentaclebeard Admiral): Uzushio Maelstrom, Tsunami Wall, Barnacle Hide; ultimate Daikaishō Leviathan
- **Yomi, Faceless Reaper** (Faceless Void Reaper): Yamigiri Crescent, Soul Snatch, Grave Hands; ultimate Yomi Gate
- **Kuma, Black Bear Bandit** (Black Bear Bandit): Grizzly Roar, Frenzy Claws, Hibernate; ultimate Ōkuma Rampage
