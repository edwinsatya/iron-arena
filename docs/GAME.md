# IRON ARENA — game design (v3, side-view brawler)

> Since 29 Oct 2026 IRON ARENA (first called NEON FIST) is a **2D side-view brawler** with pixel-art heroes: move left and
> right, jump and double jump, three action buttons, skills on button chords, and walls at both
> ends of the stage. It replaces the 3D arena version (v2). The architecture (deterministic sim, rollback
> netcode, lobby, WebRTC) is unchanged; the sim keeps everything on the z = 0 line.
> Hero sprites and art are free packs by elie automata (see CREDITS.md); names, skills, stages,
> effects and code are original.

## Match

- **1 vs 1**, online (rollback), local (one keyboard / two pads), versus CPU, training.
- **Best of 3 rounds**, 60 seconds each. A round ends by **K.O.** (health 0) or **time** (more
  health left wins). There are no ring-outs.
- The ultimate meter carries over between rounds; health, cooldowns and positions reset.

## Stages

A 16.4 m long floor with a **wall at each end**: nobody leaves the stage. A hard knockback into a
wall bounces the victim back off it (WALL!), open for a follow-up; projectiles break on the walls.
Jumping: hold Jump for a full jump, tap it for a short hop, press it again in the air for a
**double jump** (one per jump, refreshed on landing). The double jump always goes the full height,
a quarter higher than the first jump (`AIR_JUMP_PCT`), however briefly it is tapped.
**Lantern Harbor** (sunset pier, stone walls) and **Neon Rooftop** (midnight, neon-lit barriers). Backdrops are painted in code with parallax layers.

## Controls

| | Keyboard (solo / online) | Local P1 | Local P2 | Gamepad |
|---|---|---|---|---|
| Move | A D or ← → | A D | ← → | stick / d-pad |
| Jump | L, Space, W or ↑ | H or W | Num3, / or ↑ | A |
| Attack | J | F | Num1 or , | X |
| Guard | K | G | Num2 or . | B / LT |
| Skill 1 / 2 / 3 | U / I / O | R / T / Y | Num4–6 or K L ; | LB / RB / Y |
| Ultimate | P | V | Num0 or ' | RT |

**Chords** (pressed within 4 frames): Attack+Guard = skill 1, Attack+Jump = skill 2,
Guard+Jump = skill 3, all three = ultimate.

**Phones and tablets** play sideways, laid out like a mobile action RPG (`src/game/hud/touchPad.ts`):
a floating stick wherever the left thumb lands (left and right only), and under the right thumb a
big Attack button ringed by Jump, Dash, Guard, the three skills (their art, cooldown sweep and
seconds) and the ultimate (its charge round the rim, glowing when ready). The Dash button plays a
double tap toward the stick, or the way the hero faces. A phone held upright gets the match turned
sideways by CSS, so it works with the rotation lock on; starting a fight asks for full screen and
locks the screen sideways where the browser allows it (Android).

- **Double-tap** a direction to dash; attack during the dash for a dash attack.
- **Tap Attack** for the hero's combo (2–3 hits). **Hold Attack** to charge a guard-breaking attack.
- **Attack in the air** for an air attack.
- **Guard** blocks anything from the front. Skills chip 10% through guard. Ultimates are unblockable.

## Rules (numbers in `packages/sim/src/constants.ts`)

- Hits: flinch, knockback, launch (juggle), knockdown, stun (dizzy).
- **Wake-up protection**: getting up after a knockdown gives 0.75 s (`WAKEUP_INVULN`) in which
  nothing can hit you; the fighter blinks. Attacking or using a skill ends it early. The CPU keeps
  its skills and ultimate for when it can land them.
- Juggles: up to 7 air hits, each relaunch lower; then the victim drops out invulnerable.
- Damage scales down within a combo (100% → 40%).
- **Super armor** on some moves: take the hit (70% damage) without flinching.
- **Ultimate meter**: +110% of damage dealt, +70% of damage taken; 1000 to fire. Using it freezes
  the world for a 0.8 s cut-in with the hero's painted art.

## Heroes

