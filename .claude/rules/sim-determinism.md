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
- Input tracking (press ages, double taps, the input buffer) lives in FighterState.
- Resolve hits in two phases: collect contacts for both fighters, then apply.
- cloneState() and checksum() walk GameState generically, so new fields are covered — keep them integers
  (a test checks every number in the state is an integer) and run the synctest.
- Projectiles and areas refer to their specs by (hero, action, index); never store objects or functions in the state.
- step(state, inputs) advances exactly one frame and depends on nothing else.
