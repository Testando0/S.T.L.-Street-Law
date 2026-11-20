import "./hypercar.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

function el<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento ausente: ${id}`);
  return node as unknown as T;
}

const app = document.querySelector<HTMLDivElement>("#app");
const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!app || !canvas) throw new Error("Cena indisponível");

const speedValue = el<HTMLSpanElement>("speed-value");
const speedStatus = el<HTMLSpanElement>("speed-status");
const gearReadout = el<HTMLSpanElement>("gear-readout");
const speedArc = el<SVGPathElement>("speed-arc-path");
const arcTicks = el<SVGGElement>("arc-ticks");
const boostBtn = el<HTMLButtonElement>("boost-btn");
const brakeBtn = el<HTMLButtonElement>("brake-btn");
const modeCopy = el<HTMLSpanElement>("mode-copy");
const autopilot = el<HTMLDivElement>("autopilot");
const toast = el<HTMLDivElement>("toast");
const cameraDock = document.querySelector<HTMLDivElement>(".camera-dock");
const cockpitOverlay = el<HTMLDivElement>("cockpit-overlay");
const specsModal = el<HTMLDivElement>("specs-modal");
const soundToggle = el<HTMLButtonElement>("sound-toggle");
const launchSmall = boostBtn.querySelector<HTMLElement>(".launch-btn-copy small");
const launchLabel = boostBtn.querySelector<HTMLElement>(".launch-btn-copy b");
const telDownforce = el<HTMLElement>("tel-downforce");
const telDownforceBar = el<HTMLElement>("tel-downforce-bar");
const telWing = el<HTMLElement>("tel-wing");
const telWingBar = el<HTMLElement>("tel-wing-bar");
const telSusp = el<HTMLElement>("tel-susp");
const telSuspBar = el<HTMLElement>("tel-susp-bar");
const telBrakes = el<HTMLElement>("tel-brakes");
const telBrakesBar = el<HTMLElement>("tel-brakes-bar");
const telN2 = el<HTMLElement>("tel-n2");
const telN2Bar = el<HTMLElement>("tel-n2-bar");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb8ad9b, 0.00175);

const camera = new THREE.PerspectiveCamera(41, window.innerWidth / window.innerHeight, 0.1, 1800);
camera.position.set(9.4, 4.4, -12.6);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.58, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 4.3;
controls.maxDistance = 17;
controls.minPolarAngle = 0.16;
controls.maxPolarAngle = Math.PI * 0.492;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.75;
controls.enabled = false;

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.52, 0.48, 0.74);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponível");
  return [textureCanvas, context];
}

function makeSaltTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const [textureCanvas, ctx] = makeCanvas(1024);
  const rng = random(1137);
  const image = ctx.createImageData(1024, 1024);
  for (let i = 0; i < image.data.length; i += 4) {
    const variation = (rng() - 0.5) * 24;
    const fine = rng() > 0.985 ? -35 : 0;
    image.data[i] = 218 + variation + fine;
    image.data[i + 1] = 211 + variation + fine;
    image.data[i + 2] = 196 + variation + fine;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  for (let i = 0; i < 120; i++) {
    const startX = rng() * 1024;
    const startY = rng() * 1024;
    let angle = rng() * Math.PI * 2;
    let x = startX;
    let y = startY;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 18 + Math.floor(rng() * 55);
    for (let step = 0; step < steps; step++) {
      angle += (rng() - 0.5) * 0.55;
      const length = 2 + rng() * 9;
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
      ctx.lineTo(x, y);
      if (rng() > 0.9) {
        ctx.strokeStyle = `rgba(93, 91, 82, ${0.05 + rng() * 0.14})`;
        ctx.lineWidth = 0.45 + rng() * 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
    ctx.strokeStyle = `rgba(83, 80, 71, ${0.04 + rng() * 0.12})`;
    ctx.lineWidth = 0.5 + rng() * 1.4;
    ctx.stroke();
  }

  for (let i = 0; i < 6500; i++) {
    const x = rng() * 1024;
    const y = rng() * 1024;
    const radius = rng() * 1.4;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 253, 244, ${0.08 + rng() * 0.13})`;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const map = new THREE.CanvasTexture(textureCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(74, 74);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const bump = new THREE.CanvasTexture(textureCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(74, 74);
  bump.anisotropy = map.anisotropy;

  return { map, bump };
}

function makeCarbonTexture(): THREE.CanvasTexture {
  const [textureCanvas, ctx] = makeCanvas(256);
  ctx.fillStyle = "#080b0d";
  ctx.fillRect(0, 0, 256, 256);
  const cell = 16;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      const diagonal = ((x / cell) + (y / cell)) % 2 === 0;
      const gradient = ctx.createLinearGradient(x, y, x + cell, y + cell);
      if (diagonal) {
        gradient.addColorStop(0, "#1a2024");
        gradient.addColorStop(0.46, "#353f45");
        gradient.addColorStop(0.5, "#0b0e10");
        gradient.addColorStop(1, "#111619");
      } else {
        gradient.addColorStop(0, "#101518");
        gradient.addColorStop(0.48, "#0a0d0f");
        gradient.addColorStop(0.54, "#313a40");
        gradient.addColorStop(1, "#161d21");
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let i = 0; i < 70; i++) {
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeRadialTexture(color: string): THREE.CanvasTexture {
  const [textureCanvas, ctx] = makeCanvas(128);
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.22, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const salt = makeSaltTexture();
const carbonTexture = makeCarbonTexture();
const softGlow = makeRadialTexture("rgba(160, 240, 255, 0.9)");

const skyUniforms = {
  topColor: { value: new THREE.Color(0x071424) },
  middleColor: { value: new THREE.Color(0x50677a) },
  horizonColor: { value: new THREE.Color(0xd8b492) },
  groundColor: { value: new THREE.Color(0xddd5c5) },
  sunColor: { value: new THREE.Color(0xffd9a8) },
  sunDirection: { value: new THREE.Vector3(-0.42, 0.1, 0.9).normalize() },
};

const skyMaterial = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 middleColor;
    uniform vec3 horizonColor;
    uniform vec3 groundColor;
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    varying vec3 vWorldPosition;
    void main() {
      vec3 dir = normalize(vWorldPosition);
      float h = dir.y;
      float upper = pow(clamp(h, 0.0, 1.0), 0.5);
      vec3 color = mix(horizonColor, middleColor, smoothstep(0.0, 0.22, h));
      color = mix(color, topColor, smoothstep(0.12, 0.82, h));
      color = mix(color, groundColor, smoothstep(0.0, -0.14, h));
      float sun = max(dot(dir, normalize(sunDirection)), 0.0);
      color += sunColor * pow(sun, 950.0) * 2.7;
      color += sunColor * pow(sun, 22.0) * 0.22;
      color += vec3(0.09, 0.13, 0.14) * pow(1.0 - abs(h), 8.0) * 0.22;
      float haze = smoothstep(0.04, -0.015, h) * smoothstep(-0.08, 0.0, h);
      color = mix(color, vec3(0.78, 0.72, 0.62), haze * 0.35);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMaterial);
scene.add(sky);

function createEnvironment(): THREE.Texture {
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), skyMaterial.clone());
  envScene.add(envSky);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(5, 20, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe4be }),
  );
  sun.position.set(-36, 12, 78);
  envScene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.MeshBasicMaterial({ color: 0x8f8777 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene, 0.06, 0.1, 250).texture;
  pmrem.dispose();
  return environment;
}

scene.environment = createEnvironment();

const hemi = new THREE.HemisphereLight(0xb7dbee, 0x6e5b48, 0.68);
scene.add(hemi);

const sunLight = new THREE.DirectionalLight(0xffd9b2, 3.4);
sunLight.position.set(-24, 22, 38);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -9;
sunLight.shadow.camera.right = 9;
sunLight.shadow.camera.top = 9;
sunLight.shadow.camera.bottom = -9;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 100;
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.03;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x34bcff, 2.2);
rimLight.position.set(16, 7, -24);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0x74dfff, 1.8, 16, 2);
fillLight.position.set(-5, 2.2, -6);
scene.add(fillLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1200, 1200),
  new THREE.MeshStandardMaterial({
    map: salt.map,
    bumpMap: salt.bump,
    bumpScale: 0.035,
    color: 0xf0eadf,
    roughness: 0.82,
    metalness: 0.02,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function buildRidge(radius: number, height: number, color: number, seed: number, baseY: number): THREE.Mesh {
  const rng = random(seed);
  const segments = 220;
  const positions: number[] = [];
  const indices: number[] = [];
  let current = height * 0.32;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    current += (rng() - 0.5) * height * 0.16;
    current = THREE.MathUtils.clamp(current, height * 0.16, height);
    const jag = rng() > 0.93 ? height * 0.2 : 0;
    const top = current + jag;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.push(x, baseY - 8, z, x, baseY + top, z);
    if (i < segments) {
      const index = i * 2;
      indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true }),
  );
  scene.add(mesh);
  return mesh;
}

