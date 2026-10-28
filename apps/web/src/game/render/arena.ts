import * as THREE from 'three';
import { toon } from './mannequin';

/** Render-only seeded random so the skyline looks the same for everyone. */
function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const PALETTE = {
  night: '#15122e',
  horizon: '#3a1d4f',
  p1: '#ff2e88',
  p2: '#2ee6ff',
  amber: '#ffb43a',
  moon: '#f2eeff',
};

/**
 * Skyline Rooftop: a 10 m × 10 m concrete roof with neon edge strips, a parapet, a water tower,
 * a "Skyline Crown" sign and a city of lit windows all around.
 */
export function buildArena(scene: THREE.Scene): () => void {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const rnd = seeded(7);

  scene.background = new THREE.Color(PALETTE.night);
  scene.fog = new THREE.Fog(PALETTE.night, 22, 95);

  // Sky dome with a warm haze at the horizon
  const skyGeo = keep(new THREE.SphereGeometry(140, 32, 16));
  const skyMat = keep(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#0c0a1f') },
        mid: { value: new THREE.Color(PALETTE.night) },
        low: { value: new THREE.Color('#5a2257') },
      },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vPos; void main(){ float h = normalize(vPos).y; vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.6, h)) : mix(low, mid, smoothstep(-0.05, 0.08, h)); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Moon
  const moon = new THREE.Mesh(keep(new THREE.CircleGeometry(4, 32)), keep(new THREE.MeshBasicMaterial({ color: PALETTE.moon, fog: false })));
  moon.position.set(-38, 34, -90);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  // Lights
  scene.add(new THREE.HemisphereLight('#6d74c9', '#1d0f2a', 1.1));
  const key = new THREE.DirectionalLight('#dfe2ff', 2.2);
  key.position.set(-4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const rimP1 = new THREE.PointLight(PALETTE.p1, 18, 14, 1.6);
  rimP1.position.set(-6, 2.2, -4);
  scene.add(rimP1);
  const rimP2 = new THREE.PointLight(PALETTE.p2, 18, 14, 1.6);
  rimP2.position.set(6, 2.2, -4);
  scene.add(rimP2);

  // Roof floor: concrete with tar seams and a painted ring
  const floorTex = keep(
    canvasTexture(1024, 1024, (g) => {
      g.fillStyle = '#2a2640';
      g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.05})`;
        g.fillRect(rnd() * 1024, rnd() * 1024, 2 + rnd() * 6, 2 + rnd() * 6);
      }
      g.strokeStyle = 'rgba(10,8,20,0.55)';
      g.lineWidth = 3;
      for (let i = 1; i < 6; i++) {
        g.beginPath();
        g.moveTo((i * 1024) / 6, 0);
        g.lineTo((i * 1024) / 6, 1024);
        g.moveTo(0, (i * 1024) / 6);
        g.lineTo(1024, (i * 1024) / 6);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,180,58,0.35)';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(512, 512, 300, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 4;
      g.beginPath();
      g.arc(512, 512, 330, 0, Math.PI * 2);
      g.stroke();
    }),
  );
  const floor = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(12, 12)),
    keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.05 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Neon edge strips at the stage bounds and a parapet beyond
  const stripMat = (c: string) => keep(new THREE.MeshBasicMaterial({ color: c }));
  const stripGeo = keep(new THREE.BoxGeometry(10.2, 0.04, 0.06));
  const sides: [number, number, number, string][] = [
    [0, -5.05, 0, PALETTE.p2],
    [0, 5.05, 0, PALETTE.p1],
    [-5.05, 0, Math.PI / 2, PALETTE.p1],
    [5.05, 0, Math.PI / 2, PALETTE.p2],
  ];
  const wallMat = keep(toon('#24203a'));
  const wallGeo = keep(new THREE.BoxGeometry(12.2, 0.55, 0.3));
  for (const [x, z, ry, c] of sides) {
    const s = new THREE.Mesh(stripGeo, stripMat(c));
    s.position.set(x, 0.03, z);
    s.rotation.y = ry;
    scene.add(s);
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(x * 1.19, 0.27, z * 1.19);
    w.rotation.y = ry;
    w.castShadow = true;
    w.receiveShadow = true;
    scene.add(w);
  }
  // Lower roof surround
  const surround = new THREE.Mesh(keep(new THREE.PlaneGeometry(40, 40)), keep(new THREE.MeshStandardMaterial({ color: '#191630', roughness: 1 })));
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.6;
  scene.add(surround);

  // Water tower (behind P1 corner)
  const tower = new THREE.Group();
  const metal = keep(toon('#3d3755'));
  const tank = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 18)), metal);
  tank.position.y = 3.2;
  const roof = new THREE.Mesh(keep(new THREE.ConeGeometry(1.25, 0.8, 18)), metal);
  roof.position.y = 4.5;
  tower.add(tank, roof);
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) {
    const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6)), metal);
    leg.position.set(x, 1.2, z);
    tower.add(leg);
  }
  tower.position.set(-8.5, -0.6, -8.2);
  scene.add(tower);

  // The tournament sign
  const drawSign = (g: CanvasRenderingContext2D) => {
      g.fillStyle = 'rgba(0,0,0,0)';
      g.clearRect(0, 0, 1024, 256);
      g.font = 'italic 900 150px Anton, Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = PALETTE.p1;
      g.shadowBlur = 30;
      g.strokeStyle = PALETTE.p1;
      g.lineWidth = 10;
      g.strokeText('SKYLINE CROWN', 512, 132);
      g.shadowBlur = 12;
      g.fillStyle = '#ffd0e6';
      g.fillText('SKYLINE CROWN', 512, 132);
  };
  const signTex = keep(canvasTexture(1024, 256, drawSign));
  // Redraw once the display font has loaded
  void document.fonts?.load('italic 900 150px Anton').then(() => {
    const c = signTex.image as HTMLCanvasElement;
    drawSign(c.getContext('2d')!);
    signTex.needsUpdate = true;
  });
  const sign = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(9, 2.25)),
    keep(new THREE.MeshBasicMaterial({ map: signTex, transparent: true, fog: false, depthWrite: false })),
  );
  sign.position.set(2.5, 6.4, -12);
  scene.add(sign);
  const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(9.4, 0.12, 0.12)), metal);
  frame.position.set(2.5, 5.1, -12.05);
  scene.add(frame);
  for (const x of [-1.2, 6.2]) {
    const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, 5.7, 0.12)), metal);
    post.position.set(x, 2.25, -12.1);
    scene.add(post);
  }

  // City: instanced towers with lit windows
  const winTex = keep(
    canvasTexture(64, 128, (g) => {
      g.fillStyle = '#100d22';
      g.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 8) {
        for (let x = 4; x < 64; x += 8) {
          const r = rnd();
          if (r < 0.32) {
            g.fillStyle = r < 0.06 ? '#ff7ab8' : r < 0.12 ? '#7ae8ff' : '#ffd38a';
            g.globalAlpha = 0.45 + rnd() * 0.55;
            g.fillRect(x, y, 4, 4);
          }
        }
      }
      g.globalAlpha = 1;
    }),
  );
  winTex.wrapS = THREE.RepeatWrapping;
  winTex.wrapT = THREE.RepeatWrapping;
  winTex.magFilter = THREE.NearestFilter;
  const towerGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const towerMat = keep(new THREE.MeshBasicMaterial({ map: winTex, color: '#b9b2e8' }));
  const COUNT = 170;
  const city = new THREE.InstancedMesh(towerGeo, towerMat, COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < COUNT; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 24 + rnd() * 60;
    const w = 3 + rnd() * 7;
    const h = 6 + rnd() * rnd() * 46;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    m.compose(new THREE.Vector3(Math.cos(a) * d, h / 2 - 14, Math.sin(a) * d), q, new THREE.Vector3(w, h, w * (0.6 + rnd() * 0.8)));
    city.setMatrixAt(i, m);
  }
  scene.add(city);

  return () => {
    for (const d of disposables) d.dispose();
    city.dispose();
  };
}
