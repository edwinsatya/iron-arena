import * as THREE from 'three';
import type { Look } from './looks';
import { buildWeapons, type WeaponSet } from './weapons';
import { groundedHipHeight, LIMBS, type Pose } from './poses';

let gradient: THREE.DataTexture | null = null;

/** 3-band toon ramp shared by every cel-shaded material (PLAN §3.1). */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color: string, emissive = 0): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
  if (emissive) {
    m.emissive = new THREE.Color(color);
    m.emissiveIntensity = emissive;
  }
  return m;
}

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x07060f, side: THREE.BackSide });

/** A mesh plus an inverted-hull outline. */
function part(geo: THREE.BufferGeometry, mat: THREE.Material, outline = 1.07): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  const hull = new THREE.Mesh(geo, OUTLINE);
  hull.scale.setScalar(outline);
  hull.raycast = () => {};
  mesh.add(hull);
  return mesh;
}

function capsule(r: number, len: number): THREE.CapsuleGeometry {
  return new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 12);
}

/** A stylized cel-shaded fighter built from capsules, posed from simulation state. */
export class Mannequin {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private ls = new THREE.Group();
  private rs = new THREE.Group();
  private le = new THREE.Group();
  private re = new THREE.Group();
  private lh = new THREE.Group();
  private rh = new THREE.Group();
  private lk = new THREE.Group();
  private rk = new THREE.Group();
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  private weapons: WeaponSet;
  private flashT = 0;
  private visibleFlag = true;

