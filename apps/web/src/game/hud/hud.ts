import { describeInput, STAGES } from '@neonfist/shared';
import { actionOf, END, FS, PHASE, ROSTER, ULT_FREEZE, ULT_MAX, type GameState } from '@neonfist/sim';
import type { KeyHintSet } from '../input/bindings';
import { PLAYER_COLORS } from '../render/stages';
import { LOOKS } from '../render/looks';
import { portrait } from '../render/portraits';

export interface HudNames {
  p1: string;
  p2: string;
}

export interface HudOptions {
  names: HudNames;
  /** Whose skill trays to show and with which key labels. */
  trays: [KeyHintSet | null, KeyHintSet | null];
  /** Show the damage / best-chain counters (single-player screens). */
  stats?: boolean;
  stage?: string;
  /** Badge under each portrait, e.g. P1 / CPU / YOU. */
  badges?: [string, string];
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

function el<K extends keyof HTMLElementTagNameMap = 'div'>(
  cls: string,
  parent?: HTMLElement,
  tag?: K,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag ?? ('div' as K));
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

const FS_NAMES = Object.fromEntries(Object.entries(FS).map(([k, v]) => [v, k]));

interface SideEls {
  root: HTMLElement;
  face: HTMLImageElement;
  who: HTMLElement;
  name: HTMLElement;
  tag: HTMLElement;
  fill: HTMLElement;
  trail: HTMLElement;
  hpL: HTMLElement;
  hpR: HTMLElement;
  meter: HTMLElement;
  meterFill: HTMLElement;
  pips: HTMLElement;
  combo: HTMLElement;
  char: number;
}

interface TrayEls {
  root: HTMLElement;
  owner: HTMLElement;
  cards: {
    wrap: HTMLElement;
    card: HTMLElement;
    img: HTMLImageElement;
    cd: HTMLElement;
    num: HTMLElement;
    name: HTMLElement;
    key: HTMLElement;
  }[];
  ult: { card: HTMLElement; img: HTMLImageElement; pct: HTMLElement; name: HTMLElement; key: HTMLElement };
  char: number;
}

/**
 * The fight HUD: plain DOM over the canvas, updated imperatively every frame (never through React
 * state — PLAN §5.5). Portraits and skill art are rendered from the 3D heroes (render/portraits).
 */
export class Hud {
  readonly root: HTMLElement;
  private sides: SideEls[] = [];
  private trays: (TrayEls | null)[] = [null, null];
  private timer!: HTMLElement;
  private round!: HTMLElement;
  private score!: HTMLElement;
  private banner: HTMLElement;
  private sub: HTMLElement;
  private cutin: HTMLElement;
  private cutinImg: HTMLImageElement;
  private cutinWho: HTMLElement;
  private cutinName: HTMLElement;
  private cutinBlurb: HTMLElement;
  private stats: { root: HTMLElement; dmg: HTMLElement; chain: HTMLElement } | null = null;
  private net: HTMLElement;
  private frames: HTMLElement;
  private inputs: HTMLElement;
  private trailHp = [1, 1];
  private comboShow = [
    { hits: 0, dmg: 0, until: 0 },
    { hits: 0, dmg: 0, until: 0 },
  ];
  private lastBanner = '';
  private lastCutin = -1;
  private now = 0;
  private inputLog: string[][] = [[], []];
  showNet = false;
  showFrames = false;
  showInputs = false;
  onAnnounce: ((text: string) => void) | null = null;

