/**
 * Re-simulate a desync report (downloaded from the "Out of sync" screen) in Node (PLAN §4.10).
 * Prints the checksum at the reported frame, compares it with both players' values, and shows
 * the state at that frame so you can see which field went wrong.
 *
 *   pnpm replay desync-1234.json
 */
import { readFileSync } from 'node:fs';
import { checksum, createInitialState, step, type SimConfig } from '@neonfist/sim';

interface Bundle {
  config: SimConfig;
  localPlayer: number;
  frame: number;
  localSum: number;
  remoteSum: number;
  inputs: [number[], number[]];
}

const file = process.argv[2];
if (!file) {
  console.error('usage: pnpm replay <desync-report.json>');
  process.exit(1);
}
const b = JSON.parse(readFileSync(file, 'utf8')) as Bundle;
const s = createInitialState(b.config);
for (let f = 0; f < b.frame; f++) step(s, [b.inputs[0][f] ?? 0, b.inputs[1][f] ?? 0]);
const sum = checksum(s);
console.log(`frame ${b.frame}: replay ${sum} · this player ${b.localSum} · other player ${b.remoteSum}`);
if (sum === b.localSum && sum !== b.remoteSum) console.log('This player matches the replay: the OTHER browser diverged.');
else if (sum === b.remoteSum && sum !== b.localSum) console.log('The other player matches the replay: THIS browser diverged.');
else if (sum !== b.localSum && sum !== b.remoteSum) console.log('Neither matches: the sim reads something outside GameState (check the determinism rules).');
else console.log('Both match the replay — the inputs logged may be incomplete.');
console.log(JSON.stringify({ phase: s.phase, timer: s.timer, fighters: s.fighters.map(({ inputRing: _r, ...f }) => f) }, null, 2));
