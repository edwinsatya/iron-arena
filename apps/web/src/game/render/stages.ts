import * as THREE from 'three';

/** Render-only seeded random so the city looks the same for everyone. */
export function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const ARENA_RADIUS = 8.2;

export const PLAYER_COLORS = { p1: '#ff4b3e', p2: '#3d8bff' } as const;

interface StageLook {
  skyTop: string;
  skyMid: string;
  skyLow: string;
  sun: string;
  sunPos: [number, number, number];
  sunSize: number;
  fog: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  key: string;
  keyIntensity: number;
  keyPos: [number, number, number];
  floor: string;
  floorLine: string;
  rim: string;
  windows: string[];
  windowChance: number;
  tower: string;
  cloud: [string, string];
  clouds: number;
  stars: boolean;
}

const LOOKS: Record<string, StageLook> = {
  'rooftop-dusk': {
    skyTop: '#3d56b0',
    skyMid: '#f08a74',
    skyLow: '#ffd59a',
    sun: '#fff1c4',
    sunPos: [-60, 9, -120],
    sunSize: 9,
    fog: '#e9a184',
    hemiSky: '#ffd6b0',
    hemiGround: '#55407a',
    hemi: 1.3,
    key: '#ffd3a0',
    keyIntensity: 2.6,
    keyPos: [-9, 11, -4],
    floor: '#c9bfb4',
    floorLine: '#8f8174',
    rim: '#ffb43a',
    windows: ['#ffd38a', '#ffe9b8', '#ff9d6b'],
    windowChance: 0.18,
    tower: '#7b6a8f',
    cloud: ['#fff2e0', '#f3a99a'],
    clouds: 14,
    stars: false,
  },
  'rooftop-night': {
    skyTop: '#07071a',
    skyMid: '#1c1747',
    skyLow: '#5a2a6b',
    sun: '#f4f1ff',
    sunPos: [50, 40, -110],
    sunSize: 5,
    fog: '#1d1640',
    hemiSky: '#7d7fe0',
    hemiGround: '#1b1030',
    hemi: 1.05,
    key: '#cfd6ff',
    keyIntensity: 2.1,
    keyPos: [6, 12, 5],
    floor: '#4a4560',
    floorLine: '#2a263d',
    rim: '#56e6ff',
    windows: ['#ffd38a', '#ff7ab8', '#7ae8ff'],
    windowChance: 0.36,
    tower: '#29243f',
    cloud: ['#3a3270', '#1f1b45'],
    clouds: 8,
    stars: true,
  },
};

/**
 * Skyline Rooftop: a round helipad on top of a skyscraper, high above the city. There is no
 * railing — knock your opponent over the edge for a ring-out.
 */
