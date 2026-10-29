# NEON FIST

A 2D side-view brawler that runs in the browser. Pick a hero, send your friend a link, and fight
on a stage with no railing at either end: empty their health or knock them off. Online play uses
GGPO-style **rollback netcode**, so it feels like you're in the same room.

- **Heroes (10):** Benika (war axe), Lysa (bow), Hyōga (ice hammer), Hyōshin (ice heart),
  Reo (sword and shield), Kage (daggers), Homura (fire magic), Gōkai (anchor and tides),
  Yomi (void scythe), Kuma (bear claws), each with a combo, dash, air and charged attacks, **3 skills and an ultimate** with a cut-in
- **Modes:** online room, versus CPU (3 levels), local versus (one keyboard or two gamepads),
  training with a sparring partner
- **Stages:** Lantern Harbor (sunset) and Neon Rooftop (midnight), painted parallax backdrops
- **Look:** pixel-art heroes and painted portraits from free packs by elie automata (see
  [docs/CHARACTERS.md](docs/CHARACTERS.md) and [CREDITS.md](CREDITS.md))
- **Phones:** on-screen stick and buttons on touch screens
- **Cost:** everything is free (open-source libraries, free hosting tiers)

Game design: [docs/GAME.md](docs/GAME.md). Architecture and netcode: [docs/PLAN.md](docs/PLAN.md).

## Run it

Needs Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev            # web on http://localhost:3000, lobby on :8787
```

Open http://localhost:3000. To test online play alone, create a room and open the invite link in a
second browser window (or another device on your Wi-Fi — use your computer's IP instead of localhost).

### Controls

| | Solo / online | Local P1 | Local P2 |
|---|---|---|---|
| Move · jump | `A` `D` or arrows (`W` / `↑` jumps too) | `A` `D` (`W` jumps) | arrows (`↑` jumps) |
| Attack · guard · jump | `J` · `K` · `L` (or Space) | `F` · `G` · `H` | `Num1` · `Num2` · `Num3` (or `,` `.` `/`) |
| Skills 1 · 2 · 3 | `U` · `I` · `O` | `R` · `T` · `Y` | `Num4` · `Num5` · `Num6` (or `K` `L` `;`) |
| Ultimate | `P` | `V` | `Num0` (or `'`) |

Skills also come out as chords: Attack+Guard, Attack+Jump, Guard+Jump; all three for the ultimate.
Double-tap to dash, hold Attack to charge. Gamepads: X attack, B guard, A jump, LB/RB/Y skills,
RT ultimate. In a fight: **Esc** pause · **F1** hitboxes · **F2** frame data · **F3** network ·
**F4** input display.

## Checks

```bash
pnpm typecheck && pnpm lint
pnpm test        # 72 tests: controls, skills, guard, rounds, determinism, netcode, lobby
pnpm synctest    # every hero pair, 10,000 frames, 8-frame rollback on every frame
pnpm balance     # CPU vs CPU win rates for every pair
pnpm soak        # 300 simulated bad networks (lag, jitter, loss, reordering) — must be 0 desyncs
pnpm build && pnpm e2e   # two real browsers fight online (WebRTC and relay)
```

Current results: synctest passes for all pairs; soak compares 1,718,067 frames with 0 mismatches;
e2e (6 tests) fights match frame-for-frame over both WebRTC and the relay.

## Deploy (free)

1. **Lobby → Cloudflare Workers** (free plan, Durable Objects with SQLite):
   ```bash
   cd apps/lobby
   pnpm exec wrangler login
   pnpm exec wrangler deploy
   # optional, for players behind strict networks (Cloudflare Realtime TURN, 1,000 GB/month free):
   pnpm exec wrangler secret put TURN_KEY_ID
   pnpm exec wrangler secret put TURN_KEY_API_TOKEN
   ```
   Check it: `pnpm lobby:smoke https://neon-fist-lobby.<your-subdomain>.workers.dev`
2. **Web → Vercel** (Hobby): import the repo, set the root directory to `apps/web`, and set
   `NEXT_PUBLIC_LOBBY_URL` to the Worker URL. Add a domain such as `neonfist.touchsimpledev.site`.

Both players must run the same build — the lobby compares a build id and asks the older tab to
refresh.

## Repository

```
apps/web        Next.js app — UI, three.js renderer, HUD, audio, online room flow
apps/lobby      room logic + Cloudflare Worker/Durable Object + Node dev server
packages/sim    deterministic simulation + hero data (integer math, plain data, zero dependencies)
packages/netcode rollback session, binary packets, WebRTC / relay / loopback links
packages/shared input bits, lobby + control protocol (zod), constants
tools           synctest, soak, balance, replay, lobby-smoke
e2e             Playwright tests
docs            GAME.md (game design), PLAN.md (architecture), CHARACTERS.md (make your own heroes)
```

Dev pages: `/dev/netsim` (feel rollback with simulated lag in one browser), `/dev/sandbox` (input test).