| Hero | Role | HP | Skill 1 | Skill 2 | Skill 3 | Ultimate |
|---|---|---|---|---|---|---|
| **Benika** "Crimson Axemaiden" | Berserker (war axe) | 960 | **Chiwari Shatter**: smash, the ground erupts ahead | **Tsumuji Whirl**: moving whirlwind, pulls then flings | **Otakebi War Cry**: blast away, +25% damage and speed | **Guren Judgment**: teleports in, crimson blades rain in her circle |
| **Lysa** "Windfeather Scout" | Archer (bow) | 1010 | **Hayate Piercer**: piercing arrow | **Kazekiri Dash**: invulnerable dash-kick, launches | **Konoha Vortex**: vanishes backwards, leaves cutting leaves | **Takanome Volley**: marks the target, homing arrows, final rain |
| **Hyōga** "Glacierbreaker" | Guardian (ice hammer) | 990 | **Hyōtsui Hammerfall**: hammer drop, ice spikes burst ahead | **Fubuki Cyclone**: pulling spin, leaves foes dizzy | **Hyōheki Bastion**: ice wall shove, 4 s armor, small heal | **Eikyū Permafrost**: the floor freezes over, then shatters |
| **Hyōshin** "Glacial Heart" | Mage (ice) | 1040 | **Hyōsō Bolt**: piercing bolt that freezes in place | **Frost Barrier**: repelling ice sphere, then armour | **Death Shatter**: bursts into cutting shards, re-forms far away | **Absolute Zero**: teleports in, blizzard vortex drags everything in |
| **Akari** "Dawn Blade" | Knight (sword) | 940 | **Shōten Rising**: rising launcher that jumps after them | **Senkō Flash**: invulnerable dash-through cut that stuns | **Kabuto-wari**: armoured guard-breaking overhead | **Reimei Sky Blade**: chant, then a blade of light falls from the sky |
| **Reo** "Aegis Knight" | Knight (sword and shield) | 980 | **Hakō Wave**: piercing sword wave | **Shōryū Rising**: rising launcher | **Kōbō Aegis**: shield counter, unblockable riposte | **Akatsuki Daybreak**: teleports in, seven light cuts, pillar of dawn |
| **Kage** "Hooded Shadow" | Assassin (daggers) | 1000 | **Senbon Fan**: three kunai | **Shunpo Behind**: blink behind, stunning cut | **Utsusemi Decoy**: smoke counter, unblockable strike from behind | **Senjin Thousand Cuts**: teleports in, cuts from every side |
| **Homura** "Ember Witch" | Mage (fire) | 1000 | **Kaen Pillar**: fire pillar under the enemy | **Homura Wave**: rolling wall of flame | **Hōen Ward**: flame burst pushes away, +20% damage | **Ryūsei Meteor**: meteors track the enemy, then the big one |
| **Gōkai** "Drowned Admiral" | Guardian (anchor) | 910 | **Uzushio Maelstrom**: whirlpool under the enemy pulls them in | **Tsunami Wall**: rolling wave | **Barnacle Hide**: armour and a heal | **Daikaishō Leviathan**: tentacles rise around the enemy |
| **Yomi** "Faceless Reaper" | Knight (scythe) | 1060 | **Yamigiri Crescent**: piercing void crescent | **Soul Snatch**: long hook pulls the enemy in, stunned | **Grave Hands**: hands burst up under the enemy | **Yomi Gate**: teleports in, the underworld opens |
| **Kuma** "Black Bear Bandit" | Berserker (claws) | 920 | **Grizzly Roar**: knock back and daze | **Frenzy Claws**: charging flurry with armour | **Hibernate**: heal, then armour | **Ōkuma Rampage**: pounce, maul, ground-shaking finish |
| **Karasu** "Plague Doctor" | Mage (lantern) | 1040 | **Ekibyō Flask**: lobbed flask bursts into a poison cloud | **Kurobane Swarm**: crows pour from the lantern and hunt the enemy | **Miasma Veil**: poison burst, scatters into crows and re-forms further back | **Kokushibyō**: a storm of plague and crows, then a pillar of green fire |
| **Kamakiri** "Void Mantis" | Assassin (scythe forelegs) | 1040 | **Kamaitachi**: two crescents of wind, one from each scythe | **Hanemai Dive**: leaps, blinks through the void above the enemy and dives | **Kamae Snare**: the forelegs snap shut — a grab through guard, two cuts and a kick | **Kokū Harvest**: a storm of void crescents, then one last cut |
| **Kurage** "Abyssal Jelly" | Mage (stinging tentacles; takes 14% less damage) | 1100 | **Shiden Bolt**: piercing bolt of purple lightning | **Abyssal Tether**: a tentacle lashes across the stage, drags the enemy in and stings again | **Hakkō Pulse**: the bell flares, a ring of light that leaves anyone close reeling | **Shinkai Gaze**: the deep swallows the stage, lightning stings, the great eye bursts |

Every hero also has a dash attack, an air attack and a charged attack. The in-game *Heroes &
controls* page is generated from the data.

**Adding a hero:** see [CHARACTERS.md](CHARACTERS.md) (sprite pack → `pnpm sprites` → hero data →
`looks.ts` animation map). Run `pnpm test`, `pnpm synctest` and `pnpm balance`.

## Presentation

- Canvas 2D renderer (`apps/web/src/game/render2d`): painted parallax backdrop, perspective floor,
  pixel-crisp sprites, afterimages, guard barriers, auras, hit flash and shake, projectiles,
  telegraphed ground areas, cut-in speed lines. Effects are driven by rollback-safe events.
- Camera: follows the midpoint and zooms with distance; close-up during the ultimate cut-in;
  follows the winner at the end of a round. Online P2 can see the stage mirrored (always on the left).
- Animation frames are chosen from the sim state only; each attack's contact frame is warped onto
  the action's impact frame so what you see matches the hitbox.
- HUD: painted portraits, segmented health, ultimate meter, round pips, timer, skill cards from the
  packs with cooldown sweeps and key labels, combo counter, cut-in banner.

## Balance

`pnpm balance [matches] [--detail]` plays CPU-vs-CPU for every pair and prints win rates, round
endings, a win matrix and each hero's damage by move. Last run (20 matches per pair, hard CPU, with
wake-up protection): Hyōshin 76%, Kage 68%, Lysa 64%, Karasu 57%, Homura 55%, Reo 54%,
Benika 48%, Hyōga 48%, Kamakiri 46%, Kurage 42%, Gōkai 37%, Kuma 36%, Akari 35%, Yomi 33%.
Tune with real players.
The CPU keeps its distance only with heroes whose basic attack is a shot.