  constructor(
    readonly look: Look,
    weaponKind: string,
  ) {
    const heavy = look.build === 'heavy';
    const top = this.mat(toon(look.primary));
    const pants = this.mat(toon(look.secondary));
    const skin = this.mat(toon(look.skin));
    const hair = this.mat(toon(look.hairColor));
    const accent = this.mat(toon(look.accent, 0.15));
    const shoe = this.mat(toon('#1a1726'));

    this.root.add(this.body);
    this.root.scale.setScalar(look.scale);

    // Pelvis + belt
    const pelvis = part(this.geo(capsule(heavy ? 0.15 : 0.12, heavy ? 0.36 : 0.3)), pants);
    pelvis.rotation.z = Math.PI / 2;
    this.body.add(pelvis);
    const belt = part(
      this.geo(new THREE.CylinderGeometry(heavy ? 0.175 : 0.135, heavy ? 0.175 : 0.135, 0.05, 16)),
      accent,
      1.04,
    );
    belt.position.y = 0.07;
    this.body.add(belt);

    // Torso
    this.body.add(this.torso);
    const chest = part(this.geo(capsule(heavy ? 0.19 : 0.15, LIMBS.torso)), top);
    chest.position.y = LIMBS.torso / 2;
    chest.scale.set(heavy ? 1.32 : 1.22, 1, heavy ? 0.95 : 0.85);
    this.torso.add(chest);

    // Neck + head
    const neck = part(this.geo(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10)), skin);
    neck.position.y = LIMBS.torso + 0.03;
    this.torso.add(neck);
    this.head.position.y = LIMBS.torso + 0.06;
    this.torso.add(this.head);
    const skull = part(this.geo(new THREE.SphereGeometry(0.11, 16, 12)), skin);
    skull.position.y = 0.11;
    skull.scale.set(0.95, 1.08, 1);
    this.head.add(skull);
    if (heavy) {
      const beard = part(this.geo(new THREE.SphereGeometry(0.085, 12, 8)), hair, 1.05);
      beard.position.set(0, 0.04, 0.07);
      beard.scale.set(1.1, 0.9, 0.8);
      this.head.add(beard);
      const band = part(this.geo(new THREE.TorusGeometry(0.105, 0.016, 6, 20)), accent, 1.1);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.16;
      this.head.add(band);
    } else {
      const cap = part(
        this.geo(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        hair,
        1.04,
      );
      cap.position.set(0, 0.125, -0.012);
      this.head.add(cap);
      for (let i = 0; i < 5; i++) {
        const spike = part(this.geo(new THREE.ConeGeometry(0.035, 0.13, 6)), hair, 1.06);
        const a = -0.9 + i * 0.45;
        spike.position.set(Math.sin(a) * 0.08, 0.2, -0.03 - Math.cos(a) * 0.04);
        spike.rotation.set(-0.7, 0, -a * 0.8);
        this.head.add(spike);
      }
      const band = part(this.geo(new THREE.TorusGeometry(0.112, 0.014, 6, 20)), accent, 1.1);
      band.rotation.x = Math.PI / 2 - 0.15;
      band.position.y = 0.15;
      this.head.add(band);
    }
    const eyes = this.mat(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    for (const x of [-0.04, 0.04]) {
      const eye = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.035, 0.012, 0.01)), eyes);
      eye.position.set(x, 0.125, 0.1);
      this.head.add(eye);
    }

    // Arms (left = +X, the lead side)
    const armR = heavy ? 0.078 : 0.058;
    const shoulderX = heavy ? 0.25 : 0.19;
    for (const [shoulder, elbow, side] of [
      [this.ls, this.le, 1],
      [this.rs, this.re, -1],
    ] as const) {
      shoulder.position.set(side * shoulderX, LIMBS.torso - 0.06, 0);
      this.torso.add(shoulder);
      const upper = part(this.geo(capsule(armR, LIMBS.upperArm + armR)), top);
      upper.position.y = -LIMBS.upperArm / 2;
      shoulder.add(upper);
      elbow.position.y = -LIMBS.upperArm;
      shoulder.add(elbow);
      const fore = part(this.geo(capsule(armR * 0.88, LIMBS.forearm)), skin);
      fore.position.y = -LIMBS.forearm / 2;
      elbow.add(fore);
      const fist = part(this.geo(new THREE.SphereGeometry(armR * 1.25, 12, 10)), accent);
      fist.position.y = -LIMBS.forearm - 0.02;
      elbow.add(fist);
    }

    // Legs
    const legR = heavy ? 0.095 : 0.075;
    for (const [hip, knee, side] of [
      [this.lh, this.lk, 1],
      [this.rh, this.rk, -1],
    ] as const) {
      hip.position.set(side * (heavy ? 0.12 : 0.1), -0.02, 0);
      this.body.add(hip);
      const thigh = part(this.geo(capsule(legR, LIMBS.thigh + legR * 0.5)), pants);
      thigh.position.y = -LIMBS.thigh / 2;
      hip.add(thigh);
      knee.position.y = -LIMBS.thigh;
      hip.add(knee);
      const shin = part(this.geo(capsule(legR * 0.85, LIMBS.shin)), pants);
      shin.position.y = -LIMBS.shin / 2;
      knee.add(shin);
      const foot = part(this.geo(new THREE.BoxGeometry(0.1, 0.07, 0.25)), shoe, 1.1);
      foot.position.set(0, -LIMBS.shin - 0.01, 0.06);
      knee.add(foot);
    }

    // Weapons in the fists: grip at the fist, blade forward (+Z) when the arm hangs down
    this.weapons = buildWeapons(weaponKind, look.color, look.glow);
    for (const [part, elbow] of [
      [this.weapons.right, this.re],
      [this.weapons.left, this.le],
    ] as const) {
      if (!part) continue;
      part.group.position.y = -LIMBS.forearm - 0.02;
      part.group.rotation.x = Math.PI / 2;
      elbow.add(part.group);
    }
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  /** Place and pose the fighter. Position in mm (sim units), facing as a unit vector × 1024. */
  update(x: number, y: number, z: number, fx: number, fz: number, pose: Pose, dt = 0): void {
    this.root.position.set(x / 1000, y / 1000, z / 1000);
    const face = Math.atan2(fx, fz);
    this.body.rotation.set(-pose.pitch, face + pose.yaw, 0, 'YXZ');
    this.body.position.set(Math.sin(face) * pose.forward, 0, Math.cos(face) * pose.forward);
    this.body.position.y = pose.ground ? groundedHipHeight(pose) + pose.lift : 0.95 + pose.lift;
    this.torso.rotation.set(pose.lean, -pose.twist, 0, 'YXZ');
    this.head.rotation.x = pose.head;
    this.ls.rotation.set(-pose.la.raise, 0, pose.la.out);
    this.le.rotation.x = -pose.la.bend;
    this.rs.rotation.set(-pose.ra.raise, 0, -pose.ra.out);
    this.re.rotation.x = -pose.ra.bend;
    this.lh.rotation.set(-pose.ll.raise, 0, pose.ll.out);
    this.lk.rotation.x = pose.ll.bend;
    this.rh.rotation.set(-pose.rl.raise, 0, -pose.rl.out);
    this.rk.rotation.x = pose.rl.bend;
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    this.body.visible = this.visibleFlag;
  }

  flash(): void {
    this.flashT = 0.12;
  }

  setAura(_opacity: number, _color?: string): void {}

  setVisible(v: boolean): void {
    this.visibleFlag = v;
  }

  trailPoints(out: { base: THREE.Vector3; tip: THREE.Vector3 }[]): number {
    const part = this.weapons.right;
    if (!part?.base || !part.tip) return 0;
    const o = out[0] ?? (out[0] = { base: new THREE.Vector3(), tip: new THREE.Vector3() });
    o.base.copy(part.base).applyMatrix4(part.group.matrixWorld);
    o.tip.copy(part.tip).applyMatrix4(part.group.matrixWorld);
    return 1;
  }

  tipWorld(hand: 'right' | 'left', out: THREE.Vector3): boolean {
    const part = hand === 'right' ? this.weapons.right : this.weapons.left;
    if (!part?.tip) return false;
    out.copy(part.tip).applyMatrix4(part.group.matrixWorld);
    return true;
  }

  headWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.12, 0));
  }

  dispose(): void {
    this.weapons.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
