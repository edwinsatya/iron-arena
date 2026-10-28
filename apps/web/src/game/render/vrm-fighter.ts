import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { groundedHipHeight, type Limb, type Pose } from './poses';

/**
 * An anime (VRM) character posed by the same procedural pose system as the mannequin, so strikes
 * still reach full extension exactly on their first active frame (PLAN §5.2). VRM files come from
 * VRoid Studio (free) or any VRM 0.x/1.0 model — see docs/CHARACTERS.md.
 */

/** Mannequin leg length the poses are authored for (m). */
const POSE_LEG = 0.9;

const Z_NEG_90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
const Z_POS_90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const;
const JOINTS = ['Proximal', 'Intermediate', 'Distal'] as const;

export interface LoadedVrm {
  vrm: VRM;
  url: string;
}

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

export async function loadVrm(url: string): Promise<VRM> {
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`${url} is not a VRM model`);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // VRM 0.x faces −Z; make every model face +Z
  vrm.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  return vrm;
}

export class VrmFighter {
  readonly root = new THREE.Group();
  private hips0 = 0.9;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private scale: number;

  constructor(
    private vrm: VRM,
    playerColor: string,
    /** Target eye-line height of the character in metres. */
    height: number,
  ) {
    this.root.add(vrm.scene);
    const h = vrm.humanoid;
    const hips = h.getNormalizedBoneNode('hips');
    const head = h.getNormalizedBoneNode('head');
    vrm.scene.updateMatrixWorld(true);
    this.hips0 = hips?.position.y || 0.9;
    const headY = head ? head.getWorldPosition(new THREE.Vector3()).y : this.hips0 * 1.75;
    this.scale = height / Math.max(0.5, headY);
    vrm.scene.scale.setScalar(this.scale);
    vrm.scene.updateMatrixWorld(true);
    vrm.springBoneManager?.setInitState(); // hair/cloth springs start from the scaled rest pose
    vrm.expressionManager?.setValue('angry', 0.35);

    this.ringMat = new THREE.MeshBasicMaterial({ color: playerColor, transparent: true, opacity: 0.85, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.012;
    this.root.add(this.ring);
    this.curlFingers(1.25);
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
    // T-pose arms point sideways; the poses are authored for arms hanging down.
    const c = side === 1 ? Z_NEG_90 : Z_POS_90;
    const cInv = side === 1 ? Z_POS_90 : Z_NEG_90;
    if (upper) {
      tmpE.set(-l.raise, 0, side * l.out, 'XYZ');
      upper.quaternion.setFromEuler(tmpE).multiply(c);
    }
    if (lower) {
      tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -l.bend);
      lower.quaternion.copy(cInv).multiply(tmpQ).multiply(c);
    }
  }

  private leg(side: 1 | -1, l: Limb) {
    const upper = this.bone(side === 1 ? 'leftUpperLeg' : 'rightUpperLeg');
    const lower = this.bone(side === 1 ? 'leftLowerLeg' : 'rightLowerLeg');
    const foot = this.bone(side === 1 ? 'leftFoot' : 'rightFoot');
    upper?.rotation.set(-l.raise, 0, side * l.out);
    lower?.rotation.set(l.bend, 0, 0);
    // Keep the sole roughly level
    foot?.rotation.set(Math.max(-0.6, Math.min(0.6, l.raise - l.bend)), 0, 0);
  }

  update(x: number, y: number, z: number, dirX: number, dirZ: number, pose: Pose, dt: number): void {
    this.root.position.set(x / 1000, y / 1000, z / 1000);
    this.root.rotation.y = Math.atan2(dirX, dirZ);
    const k = this.hips0 / POSE_LEG;
    const hips = this.bone('hips');
    if (hips) {
      const h = pose.ground ? groundedHipHeight(pose) + pose.lift : pose.lift;
      hips.position.set(0, h * k, pose.forward * k);
      hips.rotation.set(-pose.pitch, 0, 0);
    }
    const spine = this.bone('spine');
    const chest = this.bone('chest') ?? this.bone('upperChest');
    spine?.rotation.set(pose.lean * 0.5, pose.twist * 0.5, 0, 'YXZ');
    chest?.rotation.set(pose.lean * 0.5, pose.twist * 0.5, 0, 'YXZ');
    this.bone('head')?.rotation.set(pose.head, 0, 0);
    this.arm(1, pose.la);
    this.arm(-1, pose.ra);
    this.leg(1, pose.ll);
    this.leg(-1, pose.rl);
    this.vrm.update(Math.min(dt, 1 / 30));
    this.ring.position.y = 0.012 - y / 1000;
    this.ringMat.opacity = Math.max(0.15, 0.85 - y / 1500);
  }

  dispose(): void {
    VRMUtils.deepDispose(this.vrm.scene);
    this.ring.geometry.dispose();
    this.ringMat.dispose();
  }
}
