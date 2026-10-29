# NEON FIST — game design (v2, arena brawler)

> Since 29 Oct 2026 NEON FIST is a **3D arena brawler** in the spirit of classic online hero brawlers:
> free movement on a round rooftop, three action buttons, skills on button chords, and ring-outs.
> It replaces the Tekken-style 2D-plane fighter in PLAN §2. The architecture (deterministic sim,
> rollback netcode, lobby, WebRTC) is unchanged. Everything here is original: names, heroes, art.

## Match

- **1 vs 1**, online (rollback), local (one keyboard / two pads), versus CPU, training.
- **Best of 3 rounds**, 60 seconds each. A round ends by **K.O.** (health 0), **ring-out** (fall off
  the roof) or **time** (more health left wins).
- The ultimate meter carries over between rounds; health, cooldowns and positions reset.

## Arena: Skyline Rooftop

A round helipad, 8.2 m radius, on top of a skyscraper. No railing. You can't walk off by yourself —
only knockback carries you over the edge. Two looks: **golden hour** and **midnight** (same rules).

## Controls

| | Keyboard (solo / online) | Local P1 | Local P2 | Gamepad |
|---|---|---|---|---|
| Move (8 directions) | WASD or arrows | WASD | arrows | stick / d-pad |
| Attack | J | F | Num1 or , | X |
| Guard | K | G | Num2 or . | B / LT |
| Jump | L or Space | H | Num3 or / | A |
| Skill 1 / 2 / 3 | U / I / O | R / T / Y | Num4–6 or K L ; | LB / RB / Y |
| Ultimate | P | V | Num0 or ' | RT |

**Chords** (pressed within 4 frames): Attack+Guard = skill 1, Attack+Jump = skill 2,
Guard+Jump = skill 3, all three = ultimate. A chord started with Attack upgrades the first strike
into the skill, so there is no input lag. Phones and tablets get an on-screen stick and buttons.

- **Double-tap** a direction to dash; attack during the dash for a dash attack.
- **Tap Attack** for the hero's combo (3–4 hits). **Hold Attack** through the first strike to
  charge; release when it flashes for a guard-breaking charged attack.
- **Attack in the air** for an air attack.
- **Guard** blocks anything from the front (180°). Skills chip 10% through guard. Charged attacks
  break guard (long stagger). Grabs and ultimates are unblockable.

## Rules (all numbers in `packages/sim/src/constants.ts`)

- Hits: flinch (hitstun), knockback, launch (juggle), knockdown, stun (dizzy), grab.
- Juggles: up to 7 air hits, each relaunch lower; then the victim drops out invulnerable.
- Damage scales down within a combo (100% → 40%).
- Downed heroes are invulnerable while down and getting up.
- **Super armor** (some moves, Magnus's buff): take the hit (70% damage) without flinching.
- **Ultimate meter**: +110% of damage dealt, +70% of damage taken; 1000 to fire. Using it freezes
  the world for a 0.8 s cut-in.
- Cooldowns: 6–15 s per skill.

## Heroes

| Hero | Role | HP | Basic | Skill 1 | Skill 2 | Skill 3 | Ultimate |
|---|---|---|---|---|---|---|---|
| **Kaito Arashi** "Stormblade" | Swordsman (katana) | 1000 | 4-hit slash, launcher finisher | **Shiden Rush** — lightning dash-cut, stuns | **Tsumuji Cyclone** — moving whirlwind, pulls then launches | **Kagerō Counter** — counter stance, teleports behind and strikes | **Raijin Kōrin** — teleports in, blade flurry, thunder strike |
| **Magnus Thorne** "Iron Mountain" | Brawler (gauntlets) | 1060 | 3-hit jab/hook/uppercut, armored | **Iwakudaki Rush** — armored charge, huge knockback (ring-outs) | **Jishin Stomp** — leap and ground-pound shockwave | **Kongō Body** — 4 s super armor, +10% damage, small heal | **Titan Meteor** — grab, rise, meteor slam |
| **Riko Kanzaki** "Crossfire" | Gunner (twin pistols) | 1000 | 4 quick shots + twin burst | **Hanabi Spread** — 5-shot fan, knockback | **Tonbo Flip** — invulnerable backflip, leaves a grenade | **Raimei Mine** — proximity mine that stuns | **Senkō Barrage** — bullet rain on the target, final blast |
| **Seren Mikazuki** "Moon Oracle" | Mage (staff) | 930 | 2 moon orbs + 3-orb spread | **Kitsunebi** — three homing fox-fires | **Hyōketsu Circle** — frost seal under the target, freezes | **Tsukikage Blink** — teleport, the old spot explodes | **Mangetsu Fall** — freezes the target, then a moon falls |

Every hero also has a dash attack, an air attack and a charged attack. The in-game *Heroes &
controls* page is generated from the data, so it is always current.

**Adding a hero:** copy a file in `packages/sim/data/heroes/`, add it to `ROSTER` in
`packages/sim/src/roster.ts` and to `SELECTABLE_FIGHTERS` in `packages/shared`, give it a look in
`apps/web/src/game/render/looks.ts` (colours, weapon, animation style per action) and a model in
`apps/web/public/models/manifest.json`. Run `pnpm test`, `pnpm synctest` and `pnpm balance`.

## Presentation

- Camera: three-quarter view over the two heroes, zooming with their distance; close-up during
  the ultimate cut-in; follows the winner at the end of a round.
- Heroes: anime VRM models posed procedurally from the sim (no clips), with procedural weapons and
  accessories. Portraits for the HUD, select screen and skill cards are rendered from the same
  models at runtime (`render/portraits.ts`); hand-drawn art can replace them (see CHARACTERS.md).
- Effects: weapon trails, hit sparks, damage numbers, projectile meshes, telegraphed ground circles,
  falling moon, lightning, auras, screen shake and flash — all driven by rollback-safe events.
- HUD: portraits, segmented health with trailing damage, ultimate meter, round pips, timer,
  skill cards with cooldown sweeps and key labels, combo counter, cut-in banner.

## Balance

`pnpm balance [matches]` plays CPU-vs-CPU for every pair and prints win rates, round endings and
event counts. Last run (16 matches per pair, hard CPU): Kaito 61%, Magnus 59%, Seren 48%, Riko 31%;
84% of rounds end by K.O., 12% by ring-out, average round 31 s. CPU play favours melee; tune with
real players.