  constructor(
    host: HTMLElement,
    private o: HudOptions,
  ) {
    this.root = el('hud', host);
    const top = el('hud-top', this.root);
    for (let i = 0; i < 2; i++) {
      const pc = i === 0 ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2;
      const root = el(`hud-side ${i === 0 ? 'p1' : 'p2'}`, top);
      root.style.setProperty('--pc', pc);
      const faceBox = el('hud-face', root);
      const face = el('', faceBox, 'img');
      face.alt = '';
      const who = el('who', faceBox);
      const info = el('', root);
      const row = el('hud-namerow', info);
      const name = el('hud-name', row);
      const tag = el('hud-tag', row);
      const bar = el('hud-bar', info);
      const trail = el('trail', bar);
      const fill = el('fill', bar);
      const hp = el('hud-hp', info);
      const hpL = el('', hp, 'span');
      const hpR = el('', hp, 'span');
      const meter = el('hud-meter', info);
      const meterFill = el('', meter, 'i');
      const pips = el('hud-pips', info);
      const combo = el(`hud-combo ${i === 0 ? 'p1' : 'p2'}`, this.root);
      this.sides.push({
        root,
        face,
        who,
        name,
        tag,
        fill,
        trail,
        hpL,
        hpR,
        meter,
        meterFill,
        pips,
        combo,
        char: -1,
      });
      if (i === 0) {
        const clock = el('hud-clock', top);
        this.round = el('hud-round', clock);
        this.timer = el('hud-timer', clock);
        this.score = el('hud-score', clock);
      }
    }

    for (let i = 0; i < 2; i++) if (o.trays[i]) this.trays[i] = this.makeTray(i, o.trays[i]!);

    if (o.stats) {
      const root = el('hud-stats', this.root);
      const a = el('', root);
      el('', a, 'small').textContent = 'Total damage';
      const dmg = el('', a, 'b');
      const b = el('', root);
      el('', b, 'small').textContent = 'Best chain';
      const chain = el('', b, 'b');
      this.stats = { root, dmg, chain };
    }
    const stage = STAGES.find((x) => x.id === o.stage) ?? STAGES[0];
    const st = el('hud-stage', this.root);
    st.innerHTML = `${stage.name.toUpperCase()}<small>${stage.time}</small>`;

    this.banner = el('hud-banner', this.root);
    this.sub = el('hud-sub', this.root);
    this.cutin = el('cutin', this.root);
    const art = el('cutin-art', this.cutin);
    this.cutinImg = el('', art, 'img');
    this.cutinImg.alt = '';
    const txt = el('cutin-text', this.cutin);
    this.cutinWho = el('', txt, 'small');
    this.cutinName = el('', txt, 'b');
    this.cutinBlurb = el('', txt, 'span');
    this.net = el('hud-panel hud-net', this.root);
    this.frames = el('hud-panel hud-frames', this.root);
    this.inputs = el('hud-panel hud-inputs', this.root);
  }

  private makeTray(side: number, keys: KeyHintSet): TrayEls {
    const root = el(`hud-tray ${side === 0 ? 'p1' : 'p2'}`, this.root);
    const owner = el('owner', root);
    const cards: TrayEls['cards'] = [];
    for (let k = 0; k < 3; k++) {
      const wrap = el('skill-wrap', root);
      const card = el('skill', wrap);
      const img = el('', card, 'img');
      img.alt = '';
      const cd = el('cd', card);
      const num = el('cdnum', card);
      const key = el('key', card);
      key.textContent = keys.skills[k]!;
      const name = el('skill-name', wrap);
      cards.push({ wrap, card, img, cd, num, name, key });
    }
    const wrap = el('skill-wrap', root);
    const card = el('skill ult locked', wrap);
    const img = el('', card, 'img');
    img.alt = '';
    const pct = el('pct', card);
    const key = el('key', card);
    key.textContent = keys.ult;
    const name = el('skill-name', wrap);
    return { root, owner, cards, ult: { card, img, pct, name, key }, char: -1 };
  }

  setNames(n: HudNames): void {
    this.o = { ...this.o, names: n };
    for (const s of this.sides) s.char = -1;
  }

  private setHero(i: number, char: number) {
    const side = this.sides[i]!;
    const hero = ROSTER[char]!;
    const look = LOOKS[hero.id]!;
    side.char = char;
    side.root.style.setProperty('--hero', look.color);
    side.combo.style.setProperty('--hero', look.color);
    side.name.textContent = (i === 0 ? this.o.names.p1 : this.o.names.p2).toUpperCase();
    const shown = (i === 0 ? this.o.names.p1 : this.o.names.p2).toLowerCase();
    side.tag.textContent = hero.name.toLowerCase().startsWith(shown) ? hero.title : hero.name;
    side.who.textContent = this.o.badges?.[i] ?? `P${i + 1}`;
    void portrait(hero.id, 'face')
      .then((u) => (side.face.src = u))
      .catch(() => {});
    const tray = this.trays[i];
    if (tray) {
      tray.char = char;
      tray.root.style.setProperty('--hero', look.color);
      tray.owner.textContent = hero.name;
      hero.skillIdx.forEach((idx, k) => {
        const a = hero.actions[idx]!;
        const c = tray.cards[k]!;
        c.name.textContent = a.name;
        void portrait(hero.id, `skill:${a.id}`)
          .then((u) => (c.img.src = u))
          .catch(() => {});
      });
      const ult = hero.actions[hero.ultIdx]!;
      tray.ult.name.textContent = ult.name;
      void portrait(hero.id, `skill:${ult.id}`)
        .then((u) => (tray.ult.img.src = u))
        .catch(() => {});
    }
  }

