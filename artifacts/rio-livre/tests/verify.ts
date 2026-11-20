import * as THREE from "three";
import {
  COMMERCE_DOOR_WIDTH,
  COMMERCE_WALL,
  HOUSES,
  HOUSE_BED_SIZE,
  HOUSE_DOOR_WIDTH,
  HOUSE_FRIDGE_SIZE,
  HOUSE_SOFA_SIZE,
  HOUSE_WARDROBE_SIZE,
  PEDESTRIAN_HIT_SPEED,
  RESERVED_BLOCKS,
  ROAD_LINES,
  SHOP_ACCENT,
  SHOP_BLURB,
  STOREFRONT_SHOPS,
  blockCenters,
  commerceBounds,
  commerceCounterBox,
  commerceCounter,
  commerceDoor,
  commerceEnterPoint,
  commerceStaffPoint,
  commerceWalls,
  houseBed,
  houseBedUse,
  houseBounds,
  houseDoor,
  houseEnterPoint,
  houseFridge,
  houseSofa,
  houseTable,
  houseWardrobe,
  houseWardrobeUse,
  houseWalls,
  insideCommerce,
  shopKindFor,
  shopSlug,
  insideHouse,
  type CommerceSpec,
  type Facing,
  type HouseSpec,
  type ShopKind,
} from "../src/config";
import { storefrontBays } from "../src/textures";
import { PedestrianSystem, type VehicleHit } from "../src/pedestrians";

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const PLAYER_RADIUS = 0.48;
const CAR_RADIUS = 1.2;

const makeWorld = (extra: Rect[] = []) => {
  const colliders = extra;
  return {
    colliders,
    blocked(x: number, z: number, radius = 0.4) {
      if (x > 236 - radius || x < -242 + radius || z < -242 + radius || z > 242 - radius) return true;
      for (const c of colliders) {
        if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return true;
      }
      return false;
    },
  };
};

const wallRects = (spec: CommerceSpec): Rect[] =>
  commerceWalls(spec).map((w) => ({
    minX: w.x - w.w / 2,
    maxX: w.x + w.w / 2,
    minZ: w.z - w.d / 2,
    maxZ: w.z + w.d / 2,
  }));

const houseWallRects = (spec: HouseSpec): Rect[] =>
  houseWalls(spec).map((w) => ({
    minX: w.x - w.w / 2,
    maxX: w.x + w.w / 2,
    minZ: w.z - w.d / 2,
    maxZ: w.z + w.d / 2,
  }));

const boxRect = (x: number, z: number, w: number, d: number): Rect => ({
  minX: x - w / 2,
  maxX: x + w / 2,
  minZ: z - d / 2,
  maxZ: z + d / 2,
});

const houseFurnitureRects = (spec: HouseSpec): Rect[] => {
  const rects: Rect[] = [];
  const bed = houseBed(spec);
  rects.push(boxRect(bed.x, bed.z, HOUSE_BED_SIZE.w, HOUSE_BED_SIZE.d));
  const wardrobe = houseWardrobe(spec);
  rects.push(boxRect(wardrobe.x, wardrobe.z, HOUSE_WARDROBE_SIZE.w, HOUSE_WARDROBE_SIZE.d));
  if (spec.rooms >= 2) {
    const sofa = houseSofa(spec);
    rects.push(boxRect(sofa.x, sofa.z, HOUSE_SOFA_SIZE.w, HOUSE_SOFA_SIZE.d));
    const fridge = houseFridge(spec);
    rects.push(boxRect(fridge.x, fridge.z, HOUSE_FRIDGE_SIZE.w, HOUSE_FRIDGE_SIZE.d));
  }
  return rects;
};

// a via tem 10m de largura (linha central +-5) e a calcada ocupa mais 1.35m
const ROAD_CLEARANCE = 6.5;
const onRoad = (x: number, z: number) => {
  for (const line of ROAD_LINES) {
    if (Math.abs(x - line) < ROAD_CLEARANCE || Math.abs(z - line) < ROAD_CLEARANCE) return true;
  }
  return false;
};

// BFS no grid com a mesma resolucao de eixo do world.resolve (x e z separados).
// Janela local para nao inundar a cidade inteira a cada verificacao.
const GRID_STEP = 0.2;
const GRID_MIN = -260;
const GRID_SIZE = Math.round((520 - GRID_MIN * 2) / GRID_STEP);

