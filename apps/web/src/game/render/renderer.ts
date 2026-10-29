import * as THREE from 'three';
import { actionOf, EV, FS, PHASE, ROSTER, type GameState, type SimEvent } from '@neonfist/sim';
import { HitboxOverlay } from './debug';
import { Effects } from './effects';
import { HeroModel, loadManifest, loadVrm } from './hero-model';
import { lookFor, WEAPON_OF } from './looks';
import { Mannequin } from './mannequin';
import { poseFor, type Pose } from './poses';
import { buildStage, PLAYER_COLORS } from './stages';

export type Quality = 'low' | 'medium' | 'high';

export interface RendererOptions {
  /** This viewer sees the arena from the other side (online P2). */
  mirrored?: boolean;
  quality?: Quality;
  stage?: string;
  onEvent?: (e: SimEvent) => void;
  onCancel?: (e: SimEvent) => void;
  /** Slow orbit for menus (landing page). */
  showcase?: boolean;
  /** Load hero models from /models/manifest.json (default true). */
  models?: boolean;
}

export interface FighterView {
  readonly root: THREE.Object3D;
  update(x: number, y: number, z: number, fx: number, fz: number, pose: Pose, dt: number): void;
  flash(): void;
  setAura(opacity: number, color?: string): void;
  setVisible(v: boolean): void;
  trailPoints(out: { base: THREE.Vector3; tip: THREE.Vector3 }[]): number;
  headWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

/** Owns the three.js scene: stage, heroes, camera, effects, debug overlay (PLAN §5.1). */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 700);
  private views: FighterView[] = [];
  private chars: number[] = [-1, -1];
  private disposed = false;
  private effects: Effects;
  private overlay = new HitboxOverlay();
  private disposeStage: () => void;
  private camPos = new THREE.Vector3(0, 9, 14);
  private camTarget = new THREE.Vector3(0, 0.8, 0);
  private resizeObs: ResizeObserver;
  private flashEl: HTMLDivElement;
  private markers: THREE.Group[] = [];
  private markerDisposables: { dispose(): void }[] = [];
  private time = 0;
  private lastState: GameState | null = null;
  private upgrades: Promise<void>[] = [];
  showHitboxes = false;
  mirrored: boolean;

  constructor(
    private host: HTMLElement,
    private opts: RendererOptions = {},
  ) {
    const quality = opts.quality ?? 'medium';
    this.mirrored = !!opts.mirrored;
    this.renderer = new THREE.WebGLRenderer({
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1),
    );
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.appendChild(canvas);
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'screen-flash';
    host.appendChild(this.flashEl);

    this.disposeStage = buildStage(this.scene, opts.stage ?? 'rooftop-dusk');
    this.effects = new Effects(this.scene, {
      onEvent: (e) => {
        if (e.type === EV.HIT || e.type === EV.GUARD_BREAK) this.views[e.fighter]?.flash();
        opts.onEvent?.(e);
      },
      onCancel: opts.onCancel,
    });
    this.scene.add(this.overlay.group);
    for (let i = 0; i < 2; i++)
      this.markers.push(this.makeMarker(i === 0 ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2));

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
  }

  /** A coloured ring under each hero and a chevron over their head. */
  private makeMarker(color: string): THREE.Group {
    const g = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.5, 0.6, 48);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    ring.name = 'ring';
    const chevGeo = new THREE.ConeGeometry(0.13, 0.22, 3);
    const chev = new THREE.Mesh(chevGeo, mat);
    chev.rotation.x = Math.PI;
    chev.name = 'chev';
    g.add(ring, chev);
    this.markerDisposables.push(ringGeo, chevGeo, mat);
    this.scene.add(g);
    return g;
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  private ensureFighters(s: GameState) {
    for (let i = 0; i < 2; i++) {
      const c = s.fighters[i]!.char;
      if (this.chars[i] === c) continue;
      if (this.views[i]) {
        this.scene.remove(this.views[i]!.root);
        this.views[i]!.dispose();
      }
      const id = ROSTER[c]!.id;
      const alt = i === 1 && s.fighters[0].char === c;
      const look = lookFor(id, alt);
      const m = new Mannequin(look, WEAPON_OF[id] ?? 'none') as unknown as FighterView;
      this.views[i] = m;
      this.chars[i] = c;
      this.scene.add(m.root);
      if (this.opts.models !== false) this.upgrades.push(this.upgrade(i, c, id, alt));
    }
  }

  /** Swap the mannequin for the hero's anime model once it has loaded. */
  private async upgrade(i: number, char: number, id: string, alt: boolean) {
    try {
      const entry = (await loadManifest())[id];
      if (!entry) return;
      const vrm = await loadVrm(`/models/${entry.file}`);
      if (this.disposed || this.chars[i] !== char) return;
      const look = lookFor(id, alt);
      const view = new HeroModel(vrm, look, WEAPON_OF[id] ?? 'none', entry.height * look.scale);
      const old = this.views[i]!;
      this.scene.remove(old.root);
      old.dispose();
      this.views[i] = view;
      this.scene.add(view.root);
    } catch (err) {
      console.warn(`[render] keeping the mannequin for ${id}:`, err);
    }
  }

  /** Draw the newest state (rollbacks already applied). `dtMs` is real time. */
  render(s: GameState, dtMs: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    this.time += dt;
    this.lastState = s;
    this.ensureFighters(s);
    const head = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i]!;
      const view = this.views[i]!;
      view.update(f.x, f.y, f.z, f.fx, f.fz, poseFor(s, i, this.time), dt);
      const a = actionOf(f);
      // Vanish for a moment when teleporting
      const blink = f.state === FS.ACTION && a?.teleport && Math.abs(f.actionFrame - a.teleport.frame) <= 2;
      view.setVisible(!blink);
      // Auras: armor buff, charging, ultimate
      const look = lookFor(ROSTER[f.char]!.id, false);
      const isUlt = f.state === FS.ACTION && f.action === ROSTER[f.char]!.ultIdx;
      if (isUlt || (s.freeze > 0 && s.freezeOwner === i))
        view.setAura(0.55 + Math.sin(this.time * 18) * 0.15, look.color);
      else if (f.state === FS.CHARGE)
        view.setAura(Math.min(0.5, f.stateFrame / 24) * (0.7 + Math.sin(this.time * 30) * 0.3), look.glow);
      else if (f.buffFrames > 0 && f.buffArmor)
        view.setAura(0.22 + Math.sin(this.time * 6) * 0.06, '#ffc74a');
      else view.setAura(0);
      // Player markers
      const mk = this.markers[i]!;
      mk.visible = s.phase !== PHASE.MATCH_END && f.state !== FS.FALLING && !this.opts.showcase;
      mk.position.set(f.x / 1000, 0, f.z / 1000);
      mk.getObjectByName('ring')!.visible = f.y < 3000 && f.x * f.x + f.z * f.z < 8200 * 8200;
      const chev = mk.getObjectByName('chev')!;
      view.headWorld(head);
      chev.position.set(0, Math.max(head.y + 0.45, 1.9 + f.y / 1000), 0);
      chev.position.y += Math.sin(this.time * 4 + i) * 0.05;
      chev.rotation.y = this.time * 1.5;
    }
    this.effects.sync(s);
    this.effects.world(s, this.views);
    this.effects.update(dt, this.camera);
    this.overlay.group.visible = this.showHitboxes;
    if (this.showHitboxes) this.overlay.update(s);
    this.updateCamera(s, dt);
    this.flashEl.style.opacity = String(Math.min(0.85, this.effects.flash));
    this.renderer.render(this.scene, this.camera);
  }

  /** Lost-Saga-style three-quarter view over the midpoint, zooming with the distance between heroes. */
  private updateCamera(s: GameState, dt: number) {
    const [a, b] = s.fighters;
    const ax = a.x / 1000;
    const az = a.z / 1000;
    const bx = b.x / 1000;
    const bz = b.z / 1000;
    // Ignore a hero who is falling off the roof (the camera stays on the arena)
    const aOut = a.state === FS.FALLING || a.y < -1500;
    const bOut = b.state === FS.FALLING || b.y < -1500;
    let mx = aOut ? bx : bOut ? ax : (ax + bx) / 2;
    let mz = aOut ? bz : bOut ? az : (az + bz) / 2;
    const sep = aOut || bOut ? 4 : Math.hypot(ax - bx, az - bz);
    let dist = Math.min(18, Math.max(10.5, 8 + sep * 0.75));
    // Portrait screens see less sideways: back off so both heroes stay in frame
    if (this.camera.aspect < 1) dist *= Math.min(1.7, 0.75 / this.camera.aspect);
    let elev = 0.62; // radians above the horizon
    let azim = this.mirrored ? Math.PI : 0;
    let lookY = 0.9;
    let k = 1 - Math.exp(-dt * 6);

    if (this.opts.showcase) {
      // Landing page: drift around the fight, framed to the right of the menu
      azim = this.time * 0.07;
      dist = Math.max(dist, 9.5);
      elev = 0.36;
      const side = 3.2;
      mx -= Math.cos(azim) * side;
      mz += Math.sin(azim) * side;
      k = 1 - Math.exp(-dt * 2);
    } else if (s.freeze > 0 && s.freezeOwner >= 0) {
      // Ultimate cut-in: swing in close on the user
      const f = s.fighters[s.freezeOwner]!;
      mx = f.x / 1000;
      mz = f.z / 1000;
      azim = Math.atan2(f.fx, f.fz) + 0.55;
      dist = 5.4;
      elev = 0.2;
      lookY = 1.25;
      k = 1 - Math.exp(-dt * 9);
    } else if (s.phase === PHASE.INTRO) {
      const t = Math.min(1, s.phaseFrame / 100);
      const e = 1 - (1 - t) ** 3;
      azim += (1 - e) * 1.4;
      dist += (1 - e) * 6;
      elev += (1 - e) * 0.2;
      k = 1 - Math.exp(-dt * 8);
    } else if (s.phase === PHASE.KO) {
      const t = Math.min(1, s.phaseFrame / 70);
      dist -= 2.5 * t;
      azim += 0.4 * t;
    } else if (s.phase === PHASE.ROUND_END || s.phase === PHASE.MATCH_END) {
      const w = s.phase === PHASE.MATCH_END ? s.matchWinner : s.endWinner;
      if (w >= 0) {
        const f = s.fighters[w]!;
        mx = f.x / 1000;
        mz = f.z / 1000;
        azim = Math.atan2(f.fx, f.fz) + 0.35;
        dist = 5;
        elev = 0.2;
        lookY = 1.15;
        k = 1 - Math.exp(-dt * 2.5);
      }
    }
    const want = new THREE.Vector3(
      mx + Math.sin(azim) * Math.cos(elev) * dist,
      lookY + Math.sin(elev) * dist,
      mz + Math.cos(azim) * Math.cos(elev) * dist,
    );
    this.camPos.lerp(want, k);
    this.camTarget.lerp(new THREE.Vector3(mx, lookY, mz), k);
    this.camera.position.copy(this.camPos);
    if (this.effects.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.effects.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.effects.shake;
    }
    this.camera.lookAt(this.camTarget);
  }

  /** Resolves once the heroes' models have loaded (or failed) for the given state. */
  whenReady(s: GameState): Promise<void> {
    this.ensureFighters(s);
    return Promise.allSettled(this.upgrades).then(() => undefined);
  }

  /** Screen position (0–1) of a world point in mm (for the HUD). */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x / 1000, y / 1000, z / 1000).project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  get state(): GameState | null {
    return this.lastState;
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObs.disconnect();
    this.effects.dispose();
    this.overlay.dispose();
    for (const v of this.views) v.dispose();
    for (const d of this.markerDisposables) d.dispose();
    this.disposeStage();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.flashEl.remove();
  }
}
