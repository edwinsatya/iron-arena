# NEON FIST — browser 3D fighting game (Tekken-style), 1v1 online with rollback netcode

Full plan: docs/PLAN.md. Before each task, read the sections of the plan that the task names.

## Layout
- packages/sim — deterministic game logic (pure TS, zero runtime deps). Rules: .claude/rules/sim-determinism.md
  - data/characters — Kaito Arashi, Magnus Thorne, training dummy (frame data, hitboxes, moves)
- packages/netcode — rollback session (GGPO-style), binary input packets, links: loopback, WebRTC, WebSocket relay
- packages/shared — input bits, lobby/control protocol (zod), constants (game title lives here)
- apps/web — Next.js app; game code in src/game (loop, input, render, hud, audio), online code in src/net
- apps/lobby — room logic shared by a Cloudflare Worker + Durable Object (prod) and a Node server (dev)
- tools — synctest, soak, replay, lobby-smoke CLIs

## Commands
pnpm dev · pnpm test · pnpm synctest · pnpm soak · pnpm e2e · pnpm typecheck · pnpm lint · pnpm build
pnpm check (typecheck + lint + test + synctest + soak) · pnpm lobby:smoke <url>

## Rules
- Rendering, audio and HUD only READ GameState. Nothing outside packages/sim mutates it.
- Gameplay numbers (frame data, hitboxes, movement) live in packages/sim/data, never in render code.
- After any sim change: pnpm test and pnpm synctest must pass before you say it's done.
- After any netcode change: pnpm soak must report 0 mismatches.
- New GameState/FighterState fields: update cloneState() and checksum() (a test checks every field).
- Pin exact dependency versions (especially three). Check three.js's official llms.txt docs instead of guessing APIs.
- All player-facing text is English. Original IP only: no names, characters, art, music or audio from existing games.
