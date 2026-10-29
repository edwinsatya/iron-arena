/**
 * Netcode soak (PLAN §10.3): two rollback sessions over a simulated lossy, jittery, reordering
 * network, compared frame by frame with a reference run. Requirement: 0 mismatches.
 *
 *   pnpm soak           # 300 random networks
 *   pnpm soak 50        # fewer
 */
import { checksum, cloneState, createInitialState, randomBot, step } from '@neonfist/sim';
import { randomConfig, runNet, type NetCfg } from '../packages/netcode/test/harness';

const count = Number(process.argv[2] ?? 300);
const sim = { step, clone: cloneState, checksum };
const initial = () =>
  createInitialState({
    seed: 99,
    fighters: ['reo', 'hyoga'],
    roundsToWin: 3,
    roundFrames: 3600,
    viewMirrored: [false, true],
  });

const named: [string, NetCfg][] = [
  [
    'LAN (0 ms)',
    { latency: 0, jitter: 0, loss: 0, delay: [2, 2], lateStart: 0, maxRollback: 8, ticks: 6000, seed: 1 },
  ],
  [
    '33 ms one-way, 0% loss',
    { latency: 2, jitter: 0, loss: 0, delay: [2, 2], lateStart: 0, maxRollback: 8, ticks: 6000, seed: 2 },
  ],
  [
    '50–83 ms one-way, 5% loss',
    { latency: 3, jitter: 2, loss: 0.05, delay: [2, 2], lateStart: 0, maxRollback: 8, ticks: 6000, seed: 3 },
  ],
  [
    '83–133 ms one-way, 10% loss',
    { latency: 5, jitter: 3, loss: 0.1, delay: [2, 2], lateStart: 0, maxRollback: 8, ticks: 6000, seed: 4 },
  ],
  [
    '133–200 ms one-way, 20% loss',
    { latency: 8, jitter: 4, loss: 0.2, delay: [3, 1], lateStart: 0, maxRollback: 8, ticks: 6000, seed: 5 },
  ],
  [
    'P2 starts 20 ticks late',
    { latency: 2, jitter: 1, loss: 0.02, delay: [2, 2], lateStart: 20, maxRollback: 8, ticks: 6000, seed: 6 },
  ],
];

const t0 = performance.now();
let ok = true;
for (const [name, cfg] of named) {
  const r = runNet(sim, initial, randomBot, cfg);
  const s = r.stats[0]!;
  const avg = s.rollbacks ? (s.resimFrames / s.rollbacks).toFixed(1) : '0';
  console.log(
    `${name.padEnd(32)} compared=${String(r.compared).padStart(6)} mismatches=${r.mismatches}  ` +
      `rollbacks avg ${avg} max ${s.maxRollback}  stalls ${s.stalls}/${r.stats[1]!.stalls}`,
  );
  if (r.mismatches) ok = false;
}
let compared = 0;
let mismatches = 0;
for (let i = 0; i < count; i++) {
  const r = runNet(sim, initial, randomBot, randomConfig(i));
  compared += r.compared;
  mismatches += r.mismatches;
}
console.log(
  `\n${count} random networks: ${compared.toLocaleString()} confirmed frames compared, mismatches = ${mismatches}`,
);
if (mismatches) ok = false;
console.log(`${ok ? 'SOAK PASSED' : 'SOAK FAILED'} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(ok ? 0 : 1);