buildRidge(430, 15, 0x8d877b, 44, -0.05);
buildRidge(330, 24, 0x696b66, 91, -0.1);

const markerGroup = new THREE.Group();
const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x282b2b, roughness: 0.65, metalness: 0.6 });
const reflectorMaterial = new THREE.MeshBasicMaterial({ color: 0x2fd7ff });
for (let side = -1; side <= 1; side += 2) {
  for (let i = 0; i < 17; i++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.15, 8), poleMaterial);
    pole.position.set(side * (9 + i * 0.12), 0.58, -68 + i * 8.5);
    pole.castShadow = true;
    markerGroup.add(pole);
    if (i % 3 === 0) {
      const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.025), reflectorMaterial);
      reflector.position.set(pole.position.x, 0.88, pole.position.z + 0.045);
      markerGroup.add(reflector);
    }
  }
}
scene.add(markerGroup);

const car = new THREE.Group();
car.position.y = 0;
scene.add(car);

const chassis = new THREE.Group();
car.add(chassis);

const paint = new THREE.MeshPhysicalMaterial({
  color: 0x07090a,
  roughness: 0.29,
  metalness: 0.86,
  clearcoat: 0.88,
  clearcoatRoughness: 0.16,
  envMapIntensity: 1.7,
});
const paintDeep = new THREE.MeshPhysicalMaterial({
  color: 0x020405,
  roughness: 0.48,
  metalness: 0.74,
  clearcoat: 0.4,
  clearcoatRoughness: 0.35,
  envMapIntensity: 1.1,
});
const carbon = new THREE.MeshStandardMaterial({
  map: carbonTexture,
  color: 0x8e9aa0,
  roughness: 0.46,
  metalness: 0.58,
  envMapIntensity: 1,
});
const carbonFlat = new THREE.MeshStandardMaterial({
  map: carbonTexture,
  color: 0x4e5a60,
  roughness: 0.6,
  metalness: 0.35,
});
const glass = new THREE.MeshPhysicalMaterial({
  color: 0x030b11,
  roughness: 0.055,
  metalness: 0.92,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  transparent: true,
  opacity: 0.91,
  envMapIntensity: 2.1,
});
const titanium = new THREE.MeshStandardMaterial({
  color: 0x707b82,
  roughness: 0.22,
  metalness: 1,
  envMapIntensity: 1.4,
});
const rubber = new THREE.MeshStandardMaterial({ color: 0x060707, roughness: 0.85, metalness: 0.08 });
const neon = new THREE.MeshBasicMaterial({ color: 0x35d9ff, toneMapped: false });
const neonSoft = new THREE.MeshBasicMaterial({
  color: 0x4be3ff,
  transparent: true,
  opacity: 0.5,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const dark = new THREE.MeshStandardMaterial({ color: 0x07090a, roughness: 0.5, metalness: 0.5 });

type Station = { z: number; w: number; y0: number; y1: number };

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function refineStations(stations: Station[], subdivisions: number): Station[] {
  const refined: Station[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const p0 = stations[Math.max(0, i - 1)];
    const p1 = stations[i];
    const p2 = stations[i + 1];
    const p3 = stations[Math.min(stations.length - 1, i + 2)];
    for (let step = 0; step < subdivisions; step++) {
      const t = step / subdivisions;
      refined.push({
        z: catmull(p0.z, p1.z, p2.z, p3.z, t),
        w: catmull(p0.w, p1.w, p2.w, p3.w, t),
        y0: catmull(p0.y0, p1.y0, p2.y0, p3.y0, t),
        y1: catmull(p0.y1, p1.y1, p2.y1, p3.y1, t),
      });
    }
  }
  refined.push(stations[stations.length - 1]);
  return refined;
}

function loft(stations: Station[], radial: number, xPower: number, yPower: number): THREE.BufferGeometry {
  const refined = refineStations(stations, 5);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const minZ = refined[0].z;
  const maxZ = refined[refined.length - 1].z;

  refined.forEach((station) => {
    const mid = (station.y0 + station.y1) * 0.5;
    const ry = (station.y1 - station.y0) * 0.5;
    for (let j = 0; j <= radial; j++) {
      const angle = (j / radial) * Math.PI * 2;
      const cx = Math.cos(angle);
      const sy = Math.sin(angle);
      const x = station.w * Math.sign(cx) * Math.pow(Math.abs(cx), xPower);
      const y = mid + ry * Math.sign(sy) * Math.pow(Math.abs(sy), yPower);
      positions.push(x, y, station.z);
      uvs.push(j / radial, (station.z - minZ) / (maxZ - minZ));
    }
  });

  for (let i = 0; i < refined.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const bodyStations: Station[] = [
  { z: -2.56, w: 0.32, y0: 0.16, y1: 0.3 },
  { z: -2.45, w: 0.54, y0: 0.14, y1: 0.36 },
  { z: -2.26, w: 0.76, y0: 0.12, y1: 0.44 },
  { z: -1.98, w: 0.93, y0: 0.1, y1: 0.53 },
  { z: -1.62, w: 1.01, y0: 0.09, y1: 0.61 },
  { z: -1.2, w: 0.97, y0: 0.08, y1: 0.67 },
  { z: -0.7, w: 0.89, y0: 0.08, y1: 0.72 },
  { z: 0, w: 0.83, y0: 0.08, y1: 0.76 },
  { z: 0.66, w: 0.88, y0: 0.08, y1: 0.82 },
  { z: 1.1, w: 0.97, y0: 0.09, y1: 0.86 },
  { z: 1.5, w: 1.04, y0: 0.1, y1: 0.84 },
  { z: 1.9, w: 1.06, y0: 0.12, y1: 0.76 },
  { z: 2.25, w: 1.03, y0: 0.15, y1: 0.68 },
  { z: 2.45, w: 0.92, y0: 0.2, y1: 0.58 },
  { z: 2.5, w: 0.73, y0: 0.25, y1: 0.5 },
];

const bodyMesh = new THREE.Mesh(loft(bodyStations, 46, 0.66, 0.82), paint);
bodyMesh.castShadow = true;
bodyMesh.receiveShadow = true;
chassis.add(bodyMesh);

const canopyStations: Station[] = [
  { z: -0.92, w: 0.5, y0: 0.71, y1: 0.79 },
  { z: -0.64, w: 0.65, y0: 0.73, y1: 1.02 },
  { z: -0.2, w: 0.64, y0: 0.75, y1: 1.19 },
  { z: 0.28, w: 0.58, y0: 0.76, y1: 1.2 },
  { z: 0.67, w: 0.49, y0: 0.76, y1: 1.05 },
  { z: 0.98, w: 0.38, y0: 0.75, y1: 0.88 },
  { z: 1.13, w: 0.27, y0: 0.74, y1: 0.79 },
];
const canopy = new THREE.Mesh(loft(canopyStations, 38, 0.64, 0.78), glass);
canopy.castShadow = true;
chassis.add(canopy);

const underbody = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.075, 4.2), carbonFlat);
underbody.position.set(0, 0.115, 0.02);
chassis.add(underbody);

const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.055, 0.56), carbon);
splitter.position.set(0, 0.105, -2.28);
splitter.castShadow = true;
chassis.add(splitter);

