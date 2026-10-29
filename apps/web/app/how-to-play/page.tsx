import { selectableCharacters } from '@neonfist/sim';
import { KEY_HINTS } from '../../src/game/input/bindings';
import { LOOKS } from '../../src/game/looks';
import { Topbar } from '../../src/ui/Topbar';
import { Portrait } from '../../src/ui/usePortrait';

export const metadata = { title: 'Heroes & controls — NEON FIST' };

const K = KEY_HINTS.solo;

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="keys">
      {keys.map((k) => (
        <span key={k} className="kbd">
          {k}
        </span>
      ))}
    </span>
  );
}

/** Every hero's kit, generated from the simulation data so it can't go out of date. */
export default function HowToPlay() {
  const chord = [
    [K.attack, K.guard],
    [K.attack, K.jump],
    [K.guard, K.jump],
  ];
  return (
    <main className="screen">
      <Topbar title="Heroes & controls" small="How to play" />

      <section className="controls-board" aria-label="Controls">
        <div className="ctrl">
          <h3>Move</h3>
          <Keys keys={['A', 'D']} />
          <p>Or the arrow keys. Tap a direction twice to dash. W or ↑ also jumps.</p>
        </div>
        <div className="ctrl">
          <h3>Attack, guard, jump</h3>
          <Keys keys={[K.attack, K.guard, K.jump]} />
          <p>
            Tap Attack for a combo; hold it through your first strike to charge a guard-breaking blow. Guard
            blocks anything from the front.
          </p>
        </div>
        <div className="ctrl">
          <h3>Skills</h3>
          <Keys keys={[...K.skills]} />
          <p>
            Or chord the action keys: {chord.map((c) => c.join('+')).join(', ')}. Each skill has its own
            cooldown.
          </p>
        </div>
        <div className="ctrl">
          <h3>Ultimate</h3>
          <Keys keys={[K.ult]} />
          <p>
            Or {K.attack}+{K.guard}+{K.jump}. Deal and take damage to fill the meter under your health bar.
          </p>
        </div>
        <div className="ctrl">
          <h3>Win</h3>
          <p style={{ marginTop: 0 }}>
            Empty their health, or knock them off either end of the stage for a ring-out. First to two rounds
            takes the match.
          </p>
        </div>
        <div className="ctrl">
          <h3>Gamepad</h3>
          <p style={{ marginTop: 0 }}>X attack, B guard, A jump, LB / RB / Y skills, RT ultimate.</p>
        </div>
      </section>

      <div className="heroes">
        {selectableCharacters().map((h) => {
          const look = LOOKS[h.id]!;
          const basic = h.basic.map((id) => h.actions[h.ids[id]!]!.name);
          return (
            <section
              key={h.id}
              id={h.id}
              className="hero-row panel"
              style={{ '--hero': look.color } as React.CSSProperties}
            >
              <div className="art">
                <span className="kana-mark" aria-hidden="true">
                  {h.kana}
                </span>
                <Portrait heroId={h.id} kind="full" />
              </div>
              <div>
                <h2>{h.name}</h2>
                <p className="epithet">
                  {h.title}, {h.role.toLowerCase()}
                </p>
                <p className="blurb">{h.blurb}</p>
                <div className="skill-grid">
                  {h.skillIdx.map((idx, k) => {
                    const a = h.actions[idx]!;
                    return (
                      <div key={a.id} className="skill-card">
                        <div className="pic">
                          <Portrait heroId={h.id} kind={`skill:${a.id}`} />
                        </div>
                        <div>
                          <b>{a.name}</b>
                          <span>{a.blurb}</span>
                          <span className="combo">
                            <span className="kbd">{K.skills[k]}</span>
                            <span className="kbd">{chord[k]!.join('+')}</span>
                            <span className="muted" style={{ fontSize: '0.8rem' }}>
                              {Math.round((a.cooldown ?? 0) / 60)} s cooldown
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="skill-card ult">
                    <div className="pic">
                      <Portrait heroId={h.id} kind={`skill:${h.actions[h.ultIdx]!.id}`} />
                    </div>
                    <div>
                      <b>{h.actions[h.ultIdx]!.name}</b>
                      <span>{h.actions[h.ultIdx]!.blurb}</span>
                      <span className="combo">
                        <span className="kbd">{K.ult}</span>
                        <span className="muted" style={{ fontSize: '0.8rem' }}>
                          full meter
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <p className="basics">
                  <b>Combo:</b> {basic.join(' → ')}. <b>Dash attack:</b> {h.actions[h.dashIdx]!.name}.{' '}
                  <b>In the air:</b> {h.actions[h.airIdx]!.name}. <b>Charged:</b>{' '}
                  {h.actions[h.chargeIdx]!.name}. {h.hp} health.
                </p>
              </div>
            </section>
          );
        })}
      </div>
      <p className="muted" style={{ textAlign: 'center', margin: '28px 0 8px' }}>
        Hero sprites, portraits and skill art by{' '}
        <a href="https://elie-automata.itch.io/" target="_blank" rel="noreferrer">
          elie automata
        </a>
        .
      </p>
    </main>
  );
}