const reachable = (world: ReturnType<typeof makeWorld>, from: { x: number; z: number }, radius: number, window = 34) => {
  const toIx = (v: number) => Math.round((v - GRID_MIN) / GRID_STEP);
  const toWorld = (ix: number) => GRID_MIN + ix * GRID_STEP;
  const sx = toIx(from.x);
  const sz = toIx(from.z);
  const span = Math.ceil(window / GRID_STEP);
  const minIx = Math.max(0, sx - span);
  const maxIx = Math.min(GRID_SIZE - 1, sx + span);
  const minIz = Math.max(0, sz - span);
  const maxIz = Math.min(GRID_SIZE - 1, sz + span);
  const index = (ix: number, iz: number) => ix * GRID_SIZE + iz;

  const seen = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const queue = new Int32Array((maxIx - minIx + 1) * (maxIz - minIz + 1));
  let head = 0;
  let tail = 0;
  const startIdx = index(sx, sz);
  seen[startIdx] = 1;
  queue[tail++] = startIdx;

  while (head < tail) {
    const cur = queue[head++]!;
    const cx = Math.floor(cur / GRID_SIZE);
    const cz = cur % GRID_SIZE;
    const neighbours = [
      [cx + 1, cz],
      [cx - 1, cz],
      [cx, cz + 1],
      [cx, cz - 1],
    ];
    for (const [nx, nz] of neighbours) {
      if (nx < minIx || nx > maxIx || nz < minIz || nz > maxIz) continue;
      const idx = index(nx, nz);
      if (seen[idx]) continue;
      const wx = toWorld(nx);
      const wz = toWorld(nz);
      if (world.blocked(wx, wz, radius)) continue;
      seen[idx] = 1;
      queue[tail++] = idx;
    }
  }

  return (x: number, z: number) => {
    const ix = toIx(x);
    const iz = toIx(z);
    if (ix < 0 || ix >= GRID_SIZE || iz < 0 || iz >= GRID_SIZE) return false;
    return seen[index(ix, iz)] === 1;
  };
};


/** Reproduz a loja que o mundo cria a partir de uma fachada da cidade. */
const cityShop = (
  name: string,
  kind: ShopKind,
  facing: Facing,
  x: number,
  z: number,
  w = 12.5,
  d = 15.5,
  bay = 0,
): CommerceSpec => {
  const ru = Math.max(1, Math.round(w / 8));
  const tile = w / ru;
  const doorOffset = -w / 2 + (bay === 0 ? 0.25 : 0.75) * tile;
  return {
    id: shopSlug(name, 0),
    name,
    short: name,
    kind,
    district: "centro",
    facing,
    x,
    z,
    w,
    d,
    doorOffset,
    color: "#2b3440",
    accent: SHOP_ACCENT[kind],
    desc: SHOP_BLURB[kind],
  };
};