const splitterLip = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.018, 0.08), neonSoft);
splitterLip.position.set(0, 0.095, -2.55);
chassis.add(splitterLip);

for (const side of [-1, 1]) {
  const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.52), carbon);
  endplate.position.set(side * 1.03, 0.17, -2.3);
  chassis.add(endplate);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 2.9), carbonFlat);
  skirt.position.set(side * 0.98, 0.15, 0.2);
  skirt.castShadow = true;
  chassis.add(skirt);

  const skirtNeon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.015, 2.1), neon);
  skirtNeon.position.set(side * 1.021, 0.19, 0.1);
  chassis.add(skirtNeon);

  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.5), carbonFlat);
  intake.position.set(side * 0.94, 0.47, 0.84);
  chassis.add(intake);

  const intakeGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12), neonSoft);
  intakeGlow.rotation.y = side * (Math.PI / 2);
  intakeGlow.position.set(side * 0.975, 0.47, 0.84);
  chassis.add(intakeGlow);

  const cameraPod = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), dark);
  cameraPod.rotation.z = Math.PI / 2;
  cameraPod.position.set(side * 0.58, 0.77, -0.9);
  chassis.add(cameraPod);

  const canard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.15), carbon);
  canard.position.set(side * 0.88, 0.38, -1.88);
  canard.rotation.z = side * 0.08;
  chassis.add(canard);
}

function neonCurve(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 6, false), material);
}

for (const side of [-1, 1]) {
  const sideLine = neonCurve(
    [
      new THREE.Vector3(side * 0.7, 0.34, -1.82),
      new THREE.Vector3(side * 0.96, 0.36, -1.3),
      new THREE.Vector3(side * 0.9, 0.35, -0.5),
      new THREE.Vector3(side * 0.87, 0.36, 0.4),
      new THREE.Vector3(side * 0.98, 0.42, 1.25),
      new THREE.Vector3(side * 1.02, 0.48, 1.82),
    ],
    0.009,
    neon,
  );
  chassis.add(sideLine);

  const canopyRail = neonCurve(
    [
      new THREE.Vector3(side * 0.45, 0.76, -0.82),
      new THREE.Vector3(side * 0.62, 0.92, -0.52),
      new THREE.Vector3(side * 0.53, 1.09, -0.05),
      new THREE.Vector3(side * 0.42, 1.0, 0.56),
      new THREE.Vector3(side * 0.32, 0.82, 1.0),
    ],
    0.006,
    titanium,
  );
  chassis.add(canopyRail);
}

