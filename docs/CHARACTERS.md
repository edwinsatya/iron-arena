# Heroes and sprite packs

Heroes are pixel-art sprites from free packs, all by **elie automata** (itch.io) except Kamakiri's
(the Void Mantis pack) and Shirogane's (the Female Hero pack), see CREDITS.md. Each pack has every animation in 8 directions; the game
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
   A pack's VFX update (a separate `*-VFX-FREE.zip` of camera-facing effect clips) goes in the
   hero's `vfx` entry: each clip folder and its anchor (the ground under a column, the middle of
   a ring). It becomes `vfx.json` + `vfx0.png`, drawn at the hero's pixel density by
   `render2d/vfx.ts`; without the zip the effects fall back to the ones drawn in code.
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
code, so the body barely needs to move. Homura (Fire Witch, free pack: idle only) is built this
way. In `looks.ts` her body moves around each spell's impact frame (`puppet`: thrust, slam,
whirl through the eight facings, levitate). `swap` turns her in the middle of a move: the
three-quarter view with the staff raised, then profile as the fireball flies. `staffTip` holds
where the flame on her staff is in every frame (measured from the pack), so every spell flares
from it. `glide` gives her quick light steps over the idle frames instead of a walk cycle. Her
fire (pillars, the ring, fireballs, meteors) is drawn in `render2d/fire.ts`. The paid Full pack
has real Fireball, Fire Ring, Fire Pillar and Death animations that could replace the puppetry.

The free VFX updates replace the biggest effects with the packs' own pixel art (timing in
`effects2d.ts`, keyed to each area's age; the code-drawn versions stay as the fallback):

| Hero | Clip | Plays as |
|---|---|---|
| Homura | Inferno Pillar | Kaen Pillar, Flare Burst |
| Homura | Protective Fire Ring (flattened onto the floor, far half behind her) | Hōen Ward, Blaze Step |
| Homura | Infernal Cataclysm (Gothic) | Ryūsei Meteor's small strikes: the rune circle where each lands, then the flame |
| Homura | Infernal Cataclysm (Area) | Ryūsei Meteor's last strike: the firestorm |
| Homura | Fireball Radial Burst | From the staff as Great Fireball and Ryūsei Meteor go off |
| Yomi | Void Arcane Surge | Grave Hands: the star over the spot, then the ring of crescents |
| Yomi | Void Awakening (frames 3+; the first three show the reaper himself) | Yomi Gate opening and holding |
| Yomi | Void Triple Claw | Yomi Gate's raking hits and the last cut |
| Kemuri | Cindertrace Brand (her complete pack's own VFX folder) | Hibana Brand: marks closing on the chest, the blinking star, the burst |
| Kemuri | Violet Vein Priming | Shimyaku Priming, at her chest, bursting on the strike |
| Kemuri | Crimson Smokescreen Order (a little see-through, so nobody fully vanishes) | Kurenai Smokescreen: the canister, the ring of smoke, the bank rolling for as long as it lasts |
| Kemuri | Last Breath Protocol | Imawa Last Breath: the cage around the target through the barrage, flaring and shattering on the last blow |
| Kage | Venomshade Miasma (Hooded Rogue Assassin VFX update) | Shunpo Behind: when the cut stuns, a kunai strikes the floor and a venom pool spreads under the victim |
| Kage | Veil of the Forgotten | Utsusemi Decoy: the violet shroud closes round him while the decoy waits, falls away after; when the counter fires, the empty shroud collapses where he stood |
| Kage | Umbral Gravebind | Senjin Thousand Cuts: runes ring the target, hooked chains rise and hold them through the cuts, sinking away before the burst |
| Hyōshin | Absolute Zero — Frozen Abyss Vortex (Glacial Heart VFX update; flattened onto the floor, far half behind the fighters) | Absolute Zero: the vortex opens under him, churns while it drags the enemy in, flashes white on the last blow and shatters away (`groundFx` in `renderer2d.ts`; the code-drawn ice spikes of that last blow are skipped while it plays) |

Painted art (portraits, full art, skill boards) is in every complete pack but the game doesn't use
it: since the tournament redesign every portrait, skill icon and cut-in is made from the sprites so
all heroes match (`portraits.ts`).

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
animation), `dir` (another facing), `flip` (mirror a camera-facing view whose swing goes the wrong
way), `pack` (frames from a separate animation-update zip of the same character), `plague`
(fire → green), `xf` (tilt, shift, `ground`) and `noHover`. Per hero: `hover` (floats that many pixels above the floor), `bust` (a manual crop when
the automatic portrait misses the head) and `credit`.

Two more heroes are built the same way:

