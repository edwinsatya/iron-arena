# NEON FIST

A Tekken-style 1v1 3D fighting game that runs in the browser. Send your friend a link, pick a
fighter, and fight in real time — each of you in your own browser — with GGPO-style **rollback
netcode**.

- **Fighters:** Kaito Arashi "The Storm Prodigy" and Magnus Thorne "The Iron Mountain" — full move
  lists with frame data, strings, launchers and juggles, throws and breaks, armor, crush moves
- **Online:** peer-to-peer WebRTC, Cloudflare TURN, and a WebSocket relay as the last resort
- **Look:** anime / cel-shaded VRM characters on the Skyline Rooftop (make your own in VRoid Studio —
  see [docs/CHARACTERS.md](docs/CHARACTERS.md))
- **Modes:** online room, local versus (one keyboard or two gamepads), training with frame advantage
- **Cost:** everything here is free (open-source libraries, free hosting tiers)

The full design is in [docs/PLAN.md](docs/PLAN.md).

## Run it

Needs Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev            # web on http://localhost:3000, lobby on :8787
```

Open http://localhost:3000. To test online play alone, create a room and open the invite link in a
second browser window (or another device on your Wi-Fi — use your computer's IP instead of localhost).

### Controls

| | Player 1 / online | Player 2 (local) |
|---|---|---|
| Move · crouch · jump | `W` `A` `S` `D` (online: arrows too) | arrows |
| 1 left punch · 2 right punch | `U` · `I` | `Num 4` · `Num 5` (or `[` `]`) |
| 3 left kick · 4 right kick | `J` · `K` | `Num 1` · `Num 2` (or `;` `'`) |
| 1+2 · 3+4 shortcuts | `O` · `L` | `Num 6` · `Num 3` |

Gamepads work (standard mapping). In a fight: **F1** hitboxes · **F2** frame data · **F3** network
stats · **F4** input display.

## Checks

```bash
pnpm typecheck && pnpm lint
pnpm test        # 128 unit tests: frame data, guard rules, throws, rounds, combos, lobby
pnpm synctest    # every fighter pair, 10,000 frames, 8-frame rollback on every frame
pnpm soak        # 300 simulated bad networks (lag, jitter, loss, reordering) — must be 0 desyncs
pnpm build && pnpm e2e   # two real browsers fight online (WebRTC and relay)
```

Current results: synctest passes for all pairs; soak compares 1,718,067 frames with 0 mismatches;
e2e fights match frame-for-frame over both WebRTC and the relay.

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
packages/sim    deterministic simulation (integer math, plain data, zero dependencies)
packages/netcode rollback session, binary packets, WebRTC / relay / loopback links
packages/shared input bits, lobby + control protocol (zod), constants
tools           synctest, soak, replay, lobby-smoke
e2e             Playwright tests
docs            PLAN.md (design), CHARACTERS.md (make your own fighters)
```

Dev pages: `/dev/netsim` (feel rollback with simulated lag in one browser), `/dev/poses` (model vs.
mannequin poses), `/dev/sandbox` (input test).
