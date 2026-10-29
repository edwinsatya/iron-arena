import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Look } from './looks';
import { groundedHipHeight, type Limb, type Pose } from './poses';
import { buildWeapons, type WeaponPart, type WeaponSet } from './weapons';

/**
 * An anime (VRM) hero posed by the procedural pose system, with a weapon in hand, a tinted
 * outfit and a small accessory. VRM files come from VRoid Studio (free) — see docs/CHARACTERS.md.
 */

const POSE_LEG = 0.9;
const Z_NEG_90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
const Z_POS_90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const;
const JOINTS = ['Proximal', 'Intermediate', 'Distal'] as const;

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

const bufferCache = new Map<string, Promise<ArrayBuffer>>();

/** Load and parse a VRM. The file is fetched once per page; every call returns a fresh model. */
export async function loadVrm(url: string): Promise<VRM> {
  let buf = bufferCache.get(url);
  if (!buf) {
    buf = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    bufferCache.set(url, buf);
    buf.catch(() => bufferCache.delete(url));
  }
  const gltf = await loader.parseAsync((await buf).slice(0), url);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`${url} is not a VRM model`);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  return vrm;
}

type Manifest = Record<string, { file: string; height: number }>;
let manifestPromise: Promise<Manifest> | null = null;
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch('/models/manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
    .catch(() => ({}));
  return manifestPromise;
}

/** Material colour channels that tints apply to, by material name. */
function tintKind(name: string): 'hair' | 'top' | 'bottom' | null {
  const n = name.toLowerCase();
  if (n.includes('hair')) return 'hair';
  if (
    n.includes('top') ||
    n.includes('huku') ||
    n.includes('wear') ||
    (n.includes('cloth') && !n.includes('bottom') && !n.includes('shoe'))
  )
    return 'top';
  if (n.includes('bottom') || n.includes('shoe') || n.includes('backpack')) return 'bottom';
  return null;
}

interface Attached {
  part: WeaponPart;
  bone: THREE.Object3D;
}

let auraTex: THREE.CanvasTexture | null = null;
/** Vertical streaks that fade toward the top (shared by every aura). */
function auraTexture(): THREE.CanvasTexture {
  if (auraTex) return auraTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 256; x += 4) {
    const a = 0.25 + Math.abs(Math.sin(x * 0.37)) * 0.75;
    const grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.35})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 2 + (x % 3), 128);
  }
  auraTex = new THREE.CanvasTexture(c);
  auraTex.wrapS = THREE.RepeatWrapping;
  return auraTex;
}

export class HeroModel {
  readonly root = new THREE.Group();
  private hips0 = 0.9;
  private scale: number;
  private weapons: WeaponSet;
  private attached: Attached[] = [];
  private flashMats: THREE.Material[] = [];
  private flashT = 0;
  private aura: THREE.Mesh;
  private auraMat: THREE.MeshBasicMaterial;
  private extras: { dispose(): void }[] = [];

