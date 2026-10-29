# NEON FIST — browser 3D arena brawler, 1v1 online with rollback netcode

Game design: docs/GAME.md (current). Architecture and netcode: docs/PLAN.md (§2 game design there is the old fighter, superseded by GAME.md).

## Layout
- packages/sim — deterministic game logic (pure TS, zero runtime deps). Rules: .claude/rules/sim-determinism.md
  - data/heroes — Kaito, Magnus, Riko, Seren, training dummy (actions: strikes, projectiles, areas, skills, ultimates)
- packages/netcode — rollback session (GGPO-style), binary input packets, links: loopback, WebRTC, WebSocket relay
- packages/shared — input bits, lobby/control protocol (zod), constants (title, roster ids, stages)
- apps/web — Next.js app; game code in src/game (loop, input, render, hud, audio), UI in src/ui, online code in src/net
  - render/looks.ts — per-hero colours, weapon, accessory, animation style per action (render-only)
  - render/portraits.ts — HUD / select / skill-card portraits rendered from the 3D models
- apps/lobby — room logic shared by a Cloudflare Worker + Durable Object (prod) and a Node server (dev)
- tools — synctest, soak, balance, replay, lobby-smoke CLIs

## Commands
pnpm dev · pnpm test · pnpm synctest · pnpm soak · pnpm balance · pnpm e2e · pnpm typecheck · pnpm lint · pnpm build
pnpm check (typecheck + lint + test + synctest + soak) · pnpm lobby:smoke <url>

## Rules
- Rendering, audio and HUD only READ GameState. Nothing outside packages/sim mutates it.
- Gameplay numbers (damage, frames, hitboxes, cooldowns, movement) live in packages/sim/data and src/constants.ts, never in render code.
- After any sim change: pnpm test and pnpm synctest must pass before you say it's done; run pnpm balance after number changes.
- After any netcode change: pnpm soak must report 0 mismatches.
- GameState is plain data; cloneState() and checksum() walk it generically, so new fields are covered automatically — keep them integers.
- Pin exact dependency versions (especially three). Check three.js's official llms.txt docs instead of guessing APIs.
- Player-facing text is English. Hero and skill names may use romanized Japanese words (Shiden Rush, Kongō Body); decorative kana are fine.
- Original IP only: no names, characters, art, music or audio from existing games.
