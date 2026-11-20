import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DynamicCuller } from "./dynamic-culling";
import {
  CITY_LIMIT,
  CLOTHES,
  COMMERCE_COUNTER_DEPTH,
  COMMERCE_DOOR_HEIGHT,
  COMMERCE_DOOR_WIDTH,
  COMMERCE_WALL,
  GARAGE,
  HOUSES,
  HOUSE_BED_SIZE,
  HOUSE_DOOR_HEIGHT,
  HOUSE_DOOR_WIDTH,
  HOUSE_FRIDGE_SIZE,
  HOUSE_SOFA_SIZE,
  HOUSE_WALL,
  HOUSE_WARDROBE_SIZE,
  OCEAN_EDGE,
  PERF,
  QUALITY,
  RESERVED_BLOCKS,
  ROAD_LINES,
  SHOP_ACCENT,
  SHOP_BLURB,
  districtFor,
  shopKindFor,
  shopSlug,
  SKIN_TONES,
  WORLD_SIZE,
  blockCenters,
  commerceBack,
  commerceCounterBox,
  commerceFront,
  commerceRoom,
  commerceShelfPlan,
  commerceStaffPoint,
  commerceBounds,
  commerceWalls,
  houseBack,
  houseBed,
  houseDepth,
  houseDoor,
  houseFridge,
  houseFront,
  houseSofa,
  houseTable,
  houseWardrobe,
  houseWalls,
  type CommerceSpec,
  type Facing,
  type HouseSpec,
  type QualityName,
} from "./config";
import { CharacterModel } from "./character";
import { Rng, clamp } from "./util";
import {
  makeAsphaltTextures,
  makeBillboardTexture,
  makeCityGroundTexture,
  makeCloudTexture,
  makeDedicationTexture,
  makeFacadeTextures,
  makeFavelaTexture,
  makeGhostCitySignTexture,
  makeGlowTexture,
  makeGrassTexture,
  makeLightPoolTexture,
  makeMuralTexture,
  makePalmBarkTexture,
  makePalmFrondTexture,
  makePromenadeTexture,
  makeRoofTexture,
  makeSandTexture,
  makeShopFloorTexture,
  makeShopWallTexture,
  makeSidewalkTexture,
  makeSignTexture,
  makeStorefrontTexture,
  makeUpperFloorTextures,
  storefrontBays,
  makeWaterNormalTexture,
} from "./textures";

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface MapBuilding {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

export interface MapRoad {
  vertical: boolean;
  pos: number;
}

export interface MapLandmark {
  x: number;
  z: number;
  label: string;
  color: string;
}

export interface MapData {
  buildings: MapBuilding[];
  roads: MapRoad[];
  landmarks: MapLandmark[];
  favela: { minX: number; maxX: number; minZ: number; maxZ: number };
  beach: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const trafficPoleMaterial = new THREE.MeshStandardMaterial({ color: "#2f3b38", roughness: 0.42, metalness: 0.65 });
const trafficHousingMaterial = new THREE.MeshStandardMaterial({ color: "#202826", roughness: 0.55, metalness: 0.35 });
const trafficBackMaterial = new THREE.MeshStandardMaterial({ color: "#141b19", roughness: 0.7 });
const trafficDiscMaterial = new THREE.MeshBasicMaterial({ color: "#ff3f2f" });
const trafficDiscAmberMaterial = new THREE.MeshBasicMaterial({ color: "#332a16" });
const trafficDiscGreenMaterial = new THREE.MeshBasicMaterial({ color: "#1e3a29" });
/** Tamanho da celula da grade de colisao (metros). */
const COLLIDER_CELL = 12;

const waveVertex = `
uniform float uWaveTime;
float waveHeight(vec2 p) {
  return sin(p.x * 0.12 + uWaveTime * 1.5) * 0.17 +
    sin(p.y * 0.09 - uWaveTime * 1.1) * 0.12 +
    sin((p.x + p.y) * 0.05 + uWaveTime * 0.7) * 0.06;
}
vec3 waveNormal(vec2 p) {
  const float e = 0.5;
  float h0 = waveHeight(p);
  float hx = waveHeight(p + vec2(e, 0.0));
  float hz = waveHeight(p + vec2(0.0, e));
  return normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e));
}
`;

const applyWaves = (mat: THREE.Material, uniform: { value: number }) => {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaveTime = uniform;
    shader.vertexShader = waveVertex + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
       objectNormal = waveNormal(position.xz);`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       transformed.y += waveHeight(position.xz);`,
    );
  };
  mat.customProgramCacheKey = () => "rio-ocean-waves";
};

const tiledBoxGeometry = (
  w: number,
  h: number,
  d: number,
  uTile: number,
  vTile: number,
  singleFace = -1,
) => {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let face = 0; face < 6; face++) {
    const dimU = face < 2 ? d : w;
    const ru = face === singleFace ? 1 : Math.max(1, Math.round(dimU / uTile));
    const rv = Math.max(1, Math.round(h / vTile));
    const start = face * 4;
    for (let i = 0; i < 4; i++) {
      const idx = start + i;
      uv.setXY(idx, uv.getX(idx) * ru, uv.getY(idx) * rv);
    }
  }
  uv.needsUpdate = true;
  return geo;
};

const hillGeometry = (radius: number, height: number, seed: number) => {
  const geo = new THREE.ConeGeometry(radius, height, 40, 10, false);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const angle = Math.atan2(z, x);
    const radial =
      1 +
      Math.sin(angle * 3 + seed * 0.7) * 0.13 +
      Math.sin(angle * 7 - seed * 0.3) * 0.07 +
      Math.sin(angle * 13 + 1.9) * 0.035;
    pos.setX(i, x * radial);
    pos.setZ(i, z * radial);
    pos.setY(i, y + Math.sin(angle * 6 + seed) * height * 0.012);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

const roundedRockGeometry = (radius: number, height: number, seed: number) => {
  const geo = new THREE.SphereGeometry(1, 40, 28);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const noise =
      1 +
      Math.sin(angle * 3 + seed) * 0.1 +
      Math.sin(angle * 6 - seed * 0.4) * 0.06 +
      Math.sin(y * 8 + seed) * 0.035;
    pos.setX(i, x * noise * radius);
    pos.setZ(i, z * noise * radius * 0.82);
    pos.setY(i, y * noise * height * 0.62);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
};

const frondGeometry = () => {
  const geo = new THREE.PlaneGeometry(0.62, 4.1, 1, 7);
  geo.translate(0, 2.05, 0);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = clamp(y / 4.1, 0, 1);
    pos.setX(i, x * (1 - t * 0.84));
    pos.setZ(i, -0.9 * t * t);
  }
  pos.needsUpdate = true;
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
};

const frondMeshGeometry = (seed: number) => {
  const rng = new Rng(seed);
  const base = frondGeometry();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const g = base.clone();
    const yaw = (i / 9) * Math.PI * 2 + rng.range(-0.14, 0.14);
    const tilt = -0.05 + rng.range(-0.13, 0.2);
    const scale = rng.range(0.82, 1.06);
    const m = new THREE.Matrix4()
      .makeRotationY(yaw)
      .multiply(new THREE.Matrix4().makeRotationX(tilt))
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    g.applyMatrix4(m);
    parts.push(g);
  }
  base.dispose();
  const merged = mergeGeometries(parts, false) ?? parts[0]!;
  for (const g of parts) g.dispose();
  return merged;
};

