import { RollbackSession, type SimAdapter } from '../src/session';

export function makeRng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NetCfg {
  /** One-way delay and jitter in ticks, loss 0..1. */
  latency: number;
  jitter: number;
  loss: number;
  /** Input delay per player, P2 start offset in ticks. */
  delay: [number, number];
  lateStart: number;
  maxRollback: number;
  ticks: number;
  seed: number;
  /** Packets from a different epoch are injected to prove they are ignored. */
  strayEpochPackets?: boolean;
}

/**
 * Two sessions over a fake lossy, jittery, reordering network, compared frame by frame with a
 * reference run that knows every input (PLAN Appendix C.4).
 */
export function runNet<S>(
  sim: SimAdapter<S>,
  initial: () => S,
  makeBot: (seed: number) => () => number,
  cfg: NetCfg,
) {
  const rng = makeRng(cfg.seed);
  const queue: { at: number; to: 0 | 1; buf: ArrayBuffer }[] = [];
  const confirmed = [new Map<number, number>(), new Map<number, number>()];
  let tick = 0;
  const peers = ([0, 1] as const).map(
    (p) =>
      new RollbackSession<S>({
        localPlayer: p,
        inputDelay: cfg.delay[p],
        maxRollback: cfg.maxRollback,
        initialState: initial(),
        sim,
        epoch: 7,
        onConfirmedFrame: (f, sum) => confirmed[p]!.set(f, sum),
        send: (buf) => {
          if (rng() < cfg.loss) return;
          const at = tick + cfg.latency + Math.floor(rng() * (cfg.jitter + 1));
          queue.push({ at, to: p === 0 ? 1 : 0, buf });
          if (cfg.strayEpochPackets && rng() < 0.05) {
            const stray = buf.slice(0);
            new DataView(stray).setUint8(1, 6); // previous match
            new DataView(stray).setUint16(16, 0xff, true); // garbage input
            queue.push({ at, to: p === 0 ? 1 : 0, buf: stray });
          }
        },
      }),
  );
  const bots = [makeBot(cfg.seed * 7 + 1), makeBot(cfg.seed * 7 + 2)];
  for (tick = 0; tick < cfg.ticks; tick++) {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i]!.at <= tick) peers[queue[i]!.to]!.onPacket(queue.splice(i, 1)[0]!.buf);
    }
    peers[0]!.tick(bots[0]!());
    if (tick >= cfg.lateStart) peers[1]!.tick(bots[1]!());
  }
  const n = Math.min(peers[0]!.localLog.length, peers[1]!.localLog.length);
  const ref = initial();
  const refSums: number[] = [];
  for (let f = 0; f < n; f++) {
    refSums.push(sim.checksum(ref));
    sim.step(ref, [peers[0]!.localLog[f]!, peers[1]!.localLog[f]!]);
  }
  let compared = 0;
  let mismatches = 0;
  for (const m of confirmed) {
    for (const [f, sum] of m) {
      if (f < n) {
        compared++;
        if (refSums[f] !== sum) mismatches++;
      }
    }
  }
  return { compared, mismatches, stats: peers.map((p) => p.stats), frames: peers.map((p) => p.frame) };
}

/** The random network configurations behind the PLAN §4.5 results. */
export function randomConfig(i: number, ticks = 3000): NetCfg {
  const r = makeRng(1000 + i);
  return {
    latency: Math.floor(r() * 10),
    jitter: Math.floor(r() * 5),
    loss: r() * 0.25,
    delay: [Math.floor(r() * 4), Math.floor(r() * 4)],
    lateStart: Math.floor(r() * 30),
    maxRollback: 6 + Math.floor(r() * 5),
    ticks,
    seed: 5000 + i,
  };
}