export function buildStage(scene: THREE.Scene, stageId: string): () => void {
  const L = LOOKS[stageId] ?? LOOKS['rooftop-dusk']!;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const rnd = seeded(stageId.length * 31);

  scene.background = new THREE.Color(L.skyMid);
  scene.fog = new THREE.Fog(L.fog, 45, 190);

  // Sky dome: three-band gradient with a soft sun glow
  const skyMat = keep(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(L.skyTop) },
        mid: { value: new THREE.Color(L.skyMid) },
        low: { value: new THREE.Color(L.skyLow) },
        sunDir: { value: new THREE.Vector3(...L.sunPos).normalize() },
        sunCol: { value: new THREE.Color(L.sun) },
      },
      vertexShader:
        'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vPos;
        void main(){
          vec3 d = normalize(vPos); float h = d.y;
          vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.75, h)) : mix(low, mid, smoothstep(-0.25, 0.12, h));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 24.0) * 0.55 + pow(s, 4.0) * 0.12);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(new THREE.Mesh(keep(new THREE.SphereGeometry(300, 32, 16)), skyMat));

  // Sun or moon disc
  const disc = new THREE.Mesh(
    keep(new THREE.CircleGeometry(L.sunSize, 40)),
    keep(new THREE.MeshBasicMaterial({ color: L.sun, fog: false })),
  );
  disc.position.set(...L.sunPos);
  disc.lookAt(0, 0, 0);
  scene.add(disc);

  // Stars
  if (L.stars) {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.15 + rnd() * 1.3;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 280;
      pos[i * 3 + 1] = Math.sin(e) * 280;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 280;
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(
      new THREE.Points(
        g,
        keep(new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, fog: false })),
      ),
    );
  }

  // Cel-shaded clouds (two-tone painted billboards)
  const cloudTex = keep(
    canvasTexture(512, 256, (g) => {
      const puff = (x: number, y: number, r: number, c: string) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      };
      const blobs: [number, number, number][] = [
        [120, 170, 70],
        [200, 130, 90],
        [300, 140, 80],
        [380, 175, 60],
        [250, 185, 70],
      ];
      for (const [x, y, r] of blobs) puff(x, y + 14, r, L.cloud[1]);
      for (const [x, y, r] of blobs) puff(x, y, r * 0.92, L.cloud[0]);
    }),
  );
  const cloudMat = keep(
    new THREE.MeshBasicMaterial({
      map: cloudTex,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.95,
    }),
  );
  const cloudGeo = keep(new THREE.PlaneGeometry(1, 0.5));
  for (let i = 0; i < L.clouds; i++) {
    const a = -Math.PI * 0.9 + rnd() * Math.PI * 0.8 + (i % 3 === 0 ? Math.PI : 0);
    const d = 150 + rnd() * 90;
    const c = new THREE.Mesh(cloudGeo, cloudMat);
    const w = 40 + rnd() * 50;
    c.scale.set(w, w, 1);
    c.position.set(Math.cos(a) * d, 4 + rnd() * 40, Math.sin(a) * d);
    c.lookAt(0, c.position.y, 0);
    scene.add(c);
  }

  // Lights
  scene.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi));
  const key = new THREE.DirectionalLight(L.key, L.keyIntensity);
  key.position.set(...L.keyPos);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -11;
  sc.right = 11;
  sc.top = 11;
  sc.bottom = -11;
  sc.near = 1;
  sc.far = 40;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const fill = new THREE.DirectionalLight(L.rim, 0.6);
  fill.position.set(8, 3, 10);
  scene.add(fill);

  // The helipad: concrete, painted crest, hazard ring at the edge
  const R = ARENA_RADIUS;
  const floorTex = keep(
    canvasTexture(2048, 2048, (g) => {
      const c = 1024;
      const px = c / R; // pixels per metre
      g.fillStyle = L.floor;
      g.fillRect(0, 0, 2048, 2048);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.05})`;
        g.fillRect(rnd() * 2048, rnd() * 2048, 2 + rnd() * 8, 2 + rnd() * 8);
      }
      // Panel seams
      g.strokeStyle = L.floorLine;
      g.globalAlpha = 0.5;
      g.lineWidth = 3;
      for (let i = 1; i < 8; i++) {
        g.beginPath();
        g.moveTo((i * 2048) / 8, 0);
        g.lineTo((i * 2048) / 8, 2048);
        g.moveTo(0, (i * 2048) / 8);
        g.lineTo(2048, (i * 2048) / 8);
        g.stroke();
      }
      g.globalAlpha = 1;
      // Hazard ring (the danger zone near the edge)
      const r0 = 7.15 * px;
      const r1 = 8.2 * px;
      g.save();
      g.beginPath();
      g.arc(c, c, r1, 0, Math.PI * 2);
      g.arc(c, c, r0, 0, Math.PI * 2, true);
      g.clip('evenodd');
      g.fillStyle = '#1b1820';
      g.fillRect(0, 0, 2048, 2048);
      g.fillStyle = '#ffc531';
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) {
        g.beginPath();
        g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        g.lineTo(c + Math.cos(a + 0.03) * r1, c + Math.sin(a + 0.03) * r1);
        g.lineTo(c + Math.cos(a + 0.075) * r1, c + Math.sin(a + 0.075) * r1);
        g.lineTo(c + Math.cos(a + 0.045) * r0, c + Math.sin(a + 0.045) * r0);
        g.fill();
      }
      g.restore();
      // Crest: two rings and a four-point star
      g.strokeStyle = '#ffffff';
      g.globalAlpha = 0.75;
      g.lineWidth = 16;
      g.beginPath();
      g.arc(c, c, 5.2 * px, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c, c, 4.7 * px, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = L.rim;
      g.globalAlpha = 0.55;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 - Math.PI / 2;
        const r = k % 2 === 0 ? 3.6 * px : 0.9 * px;
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      // Start marks
      for (const sx of [-3.2, 3.2]) {
        g.strokeStyle = sx < 0 ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2;
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(c + sx * px - 40, c);
        g.lineTo(c + sx * px + 40, c);
        g.moveTo(c + sx * px, c - 40);
        g.lineTo(c + sx * px, c + 40);
        g.stroke();
      }
    }),
  );
  const top = new THREE.Mesh(
    keep(new THREE.CircleGeometry(R, 96)),
    keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.02 })),
  );
  top.rotation.x = -Math.PI / 2;
  top.receiveShadow = true;
  scene.add(top);
  const sideMat = keep(new THREE.MeshStandardMaterial({ color: L.tower, roughness: 0.85 }));
  const lip = new THREE.Mesh(keep(new THREE.CylinderGeometry(R, R * 0.97, 1.2, 96, 1, true)), sideMat);
  lip.position.y = -0.6;
  scene.add(lip);
  // Glowing rim
  const rim = new THREE.Mesh(
    keep(new THREE.TorusGeometry(R, 0.05, 6, 160)),
    keep(new THREE.MeshBasicMaterial({ color: L.rim, toneMapped: false })),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.02;
  scene.add(rim);

  // The skyscraper under the pad
  const winTex = keep(
    canvasTexture(128, 256, (g) => {
      g.fillStyle = L.tower;
      g.fillRect(0, 0, 128, 256);
      for (let y = 4; y < 256; y += 10) {
        for (let x = 4; x < 128; x += 9) {
          const r = rnd();
          g.fillStyle =
            r < L.windowChance ? L.windows[Math.floor(rnd() * L.windows.length)]! : 'rgba(0,0,0,0.35)';
          g.globalAlpha = r < L.windowChance ? 0.6 + rnd() * 0.4 : 1;
          g.fillRect(x, y, 5, 6);
        }
      }
      g.globalAlpha = 1;
    }),
  );
  winTex.wrapS = THREE.RepeatWrapping;
  winTex.wrapT = THREE.RepeatWrapping;
  const towerMat = keep(new THREE.MeshBasicMaterial({ map: winTex }));
  const towerBody = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(R * 0.95, R * 1.05, 120, 12, 1, true)),
    towerMat,
  );
  towerBody.position.y = -61.2;
  winTex.repeat.set(6, 12);
  scene.add(towerBody);

  // Floodlight masts just outside the pad (cosmetic)
  const mastMat = keep(new THREE.MeshToonMaterial({ color: '#3d3755' }));
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false }));
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const x = Math.cos(a) * (R + 0.6);
    const z = Math.sin(a) * (R + 0.6);
    const mast = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.1, 5, 8)), mastMat);
    mast.position.set(x, 1.3, z);
    scene.add(mast);
    const lamp = new THREE.Mesh(keep(new THREE.BoxGeometry(0.8, 0.35, 0.25)), lampMat);
    lamp.position.set(x, 3.85, z);
    lamp.lookAt(0, 0, 0);
    scene.add(lamp);
  }

  // The city far below
  const cityTex = keep(
    canvasTexture(64, 128, (g) => {
      g.fillStyle = L.tower;
      g.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 8) {
        for (let x = 4; x < 64; x += 8) {
          if (rnd() < L.windowChance) {
            g.fillStyle = L.windows[Math.floor(rnd() * L.windows.length)]!;
            g.globalAlpha = 0.5 + rnd() * 0.5;
            g.fillRect(x, y, 4, 4);
          }
        }
      }
      g.globalAlpha = 1;
    }),
  );
  cityTex.wrapS = THREE.RepeatWrapping;
  cityTex.wrapT = THREE.RepeatWrapping;
  cityTex.magFilter = THREE.NearestFilter;
  const COUNT = 260;
  const city = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(1, 1, 1)),
    keep(new THREE.MeshBasicMaterial({ map: cityTex })),
    COUNT,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < COUNT; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 18 + rnd() * 130;
    const w = 4 + rnd() * 9;
    const h = 20 + rnd() * rnd() * 90;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    m.compose(
      new THREE.Vector3(Math.cos(a) * d, -120 + h / 2 - (d < 40 ? 25 : 0), Math.sin(a) * d),
      q,
      new THREE.Vector3(w, h, w * (0.6 + rnd() * 0.8)),
    );
    city.setMatrixAt(i, m);
  }
  scene.add(city);
  const ground = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(600, 600)),
    keep(new THREE.MeshBasicMaterial({ color: L.fog })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -120;
  scene.add(ground);

  return () => {
    for (const d of disposables) d.dispose();
    city.dispose();
  };
}
