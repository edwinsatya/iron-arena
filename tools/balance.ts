/**
 * CPU-vs-CPU balance check: plays many matches for every hero pair and prints win rates, how rounds
 * ended, and how often each skill was used. `pnpm balance [matches=20]`
 */
import { cpuBot, createInitialState, END, EV, PHASE, ROSTER, selectableCharacters, step } from '@neonfist/sim';

const matches = Number(process.argv[2] ?? 20);
const heroes = selectableCharacters().map((h) => h.id);
const ends = { ko: 0, ringOut: 0, time: 0, double: 0 };
const wins: Record<string, number> = {};
const played: Record<string, number> = {};
const events: Record<number, number> = {};
const vs: Record<string, number> = {};
/** Damage dealt per hero per action (what's carrying each hero). */
const dmg: Record<string, Record<string, number>> = {};
let frames = 0;
let rounds = 0;

for (const a of heroes) {
  for (const b of heroes) {
    for (let m = 0; m < matches; m++) {
      const s = createInitialState({
        seed: m * 97 + 5,
        fighters: [a, b],
        roundsToWin: 2,
        roundFrames: 3600,
        viewMirrored: [false, false],
      });
      const bots = [cpuBot(m * 13 + 1, { level: 2 }), cpuBot(m * 13 + 2, { level: 2 })];
      let lastPhase: number = s.phase;
      for (let f = 0; f < 60 * 60 * 6 && s.phase !== PHASE.MATCH_END; f++) {
        step(s, [bots[0]!(s, 0), bots[1]!(s, 1)]);
        for (const e of s.recentEvents) {
          if (e.frame !== s.frame) continue;
          events[e.type] = (events[e.type] ?? 0) + 1;
          if (e.type === EV.HIT) {
            const atk = s.fighters[1 - e.fighter]!;
            const h = ROSTER[atk.char]!;
            const act = atk.action >= 0 ? h.actions[atk.action]!.id : 'other';
            (dmg[h.id] ??= {})[act] = (dmg[h.id]![act] ?? 0) + e.value;
          }
        }
        if (s.phase === PHASE.KO && lastPhase === PHASE.FIGHT) {
          rounds++;
          if (s.endReason === END.KO) ends.ko++;
          else if (s.endReason === END.RING_OUT) ends.ringOut++;
          else if (s.endReason === END.TIME) ends.time++;
          else ends.double++;
        }
        lastPhase = s.phase;
        frames++;
      }
      played[a] = (played[a] ?? 0) + 1;
      played[b] = (played[b] ?? 0) + 1;
      if (s.matchWinner === 0) vs[`${a}>${b}`] = (vs[`${a}>${b}`] ?? 0) + 1;
      if (s.matchWinner === 1) vs[`${b}>${a}`] = (vs[`${b}>${a}`] ?? 0) + 1;
      if (s.matchWinner === 0) wins[a] = (wins[a] ?? 0) + 1;
      if (s.matchWinner === 1) wins[b] = (wins[b] ?? 0) + 1;
    }
  }
}

console.log(`rounds ${rounds}, avg round ${(frames / rounds / 60).toFixed(1)} s`);
console.log(
  `round endings: KO ${ends.ko}, ring-out ${ends.ringOut}, time ${ends.time}, double ${ends.double}`,
);
for (const h of heroes)
  console.log(`${h.padEnd(8)} win rate ${((100 * (wins[h] ?? 0)) / played[h]!).toFixed(0)}%`);
const name = Object.fromEntries(Object.entries(EV).map(([k, v]) => [v, k]));
console.log(
  'events per round:',
  Object.entries(events)
    .map(([k, v]) => `${name[Number(k)]} ${(v / rounds).toFixed(1)}`)
    .join(', '),
);

if (process.argv.includes('--detail')) {
  console.log('\nwins (row beat column):');
  console.log('         ' + heroes.map((h) => h.padEnd(8)).join(''));
  for (const a of heroes) console.log(a.padEnd(9) + heroes.map((b) => String(vs[`${a}>${b}`] ?? 0).padEnd(8)).join(''));
  console.log('\ndamage share by action:');
  for (const h of heroes) {
    const d = dmg[h] ?? {};
    const total = Object.values(d).reduce((x, y) => x + y, 0) || 1;
    console.log(
      `${h.padEnd(8)} ` +
        Object.entries(d)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 8)
          .map(([k, v]) => `${k} ${Math.round((100 * v) / total)}%`)
          .join(', '),
    );
  }
}
