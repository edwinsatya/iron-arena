# Credits

Game design, code, stages, effects and hero names/skill names in NEON FIST are original. The arena-brawler conventions (three action buttons, skill chords, ring-outs) are shared genre mechanics, not anyone's assets.

## Character sprites and art — elie automata

All heroes are drawn with free character packs by **elie automata** ([itch.io](https://elie-automata.itch.io/)):

| Hero | Pack |
|---|---|
| Benika | Battle Axemaiden (free complete pack) |
| Lysa | Elven Bow Scout (free complete pack) |
| Hyōga | Glacierbreaker Knight (free complete pack) |
| Reo | Shield Knight (free pack) |
| Training dummy | Wasteland Juggernaut (free pack) |

Licence (from the packs): *Commercial and non-commercial use and modifications allowed. Credit "elie automata". Distribution within finished projects allowed. No standalone resale, sharing or redistribution of original or modified assets.*

So the raw zips stay out of git (`assets-src/sprites/` is ignored). `pnpm sprites` converts them into the game's sheets under `apps/web/public/sprites/`, which ship only as part of the game. Don't publish those files on their own.

## Code & libraries

- [Next.js](https://nextjs.org) / React (MIT)
- [sharp](https://sharp.pixelplumbing.com) (Apache-2.0), used by the sprite converter
- Rollback design follows [GGPO](https://github.com/pond3r/ggpo) (MIT) and Infil's [netcode explainer](https://words.infil.net/w02-netcode.html)

## Fonts

- [Dela Gothic One](https://fonts.google.com/specimen/Dela+Gothic+One) and [Zen Kaku Gothic New](https://fonts.google.com/specimen/Zen+Kaku+Gothic+New), SIL Open Font License, self-hosted via Fontsource

## Sound

All sound effects are generated in code with the Web Audio API. The announcer uses the browser's built-in speech synthesis.