export class World {
  scene: THREE.Scene;
  colliders: BoxCollider[] = [];
  /** Grade espacial dos colisores: evita varrer a cidade inteira a cada passo. */
  private colliderCells = new Map<string, number[]>();
  mapData: MapData;
  emissiveMaterials: THREE.MeshStandardMaterial[] = [];
  lampMaterials: THREE.MeshBasicMaterial[] = [];
  clouds: THREE.Sprite[] = [];
  ocean?: THREE.Mesh;
  foam?: THREE.Mesh;
  waterNormal?: THREE.CanvasTexture;
  statueMaterial?: THREE.MeshStandardMaterial;
  garageSign?: THREE.Sprite;
  night = 0;
  private rng = new Rng(74219);
  private facadeMaterials: THREE.MeshStandardMaterial[] = [];
  private upperMaterials: THREE.MeshStandardMaterial[] = [];
  private storefrontMaterials: THREE.MeshStandardMaterial[] = [];
  private storefrontMaterialsWide: THREE.MeshStandardMaterial[] = [];
  private favelaMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private favelaTexture = makeFavelaTexture();
  private asphalt = makeAsphaltTextures();
  private palmFrondTexture = makePalmFrondTexture();
  private palmBarkTexture = makePalmBarkTexture();
  private palmTrunkMaterial = new THREE.MeshStandardMaterial({
    map: this.palmBarkTexture,
    color: "#c3a87f",
    roughness: 0.92,
    envMapIntensity: 0.3,
  });
  private palmLeafMaterial = new THREE.MeshStandardMaterial({
    map: this.palmFrondTexture,
    color: "#d9e8c8",
    roughness: 0.82,
    alphaTest: 0.38,
    side: THREE.DoubleSide,
    envMapIntensity: 0.45,
  });
  private coconutMaterial = new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.8 });
  private treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: "#6d5338", roughness: 0.92 });
  private treeLeafMaterials = ["#3a7040"].map(
    (color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, envMapIntensity: 0.35 }),
  );
  private roofMaterial: THREE.MeshStandardMaterial;
  private roadMaterialV: THREE.MeshStandardMaterial;
  private roadMaterialH: THREE.MeshStandardMaterial;
  private sidewalkMaterial: THREE.MeshStandardMaterial;
  private trimMaterial: THREE.MeshStandardMaterial;
  private windowGlassMaterial: THREE.MeshStandardMaterial;
  private awningMaterials: THREE.MeshStandardMaterial[] = [];
  private interiorWallTexture: THREE.Texture;
  private interiorFloorMaterial: THREE.MeshStandardMaterial;
  /** Celula do agrupamento de malhas: quanto maior, menos draw calls. */
  private mergeCell = 140;
  private quality: QualityName = "medium";
  /** Cache de materiais para nao criar centenas de materiais iguais. */
  private materialCache = new Map<string, THREE.Material>();
  private entranceMaterials: THREE.MeshStandardMaterial[] = [];
  private entranceLights: THREE.SpotLight[] = [];
  private entranceGlow?: THREE.Sprite;
  private lampGlowMaterial?: THREE.PointsMaterial;
  private lampPoolMaterial?: THREE.MeshBasicMaterial;
  private buildingGroup = new THREE.Group();
  private propGroup = new THREE.Group();
  private shopStaff = new Map<string, CharacterModel[]>();
  private shopHeights = new Map<string, number>();
  private shopLight = new THREE.PointLight(0xffe6bd, 0, 13, 2);
  /** Luzes de ponto fixas (casas, letreiro). No modo leve ficam desligadas: cada luz custa em todo pixel. */
  private houseLamps = new Map<string, THREE.PointLight>();
  private glowLights: THREE.PointLight[] = [];
  private activeStaff: CharacterModel[] = [];
  /** Lojas funcionais descobertas nas fachadas que ja existiam na cidade. */
  public shops: CommerceSpec[] = [];
  private shopInteriors = new Map<string, THREE.Group>();
  private shopColliders = new Map<string, number>();
  private shopSpecs = new Map<string, CommerceSpec>();
  private activeShopBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private builtInteriors = new Set<string>();
  private activeShopId: string | null = null;
  private waveUniform = { value: 0 };
  private oceanPhysical = true;
  private oceanMaterial?: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

  constructor(scene: THREE.Scene, quality: QualityName = "medium") {
    this.scene = scene;
    this.quality = quality;
    this.oceanPhysical = QUALITY[quality].oceanPhysical;
    this.mergeCell = quality === "low" ? PERF.worldCellSize : quality === "medium" ? 700 : 560;
    this.mapData = {
      buildings: [],
      roads: ROAD_LINES.map((pos) => ({ vertical: true, pos })),
      landmarks: [],
      favela: { minX: -246, maxX: -157, minZ: -140, maxZ: 150 },
      beach: { minX: 164, maxX: 230, minZ: -245, maxZ: 245 },
    };
    for (const pos of ROAD_LINES) this.mapData.roads.push({ vertical: false, pos });
    this.roofMaterial = new THREE.MeshStandardMaterial({ map: makeRoofTexture(), roughness: 0.92, envMapIntensity: 0.5 });
    const asphalt = this.asphalt;
    const asphaltMaterial = (repeatX: number, repeatY: number) => {
      const map = asphalt.map.clone();
      const bump = asphalt.bump.clone();
      const roughness = asphalt.roughness.clone();
      for (const tex of [map, bump, roughness]) {
        tex.repeat.set(repeatX, repeatY);
        tex.needsUpdate = true;
      }
      return new THREE.MeshStandardMaterial({
        map,
        bumpMap: bump,
        bumpScale: 0.035,
        roughnessMap: roughness,
        roughness: 1,
        metalness: 0.02,
        envMapIntensity: 0.55,
      });
    };
    this.roadMaterialV = asphaltMaterial(2, 34);
    this.roadMaterialH = asphaltMaterial(34, 2);
    const walk = makeSidewalkTexture();
    this.sidewalkMaterial = new THREE.MeshStandardMaterial({
      map: walk.map,
      bumpMap: walk.bump,
      bumpScale: 0.03,
      roughness: 0.94,
      envMapIntensity: 0.4,
    });
    this.trimMaterial = new THREE.MeshStandardMaterial({ color: "#d3c9b2", roughness: 0.8, envMapIntensity: 0.5 });
    this.interiorWallTexture = makeShopWallTexture();
    this.interiorFloorMaterial = new THREE.MeshStandardMaterial({
      map: makeShopFloorTexture(),
      roughness: 0.48,
      metalness: 0.05,
      envMapIntensity: 0.5,
    });
    this.windowGlassMaterial = new THREE.MeshStandardMaterial({
      color: "#9fc4c8",
      roughness: 0.12,
      metalness: 0.45,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 1.4,
    });
    for (const color of ["#b94735", "#1f6f61", "#d0a439", "#315f7e", "#7c4867"]) {
      this.awningMaterials.push(new THREE.MeshStandardMaterial({ color, roughness: 0.72, envMapIntensity: 0.4 }));
    }
    for (let i = 0; i < 12; i++) {
      const tex = makeStorefrontTexture(i, 2);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: new THREE.Color("#ffd489"),
        emissiveIntensity: 0,
        bumpMap: tex.bump,
        bumpScale: 0.03,
        roughnessMap: tex.roughness,
        roughness: 1,
        metalness: 0.03,
        envMapIntensity: 0.65,
      });
      this.storefrontMaterials.push(mat);
      this.emissiveMaterials.push(mat);
    }
    for (let i = 0; i < 6; i++) {
      const tex = makeStorefrontTexture(i, 4);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: new THREE.Color("#ffd489"),
        emissiveIntensity: 0,
        bumpMap: tex.bump,
        bumpScale: 0.03,
        roughnessMap: tex.roughness,
        roughness: 1,
        metalness: 0.03,
        envMapIntensity: 0.65,
      });
      this.storefrontMaterialsWide.push(mat);
      this.emissiveMaterials.push(mat);
    }
    for (let i = 0; i < 8; i++) {
      const tex = makeFacadeTextures(i, 0.4 + i * 0.04);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: new THREE.Color("#ffd27b"),
        emissiveIntensity: 0,
        bumpMap: tex.bump,
        bumpScale: 0.025,
        roughnessMap: tex.roughness,
        roughness: 1,
        metalness: 0.04,
        envMapIntensity: 0.85,
      });
      this.facadeMaterials.push(mat);
      this.emissiveMaterials.push(mat);
    }
    for (let i = 0; i < 8; i++) {
      const tex = makeUpperFloorTextures(i);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: new THREE.Color("#ffd27b"),
        emissiveIntensity: 0,
        bumpMap: tex.bump,
        bumpScale: 0.03,
        roughnessMap: tex.roughness,
        roughness: 1,
        metalness: 0.04,
        envMapIntensity: 0.9,
      });
      this.upperMaterials.push(mat);
      this.emissiveMaterials.push(mat);
    }
    this.build();
    this.buildingGroup.name = "buildings";
    this.propGroup.name = "props";
    scene.add(this.buildingGroup, this.propGroup, this.shopLight);
  }

  /** Registra os lotes estáticos mesclados para culling de distância sem varrer a cena por frame. */
  registerStaticCullables(culler: DynamicCuller): number {
    this.scene.updateMatrixWorld(true);
    let registered = 0;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !obj.userData?.merged) return;
      const x = Number(obj.userData.cullX);
      const z = Number(obj.userData.cullZ);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      culler.add(obj, { x, z, follow: false });
      registered++;
    });
    return registered;
  }

  private addCollider(x: number, z: number, w: number, d: number, height = 20) {
    this.colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      height,
    });
    const index = this.colliders.length - 1;
    const cell = this.colliders[index]!;
    const cx0 = Math.floor(cell.minX / COLLIDER_CELL);
    const cx1 = Math.floor(cell.maxX / COLLIDER_CELL);
    const cz0 = Math.floor(cell.minZ / COLLIDER_CELL);
    const cz1 = Math.floor(cell.maxZ / COLLIDER_CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = `${cx},${cz}`;
        const bucket = this.colliderCells.get(key);
        if (bucket) bucket.push(index);
        else this.colliderCells.set(key, [index]);
      }
    }
  }

  /** Colisor de veiculo (caixa alinhada aos eixos, mesmo com o carro virado). */
  addVehicleCollider(x: number, z: number, w: number, d: number, ry: number) {
    const c = Math.abs(Math.cos(ry));
    const s = Math.abs(Math.sin(ry));
    this.addCollider(x, z, w * c + d * s, w * s + d * c, 1.7);
  }

  /**
   * Joga um objeto de rua para a calcada: fora do asfalto e fora dos predios.
   * Sem isso o mobiliario aparece no meio da pista e o jogador o atravessa.
   */
  /** Mantem arvores e palmeiras fora do asfalto, inclusive nas bordas do mapa. */
  private roadSafe(x: number, z: number) {
    const clearance = 6.4;
    let px = x;
    let pz = z;
    for (const line of ROAD_LINES) {
      if (Math.abs(px - line) < clearance) px = line + (px >= line ? clearance : -clearance);
      if (Math.abs(pz - line) < clearance) pz = line + (pz >= line ? clearance : -clearance);
    }
    return { x: px, z: pz };
  }

  private sidewalkSpot(x: number, z: number) {
    const roadHalf = 5.2;
    const walk = 6.6;
    let px = x;
    let pz = z;
    for (const line of ROAD_LINES) {
      if (Math.abs(px - line) < roadHalf) px = line + (px >= line ? walk : -walk);
      if (Math.abs(pz - line) < roadHalf) pz = line + (pz >= line ? walk : -walk);
    }
    const centers = blockCenters();
    for (const c of centers) {
      if (Math.abs(px - c) < 16.3) px = c + (px >= c ? 17.5 : -17.5);
      if (Math.abs(pz - c) < 16.3) pz = c + (pz >= c ? 17.5 : -17.5);
    }
    return { x: px, z: pz };
  }

  /** Material compartilhado: evita centenas de materiais identicos na cena. */
  private shared<T extends THREE.Material>(key: string, factory: () => T): T {
    const found = this.materialCache.get(key);
    if (found) return found as T;
    const mat = factory();
    this.materialCache.set(key, mat);
    return mat;
  }

  /** Loja em que o jogador esta no momento (a casca do predio nao bloqueia). */
  setActiveShop(id: string | null) {
    this.activeShopId = id;
    if (id) {
      this.ensureCommerceInterior(id);
      this.activeStaff = this.shopStaff.get(id) ?? [];
      const spec = this.shopSpecs.get(id);
      if (spec) {
        this.activeShopBounds = commerceBounds(spec);
        const height = this.shopHeights.get(spec.id) ?? 3.4;
        const room = commerceRoom(spec);
        this.shopLight.position.set(spec.x, height - 0.55, room.centerZ);
        this.shopLight.distance = Math.max(12, room.depth + 4);
        this.shopLight.intensity = 26;
      }
      return;
    }
    this.activeStaff = [];
    this.activeShopBounds = null;
    this.shopLight.intensity = 0;
  }

  /** O interior so e montado quando o jogador entra na loja. */
  private ensureCommerceInterior(id: string) {
    if (this.builtInteriors.has(id)) return;
    const spec = this.shopSpecs.get(id);
    if (!spec) return;
    this.builtInteriors.add(id);
    this.buildCommerceInterior(spec, this.shopHeights.get(id) ?? 3.4);
  }

  blocked(x: number, z: number, radius = 0.4, skipShopShell = false) {
    if (x > OCEAN_EDGE - radius || x < -242 + radius || z < -242 + radius || z > 242 - radius) return true;
    const skip = skipShopShell && this.activeShopId !== null ? this.shopColliders.get(this.activeShopId) : undefined;
    const cx = Math.floor(x / COLLIDER_CELL);
    const cz = Math.floor(z / COLLIDER_CELL);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const bucket = this.colliderCells.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const i = bucket[k]!;
          if (skip !== undefined && i === skip) continue;
          const c = this.colliders[i]!;
          if ((c as any).disabled) continue;
          if (
            x + radius > c.minX &&
            x - radius < c.maxX &&
            z + radius > c.minZ &&
            z - radius < c.maxZ
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  resolve(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
    const out = from.clone();
    const inside = this.activeShopId !== null;
    if (!this.blocked(to.x, from.z, radius, inside)) out.x = to.x;
    if (!this.blocked(out.x, to.z, radius, inside)) out.z = to.z;
    if (inside) {
      const bounds = this.activeShopBounds;
      if (bounds) {
        out.x = Math.min(Math.max(out.x, bounds.minX + radius), bounds.maxX - radius);
        out.z = Math.min(Math.max(out.z, bounds.minZ + radius), bounds.maxZ - radius);
      }
    }
    return out;
  }

  findFreeSpot(x: number, z: number, radius = 2) {
    for (let ring = 0; ring < 10; ring++) {
      const steps = ring === 0 ? 1 : ring * 8;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * ring * 3.2;
        const pz = z + Math.sin(a) * ring * 3.2;
        if (!this.blocked(px, pz, radius)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

  private build() {
    this.buildBase();
    this.buildRoads();
    this.buildBlocks();
    this.buildGarage();
    this.buildFavela();
    this.buildLandmarks();
    this.buildBeach();
    this.buildStreetLife();
    this.buildCommerces();
    this.buildGhostCityGate();
    this.buildClouds();
    this.buildOcean();
    if (this.mergeCell >= 4000) {
      // Preset leve: junta tudo em poucas malhas (menos draw calls por frame).
      this.mergeStaticGroup(this.scene, 4000);
    } else {
      this.mergeStaticGroup(this.buildingGroup);
      this.mergeStaticGroup(this.propGroup);
      this.mergeStaticGroup(this.scene, this.mergeCell * 2);
    }
  }

  private mergeStaticGroup(group: THREE.Object3D, cellSize = this.mergeCell) {
    group.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    const collect = (obj: THREE.Object3D) => {
      if (obj.userData?.noMerge) return;
      const anyObj = obj as unknown as { isMesh?: boolean; isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
      if (anyObj.isMesh && !anyObj.isInstancedMesh && !anyObj.isSkinnedMesh) meshes.push(obj as THREE.Mesh);
      for (const child of obj.children) collect(child);
    };
    for (const child of group.children) collect(child);
    if (meshes.length < 2) return;
    const cell = cellSize;
    const buckets = new Map<
      string,
      { material: THREE.Material; parts: THREE.BufferGeometry[]; cast: boolean; cx: number; cz: number }
    >();
    const byKey = new Map<string, THREE.Material>();
    const canonical = (material: THREE.Material) => {
      if (material.transparent) return material;
      if (material instanceof THREE.MeshStandardMaterial) {
        if (material.emissive.getHex() !== 0) return material;
        const key = `${material.color.getHexString()}|${material.roughness}|${material.metalness}|${material.map?.uuid ?? ""}|${material.envMapIntensity ?? 1}`;
        const existing = byKey.get(key);
        if (existing) return existing;
        byKey.set(key, material);
        return material;
      }
      if (material instanceof THREE.MeshBasicMaterial) {
        const key = `basic|${material.color.getHexString()}|${material.map?.uuid ?? ""}|${material.side}|${material.depthWrite}|${material.blending}`;
        const existing = byKey.get(key);
        if (existing) return existing;
        byKey.set(key, material);
        return material;
      }
      return material;
    };
    const push = (material: THREE.Material, geo: THREE.BufferGeometry, cast: boolean) => {
      const target = canonical(material);
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      const cx = Math.floor(((box.min.x + box.max.x) * 0.5 + 256) / cell);
      const cz = Math.floor(((box.min.z + box.max.z) * 0.5 + 256) / cell);
      const key = `${target.uuid}|${cx}|${cz}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: target, parts: [], cast: false, cx, cz };
        buckets.set(key, bucket);
      }
      bucket.cast = bucket.cast || cast;
      bucket.parts.push(geo);
    };
    const slice = (geo: THREE.BufferGeometry, start: number, count: number) => {
      const out = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "uv"]) {
        const attr = geo.getAttribute(name);
        if (!attr) continue;
        const size = attr.itemSize;
        const array = (attr.array as Float32Array).slice(start * size, (start + count) * size);
        out.setAttribute(name, new THREE.BufferAttribute(array, size));
      }
      return out;
    };
    for (const mesh of meshes) {
      const source = mesh.geometry;
      const geo = source.index ? source.toNonIndexed() : source.clone();
      const position = geo.getAttribute("position");
      if (!position) continue;
      for (const name of Object.keys(geo.attributes)) {
        if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
      }
      if (!geo.getAttribute("normal")) geo.computeVertexNormals();
      if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
      geo.applyMatrix4(mesh.matrixWorld);
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      const thin = box.max.y - box.min.y < 0.06;
      const cast = mesh.castShadow && !thin;
      const meshMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (geo.groups.length) {
        for (const g of geo.groups) {
          const material = meshMats[g.materialIndex ?? 0] ?? meshMats[0]!;
          push(material, slice(geo, g.start, g.count), cast);
        }
        geo.dispose();
      } else {
        push(meshMats[0]!, geo, cast);
      }
    }
    for (const mesh of meshes) mesh.removeFromParent();
    for (const bucket of buckets.values()) {
    const parts = bucket.parts;
    const merged = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
    if (!merged) continue;
    const material = bucket.material;
    const emissive = material instanceof THREE.MeshStandardMaterial ? material.emissive.getHex() : 0;
    const final = new THREE.Mesh(merged, material);
    final.castShadow = false;
    final.receiveShadow = true;
    final.userData.merged = true;
    final.userData.cullCell = `${bucket.cx},${bucket.cz}`;
    final.userData.cullX = bucket.cx * cell + cell * 0.5 - 256;
    final.userData.cullZ = bucket.cz * cell + cell * 0.5 - 256;
    group.add(final);
    for (const p of parts) {
      if (p !== merged) p.dispose();
    }
  }
  }

  private buildBase() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1, envMapIntensity: 0.25 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const city = new THREE.Mesh(
      new THREE.PlaneGeometry(340, 360),
      new THREE.MeshStandardMaterial({ map: makeCityGroundTexture(), roughness: 0.9, envMapIntensity: 0.45 }),
    );
    city.rotation.x = -Math.PI / 2;
    city.position.set(0, -0.03, 0);
    city.receiveShadow = true;
    this.scene.add(city);

    const promenade = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 480),
      new THREE.MeshStandardMaterial({ map: makePromenadeTexture(), roughness: 0.88, envMapIntensity: 0.45 }),
    );
    promenade.rotation.x = -Math.PI / 2;
    promenade.position.set(178, 0.015, 0);
    promenade.receiveShadow = true;
    this.scene.add(promenade);

    const sandTex = makeSandTexture();
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 490),
      new THREE.MeshStandardMaterial({
        map: sandTex.map,
        bumpMap: sandTex.bump,
        bumpScale: 0.05,
        roughness: 1,
        envMapIntensity: 0.2,
      }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(209, 0.02, 0);
    sand.receiveShadow = true;
    this.scene.add(sand);

    const shore = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 490),
      new THREE.MeshBasicMaterial({ color: "#f2ead5", transparent: true, opacity: 0.7 }),
    );
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(229, 0.04, 0);
    this.scene.add(shore);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(76, 360),
      new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1, envMapIntensity: 0.25 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(-198, -0.02, 0);
    this.scene.add(grass);
  }

  private buildRoads() {
    const roadGeoV = new THREE.PlaneGeometry(10, 340);
    const roadGeoH = new THREE.PlaneGeometry(340, 10);
    for (const line of ROAD_LINES) {
      const v = new THREE.Mesh(roadGeoV, this.roadMaterialV);
      v.rotation.x = -Math.PI / 2;
      v.position.set(line, 0.022, 0);
      v.receiveShadow = true;
      this.scene.add(v);
      const h = new THREE.Mesh(roadGeoH, this.roadMaterialH);
      h.rotation.x = -Math.PI / 2;
      h.position.set(0, 0.023, line);
      h.receiveShadow = true;
      this.scene.add(h);
    }

    const edgeGeo = new THREE.BoxGeometry(0.13, 0.018, 328);
    const edgeMat = new THREE.MeshBasicMaterial({ color: "#cfc8b2" });
    const edges = new THREE.InstancedMesh(edgeGeo, edgeMat, ROAD_LINES.length * 4);
    const edgeDummy = new THREE.Object3D();
    let edgeIdx = 0;
    for (const line of ROAD_LINES) {
      for (const offset of [-4.25, 4.25]) {
        edgeDummy.position.set(line + offset, 0.047, 0);
        edgeDummy.rotation.set(0, 0, 0);
        edgeDummy.updateMatrix();
        edges.setMatrixAt(edgeIdx++, edgeDummy.matrix);
        edgeDummy.position.set(0, 0.047, line + offset);
        edgeDummy.rotation.set(0, Math.PI / 2, 0);
        edgeDummy.updateMatrix();
        edges.setMatrixAt(edgeIdx++, edgeDummy.matrix);
      }
    }
    edges.count = edgeIdx;
    this.scene.add(edges);

    const dashGeo = new THREE.BoxGeometry(0.18, 0.025, 2.8);
    const dashMat = new THREE.MeshBasicMaterial({ color: "#d9c98a" });
    const dashTs: number[] = [];
    for (let t = -150; t <= 150; t += 14) dashTs.push(t);
    const crossOffsets = [-3, -1, 1, 3];
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, ROAD_LINES.length * dashTs.length * 2);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (const line of ROAD_LINES) {
      for (const t of dashTs) {
        dummy.position.set(line, 0.045, t);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        dashes.setMatrixAt(idx++, dummy.matrix);
        dummy.position.set(t, 0.046, line);
        dummy.rotation.set(0, Math.PI / 2, 0);
        dummy.updateMatrix();
        dashes.setMatrixAt(idx++, dummy.matrix);
      }
    }
    dashes.count = idx;
    this.scene.add(dashes);

    const crossMat = new THREE.MeshBasicMaterial({ color: "#e8dfc4", transparent: true, opacity: 0.78 });
    const crossGeo = new THREE.BoxGeometry(0.42, 0.025, 2.1);
    const cross = new THREE.InstancedMesh(crossGeo, crossMat, ROAD_LINES.length * ROAD_LINES.length * crossOffsets.length * 2);
    idx = 0;
    for (const x of ROAD_LINES) {
      for (const z of ROAD_LINES) {
        for (const k of crossOffsets) {
          dummy.position.set(x + k * 0.8, 0.048, z - 6.5);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          cross.setMatrixAt(idx++, dummy.matrix);
          dummy.position.set(x + 6.5, 0.049, z + k * 0.8);
          dummy.rotation.set(0, Math.PI / 2, 0);
          dummy.updateMatrix();
          cross.setMatrixAt(idx++, dummy.matrix);
        }
      }
    }
    cross.count = idx;
    this.scene.add(cross);

    // Guias rebaixadas separando asfalto e calcada. Sem elas o modo leve
    // parecia um tapete cinza unico, com postes e arvores "na rua".
    const centers = this.blockCenters();
    const curbMat = new THREE.MeshStandardMaterial({ color: "#d9d3c4", roughness: 0.88, envMapIntensity: 0.35 });
    const curbGeo = new THREE.BoxGeometry(0.28, 0.16, 37.5);
    const curbs = new THREE.InstancedMesh(curbGeo, curbMat, ROAD_LINES.length * centers.length * 4);
    const curbDummy = new THREE.Object3D();
    let curbIdx = 0;
    for (const line of ROAD_LINES) {
      for (const c of centers) {
        for (const side of [-1, 1]) {
          curbDummy.position.set(line + side * 5.02, 0.1, c);
          curbDummy.rotation.set(0, 0, 0);
          curbDummy.updateMatrix();
          curbs.setMatrixAt(curbIdx++, curbDummy.matrix);
          curbDummy.position.set(c, 0.1, line + side * 5.02);
          curbDummy.rotation.set(0, Math.PI / 2, 0);
          curbDummy.updateMatrix();
          curbs.setMatrixAt(curbIdx++, curbDummy.matrix);
        }
      }
    }
    curbs.count = curbIdx;
    curbs.receiveShadow = true;
    this.scene.add(curbs);
  }

  private blockCenters() {
    const out: number[] = [];
    for (let i = 0; i < ROAD_LINES.length - 1; i++) {
      out.push((ROAD_LINES[i]! + ROAD_LINES[i + 1]!) / 2);
    }
    return out;
  }

  private buildBlocks() {
    const centers = this.blockCenters();
    centers.forEach((cx, i) => {
      centers.forEach((cz, j) => {
        if (i === 2 && j === 3) return;
        const isPark = (i === 1 && j === 1) || (i === 3 && j === 4) || (i === 5 && j === 3);
        const isPlaza = (i === 0 && j === 4) || (i === 4 && j === 0);
        const reserved = RESERVED_BLOCKS.has(`${i}:${j}`);
        this.addSidewalkBlock(cx, cz, isPark || isPlaza);
        if (isPark) {
          this.buildPark(cx, cz, 36, 36);
          return;
        }
        if (isPlaza) {
          this.buildPlaza(cx, cz);
          return;
        }
        if (reserved) {
          this.dressReservedBlock(cx, cz, i, j);
          return;
        }
        this.buildBlockBuildings(cx, cz, i, j);
      });
    });
  }

  private dressReservedBlock(cx: number, cz: number, i: number, j: number) {
    const rng = new Rng(i * 131 + j * 17 + 5501);
    const corners: Array<[number, number]> = [
      [-15.5, -15.5],
      [15.5, -15.5],
      [-15.5, 15.5],
      [15.5, 15.5],
    ];
    const used = new Set<string>();
    for (const [ox, oz] of corners) {
      const x = cx + ox;
      const z = cz + oz;
      if (this.isNearShopOrHouse(x, z, 3.2)) continue;
      const key = `${x.toFixed(1)}:${z.toFixed(1)}`;
      if (used.has(key)) continue;
      used.add(key);
      if (rng.chance(0.55)) this.addTree(x, z, rng.range(0.85, 1.2));
      else this.addPalm(x, z, rng.range(0.9, 1.1));
    }

    const busStop = this.rng.chance(0.45);
    const busX = cx + this.rng.range(-14, 14);
    const busZ = cz + (this.rng.chance(0.5) ? -16.6 : 16.6);
    if (busStop && !this.isNearShopOrHouse(busX, busZ, 3.6)) {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 3.1, 0.16),
        new THREE.MeshStandardMaterial({ color: "#3a4750", roughness: 0.5, metalness: 0.5 }),
      );
      pole.position.set(busX - 2.1, 1.55, busZ);
      pole.castShadow = true;
      this.buildingGroup.add(pole);
      const pole2 = new THREE.Mesh(pole.geometry, pole.material);
      pole2.position.set(busX + 2.1, 1.55, busZ);
      pole2.castShadow = true;
      this.buildingGroup.add(pole2);
      const shelter = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 0.16, 1.9),
        new THREE.MeshStandardMaterial({ color: "#9fb7c4", roughness: 0.5, metalness: 0.2 }),
      );
      shelter.position.set(busX, 2.85, busZ);
      shelter.castShadow = true;
      this.buildingGroup.add(shelter);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 2.1, 0.08),
        new THREE.MeshStandardMaterial({
          color: "#cfe6f2",
          roughness: 0.18,
          metalness: 0.1,
          transparent: true,
          opacity: 0.35,
        }),
      );
      glass.position.set(busX, 1.75, busZ - 0.9);
      this.buildingGroup.add(glass);
      this.addCollider(busX, busZ, 4.4, 1.9, 2.9);
    }

    const kioskX = cx + this.rng.range(-12, 12);
    const kioskZ = cz + this.rng.range(-12, 12);
    if (!this.isNearShopOrHouse(kioskX, kioskZ, 4.2)) {
      const kiosk = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 2.5, 2.4),
        new THREE.MeshStandardMaterial({ color: rng.pick(["#c96f3f", "#3f7d8c", "#7a6a4f"]), roughness: 0.8 }),
      );
      kiosk.position.set(kioskX, 1.25, kioskZ);
      kiosk.castShadow = true;
      kiosk.receiveShadow = true;
      this.buildingGroup.add(kiosk);
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.12, 1.5),
        new THREE.MeshStandardMaterial({ color: "#f4e3c1", roughness: 0.7 }),
      );
      awning.position.set(kioskX, 2.6, kioskZ - 1.3);
      awning.rotation.x = -0.16;
      awning.castShadow = true;
      this.buildingGroup.add(awning);
      this.addCollider(kioskX, kioskZ, 3.2, 2.4, 2.5);
    }
  }

  private isNearShopOrHouse(x: number, z: number, radius: number) {
    for (const house of HOUSES) {
      if (Math.abs(house.x - x) < house.w / 2 + radius && Math.abs(house.z - z) < house.d / 2 + radius) {
        return true;
      }
    }
    return false;
  }

  private addSidewalkBlock(cx: number, cz: number, park = false) {
    const mat = park
      ? new THREE.MeshStandardMaterial({ color: "#9a9e82", roughness: 1 })
      : this.sidewalkMaterial;
    const block = new THREE.Mesh(new THREE.BoxGeometry(37.5, 0.12, 37.5), mat);
    block.position.set(cx, 0.04, cz);
    block.receiveShadow = true;
    this.buildingGroup.add(block);
  }

  private buildBlockBuildings(cx: number, cz: number, i: number, j: number) {
    const cells = [
      [-8.5, -8.5],
      [8.5, -8.5],
      [-8.5, 8.5],
      [8.5, 8.5],
    ];
    const large = this.rng.chance(0.22);
    if (large) {
      const w = this.rng.range(19, 23);
      const d = this.rng.range(15, 19);
      this.addBuilding(cx, cz, w, d, this.rng.range(3.9, 4.5), i * 6 + j, "south");
      return;
    }
    for (const [ox, oz] of cells) {
      if (!this.rng.chance(0.92)) continue;
      const w = this.rng.range(12, 15.5);
      const d = this.rng.range(12, 15.5);
      const facing: Facing = oz! < 0 ? "south" : "north";
      this.addBuilding(cx + ox!, cz + oz!, w, d, this.rng.range(3.4, 4.5), i * 6 + j + Math.floor(this.rng.next() * 8), facing);
    }
  }

  private addBuilding(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    facadeIndex: number,
    facing: Facing | null = null,
  ) {
    const mat = this.facadeMaterials[facadeIndex % this.facadeMaterials.length]!;
    const height = Math.max(3.25, Math.min(4.5, h));
    const wide = w >= 18;
    const bayCount = wide ? 4 : 2;
    const storeList = wide ? this.storefrontMaterialsWide : this.storefrontMaterials;
    const matIndex = facadeIndex % storeList.length;
    const storeMat = facing ? storeList[matIndex]! : null;
    const frontSign = facing === "south" ? -1 : 1;
    const shopIds: string[] = [];

    const lowerMats = [mat, mat, this.roofMaterial, this.roofMaterial, mat, mat];
    if (storeMat && facing) lowerMats[facing === "north" ? 4 : 5] = storeMat;
    const lower = new THREE.Mesh(
      tiledBoxGeometry(w, height, d, 8, height, facing ? (facing === "north" ? 4 : 5) : -1),
      lowerMats,
    );
    lower.position.set(x, height / 2, z);
    lower.castShadow = true;
    lower.receiveShadow = true;
    this.buildingGroup.add(lower);

    if (storeMat && facing) {
      for (let bay = 0; bay < bayCount; bay++) {
        this.addShopAwning(x, z, w, d, height, facing, bay, bayCount);
        const id = this.registerCityShop(x, z, w, d, height, matIndex, facing, bay, bayCount, wide);
        if (id) shopIds.push(id);
      }
    } else if (this.rng.chance(0.55)) {
      const awn = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.56, 0.1, 1.5),
        this.awningMaterials[this.rng.int(0, this.awningMaterials.length - 1)]!,
      );
      awn.position.set(x + this.rng.range(-w * 0.12, w * 0.12), height - 0.32, z + frontSign * (d / 2 + 0.7));
      awn.rotation.x = frontSign * -0.14;
      awn.castShadow = true;
      this.buildingGroup.add(awn);
      this.addAwningBrackets(awn.position.x, height - 0.32, z + frontSign * (d / 2), frontSign, w * 0.56, 1.5);
    }

    const top = this.addUpperFloors(x, z, w, d, height, facadeIndex, facing ? facing : "south", wide);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.2, d + 0.35), this.trimMaterial);
    cap.position.set(x, top + 0.08, z);
    cap.castShadow = true;
    this.buildingGroup.add(cap);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 0.12, d - 0.5), this.roofMaterial);
    inner.position.set(x, top + 0.16, z);
    inner.receiveShadow = true;
    this.buildingGroup.add(inner);
    this.addRoofDetails(x, z, w, d, top, facadeIndex);

    this.addCollider(x, z, w, d, top);
    for (const id of shopIds) this.shopColliders.set(id, this.colliders.length - 1);
    this.mapData.buildings.push({
      x,
      z,
      w,
      d,
      h: top,
      color: "#aab4ac",
    });
  }

  private addUpperFloors(
    x: number,
    z: number,
    w: number,
    d: number,
    baseH: number,
    facadeIndex: number,
    facing: Facing,
    wide: boolean,
  ): number {
    const rng = new Rng(Math.floor(Math.abs(x) * 131 + Math.abs(z) * 71) + facadeIndex * 17 + 9001);
    const floors = wide ? rng.int(2, 4) : rng.int(1, 3);
    const floorH = 3.1;
    const mat = this.upperMaterials[(facadeIndex + Math.floor(rng.next() * 3)) % this.upperMaterials.length]!;
    const bw = w - 0.3;
    const bd = d - 0.3;
    const h = floors * floorH;
    const base = baseH + 0.11;

    const geo = new THREE.BoxGeometry(bw, h, bd);
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (const face of [0, 1, 4, 5]) {
      const dimU = face < 2 ? bd : bw;
      const ru = Math.max(1, Math.round(dimU / 6));
      const rv = floors / 2;
      for (let i = 0; i < 4; i++) {
        const idx = face * 4 + i;
        uv.setXY(idx, uv.getX(idx) * ru, uv.getY(idx) * rv);
      }
    }
    uv.needsUpdate = true;
    const block = new THREE.Mesh(geo, [mat, mat, this.roofMaterial, this.roofMaterial, mat, mat]);
    block.position.set(x, base + h / 2, z);
    block.castShadow = true;
    block.receiveShadow = true;
    this.buildingGroup.add(block);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.36, 0.22, d + 0.36), this.trimMaterial);
    slab.position.set(x, baseH, z);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.buildingGroup.add(slab);

    const top = base + h;
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), this.trimMaterial);
    cornice.position.set(x, top - 0.1, z);
    cornice.castShadow = true;
    this.buildingGroup.add(cornice);

    const pilasterMat = this.trimMaterial;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, h, 0.34), pilasterMat);
        p.position.set(x + sx * (bw / 2 - 0.02), base + h / 2, z + sz * (bd / 2 - 0.02));
        p.castShadow = true;
        this.buildingGroup.add(p);
      }
    }

    const frontSign = facing === "south" ? -1 : 1;
    const railMat = this.shared(
      "balconyRail",
      () => new THREE.MeshStandardMaterial({ color: "#2b3236", roughness: 0.5, metalness: 0.55 }),
    );
    const slabMat = this.shared(
      "balconySlab",
      () => new THREE.MeshStandardMaterial({ color: "#cfc6b2", roughness: 0.85 }),
    );
    if (this.quality === "low") return top;
    const ru = Math.max(1, Math.round(bw / 6));
    const cellW = bw / (ru * 2);
    const frontFace = z + frontSign * (bd / 2);
    const balW = Math.min(cellW * 0.82, 2.6);
    const balD = 1.05;
    const windowCount = ru * 2;
    for (let f = 0; f < floors; f++) {
      const fy = base + f * floorH;
      for (let k = 0; k < windowCount; k++) {
        if (!rng.chance(0.24) || (k + f) % 2 === 1) continue;
        const cx = x - bw / 2 + (k + 0.5) * cellW;
        const bz = frontFace + frontSign * (balD / 2);
        const sl = new THREE.Mesh(new THREE.BoxGeometry(balW, 0.14, balD), slabMat);
        sl.position.set(cx, fy + 0.08, bz);
        sl.castShadow = true;
        this.buildingGroup.add(sl);
        const outZ = frontFace + frontSign * (balD - 0.04);
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(balW, 0.07, 0.07), railMat);
        topBar.position.set(cx, fy + 1.12, outZ);
        this.buildingGroup.add(topBar);
        const midBar = new THREE.Mesh(new THREE.BoxGeometry(balW, 0.04, 0.04), railMat);
        midBar.position.set(cx, fy + 0.62, outZ);
        this.buildingGroup.add(midBar);
        for (const sx of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.04, 0.07), railMat);
          post.position.set(cx + sx * (balW / 2 - 0.04), fy + 0.6, outZ);
          this.buildingGroup.add(post);
          const sideBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, balD), railMat);
          sideBar.position.set(cx + sx * (balW / 2 - 0.04), fy + 1.12, bz);
          this.buildingGroup.add(sideBar);
        }
      }
    }
    return top;
  }

  private addRoofDetails(x: number, z: number, w: number, d: number, top: number, facadeIndex: number) {
    const rng = new Rng(Math.floor(Math.abs(x) * 97 + Math.abs(z) * 53) + facadeIndex * 31 + 4421);
    const roofY = top + 0.22;
    const parapetH = 0.55;
    const pw = w - 0.3;
    const pd = d - 0.3;
    const t = 0.18;
    const parapets: Array<[number, number, number, number]> = [
      [0, -pd / 2 + t / 2, pw, t],
      [0, pd / 2 - t / 2, pw, t],
      [-pw / 2 + t / 2, 0, t, pd - t * 2],
      [pw / 2 - t / 2, 0, t, pd - t * 2],
    ];
    for (const [ox, oz, sw, sd] of parapets) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sw, parapetH, sd), this.trimMaterial);
      m.position.set(x + ox, roofY + parapetH / 2, z + oz);
      m.castShadow = true;
      this.buildingGroup.add(m);
    }

    const spot = () => ({
      px: x + rng.range(-w * 0.28, w * 0.28),
      pz: z + rng.range(-d * 0.28, d * 0.28),
    });

    if (rng.chance(0.5)) {
      const { px, pz } = spot();
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.5, 1.3),
        this.shared("tankStand", () => new THREE.MeshStandardMaterial({ color: "#4a4f52", roughness: 0.7, metalness: 0.3 })),
      );
      stand.position.set(px, roofY + 0.25, pz);
      stand.castShadow = true;
      this.buildingGroup.add(stand);
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 1.3, 12),
        this.shared("tank", () => new THREE.MeshStandardMaterial({ color: "#d9d4c4", roughness: 0.55, metalness: 0.1 })),
      );
      tank.position.set(px, roofY + 1.15, pz);
      tank.castShadow = true;
      this.buildingGroup.add(tank);
      const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.88, 0.1, 12),
        this.shared("tankLid", () => new THREE.MeshStandardMaterial({ color: "#2f6f8f", roughness: 0.5 })),
      );
      lid.position.set(px, roofY + 1.85, pz);
      this.buildingGroup.add(lid);
    }

    if (rng.chance(0.55)) {
      const { px, pz } = spot();
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.1, 2.2), this.trimMaterial);
      box.position.set(px, roofY + 1.05, pz);
      box.castShadow = true;
      this.buildingGroup.add(box);
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.7, 0.06),
        this.shared("roofDoor", () => new THREE.MeshStandardMaterial({ color: "#3b4448", roughness: 0.6, metalness: 0.3 })),
      );
      door.position.set(px, roofY + 0.85, pz + 1.12);
      this.buildingGroup.add(door);
    }

    if (this.quality === "low") return;
    const units = rng.int(1, 3);
    for (let i = 0; i < units; i++) {
      const { px, pz } = spot();
      const unit = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.8, 0.9),
        this.shared("acUnit", () => new THREE.MeshStandardMaterial({ color: "#aeb5b6", roughness: 0.6, metalness: 0.35 })),
      );
      unit.position.set(px, roofY + 0.4, pz);
      unit.castShadow = true;
      this.buildingGroup.add(unit);
      const fan = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10),
        this.shared("acFan", () => new THREE.MeshStandardMaterial({ color: "#2a2f31", roughness: 0.5 })),
      );
      fan.position.set(px, roofY + 0.82, pz);
      this.buildingGroup.add(fan);
    }

    if (rng.chance(0.45)) {
      const { px, pz } = spot();
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 3.2, 6),
        this.shared("antenna", () => new THREE.MeshStandardMaterial({ color: "#9aa2a5", roughness: 0.4, metalness: 0.7 })),
      );
      mast.position.set(px, roofY + 1.6, pz);
      this.buildingGroup.add(mast);
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(1.1 - i * 0.25, 0.03, 0.03),
          this.shared("antenna", () => new THREE.MeshStandardMaterial({ color: "#9aa2a5", roughness: 0.4, metalness: 0.7 })),
        );
        bar.position.set(px, roofY + 2.2 + i * 0.35, pz);
        this.buildingGroup.add(bar);
      }
    }
  }


  private bayOffset(facing: Facing, bay: number, bayCount: number, w: number) {
    const bayW = w / bayCount;
    const uDir = facing === "north" ? 1 : -1;
    return uDir * (-w / 2 + (bay + 0.5) * bayW);
  }

  private addShopAwning(
    x: number,
    z: number,
    w: number,
    d: number,
    baseH: number,
    facing: Facing,
    bay: number,
    bayCount: number,
  ) {
    const s = facing === "north" ? -1 : 1;
    const frontZ = z - (s * d) / 2;
    const bayW = w / bayCount;
    const doorX = x + this.bayOffset(facing, bay, bayCount, w);
    const awn = new THREE.Mesh(
      new THREE.BoxGeometry(bayW * 0.88, 0.12, 1.6),
      this.awningMaterials[this.rng.int(0, this.awningMaterials.length - 1)]!,
    );
    const awnY = Math.max(2.3, baseH * 0.64);
    awn.position.set(doorX, awnY, frontZ - s * 0.72);
    awn.rotation.x = s * 0.14;
    awn.castShadow = true;
    this.buildingGroup.add(awn);
    this.addAwningBrackets(doorX, awnY, frontZ, -s, bayW * 0.88, 1.6);
  }

  private addAwningBrackets(cx: number, y: number, wallZ: number, outward: number, width: number, depth: number) {
    const mat = this.shared(
      "awningBracket",
      () => new THREE.MeshStandardMaterial({ color: "#2b3236", roughness: 0.5, metalness: 0.6 }),
    );
    const out = outward;
    for (const sx of [-1, 1]) {
      const px = cx + sx * (width / 2 - 0.12);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, depth), mat);
      arm.position.set(px, y - 0.1, wallZ + out * (depth / 2 - 0.1));
      this.buildingGroup.add(arm);
      if (this.quality === "low") continue;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), mat);
      strut.position.set(px, y + 0.3, wallZ + out * 0.04);
      this.buildingGroup.add(strut);
    }
  }

  /** Transforma uma fachada que ja existia na cidade numa loja funcional. */
  private registerCityShop(
    x: number,
    z: number,
    w: number,
    d: number,
    baseH: number,
    matIndex: number,
    facing: Facing,
    bay: number,
    bayCount: number,
    wide: boolean,
  ): string | null {
    const bays = storefrontBays(matIndex, bayCount);
    const name = bays[bay]!;
    const kind = shopKindFor(name);
    if (!kind) return null;

    const s = facing === "north" ? -1 : 1;
    const frontZ = z - (s * d) / 2;
    const doorOffset = this.bayOffset(facing, bay, bayCount, w);
    const doorX = x + doorOffset;
    const doorH = Math.min(COMMERCE_DOOR_HEIGHT, baseH - 0.6);

    const spec: CommerceSpec = {
      id: shopSlug(name, this.shops.length),
      name,
      short: name,
      kind,
      district: districtFor(x, z),
      facing,
      x,
      z,
      w,
      d,
      doorOffset,
      bayWidth: wide ? w / 4 : w / 2,
      color: "#2b3440",
      accent: SHOP_ACCENT[kind],
      desc: SHOP_BLURB[kind],
    };
    this.shops.push(spec);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(COMMERCE_DOOR_WIDTH + 0.26, doorH + 0.16, 0.16),
      this.shared(`frame:${spec.accent}`, () => new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.55, metalness: 0.12 })),
    );
    frame.position.set(doorX, (doorH + 0.16) / 2, frontZ - s * 0.05);
    frame.castShadow = true;
    this.buildingGroup.add(frame);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(COMMERCE_DOOR_WIDTH, doorH, 0.1),
      this.shared("shopdoor", () => new THREE.MeshStandardMaterial({ color: "#1b232a", roughness: 0.45, metalness: 0.2 })),
    );
    door.position.set(doorX, doorH / 2, frontZ - s * 0.02);
    this.buildingGroup.add(door);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(COMMERCE_DOOR_WIDTH, doorH * 0.8),
      this.shared(`glow:${spec.accent}`, () => new THREE.MeshBasicMaterial({ color: spec.accent, transparent: true, opacity: 0.18 })),
    );
    glow.position.set(doorX, doorH * 0.45, frontZ - s * 0.13);
    glow.rotation.y = s > 0 ? Math.PI : 0;
    this.buildingGroup.add(glow);

    const height = Math.max(2.3, Math.min(baseH - 0.45, 4.2));
    this.shopSpecs.set(spec.id, spec);
    this.shopHeights.set(spec.id, height);

    this.mapData.landmarks.push({
      x: doorX,
      z: frontZ - s * 1.6,
      label: name,
      color: spec.accent,
    });
    return spec.id;
  }

  showCommerceInterior(spec: CommerceSpec) {
    const group = this.shopInteriors.get(spec.id);
    if (group) group.visible = true;
  }

  hideCommerceInterior(spec: CommerceSpec) {
    const group = this.shopInteriors.get(spec.id);
    if (group) group.visible = false;
  }

  private buildCommerces() {
    for (const house of HOUSES) this.buildHouse(house);
  }

  private buildCommerceInterior(spec: CommerceSpec, height: number) {
    const room = commerceRoom(spec);
    const s = room.s;
    const group = new THREE.Group();
    group.visible = false;
    this.buildingGroup.add(group);
    this.shopInteriors.set(spec.id, group);

    const roomW = room.maxX - room.minX;
    const roomD = room.maxZ - room.minZ;
    const roomCX = (room.minX + room.maxX) / 2;
    const wallMat = new THREE.MeshStandardMaterial({
      color: "#efe4d0",
      roughness: 0.94,
      metalness: 0.02,
      map: this.interiorWallTexture,
    });
    const accentMat = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.45, metalness: 0.12 });
    const trimMat = new THREE.MeshStandardMaterial({ color: "#33404c", roughness: 0.6, metalness: 0.1 });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: "#6f6a61", roughness: 0.95 });
    const lightPanelMat = new THREE.MeshBasicMaterial({ color: "#fff4d8" });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), this.interiorFloorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(roomCX, 0.03, room.centerZ);
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(roomCX, height - 0.12, room.centerZ);
    group.add(ceiling);

    for (const panel of [
      { x: roomCX - roomW * 0.24, z: room.centerZ - roomD * 0.2 },
      { x: roomCX + roomW * 0.24, z: room.centerZ - roomD * 0.2 },
      { x: roomCX - roomW * 0.24, z: room.centerZ + roomD * 0.2 },
      { x: roomCX + roomW * 0.24, z: room.centerZ + roomD * 0.2 },
    ]) {
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(roomW * 0.26, 1.1), lightPanelMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(panel.x, height - 0.14, panel.z);
      group.add(lamp);
    }

    for (const wall of commerceWalls(spec)) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, height, wall.d), wallMat);
      mesh.position.set(wall.x, height / 2, wall.z);
      mesh.receiveShadow = true;
      group.add(mesh);
      this.addCollider(wall.x, wall.z, wall.w, wall.d, height);
    }

    // Faixa de rodape colorida para o salao nao ficar todo branco.
    const wainscotH = 1.05;
    const wainscot = (
      x: number,
      z: number,
      w: number,
      d: number,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wainscotH, d), accentMat);
      mesh.position.set(x, wainscotH / 2, z);
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    const doorCenter = spec.x + (spec.doorOffset ?? 0);
    const doorLeft = doorCenter - COMMERCE_DOOR_WIDTH / 2;
    const doorRight = doorCenter + COMMERCE_DOOR_WIDTH / 2;
    const frontInner = room.frontZ;
    const backInner = room.backZ;
    wainscot(roomCX, backInner - s * 0.04, roomW, 0.08);
    wainscot(room.minX + 0.04, room.centerZ, 0.08, roomD);
    wainscot(room.maxX - 0.04, room.centerZ, 0.08, roomD);
    wainscot((room.minX + doorLeft) / 2, frontInner + s * 0.04, doorLeft - room.minX, 0.08);
    wainscot((doorRight + room.maxX) / 2, frontInner + s * 0.04, room.maxX - doorRight, 0.08);

    const counter = commerceCounterBox(spec);
    const counterMesh = new THREE.Mesh(
      new THREE.BoxGeometry(counter.w, 1.02, counter.d),
      new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.78 }),
    );
    counterMesh.position.set(counter.x, 0.51, counter.z);
    counterMesh.castShadow = true;
    counterMesh.receiveShadow = true;
    group.add(counterMesh);
    this.addCollider(counter.x, counter.z, counter.w, counter.d, 1.02);

    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(counter.w + 0.16, 0.1, counter.d + 0.16), trimMat);
    counterTop.position.set(counter.x, 1.06, counter.z);
    counterTop.castShadow = true;
    group.add(counterTop);

    const register = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.34, 0.4),
      new THREE.MeshStandardMaterial({ color: "#2b3440", roughness: 0.5, metalness: 0.3 }),
    );
    register.position.set(counter.x + counter.w * 0.28, 1.28, counter.z);
    register.castShadow = true;
    group.add(register);

    const productColors = commerceShelfPlan(spec.kind);
    const rng = new Rng(Math.round(spec.x * 13 + spec.z * 7) + 991);
    const shelfZ = room.centerZ + s * roomD * 0.04;
    for (const side of [-1, 1]) {
      const shelfX = roomCX + side * (roomW / 2 - 0.32);
      for (let level = 0; level < 2; level++) {
        const shelfY = 0.85 + level * 0.78;
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, roomD * 0.46), trimMat);
        board.position.set(shelfX, shelfY, shelfZ);
        board.castShadow = true;
        board.receiveShadow = true;
        group.add(board);
        for (let slot = 0; slot < 4; slot++) {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.42, 0.34),
            new THREE.MeshStandardMaterial({
              color: productColors[(slot + level * 3 + (side > 0 ? 2 : 0)) % productColors.length]!,
              roughness: 0.72,
            }),
          );
          box.position.set(
            shelfX,
            shelfY + 0.25,
            shelfZ + s * (roomD * 0.23 - (slot * (roomD * 0.46)) / 3.4 + rng.range(-0.05, 0.05)),
          );
          box.castShadow = true;
          group.add(box);
        }
      }
    }

    // Gondolas no meio do salao: dao volume e quebram o visual de caixa vazia.
    const gondolaW = 0.74;
    const gondolaD = roomD * 0.34;
    // Empurradas para o fundo: a faixa de entrada (a 3 m da porta) fica livre
    // para o personagem e para a camera em terceira pessoa.
    const gondolaZ = room.centerZ + s * roomD * 0.16;
    for (const side of [-1, 1]) {
      const gx = roomCX + side * roomW * 0.24;
      const back = new THREE.Mesh(new THREE.BoxGeometry(gondolaW, 1.75, gondolaD), trimMat);
      back.position.set(gx, 0.875, gondolaZ);
      back.castShadow = true;
      back.receiveShadow = true;
      group.add(back);
      this.addCollider(gx, gondolaZ, gondolaW, gondolaD, 1.75);
      for (let level = 0; level < 3; level++) {
        const shelfY = 0.42 + level * 0.52;
        const board = new THREE.Mesh(new THREE.BoxGeometry(gondolaW + 0.22, 0.06, gondolaD), trimMat);
        board.position.set(gx, shelfY, gondolaZ);
        board.castShadow = true;
        group.add(board);
        for (let slot = 0; slot < 3; slot++) {
          const item = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.34, 0.4),
            new THREE.MeshStandardMaterial({
              color: productColors[(slot + level + (side > 0 ? 1 : 0)) % productColors.length]!,
              roughness: 0.7,
            }),
          );
          item.position.set(
            gx,
            shelfY + 0.2,
            gondolaZ + s * (gondolaD * 0.32 - (slot * gondolaD) / 3.2),
          );
          item.castShadow = true;
          group.add(item);
        }
      }
    }

    // Fila de atendimento e tapete de entrada.
    const railZ = counter.z + s * 0.95;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 0.95, 8),
        new THREE.MeshStandardMaterial({ color: "#8fa1a8", roughness: 0.35, metalness: 0.7 }),
      );
      post.position.set(counter.x + side * counter.w * 0.36, 0.47, railZ);
      post.castShadow = true;
      group.add(post);
    }
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(counter.w * 0.72, 0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: "#c9cdd2", roughness: 0.3, metalness: 0.8 }),
    );
    rail.position.set(counter.x, 0.88, railZ);
    group.add(rail);

    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.1),
      new THREE.MeshStandardMaterial({ color: "#2d3b45", roughness: 0.95 }),
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(doorCenter, 0.05, frontInner - s * 0.75);
    group.add(mat);

    const plant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.18, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: "#b4643c", roughness: 0.8 }),
    );
    plant.position.set(room.maxX - 0.7, 0.21, frontInner - s * 0.9);
    plant.castShadow = true;
    group.add(plant);
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#3f7d4a", roughness: 0.85 }),
    );
    leaves.position.set(room.maxX - 0.7, 0.62, frontInner - s * 0.9);
    leaves.castShadow = true;
    group.add(leaves);
    this.addCollider(plant.position.x, plant.position.z, 0.5, 0.5, 1);

    this.buildCommerceProps(spec, s, group);

    const staff = new CharacterModel(
      rng.pick(SKIN_TONES),
      spec.kind === "clothes" ? "#f25f8b" : spec.kind === "bank" ? "#315f7e" : "#17b890",
      "#2b3a4a",
      "#2a1c14",
      "",
    );
    const staffPoint = commerceStaffPoint(spec);
    staff.group.position.set(staffPoint.x, 0, staffPoint.z);
    staff.group.rotation.y = s > 0 ? Math.PI : 0;
    staff.setCastShadow(false);
    group.add(staff.group);
    this.shopStaff.set(spec.id, [staff]);

    this.shopHeights.set(spec.id, height);
  }

  private buildCommerceProps(spec: CommerceSpec, s: number, group: THREE.Group) {
    const room = commerceRoom(spec);
    const rng = new Rng(Math.round(spec.x * 31 + spec.z * 17) + 7717);
    const wood = new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: "#8fa1a8", roughness: 0.4, metalness: 0.6 });
    const back = commerceBack(spec);
    const roomCX = (room.minX + room.maxX) / 2;
    const roomW = room.maxX - room.minX;

    if (spec.kind === "pharmacy") {
      for (let i = 0; i < 3; i++) {
        const cart = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.45), metal);
        cart.position.set(roomCX - roomW * 0.26 + i * 0.8, 0.45, back - s * 0.9);
        cart.castShadow = true;
        group.add(cart);
      }
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.16, 0.06),
        new THREE.MeshBasicMaterial({ color: "#7ef0d0" }),
      );
      cross.position.set(roomCX, 2.1, back - s * 0.2);
      cross.rotation.y = s > 0 ? 0 : Math.PI;
      group.add(cross);
      return;
    }

    if (spec.kind === "hardware") {
      for (let i = 0; i < 4; i++) {
        const tire = new THREE.Mesh(
          new THREE.TorusGeometry(0.42, 0.17, 8, 16),
          new THREE.MeshStandardMaterial({ color: "#22252b", roughness: 0.95 }),
        );
        tire.position.set(roomCX - roomW * 0.26, 0.18 + i * 0.34, back - s * 0.9);
        tire.rotation.x = Math.PI / 2;
        tire.castShadow = true;
        group.add(tire);
      }
      const bench = new THREE.Mesh(new THREE.BoxGeometry(roomW * 0.4, 0.14, 0.7), wood);
      bench.position.set(roomCX, 0.95, back - s * 0.45);
      bench.castShadow = true;
      group.add(bench);
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), metal);
        leg.position.set(roomCX + side * roomW * 0.16, 0.45, back - s * 0.45);
        group.add(leg);
      }
      return;
    }

    if (spec.kind === "bank") {
      const vault = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 0.4, 20),
        new THREE.MeshStandardMaterial({ color: "#c9cdd2", roughness: 0.35, metalness: 0.8 }),
      );
      vault.position.set(roomCX, 2.2, back - s * 0.35);
      vault.rotation.x = Math.PI / 2;
      vault.castShadow = true;
      group.add(vault);
      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.05, 8, 18),
        new THREE.MeshStandardMaterial({ color: "#ffd166", roughness: 0.3, metalness: 0.7 }),
      );
      handle.position.set(roomCX, 2.2, back - s * 0.6);
      handle.castShadow = true;
      group.add(handle);
      for (const side of [-1, 1]) {
        const chair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), wood);
        chair.position.set(roomCX + side * roomW * 0.26, 0.25, room.centerZ + s * room.depth * 0.12);
        chair.castShadow = true;
        group.add(chair);
        this.addCollider(chair.position.x, chair.position.z, 0.6, 0.6, 0.6);
      }
      return;
    }

    if (spec.kind === "clothes") {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(roomW * 0.45, 0.1, 0.1), metal);
      rack.position.set(roomCX, 1.85, room.centerZ + s * room.depth * 0.16);
      group.add(rack);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.85, 0.09), metal);
        post.position.set(roomCX + side * roomW * 0.22, 0.92, room.centerZ + s * room.depth * 0.16);
        group.add(post);
      }
      for (let i = 0; i < 6; i++) {
        const hanger = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.75, 0.12),
          new THREE.MeshStandardMaterial({ color: CLOTHES[i % CLOTHES.length]!.color, roughness: 0.7 }),
        );
        hanger.position.set(
          roomCX - roomW * 0.18 + i * (roomW * 0.072),
          1.45,
          room.centerZ + s * room.depth * 0.16,
        );
        hanger.castShadow = true;
        group.add(hanger);
      }
      const mannequin = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.26, 0.9, 6, 12),
        new THREE.MeshStandardMaterial({ color: rng.pick(CLOTHES).color, roughness: 0.7 }),
      );
      mannequin.position.set(roomCX + roomW * 0.3, 0.75, room.centerZ + s * room.depth * 0.26);
      mannequin.castShadow = true;
      group.add(mannequin);
      this.addCollider(mannequin.position.x, mannequin.position.z, 0.6, 0.6, 1.6);
      return;
    }

    if (spec.kind === "food") {
      const fryer = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 0.75), metal);
      fryer.position.set(roomCX + roomW * 0.26, 0.42, back - s * 1.1);
      fryer.castShadow = true;
      group.add(fryer);
      this.addCollider(fryer.position.x, fryer.position.z, 1.1, 0.75, 0.9);
      const cooler = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 1.7, 0.7),
        new THREE.MeshStandardMaterial({ color: "#8fd3f4", roughness: 0.25, transparent: true, opacity: 0.75 }),
      );
      cooler.position.set(roomCX - roomW * 0.28, 0.85, back - s * 1.1);
      cooler.castShadow = true;
      group.add(cooler);
      const menu = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.95),
        new THREE.MeshBasicMaterial({ color: "#2b1d15" }),
      );
      menu.position.set(roomCX + roomW * 0.2, 2.35, back - s * 0.2);
      menu.rotation.y = s > 0 ? 0 : Math.PI;
      group.add(menu);
      return;
    }

    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.55), wood);
      crate.position.set(roomCX - roomW * 0.24 + i * 0.85, 0.25, back - s * 1.1);
      crate.castShadow = true;
      group.add(crate);
    }
  }

  private buildHouse(spec: HouseSpec) {
    const h = 3.6;
    const t = HOUSE_WALL;
    const s = spec.facing === "north" ? -1 : 1;
    const frontZ = spec.z - (s * spec.d) / 2;
    const facing = s > 0 ? Math.PI : 0;

    const wallMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.82 });
    const insideMat = new THREE.MeshStandardMaterial({ color: "#efe4d0", roughness: 0.92 });
    const trimMat = new THREE.MeshStandardMaterial({ color: "#8a5a3b", roughness: 0.62 });

    const addWall = (x: number, z: number, w: number, d: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      mesh.position.set(x, h / 2 + 0.12, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.buildingGroup.add(mesh);
      this.addCollider(x, z, w, d, h);
    };

    for (const wall of houseWalls(spec)) addWall(wall.x, wall.z, wall.w, wall.d);

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_DOOR_WIDTH, h - HOUSE_DOOR_HEIGHT, t),
      wallMat,
    );
    lintel.position.set(spec.x, HOUSE_DOOR_HEIGHT + (h - HOUSE_DOOR_HEIGHT) / 2 + 0.12, frontZ + (s * t) / 2);
    lintel.castShadow = true;
    this.buildingGroup.add(lintel);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, HOUSE_DOOR_HEIGHT + 0.12, t + 0.08),
        trimMat,
      );
      post.position.set(spec.x + side * (HOUSE_DOOR_WIDTH / 2 + 0.07), (HOUSE_DOOR_HEIGHT + 0.12) / 2, frontZ + (s * t) / 2);
      post.castShadow = true;
      this.buildingGroup.add(post);
    }

    const floor = new THREE.Mesh(new THREE.BoxGeometry(spec.w - t * 2, 0.04, spec.d - t * 2), insideMat);
    floor.position.set(spec.x, 0.02, spec.z);
    floor.receiveShadow = true;
    this.buildingGroup.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.14, spec.d), insideMat);
    ceiling.position.set(spec.x, h + 0.02, spec.z);
    this.buildingGroup.add(ceiling);

    if (spec.rooms >= 3) {
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w * 0.86, 1.9, spec.d * 0.86),
        new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.8 }),
      );
      upper.position.set(spec.x, h + 1.1, spec.z);
      upper.castShadow = true;
      upper.receiveShadow = true;
      this.buildingGroup.add(upper);
      this.addCollider(spec.x, spec.z, spec.w * 0.86, spec.d * 0.86, h + 2);
      for (const side of [-1, 1]) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(0.85, 0.8),
          new THREE.MeshBasicMaterial({ color: "#ffe6b0", transparent: true, opacity: 0.35 }),
        );
        win.position.set(spec.x + side * spec.w * 0.2, h + 1.25, spec.z - (s * spec.d * 0.43));
        win.rotation.y = facing;
        this.buildingGroup.add(win);
      }
    }

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(spec.w, spec.d) * 0.72, 2.2, 4),
      new THREE.MeshStandardMaterial({ color: "#7a3b2e", roughness: 0.85 }),
    );
    roof.position.set(spec.x, h + 2.3, spec.z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.buildingGroup.add(roof);

    const doorLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_DOOR_WIDTH * 0.9, HOUSE_DOOR_HEIGHT - 0.15, 0.1),
      new THREE.MeshStandardMaterial({ color: "#3b2416", roughness: 0.6 }),
    );
    const hingeX = spec.x - (HOUSE_DOOR_WIDTH / 2) * 0.9;
    doorLeaf.position.set(
      hingeX + Math.cos(1.15) * (HOUSE_DOOR_WIDTH * 0.45),
      (HOUSE_DOOR_HEIGHT - 0.15) / 2 + 0.1,
      frontZ + s * (0.35 + Math.sin(1.15) * (HOUSE_DOOR_WIDTH * 0.45)),
    );
    doorLeaf.rotation.y = s * 1.15;
    doorLeaf.castShadow = true;
    this.buildingGroup.add(doorLeaf);

    const doorLight = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.85),
      new THREE.MeshBasicMaterial({ color: "#ffd489", transparent: true, opacity: 0.2 }),
    );
    doorLight.position.set(spec.x, 1.16, frontZ - s * 0.1);
    doorLight.rotation.y = facing;
    this.buildingGroup.add(doorLight);

    const signTex = makeSignTexture(spec.name, "à venda · casa própria", "#1a1210", "#ffd489", "#ff6b35");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w * 0.82, spec.w * 0.28),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(spec.x, 3.0, frontZ - s * 0.08);
    sign.rotation.y = facing;
    this.buildingGroup.add(sign);

    for (const side of [-1, 1]) {
      const windowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.95),
        new THREE.MeshBasicMaterial({ color: "#ffe6b0", transparent: true, opacity: 0.22 }),
      );
      windowMesh.position.set(spec.x + side * spec.w * 0.32, 2.05, frontZ - s * 0.06);
      windowMesh.rotation.y = facing;
      this.buildingGroup.add(windowMesh);
    }

    this.buildHouseInterior(spec);

    this.mapData.landmarks.push({
      x: spec.x,
      z: frontZ - s * 1.6,
      label: spec.short,
      color: "#f25f8b",
    });
  }

  private buildHouseInterior(spec: HouseSpec) {
    const s = spec.facing === "north" ? -1 : 1;
    const back = houseBack(spec);
    const depth = houseDepth(spec);
    const bed = houseBed(spec);
    const wardrobe = houseWardrobe(spec);
    const sofa = houseSofa(spec);
    const table = houseTable(spec);
    const fridge = houseFridge(spec);

    const woodMat = new THREE.MeshStandardMaterial({ color: "#8a5a3b", roughness: 0.62 });
    const fabricMat = new THREE.MeshStandardMaterial({ color: "#3f5d78", roughness: 0.95 });
    const blanketMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.95 });

    const addProp = (x: number, z: number, w: number, d: number, height: number, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
      mesh.position.set(x, height / 2 + 0.04, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.buildingGroup.add(mesh);
      this.addCollider(x, z, w, d, height);
      return mesh;
    };

    const bedBase = addProp(bed.x, bed.z, HOUSE_BED_SIZE.w, HOUSE_BED_SIZE.d, 0.42, woodMat);
    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_BED_SIZE.w - 0.12, 0.22, HOUSE_BED_SIZE.d - 0.12),
      new THREE.MeshStandardMaterial({ color: "#f3ede0", roughness: 0.95 }),
    );
    mattress.position.set(bed.x, 0.55, bed.z);
    mattress.castShadow = true;
    this.buildingGroup.add(mattress);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_BED_SIZE.w - 0.1, 0.12, 1.25), blanketMat);
    blanket.position.set(bed.x, 0.68, bed.z - s * 0.32);
    this.buildingGroup.add(blanket);
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 }),
    );
    pillow.position.set(bed.x, 0.72, bed.z + s * 0.72);
    this.buildingGroup.add(pillow);
    const headboard = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_BED_SIZE.w + 0.05, 0.85, 0.12),
      woodMat,
    );
    headboard.position.set(bed.x, 0.65, bed.z + s * (HOUSE_BED_SIZE.d / 2 - 0.02));
    headboard.castShadow = true;
    this.buildingGroup.add(headboard);
    void bedBase;

    addProp(wardrobe.x, wardrobe.z, HOUSE_WARDROBE_SIZE.w, HOUSE_WARDROBE_SIZE.d, 2.05, woodMat);

    if (spec.rooms >= 2) {
      addProp(sofa.x, sofa.z, HOUSE_SOFA_SIZE.w, HOUSE_SOFA_SIZE.d, 0.45, fabricMat);
      const backRest = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_SOFA_SIZE.w, 0.55, 0.18), fabricMat);
      backRest.position.set(sofa.x, 0.72, sofa.z - s * 0.33);
      backRest.castShadow = true;
      this.buildingGroup.add(backRest);
    }

    if (spec.rooms >= 2) {
      addProp(
        fridge.x,
        fridge.z,
        HOUSE_FRIDGE_SIZE.w,
        HOUSE_FRIDGE_SIZE.d,
        1.75,
        new THREE.MeshStandardMaterial({ color: "#d7dde2", roughness: 0.35, metalness: 0.35 }),
      );
    }

    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.5),
      new THREE.MeshStandardMaterial({ color: "#b8543f", roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(table.x, 0.045, table.z);
    this.buildingGroup.add(rug);

    const tv = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.75, 0.08),
      new THREE.MeshStandardMaterial({ color: "#14181d", roughness: 0.4, metalness: 0.2 }),
    );
    tv.position.set(spec.x + 1.75, 1.62, houseFront(spec) + s * (HOUSE_WALL + 0.06));
    tv.rotation.y = s > 0 ? Math.PI : 0;
    this.buildingGroup.add(tv);

    const plant = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: "#3f7d4f", roughness: 0.9 }),
    );
    plant.position.set(spec.x - HOUSE_DOOR_WIDTH / 2 - 0.75, 0.47, houseFront(spec) - s * 0.55);
    plant.castShadow = true;
    this.buildingGroup.add(plant);
    this.addCollider(plant.position.x, plant.position.z, 0.6, 0.6, 0.9);

    const lamp = new THREE.PointLight(0xffdca8, 14, 12, 2);
    lamp.position.set(spec.x, 2.9, back - s * (depth * 0.45));
    lamp.visible = this.quality !== "low";
    this.houseLamps.set(spec.id, lamp);
    this.buildingGroup.add(lamp);

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.7),
      new THREE.MeshBasicMaterial({ color: "#fff0cf" }),
    );
    panel.rotation.x = Math.PI / 2;
    panel.position.set(spec.x, 3.6, back - s * (depth * 0.45));
    this.buildingGroup.add(panel);
  }

  private buildGarage() {
    const x = -34;
    const z = 22;
    const w = 15;
    const h = 5.4;
    const d = 11;

    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(37.5, 37.5),
      new THREE.MeshStandardMaterial({ color: "#444a43", roughness: 0.94 }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(-24, 0.06, 24);
    plaza.receiveShadow = true;
    this.buildingGroup.add(plaza);
    this.addPalm(-42, 42, 1.1);
    this.addPalm(-7, 41, 1.05);
    const baseMat = new THREE.MeshStandardMaterial({ color: "#27443e", roughness: 0.7, metalness: 0.15 });
    const garage = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), baseMat);
    garage.position.set(x, h / 2 + 0.12, z);
    garage.castShadow = true;
    garage.receiveShadow = true;
    this.buildingGroup.add(garage);
    this.addCollider(x, z, w, d, h);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 3, 0.4, d + 2.5),
      new THREE.MeshStandardMaterial({ color: "#ff6b35", roughness: 0.55 }),
    );
    roof.position.set(x, h + 0.35, z);
    this.buildingGroup.add(roof);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.15, 0.7, d + 0.15),
      new THREE.MeshStandardMaterial({ color: "#f6c945", emissive: "#f6c945", emissiveIntensity: 0.12 }),
    );
    stripe.position.set(x, 3.1, z);
    this.buildingGroup.add(stripe);
    const signTex = makeSignTexture("GARAGEM", "tune seu rolê", "#10221f", "#f6c945", "#17b890");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 3.7),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(x, 4.1, z + d / 2 + 0.08);
    this.buildingGroup.add(sign);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 15),
      new THREE.MeshStandardMaterial({ color: "#3a4642", roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-18, 0.11, 34);
    this.buildingGroup.add(floor);
    for (let k = -1; k <= 1; k++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.03, 7),
        new THREE.MeshBasicMaterial({ color: "#f6c945" }),
      );
      line.position.set(-20 + k * 5.4, 0.14, 34);
      this.buildingGroup.add(line);
    }

    this.mapData.landmarks.push({ x: GARAGE.x, z: GARAGE.z, label: "Garagem", color: "#f6c945" });
  }

  private buildPark(cx: number, cz: number, w: number, d: number) {
    const isLoveGarden = cx === 24 && cz === 72;
    const blocksPlaque = (x: number, z: number) =>
      isLoveGarden && z > cz - 2 && z < cz + 20 && Math.abs(x - cx) < 20;
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 2, d - 2),
      new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1, envMapIntensity: 0.25 }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(cx, 0.12, cz);
    lawn.receiveShadow = true;
    this.buildingGroup.add(lawn);
    for (let i = 0; i < 6; i++) {
      const x = cx + this.rng.range(-14, 14);
      const z = cz + this.rng.range(-14, 14);
      const spot = this.roadSafe(x, z);
      if (blocksPlaque(spot.x, spot.z)) continue;
      this.addPalm(spot.x, spot.z, this.rng.range(0.8, 1.15));
    }
    for (let i = 0; i < 5; i++) {
      const x = cx + this.rng.range(-14, 14);
      const z = cz + this.rng.range(-14, 14);
      const spot = this.roadSafe(x, z);
      if (blocksPlaque(spot.x, spot.z)) continue;
      this.addTree(spot.x, spot.z, this.rng.range(0.75, 1.15));
    }
    // Duas palmeiras atras do monumento emolduram o coracao sem tapar a placa.
    if (isLoveGarden) {
      this.addPalm(cx - 13, cz - 13, 1.05);
      this.addPalm(cx + 13, cz - 13, 1.1);
    }
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(4, d - 4),
      new THREE.MeshStandardMaterial({ map: this.sidewalkMaterial.map, roughness: 0.9 }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(cx, 0.135, cz);
    this.buildingGroup.add(path);
    const benchMat = new THREE.MeshStandardMaterial({ color: "#694b34", roughness: 0.8 });
    for (let k = -1; k <= 1; k++) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.55), benchMat);
      bench.position.set(cx + 4, 0.6, cz + k * 5);
      bench.castShadow = true;
      this.buildingGroup.add(bench);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.12), benchMat);
      legs.position.set(cx + 4, 0.35, cz + k * 5);
      this.buildingGroup.add(legs);
    }
    if (isLoveGarden) this.buildValentineGarden(cx, cz);
    this.mapData.landmarks.push({
      x: cx,
      z: cz,
      label: isLoveGarden ? "Jardim do Amor" : "Praça",
      color: isLoveGarden ? "#f27d9b" : "#6fb37d",
    });
  }

  private buildValentineGarden(cx: number, cz: number) {
    const stone = new THREE.MeshStandardMaterial({
      color: "#e8cbd2",
      roughness: 0.56,
      metalness: 0.12,
      envMapIntensity: 1.1,
    });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.9, 0.55, 40), stone);
    plinth.position.set(cx, 0.4, cz);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    this.buildingGroup.add(plinth);

    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, -0.9);
    heartShape.bezierCurveTo(-0.28, -0.58, -1.18, 0.16, -1.12, 0.86);
    heartShape.bezierCurveTo(-1.04, 1.68, -0.16, 1.68, 0, 1.02);
    heartShape.bezierCurveTo(0.16, 1.68, 1.04, 1.68, 1.12, 0.86);
    heartShape.bezierCurveTo(1.18, 0.16, 0.28, -0.58, 0, -0.9);
    const heartGeometry = new THREE.ExtrudeGeometry(heartShape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.1,
      bevelThickness: 0.12,
      curveSegments: 20,
    });
    heartGeometry.computeVertexNormals();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.45, 0.11, 12, 72),
      new THREE.MeshStandardMaterial({
        color: "#ffd7e1",
        emissive: "#ed6d98",
        emissiveIntensity: 0.85,
        roughness: 0.28,
        metalness: 0.55,
      }),
    );
    ring.position.set(cx, 4.55, cz - 0.42);
    ring.castShadow = true;
    this.buildingGroup.add(ring);

    const heartFrame = new THREE.Mesh(
      heartGeometry,
      new THREE.MeshStandardMaterial({
        color: "#ffe3d8",
        emissive: "#f3a6b7",
        emissiveIntensity: 0.35,
        roughness: 0.36,
        metalness: 0.45,
      }),
    );
    heartFrame.position.set(cx, 4.45, cz - 0.28);
    heartFrame.scale.set(2.62, 2.55, 1);
    heartFrame.castShadow = true;
    this.buildingGroup.add(heartFrame);

    const heart = new THREE.Mesh(
      heartGeometry,
      new THREE.MeshStandardMaterial({
        color: "#e94f7d",
        emissive: "#d52b67",
        emissiveIntensity: 0.58,
        roughness: 0.27,
        metalness: 0.22,
      }),
    );
    heart.position.set(cx, 4.45, cz + 0.04);
    heart.scale.set(2.38, 2.31, 0.9);
    heart.castShadow = true;
    this.buildingGroup.add(heart);

    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(7.6, 1.65),
      new THREE.MeshBasicMaterial({
        map: makeSignTexture("GHOSTCITY", "a cidade do amor · redrp", "#371926", "#fff0f3", "#f27d9b"),
        side: THREE.DoubleSide,
      }),
    );
    plaque.position.set(cx, 1.55, cz + 3.78);
    this.buildingGroup.add(plaque);

    const glow = new THREE.PointLight("#ff789f", 13, 22, 2);
    glow.position.set(cx, 4.6, cz + 1.6);
    glow.visible = this.quality !== "low";
    this.glowLights.push(glow);
    this.buildingGroup.add(glow);

    const planterMaterial = new THREE.MeshStandardMaterial({ color: "#422a38", roughness: 0.8 });
    const soilMaterial = new THREE.MeshStandardMaterial({ color: "#473127", roughness: 1 });
    const stemMaterial = new THREE.MeshStandardMaterial({ color: "#52774f", roughness: 0.9 });
    const petalMaterials = ["#f15c87", "#ff9eb8", "#f9d3dd"].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.46, emissive: color, emissiveIntensity: 0.08 }),
    );
    const stemGeometry = new THREE.CylinderGeometry(0.035, 0.045, 0.58, 6);
    const flowerGeometry = new THREE.SphereGeometry(0.19, 12, 10);
    const flowerPositions: Array<[number, number, number]> = [];
    for (const side of [-1, 1]) {
      const planter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.58, 1.45), planterMaterial);
      planter.position.set(cx + side * 8.8, 0.56, cz + 6.4);
      planter.castShadow = true;
      this.buildingGroup.add(planter);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(4.34, 0.12, 1.2), soilMaterial);
      soil.position.set(cx + side * 8.8, 0.91, cz + 6.4);
      this.buildingGroup.add(soil);
      for (let i = 0; i < 7; i++) {
        flowerPositions.push([cx + side * 8.8 + (i - 3) * 0.54, 1.2, cz + 6.4 + (i % 2 ? 0.22 : -0.22)]);
      }
    }
    const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, flowerPositions.length);
    const flowers = petalMaterials.map((material) => new THREE.InstancedMesh(flowerGeometry, material, flowerPositions.length));
    const flowerDummy = new THREE.Object3D();
    flowerPositions.forEach(([x, y, z], index) => {
      flowerDummy.position.set(x, y - 0.29, z);
      flowerDummy.updateMatrix();
      stems.setMatrixAt(index, flowerDummy.matrix);
      flowerDummy.position.set(x, y, z);
      flowerDummy.scale.set(1, 0.82, 1);
      flowerDummy.updateMatrix();
      flowers[index % flowers.length]!.setMatrixAt(index, flowerDummy.matrix);
      flowerDummy.scale.set(1, 1, 1);
    });
    this.buildingGroup.add(stems, ...flowers);
    this.addCollider(cx, cz, 6.2, 4.4, 7);
  }

  private buildPlaza(cx: number, cz: number) {
    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7.5, 0.8, 16),
      new THREE.MeshStandardMaterial({ color: "#c9b28a", roughness: 0.9 }),
    );
    stage.position.set(cx, 0.4, cz);
    this.buildingGroup.add(stage);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.3, 7),
      new THREE.MeshStandardMaterial({ color: "#ff6b35" }),
    );
    roof.position.set(cx, 5.8, cz);
    this.buildingGroup.add(roof);
    const postMat = new THREE.MeshStandardMaterial({ color: "#444f4b" });
    for (const ox of [-4, 4]) {
      for (const oz of [-2.5, 2.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.2, 5), postMat);
        post.position.set(cx + ox, 2.7, cz + oz);
        this.buildingGroup.add(post);
      }
    }
    for (let i = 0; i < 6; i++) this.addPalm(cx + this.rng.range(-14, 14), cz + this.rng.range(-14, 14), 0.8);
    this.mapData.landmarks.push({ x: cx, z: cz, label: "Palco", color: "#ff9f55" });
  }

  private buildFavela() {
    const hills = [
      { x: -255, z: -115, r: 110, h: 58, color: "#486b47" },
      { x: -285, z: 95, r: 130, h: 74, color: "#3d6243" },
      { x: -230, z: 270, r: 75, h: 40, color: "#456b49" },
    ];
    let hillSeed = 3;
    for (const hill of hills) {
      const mesh = new THREE.Mesh(
        hillGeometry(hill.r, hill.h, hillSeed++),
        new THREE.MeshStandardMaterial({ color: hill.color, roughness: 1, envMapIntensity: 0.3 }),
      );
      mesh.position.set(hill.x, hill.h / 2 - 4, hill.z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    const wallMat = new THREE.MeshStandardMaterial({ map: makeMuralTexture(), roughness: 0.95 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.5, 32), wallMat);
    // Fica depois do fim do asfalto (x=-170), sem atravessar a avenida.
    wall.position.set(-174, 2.3, 2);
    wall.rotation.y = Math.PI / 2;
    this.buildingGroup.add(wall);
    this.addCollider(-174, 2, 2, 34, 4.5);

    const signMat = new THREE.MeshBasicMaterial({
      map: makeSignTexture("ALTO DA ALEGRIA", "comunidade, cultura e réspeito", "#14262a", "#f6c945", "#ff6b35"),
      transparent: true,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.5), signMat);
    sign.position.set(-171, 5.6, 2);
    sign.rotation.y = -Math.PI / 2;
    this.buildingGroup.add(sign);

    const colors = ["#e76f51", "#f4a261", "#e9c46a", "#2a9d8f", "#5aa9e6", "#f28482", "#ffb703", "#8ecae6"];
    for (let i = 0; i < 72; i++) {
      const x = this.rng.range(-238, -165);
      const z = this.rng.range(-150, 165);
      const w = this.rng.range(3.2, 7.2);
      const d = this.rng.range(3.2, 6.5);
      const h = this.rng.range(2.8, 8.5);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.7, this.rng.range(0.3, 1.8), d + 0.7),
        new THREE.MeshStandardMaterial({ color: "#c4b194", roughness: 1 }),
      );
      base.position.set(x, 0.2, z);
      base.receiveShadow = true;
      this.buildingGroup.add(base);
      const house = new THREE.Mesh(
        tiledBoxGeometry(w, h, d, 4.4, 6.4),
        this.favelaMaterial(this.rng.pick(colors)),
      );
      house.position.set(x, h / 2 + 0.3, z);
      house.castShadow = true;
      house.receiveShadow = true;
      this.buildingGroup.add(house);
      this.addCollider(x, z, w, d, h);
      this.mapData.buildings.push({ x, z, w, d, h, color: "#c7684b" });
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.4),
        new THREE.MeshStandardMaterial({ color: this.rng.chance(0.4) ? "#343b3e" : "#b9b1a1" }),
      );
      roof.position.set(x, h + 0.38, z);
      this.buildingGroup.add(roof);
      if (this.rng.chance(0.55)) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.55, 1.1, 8),
          new THREE.MeshStandardMaterial({ color: "#2e5f72" }),
        );
        tank.position.set(x + this.rng.range(-w * 0.2, w * 0.2), h + 1.2, z + this.rng.range(-d * 0.2, d * 0.2));
        this.buildingGroup.add(tank);
      }
      if (this.rng.chance(0.35)) {
        const wire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 2.6, 4),
          new THREE.MeshBasicMaterial({ color: "#333" }),
        );
        wire.position.set(x, h + 2, z);
        this.buildingGroup.add(wire);
      }
    }
    this.mapData.landmarks.push({ x: -195, z: 20, label: "Alto da Alegria", color: "#ff8a5c" });
  }

  private favelaMaterial(color: string) {
    let material = this.favelaMaterials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        map: this.favelaTexture.map,
        bumpMap: this.favelaTexture.bump,
        bumpScale: 0.04,
        color,
        roughness: 0.92,
        envMapIntensity: 0.35,
      });
      this.favelaMaterials.set(color, material);
    }
    return material;
  }

  private buildLandmarks() {
    const hill = new THREE.Mesh(
      hillGeometry(112, 110, 7),
      new THREE.MeshStandardMaterial({ color: "#466b4d", roughness: 1, envMapIntensity: 0.25 }),
    );
    hill.position.set(-78, 45, -310);
    hill.receiveShadow = true;
    this.scene.add(hill);
    const statue = new THREE.Group();
    this.statueMaterial = new THREE.MeshStandardMaterial({
      color: "#e7e4d8",
      roughness: 0.75,
      emissive: "#fff3d0",
      emissiveIntensity: 0.04,
    });
    const mat = this.statueMaterial;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 4.6, 19, 8), mat);
    body.position.y = 9.5;
    statue.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.1, 10, 8), mat);
    head.position.y = 21;
    statue.add(head);
    const arms = new THREE.Mesh(new THREE.BoxGeometry(22, 1.55, 2.3), mat);
    arms.position.y = 17.3;
    statue.add(arms);
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3.2, 8.5), new THREE.MeshStandardMaterial({ color: "#cec8b6", roughness: 0.9 }));
    pedestal.position.y = 1.6;
    statue.add(pedestal);
    statue.position.set(-78, 101, -310);
    statue.rotation.y = 0.2;
    this.scene.add(statue);
    this.mapData.landmarks.push({ x: -78, z: -250, label: "Cristo do Mirante", color: "#f4f1e0" });

    const sugar = new THREE.Mesh(
      roundedRockGeometry(58, 96, 5),
      new THREE.MeshStandardMaterial({ color: "#727a69", roughness: 0.95, envMapIntensity: 0.3 }),
    );
    sugar.position.set(292, 36, -237);
    this.scene.add(sugar);
    const sugarTop = new THREE.Mesh(
      new THREE.SphereGeometry(29, 20, 14),
      new THREE.MeshStandardMaterial({ color: "#557b58", roughness: 1, envMapIntensity: 0.2 }),
    );
    sugarTop.position.set(292, 85, -237);
    sugarTop.scale.y = 0.55;
    this.scene.add(sugarTop);

    const cableMat = new THREE.LineBasicMaterial({ color: "#969b8d", transparent: true, opacity: 0.65 });
    const points = [
      new THREE.Vector3(236, 62, -206),
      new THREE.Vector3(292, 94, -237),
    ];
    const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), cableMat);
    this.scene.add(cable);

    const mountainMat = new THREE.MeshStandardMaterial({ color: "#3e6048", roughness: 1, envMapIntensity: 0.2 });
    const mountains = [
      { x: -180, z: -350, r: 120, h: 88 },
      { x: 180, z: -380, r: 160, h: 110 },
      { x: -360, z: -140, r: 150, h: 120 },
      { x: -430, z: 420, r: 110, h: 70 },
      { x: 430, z: 420, r: 95, h: 58 },
    ];
    let mountainSeed = 11;
    for (const m of mountains) {
      const mesh = new THREE.Mesh(hillGeometry(m.r, m.h, mountainSeed++), mountainMat);
      mesh.position.set(m.x, m.h / 2 - 5, m.z);
      this.scene.add(mesh);
    }

    const arcos = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#c6b48c", roughness: 0.94 });
    for (let i = 0; i < 7; i++) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2, 12, 4), stone);
      pillar.position.set(i * 7 - 21, 6, 0);
      arcos.add(pillar);
      if (i < 6) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.75, 6, 12, Math.PI), stone);
        arch.position.set(i * 7 - 17.5, 12, 0);
        arch.rotation.z = Math.PI;
        arcos.add(arch);
      }
    }
    arcos.position.set(26, 0, -105);
    this.scene.add(arcos);
    this.mapData.landmarks.push({ x: 26, z: -105, label: "Arcos", color: "#d9c7a0" });
  }

  private buildBeach() {
    const kioskPositions = [
      [190, -90],
      [192, 76],
      [193, 175],
      [191, -185],
    ];
    for (const [x, z] of kioskPositions) {
      const kiosk = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(8, 3.2, 6),
        new THREE.MeshStandardMaterial({ color: "#e9ddbf", roughness: 0.8 }),
      );
      base.position.y = 1.6;
      base.castShadow = true;
      kiosk.add(base);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(7.5, 2.2, 4),
        new THREE.MeshStandardMaterial({ color: "#f6c945", roughness: 0.7 }),
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 4.4;
      roof.scale.set(1, 1, 0.75);
      kiosk.add(roof);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 2.2),
        new THREE.MeshBasicMaterial({
          map: makeSignTexture("QUIOSQUE", "água de coco • açaí • petiscos", "#1a3028", "#f6c945", "#17b890"),
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      sign.position.set(0, 3.4, 3.06);
      kiosk.add(sign);
      kiosk.position.set(x!, 0, z!);
      kiosk.rotation.y = Math.PI;
      this.buildingGroup.add(kiosk);
      this.addCollider(x!, z!, 8, 6, 4);
    }

    const umbrellaColors = ["#e94f37", "#f6c945", "#2a9d8f", "#f4f1e8", "#5aa9e6"];
    for (let i = 0; i < 26; i++) {
      const x = this.rng.range(196, 224);
      const z = this.rng.range(-210, 210);
      const color = this.rng.pick(umbrellaColors);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 2.8, 5),
        new THREE.MeshStandardMaterial({ color: "#e7dfc9" }),
      );
      pole.position.set(x, 1.4, z);
      this.propGroup.add(pole);
      const umbrella = new THREE.Mesh(
        new THREE.ConeGeometry(1.9, 0.75, 10),
        new THREE.MeshStandardMaterial({ color, roughness: 0.65, side: THREE.DoubleSide }),
      );
      umbrella.position.set(x, 2.8, z);
      umbrella.castShadow = true;
      this.propGroup.add(umbrella);
      if (this.rng.chance(0.65)) {
        const towel = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 2.7),
          new THREE.MeshStandardMaterial({ color: this.rng.pick(umbrellaColors), roughness: 0.8 }),
        );
        towel.rotation.x = -Math.PI / 2;
        towel.rotation.z = this.rng.range(0, Math.PI);
        towel.position.set(x + 1.7, 0.04, z + 0.3);
        this.propGroup.add(towel);
      }
    }

    const netMat = new THREE.MeshBasicMaterial({ color: "#f2f0e6", transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2, 12, 4), netMat);
    net.position.set(205, 1.2, 35);
    this.propGroup.add(net);
    for (const z of [29, 41]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 3, 5),
        new THREE.MeshStandardMaterial({ color: "#d5d0bd" }),
      );
      post.position.set(205, 1.5, z);
      this.propGroup.add(post);
    }

    const lifeguard = new THREE.Mesh(
      new THREE.BoxGeometry(3.3, 2.3, 3.3),
      new THREE.MeshStandardMaterial({ color: "#f6c945" }),
    );
    lifeguard.position.set(207, 2.3, -40);
    this.propGroup.add(lifeguard);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 4), new THREE.MeshStandardMaterial({ color: "#e94f37" }));
    roof.position.set(207, 3.75, -40);
    this.propGroup.add(roof);

    this.mapData.landmarks.push({ x: 197, z: 76, label: "Quiosque da Reserva", color: "#ffd166" });
  }

  private buildStreetLife() {
    const lampMat = new THREE.MeshBasicMaterial({ color: "#ffe4a3" });
    this.lampMaterials.push(lampMat);
    const poleMat = new THREE.MeshStandardMaterial({ color: "#4c5654", roughness: 0.55, metalness: 0.45, envMapIntensity: 0.8 });
    const bulbGeo = new THREE.SphereGeometry(0.2, 10, 8);
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.13, 5.8, 8);
    const armGeo = new THREE.BoxGeometry(1.3, 0.12, 0.12);
    const glowTex = makeGlowTexture();
    this.lampGlowMaterial = new THREE.PointsMaterial({
      map: glowTex,
      size: 2.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: "#ffd08a",
    });
    this.lampPoolMaterial = new THREE.MeshBasicMaterial({
      map: makeLightPoolTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const poolGeo = new THREE.PlaneGeometry(11, 11);
    const glowPositions: number[] = [];
    const addGlow = (x: number, z: number, y: number) => {
      glowPositions.push(x, y, z);
      // No preset leve o halo do poste vira so o sprite: 70 planos aditivos
      // de 11x11m queimam a taxa de preenchimento do celular fraco.
      if (this.quality === "low") return;
      const pool = new THREE.Mesh(poolGeo, this.lampPoolMaterial!);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.065, z);
      this.propGroup.add(pool);
    };
    for (let i = 0; i < ROAD_LINES.length; i++) {
      const line = ROAD_LINES[i]!;
      for (let k = -2; k <= 2; k++) {
        const x = line;
        const z = k * 52 + 16;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x + 6.7, 2.9, z);
        pole.castShadow = true;
        this.propGroup.add(pole);
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(x + 6.1, 5.7, z);
        this.propGroup.add(arm);
        const bulb = new THREE.Mesh(bulbGeo, lampMat);
        bulb.position.set(x + 5.5, 5.55, z);
        this.propGroup.add(bulb);
        addGlow(x + 5.5, z, 5.55);
        this.addCollider(x + 6.7, z, 0.5, 0.5, 5.8);
      }
      for (let k = -2; k <= 2; k++) {
        const x = k * 52 + 16;
        const z = line;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 2.9, z + 6.7);
        pole.castShadow = true;
        this.propGroup.add(pole);
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.rotation.y = Math.PI / 2;
        arm.position.set(x, 5.7, z + 6.1);
        this.propGroup.add(arm);
        const bulb = new THREE.Mesh(bulbGeo, lampMat);
        bulb.position.set(x, 5.55, z + 5.5);
        this.propGroup.add(bulb);
        addGlow(x, z + 5.5, 5.55);
        this.addCollider(x, z + 6.7, 0.5, 0.5, 5.8);
      }
    }

    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(glowPositions), 3));
    const glowCloud = new THREE.Points(glowGeo, this.lampGlowMaterial!);
    glowCloud.renderOrder = 2;
    this.propGroup.add(glowCloud);

    this.addTrafficLight(5.8, 5.8, Math.PI);
    this.addTrafficLight(-5.8, -5.8, 0);
    this.addTrafficLight(5.8, 53.8, Math.PI);
    this.addTrafficLight(-53.8, -5.8, -Math.PI / 2);
    this.addTrafficLight(53.8, 53.8, Math.PI / 2);
    this.addTrafficLight(-5.8, 101.8, Math.PI);

    const binMat = new THREE.MeshStandardMaterial({ color: "#2f6b54", roughness: 0.65, metalness: 0.25 });
    const binLid = new THREE.MeshStandardMaterial({ color: "#243c33", roughness: 0.6, metalness: 0.35 });
    for (const [x, z] of [[176, 32], [176, -44], [176, 128], [-4, 22], [52, -4], [-100, -4]] as Array<[number, number]>) {
      const spot = this.sidewalkSpot(x, z);
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 1, 10), binMat);
      bin.position.set(spot.x, 0.56, spot.z);
      bin.castShadow = true;
      this.propGroup.add(bin);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.1, 10), binLid);
      lid.position.set(spot.x, 1.11, spot.z);
      this.propGroup.add(lid);
      this.addCollider(spot.x, spot.z, 0.75, 0.75, 1.1);
    }

    const hydrantMat = new THREE.MeshStandardMaterial({ color: "#b83a2f", roughness: 0.5, metalness: 0.3 });
    for (const [x, z] of [[6, 26], [-102, 6], [174, 74], [54, -98]] as Array<[number, number]>) {
      const spot = this.sidewalkSpot(x, z);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.9, 10), hydrantMat);
      h.position.set(spot.x, 0.56, spot.z);
      h.castShadow = true;
      this.propGroup.add(h);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), hydrantMat);
      cap.position.set(spot.x, 1.03, spot.z);
      this.propGroup.add(cap);
      const side = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 8), hydrantMat);
      side.rotation.z = Math.PI / 2;
      side.position.set(spot.x, 0.7, spot.z);
      this.propGroup.add(side);
      this.addCollider(spot.x, spot.z, 0.55, 0.55, 1);
    }

    const benchWood = new THREE.MeshStandardMaterial({ color: "#7a5a3b", roughness: 0.8 });
    const benchMetal = new THREE.MeshStandardMaterial({ color: "#36413e", roughness: 0.4, metalness: 0.7 });
    for (let z = -150; z <= 150; z += 60) {
      const bench = new THREE.Group();
      for (let s = 0; s < 3; s++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.09, 0.16), benchWood);
        slat.position.set(0, 0.55, -0.2 + s * 0.2);
        slat.castShadow = true;
        bench.add(slat);
      }
      for (const ox of [-1.05, 1.05]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.6), benchMetal);
        leg.position.set(ox, 0.28, 0);
        bench.add(leg);
      }
      bench.position.set(170, 0, z);
      this.propGroup.add(bench);
      this.addCollider(170, z, 2.7, 0.8, 0.7);
    }

    const stop = new THREE.Group();
    const stopRoof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.18, 2.4), new THREE.MeshStandardMaterial({ color: "#e7e1cf", roughness: 0.55, metalness: 0.2 }));
    stopRoof.position.y = 3.1;
    stopRoof.castShadow = true;
    stop.add(stopRoof);
    for (const ox of [-2.9, 2.9]) {
      for (const oz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.1, 8), benchMetal);
        post.position.set(ox, 1.55, oz);
        stop.add(post);
      }
    }
    const stopGlass = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.2), this.windowGlassMaterial);
    stopGlass.position.set(0, 1.7, -1.02);
    stop.add(stopGlass);
    const stopBench = new THREE.Mesh(new THREE.BoxGeometry(4, 0.14, 0.55), benchWood);
    stopBench.position.set(0, 0.62, -0.4);
    stop.add(stopBench);
    const stopSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.28),
      new THREE.MeshBasicMaterial({
        map: makeSignTexture("PONTO 01", "ônibus · orla", "#12302c", "#ffd166", "#17b890"),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    stopSign.position.set(0, 2.7, 1.23);
    stop.add(stopSign);
    stop.position.set(168, 0, 40);
    stop.rotation.y = -Math.PI / 2;
    this.propGroup.add(stop);
    this.addCollider(168, 40, 3, 6.5, 3.2);

    for (let i = 0; i < 13; i++) {
      const x = this.rng.range(-150, 155);
      const z = 152 + this.rng.range(0, 20);
      this.addPalm(x, z, this.rng.range(0.8, 1.15));
    }
    for (let i = 0; i < 11; i++) {
      const x = 166 + this.rng.range(0, 18);
      const z = this.rng.range(-220, 220);
      this.addPalm(x, z, this.rng.range(0.75, 1.1));
    }
    for (let i = 0; i < 8; i++) {
      const x = this.rng.range(-140, -150);
      const z = this.rng.range(-130, 130);
      this.addPalm(x, z, this.rng.range(0.8, 1.2));
    }

    const cartMat = new THREE.MeshStandardMaterial({ color: "#f4f1e4", roughness: 0.75 });
    const umbrellaMat = new THREE.MeshStandardMaterial({ color: "#e94f37", roughness: 0.7 });
    const carts = [
      [-116, 35],
      [118, 26],
      [19, -60],
      [-64, 82],
    ];
    for (const [x, z] of carts) {
      const spot = this.sidewalkSpot(x!, z!);
      const cart = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 1.7), cartMat);
      box.position.y = 1;
      cart.add(box);
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.4, 0.8, 8), umbrellaMat);
      top.position.y = 2.7;
      cart.add(top);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.9),
        new THREE.MeshBasicMaterial({
          map: makeSignTexture("AÇAÍ", "gelado", "#f4f1e4", "#173f35", "#ff6b35"),
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      sign.position.set(0, 1.35, 0.87);
      cart.add(sign);
      cart.position.set(spot.x, 0.05, spot.z);
      cart.rotation.y = this.rng.range(0, Math.PI * 2);
      this.propGroup.add(cart);
      this.addCollider(spot.x, spot.z, 3.1, 1.8, 2.8);
    }

    const acaiSign = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeBillboardTexture("A", "#17b890", "açaí"),
        transparent: true,
        depthWrite: false,
      }),
    );
    acaiSign.position.set(185, 7, 58);
    acaiSign.scale.set(5, 5, 1);
    this.propGroup.add(acaiSign);
  }

  private addTrafficLight(x: number, z: number, ry: number) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 10), trafficPoleMaterial);
    pole.position.y = 2.7;
    pole.castShadow = true;
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 3.1, 8), trafficPoleMaterial);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(1.55, 5.15, 0);
    group.add(arm);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.42, 0.46), trafficHousingMaterial);
    housing.position.set(3.05, 4.68, 0.1);
    group.add(housing);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.72, 0.08), trafficBackMaterial);
    back.position.set(3.05, 4.68, -0.18);
    group.add(back);
    const lights: Array<[THREE.MeshBasicMaterial, number]> = [
      [trafficDiscMaterial, 0.46],
      [trafficDiscAmberMaterial, 0],
      [trafficDiscGreenMaterial, -0.46],
    ];
    for (const [discMaterial, offset] of lights) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.145, 16), discMaterial);
      disc.position.set(3.05, 4.68 + offset, 0.34);
      group.add(disc);
    }
    group.position.set(x, 0, z);
    group.rotation.y = ry;
    this.propGroup.add(group);
    this.addCollider(x, z, 0.5, 0.5, 5.4);
  }

  private blockedByBuilding(x: number, z: number, margin: number) {
    for (const c of this.colliders) {
      if (c.height < 3 || c.maxX - c.minX < 3 || c.maxZ - c.minZ < 3) continue;
      if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return true;
    }
    return this.isNearShopOrHouse(x, z, margin);
  }

  private addTree(x: number, z: number, scale = 1) {
    const spot = this.roadSafe(x, z);
    x = spot.x;
    z = spot.z;
    if (this.blockedByBuilding(x, z, 1.8)) return new THREE.Group();
    const group = new THREE.Group();
    const leafMat = this.rng.pick(this.treeLeafMaterials);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 3.6, 8), this.treeTrunkMaterial);
    trunk.position.y = 1.8;
    trunk.castShadow = true;
    group.add(trunk);
    const clusters: Array<[number, number, number, number]> = [
      [0, 4.4, 0, 1.8],
      [-1.1, 4, 0.5, 1.35],
      [1.1, 4.1, -0.4, 1.4],
      [0.2, 5.4, 0.1, 1.25],
    ];
    for (const [ox, oy, oz, r] of clusters) {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), leafMat);
      crown.position.set(ox, oy, oz);
      crown.scale.y = 0.82;
      crown.castShadow = true;
      group.add(crown);
    }
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    group.rotation.y = this.rng.range(0, Math.PI * 2);
    this.propGroup.add(group);
    this.addCollider(x, z, 0.55 * scale, 0.55 * scale, 3.6 * scale);
    return group;
  }

  private addPalm(x: number, z: number, scale = 1) {
    const spot = this.roadSafe(x, z);
    x = spot.x;
    z = spot.z;
    if (this.blockedByBuilding(x, z, 1.8)) return new THREE.Group();
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 5.8, 12), this.palmTrunkMaterial);
    trunk.position.y = 2.9;
    trunk.rotation.z = this.rng.range(-0.045, 0.045);
    trunk.castShadow = true;
    group.add(trunk);
    const leaves = new THREE.Mesh(frondMeshGeometry(this.rng.int(1, 100000)), this.palmLeafMaterial);
    leaves.position.y = 5.75;
    leaves.castShadow = true;
    group.add(leaves);
    const coconuts = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), this.coconutMaterial);
    coconuts.position.set(0.38, 5.45, 0.2);
    coconuts.scale.set(1, 0.85, 1);
    group.add(coconuts);
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    group.rotation.y = this.rng.range(0, Math.PI * 2);
    this.propGroup.add(group);
    this.addCollider(x, z, 0.5 * scale, 0.5 * scale, 5.8 * scale);
    return group;
  }

  private buildGhostCityGate() {
    const z = 184;
    const darkMetal = new THREE.MeshStandardMaterial({ color: "#1a2c2a", roughness: 0.42, metalness: 0.62, envMapIntensity: 1 });
    const gold = new THREE.MeshStandardMaterial({
      color: "#d9ad55",
      roughness: 0.26,
      metalness: 0.92,
      emissive: "#5d4214",
      emissiveIntensity: 0.06,
      envMapIntensity: 1.4,
    });
    const stoneTexture = makeSidewalkTexture();
    const stoneMap = stoneTexture.map.clone();
    const stoneBump = stoneTexture.bump.clone();
    for (const tex of [stoneMap, stoneBump]) {
      tex.repeat.set(1.1, 2.2);
      tex.needsUpdate = true;
    }
    const stone = new THREE.MeshStandardMaterial({
      map: stoneMap,
      bumpMap: stoneBump,
      bumpScale: 0.045,
      color: "#d8ccb0",
      roughness: 0.82,
      envMapIntensity: 0.7,
    });

    const boulevard = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 54),
      new THREE.MeshStandardMaterial({ color: "#2d3436", roughness: 0.96, envMapIntensity: 0.3 }),
    );
    boulevard.rotation.x = -Math.PI / 2;
    boulevard.position.set(0, 0.024, 194);
    boulevard.receiveShadow = true;
    this.scene.add(boulevard);

    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), stone);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.035, z);
    plaza.receiveShadow = true;
    this.buildingGroup.add(plaza);

    const approachMap = this.asphalt.map.clone();
    const approachBump = this.asphalt.bump.clone();
    const approachRough = this.asphalt.roughness.clone();
    for (const tex of [approachMap, approachBump, approachRough]) {
      tex.repeat.set(3.6, 9);
      tex.needsUpdate = true;
    }
    const approachMaterial = new THREE.MeshStandardMaterial({
      map: approachMap,
      bumpMap: approachBump,
      bumpScale: 0.032,
      roughnessMap: approachRough,
      roughness: 1,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(18.8, 44), approachMaterial);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(0, 0.031, 216);
    approach.receiveShadow = true;
    this.scene.add(approach);

    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 44), this.sidewalkMaterial);
      walk.position.set(side * 11.3, 0.05, 216);
      walk.receiveShadow = true;
      this.scene.add(walk);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 44), this.trimMaterial);
      curb.position.set(side * 9.48, 0.045, 216);
      curb.receiveShadow = true;
      this.scene.add(curb);
      const edgeLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.012, 43.4),
        new THREE.MeshBasicMaterial({ color: "#d8d0b8" }),
      );
      edgeLine.position.set(side * 8.8, 0.04, 216);
      this.scene.add(edgeLine);
    }
    const dashMat = new THREE.MeshBasicMaterial({ color: "#d9c98a" });
    for (let i = 0; i < 7; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 2.8), dashMat);
      dash.position.set(0, 0.04, 198 + i * 5.8);
      this.scene.add(dash);
    }
    for (const sz of [203, 215, 227, 236]) {
      this.addPalm(-14.2, sz, 0.86);
      this.addPalm(14.2, sz, 0.86);
    }

    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.8, 14.4, 2.8), stone);
      pylon.position.set(side * 10.6, 7.2, z);
      pylon.castShadow = true;
      pylon.receiveShadow = true;
      this.buildingGroup.add(pylon);
      this.addCollider(side * 10.6, z, 2.8, 2.8, 14.4);

      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const trim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 13.2, 0.16), gold);
          trim.position.set(side * 10.6 + sx * 1.34, 6.9, z + sz * 1.34);
          trim.castShadow = true;
          this.buildingGroup.add(trim);
        }
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 3.5), darkMetal);
      base.position.set(side * 10.6, 0.45, z);
      base.castShadow = true;
      this.buildingGroup.add(base);
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 4), gold);
      finial.position.set(side * 10.6, 14.9, z);
      finial.rotation.y = Math.PI / 4;
      finial.castShadow = true;
      this.buildingGroup.add(finial);
    }

    const frame = new THREE.Mesh(new THREE.BoxGeometry(20.8, 6.4, 1.45), darkMetal);
    frame.position.set(0, 11.2, z);
    frame.castShadow = true;
    frame.receiveShadow = true;
    this.buildingGroup.add(frame);

    const trimGeoH = new THREE.BoxGeometry(20.2, 0.15, 0.18);
    for (const y of [8.08, 14.32]) {
      for (const zSide of [-1, 1]) {
        const trim = new THREE.Mesh(trimGeoH, gold);
        trim.position.set(0, y, z + zSide * 0.76);
        trim.castShadow = true;
        this.buildingGroup.add(trim);
      }
    }

    const signTexture = makeGhostCitySignTexture();
    const signMaterial = new THREE.MeshStandardMaterial({
      map: signTexture,
      emissiveMap: signTexture,
      emissive: "#ffd58f",
      emissiveIntensity: 0.05,
      roughness: 0.38,
      metalness: 0.18,
      envMapIntensity: 1.1,
    });
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(19.2, 6), signMaterial);
      sign.position.set(0, 11.18, z + side * 0.735);
      sign.rotation.y = side === 1 ? 0 : Math.PI;
      this.buildingGroup.add(sign);
    }
    this.entranceMaterials.push(signMaterial);

    const plaqueTexture = makeDedicationTexture();
    const plaqueMaterial = new THREE.MeshStandardMaterial({
      map: plaqueTexture,
      emissiveMap: plaqueTexture,
      emissive: "#ffd794",
      emissiveIntensity: 0.04,
      roughness: 0.55,
      metalness: 0.2,
      envMapIntensity: 0.8,
    });
    const monument = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.9, 0.9), stone);
    block.position.y = 1.45;
    block.castShadow = true;
    block.receiveShadow = true;
    monument.add(block);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.22, 1.1), stone);
    cap.position.y = 2.97;
    cap.castShadow = true;
    monument.add(cap);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.15, 2.08), plaqueMaterial);
    plaque.position.set(0, 1.5, 0.46);
    monument.add(plaque);
    monument.position.set(15.3, 0.12, z + 1.4);
    this.buildingGroup.add(monument);
    this.addCollider(15.3, z + 1.4, 4.8, 1.1, 3);
    this.entranceMaterials.push(plaqueMaterial);

    const planterMat = new THREE.MeshStandardMaterial({ color: "#2b3d33", roughness: 0.8 });
    const flowerMats = ["#c94f6d", "#e0b84a", "#e7e3d6"].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.72 }),
    );
    for (const side of [-1, 1]) {
      const planter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 2.2), planterMat);
      planter.position.set(side * 15.2, 0.3, z - 2.6);
      planter.castShadow = true;
      this.buildingGroup.add(planter);
      for (let i = 0; i < 3; i++) {
        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), flowerMats[i % flowerMats.length]!);
        bush.position.set(side * 15.2 + (i - 1) * 0.55, 0.78, z - 2.6 + this.rng.range(-0.5, 0.5));
        bush.scale.y = 0.75;
        this.buildingGroup.add(bush);
      }
      this.addPalm(side * 18.5, z + 4, 0.95);
    }

    for (let i = 0; i < 9; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 2.6), new THREE.MeshBasicMaterial({ color: "#d9c98a" }));
      dash.position.set(0, 0.05, 172 + i * 5.6);
      this.scene.add(dash);
    }

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: "#ffd28a",
      }),
    );
    glow.position.set(0, 11.2, z - 0.9);
    glow.scale.set(26, 11, 1);
    this.scene.add(glow);
    this.entranceGlow = glow;

    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight("#ffd7a1", 0, 80, Math.PI / 5.2, 0.65, 1.2);
      spot.position.set(side * 7.5, 0.8, z + 8.5);
      spot.target.position.set(0, 10.8, z);
      // No celular fraco cada luz extra custa em todo fragmento da cena.
      spot.visible = this.quality !== "low";
      this.scene.add(spot, spot.target);
      this.entranceLights.push(spot);
    }

    this.mapData.landmarks.push({ x: 0, z, label: "Entrada GhostCity", color: "#ffd166" });
  }

  private buildClouds() {
    const tex = makeCloudTexture();
    for (let i = 0; i < 18; i++) {
      const opacity = this.rng.range(0.2, 0.5);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          opacity,
          depthWrite: false,
          color: "#ffffff",
        }),
      );
      sprite.userData.baseOpacity = opacity;
      sprite.position.set(this.rng.range(-300, 300), this.rng.range(72, 128), this.rng.range(-280, 180));
      sprite.scale.set(this.rng.range(55, 120), this.rng.range(24, 52), 1);
      this.scene.add(sprite);
      this.clouds.push(sprite);
    }
  }

  private makeOceanMaterial() {
    const mat = this.oceanPhysical
      ? new THREE.MeshPhysicalMaterial({
          color: "#1a7187",
          roughness: 0.14,
          metalness: 0.1,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          bumpMap: this.waterNormal,
          bumpScale: 0.3,
          envMapIntensity: 1.35,
        })
      : new THREE.MeshStandardMaterial({
          color: "#1a7187",
          roughness: 0.17,
          metalness: 0.16,
          bumpMap: this.waterNormal,
          bumpScale: 0.26,
          envMapIntensity: 1.25,
        });
    applyWaves(mat, this.waveUniform);
    return mat;
  }

  private buildOcean() {
    const geo = new THREE.PlaneGeometry(430, 590, 72, 60);
    geo.rotateX(-Math.PI / 2);
    this.waterNormal = makeWaterNormalTexture();
    this.oceanMaterial = this.makeOceanMaterial();
    const ocean = new THREE.Mesh(geo, this.oceanMaterial);
    ocean.position.set(445, -0.9, 0);
    this.ocean = ocean;
    this.scene.add(ocean);

    const shallow = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 500),
      new THREE.MeshPhysicalMaterial({
        color: "#55bea8",
        roughness: 0.1,
        metalness: 0.05,
        clearcoat: 1,
        transparent: true,
        opacity: 0.55,
        envMapIntensity: 1.2,
      }),
    );
    shallow.rotation.x = -Math.PI / 2;
    shallow.position.set(232, -0.55, 0);
    this.scene.add(shallow);

    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 500),
      new THREE.MeshBasicMaterial({ color: "#f7f2e4", transparent: true, opacity: 0.8 }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(231, -0.52, 0);
    this.foam = foam;
    this.scene.add(foam);

    const island = new THREE.Mesh(
      hillGeometry(36, 30, 21),
      new THREE.MeshStandardMaterial({ color: "#517554", roughness: 1, envMapIntensity: 0.25 }),
    );
    island.position.set(350, 13, 140);
    this.scene.add(island);
  }

  /**
   * No modo leve a luz do interior da casa e emprestada da `shopLight` (que ja existe e fica sempre ligada),
   * entao o numero de luzes nunca muda e o shader nao recompila ao entrar/sair.
   */
  setActiveHouse(id: string | null) {
    if (this.quality !== "low") return;
    const lamp = id ? this.houseLamps.get(id) : undefined;
    if (lamp) {
      this.shopLight.position.copy(lamp.position);
      this.shopLight.distance = lamp.distance;
      this.shopLight.intensity = lamp.intensity;
    } else if (!this.activeShopId) {
      this.shopLight.intensity = 0;
    }
  }

  setQuality(quality: QualityName) {
    this.quality = quality;
    const lightsOn = quality !== "low";
    for (const lamp of this.houseLamps.values()) lamp.visible = lightsOn;
    for (const glow of this.glowLights) glow.visible = lightsOn;
    if (quality === "low") {
      if (this.ocean) this.ocean.visible = false;
      const buildingsGroup = (this as any).buildingGroup as THREE.Group | undefined;
      if (buildingsGroup) buildingsGroup.visible = true;
      return;
    }
    const physical = QUALITY[quality].oceanPhysical;
    if (physical === this.oceanPhysical || !this.ocean) return;
    this.oceanPhysical = physical;
    const previous = this.oceanMaterial;
    this.oceanMaterial = this.makeOceanMaterial();
    this.ocean.material = this.oceanMaterial;
    previous?.dispose();
    if (this.ocean) this.ocean.visible = true;
  }

  setNight(factor: number) {
    this.night = factor;
    for (const mat of this.emissiveMaterials) mat.emissiveIntensity = factor * 1.35;
    for (const mat of this.lampMaterials) mat.color.setRGB(1, 0.88 - factor * 0.1, 0.55 + factor * 0.25);
    if (this.statueMaterial) this.statueMaterial.emissiveIntensity = factor * 0.75;
    if (this.lampGlowMaterial) this.lampGlowMaterial.opacity = factor * 0.85;
    if (this.lampPoolMaterial) this.lampPoolMaterial.opacity = factor * 0.5;
    if (this.entranceGlow) (this.entranceGlow.material as THREE.SpriteMaterial).opacity = factor * 0.55;
    for (const mat of this.entranceMaterials) mat.emissiveIntensity = 0.05 + factor * 1.15;
    for (const light of this.entranceLights) light.intensity = factor * 120;
    for (const cloud of this.clouds) {
      (cloud.material as THREE.SpriteMaterial).color.setRGB(1 - factor * 0.72, 1 - factor * 0.68, 1 - factor * 0.6);
      (cloud.material as THREE.SpriteMaterial).opacity = (cloud.userData.baseOpacity as number) * (1 - factor * 0.35);
    }
  }

  update(dt: number, time: number) {
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i]!;
      cloud.position.x += dt * (0.35 + (i % 3) * 0.12);
      if (cloud.position.x > 320) cloud.position.x = -320;
    }
    for (const staff of this.activeStaff) {
      staff.update(dt, 0);
      staff.group.rotation.y = Math.PI + Math.sin(time * 0.6 + staff.group.position.x) * 0.22;
    }
    if (this.waterNormal) {
      this.waterNormal.offset.set(time * 0.014, time * 0.008);
    }
    this.waveUniform.value = time;
    if (this.foam) {
      this.foam.position.x = 231 + Math.sin(time * 0.8) * 1.3;
      this.foam.position.y = -0.52 + Math.sin(time * 1.2) * 0.03;
      (this.foam.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(time * 1.2) * 0.18;
    }
    if (this.entranceGlow) {
      const s = 26 + Math.sin(time * 0.7) * 0.5;
      this.entranceGlow.scale.set(s, 11 + Math.sin(time * 0.7) * 0.25, 1);
    }
  }

  getBounds() {
    return { minX: -240, maxX: OCEAN_EDGE, minZ: -238, maxZ: 238, cityLimit: CITY_LIMIT };
  }

  clampPosition(p: THREE.Vector3) {
    p.x = clamp(p.x, -238, OCEAN_EDGE - 1);
    p.z = clamp(p.z, -236, 236);
  }
}