  private bannerFor(s: GameState): [string, string, boolean] {
    const name = (i: number) => (i === 0 ? this.o.names.p1 : this.o.names.p2).toUpperCase();
    const last =
      s.fighters[0].roundsWon === s.roundsToWin - 1 && s.fighters[1].roundsWon === s.roundsToWin - 1;
    switch (s.phase) {
      case PHASE.INTRO:
        if (s.phaseFrame < 70) return [last ? 'FINAL ROUND' : `ROUND ${s.round}`, '', false];
        return ['READY', '', false];
      case PHASE.FIGHT:
        return s.phaseFrame < 45 ? ['FIGHT!', '', false] : ['', '', false];
      case PHASE.KO:
        if (s.endReason === END.TIME) return ['TIME', '', true];
        if (s.endReason === END.DOUBLE_KO) return ['DOUBLE K.O.', '', true];
        if (s.endReason === END.RING_OUT) return ['RING OUT!', '', true];
        return ['K.O.', '', true];
      case PHASE.ROUND_END: {
        if (s.endWinner < 0) return ['DRAW', '', true];
        const w = s.fighters[s.endWinner]!;
        const perfect = w.hp === ROSTER[w.char]!.hp;
        return [
          perfect ? 'PERFECT' : `${name(s.endWinner)} WINS`,
          perfect ? `${name(s.endWinner)} wins the round` : '',
          true,
        ];
      }
      default:
        return ['', '', false];
    }
  }

  update(
    s: GameState,
    dtMs: number,
    extra: { net?: NetStats | null; fps?: number; inputs?: [number, number] } = {},
  ): void {
    this.now += dtMs;
    const dt = dtMs / 1000;
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i]!;
      const side = this.sides[i]!;
      if (side.char !== f.char) this.setHero(i, f.char);
      const max = ROSTER[f.char]!.hp;
      const hp = Math.max(0, f.hp) / max;
      side.fill.style.transform = `scaleX(${hp})`;
      side.fill.classList.toggle('low', hp < 0.25);
      if (f.comboHits === 0 || f.state === FS.DOWN || f.state === FS.KO)
        this.trailHp[i] = Math.max(hp, this.trailHp[i]! - dt * 0.55);
      if (hp > this.trailHp[i]!) this.trailHp[i] = hp;
      side.trail.style.transform = `scaleX(${this.trailHp[i]})`;
      const hpText = `${Math.max(0, f.hp)} / ${max}`;
      if (side.hpL.textContent !== hpText) side.hpL.textContent = hpText;
      const m = Math.min(1, f.ult / ULT_MAX);
      side.meterFill.style.transform = `scaleX(${m})`;
      side.meter.classList.toggle('full', m >= 1);
      const pipsKey = `${s.roundsToWin}:${f.roundsWon}`;
      if (side.pips.dataset.k !== pipsKey) {
        side.pips.dataset.k = pipsKey;
        side.pips.innerHTML = Array.from(
          { length: s.roundsToWin },
          (_, k) => `<i class="${k < f.roundsWon ? 'won' : ''}"></i>`,
        ).join('');
      }
      // Combo counter on the attacker's side
      const victim = s.fighters[1 - i]!;
      const c = this.comboShow[i]!;
      if (victim.comboHits >= 2) {
        c.hits = victim.comboHits;
        c.dmg = victim.comboDamage;
        c.until = this.now + 1100;
      }
      const showCombo = this.now < c.until && c.hits >= 2;
      side.combo.classList.toggle('on', showCombo);
      if (showCombo) side.combo.innerHTML = `<b>${c.hits}</b><span>HITS</span><small>${c.dmg} damage</small>`;

      // Skill tray
      const tray = this.trays[i];
      if (tray) {
        if (tray.char !== f.char) this.setHero(i, f.char);
        const hero = ROSTER[f.char]!;
        hero.skillIdx.forEach((idx, k) => {
          const total = hero.actions[idx]!.cooldown ?? 1;
          const left = f.cd[k]!;
          const card = tray.cards[k]!;
          card.cd.style.setProperty('--cd', String(left / total));
          const n = left > 0 ? String(Math.ceil(left / 60)) : '';
          if (card.num.textContent !== n) card.num.textContent = n;
          card.card.classList.toggle('ready', left === 0);
          const a = actionOf(f);
          card.card.classList.toggle(
            'used',
            f.state === FS.ACTION && a?.id === hero.actions[idx]!.id && f.actionFrame < 8,
          );
        });
        tray.ult.card.classList.toggle('ready', m >= 1);
        tray.ult.card.classList.toggle('locked', m < 1);
        const pct = m >= 1 ? 'READY' : `${Math.floor(m * 100)}%`;
        if (tray.ult.pct.textContent !== pct) tray.ult.pct.textContent = pct;
      }
    }
    if (this.stats) {
      const a = s.fighters[0];
      this.stats.dmg.textContent = String(a.totalDamage);
      this.stats.chain.textContent = String(a.bestCombo);
    }

