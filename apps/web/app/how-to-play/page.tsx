import { selectableCharacters } from '@neonfist/sim';
import Link from 'next/link';
import { Controls } from '../../src/ui/Controls';

export const metadata = { title: 'How to play — NEON FIST' };

function fmt(v: number | string): string {
  if (typeof v === 'string') return v === 'launch' ? 'Launch' : v === 'knockdown' ? 'Knockdown' : v === 'wallSplat' ? 'Knockdown' : v;
  return v > 0 ? `+${v}` : String(v);
}

/** Move lists generated from the simulation data, so they can't go out of date. */
export default function HowToPlay() {
  return (
    <main className="screen">
      <div className="screen-head">
        <h1 className="screen-title display">How to play</h1>
        <Link className="back" href="/">
          Back
        </Link>
      </div>
      <div className="prose">
        <p>
          Four buttons, one per limb: <span className="kbd">1</span> left punch, <span className="kbd">2</span> right punch,{' '}
          <span className="kbd">3</span> left kick, <span className="kbd">4</span> right kick. Directions are relative to your
          opponent: <b>f</b> is toward them, <b>b</b> away, <b>d</b> down.
        </p>
        <Controls />
        <h2>The basics</h2>
        <p>
          Stand still or hold back to guard highs and mids. Hold down-back to guard lows — highs will miss you, but mids hit. Throws
          (<span className="kbd">1+3</span>, <span className="kbd">2+4</span>) beat guarding; break them with the button shown in the
          move list. Tap forward twice to dash, back twice to backdash.
        </p>
        <p>
          Every move has frame data. A move that is −10 or worse on block can be punished by a jab. Launchers send your opponent into
          the air for a juggle combo — try the starter combo for your fighter.
        </p>
      </div>
      {selectableCharacters().map((c) => (
        <section key={c.id}>
          <h2 className="display" style={{ fontSize: '2.4rem', margin: '40px 0 0' }}>
            {c.name}
          </h2>
          <p className="muted" style={{ marginTop: 4 }}>
            {c.title} · {c.style}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="movelist">
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Move</th>
                  <th>Hits</th>
                  <th>Startup</th>
                  <th>Block</th>
                  <th>Hit</th>
                  <th>Damage</th>
                </tr>
              </thead>
              <tbody>
                {c.moves
                  .filter((m) => m.command)
                  .map((m) => {
                    const follow = m.cancels?.[0];
                    const followMove = follow ? c.moves.find((x) => x.id === follow.into) : null;
                    return (
                      <tr key={m.id}>
                        <td>
                          {m.command}
                          {followMove ? `,${follow!.input}` : ''}
                        </td>
                        <td>
                          {m.name}
                          {followMove ? ` → ${followMove.name}` : ''}
                          {m.cmd?.motion === 2 ? <span className="muted"> (needs sidestep — coming soon)</span> : null}
                        </td>
                        <td>
                          <span className={`tag ${m.height}`}>{m.height}</span>
                        </td>
                        <td>i{m.startup}</td>
                        <td>{m.height === 'throw' ? '—' : fmt(m.onBlock)}</td>
                        <td>{m.height === 'throw' ? `break with ${m.throw!.breakButtons === 48 ? '1+2' : m.throw!.breakButtons === 16 ? '1' : '2'}` : fmt(m.onHit)}</td>
                        <td>
                          {m.damage}
                          {followMove ? `, ${followMove.damage}` : ''}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p>
            <b>Starter combo:</b>{' '}
            {c.id === 'kaito' ? 'df+2 → 1 → 1,2 → f,f+3 (42 damage)' : 'df+2 → 1 → 2 → f,f+2 (51 damage)'}
          </p>
        </section>
      ))}
    </main>
  );
}
