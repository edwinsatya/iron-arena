import { BTN, DIRECTION_MASK } from '@iron-arena/shared';
import { ROSTER, ULT_MAX, type GameState } from '@iron-arena/sim';
import { touchInput } from '../input/touch';
import { LOOKS } from '../looks';
import { portrait } from '../portraits';

/**
 * A phone held upright shows the match turned sideways (the CSS rotates `.game-view` under this same
 * query), so the fight is always landscape, even with the screen's rotation lock on.
 */
export const SIDEWAYS_QUERY = '(pointer: coarse) and (orientation: portrait)';

const svg = (body: string, extra = '') =>
  `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;

export const ICONS = {
  attack: svg(
    '<path d="M15.2 29.2 34.3 10 39 9l-1 4.7-19.2 19.1Z" fill="currentColor" stroke="none"/>' +
      '<path d="m11.5 26.5 10 10" stroke-width="3.6"/><path d="m15.5 32.5-5.5 5.5" stroke-width="3.6"/>' +
      '<circle cx="8.6" cy="39.4" r="2.8" fill="currentColor" stroke="none"/>',
  ),
  jump: svg('<path d="m13 24 11-11 11 11"/><path d="m13 35 11-11 11 11" opacity=".5"/>'),
  guard: svg(
    '<path d="M24 7l14 5.5V23c0 9.5-6 15.5-14 19-8-3.5-14-9.5-14-19V12.5Z" fill="currentColor" fill-opacity=".2" stroke-width="3.5"/>' +
      '<path d="M24 14v21" stroke-width="2.6" opacity=".6"/>',
  ),
  dash: svg(
    '<path d="m20 13 11 11-11 11"/><path d="m30 13 11 11-11 11" opacity=".55"/>' +
      '<path d="M6 17h8M4 24h10M6 31h8" stroke-width="2.6" opacity=".55"/>',
  ),
  pause: svg(
    '<rect x="14" y="12" width="7" height="24" rx="1.5" fill="currentColor" stroke="none"/>' +
      '<rect x="27" y="12" width="7" height="24" rx="1.5" fill="currentColor" stroke="none"/>',
  ),
  fullscreen: svg('<path d="M10 19v-9h9M29 10h9v9M38 29v9h-9M19 38h-9v-9"/>'),
  windowed: svg('<path d="M19 10v9h-9M38 19h-9v-9M29 38v-9h9M10 29h9v9"/>'),
  phone: svg(
    '<rect x="15" y="6" width="18" height="36" rx="3.5" stroke-width="3"/><path d="M21 37h6" stroke-width="2.6"/>',
  ),
};

interface SkillEls {
  btn: HTMLButtonElement;
  img: HTMLImageElement;
  cd: HTMLElement;
  num: HTMLElement;
  frac: number;
  text: string;
  ready: boolean | null;
}

/**
 * On-screen controls for phones and tablets, laid out like a mobile action RPG: a floating stick
 * under the left thumb (it appears wherever the thumb lands), and under the right thumb a big
 * Attack button ringed by Jump, Dash, Guard, the three skills (with their art and cooldowns) and the
 * ultimate (its charge drawn round the rim). Plain DOM, updated imperatively every frame like the
 * HUD; the buttons write to `touchInput`, which the player's input source reads each tick.
 */
export class TouchPad {
  readonly root: HTMLElement;
  private zone: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private dashBtn: HTMLButtonElement;
  private skills: SkillEls[] = [];
  private ult: {
    btn: HTMLButtonElement;
    img: HTMLImageElement;
    fill: SVGCircleElement;
    m: number;
    ready: boolean | null;
  };
  private hint: HTMLElement;
  private char = -1;
  /** Screen direction the fighter faces (dash goes this way when the stick is idle). */
  private facingBit: number = BTN.RIGHT;
  private stickId = -1;
  private base = { x: 0, y: 0 };
  /** The stick's reach (half the base), measured when the thumb lands. */
  private reach = 40;
  private pressed = new Set<HTMLElement>();
  private timers: number[] = [];
  private sideways: MediaQueryList;
  private cleanups: (() => void)[] = [];

  constructor(
    host: HTMLElement,
    private player: 0 | 1,
    private haptics = true,
  ) {
    touchInput.reset();
    const root = document.createElement('div');
    root.className = 'tp';
    root.innerHTML = `
      <div class="tp-zone"></div>
      <div class="tp-stick"><div class="tp-base"></div><div class="tp-knob"></div></div>
      <div class="tp-pad">
        <button type="button" class="tp-btn skill s1" aria-label="Skill 1"><img alt="" draggable="false"><i class="cd"></i><b class="num"></b></button>
        <button type="button" class="tp-btn skill s2" aria-label="Skill 2"><img alt="" draggable="false"><i class="cd"></i><b class="num"></b></button>
        <button type="button" class="tp-btn skill s3" aria-label="Skill 3"><img alt="" draggable="false"><i class="cd"></i><b class="num"></b></button>
        <button type="button" class="tp-btn ult" aria-label="Ultimate">
          <img alt="" draggable="false">
          <svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="46"/><circle class="fill" cx="50" cy="50" r="46" pathLength="100"/></svg>
        </button>
        <button type="button" class="tp-btn guard" aria-label="Guard">${ICONS.guard}</button>
        <button type="button" class="tp-btn jump" aria-label="Jump">${ICONS.jump}</button>
        <button type="button" class="tp-btn dash" aria-label="Dash">${ICONS.dash}</button>
        <button type="button" class="tp-btn atk" aria-label="Attack">${ICONS.attack}</button>
      </div>
      <div class="tp-hint" role="status"><span class="tp-hint-icon">${ICONS.phone}</span>Turn your phone sideways</div>`;
    host.appendChild(root);
    this.root = root;
    const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.zone = q('.tp-zone');
    this.stick = q('.tp-stick');
    this.knob = q('.tp-knob');
    this.dashBtn = q<HTMLButtonElement>('.dash');
    this.hint = q('.tp-hint');
    for (const k of [1, 2, 3]) {
      const btn = q<HTMLButtonElement>(`.s${k}`);
      this.skills.push({
        btn,
        img: btn.querySelector('img')!,
        cd: btn.querySelector('.cd')!,
        num: btn.querySelector('.num')!,
        frac: -1,
        text: '',
        ready: null,
      });
    }
    const ultBtn = q<HTMLButtonElement>('.ult');
    this.ult = {
      btn: ultBtn,
      img: ultBtn.querySelector('img')!,
      fill: ultBtn.querySelector('circle.fill')!,
      m: -1,
      ready: null,
    };

    // Hold-to-press buttons
    const holds: [string, number][] = [
      ['.atk', BTN.ATTACK],
      ['.jump', BTN.JUMP],
      ['.guard', BTN.GUARD],
      ['.s1', BTN.SKILL1],
      ['.s2', BTN.SKILL2],
      ['.s3', BTN.SKILL3],
      ['.ult', BTN.ULT],
    ];
    for (const [sel, bit] of holds)
      this.bindButton(
        q(sel),
        () => touchInput.press(bit),
        () => touchInput.release(bit),
      );
    this.bindButton(
      this.dashBtn,
      () => touchInput.dash(touchInput.held & (BTN.LEFT | BTN.RIGHT) || this.facingBit),
      () => {},
    );
    this.bindStick();

    const releaseAll = () => this.releaseAll();
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);
    this.cleanups.push(() => {
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseAll);
    });

    // A phone held upright gets the match turned sideways, and a reminder to turn the phone
    this.sideways = window.matchMedia(SIDEWAYS_QUERY);
    const onTurn = () => {
      if (this.sideways.matches) this.showHint();
      this.releaseAll();
    };
    this.sideways.addEventListener('change', onTurn);
    this.cleanups.push(() => this.sideways.removeEventListener('change', onTurn));
    if (this.sideways.matches) this.showHint();
  }

  private showHint() {
    this.hint.classList.add('show');
    this.timers.push(window.setTimeout(() => this.hint.classList.remove('show'), 4500));
  }

  private buzz(ms = 8) {
    if (this.haptics) navigator.vibrate?.(ms);
  }

  private bindButton(btn: HTMLElement, down: () => void, up: () => void) {
    let id = -1;
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      btn.classList.remove('on');
      this.pressed.delete(btn);
      up();
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== -1) return;
      id = e.pointerId;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers (tests) can't be captured
      }
      btn.classList.add('on');
      this.pressed.add(btn);
      down();
      this.buzz();
    });
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    // Release from releaseAll()
    btn.addEventListener('tp-release', () => {
      if (id === -1) return;
      id = -1;
      btn.classList.remove('on');
      up();
    });
  }

  /** A point on screen in the pad's own (unrotated) coordinates. */
  private local(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.root.getBoundingClientRect();
    if (this.sideways.matches) return { x: clientY - r.top, y: r.right - clientX };
    return { x: clientX - r.left, y: clientY - r.top };
  }

  private bindStick() {
    const zone = this.zone;
    const base = this.stick.querySelector<HTMLElement>('.tp-base')!;
    const place = (x: number, y: number) => {
      this.stick.style.left = `${x}px`;
      this.stick.style.top = `${y}px`;
    };
    const move = (cx: number, cy: number) => {
      const p = this.local(cx, cy);
      const R = this.reach;
      let dx = p.x - this.base.x;
      let dy = p.y - this.base.y;
      const len = Math.hypot(dx, dy);
      // The base follows a thumb that runs past the rim, so turning back reacts at once
      if (len > R) {
        const over = (len - R) / len;
        this.base.x += dx * over;
        this.base.y += dy * over;
        place(this.base.x, this.base.y);
        dx = p.x - this.base.x;
        dy = p.y - this.base.y;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Side view: the stick only walks left and right (Jump has its own button)
      const dead = Math.max(6, R * 0.16);
      const bits = dx > dead ? BTN.RIGHT : dx < -dead ? BTN.LEFT : 0;
      touchInput.setDirection(bits, DIRECTION_MASK);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stopStick();
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickId !== -1) return;
      this.stickId = e.pointerId;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers (tests) can't be captured
      }
      const p = this.local(e.clientX, e.clientY);
      const R = (this.reach = Math.max(20, base.offsetWidth / 2));
      const w = this.root.offsetWidth;
      const h = this.root.offsetHeight;
      this.base = {
        x: Math.max(R + 6, Math.min(w - R - 6, p.x)),
        y: Math.max(R + 6, Math.min(h - R - 6, p.y)),
      };
      place(this.base.x, this.base.y);
      this.stick.classList.add('on');
      move(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) move(e.clientX, e.clientY);
    });
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private stopStick() {
    this.stickId = -1;
    this.stick.classList.remove('on');
    this.stick.style.left = '';
    this.stick.style.top = '';
    this.knob.style.transform = '';
    touchInput.setDirection(0, DIRECTION_MASK);
  }

  private releaseAll() {
    for (const b of [...this.pressed]) b.dispatchEvent(new Event('tp-release'));
    this.pressed.clear();
    if (this.stickId !== -1) this.stopStick();
    touchInput.reset();
  }

  private setHero(char: number) {
    this.char = char;
    const hero = ROSTER[char]!;
    this.root.style.setProperty('--hero', LOOKS[hero.id]?.color ?? '#e2b458');
    hero.skillIdx.forEach((idx, k) => {
      const a = hero.actions[idx]!;
      const s = this.skills[k]!;
      s.btn.setAttribute('aria-label', a.name);
      s.img.removeAttribute('src');
      void portrait(hero.id, `skill:${a.id}`)
        .then((u) => (s.img.src = u))
        .catch(() => {});
    });
    const ult = hero.actions[hero.ultIdx]!;
    this.ult.btn.setAttribute('aria-label', `${ult.name} (ultimate)`);
    this.ult.img.removeAttribute('src');
    void portrait(hero.id, `skill:${ult.id}`)
      .then((u) => (this.ult.img.src = u))
      .catch(() => {});
  }

  /** Refresh art, cooldowns and the ultimate's charge from the newest state. */
  update(s: GameState): void {
    const f = s.fighters[this.player];
    if (!f) return;
    if (f.char !== this.char) this.setHero(f.char);
    const hero = ROSTER[f.char]!;
    const mirrored = s.viewMirrored[this.player] === 1;
    const right = f.fx >= 0 !== mirrored;
    const bit = right ? BTN.RIGHT : BTN.LEFT;
    if (bit !== this.facingBit) {
      this.facingBit = bit;
      this.dashBtn.classList.toggle('left', !right);
    }
    hero.skillIdx.forEach((idx, k) => {
      const el = this.skills[k]!;
      const total = hero.actions[idx]!.cooldown ?? 1;
      const left = f.cd[k] ?? 0;
      const frac = Math.round((left / total) * 200) / 200;
      if (frac !== el.frac) {
        el.frac = frac;
        el.cd.style.setProperty('--cd', String(frac));
      }
      const text = left > 0 ? String(Math.ceil(left / 60)) : '';
      if (text !== el.text) {
        el.text = text;
        el.num.textContent = text;
      }
      const ready = left === 0;
      if (ready !== el.ready) {
        el.ready = ready;
        el.btn.classList.toggle('ready', ready);
      }
    });
    const m = Math.round(Math.min(1, f.ult / ULT_MAX) * 200) / 200;
    if (m !== this.ult.m) {
      this.ult.m = m;
      this.ult.fill.style.strokeDashoffset = String(100 - m * 100);
    }
    const ready = m >= 1;
    if (ready !== this.ult.ready) {
      this.ult.ready = ready;
      this.ult.btn.classList.toggle('ready', ready);
      if (ready) this.buzz(20);
    }
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    for (const c of this.cleanups) c();
    touchInput.reset();
    this.root.remove();
  }
}