| Hero | The pack has | Made from it |
|---|---|---|
| Kamakiri, Void Mantis | A walk and one slash in 8 directions; one-frame idle, flying and dead poses (stored as `<State>/<facing>.png`, which the converter reads as one-frame animations) | Idle breathing (the idle pose rising and settling), run (tilted walk), jump and hover (the flying pose), guard (blades folded, from the walk), flinch and knockdown (tilts, then the dead pose), the slash seen side-on, from three quarters (a full circle) and from the front (both blades), the slash twice, the snare (a lunge), the dive (flying pose and slash, nose down) |
| Kurage, Abyssal Jelly | Idle, move, a tentacle lash and death (complete pack) | It floats (`hover`); guard = shrinking into its bell, flinch = the first death frames, knockdown = collapsing into a puddle (getting up re-forms it), the pulse = the bell swelling, the gaze = the front view with the great eye |

The two cyberpunk packs have an animation for every skill, so little is built:

| Hero | The pack has | Made from it |
|---|---|---|
| Kemuri, Smoke Gauntlet | Idle, walk, one punch, four skills and a death that ends on her knees (complete pack, plus stand-alone VFX clips of her four skills, used for them) | The four-hit combo (the punch without its wind-up, the punch from three quarters, the ultimate's straight arm, the full punch), the hammer fist (the punch seen from the front), guard (fists up), flinch and knockdown (the stumble, then the kneeling frames tipped onto her back) |
| Raika, Plasma Huntress | Idle, walk, six skills and a death (complete pack) | The quick cut, the thrust and the lunge (the big moves without their wind-ups), Seam Cut (the pack's alternate side view of Plasma Seam Ripper: a low sweep, then the thrust), guard (the gauntlet held out), the victory pose (the Calibration, seen from the front) |

Three more complete packs:

| Hero | The pack has | Made from it |
|---|---|---|
| Ikazuchi, Amber Magister | Idle, walk, six spells and a death (complete pack, plus six stand-alone VFX clips, used for his skills) | The rod jab (the discharge without its wind-up), the bronze hook (the polarity punch re-timed), guard (wrapped in the stormcloak), flinch (the first death frames), the victory pose (the circuit relay, seen from the front) |
| Amane, Sunwing Seraph | Idle, walk, five holy skills and a death (complete pack) | The wing buffet (the wingbeat re-timed), Sunpoint (the verdict without the halo's wind-up), guard (wings drawn around her from the oath), flinch (the first death frames), the victory pose (the oath, seen from the front) |
| Tsuno, Northern Packgoat | Loaded and unloaded idles, walks and a stride, nothing else (complete pack). It fights loaded | Run (the stride), jump (stride frames, forelegs up, then nose down), guard (head down, horns forward), the horn butt (rocking back, then the stride tilted forward and pushed ahead), the forehoof stomp (rearing up on the idle frame, then slamming down), the charge and the trail charge (nose to the ground, then the stride at a gallop), flinch (tilts), knockdown (bowled over onto its back, legs in the air) |

Ikazuchi's clips (`magisterArea` in `effects2d.ts`, the code-drawn versions as the fallback):

| Clip | Plays as |
|---|---|
| Outward Projectiles | Arc Discharge: amber darts fly out of the rod's burst |
| Distant Target | Kohaku Charge Imprint: the sigil writes itself on the enemy's chest, then discharges |
| Stationary Area | Kairo Circuit Relay: bolts on both sides of him for as long as it holds |
| Defensive Buff | Raiun Stormcloak: the amber dome while the counter stance is up (`renderer2d.ts`) |
| Defensive Counter | Polarity Reversal: the grounded blow comes back |
| Area Ultimate | Raimei Resonance Theorem: the rune circle over the enemy, ringing out on the proof |

One more, from a pack with a separate animation update:

| Hero | The pack has | Made from it |
|---|---|---|
| Shirogane, Silver Paladin | Female Hero Pixel Art v1.1: idle, walk, run, jump, guard, a diagonal slash, hurt and death in 8 directions, two more slashes facing the camera only; its New Animations update adds Basic Holy Spell Cast and Dawnpiercer Judgment (256 px canvas instead of 320, same size, read with `pack`) | The quick cut (the slash without its wind-up), the return cut (the slash from three quarters), the overhead coil and the sweep (the camera-facing slashes, mirrored with `flip` so they swing forward), knockdown (the death kneels; its last frames tip her onto her back), the blessing (the spell cast seen from the front), the victory pose (the judgment from the front, the dawn coming down on her hand) |

Amane's verdict, halo and feathers are drawn in code (`seraphArea`, the `feather` projectile).

Two more complete packs with their own VFX clips:

| Hero | The pack has | Made from it |
|---|---|---|
| Rōga, Winter Chieftain | Northern Gothic War Chieftain: idle, walk, run, jump, six axe moves and a death (complete pack, plus three VFX clips) | The fang chop (the cleave without its wind-up), the crystal hew (the execution's downstroke without the axe held aloft), the frostfall slam (the decree, quicker), guard (behind the fur mantle, from the iron guard), flinch (the first death frames), the victory pose (the oath, seen from the front) |
| Mitsume, Recon Sentinel | Quadrupedal Recon Drone: idle, walk, jump, five lens moves and a death (complete pack, plus two VFX clips) | The quick optic flicks (the pulse without its charge), run (the walk, faster), jump (crouch, legs flung out), the pounce (jump frames lifted), guard (legs anchored), flinch (the first death frames, tilted), the victory pose (the target lock, seen from the front) |

Their clips (`northArea` in `effects2d.ts`, the oath and calibration in `renderer2d.ts`; code-drawn
versions as the fallback):

| Hero | Clip | Plays as |
|---|---|---|
| Rōga | Crown of the Endless Winter | Tōkan Crown: spikes break the floor under the enemy, the crown closes round them through the hits, bursts on the last and sinks away |
| Rōga | Wolfblood Frost Oath — Wolf / Shield | Ōkami Wolfblood Oath: the wolf spirit rises behind him and howls; a shield of frost forms before him |
| Mitsume | Recon Sensor Calibration | Shōjun Tri-Lens Lock: the reticle closes on the target's chest and flashes on the strike; also at its own lens for Kansoku Sensor Calibration |
| Mitsume | Surveillance Dominion Array | Kanshi Surveillance Array: the panels box the target in, flare each time the lenses fire, slam shut on the last hit |

Some packs leave stray marker pixels in their frames (green tracking dots in the drone, a grey
blob in a corner of the Absolute Zero clip): `scrub` clears them in the converter. Zips whose
folder names hold UTF-8 (an em dash) are unpacked with `tar` when macOS's `unzip` can't.

One more complete pack with only two moves:

| Hero | The pack has | Made from it |
|---|---|---|
| Jūki, Siege Walker | Quadrupedal Combat Walker: idle, walk, Hydraulic Slam (two stomps), Reactor Charge (spin-up, then a boost smear) and a death (complete pack, no VFX clips) | The piston stomp and stamp (each stomp of the slam on its own), the reactor rush (the boost without the spin-up), run (the walk, faster), jump (the slam's rise, tilted), guard (the idle, hull down), flinch (the first sparks of the death, tilted), the lowered brace (the idle sunk on its legs), the victory pose (the slam seen from the front). The pack's own sparks and smear play in the frames; the rubble is the code-drawn `quake` |

And one whose every animation faces the camera:

| Hero | The pack has | Made from it |
|---|---|---|
| Shinku, Fallen Seraph | Demonic Gothic Seraph: Idle, Fly (wings open, then it becomes a beam of red light), Landing (a beam comes down, then it crouches and rises), Crimson Impale, Infernal Consecration — South view only, plus a mirrored copy (complete pack, no VFX clips) | Read from the mirrored set (`facing: 'south-mirrored'`) so the blade is on the forward side. The cut and the hellbrand (each skill's opening), the wing rend and glide (the fly's spread wings, the glide leaning in), jump and landing (fly and landing frames), guard and flinch (the landing's crouch, tilted), the fall (the crouch tipped onto its wings), the roar (the consecration's wings-wide frames, looped), the descent (fly then landing in one animation, the beam arriving on the contact frame). The beam frames are also lifted out as the `Crimson_Beam` clip (`frames` in a VFX clip) for the `beam` area kind. Its HUD and cut-in pictures use `still` poses, since the descent's contact frame is only light |

Raika's decoy is drawn with her own idle frame: the renderer leaves it standing where the skill's
area is until it bursts (`drawDecoys` in `renderer2d.ts`).

Kamakiri's snare is the game's first grab (`grab` / `release` in the action data): the forelegs
catch the enemy through guard, hold them, cut and kick them away.

## Current roster

- **Benika, Crimson Axemaiden** (Battle Axemaiden): Chiwari Shatter, Tsumuji Whirl, Otakebi War Cry; ultimate Guren Judgment
- **Lysa, Windfeather Scout** (Elven Bow Scout): Hayate Piercer, Kazekiri Dash, Konoha Vortex; ultimate Takanome Volley
- **Hyōga, Glacierbreaker** (Glacierbreaker Knight): Hyōtsui Hammerfall, Fubuki Cyclone, Hyōheki Bastion; ultimate Eikyū Permafrost
- **Hyōshin, Glacial Heart** (Glacial Heart, plus its VFX update for Absolute Zero): Hyōsō Bolt, Frost Barrier, Death Shatter; ultimate Absolute Zero
- **Akari, Dawn Blade** (Young Swordswoman): Shōten Rising, Senkō Flash, Kabuto-wari; ultimate Reimei Sky Blade
- **Reo, Aegis Knight** (Shield Knight): Hakō Wave, Shōryū Rising, Kōbō Aegis; ultimate Akatsuki Daybreak
- **Kage, Hooded Shadow** (Black Assassin, plus the Hooded Rogue Assassin VFX update for Shunpo Behind, Utsusemi Decoy and Senjin): Senbon Fan, Shunpo Behind, Utsusemi Decoy; ultimate Senjin Thousand Cuts
- **Homura, Ember Witch** (Fire Witch, free pack: idle only; her casting is drawn in code, her big spells use the pack's VFX update): Kaen Pillar, Homura Wave, Hōen Ward; ultimate Ryūsei Meteor
- **Gōkai, Drowned Admiral** (Tentaclebeard Admiral): Uzushio Maelstrom, Tsunami Wall, Barnacle Hide; ultimate Daikaishō Leviathan
- **Yomi, Faceless Reaper** (Faceless Void Reaper, plus its VFX update for Grave Hands and Yomi Gate): Yamigiri Crescent, Soul Snatch, Grave Hands; ultimate Yomi Gate
- **Kuma, Black Bear Bandit** (Black Bear Bandit): Grizzly Roar, Frenzy Claws, Hibernate; ultimate Ōkuma Rampage
- **Karasu, Plague Doctor** (Plague Doctor, free pack: idle, walk, jump, one lantern swing): Ekibyō Flask, Kurobane Swarm, Miasma Veil; ultimate Kokushibyō. Every missing move is built from the pack's own frames (see below)
- **Kamakiri, Void Mantis** (Void Mantis Pixel Art v1.0, free pack): Kamaitachi, Hanemai Dive, Kamae Snare; ultimate Kokū Harvest
- **Kurage, Abyssal Jelly** (Abyssal Jelly, free complete pack): Shiden Bolt, Abyssal Tether, Hakkō Pulse; ultimate Shinkai Gaze
- **Kemuri, Smoke Gauntlet** (Cyberpunk Street Assassin, free complete pack): Hibana Brand, Shimyaku Priming, Kurenai Smokescreen; ultimate Imawa Last Breath
- **Raika, Plasma Huntress** (Cyberpunk Sword Huntress, free complete pack): Shisen Seam Ripper, Jiryoku Polarity Lock, Gen'ei Mantle Decoy; ultimate Shūen Last Circuit
- **Ikazuchi, Amber Magister** (Lightning Academy Magister, free complete pack, with its VFX clips): Kohaku Charge Imprint, Kairo Circuit Relay, Raiun Stormcloak; ultimate Raimei Resonance Theorem
- **Amane, Sunwing Seraph** (Sanctuary Seraph, free complete pack): Nichirin Sunspoke Verdict, Habataki Wingbeat, Hane Featherbound Oath; ultimate Tenrin Unbroken Halo
- **Tsuno, Northern Packgoat** (Northern Pack Goat, free complete pack: idles, walks and a stride; every attack is built from those frames): Gakemichi Surefoot Leap, Kemonomichi Trail Charge, Fuyugomori Winter Coat; ultimate Ōnadare Mountain Stampede
- **Shirogane, Silver Paladin** (Female Hero Pixel Art v1.1 and its holy-spell update, free packs): Hōkō Holy Bolt, Tenchū Dawn Pillar, Kago Dawn Blessing; ultimate Shinpan Dawnpiercer Judgment
- **Rōga, Winter Chieftain** (Northern Gothic War Chieftain, free complete pack, with its VFX clips): Tōga Glacierfang Cleave, Fuyubure Frostfall Decree, Ōkami Wolfblood Oath; ultimate Tōkan Crown of Endless Winter
- **Mitsume, Recon Sentinel** (Quadrupedal Recon Drone, free complete pack, with its VFX clips): Shōjun Tri-Lens Lock, Denpa Signal Burst, Kansoku Sensor Calibration; ultimate Kanshi Surveillance Array
- **Jūki, Siege Walker** (Quadrupedal Combat Walker, free complete pack: idle, walk, two moves and a death; the rest is built from those frames): Atsuryoku Hydraulic Slam, Rōshin Reactor Charge, Teppeki Lowered Brace; ultimate Bakushin Reactor Overload
- **Shinku, Fallen Seraph** (Demonic Gothic Seraph, free complete pack, camera-facing only): Chishio Crimson Impale, Jōka Infernal Consecration, Tenraku Fallen Descent; ultimate Daraku Fallen Heaven
