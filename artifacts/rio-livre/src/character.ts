import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/*
 * Personagem humanoide do RedRP.
 *
 * Desempenho (mobile fraco, ex.: Galaxy A14):
 *  - A malha de cada osso e pre-assada UMA vez (todas as partes mescladas, cores por vertice).
 *    Cada personagem usa 14 draw calls (antes eram ~35) e um unico material compartilhado.
 *  - Sem texturas de tecido/pele: o volume vem de sombreamento baked nos vertices.
 *
 * Animacao:
 *  - Pernas por IK de dois ossos: o pe fica plantado no chao durante o apoio (sem "patinar").
 *  - Ciclo de marcha dirigido pela velocidade real: caminhada -> corrida -> sprint, com
 *    cadencia, duracao de apoio, oscilacao do quadril e inclinacao do tronco que mudam com a velocidade.
 *  - Tornozelo (calcanhar -> ponta), rotacao de pelve e ombros em contra-fase, bracos com cotovelo,
 *    inclinacao por aceleracao/frenagem, curva, idle com respiracao e troca de apoio, pulo e aterrissagem.
 */

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clampNum((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------
// Proporcoes (mesmas do modelo anterior; o quadril agora e a raiz da cadeia cinematica)
// ---------------------------------------------------------------------------------------------
const HIPS_STAND = 0.915; // altura do quadril em pe
const L1 = 0.45; // coxa
const L2 = 0.41; // canela (joelho -> tornozelo)
const ANKLE_H = 0.075; // tornozelo acima do chao com o pe plano
const CHEST_REL = 0.185; // base do torso acima do quadril
const NECK_REL = 0.555; // pescoco acima da base do torso
const HEAD_REL = 0.73; // centro da cabeca acima da base do torso
const SHOULDER_REL = 0.45; // ombro acima da base do torso
const SHOULDER_X = 0.26;
const ELBOW_Y = -0.37;
const LABEL_Y = 2.38;
const LAND_TIME = 0.34;

// ---------------------------------------------------------------------------------------------
// Malha pre-assada com cores por regiao
// ---------------------------------------------------------------------------------------------
const R = {
  skin: 0,
  shirt: 1,
  pants: 2,
  hair: 3,
  shoe: 4,
  sole: 5,
  tattoo: 6,
  stud: 7,
  eyeWhite: 8,
  iris: 9,
  pupil: 10,
  mouth: 11,
  lip: 12,
  earIn: 13,
  chain: 14,
  fade: 15,
} as const;
const REGION_COUNT = 16;
const FIXED_COLORS: Record<number, string> = {
  [R.shoe]: "#f6f5f1",
  [R.sole]: "#e4e1d8",
  [R.tattoo]: "#4a403b",
  [R.stud]: "#d5d9e0",
  [R.chain]: "#c4c9d2",
  [R.eyeWhite]: "#eae3d8",
  [R.iris]: "#4b3626",
  [R.pupil]: "#140d0a",
  [R.mouth]: "#7d4238",
  [R.lip]: "#9a5a4b",
  [R.earIn]: "#a86a45",
};

type V3 = [number, number, number];
interface Part {
  g: THREE.BufferGeometry;
  r: number;
  p?: V3;
  q?: V3;
  s?: V3;
  /** Multiplicador de brilho da peca. */
  shade?: number;
  /** Brilho na base e no topo da peca (gradiente vertical baked). */
  grad?: [number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _f = new THREE.Color();

const bake = (parts: Part[]): THREE.BufferGeometry => {
  const geos: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const g = part.g.index ? part.g.toNonIndexed() : part.g.clone();
    g.deleteAttribute("uv");
    const p: V3 = part.p ?? [0, 0, 0];
    const q: V3 = part.q ?? [0, 0, 0];
    const s: V3 = part.s ?? [1, 1, 1];
    _e.set(q[0], q[1], q[2]);
    _q.setFromEuler(_e);
    _p.set(p[0], p[1], p[2]);
    _s.set(s[0], s[1], s[2]);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const n = pos.count;
    const region = new Float32Array(n).fill(part.r);
    const shade = new Float32Array(n);
    const g0 = part.grad?.[0] ?? 1;
    const g1 = part.grad?.[1] ?? 1;
    const base = part.shade ?? 1;
    const h = Math.max(1e-5, bb.max.y - bb.min.y);
    for (let i = 0; i < n; i++) {
      const ao = 0.8 + 0.2 * (nor.getY(i) * 0.5 + 0.5); // faces voltadas para baixo ficam mais escuras
      const t = (pos.getY(i) - bb.min.y) / h;
      shade[i] = base * ao * (g0 + (g1 - g0) * t);
    }
    g.setAttribute("region", new THREE.BufferAttribute(region, 1));
    g.setAttribute("shade", new THREE.BufferAttribute(shade, 1));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error("character: falha ao mesclar a malha");
  const indexed = mergeVertices(merged);
  merged.dispose();
  indexed.computeBoundingSphere();
  return indexed;
};

interface Templates {
  head: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  torso: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  foot: THREE.BufferGeometry;
  upper: THREE.BufferGeometry;
  fore: [THREE.BufferGeometry, THREE.BufferGeometry];
}
const templateCache: { ink?: Templates; plain?: Templates } = {};

const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
const sph = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number) => new THREE.ConeGeometry(r, h, 5);

const ink = (p: V3, s: V3): Part => ({ g: sph(0.02, 8, 6), r: R.tattoo, p, s, shade: 0.95 });

const buildHead = (): THREE.BufferGeometry => {
  const parts: Part[] = [];
  parts.push({ g: sph(0.155, 24, 16), r: R.skin, s: [0.95, 1.06, 0.98], grad: [0.88, 1.04] });
  parts.push({ g: sph(0.125, 20, 14), r: R.skin, p: [0, -0.062, 0.018], s: [0.96, 0.78, 0.94], grad: [0.9, 1] });
  parts.push({ g: sph(0.05, 10, 8), r: R.skin, p: [-0.088, -0.095, 0.05], s: [1, 0.8, 0.9], shade: 0.97 });
  parts.push({ g: sph(0.05, 10, 8), r: R.skin, p: [0.088, -0.095, 0.05], s: [1, 0.8, 0.9], shade: 0.97 });
  for (const x of [-0.148, 0.148]) {
    parts.push({ g: sph(0.045, 10, 8), r: R.skin, p: [x, -0.005, -0.01], s: [0.4, 0.9, 0.72] });
    parts.push({ g: sph(0.022, 8, 6), r: R.earIn, p: [x + (x < 0 ? -0.012 : 0.012), -0.005, -0.012], s: [0.32, 0.8, 0.6] });
    parts.push({ g: sph(0.0105, 8, 6), r: R.stud, p: [x * 1.04, -0.034, -0.004] });
    parts.push({ g: sph(0.0085, 8, 6), r: R.stud, p: [x * 1.02, 0.012, -0.012] });
  }
  parts.push({ g: sph(0.033, 12, 9), r: R.skin, p: [0, -0.035, 0.146], s: [0.7, 1.0, 1.12] });
  parts.push({ g: sph(0.025, 10, 8), r: R.skin, p: [0, -0.05, 0.155], s: [1, 0.7, 0.95] });
  for (const x of [-0.062, 0.062]) {
    const lid = new THREE.SphereGeometry(0.034, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    parts.push({ g: lid, r: R.skin, p: [x, 0.017, 0.112], q: [0.55, 0, 0] });
    const lower = new THREE.SphereGeometry(0.036, 10, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
    parts.push({ g: lower, r: R.skin, p: [x, 0.013, 0.112], q: [-0.4, 0, 0], shade: 0.95 });
    parts.push({
      g: box(0.07, 0.021, 0.022),
      r: R.hair,
      p: [x * 1.03, 0.054, 0.138],
      q: [-0.16, 0, x < 0 ? -0.12 : 0.12],
      shade: 0.8,
    });
  }
  parts.push({ g: sph(0.0075, 6, 5), r: R.stud, p: [0.086, 0.05, 0.134] });
  parts.push({ g: box(0.072, 0.012, 0.014), r: R.mouth, p: [0, -0.098, 0.117], q: [0.12, 0, 0] });
  parts.push({ g: sph(0.042, 12, 8), r: R.lip, p: [0, -0.112, 0.106], s: [0.92, 0.3, 0.42] });
  parts.push({ g: sph(0.038, 10, 8), r: R.skin, p: [0, -0.15, 0.088], s: [1.1, 0.62, 0.78] });

  parts.push({
    g: new THREE.SphereGeometry(0.163, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    r: R.hair,
    p: [0, 0.008, -0.012],
    s: [0.94, 1.04, 0.97],
    q: [-0.12, 0, 0],
    grad: [0.9, 1.1],
  });
  parts.push({ g: sph(0.156, 18, 12), r: R.fade, p: [0, -0.03, -0.05], s: [0.99, 0.92, 0.76], grad: [0.8, 1] });
  for (const x of [-0.143, 0.143]) {
    parts.push({ g: box(0.022, 0.085, 0.06), r: R.fade, p: [x, -0.02, 0.02], q: [0, 0, x < 0 ? 0.08 : -0.08], shade: 0.95 });
  }
  for (const [tx, tz, rz] of [
    [-0.06, 0.07, 0.3],
    [0.0, 0.082, 0.04],
    [0.064, 0.068, -0.28],
    [-0.02, 0.0, 0.1],
    [0.03, -0.03, -0.1],
  ] as const) {
    parts.push({ g: sph(0.08, 10, 8), r: R.hair, p: [tx, 0.112, tz], s: [1.15, 0.5, 0.64], q: [-0.4, 0, rz], shade: 1.08 });
  }
  for (const [x, rz] of [
    [-0.088, 0.35],
    [-0.046, 0.14],
    [-0.008, -0.05],
    [0.034, 0.12],
    [0.074, -0.3],
    [0.108, -0.5],
  ] as const) {
    parts.push({
      g: cone(0.023, 0.08),
      r: R.hair,
      p: [x, 0.083, 0.132 - Math.abs(x) * 0.45],
      q: [Math.PI - 0.38, 0, rz],
      s: [1.3, 1, 0.55],
      shade: 1.05,
    });
  }
  return bake(parts);
};

const buildEyes = (): THREE.BufferGeometry => {
  const parts: Part[] = [];
  for (const x of [-0.062, 0.062]) {
    parts.push({ g: sph(0.03, 12, 8), r: R.eyeWhite, p: [x, 0, 0.112] });
    parts.push({ g: sph(0.0145, 8, 6), r: R.iris, p: [x, 0, 0.1315], s: [1, 1, 0.8] });
    parts.push({ g: sph(0.0075, 6, 5), r: R.pupil, p: [x, 0, 0.1395], s: [1, 1, 0.7] });
  }
  return bake(parts);
};

const buildTorso = (tattoos: boolean): THREE.BufferGeometry => {
  const profile = [
    new THREE.Vector2(0.2, 0),
    new THREE.Vector2(0.21, 0.06),
    new THREE.Vector2(0.22, 0.14),
    new THREE.Vector2(0.225, 0.26),
    new THREE.Vector2(0.235, 0.34),
    new THREE.Vector2(0.23, 0.42),
    new THREE.Vector2(0.2, 0.47),
    new THREE.Vector2(0.14, 0.5),
    new THREE.Vector2(0.065, 0.515),
    new THREE.Vector2(0.0, 0.515),
  ];
  const parts: Part[] = [
    { g: new THREE.LatheGeometry(profile, 22), r: R.shirt, s: [1.05, 1, 0.74], grad: [0.82, 1.04] },
    { g: new THREE.TorusGeometry(0.086, 0.019, 6, 16), r: R.shirt, p: [0, 0.5, 0.004], q: [Math.PI / 2, 0, 0], s: [1, 1, 0.8], shade: 0.8 },
    { g: cyl(0.056, 0.07, 0.17, 12), r: R.skin, p: [0, NECK_REL, 0], s: [1.04, 1, 1], shade: 0.92 },
    { g: new THREE.TorusGeometry(0.073, 0.0055, 5, 18), r: R.chain, p: [0, 0.53, 0.004], q: [Math.PI / 2, 0, 0], s: [1, 1, 0.92] },
  ];
  if (tattoos) {
    parts.push(
      ink([0.058, 0.55, 0.022], [0.5, 1.9, 1.1]),
      ink([-0.057, 0.57, 0.028], [0.5, 1.6, 1.0]),
      ink([0.034, 0.56, 0.056], [1.1, 1.3, 0.5]),
      ink([-0.022, 0.575, 0.052], [0.9, 1.5, 0.5]),
      ink([0.0, 0.56, -0.058], [1.3, 1.1, 0.5]),
    );
  }
  return bake(parts);
};

const buildPelvis = (): THREE.BufferGeometry =>
  bake([
    { g: cap(0.17, 0.06), r: R.pants, p: [0, 0.06, 0], s: [1.25, 1, 0.86], grad: [0.8, 1] },
    { g: cyl(0.225, 0.238, 0.27, 22), r: R.shirt, p: [0, 0.095, 0], s: [1.05, 1, 0.76], grad: [0.84, 1] },
  ]);

const buildThigh = (): THREE.BufferGeometry =>
  bake([{ g: cap(0.12, 0.22), r: R.pants, p: [0, -0.225, 0], s: [1, 1, 0.95], grad: [0.84, 1.04] }]);

const buildShin = (): THREE.BufferGeometry =>
  bake([
    { g: cap(0.105, 0.2), r: R.pants, p: [0, -0.2, 0], s: [1, 1, 0.95], grad: [0.8, 1] },
    { g: cyl(0.108, 0.128, 0.1, 16), r: R.pants, p: [0, -0.345, 0], s: [1, 1, 0.96], shade: 0.9 },
  ]);

const buildFoot = (): THREE.BufferGeometry =>
  bake([
    { g: cap(0.075, 0.15), r: R.shoe, p: [0, 0.01, 0.05], q: [Math.PI / 2, 0, 0], s: [1.1, 0.95, 1] },
    { g: box(0.1, 0.045, 0.11), r: R.shoe, p: [0, 0.045, 0.12], q: [-0.25, 0, 0] },
    { g: box(0.1, 0.07, 0.07), r: R.shoe, p: [0, 0.07, -0.04] },
    { g: box(0.19, 0.05, 0.3), r: R.sole, p: [0, -0.047, 0.05] },
  ]);

const buildUpperArm = (tattoos: boolean): THREE.BufferGeometry => {
  const parts: Part[] = [
    { g: cap(0.1, 0.1), r: R.shirt, p: [0, -0.06, 0], grad: [0.86, 1.04] },
    { g: cyl(0.103, 0.103, 0.03, 14), r: R.shirt, p: [0, -0.205, 0], shade: 0.85 },
    { g: cap(0.055, 0.26), r: R.skin, p: [0, -0.185, 0], s: [1, 1, 0.96], grad: [0.88, 1] },
  ];
  if (tattoos) {
    parts.push(
      ink([0.0, -0.29, 0.052], [1.2, 1.8, 0.45]),
      ink([0.052, -0.3, 0.0], [0.45, 1.6, 1.0]),
      ink([-0.052, -0.27, 0.0], [0.45, 1.4, 1.0]),
    );
  }
  return bake(parts);
};

const buildForearm = (side: -1 | 1, tattoos: boolean): THREE.BufferGeometry => {
  const parts: Part[] = [
    { g: cap(0.047, 0.2), r: R.skin, p: [0, -0.147, 0], s: [1, 1, 0.94], grad: [0.9, 1] },
    { g: cyl(0.038, 0.044, 0.05, 10), r: R.skin, p: [0, -0.3, 0] },
    { g: sph(0.052, 10, 8), r: R.skin, p: [0, -0.335, 0], s: [0.74, 1.15, 0.56] },
    { g: cap(0.016, 0.03), r: R.skin, p: [-side * 0.036, -0.325, 0.014], q: [0.35, 0, side * 0.45] },
    { g: cap(0.0135, 0.05), r: R.skin, p: [0, -0.378, 0.012], q: [-0.28, 0, 0], s: [2.2, 1, 0.9], shade: 0.95 },
  ];
  if (tattoos) {
    parts.push(
      ink([side * 0.04, -0.06, 0.005], [0.45, 2.2, 1.1]),
      ink([side * 0.039, -0.15, 0.01], [0.45, 1.5, 1.0]),
      ink([0.005, -0.1, 0.042], [1.2, 2.0, 0.45]),
      ink([-side * 0.01, -0.21, 0.04], [1.0, 1.5, 0.45]),
      ink([side * 0.02, -0.24, -0.038], [1.0, 1.4, 0.45]),
    );
  }
  return bake(parts);
};

const getTemplates = (tattoos: boolean): Templates => {
  const key = tattoos ? "ink" : "plain";
  let t = templateCache[key];
  if (!t) {
    t = {
      head: buildHead(),
      eyes: buildEyes(),
      torso: buildTorso(tattoos),
      pelvis: buildPelvis(),
      thigh: buildThigh(),
      shin: buildShin(),
      foot: buildFoot(),
      upper: buildUpperArm(tattoos),
      fore: [buildForearm(-1, tattoos), buildForearm(1, tattoos)],
    };
    templateCache[key] = t;
  }
  return t;
};

let sharedMaterial: THREE.MeshStandardMaterial | null = null;
const characterMaterial = () => {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  }
  return sharedMaterial;
};

// ---------------------------------------------------------------------------------------------
// Marcha
// ---------------------------------------------------------------------------------------------
interface FootSample {
  z: number;
  lift: number;
  pitch: number;
  stance: boolean;
}

/**
 * Trajetoria do pe no referencial do quadril (z para frente).
 * Apoio: o pe recua em linha reta e na velocidade do corpo (nao desliza).
 * Balanco: arco para frente com elevacao e dorsiflexao.
 * `amp` (0..1) apaga o movimento quando o personagem para.
 */
const sampleFoot = (ph: number, duty: number, h: number, liftH: number, rb: number, amp: number, out: FootSample) => {
  if (ph < duty) {
    const s = ph / duty;
    out.stance = true;
    out.z = h * (1 - 2 * s);
    const heelStrike = -0.24 * (1 - rb) * (1 - smooth(0, 0.22, s)); // ponta do pe sobe no contato (caminhada)
    const toeOff = 0.62 * smooth(0.72, 1, s); // calcanhar sobe antes de sair do chao
    out.pitch = (heelStrike + toeOff) * amp;
    out.lift = 0;
  } else {
    const u = (ph - duty) / (1 - duty);
    out.stance = false;
    out.z = -h + 2 * h * (u * u * (3 - 2 * u));
    const endPitch = -0.24 * (1 - rb);
    let pitch = 0.62 + (-0.2 - 0.62) * smooth(0, 0.5, u);
    pitch = lerp(pitch, endPitch, smooth(0.55, 1, u));
    out.pitch = pitch * amp;
    out.lift = liftH * Math.sin(Math.PI * Math.pow(u, 0.85));
  }
  // O pe gira em torno do tornozelo: o ponto de apoio (ponta ou calcanhar) deve continuar no chao e parado.
  // Ponta do pe: 0.2 a frente do tornozelo; calcanhar: 0.1 atras; sola: 0.072 abaixo.
  if (out.pitch > 0) {
    const sn = Math.sin(out.pitch);
    const cs = Math.cos(out.pitch);
    out.lift += 0.2 * sn + 0.072 * (cs - 1);
    out.z += 0.2 * (1 - cs) + 0.072 * sn;
  } else {
    const sn = Math.sin(-out.pitch);
    const cs = Math.cos(out.pitch);
    out.lift += 0.1 * sn + 0.072 * (cs - 1);
    out.z -= 0.1 * (1 - cs) + 0.072 * sn;
  }
};

const FT: FootSample = { z: 0, lift: 0, pitch: 0, stance: true };

export class CharacterModel {
  group = new THREE.Group();
  name = "";
  speedForAnim = 0;
  jumpVelocity = 0;

  private hips: THREE.Group;
  private chest: THREE.Group;
  private headRig: THREE.Group;
  private torso: THREE.Mesh;
  private eyes: THREE.Mesh;
  private legs: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private ankles: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private elbows: THREE.Group[] = [];
  private parts: { geo: THREE.BufferGeometry; base: THREE.BufferGeometry }[] = [];
  private palette = new Float32Array(REGION_COUNT * 3);
  private colors = { skin: "#dca57a", shirt: "#121212", pants: "#16171a", hair: "#0e0b0a" };

  private cycle = Math.random();
  private idleTime = Math.random() * 20;
  private hipsH = HIPS_STAND;
  private accel = 0;
  private lean = 0;
  private prevYaw = 0;
  private turnRate = 0;
  private turnLean = 0;
  private wasGrounded = true;
  private landTimer = 0;
  private landImpact = 0;
  private lastVy = 0;
  private air = 0;
  private airLead = 0;
  private blinkTimer = 1.5 + Math.random() * 3;
  private blinkPhase = 0;
  private lookTarget = 0;
  private lookTimer = 2 + Math.random() * 3;
  private lookCurrent = 0;
  private label?: THREE.Sprite;
  private contact?: THREE.Mesh;
  private contactMat?: THREE.MeshBasicMaterial;
  private footL: FootSample = { z: 0, lift: 0, pitch: 0, stance: true };
  private footR: FootSample = { z: 0, lift: 0, pitch: 0, stance: true };

  constructor(
    skin = "#dca57a",
    shirt = "#121212",
    pants = "#16171a",
    hair = "#0e0b0a",
    label = "",
    opts: { tattoos?: boolean } = {},
  ) {
    this.colors = { skin, shirt, pants, hair };
    this.rebuildPalette();
    const t = getTemplates(!!opts.tattoos);

    this.hips = new THREE.Group();
    this.hips.position.y = HIPS_STAND;
    this.group.add(this.hips);
    this.hips.add(this.spawnMesh(t.pelvis));

    // pernas: coxa -> joelho -> canela -> tornozelo -> pe
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.x = side * 0.105;
      leg.rotation.order = "YXZ"; // permite desfazer a guinada do quadril sem entortar a perna
      leg.add(this.spawnMesh(t.thigh));
      const knee = new THREE.Group();
      knee.position.y = -L1;
      knee.add(this.spawnMesh(t.shin));
      const ankle = new THREE.Group();
      ankle.position.y = -L2;
      ankle.add(this.spawnMesh(t.foot));
      knee.add(ankle);
      leg.add(knee);
      this.hips.add(leg);
      this.legs.push(leg);
      this.knees.push(knee);
      this.ankles.push(ankle);
    }

    // coluna: tronco, cabeca e bracos seguem o quadril e podem girar contra ele
    this.chest = new THREE.Group();
    this.chest.position.y = CHEST_REL;
    this.hips.add(this.chest);
    this.torso = this.spawnMesh(t.torso);
    this.chest.add(this.torso);

    this.headRig = new THREE.Group();
    this.headRig.position.y = HEAD_REL;
    this.chest.add(this.headRig);
    this.headRig.add(this.spawnMesh(t.head));
    this.eyes = this.spawnMesh(t.eyes);
    this.eyes.position.y = 0.015;
    this.eyes.castShadow = false;
    this.eyes.receiveShadow = false;
    this.headRig.add(this.eyes);

    for (const side of [-1, 1] as const) {
      const arm = new THREE.Group();
      arm.position.set(side * SHOULDER_X, SHOULDER_REL, 0);
      arm.rotation.z = side * 0.1;
      arm.add(this.spawnMesh(t.upper));
      const elbow = new THREE.Group();
      elbow.position.y = ELBOW_Y;
      elbow.add(this.spawnMesh(t.fore[side < 0 ? 0 : 1]));
      arm.add(elbow);
      this.chest.add(arm);
      this.arms.push(arm);
      this.elbows.push(elbow);
    }

    this.group.scale.setScalar(0.94);

    this.contactMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.contact = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), this.contactMat);
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.03;
    this.contact.renderOrder = -1;
    this.contact.visible = false;
    this.group.add(this.contact);

    this.update(0.016, 0, true);
    this.setName(label);
  }

  // -------------------------------------------------------------------------------------------
  // Malha e cores
  // -------------------------------------------------------------------------------------------
  private rebuildPalette() {
    const set = (region: number, hex: string) => {
      _c.set(hex);
      this.palette[region * 3] = _c.r;
      this.palette[region * 3 + 1] = _c.g;
      this.palette[region * 3 + 2] = _c.b;
    };
    set(R.skin, this.colors.skin);
    set(R.shirt, this.colors.shirt);
    set(R.pants, this.colors.pants);
    set(R.hair, this.colors.hair);
    for (const key of Object.keys(FIXED_COLORS)) set(Number(key), FIXED_COLORS[Number(key)]!);
    _c.set(this.colors.hair);
    _f.set(this.colors.skin);
    _c.lerp(_f, 0.4);
    this.palette[R.fade * 3] = _c.r;
    this.palette[R.fade * 3 + 1] = _c.g;
    this.palette[R.fade * 3 + 2] = _c.b;
  }

  private paint(geo: THREE.BufferGeometry, base: THREE.BufferGeometry) {
    const region = base.getAttribute("region");
    const shade = base.getAttribute("shade");
    let color = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!color) {
      color = new THREE.BufferAttribute(new Float32Array(region.count * 3), 3);
      geo.setAttribute("color", color);
    }
    const out = color.array as Float32Array;
    const pal = this.palette;
    for (let i = 0; i < region.count; i++) {
      const k = region.getX(i) * 3;
      const s = shade.getX(i);
      out[i * 3] = pal[k]! * s;
      out[i * 3 + 1] = pal[k + 1]! * s;
      out[i * 3 + 2] = pal[k + 2]! * s;
    }
    color.needsUpdate = true;
  }

  /** Cada personagem tem a propria geometria (so a cor muda); nada e compartilhado, entao dispose e seguro. */
  private spawnMesh(base: THREE.BufferGeometry): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", base.getAttribute("position").clone());
    geo.setAttribute("normal", base.getAttribute("normal").clone());
    const index = base.getIndex();
    if (index) geo.setIndex(index.clone());
    if (base.boundingSphere) geo.boundingSphere = base.boundingSphere.clone();
    this.paint(geo, base);
    this.parts.push({ geo, base });
    const mesh = new THREE.Mesh(geo, characterMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  setName(name: string) {
    this.name = name;
    if (this.label) {
      this.group.remove(this.label);
      this.label.material.map?.dispose();
      this.label.material.dispose();
      this.label = undefined;
    }
    if (!name) return;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = "rgba(6,23,25,.76)";
    ctx.beginPath();
    ctx.roundRect(26, 26, 460, 76, 28);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,209,102,.65)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "800 38px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 18), 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true }),
    );
    sprite.position.y = LABEL_Y;
    sprite.scale.set(3.1, 0.78, 1);
    this.label = sprite;
    this.group.add(sprite);
  }

  setColors(opts: { skin?: string; shirt?: string; pants?: string; hair?: string }) {
    let changed = false;
    for (const key of ["skin", "shirt", "pants", "hair"] as const) {
      const value = opts[key];
      if (value && value !== this.colors[key]) {
        this.colors[key] = value;
        changed = true;
      }
    }
    if (!changed) return;
    this.rebuildPalette();
    for (const part of this.parts) this.paint(part.geo, part.base);
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  /** Longe da camera os olhos nao aparecem: economiza um draw call por personagem. */
  setFar(far: boolean) {
    this.eyes.visible = !far;
  }

  setCastShadow(v: boolean) {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && obj !== this.contact && obj !== this.eyes) {
        mesh.castShadow = v;
        mesh.receiveShadow = v;
      }
    });
  }

  setContactShadow(enabled: boolean) {
    // Em modo leve o personagem nao projeta sombra em tempo real
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && obj !== this.contact) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    if (this.contact) this.contact.visible = enabled;
  }

  // -------------------------------------------------------------------------------------------
  // IK de perna (plano sagital). tz/ty: posicao do tornozelo relativa ao quadril; pitch: inclinacao
  // do pe no mundo (positivo = ponta para baixo).
  // -------------------------------------------------------------------------------------------
  private solveLeg(i: number, tz: number, ty: number, pitch: number) {
    const maxD = L1 + L2 - 0.003;
    const minD = Math.abs(L1 - L2) + 0.03;
    let d = Math.hypot(tz, ty);
    if (d > maxD) {
      const k = maxD / d;
      tz *= k;
      ty *= k;
      d = maxD;
    } else if (d < minD) {
      d = minD;
    }
    const alpha = Math.atan2(tz, -ty); // linha quadril -> tornozelo, a partir da vertical
    const beta = Math.acos(clampNum((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const gamma = Math.acos(clampNum((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const knee = Math.PI - gamma; // flexao do joelho
    const thighFwd = alpha + beta; // joelho sempre para frente
    this.legs[i]!.rotation.x = -thighFwd;
    this.knees[i]!.rotation.x = knee;
    this.ankles[i]!.rotation.x = clampNum(pitch - knee + thighFwd, -0.9, 1.0);
  }

  update(dt: number, speed: number, grounded = true) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);

    // ---- velocidade suavizada e aceleracao ------------------------------------------------
    const prevSpd = this.speedForAnim;
    this.speedForAnim += (speed - prevSpd) * Math.min(1, dt * 8);
    if (speed === 0 && this.speedForAnim < 0.03) this.speedForAnim = 0;
    const spd = this.speedForAnim;
    this.accel += ((spd - prevSpd) / dt - this.accel) * Math.min(1, dt * 5);
    this.idleTime += dt;

    const kS = smooth(0.05, 0.7, spd); // 0 = parado, 1 = andando
    const rb = smooth(1.8, 3.2, spd); // caminhada -> corrida
    const sprint = smooth(5.2, 7.6, spd);
    const idleW = 1 - kS;
    const breath = Math.sin(this.idleTime * 1.9) * 0.012;

    // ---- giro e curva --------------------------------------------------------------------
    const yaw = this.group.rotation.y;
    let dyaw = yaw - this.prevYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.prevYaw = yaw;
    this.turnRate += (dyaw / dt - this.turnRate) * Math.min(1, dt * 8);
    const targetTurnLean = clampNum(-this.turnRate * 0.035, -0.16, 0.16) * Math.min(1, spd / 4);
    this.turnLean += (targetTurnLean - this.turnLean) * Math.min(1, dt * 7);

    // ---- chao / ar / aterrissagem --------------------------------------------------------
    if (!grounded) {
      if (this.wasGrounded) this.airLead = this.cycle < 0.5 ? 0 : 1;
      this.lastVy = this.jumpVelocity;
    } else if (!this.wasGrounded) {
      this.landTimer = LAND_TIME;
      this.landImpact = clampNum(Math.abs(this.lastVy) / 6, 0.35, 1);
    }
    this.wasGrounded = grounded;
    this.air += ((grounded ? 0 : 1) - this.air) * Math.min(1, dt * (grounded ? 12 : 18));
    if (this.landTimer > 0) this.landTimer = Math.max(0, this.landTimer - dt);
    const landP = 1 - this.landTimer / LAND_TIME;
    const land = this.landTimer > 0 ? this.landImpact * Math.sin(Math.PI * Math.pow(landP, 0.55)) : 0;

    // ---- piscar --------------------------------------------------------------------------
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkPhase = 1;
      this.blinkTimer = 2.2 + Math.random() * 3.4;
    }
    if (this.blinkPhase > 0) this.blinkPhase = Math.max(0, this.blinkPhase - dt * 7);
    this.eyes.scale.y = Math.max(0.1, 1 - Math.sin(this.blinkPhase * Math.PI) * 0.9);

    // ---- parametros da marcha ------------------------------------------------------------
    const duty = lerp(0.62, 0.34, rb) - 0.07 * sprint; // fracao do ciclo com o pe no chao
    const hMax = lerp(0.34, 0.44, rb) + 0.03 * sprint; // alcance maximo da perna
    const cadence = 0.78 + 0.16 * spd; // ciclos/s desejados
    const hNom = (spd * duty) / (2 * cadence);
    const h = Math.min(hNom, hMax);
    // frequencia que faz o pe recuar exatamente na velocidade do corpo (sem patinar)
    const freq = h > 1e-4 ? clampNum((spd * duty) / (2 * h), 0, 2.6) : 0;
    if (spd > 0.03) this.cycle = (this.cycle + dt * freq) % 1;
    const liftH = Math.min(0.3, 0.06 + 0.035 * spd);

    const phA = this.cycle;
    const phB = (this.cycle + 0.5) % 1;
    sampleFoot(phA, duty, h * kS, liftH * kS, rb, kS, FT);
    const fa = this.footL;
    fa.z = FT.z;
    fa.lift = FT.lift;
    fa.pitch = FT.pitch;
    fa.stance = FT.stance;
    sampleFoot(phB, duty, h * kS, liftH * kS, rb, kS, FT);
    const fb = this.footR;
    fb.z = FT.z;
    fb.lift = FT.lift;
    fb.pitch = FT.pitch;
    fb.stance = FT.stance;

    // ---- altura do quadril ----------------------------------------------------------------
    // Caminhada: pendulo invertido (alto no meio do apoio, baixo nos contatos).
    // Corrida: mola (baixo no meio do apoio, alto no voo).
    const wave = Math.cos(4 * Math.PI * (this.cycle - duty * 0.5));
    const hRun = 0.85 - 0.075 * ((wave + 1) / 2);
    const hMove = lerp(0.905, hRun, rb);
    let hipsTarget = lerp(HIPS_STAND - 0.006 + breath * 0.5, hMove, kS);
    const reach = L1 + L2 - 0.012;
    if (fa.stance) hipsTarget = Math.min(hipsTarget, ANKLE_H + Math.sqrt(Math.max(0.01, reach * reach - fa.z * fa.z)));
    if (fb.stance) hipsTarget = Math.min(hipsTarget, ANKLE_H + Math.sqrt(Math.max(0.01, reach * reach - fb.z * fb.z)));
    hipsTarget -= land * 0.17;
    if (hipsTarget < this.hipsH) this.hipsH = hipsTarget;
    else this.hipsH += (hipsTarget - this.hipsH) * Math.min(1, dt * 20);

    const air = this.air;
    const fall = smooth(2.5, -3.5, this.jumpVelocity); // 0 subindo, 1 caindo
    const hipsY = lerp(this.hipsH, HIPS_STAND, air);
    this.hips.position.y = hipsY;

    // no pouso o quadril recua e os pes ficam onde estao
    const zShift = land * 0.1;
    this.hips.position.z = -zShift;

    // ---- pernas (IK) ----------------------------------------------------------------------
    const speedAir = clampNum(spd / 5, 0, 1);
    for (let i = 0; i < 2; i++) {
      const f = i === 0 ? fa : fb;
      const lead = this.airLead === i;
      let tz = f.z + zShift;
      let ty = -(this.hipsH - ANKLE_H) + f.lift;
      let pitch = f.pitch;
      if (air > 0.001) {
        // pose no ar: uma perna avanca, a outra fica atras; ao cair, estende para receber o chao
        const aTz = lead ? lerp(0.1 + 0.22 * speedAir, 0.14, fall) : lerp(-0.2 * speedAir - 0.02, -0.05, fall);
        const aTy = lead ? lerp(-0.58, -0.78, fall) : lerp(-0.62, -0.76, fall);
        const aPitch = lerp(0.4, -0.1, fall);
        tz = lerp(tz, aTz, air);
        ty = lerp(ty, aTy, air);
        pitch = lerp(pitch, aPitch, air);
      }
      this.solveLeg(i, tz, ty, pitch);
    }

    // ---- quadril e coluna -----------------------------------------------------------------
    const swingA = clampNum((fa.z - fb.z) / Math.max(0.001, 2 * h * kS), -1, 1); // +1: pe A a frente
    const w = kS > 0.01 ? swingA : 0;
    const shift = idleW * Math.sin(this.idleTime * 0.55); // troca de apoio parado
    const yawAmp = kS * (0.06 + 0.06 * rb);
    const rollAmp = kS * 0.045 * (1 - rb * 0.4);
    const hipYaw = yawAmp * w * (1 - air);
    const hipRoll = -rollAmp * Math.cos(2 * Math.PI * (this.cycle - duty * 0.5)) * (1 - air) + shift * 0.03;
    this.hips.rotation.y = hipYaw;
    this.hips.rotation.z = hipRoll;
    this.hips.position.x = shift * 0.012;
    // as pernas ficam alinhadas com o sentido de deslocamento mesmo com a pelve girando
    this.legs[0]!.rotation.y = -hipYaw;
    this.legs[1]!.rotation.y = -hipYaw;

    const targetLean =
      kS * (0.03 + 0.15 * rb + 0.012 * Math.max(0, spd - 5)) + clampNum(this.accel * 0.007, -0.12, 0.14) * kS;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 7);
    const chestPitch = this.lean + land * 0.2 + air * 0.05;
    this.chest.rotation.x = chestPitch;
    this.chest.rotation.y = -hipYaw * 1.7 * (1 - air); // ombros contra a pelve
    this.chest.rotation.z = this.turnLean - hipRoll * 0.8;
    const chestScale = 1 + breath * idleW;
    this.torso.scale.set(chestScale, 1 + breath * idleW * 0.5, chestScale);

    // ---- bracos ---------------------------------------------------------------------------
    const armAmp = kS * clampNum(0.15 + 0.17 * spd, 0, 1.15);
    const sway = idleW * Math.sin(this.idleTime * 0.9) * 0.03;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      // o braco vai para frente quando a perna do lado oposto vai para frente
      let forward = (i === 0 ? -w : w) * armAmp + (i === 0 ? sway : -sway) - land * 0.25;
      let out = 0.09 + rb * 0.05 + idleW * 0.02 + land * 0.18;
      let flex = 0.2 + rb * 1.1 + Math.max(0, forward) * 0.5 * (1 - 0.5 * rb) + idleW * (0.1 + breath * 6);
      if (air > 0.001) {
        forward = lerp(forward, lerp(1.2, 0.45, fall), air);
        out = lerp(out, lerp(0.25, 0.85, fall), air);
        flex = lerp(flex, 0.5, air);
      }
      this.arms[i]!.rotation.x = -forward;
      this.arms[i]!.rotation.z = side * out;
      this.elbows[i]!.rotation.x = -flex;
    }

    // ---- cabeca: estabiliza o olhar e olha em volta no idle -----------------------------------
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 1.6 + Math.random() * 4;
      this.lookTarget = spd > 0.2 ? 0 : (Math.random() - 0.5) * 0.9;
    }
    if (spd > 0.2) this.lookTarget = 0;
    this.lookCurrent += (this.lookTarget - this.lookCurrent) * Math.min(1, dt * 2.6);
    const nod = Math.cos(4 * Math.PI * this.cycle) * 0.012 * kS;
    this.headRig.rotation.x = -chestPitch * 0.6 + nod + Math.sin(this.idleTime * 0.7) * 0.02 * idleW + land * 0.1;
    this.headRig.rotation.y =
      this.lookCurrent - (this.hips.rotation.y + this.chest.rotation.y) * 0.7 - this.turnLean * 1.5;
    this.headRig.rotation.z = this.turnLean * 0.8 - this.chest.rotation.z * 0.5;

    // ---- sombra de contato -----------------------------------------------------------------
    if (this.contact && this.contact.visible && this.contactMat) {
      const lift = this.group.position.y;
      const k = Math.max(0, 1 - lift / 2.2);
      this.contact.position.y = 0.03 - lift;
      this.contact.rotation.x = -Math.PI / 2 - this.group.rotation.x;
      this.contact.scale.setScalar(0.82 + k * 0.18);
      this.contactMat.opacity = 0.34 * k;
    }
    if (this.label) this.label.position.y = LABEL_Y;
  }

  dispose() {
    for (const part of this.parts) part.geo.dispose();
    this.parts.length = 0;
    this.contactMat?.dispose();
    this.contact?.geometry.dispose();
    if (this.label) {
      this.label.material.map?.dispose();
      this.label.material.dispose();
    }
  }
}