  constructor(
    private vrm: VRM,
    private look: Look,
    weaponKind: string,
    /** Head height in metres. */
    height: number,
  ) {
    this.root.add(vrm.scene);
    const h = vrm.humanoid;
    vrm.scene.updateMatrixWorld(true);
    const hips = h.getNormalizedBoneNode('hips');
    const head = h.getNormalizedBoneNode('head');
    this.hips0 = hips?.position.y || 0.9;
    const headY = head ? head.getWorldPosition(new THREE.Vector3()).y : this.hips0 * 1.75;
    this.scale = height / Math.max(0.5, headY);
    vrm.scene.scale.set(this.scale * look.bulk, this.scale, this.scale * look.bulk);
    vrm.scene.updateMatrixWorld(true);
    vrm.springBoneManager?.setInitState();
    vrm.expressionManager?.setValue('angry', 0.3);

    // Outfit tints (multiply onto the model's own textures); hide stand-in parts that don't fit
    const hide = (name: string) => !!look.hide?.some((h) => name.toLowerCase().includes(h));
    vrm.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (hide(mesh.name) || hide(mesh.parent?.name ?? '')) {
        mesh.visible = false;
        return;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (hide(m.name)) {
          m.visible = false;
          continue;
        }
        const kind = tintKind(m.name);
        const mm = m as THREE.Material & {
          color?: THREE.Color;
          shadeColorFactor?: THREE.Color;
          emissive?: THREE.Color;
        };
        if (kind && mm.color) {
          const c = new THREE.Color(look.tint[kind]);
          mm.color.multiply(c);
          mm.shadeColorFactor?.multiply(c);
        }
        if (mm.emissive) this.flashMats.push(m);
      }
    });

    // Weapons ride on the raw hand bones; their orientation is solved once in the rest pose.
    this.weapons = buildWeapons(weaponKind, look.color, look.glow);
    this.attach(this.weapons.right, 'rightHand');
    this.attach(this.weapons.left, 'leftHand');
    this.addAccessory();

    this.auraMat = new THREE.MeshBasicMaterial({
      color: look.color,
      map: auraTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const auraGeo = new THREE.CylinderGeometry(0.62, 0.5, 2.2, 32, 1, true);
    this.extras.push(auraGeo, { dispose: () => this.auraMat.dispose() });
    this.aura = new THREE.Mesh(auraGeo, this.auraMat);
    this.aura.position.y = 1.0;
    this.root.add(this.aura);

    this.curlFingers(
      weaponKind === 'staff' || weaponKind === 'katana' || weaponKind === 'pistols' ? 1.35 : 1.5,
    );
  }

  private attach(part: WeaponPart | null, name: VRMHumanBoneName) {
    if (!part) return;
    const bone = this.vrm.humanoid.getRawBoneNode(name);
    if (!bone) return;
    bone.updateWorldMatrix(true, false);
    const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
    const boneS = bone.getWorldScale(new THREE.Vector3());
    // Rest pose (T-pose, palms down, thumbs forward): the weapon points forward (+Z)
    const want = new THREE.Quaternion().setFromAxisAngle(X_AXIS, Math.PI / 2);
    part.group.quaternion.copy(boneQ.invert().multiply(want));
    part.group.scale.set(1 / boneS.x, 1 / boneS.y, 1 / boneS.z);
    // Sit in the palm, a little below the bone axis
    part.group.position.set(0, 0, 0);
    bone.add(part.group);
    this.attached.push({ part, bone });
  }

  private addAccessory() {
    const head = this.vrm.humanoid.getRawBoneNode('head');
    if (!head || this.look.accessory === 'none') return;
    head.updateWorldMatrix(true, false);
    const g = new THREE.Group();
    const q = head.getWorldQuaternion(new THREE.Quaternion());
    const sc = head.getWorldScale(new THREE.Vector3());
    g.quaternion.copy(q.invert());
    g.scale.set(1 / sc.x, 1 / sc.y, 1 / sc.z);
    const mat = new THREE.MeshToonMaterial({ color: this.look.color });
    this.extras.push(mat);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material = mat) => {
      this.extras.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      g.add(mesh);
      return mesh;
    };
    const headScale = this.scale;
    if (this.look.accessory === 'headband') {
      const band = add(new THREE.TorusGeometry(0.105 * headScale, 0.014 * headScale, 6, 28));
      band.rotation.x = Math.PI / 2 - 0.12;
      band.position.y = 0.1 * headScale;
      for (const s of [-1, 1]) {
        const tail = add(new THREE.BoxGeometry(0.02, 0.2, 0.004).scale(headScale, headScale, headScale));
        tail.position.set(s * 0.025 * headScale, 0.02 * headScale, -0.13 * headScale);
        tail.rotation.set(0.6, 0, s * 0.25);
      }
    } else if (this.look.accessory === 'scarf') {
      const scarf = add(new THREE.TorusGeometry(0.085 * headScale, 0.03 * headScale, 6, 20));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = -0.06 * headScale;
      const tail = add(new THREE.BoxGeometry(0.09, 0.42, 0.02).scale(headScale, headScale, headScale));
      tail.position.set(0.04 * headScale, -0.24 * headScale, -0.11 * headScale);
      tail.rotation.set(0.35, 0, 0.12);
    } else if (this.look.accessory === 'cap') {
      const dark = new THREE.MeshToonMaterial({ color: '#2c2a44' });
      this.extras.push(dark);
      const crown = add(
        new THREE.SphereGeometry(0.115 * headScale, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        dark,
      );
      crown.position.y = 0.1 * headScale;
      crown.scale.y = 0.55;
      const brim = add(new THREE.BoxGeometry(0.14, 0.012, 0.11).scale(headScale, headScale, headScale));
      brim.position.set(0, 0.105 * headScale, 0.12 * headScale);
      brim.rotation.x = -0.1;
    } else if (this.look.accessory === 'halo') {
      const glow = new THREE.MeshBasicMaterial({ color: this.look.glow, toneMapped: false });
      this.extras.push(glow);
      const halo = add(
        new THREE.TorusGeometry(0.17 * headScale, 0.008 * headScale, 6, 40, Math.PI * 1.5),
        glow,
      );
      halo.position.set(0, 0.16 * headScale, -0.14 * headScale);
      halo.rotation.z = Math.PI * 0.6;
    }
    head.add(g);
  }

  private bone(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  private curlFingers(amount: number) {
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? -1 : 1;
      for (const f of FINGERS) {
        for (const j of JOINTS) {
          const b = this.bone(`${side}${f}${j}` as VRMHumanBoneName);
          if (!b) continue;
          if (f === 'Thumb') b.rotation.set(0, sign * -0.5, 0);
          else b.rotation.set(0, 0, sign * amount);
        }
      }
    }
  }

  private arm(side: 1 | -1, l: Limb) {
    const upper = this.bone(side === 1 ? 'leftUpperArm' : 'rightUpperArm');
    const lower = this.bone(side === 1 ? 'leftLowerArm' : 'rightLowerArm');
    const c = side === 1 ? Z_NEG_90 : Z_POS_90;
    const cInv = side === 1 ? Z_POS_90 : Z_NEG_90;
    if (upper) {
      tmpE.set(-l.raise, 0, side * l.out, 'XYZ');
      upper.quaternion.setFromEuler(tmpE).multiply(c);
    }
    if (lower) {
      tmpQ.setFromAxisAngle(X_AXIS, -l.bend);
      lower.quaternion.copy(cInv).multiply(tmpQ).multiply(c);
    }
  }

  private leg(side: 1 | -1, l: Limb) {
    this.bone(side === 1 ? 'leftUpperLeg' : 'rightUpperLeg')?.rotation.set(-l.raise, 0, side * l.out);
    this.bone(side === 1 ? 'leftLowerLeg' : 'rightLowerLeg')?.rotation.set(l.bend, 0, 0);
    this.bone(side === 1 ? 'leftFoot' : 'rightFoot')?.rotation.set(
      Math.max(-0.6, Math.min(0.6, l.raise - l.bend)),
      0,
      0,
    );
  }

  /** Place and pose the hero. Position in mm, facing as a unit vector × 1024. */
  update(x: number, y: number, z: number, fx: number, fz: number, pose: Pose, dt: number): void {
    this.root.position.set(x / 1000, y / 1000, z / 1000);
    this.root.rotation.y = Math.atan2(fx, fz);
    const k = (this.hips0 / POSE_LEG) * 1;
    const hips = this.bone('hips');
    if (hips) {
      const h = pose.ground ? groundedHipHeight(pose) + pose.lift : 0.95 + pose.lift;
      hips.position.set(0, h * k, pose.forward * k);
      hips.rotation.set(-pose.pitch, pose.yaw, 0, 'YXZ');
    }
    this.bone('spine')?.rotation.set(pose.lean * 0.5, -pose.twist * 0.5, 0, 'YXZ');
    (this.bone('chest') ?? this.bone('upperChest'))?.rotation.set(
      pose.lean * 0.5,
      -pose.twist * 0.5,
      0,
      'YXZ',
    );
    this.bone('head')?.rotation.set(pose.head, 0, 0);
    this.arm(1, pose.la);
    this.arm(-1, pose.ra);
    this.leg(1, pose.ll);
    this.leg(-1, pose.rl);
    this.vrm.update(Math.min(dt, 1 / 30));

    // Hit flash
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const v = (this.flashT / 0.12) * 0.45;
      for (const m of this.flashMats)
        (m as THREE.Material & { emissive: THREE.Color }).emissive.setRGB(v, v, v);
    }
    this.aura.rotation.y += dt * 2;
    (this.auraMat.map as THREE.Texture).offset.x += dt * 0.3;
  }

  flash(): void {
    this.flashT = 0.12;
  }

  setAura(opacity: number, color?: string): void {
    this.auraMat.opacity = opacity;
    if (color) this.auraMat.color.set(color);
    this.aura.visible = opacity > 0.01;
  }

  setVisible(v: boolean): void {
    this.vrm.scene.visible = v;
  }

  /** World positions of the weapon trail points (right hand first). */
  trailPoints(out: { base: THREE.Vector3; tip: THREE.Vector3 }[]): number {
    let n = 0;
    for (const a of this.attached) {
      if (!a.part.base || !a.part.tip) continue;
      const o = out[n] ?? (out[n] = { base: new THREE.Vector3(), tip: new THREE.Vector3() });
      o.base.copy(a.part.base).applyMatrix4(a.part.group.matrixWorld);
      o.tip.copy(a.part.tip).applyMatrix4(a.part.group.matrixWorld);
      n++;
      if (n >= 1) break; // one trail per hero
    }
    return n;
  }

  /** Muzzle / staff tip in world space (muzzle flashes). */
  tipWorld(hand: 'right' | 'left', out: THREE.Vector3): boolean {
    const a = this.attached.find(
      (x) => x.part === (hand === 'right' ? this.weapons.right : this.weapons.left),
    );
    if (!a?.part.tip) return false;
    out.copy(a.part.tip).applyMatrix4(a.part.group.matrixWorld);
    return true;
  }

  headWorld(out: THREE.Vector3): THREE.Vector3 {
    const h = this.vrm.humanoid.getRawBoneNode('head');
    return h
      ? h.getWorldPosition(out)
      : out.set(this.root.position.x, this.root.position.y + 1.6, this.root.position.z);
  }

  dispose(): void {
    VRMUtils.deepDispose(this.vrm.scene);
    this.weapons.dispose();
    for (const e of this.extras) e.dispose();
    tmpV.set(0, 0, 0);
  }
}
