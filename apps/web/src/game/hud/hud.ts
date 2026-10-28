import { describeInput } from '@neonfist/shared';
import { END, EV, FS, PHASE, ROSTER, moveOf, type GameState, type SimEvent } from '@neonfist/sim';

export interface HudNames {
  p1: string;
  p2: string;
}

export interface NetStats {
  path: string;
  pingMs: number | null;
  inputDelay: number;
  rollbacks: number;
  avgRollback: number;
  maxRollback: number;
  stalls: number;
  framesAhead: number;
}

function el(cls: string, parent?: HTMLElement, tag = 'div'): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

const FS_NAMES = Object.fromEntries(Object.entries(FS).map(([k, v]) => [v, k]));

/**
 * The in-fight HUD: plain DOM over the canvas, updated imperatively every frame (never through
 * React state — PLAN §5.5).
 */
export class Hud {
  readonly root: HTMLElement;
  private fill: HTMLElement[] = [];
  private trail: HTMLElement[] = [];
  private names: HTMLElement[] = [];
  private pips: HTMLElement[] = [];
  private combo: HTMLElement[] = [];
  private timer!: HTMLElement;
  private banner: HTMLElement;
  private sub: HTMLElement;
  private flash: HTMLElement[] = [];
  private net: HTMLElement;
  private frames: HTMLElement;
  private inputs: HTMLElement;
  private trailHp = [1, 1];
  private comboShow = [{ hits: 0, dmg: 0, until: 0 }, { hits: 0, dmg: 0, until: 0 }];
  private lastBanner = '';
  private flashUntil = [0, 0];
  private now = 0;
  showNet = false;
  showFrames = false;
  showInputs = false;
  onAnnounce: ((text: string) => void) | null = null;
  private inputLog: string[][] = [[], []];

  constructor(
    host: HTMLElement,
    private namesOf: HudNames,
  ) {
    this.root = el('hud', host);
    const top = el('hud-top', this.root);
    for (let i = 0; i < 2; i++) {
      const side = el(`hud-side ${i === 0 ? 'p1' : 'p2'}`, top);
      const meta = el('hud-meta', side);
      this.names[i] = el('hud-name', meta);
      this.pips[i] = el('hud-pips', meta);
      const bar = el('hud-bar', side);
      this.trail[i] = el('hud-bar-trail', bar);
      this.fill[i] = el('hud-bar-fill', bar);
      if (i === 0) this.timer = el('hud-timer', top);
    }
    for (let i = 0; i < 2; i++) {
      this.combo[i] = el(`hud-combo ${i === 0 ? 'p1' : 'p2'}`, this.root);
      this.flash[i] = el(`hud-flash ${i === 0 ? 'p1' : 'p2'}`, this.root);
    }
    this.banner = el('hud-banner', this.root);
    this.sub = el('hud-sub', this.root);
    this.net = el('hud-panel hud-net', this.root);
    this.frames = el('hud-panel hud-frames', this.root);
    this.inputs = el('hud-panel hud-inputs', this.root);
  }

  setNames(n: HudNames): void {
    this.namesOf = n;
  }

  /** Counter hits and throws get a side flash (driven by rollback-safe events). */
  event(e: SimEvent): void {
    if (e.type === EV.COUNTER) this.showFlash(e.fighter, 'COUNTER HIT');
    if (e.type === EV.THROW_BREAK) this.showFlash(e.fighter, 'THROW ESCAPE');
    if (e.type === EV.ARMOR) this.showFlash(1 - e.fighter, 'ARMOR');
  }

  private showFlash(side: number, text: string) {
    const f = this.flash[side]!;
    f.textContent = text;
    f.classList.remove('on');
    void f.offsetWidth; // restart the CSS animation
    f.classList.add('on');
    this.flashUntil[side] = this.now + 900;
  }

  private bannerFor(s: GameState): [string, string] {
    const name = (i: number) => (i === 0 ? this.namesOf.p1 : this.namesOf.p2);
    const finalRound = s.fighters[0].roundsWon === s.roundsToWin - 1 && s.fighters[1].roundsWon === s.roundsToWin - 1;
    switch (s.phase) {
      case PHASE.INTRO:
        if (s.phaseFrame < 78) return [finalRound ? 'FINAL ROUND' : `ROUND ${s.round}`, ''];
        return ['READY', ''];
      case PHASE.FIGHT:
        return s.phaseFrame < 45 ? ['FIGHT!', ''] : ['', ''];
      case PHASE.KO:
        if (s.endReason === END.TIME) return ['TIME', ''];
        if (s.endReason === END.DOUBLE_KO) return ['DOUBLE K.O.', ''];
        return ['K.O.', ''];
      case PHASE.ROUND_END: {
        if (s.endWinner < 0) return ['DRAW', ''];
        const w = s.fighters[s.endWinner]!;
        const perfect = w.hp === ROSTER[w.char]!.hp;
        return [perfect ? 'PERFECT' : `${name(s.endWinner)} WINS`, perfect ? `${name(s.endWinner)} wins` : ''];
      }
      case PHASE.MATCH_END:
        return s.matchWinner < 0 ? ['DRAW', ''] : [`${name(s.matchWinner)} WINS`, 'Match over'];
      default:
        return ['', ''];
    }
  }