for (const side of [-1, 1]) {
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.016, 0.015), neon);
  lightBar.position.set(side * 0.4, 0.37, -2.505);
  lightBar.rotation.z = side * -0.09;
  chassis.add(lightBar);
  const secondary = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.012), neonSoft);
  secondary.position.set(side * 0.33, 0.315, -2.51);
  chassis.add(secondary);
}

const noseVent = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.055, 0.03), dark);
noseVent.position.set(0, 0.23, -2.54);
chassis.add(noseVent);

for (const side of [-1, 1]) {
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.08), carbonFlat);
    slot.position.set(side * 0.3, 0.585 + i * 0.042, -1.44 + i * 0.24);
    slot.rotation.x = -0.1;
    chassis.add(slot);
  }
}

const roofSpine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 1.15), titanium);
roofSpine.position.set(0, 1.195, 0.02);
chassis.add(roofSpine);

const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.34, 0.06), paintDeep);
rearPanel.position.set(0, 0.44, 2.49);
chassis.add(rearPanel);

const tailLight = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.022, 0.02), neon);
tailLight.position.set(0, 0.59, 2.518);
chassis.add(tailLight);

const tailLightLower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.008, 0.015), neonSoft);
tailLightLower.position.set(0, 0.52, 2.52);
chassis.add(tailLightLower);

for (const x of [-0.56, -0.28, 0.28, 0.56]) {
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.23, 18), titanium);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(x, 0.34, 2.49);
  chassis.add(exhaust);
  const exhaustCore = new THREE.Mesh(new THREE.CircleGeometry(0.044, 16), neonSoft);
  exhaustCore.position.set(x, 0.34, 2.607);
  chassis.add(exhaustCore);
}

const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.62), carbonFlat);
diffuser.position.set(0, 0.075, 2.23);
diffuser.rotation.x = -0.13;
chassis.add(diffuser);

for (let i = -2; i <= 2; i++) {
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.15, 0.55), carbon);
  fin.position.set(i * 0.31, 0.1, 2.25);
  fin.rotation.x = -0.13;
  chassis.add(fin);
}

const wingPivot = new THREE.Group();
wingPivot.position.set(0, 0.9, 1.93);
chassis.add(wingPivot);

const wingShape = new THREE.Shape();
wingShape.moveTo(0, 0.016);
wingShape.bezierCurveTo(0.1, 0.076, 0.32, 0.072, 0.53, 0.008);
wingShape.lineTo(0.53, -0.004);
wingShape.bezierCurveTo(0.33, 0.012, 0.12, 0.008, 0, -0.026);
wingShape.lineTo(0, 0.016);
const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: 1.82, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
wingGeometry.translate(0, 0, -0.91);
wingGeometry.rotateY(Math.PI / 2);
const wing = new THREE.Mesh(wingGeometry, carbon);
wing.castShadow = true;
wingPivot.add(wing);

const wingNeon = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.012, 0.018), neon);
wingNeon.position.set(0, 0.002, -0.495);
wingPivot.add(wingNeon);

for (const side of [-1, 1]) {
  const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.22, 0.5), carbon);
  endplate.position.set(side * 0.92, 0.025, -0.2);
  wingPivot.add(endplate);
  const support = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.12), titanium);
  support.position.set(side * 0.58, -0.19, -0.03);
  wingPivot.add(support);
}

const diffuserLight = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.012, 0.02), neon);
diffuserLight.position.set(0, 0.11, 2.55);
chassis.add(diffuserLight);

const rearGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: softGlow,
    color: 0x37d7ff,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
rearGlow.scale.set(2.8, 1.6, 1);
rearGlow.position.set(0, 0.48, 2.66);
chassis.add(rearGlow);

const underGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: softGlow,
    color: 0x168cff,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
underGlow.scale.set(4.6, 3.4, 1);
underGlow.position.set(0, 0.07, 0.1);
chassis.add(underGlow);

const underLight = new THREE.PointLight(0x1aa9ff, 2.2, 6, 2);
underLight.position.set(0, 0.12, 0.35);
chassis.add(underLight);

type Wheel = {
  spin: THREE.Group;
  steer: THREE.Group;
  position: THREE.Vector3;
};

const wheels: Wheel[] = [];
const wheelPositions = [
  new THREE.Vector3(-1.04, 0.37, -1.47),
  new THREE.Vector3(1.04, 0.37, -1.47),
  new THREE.Vector3(-1.07, 0.38, 1.5),
  new THREE.Vector3(1.07, 0.38, 1.5),
];

wheelPositions.forEach((position, index) => {
  const steer = new THREE.Group();
  steer.position.copy(position);
  car.add(steer);
  const spin = new THREE.Group();
  steer.add(spin);

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.39, 0.31, 36), rubber);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);

  const sidewall = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 8, 36), dark);
  sidewall.rotation.y = Math.PI / 2;
  sidewall.position.x = index % 2 === 0 ? -0.158 : 0.158;
  spin.add(sidewall);

  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.285, 0.05, 36), carbon);
  cover.rotation.z = Math.PI / 2;
  cover.position.x = index % 2 === 0 ? -0.135 : 0.135;
  spin.add(cover);

  const coverRing = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.008, 8, 40), neon);
  coverRing.rotation.y = Math.PI / 2;
  coverRing.position.x = index % 2 === 0 ? -0.165 : 0.165;
  spin.add(coverRing);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.38, 18), titanium);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);

  const hubCap = new THREE.Mesh(new THREE.CircleGeometry(0.046, 18), neon);
  hubCap.rotation.y = index % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
  hubCap.position.x = index % 2 === 0 ? -0.172 : 0.172;
  spin.add(hubCap);

  if (index < 2) steer.rotation.y = -0.09;

  wheels.push({ spin, steer, position });
});

const chute = new THREE.Group();
chute.position.set(0, 0.8, 2.56);
chute.visible = false;
car.add(chute);

