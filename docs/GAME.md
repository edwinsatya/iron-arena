# NEON FIST — game design (v3, side-view brawler)

> Since 29 Oct 2026 NEON FIST is a **2D side-view brawler** with pixel-art heroes: move left and
> right, jump, three action buttons, skills on button chords, and ring-outs off either end of the
> stage. It replaces the 3D arena version (v2). The architecture (deterministic sim, rollback
> netcode, lobby, WebRTC) is unchanged; the sim keeps everything on the z = 0 line.
> Hero sprites and art are free packs by elie automata (see CREDITS.md); names, skills, stages,
> effects and code are original.

## Match

- **1 vs 1**, online (rollback), local (one keyboard / two pads), versus CPU, training.
- **Best of 3 rounds**, 60 seconds each. A round ends by **K.O.** (health 0), **ring-out** (fall off
  either end of the stage) or **time** (more health left wins).
- The ultimate meter carries over between rounds; health, cooldowns and positions reset.

## Stages

A 16.4 m long floor with a drop at both ends. You can't walk off by yourself — only knockback
carries you over the edge. **Lantern Harbor** (sunset pier, harbour water below) and **Neon
Rooftop** (midnight, city lights far below). Backdrops are painted in code with parallax layers.

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
Guard+Jump = skill 3, all three = ultimate. Phones and tablets get an on-screen stick and buttons.

- **Double-tap** a direction to dash; attack during the dash for a dash attack.
- **Tap Attack** for the hero's combo (2–3 hits). **Hold Attack** to charge a guard-breaking attack.
- **Attack in the air** for an air attack.
- **Guard** blocks anything from the front. Skills chip 10% through guard. Ultimates are unblockable.

## Rules (numbers in `packages/sim/src/constants.ts`)

- Hits: flinch, knockback, launch (juggle), knockdown, stun (dizzy).
- Juggles: up to 7 air hits, each relaunch lower; then the victim drops out invulnerable.
- Damage scales down within a combo (100% → 40%).
- **Super armor** on some moves: take the hit (70% damage) without flinching.
- **Ultimate meter**: +110% of damage dealt, +70% of damage taken; 1000 to fire. Using it freezes
  the world for a 0.8 s cut-in with the hero's painted art.

## Heroes

| Hero | Role | HP | Skill 1 | Skill 2 | Skill 3 | Ultimate |
|---|---|---|---|---|---|---|
| **Benika** "Crimson Axemaiden" | Berserker (war axe) | 1040 | **Chiwari Shatter**: smash, the ground erupts ahead | **Tsumuji Whirl**: moving whirlwind, pulls then flings | **Otakebi War Cry**: blast away, +25% damage and speed | **Guren Judgment**: teleports in, crimson blades rain in her circle |
| **Lysa** "Windfeather Scout" | Archer (bow) | 980 | **Hayate Piercer**: piercing arrow | **Kazekiri Dash**: invulnerable dash-kick, launches | **Konoha Vortex**: vanishes backwards, leaves cutting leaves | **Takanome Volley**: marks the target, homing arrows, final rain |
| **Hyōga** "Glacierbreaker" | Guardian (ice hammer) | 1030 | **Hyōtsui Hammerfall**: hammer drop, ice spikes burst ahead | **Fubuki Cyclone**: pulling spin, leaves foes dizzy | **Hyōheki Bastion**: ice wall shove, 4 s armor, small heal | **Eikyū Permafrost**: the floor freezes over, then shatters |
| **Reo** "Aegis Knight" | Knight (sword and shield) | 1020 | **Hakō Wave**: piercing sword wave | **Shōryū Rising**: rising launcher | **Kōbō Aegis**: shield counter, unblockable riposte | **Akatsuki Daybreak**: teleports in, seven light cuts, pillar of dawn |

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
endings, a win matrix and each hero's damage by move. Last run (10 matches per pair, hard CPU):
Hyōga 61%, Benika 51%, Reo 51%, Lysa 36%. CPU play favours melee; tune with real players.
