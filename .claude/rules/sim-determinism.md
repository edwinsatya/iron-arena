---
paths:
  - "packages/sim/**/*.ts"
  - "packages/netcode/**/*.ts"
---
# Determinism rules (rollback netcode depends on these)
- Integer math only: mm, mm/frame, integer percent, Math.trunc for division.
- No Math.sin/cos/atan2/pow/exp/sqrt in the sim. Use isqrt() and integer direction vectors (×1024).
- No Math.random, Date, performance.now, timers, DOM, three, or network calls in the sim (ESLint enforces it).
- Randomness only via rand(state, n); the PRNG state lives in GameState.
- GameState is plain data: numbers, arrays, plain objects. No Maps, Sets, classes, closures.
- Input history for command parsing lives in FighterState (inputRing, buffer fields).
- Resolve hits in two phases: collect contacts for both fighters, then apply.
- When you add a field to GameState or FighterState, update cloneState(), checksum() and run the tests:
  the checksum-coverage test and the synctest catch anything you miss.
- step(state, inputs) advances exactly one frame and depends on nothing else.