const chuteFabric = new THREE.Mesh(
  new THREE.SphereGeometry(0.52, 24, 13, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshStandardMaterial({
    color: 0xb7c8ca,
    roughness: 0.92,
    metalness: 0.05,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  }),
);
chuteFabric.rotation.x = Math.PI / 2;
chuteFabric.position.z = 0.48;
chuteFabric.scale.set(1.1, 0.78, 1.15);
chute.add(chuteFabric);

const chuteLines = new THREE.LineSegments(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x9bb9bd, transparent: true, opacity: 0.48 }),
);
const chutePositions: number[] = [];
for (let i = 0; i < 8; i++) {
  const angle = (i / 8) * Math.PI * 2;
  chutePositions.push(
    0, 0.43, 0,
    Math.cos(angle) * 0.48, 0.7, 0.96 + Math.sin(angle) * 0.24,
  );
}
chuteLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(chutePositions, 3));
chute.add(chuteLines);

const chuteRing = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.012, 6, 40), neonSoft);
chuteRing.rotation.x = Math.PI / 2;
chuteRing.position.z = 0.46;
chute.add(chuteRing);

function makeBadge(text: string): THREE.Mesh {
  const [badgeCanvas, ctx] = makeCanvas(256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(74, 227, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(74, 227, 255, 0.35)";
  ctx.beginPath();
  ctx.arc(128, 128, 91, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#d9f8ff";
  ctx.font = "700 48px Rajdhani, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("AEON", 128, 122);
  ctx.fillStyle = "#45ddff";
  ctx.font = "600 25px Rajdhani, sans-serif";
  ctx.fillText(text, 128, 158);
  const texture = new THREE.CanvasTexture(badgeCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
}

for (const side of [-1, 1]) {
  const badge = makeBadge("1000");
  badge.position.set(side * 1.018, 0.42, 1.26);
  badge.rotation.y = side * (Math.PI / 2);
  chassis.add(badge);
}

const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(4.8, 6.4),
  new THREE.MeshBasicMaterial({
    map: makeRadialTexture("rgba(0,0,0,0.85)"),
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  }),
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.y = 0.012;
car.add(contactShadow);

const dustCount = 380;
const dustPositions = new Float32Array(dustCount * 3);
const dustRng = random(9173);
for (let i = 0; i < dustCount; i++) {
  dustPositions[i * 3] = (dustRng() - 0.5) * 36;
  dustPositions[i * 3 + 1] = 0.03 + dustRng() * 0.38;
  dustPositions[i * 3 + 2] = (dustRng() - 0.5) * 44;
}
const dustGeometry = new THREE.BufferGeometry();
dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.Points(
  dustGeometry,
  new THREE.PointsMaterial({
    map: softGlow,
    color: 0xffe8cc,
    size: 0.075,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }),
);
scene.add(dust);

const streakCount = 180;
const streakPositions = new Float32Array(streakCount * 6);
const streakRng = random(741);
const streakData: { x: number; y: number; z: number; length: number; speed: number }[] = [];
for (let i = 0; i < streakCount; i++) {
  const x = (streakRng() - 0.5) * 26;
  const y = 0.18 + streakRng() * 6.5;
  const z = -34 + streakRng() * 46;
  const length = 0.8 + streakRng() * 3.6;
  streakData.push({ x, y, z, length, speed: 0.55 + streakRng() * 1.2 });
  streakPositions[i * 6] = x;
  streakPositions[i * 6 + 1] = y;
  streakPositions[i * 6 + 2] = z;
  streakPositions[i * 6 + 3] = x;
  streakPositions[i * 6 + 4] = y;
  streakPositions[i * 6 + 5] = z + length;
}
const streakGeometry = new THREE.BufferGeometry();
streakGeometry.setAttribute("position", new THREE.BufferAttribute(streakPositions, 3));
const streaks = new THREE.LineSegments(
  streakGeometry,
  new THREE.LineBasicMaterial({
    color: 0x92e8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
scene.add(streaks);

const mist = new THREE.Group();
for (let i = 0; i < 3; i++) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softGlow,
      color: 0x8feaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sprite.position.set(-0.5 + i * 0.5, 0.28 + i * 0.06, 2.3 + i * 0.1);
  sprite.scale.set(0.7, 0.28, 1);
  mist.add(sprite);
}
car.add(mist);

const poses = {
  hero: {
    position: new THREE.Vector3(7.2, 2.7, -7.35),
    target: new THREE.Vector3(0, 0.58, 0),
    fov: 41,
  },
  side: {
    position: new THREE.Vector3(9.7, 1.72, 0.3),
    target: new THREE.Vector3(0, 0.56, -0.1),
    fov: 40,
  },
  rear: {
    position: new THREE.Vector3(5.9, 2.35, 7.45),
    target: new THREE.Vector3(0, 0.7, 0.65),
    fov: 41,
  },
  cockpit: {
    position: new THREE.Vector3(0, 1.09, -0.15),
    target: new THREE.Vector3(0, 0.7, -9),
    fov: 61,
  },
};

type CameraPose = (typeof poses)[keyof typeof poses];

const cameraState: {
  active: keyof typeof poses;
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  fromFov: number;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  toFov: number;
  progress: number;
  duration: number;
} = {
  active: "hero",
  fromPosition: camera.position.clone(),
  fromTarget: poses.hero.target.clone(),
  fromFov: 41,
  toPosition: poses.hero.position.clone(),
  toTarget: poses.hero.target.clone(),
  toFov: 41,
  progress: 0,
  duration: 2.4,
};

function goToCamera(name: keyof typeof poses): void {
  const pose: CameraPose = poses[name];
  cameraState.active = name;
  cameraState.fromPosition.copy(camera.position);
  cameraState.fromTarget.copy(controls.target);
  cameraState.fromFov = camera.fov;
  cameraState.toPosition.copy(pose.position);
  cameraState.toTarget.copy(pose.target);
  cameraState.toFov = pose.fov;
  cameraState.progress = 0;
  cameraState.duration = name === "cockpit" ? 0.95 : 1.35;
  app!.classList.toggle("cockpit-view", name === "cockpit");
  cockpitOverlay.classList.toggle("show", name === "cockpit");
  controls.enabled = name !== "cockpit";
  document.querySelectorAll<HTMLButtonElement>(".cam-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.camera === name);
  });
}

document.querySelectorAll<HTMLButtonElement>(".cam-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const name = button.dataset.camera as keyof typeof poses | undefined;
    if (name && name in poses) goToCamera(name);
  });
});

let soundEnabled = true;
type AudioRig = {
  ctx: AudioContext;
  master: GainNode;
  engineGain: GainNode;
  filter: BiquadFilterNode;
  oscillators: OscillatorNode[];
  windGain: GainNode;
  wind: AudioBufferSourceNode | null;
};

let audioRig: AudioRig | null = null;

function initAudio(): void {
  if (audioRig) return;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  const master = ctx.createGain();
  master.gain.value = soundEnabled ? 0.42 : 0;
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 180;
  filter.Q.value = 2.2;

  const engineGain = ctx.createGain();
  engineGain.gain.value = 0.0001;
  filter.connect(engineGain);
  engineGain.connect(master);

  const oscillators: OscillatorNode[] = [];
  [36, 54, 72].forEach((frequency, index) => {
    const oscillation = ctx.createOscillator();
    oscillation.type = index === 2 ? "square" : "sawtooth";
    oscillation.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = index === 2 ? 0.12 : 0.22;
    oscillation.connect(gain);
    gain.connect(filter);
    oscillation.start();
    oscillators.push(oscillation);
  });

  const windBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const windData = windBuffer.getChannelData(0);
  for (let i = 0; i < windData.length; i++) {
    windData[i] = (Math.random() * 2 - 1) * 0.38;
  }
  const wind = ctx.createBufferSource();
  wind.buffer = windBuffer;
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.frequency.value = 700;
  windFilter.Q.value = 0.6;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.0001;
  wind.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);
  wind.start();

  audioRig = { ctx, master, engineGain, filter, oscillators, windGain, wind };
}

function updateAudio(speedFraction: number, active: boolean): void {
  if (!audioRig) return;
  const now = audioRig.ctx.currentTime;
  const targetGain = active || speedFraction > 0.03 ? 0.04 + speedFraction * 0.075 : 0.0001;
  audioRig.engineGain.gain.setTargetAtTime(targetGain, now, 0.12);
  audioRig.filter.frequency.setTargetAtTime(150 + speedFraction * 1200, now, 0.15);
  audioRig.oscillators[0].frequency.setTargetAtTime(38 + speedFraction * 52, now, 0.18);
  audioRig.oscillators[1].frequency.setTargetAtTime(57 + speedFraction * 78, now, 0.18);
  audioRig.oscillators[2].frequency.setTargetAtTime(114 + speedFraction * 280, now, 0.18);
  audioRig.windGain.gain.setTargetAtTime(0.0001 + speedFraction * speedFraction * 0.035, now, 0.2);
  audioRig.master.gain.setTargetAtTime(soundEnabled ? 0.42 : 0, now, 0.1);
}

function toggleSound(): void {
  soundEnabled = !soundEnabled;
  soundToggle.classList.toggle("muted", !soundEnabled);
  soundToggle.querySelector("span")!.textContent = soundEnabled ? "Som" : "Mudo";
  if (soundEnabled) {
    initAudio();
    if (audioRig?.ctx.state === "suspended") void audioRig.ctx.resume();
  }
  if (audioRig) {
    audioRig.master.gain.setTargetAtTime(soundEnabled ? 0.42 : 0, audioRig.ctx.currentTime, 0.1);
  }
}

soundToggle.addEventListener("click", toggleSound);

let modes: "idle" | "accel" | "max" | "brake" = "idle";
let speed = 0;
let speedFraction = 0;
let elapsed = 0;
let lastTime = performance.now() * 0.001;
let introProgress = 0;
let toastTimer = 0;
let autoRotateDelay = 0;
let n2Level = 100;
let chuteDeploy = 0;
let chassisDrop = 0;
let wingAngle = 0.11;
let brakeTemperature = 32;
let lastMilestone = 0;

const milestoneMessages: Record<number, string> = {
  100: "0—100 KM/H · SISTEMA HÍBRIDO ONLINE",
  400: "BARREIRA DOS 400 KM/H SUPERADA",
  600: "AUTOPILOTO DE ESTABILIDADE ATIVADO",
  1000: "VELOCIDADE MÁXIMA · 1.000 KM/H",
};

function showToast(message: string, duration = 2800): void {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), duration);
}

