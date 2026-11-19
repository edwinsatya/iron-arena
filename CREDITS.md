# Credits

Game design, code, stages, effects and hero names/skill names in IRON ARENA are original. The arena-brawler conventions (three action buttons, skill chords, ring-outs) are shared genre mechanics, not anyone's assets.

## Character sprites and art — elie automata

Every hero but Kamakiri and Shirogane is drawn with free character packs by **elie automata** ([itch.io](https://elie-automata.itch.io/)):

| Hero | Pack |
|---|---|
| Benika | Battle Axemaiden (free complete pack) |
| Lysa | Elven Bow Scout (free complete pack) |
| Hyōga | Glacierbreaker Knight (free complete pack) |
| Hyōshin | Glacial Heart (free complete pack) and its free VFX update |
| Akari | Young Swordswoman (free complete pack) |
| Reo | Shield Knight (free pack) |
| Kage | Black Assassin (free pack) and the Hooded Rogue Assassin free VFX update |
| Homura | Fire Witch (free pack) and its free VFX update |
| Gōkai | Tentaclebeard Admiral (free pack) |
| Yomi | Faceless Void Reaper (free pack) and its free VFX update |
| Kuma | Black Bear Bandit (free pack) |
| Karasu | Plague Doctor (free pack; missing moves built from its frames) |
| Kurage | Abyssal Jelly (free complete pack) |
| Kemuri | Cyberpunk Street Assassin (free complete pack) |
| Raika | Cyberpunk Sword Huntress (free complete pack) |
| Ikazuchi | Lightning Academy Magister (free complete pack, with its VFX clips) |
| Amane | Sanctuary Seraph (free complete pack) |
| Tsuno | Northern Pack Goat (free complete pack; every attack built from its frames) |
| Rōga | Northern Gothic War Chieftain (free complete pack, with its VFX clips) |
| Mitsume | Quadrupedal Recon Drone (free complete pack, with its VFX clips) |
| Jūki | Quadrupedal Combat Walker (free complete pack; jump, guard, flinch and quick stomps built from its frames) |
| Shinku | Demonic Gothic Seraph (free complete pack; camera-facing only, its beam of light reused for the skills' pillars) |
| Training dummy | Wasteland Juggernaut (free pack) |

Licence (from the packs): *Commercial and non-commercial use and modifications allowed. Credit "elie automata". Distribution within finished projects allowed. No standalone resale, sharing or redistribution of original or modified assets.*

So the raw zips stay out of git (`assets-src/sprites/` is ignored). `pnpm sprites` converts them into the game's sheets under `apps/web/public/sprites/`, which ship only as part of the game. Don't publish those files on their own.

## Kamakiri — Void Mantis Pixel Art

Kamakiri is drawn with the free **Void Mantis Pixel Art (v1.0)** pack; its readme names no author.
Its licence: *Free for personal and commercial projects. Do not resell or redistribute as a game asset. Credit is appreciated but not required. Modify as needed. No NFT use.* The missing moves are built from its frames, and the raw zip stays out of git like the others.

## Shirogane — Female Hero Pixel Art

Shirogane is drawn with the free **Female Hero Pixel Art (v1.1)** pack and its free *Female Hero — New Animations*
update (Basic Holy Spell Cast, Dawnpiercer Judgment); their readmes name no author. Their licence is the same as
Void Mantis's: *Free for personal and commercial projects. Do not resell or redistribute as a game asset. Credit is
appreciated but not required. Modify as needed. No NFT use.* The raw zips stay out of git.

## Code & libraries

- [Next.js](https://nextjs.org) / React (MIT)
- [sharp](https://sharp.pixelplumbing.com) (Apache-2.0), used by the sprite converter
- Rollback design follows [GGPO](https://github.com/pond3r/ggpo) (MIT) and Infil's [netcode explainer](https://words.infil.net/w02-netcode.html)

## Fonts

- [Grenze](https://fonts.google.com/specimen/Grenze), [Alegreya Sans](https://fonts.google.com/specimen/Alegreya+Sans) and [Shippori Mincho B1](https://fonts.google.com/specimen/Shippori+Mincho+B1), SIL Open Font License, self-hosted via Fontsource

## Sound

All sound effects are generated in code with the Web Audio API. The announcer uses the browser's built-in speech synthesis.
