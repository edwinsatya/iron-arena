/**
 * Synctest (PLAN §10.2): for every fighter pair, play 10,000 frames of random inputs and roll back
 * 8 frames on EVERY frame, re-simulating and comparing checksums. Any mismatch is a determinism bug.
 *
 *   pnpm synctest            # all pairs, 10,000 frames
 *   pnpm synctest 2000 4     # frames, rollback depth
 */
import {
  checksum,
  cloneState,
  createInitialState,
  diffStates,
  randomBot,
  selectableCharacters,
  step,
} from '@neonfist/sim';
import type { GameState } from '@neonfist/sim';

const frames = Number(process.argv[2] ?? 10_000);
const depth = Number(process.argv[3] ?? 8);
const ids = [...selectableCharacters().map((c) => c.id), 'dummy'];

let failures = 0;
const t0 = performance.now();
for (const p1 of ids) {
  for (const p2 of ids) {
    const seed = p1.length * 31 + p2.length * 7;
    const s = createInitialState({
      seed,
      fighters: [p1, p2],
      roundsToWin: 3,
      roundFrames: 3600,
      viewMirrored: [false, true],
    });
    const bots = [randomBot(seed + 1), randomBot(seed + 2)];
    const inputs: [number, number][] = [];
    const history: (GameState | undefined)[] = [];
    let failedAt = -1;
    for (let f = 0; f < frames && failedAt < 0; f++) {
      inputs.push([bots[0]!(), bots[1]!()]);
      history.push(cloneState(s));
      step(s, inputs[f]!);
      const from = Math.max(0, f - depth + 1);
      const r = cloneState(history[from]!);
      for (let g = from; g <= f; g++) step(r, inputs[g]!);
      if (checksum(r) !== checksum(s)) {
        failedAt = f;
        console.error(`✗ ${p1} vs ${p2}: desync at frame ${f}`);
        for (const line of diffStates(s, r).slice(0, 10)) console.error(`    ${line}`);
      }
      if (f - depth - 2 >= 0) history[f - depth - 2] = undefined;
    }
    if (failedAt >= 0) failures++;
    else console.log(`✓ ${p1.padEnd(7)} vs ${p2.padEnd(7)} ${frames} frames, rollback ${depth} every frame`);
  }
}
console.log(
  `\n${failures === 0 ? 'SYNCTEST PASSED' : `SYNCTEST FAILED (${failures})`} in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
);
process.exit(failures === 0 ? 0 : 1);