function setButtonState(): void {
  if (!launchSmall || !launchLabel) return;
  if (modes === "accel" || modes === "max") {
    launchSmall.textContent = "MODO 1000 ATIVO · TOQUE PARA FREAR";
    launchLabel.textContent = "DESATIVAR MODO 1000";
    modeCopy.textContent = modes === "max" ? "VELOCIDADE MÁXIMA · ESTABILIZADA" : "ACELERAÇÃO MÁXIMA · AERO ATIVA";
  } else if (modes === "brake") {
    launchSmall.textContent = "FREIO AERODINÂMICO ATIVO";
    launchLabel.textContent = "DESACELERANDO...";
    modeCopy.textContent = "PARAQUEDAS + FREIO AERODINÂMICO";
  } else {
    launchSmall.textContent = "PROTOCOLO DE VELOCIDADE MÁXIMA";
    launchLabel.textContent = "ATIVAR MODO 1000 KM/H";
    modeCopy.textContent = "MOTOR ARMADO · AGUARDANDO COMANDO";
  }
}

function startBoost(): void {
  initAudio();
  if (audioRig?.ctx.state === "suspended") void audioRig.ctx.resume();
  if (modes === "accel" || modes === "max") {
    startBrake();
    return;
  }
  modes = "accel";
  lastMilestone = 0;
  app!.classList.remove("mode-brake");
  showToast("PROTOCOLO 1000 · NITROGÊNIO ARMADO", 3200);
  setButtonState();
  if (window.innerWidth < 821) goToCamera("hero");
}

function startBrake(): void {
  if (speed < 5) return;
  modes = "brake";
  app!.classList.add("mode-brake");
  app!.classList.remove("mode-fast");
  showToast("FREIO AERODINÂMICO · PARAQUEDAS DEPLOYADO", 2600);
  setButtonState();
}

boostBtn.addEventListener("click", startBoost);
brakeBtn.addEventListener("click", startBrake);

autopilot.querySelector(".ap-bars")?.addEventListener("animationend", () => undefined);