  update(s: GameState, dtMs: number, extra: { net?: NetStats | null; fps?: number; inputs?: [number, number] } = {}): void {
    this.now += dtMs;
    const dt = dtMs / 1000;
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i]!;
      const max = ROSTER[f.char]!.hp;
      const hp = Math.max(0, f.hp) / max;
      this.fill[i]!.style.transform = `scaleX(${hp})`;
      this.fill[i]!.classList.toggle('low', hp < 0.25);
      // Trailing "recent damage" drains once the combo is over
      if (f.comboHits === 0 || f.state === FS.DOWN || f.state === FS.KO) {
        this.trailHp[i] = Math.max(hp, this.trailHp[i]! - dt * 0.6);
      }
      if (hp > this.trailHp[i]!) this.trailHp[i] = hp;
      this.trail[i]!.style.transform = `scaleX(${this.trailHp[i]})`;
      const name = i === 0 ? this.namesOf.p1 : this.namesOf.p2;
      if (this.names[i]!.textContent !== name) this.names[i]!.textContent = name;
      const pips = Array.from({ length: s.roundsToWin }, (_, k) => (k < f.roundsWon ? '◆' : '◇')).join(' ');
      if (this.pips[i]!.textContent !== pips) this.pips[i]!.textContent = pips;

      // Combo counter shows on the attacker's side
      const victim = s.fighters[1 - i]!;
      const c = this.comboShow[i]!;
      if (victim.comboHits >= 2) {
        c.hits = victim.comboHits;
        c.dmg = victim.comboDamage;
        c.until = this.now + 1100;
      }
      const showCombo = this.now < c.until && c.hits >= 2;
      this.combo[i]!.classList.toggle('on', showCombo);
      if (showCombo) this.combo[i]!.innerHTML = `<b>${c.hits}</b> hits<small>${c.dmg} damage</small>`;
      this.flash[i]!.classList.toggle('on', this.now < this.flashUntil[i]!);
    }
    const secs = String(Math.ceil(s.timer / 60));
    if (this.timer.textContent !== secs) this.timer.textContent = secs;
    this.timer.classList.toggle('low', s.timer < 600 && s.phase === PHASE.FIGHT);

    const [b, sub] = this.bannerFor(s);
    if (b !== this.lastBanner) {
      this.lastBanner = b;
      this.banner.textContent = b;
      this.banner.classList.remove('on');
      if (b) {
        void this.banner.offsetWidth;
        this.banner.classList.add('on');
        this.banner.dataset.kind = b === 'FIGHT!' ? 'fight' : b.includes('K.O.') || b === 'PERFECT' ? 'ko' : 'info';
        const spoken = b.replace('K.O.', 'K. O.').replace('!', '');
        this.onAnnounce?.(spoken.charAt(0) + spoken.slice(1).toLowerCase());
      }
    }
    if (this.sub.textContent !== sub) this.sub.textContent = sub;

    this.net.style.display = this.showNet ? 'block' : 'none';
    if (this.showNet) {
      const n = extra.net;
      this.net.innerHTML = [
        `<b>Network</b> ${n ? n.path.toUpperCase() : 'LOCAL'}`,
        n ? `ping ${n.pingMs === null ? '—' : Math.round(n.pingMs) + ' ms'} · delay ${n.inputDelay}f` : '',
        n ? `rollbacks ${n.rollbacks} · avg ${n.avgRollback.toFixed(1)}f · max ${n.maxRollback}f` : '',
        n ? `stalls ${n.stalls} · ahead ${n.framesAhead.toFixed(1)}f` : '',
        `fps ${extra.fps ?? '—'} · frame ${s.frame}`,
      ]
        .filter(Boolean)
        .join('<br>');
    }

    this.frames.style.display = this.showFrames ? 'block' : 'none';
    if (this.showFrames) {
      this.frames.innerHTML = s.fighters
        .map((f, i) => {
          const m = moveOf(f);
          const head = `<b>P${i + 1}</b> ${FS_NAMES[f.state] ?? f.state}${f.stun ? ` · stun ${f.stun}` : ''}`;
          if (!m) return head;
          const hit = typeof m.onHit === 'number' ? (m.onHit >= 0 ? `+${m.onHit}` : m.onHit) : m.onHit.toUpperCase();
          return `${head}<br>${m.name} <i>${m.command || 'string'}</i> · ${m.height}<br>i${m.startup} · block ${m.onBlock >= 0 ? '+' : ''}${m.onBlock} · hit ${hit} · frame ${f.moveFrame}/${m.total}`;
        })
        .join('<hr>');
    }

    this.inputs.style.display = this.showInputs ? 'block' : 'none';
    if (this.showInputs && extra.inputs) {
      for (let i = 0; i < 2; i++) {
        const d = describeInput(extra.inputs[i]!);
        const log = this.inputLog[i]!;
        if (log[0] !== d) {
          log.unshift(d);
          if (log.length > 12) log.pop();
        }
      }
      this.inputs.innerHTML = `<b>Inputs</b><div class="cols">${this.inputLog
        .map((l) => `<div>${l.map((x) => `<span>${x}</span>`).join('')}</div>`)
        .join('')}</div>`;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