const CITY_SHOPS: CommerceSpec[] = [
  cityShop("FARMÁCIA", "pharmacy", "south", -32.5, -32.5),
  cityShop("MERCADO", "mixed", "north", -15.5, -15.5, 12.5, 15.5, 1),
  cityShop("PADARIA", "food", "south", 15.5, 15.5, 15.5, 11.5),
  cityShop("BANCO", "bank", "north", 32.5, 32.5, 12.5, 15.5, 1),
];

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` :: ${extra}` : ""}`);
};

console.log("== geometria dos comércios ==");
for (const spec of CITY_SHOPS) {
  const rects = wallRects(spec);
  const world = makeWorld(rects);
  const enter = commerceEnterPoint(spec);
  const counter = commerceCounter(spec);
  const staff = commerceStaffPoint(spec);
  const door = commerceDoor(spec);
  const bounds = commerceBounds(spec);

  check(
    `${spec.name}: porta cabe o jogador`,
    COMMERCE_DOOR_WIDTH - COMMERCE_WALL * 0 > PLAYER_RADIUS * 2,
    `vao=${COMMERCE_DOOR_WIDTH}`,
  );
  check(
    `${spec.name}: carro NAO cabe na porta`,
    COMMERCE_DOOR_WIDTH <= CAR_RADIUS * 2,
    `vao=${COMMERCE_DOOR_WIDTH} carro=${CAR_RADIUS * 2}`,
  );
  check(
    `${spec.name}: balcão dentro dos limites internos`,
    counter.x > bounds.minX && counter.x < bounds.maxX && counter.z > bounds.minZ && counter.z < bounds.maxZ,
  );
  check(
    `${spec.name}: atendente dentro dos limites internos`,
    staff.x > bounds.minX && staff.x < bounds.maxX && staff.z > bounds.minZ && staff.z < bounds.maxZ,
  );
  const frontZ = spec.facing === "north" ? spec.z + spec.d / 2 : spec.z - spec.d / 2;
  const doorOutside = spec.facing === "north" ? door.z > frontZ : door.z < frontZ;
  const doorCenter = spec.x + (spec.doorOffset ?? 0);
  check(
    `${spec.name}: porta na fachada (ponto na calçada)`,
    Math.abs(door.x - doorCenter) < 0.001 && doorOutside,
    `doorX=${door.x.toFixed(2)}`,
  );
  const gap = { minX: doorCenter - COMMERCE_DOOR_WIDTH / 2, maxX: doorCenter + COMMERCE_DOOR_WIDTH / 2 };
  const gapBlocked = rects.some(
    (r) =>
      r.minX < gap.maxX - 0.01 &&
      r.maxX > gap.minX + 0.01 &&
      r.minZ <= frontZ + 0.01 &&
      r.maxZ >= frontZ - 0.01,
  );
  check(`${spec.name}: vao da porta livre na parede`, !gapBlocked);
  check(
    `${spec.name}: ponto de entrada DENTRO do estabelecimento`,
    spec.facing === "north"
      ? enter.z < spec.z + spec.d / 2 - COMMERCE_WALL && enter.z > spec.z - spec.d / 2 + COMMERCE_WALL
      : enter.z > spec.z - spec.d / 2 + COMMERCE_WALL && enter.z < spec.z + spec.d / 2 - COMMERCE_WALL,
    `enterZ=${enter.z.toFixed(2)}`,
  );
  check(
    `${spec.name}: entrada dentro dos limites internos`,
    insideCommerce(spec, enter.x, enter.z),
  );

  // o balcão tem que ter colisor próprio (não pode atravessar)
  const cb = commerceCounterBox(spec);
  const counterRect: Rect = {
    minX: cb.x - cb.w / 2,
    maxX: cb.x + cb.w / 2,
    minZ: cb.z - cb.d / 2,
    maxZ: cb.z + cb.d / 2,
  };
  const worldWithCounter = makeWorld([...rects, counterRect]);
  const outside = { x: spec.x, z: frontZ + (spec.facing === "north" ? 3 : -3) };
  const can = reachable(worldWithCounter, outside, PLAYER_RADIUS);
  // ponto de interação: encostado no balcão (0.75m da face frontal)
  const atCounter = {
    x: counter.x,
    z: counter.z + (spec.facing === "north" ? 0.75 : -0.75),
  };
  check(`${spec.name}: jogador chega em frente ao balcão`, can(atCounter.x, atCounter.z));
  const dCounter = Math.hypot(atCounter.x - counter.x, atCounter.z - counter.z);
  check(`${spec.name}: distância do balcão dentro do raio de compra (2.4)`, dCounter < 2.4, `dist=${dCounter.toFixed(2)}`);

  // o carrinho do jogador tem que chegar perto do balcão (raio de interação 2.4)
  const worldNoCounter = makeWorld(rects);
  const can2 = reachable(worldNoCounter, outside, PLAYER_RADIUS);
  const near = can2(counter.x + 1.6, counter.z);
  check(`${spec.name}: alcança o balcão a ~1.6m (interação 2.4)`, near);

  // entrar e sair: o vão da porta tem que permitir a passagem do calçada até o interior
  const canWalkIn = reachable(worldNoCounter, { x: door.x, z: door.z }, PLAYER_RADIUS);
  check(`${spec.name}: jogador entra pela porta`, canWalkIn(enter.x, enter.z));
  const canWalkOut = reachable(worldNoCounter, { x: enter.x, z: enter.z }, PLAYER_RADIUS);
  check(`${spec.name}: jogador sai pela porta`, canWalkOut(door.x, door.z));

  // carro não entra
  const canCar = reachable(worldNoCounter, { x: door.x, z: door.z }, CAR_RADIUS);
  check(`${spec.name}: carro NÃO entra no estabelecimento`, !canCar(enter.x, enter.z));
}

console.log("\n== geometria das casas ==");
for (const spec of HOUSES) {
  const rects = houseWallRects(spec);
  const bounds = houseBounds(spec);
  const door = houseDoor(spec);
  const enter = houseEnterPoint(spec);
  const bedUse = houseBedUse(spec);
  const wardrobeUse = houseWardrobeUse(spec);
  const frontZ = spec.facing === "north" ? spec.z + spec.d / 2 : spec.z - spec.d / 2;

  check(`${spec.name}: vão da porta cabe o jogador`, HOUSE_DOOR_WIDTH > PLAYER_RADIUS * 2, `vao=${HOUSE_DOOR_WIDTH}`);
  check(`${spec.name}: porta na fachada`, door.x === spec.x && (spec.facing === "north" ? door.z > frontZ : door.z < frontZ), `doorZ=${door.z.toFixed(2)}`);
  check(`${spec.name}: ponto de entrada dentro da casa`, insideHouse(spec, enter.x, enter.z), `enter=(${enter.x.toFixed(2)}, ${enter.z.toFixed(2)})`);
  check(`${spec.name}: cama dentro da casa`, insideHouse(spec, bedUse.x, bedUse.z));
  check(`${spec.name}: guarda-roupa dentro da casa`, insideHouse(spec, wardrobeUse.x, wardrobeUse.z));
  check(`${spec.name}: cama ao alcance da interação (2.4)`, Math.hypot(bedUse.x - houseBed(spec).x, bedUse.z - houseBed(spec).z) < 2.4);
  check(`${spec.name}: guarda-roupa ao alcance da interação (2.2)`, Math.hypot(wardrobeUse.x - houseWardrobe(spec).x, wardrobeUse.z - houseWardrobe(spec).z) < 2.2);
  check(
    `${spec.name}: cama não está dentro do guarda-roupa`,
    Math.hypot(bedUse.x - wardrobeUse.x, bedUse.z - wardrobeUse.z) > 1.2,
    `dist=${Math.hypot(bedUse.x - wardrobeUse.x, bedUse.z - wardrobeUse.z).toFixed(2)}`,
  );

  const world = makeWorld([...rects, ...houseFurnitureRects(spec)]);
  const can = reachable(world, { x: door.x, z: door.z }, PLAYER_RADIUS);
  check(`${spec.name}: jogador entra pela porta`, can(enter.x, enter.z));
  check(`${spec.name}: jogador chega na cama`, can(bedUse.x, bedUse.z));
  check(`${spec.name}: jogador chega no guarda-roupa`, can(wardrobeUse.x, wardrobeUse.z));
  const canOut = reachable(world, { x: enter.x, z: enter.z }, PLAYER_RADIUS);
  check(`${spec.name}: jogador sai pela porta`, canOut(door.x, door.z));
  check(`${spec.name}: limites internos coerentes`, bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ);
}

console.log("\n== organização da cidade ==");
const centers = blockCenters();
for (const spec of HOUSES) {
  check(`${spec.name}: fora das ruas`, !onRoad(spec.x, spec.z), `x=${spec.x} z=${spec.z}`);
  check(`${spec.name}: dentro da cidade`, Math.abs(spec.x) < 178 && Math.abs(spec.z) < 178);
}
for (const spec of CITY_SHOPS) {
  check(`${spec.name}: fora das ruas`, !onRoad(spec.x, spec.z), `x=${spec.x} z=${spec.z}`);
  check(`${spec.name}: dentro da cidade`, Math.abs(spec.x) < 178 && Math.abs(spec.z) < 178);
}
for (let i = 0; i < CITY_SHOPS.length; i++) {
  for (let j = i + 1; j < CITY_SHOPS.length; j++) {
    const a = CITY_SHOPS[i]!;
    const b = CITY_SHOPS[j]!;
    const gapX = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
    const gapZ = Math.abs(a.z - b.z) - (a.d + b.d) / 2;
    check(`${a.short} x ${b.short}: sem sobreposição`, gapX > 0 || gapZ > 0, `gapX=${gapX.toFixed(2)} gapZ=${gapZ.toFixed(2)}`);
  }
}
for (let i = 0; i < HOUSES.length; i++) {
  for (let j = i + 1; j < HOUSES.length; j++) {
    const a = HOUSES[i]!;
    const b = HOUSES[j]!;
    const gapX = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
    const gapZ = Math.abs(a.z - b.z) - (a.d + b.d) / 2;
    check(`${a.short} x ${b.short}: sem sobreposição`, gapX > 0 || gapZ > 0, `gapX=${gapX.toFixed(2)} gapZ=${gapZ.toFixed(2)}`);
  }
}
for (const spec of HOUSES) {
  const bi = centers.findIndex((c) => Math.abs(spec.x - c) <= 18.75);
  const bj = centers.findIndex((c) => Math.abs(spec.z - c) <= 18.75);
  const outsideGrid = bi < 0 || bj < 0;
  check(
    `${spec.name}: bloco reservado registrado`,
    outsideGrid || RESERVED_BLOCKS.has(`${bi}:${bj}`),
    `bloco=${bi}:${bj}`,
  );
}
check("blocos reservados não são vazios", RESERVED_BLOCKS.size >= 1, `n=${RESERVED_BLOCKS.size}`);
check("todas as 24 fachadas tem tipo de loja", STOREFRONT_SHOPS.every((name) => shopKindFor(name) !== null));
check("as fachadas da cidade cobrem todos os nomes", (() => {
  const names = new Set<string>();
  for (let i = 0; i < 12; i++) for (const bay of storefrontBays(i)) names.add(bay);
  return STOREFRONT_SHOPS.every((name) => names.has(name)) && names.size === STOREFRONT_SHOPS.length;
})(), `n=${STOREFRONT_SHOPS.length}`);
check("as fachadas largas tambem cobrem todos os nomes", (() => {
  const names = new Set<string>();
  for (let i = 0; i < 6; i++) for (const bay of storefrontBays(i, 4)) names.add(bay);
  return STOREFRONT_SHOPS.every((name) => names.has(name)) && names.size === STOREFRONT_SHOPS.length;
})(), `n=${STOREFRONT_SHOPS.length}`);
check("slugs das lojas sao unicos", new Set(STOREFRONT_SHOPS.map((name) => shopSlug(name, 0))).size === STOREFRONT_SHOPS.length);

console.log("\n== atropelamento de pedestres ==");
const scene = new THREE.Scene();
const stubWorld = makeWorld([]);
const peds = new PedestrianSystem(scene, stubWorld as never, "high");
peds.update(0.016, 0, 0);
const pool = (peds as unknown as { pool: { x: number; z: number; downed: boolean }[] }).pool;
check("pedestres spawnaram", pool.length > 0, `n=${pool.length}`);
if (pool.length) {
  const target = pool[0]!;
  const hits: VehicleHit[] = [];
  const fast = { x: target.x, z: target.z, speed: 9, dirX: 1, dirZ: 0, player: true };
  peds.checkVehicleHits([fast], (h) => hits.push(h));
  check("carro rápido derruba pedestre", hits.length === 1, `hits=${hits.length}`);
  check("pedestre marcado como caído", target.downed === true);
  const hits2: VehicleHit[] = [];
  peds.checkVehicleHits([{ ...fast, speed: PEDESTRIAN_HIT_SPEED - 0.5 }], (h) => hits2.push(h));
  check("carro lento NÃO derruba", hits2.length === 0);
  const hits3: VehicleHit[] = [];
  peds.checkVehicleHits([{ x: target.x + 40, z: target.z, speed: 9, dirX: 1, dirZ: 0, player: true }], (h) =>
    hits3.push(h),
  );
  check("carro longe NÃO derruba", hits3.length === 0);
}

console.log("\n== cidade real: lojas descobertas nas fachadas ==");
// stub minimo de canvas para rodar as texturas de fora do navegador
const ctxProxy = new Proxy({} as Record<string, unknown>, {
  get(target, prop) {
    if (prop === "measureText") return () => ({ width: 12 });
    if (prop === "createLinearGradient" || prop === "createRadialGradient")
      return () => ({ addColorStop: () => {} });
    if (prop === "getImageData" || prop === "createImageData")
      return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (prop === "canvas") return { width: 1, height: 1 };
    if (prop in target) return target[prop as string];
    return () => {};
  },
  set(target, prop, value) {
    target[prop as string] = value;
    return true;
  },
});
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => ctxProxy }),
};

const { World } = await import("../src/world");
const cityScene = new THREE.Scene();
const city = new World(cityScene, "medium");
const cityShops = city.shops;

check("a cidade tem lojas suficientes", cityShops.length >= 20, `n=${cityShops.length}`);
check("as lojas usam varios nomes", new Set(cityShops.map((s) => s.name)).size >= 10, `n=${new Set(cityShops.map((s) => s.name)).size}`);
check("todas as lojas tem tipo valido", cityShops.every((s) => shopKindFor(s.name) !== null));
check("nenhuma porta de loja cai na rua", cityShops.every((s) => !onRoad(commerceDoor(s).x, commerceDoor(s).z)));
let cityOverlap = 0;
for (let i = 0; i < cityShops.length; i++) {
  for (let j = i + 1; j < cityShops.length; j++) {
    const a = commerceBounds(cityShops[i]!);
    const b = commerceBounds(cityShops[j]!);
    if (a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ) cityOverlap++;
  }
}
check("nenhuma loja se sobrepoe a outra", cityOverlap === 0, `n=${cityOverlap}`);
check("toda vitrine pintada tem loja funcional", (() => {
  for (const shop of cityShops) {
    const room = commerceBounds(shop);
    if (room.maxX <= room.minX) return false;
  }
  return true;
})());
check("a porta de cada loja fica dentro da sua vitrine", cityShops.every((s) => {
  const room = commerceBounds(s);
  const door = commerceDoor(s);
  return door.x > room.minX - 0.2 && door.x < room.maxX + 0.2;
}));
check("as lojas do mesmo predio nao dividem a area de vendas", (() => {
  const byBuilding = new Map<string, CommerceSpec[]>();
  for (const shop of cityShops) {
    const key = `${Math.round(shop.x)}:${Math.round(shop.z)}`;
    const list = byBuilding.get(key) ?? [];
    list.push(shop);
    byBuilding.set(key, list);
  }
  for (const list of byBuilding.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = commerceBounds(list[i]!);
        const b = commerceBounds(list[j]!);
        if (a.minX < b.maxX - 0.01 && a.maxX > b.minX + 0.01) return false;
      }
    }
  }
  return true;
})());

const cityWorld = { colliders: [] as Rect[], blocked: (x: number, z: number, r = 0.4) => city.blocked(x, z, r, true) };
let sampled = 0;
let badEnter = 0;
let badCounter = 0;
for (let i = 0; i < cityShops.length; i += 7) {
  const shop = cityShops[i]!;
  sampled++;
  city.setActiveShop(shop.id);
  const enter = commerceEnterPoint(shop);
  if (city.blocked(enter.x, enter.z, PLAYER_RADIUS, true)) badEnter++;
  const counter = commerceCounter(shop);
  const target = { x: counter.x, z: counter.z + (shop.facing === "north" ? 1.05 : -1.05) };
  const can = reachable(cityWorld, enter, PLAYER_RADIUS);
  if (!can(target.x, target.z)) badCounter++;
  city.setActiveShop(null);
}
check("entrada de cada loja esta livre", badEnter === 0, `n=${badEnter}/${sampled}`);
check("da para chegar no balcao de dentro da loja", badCounter === 0, `n=${badCounter}/${sampled}`);

console.log("\n== colisao real de mobiliario e carros ==");
const colliderList = (city as unknown as { colliders: Rect[] }).colliders;
check("a cidade tem colisor para o mobiliario", colliderList.length > 250, `n=${colliderList.length}`);
const nearCollider = (x: number, z: number, radius: number) =>
  colliderList.some(
    (c) => x >= c.minX - radius && x <= c.maxX + radius && z >= c.minZ - radius && z <= c.maxZ + radius,
  );

// postes de luz ficam na calcada (linha + 6.7) e precisam travar o jogador
let badLamp = 0;
let lampTotal = 0;
for (const line of ROAD_LINES) {
  for (let k = -2; k <= 2; k++) {
    const along = k * 52 + 16;
    lampTotal += 2;
    if (!city.blocked(line + 6.7, along, PLAYER_RADIUS)) badLamp++;
    if (!city.blocked(along, line + 6.7, PLAYER_RADIUS)) badLamp++;
  }
}
check("poste de luz bloqueia o jogador", badLamp === 0, `n=${badLamp}/${lampTotal}`);

// o|poste e o mobiliario sao empurrados para fora do asfalto: o colisor tem de acompanhar
const sidewalkSpot = (x: number, z: number) => {
  const roadHalf = 5.2;
  const walk = 6.6;
  let px = x;
  let pz = z;
  for (const line of ROAD_LINES) {
    if (Math.abs(px - line) < roadHalf) px = line + (px >= line ? walk : -walk);
    if (Math.abs(pz - line) < roadHalf) pz = line + (pz >= line ? walk : -walk);
  }
  for (const c of blockCenters()) {
    if (Math.abs(px - c) < 16.3) px = c + (px >= c ? 17.5 : -17.5);
    if (Math.abs(pz - c) < 16.3) pz = c + (pz >= c ? 17.5 : -17.5);
  }
  return { x: px, z: pz };
};

// o colisor precisa ficar exatamente onde o mobile foi colocado (na calcada)
const colliderAt = (x: number, z: number, tol = 0.4) =>
  colliderList.some(
    (c) => Math.abs((c.minX + c.maxX) / 2 - x) <= tol && Math.abs((c.minZ + c.maxZ) / 2 - z) <= tol,
  );

let badBin = 0;
for (const [x, z] of [[176, 32], [176, -44], [176, 128], [-4, 22], [52, -4], [-100, -4]] as Array<[number, number]>) {
  const spot = sidewalkSpot(x, z);
  if (!colliderAt(spot.x, spot.z)) badBin++;
  if (!city.blocked(spot.x, spot.z, PLAYER_RADIUS)) badBin++;
}
check("lixeira tem colisor na calcada", badBin === 0, `n=${badBin}/6`);

let badHydrant = 0;
for (const [x, z] of [[6, 26], [-102, 6], [174, 74], [54, -98]] as Array<[number, number]>) {
  const spot = sidewalkSpot(x, z);
  if (!colliderAt(spot.x, spot.z)) badHydrant++;
  if (!city.blocked(spot.x, spot.z, PLAYER_RADIUS)) badHydrant++;
}
check("hidrante tem colisor na calcada", badHydrant === 0, `n=${badHydrant}/4`);

let badBench = 0;
for (let z = -150; z <= 150; z += 60) {
  if (!nearCollider(170, z, 8)) badBench++;
}
check("banquinho tem colisor", badBench === 0, `n=${badBench}`);

const before = colliderList.length;
city.addVehicleCollider(-32, 46, 1.9, 4.1, 0);
check("carro estacionado vira colisor", colliderList.length === before + 1 && city.blocked(-32, 46, 0.5));
city.addVehicleCollider(-36, 35, 1.9, 4.1, Math.PI);
check("carro virado tambem vira colisor", city.blocked(-36, 35, 0.5));

console.log("\n== interior da loja mobiliado ==");
const shopSample = cityShops[0]!;
city.setActiveShop(shopSample.id);
const interiorGroup = (city as unknown as { shopInteriors: Map<string, THREE.Group> }).shopInteriors.get(shopSample.id);
check("interior da loja foi construido", Boolean(interiorGroup) && interiorGroup!.children.length >= 8, `filhos=${interiorGroup?.children.length ?? 0}`);
const interiorMats = new Set<string>();
interiorGroup?.traverse((o) => {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh) return;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (mat?.color) interiorMats.add(`#${mat.color.getHexString()}`);
});
check("interior nao e uma caixa branca", interiorMats.size >= 3, `cores=${interiorMats.size}`);
check("interior tem textura de piso", [...interiorMats].length > 0 && interiorGroup!.children.some((c) => (c as THREE.Mesh).isMesh));
city.setActiveShop(null);

console.log(failures === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${failures} FALHA(S)`);
if (failures > 0) throw new Error(`${failures} verificação(ões) falharam`);