function updateTicks(): void {
  const namespace = "http://www.w3.org/2000/svg";
  for (let i = 0; i <= 20; i++) {
    const major = i % 2 === 0;
    const angle = Math.PI + (i / 20) * Math.PI;
    const radiusOuter = 127;
    const radiusInner = major ? 115 : 120;
    const x1 = 150 + Math.cos(angle) * radiusOuter;
    const y1 = 156 + Math.sin(angle) * radiusOuter;
    const x2 = 150 + Math.cos(angle) * radiusInner;
    const y2 = 156 + Math.sin(angle) * radiusInner;
    const tick = document.createElementNS(namespace, "line");
    tick.setAttribute("x1", x1.toFixed(2));
    tick.setAttribute("y1", y1.toFixed(2));
    tick.setAttribute("x2", x2.toFixed(2));
    tick.setAttribute("y2", y2.toFixed(2));
    tick.setAttribute("style", major ? "opacity:.55" : "opacity:.24");
    arcTicks.appendChild(tick);
  }
}
updateTicks();

const arcLength = speedArc.getTotalLength();
speedArc.style.strokeDasharray = `${arcLength}`;
speedArc.style.strokeDashoffset = `${arcLength}`;

function formatSpeed(value: number): string {
  if (value >= 999.5) return "1.000";
  return String(Math.floor(value)).padStart(3, "0");
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}

function gearFor(value: number): string {
  if (value < 1) return "N";
  if (value < 120) return "1";
  if (value < 230) return "2";
  if (value < 390) return "3";
  if (value < 570) return "4";
  if (value < 770) return "5";
  if (value < 930) return "6";
  return "7";
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function onPointerDown(): void {
  autoRotateDelay = 12;
  controls.autoRotate = false;
}

canvas.addEventListener("pointerdown", onPointerDown);

function openSpecs(): void {
  specsModal.classList.add("open");
  specsModal.setAttribute("aria-hidden", "false");
}

function closeSpecs(): void {
  specsModal.classList.remove("open");
  specsModal.setAttribute("aria-hidden", "true");
}

document.querySelectorAll<HTMLElement>("[data-close-specs]").forEach((element) => {
  element.addEventListener("click", closeSpecs);
});

el<HTMLButtonElement>("open-specs").addEventListener("click", openSpecs);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSpecs();
  if (event.key === " " && !specsModal.classList.contains("open")) {
    event.preventDefault();
    startBoost();
  }
  if (event.key.toLowerCase() === "b") startBrake();
  if (event.key === "1") goToCamera("hero");
  if (event.key === "2") goToCamera("side");
  if (event.key === "3") goToCamera("rear");
  if (event.key === "4") goToCamera("cockpit");
});

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloom.resolution.set(width, height);
});

let cameraTweenDone = false;
let lastTimestamp = performance.now();