    const secs = String(Math.ceil(s.timer / 60));
    if (this.timer.textContent !== secs) this.timer.textContent = secs;
    this.timer.classList.toggle('low', s.timer < 600 && s.phase === PHASE.FIGHT);
    const maxRounds = s.roundsToWin * 2 - 1;
    const roundText = `Round ${Math.min(s.round, maxRounds)} / ${maxRounds}`;
    if (this.round.textContent !== roundText) this.round.textContent = roundText;
    const score = `${s.fighters[0].roundsWon} — ${s.fighters[1].roundsWon}`;
    if (this.score.textContent !== score) this.score.textContent = score;

    // Ultimate cut-in
    if (s.freeze > 0 && s.freezeOwner >= 0) {
      const id = s.frame - (ULT_FREEZE - s.freeze);
      if (Math.abs(id - this.lastCutin) > 2) {
        this.lastCutin = id;
        const f = s.fighters[s.freezeOwner]!;
        const hero = ROSTER[f.char]!;
        const ult = hero.actions[hero.ultIdx]!;
        this.cutin.style.setProperty('--hero', LOOKS[hero.id]!.color);
        this.cutinWho.textContent = `${hero.name} — ultimate`;
        this.cutinName.textContent = ult.name.toUpperCase();
        this.cutinBlurb.textContent = ult.blurb ?? '';
        this.cutinImg.removeAttribute('src');
        void portrait(hero.id, 'cutin')
          .then((u) => (this.cutinImg.src = u))
          .catch(() => {});
        this.cutin.classList.remove('on', 'side-p2');
        void this.cutin.offsetWidth;
        this.cutin.classList.add('on');
        if (s.freezeOwner === 1) this.cutin.classList.add('side-p2');
        this.onAnnounce?.(ult.name);
      }
    }

    const [b, sub, hold] = this.bannerFor(s);
    if (b !== this.lastBanner) {
      this.lastBanner = b;
      this.banner.textContent = b;
      this.banner.classList.remove('on');
      if (b) {
        void this.banner.offsetWidth;
        this.banner.classList.add('on');
        this.banner.dataset.kind =
          b === 'FIGHT!' ? 'fight' : /K\.O\.|PERFECT|RING OUT/.test(b) ? 'ko' : 'info';
        this.banner.dataset.hold = String(hold);
        const spoken = b.replace(/K\.O\./, 'K. O.').replace('!', '');
        this.onAnnounce?.(spoken.charAt(0) + spoken.slice(1).toLowerCase());
      }
    }
    if (this.sub.textContent !== sub) this.sub.textContent = sub;

    this.debugPanels(s, extra);
  }

  private debugPanels(
    s: GameState,
    extra: { net?: NetStats | null; fps?: number; inputs?: [number, number] },
  ) {
    this.net.style.display = this.showNet ? 'block' : 'none';
    if (this.showNet) {
      const n = extra.net;
      this.net.innerHTML = [
        `<b>Network</b> ${n ? n.path.toUpperCase() : 'LOCAL'}`,
        n ? `ping ${n.pingMs === null ? '—' : Math.round(n.pingMs) + ' ms'}, delay ${n.inputDelay}f` : '',
        n ? `rollbacks ${n.rollbacks}, avg ${n.avgRollback.toFixed(1)}f, max ${n.maxRollback}f` : '',
        n ? `stalls ${n.stalls}, ahead ${n.framesAhead.toFixed(1)}f` : '',
        `fps ${extra.fps ?? '—'}, frame ${s.frame}`,
      ]
        .filter(Boolean)
        .join('<br>');
    }
    this.frames.style.display = this.showFrames ? 'block' : 'none';
    if (this.showFrames) {
      this.frames.innerHTML = s.fighters
        .map((f, i) => {
          const a = actionOf(f);
          const head = `<b>P${i + 1}</b> ${FS_NAMES[f.state] ?? f.state}${f.stun ? `, stun ${f.stun}` : ''}`;
          if (!a || f.state !== FS.ACTION) return head;
          const first = Math.min(
            ...(a.strikes ?? []).map((x) => x.frames[0]),
            ...(a.projectiles ?? []).map((x) => x.frame),
            ...(a.areas ?? []).map((x) => x.frame),
            999,
          );
          return `${head}<br>${a.name}: frame ${f.actionFrame}/${a.total}, impact ${first === 999 ? '—' : first}`;
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