function animate(timestamp: number): void {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;
  elapsed += dt;

  if (modes === "accel") {
    speed = Math.min(1000, speed + 300 * (1 - speed / 1600) * dt);
    if (speed >= 999.5) {
      speed = 1000;
      modes = "max";
      setButtonState();
    }
  } else if (modes === "max") {
    speed = Math.min(1000, speed + 20 * dt);
  } else if (modes === "brake") {
    speed = Math.max(0, speed - (320 + speed * 0.64) * dt);
    if (speed <= 0.2) {
      speed = 0;
      modes = "idle";
      app!.classList.remove("mode-brake");
      setButtonState();
      showToast("SISTEMA ESTABILIZADO · PRONTO PARA NOVO RECORDE", 2400);
    }
  } else {
    speed = Math.max(0, speed - 26 * dt);
  }

  speedFraction = THREE.MathUtils.clamp(speed / 1000, 0, 1);
  const fast = speedFraction > 0.45;
  app!.classList.toggle("mode-fast", fast);
  if (modes !== "brake") app!.classList.remove("mode-brake");

  for (const [milestoneString, message] of Object.entries(milestoneMessages)) {
    const milestone = Number(milestoneString);
    if (speed >= milestone && lastMilestone < milestone) {
      lastMilestone = milestone;
      showToast(message, milestone === 1000 ? 4200 : 2600);
    }
  }

  const targetDrop = speedFraction * 0.06;
  chassisDrop += (targetDrop - chassisDrop) * Math.min(1, dt * 2.6);
  const targetWing = modes === "brake" ? 1.02 : 0.11 + speedFraction * 0.15;
  wingAngle += (targetWing - wingAngle) * Math.min(1, dt * 3.2);
  chassis.position.y = -chassisDrop + Math.sin(elapsed * 71) * speedFraction * 0.0025;
  chassis.position.x = Math.sin(elapsed * 37) * speedFraction * 0.0016;
  chassis.position.z = Math.cos(elapsed * 43) * speedFraction * 0.0018;
  wingPivot.rotation.x = wingAngle;
  wingPivot.position.y = 0.9 + speedFraction * 0.045;

  for (const wheel of wheels) {
    wheel.spin.rotation.x -= speedFraction * 26 * dt;
  }

  const chuteTarget = modes === "brake" || (modes === "idle" && speedFraction > 0.15) ? 1 : 0;
  chuteDeploy += (chuteTarget - chuteDeploy) * Math.min(1, dt * (chuteTarget > chuteDeploy ? 5.5 : 2.4));
  chute.visible = chuteDeploy > 0.005;
  const deployScale = Math.max(0.001, chuteDeploy);
  chute.scale.setScalar(deployScale);
  chute.position.z = 2.56 + chuteDeploy * 0.42;
  chute.rotation.y = Math.sin(elapsed * 4) * 0.02 * chuteDeploy;

  salt.map.offset.y -= (0.006 + speedFraction * 0.72) * dt;
  salt.bump.offset.y = salt.map.offset.y;
  ground.material.needsUpdate = false;

  const dustPositionAttribute = dustGeometry.getAttribute("position") as THREE.BufferAttribute;
  const dustArray = dustPositionAttribute.array as Float32Array;
  for (let i = 0; i < dustCount; i++) {
    dustArray[i * 3 + 2] += (0.45 + speedFraction * 24) * dt;
    dustArray[i * 3] += Math.sin(elapsed * 0.9 + i) * speedFraction * 0.004;
    if (dustArray[i * 3 + 2] > 23) {
      dustArray[i * 3 + 2] = -23;
      dustArray[i * 3] = (Math.random() - 0.5) * 36;
    }
  }
  dustPositionAttribute.needsUpdate = true;

  const streakAttribute = streakGeometry.getAttribute("position") as THREE.BufferAttribute;
  const streakArray = streakAttribute.array as Float32Array;
  const streakOpacity = THREE.MathUtils.clamp((speedFraction - 0.08) * 0.85, 0, 0.7);
  const streakMaterial = streaks.material as THREE.LineBasicMaterial;
  streakMaterial.opacity += (streakOpacity - streakMaterial.opacity) * Math.min(1, dt * 4);
  if (speedFraction > 0.04) {
    for (let i = 0; i < streakCount; i++) {
      const data = streakData[i];
      data.z += (3 + speedFraction * 82) * data.speed * dt;
      if (data.z > 18) {
        data.z = -40 - Math.random() * 14;
        data.x = (Math.random() - 0.5) * 26;
        data.y = 0.18 + Math.random() * 6.5;
      }
      streakArray[i * 6 + 2] = data.z;
      streakArray[i * 6 + 5] = data.z + data.length * (0.6 + speedFraction * 1.8);
    }
    streakAttribute.needsUpdate = true;
  }

  rearGlow.material.opacity = 0.22 + speedFraction * 0.38;
  underGlow.material.opacity = 0.2 + speedFraction * 0.28;
  underLight.intensity = 1.8 + speedFraction * 4.2;
  const mistSprites = mist.children as THREE.Sprite[];
  mistSprites.forEach((sprite, index) => {
    const material = sprite.material as THREE.SpriteMaterial;
    const targetOpacity = speedFraction * (modes === "brake" ? 0.58 : 0.34);
    material.opacity += (targetOpacity - material.opacity) * Math.min(1, dt * 3);
    const pulse = 1 + Math.sin(elapsed * 8 + index) * 0.16;
    sprite.scale.set(0.7 * pulse + speedFraction * 0.75, 0.28 * pulse + speedFraction * 0.22, 1);
  });

  n2Level += ((100 - speedFraction * 9) - n2Level) * Math.min(1, dt * 0.55);
  brakeTemperature += ((32 + speedFraction * 640 + (modes === "brake" ? 380 : 0)) - brakeTemperature) * Math.min(1, dt * 1.8);

  const downforce = 1400 + speedFraction * 2200;
  telDownforce.innerHTML = `${formatNumber(downforce)} <small>kg</small>`;
  telDownforceBar.style.setProperty("--v", `${Math.round(30 + speedFraction * 70)}%`);
  telWing.textContent = `${Math.round((wingPivot.rotation.x * 180) / Math.PI)}°`;
  telWingBar.style.setProperty("--v", `${Math.round(Math.min(100, (wingPivot.rotation.x / 1.05) * 100))}%`);
  const suspension = Math.round(speedFraction * 20);
  telSusp.textContent = suspension === 0 ? "0 mm" : `−${suspension} mm`;
  telSuspBar.style.setProperty("--v", `${Math.round(speedFraction * 100)}%`);
  telBrakes.innerHTML = `${Math.round(brakeTemperature)} <small>°C</small>`;
  telBrakesBar.style.setProperty("--v", `${Math.round(Math.min(100, (brakeTemperature / 1050) * 100))}%`);
  telN2.innerHTML = `${Math.round(n2Level)} <small>%</small>`;
  telN2Bar.style.setProperty("--v", `${Math.round(n2Level)}%`);

  speedValue.textContent = formatSpeed(speed);
  gearReadout.textContent = gearFor(speed);
  const dashOffset = arcLength * (1 - speedFraction);
  speedArc.style.strokeDashoffset = `${dashOffset}`;

  if (modes === "accel") {
    speedStatus.textContent = "ACELERAÇÃO MÁXIMA";
  } else if (modes === "max") {
    speedStatus.textContent = "VELOCIDADE MÁXIMA";
  } else if (modes === "brake") {
    speedStatus.textContent = "FREIO DE EMERGÊNCIA";
  } else if (speed > 1) {
    speedStatus.textContent = "DESACELERAÇÃO CONTROLADA";
  } else {
    speedStatus.textContent = "SISTEMA PRONTO";
  }

  const autopilotActive = speed >= 600;
  autopilot.classList.toggle("show", autopilotActive);
  autopilot.setAttribute("aria-hidden", autopilotActive ? "false" : "true");
  brakeBtn.disabled = speed < 5 || modes === "brake";
  brakeBtn.classList.toggle("active", modes === "brake");

  if (modes === "accel" || modes === "max" || modes === "brake") {
    autoRotateDelay = 10;
    controls.autoRotate = false;
  } else {
    autoRotateDelay = Math.max(0, autoRotateDelay - dt);
    if (autoRotateDelay <= 0 && cameraState.active !== "cockpit" && !specsModal.classList.contains("open")) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.25;
    }
  }

  if (cameraState.progress < 1) {
    cameraState.progress = Math.min(1, cameraState.progress + dt / cameraState.duration);
    const progress = easeInOutCubic(cameraState.progress);
    camera.position.lerpVectors(cameraState.fromPosition, cameraState.toPosition, progress);
    controls.target.lerpVectors(cameraState.fromTarget, cameraState.toTarget, progress);
    camera.fov = THREE.MathUtils.lerp(cameraState.fromFov, cameraState.toFov, progress);
    camera.updateProjectionMatrix();
    if (cameraState.progress >= 1) {
      cameraTweenDone = true;
      controls.enabled = cameraState.active !== "cockpit";
    }
  } else {
    if (!cameraTweenDone) {
      cameraTweenDone = true;
      controls.enabled = cameraState.active !== "cockpit";
    }
    const activePose = poses[cameraState.active];
    const dynamicFov = activePose.fov + (cameraState.active === "cockpit" ? speedFraction * 7 : speedFraction * 4.5);
    camera.fov += (dynamicFov - camera.fov) * Math.min(1, dt * 2.2);
    camera.updateProjectionMatrix();
    controls.update();
  }

  updateAudio(speedFraction, modes === "accel" || modes === "max");
  composer.render();
}

setButtonState();
requestAnimationFrame(animate);

window.addEventListener("beforeunload", () => {
  if (audioRig) {
    void audioRig.ctx.close();
  }
});
