export const GAME_VERSION = "1.7.1";
export const GAME_NAME = "RedRP";
export const WORLD_SIZE = 520;
export const CITY_LIMIT = 178;
export const ROAD_LINES = [-144, -96, -48, 0, 48, 96, 144];
export const SPAWN = { x: -17.3, z: 30.6 };
export const GARAGE = { x: -27, z: 39 };
export const OCEAN_EDGE = 218;
export const BLOCK_HALF = 18.75;
export const HOUSE_SELL_RATE = 0.72;

/**
 * Orcamento de performance do modo leve (A14 / 4GB).
 * Perfil WebGL/Android leve para o A14 (4 GB). As opções ficam aqui para que
 * a tela de gráficos e o renderizador usem os mesmos limites.
 */
export const PERF = {
  /** Distancia (m) em que o renderer e desligado. */
  cullDistance: 90,
  /** Intervalo (s) entre varreduras de culling. */
  cullInterval: 0.5,
  /** Distancia (m) para o carro parado voltar a existir (script ligado). */
  vehicleActivateDistance: 15,
  /** Celula (m) do agrupamento de malhas do mundo: define o corte do culling. */
  worldCellSize: 72,
  /** Orcamento de draw calls por frame. */
  budgetDrawCalls: 90,
};

export type QualityName = "low" | "medium" | "high";

export interface QualityPreset {
  name: QualityName;
  label: string;
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowSize: number;
  drawDistance: number;
  cullingDistance: number;
  traffic: number;
  people: number;
  rain: boolean;
  post: boolean;
  ao: boolean;
  bloom: boolean;
  motionBlur: boolean;
  reflexos: boolean;
  grama: boolean;
  tremor: boolean;
  oceanPhysical: boolean;
  targetFPS: number;
  vSync: number;
  renderScale: number;
  shadowQuality: "off" | "low" | "medium" | "high";
  textureQuality: "half" | "full";
  lodBias: number;
  fogStart: number;
  fogEnd: number;
  fogColor: string;
  maxCars: number;
  maxNPCs: number;
  saturationBoost: number;
  contrastBoost: number;
  maxLights: number;
  useBlobShadows: boolean;
  useAtlasMaterials: boolean;
  useObjectPooling: boolean;
  disableSSAO: boolean;
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  low: {
    name: "low",
    label: "Leve · A14 4 GB",
    pixelRatio: 1.0,
    antialias: true,
    shadows: false,
    shadowSize: 256,
    drawDistance: 150,
    cullingDistance: 140,
    traffic: 5,
    people: 6,
    rain: false,
    post: false,
    ao: false,
    bloom: false,
    motionBlur: false,
    reflexos: false,
    grama: false,
    tremor: false,
    oceanPhysical: false,
    targetFPS: 30,
    vSync: 0,
    renderScale: 1.0,
    shadowQuality: "off",
    textureQuality: "full",
    lodBias: 0.85,
    fogStart: 50,
    fogEnd: 130,
    fogColor: "#a6c8e8",
    maxCars: 5,
    maxNPCs: 6,
    saturationBoost: 0.1,
    contrastBoost: 0.05,
    maxLights: 1,
    useBlobShadows: true,
    useAtlasMaterials: true,
    useObjectPooling: true,
    disableSSAO: true,
  },
  medium: {
    name: "medium",
    label: "Médio · recomendado",
    pixelRatio: 1.5,
    antialias: true,
    shadows: true,
    shadowSize: 1536,
    drawDistance: 340,
    cullingDistance: 300,
    traffic: 10,
    people: 6,
    rain: true,
    post: false,
    ao: false,
    bloom: false,
    motionBlur: false,
    reflexos: false,
    grama: true,
    tremor: true,
    oceanPhysical: true,
    targetFPS: 45,
    vSync: 0,
    renderScale: 1.0,
    shadowQuality: "medium",
    textureQuality: "full",
    lodBias: 0.95,
    fogStart: 120,
    fogEnd: 360,
    fogColor: "#b4d2e9",
    maxCars: 10,
    maxNPCs: 6,
    saturationBoost: 0.08,
    contrastBoost: 0.04,
    maxLights: 10,
    useBlobShadows: false,
    useAtlasMaterials: true,
    useObjectPooling: true,
    disableSSAO: false,
  },
  high: {
    name: "high",
    label: "Máximo · mais beleza",
    pixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowSize: 2048,
    drawDistance: 480,
    cullingDistance: 440,
    traffic: 14,
    people: 8,
    rain: true,
    post: true,
    ao: false,
    bloom: true,
    motionBlur: true,
    reflexos: true,
    grama: true,
    tremor: true,
    oceanPhysical: true,
    targetFPS: 60,
    vSync: 1,
    renderScale: 1.0,
    shadowQuality: "high",
    textureQuality: "full",
    lodBias: 1.0,
    fogStart: 90,
    fogEnd: 500,
    fogColor: "#a9c9e8",
    maxCars: 14,
    maxNPCs: 8,
    saturationBoost: 0.05,
    contrastBoost: 0.03,
    maxLights: 16,
    useBlobShadows: false,
    useAtlasMaterials: true,
    useObjectPooling: true,
    disableSSAO: false,
  },
};

export interface VehicleSpec {
  id: string;
  name: string;
  kind: "car" | "moto" | "suv" | "sport" | "van" | "taxi" | "police";
  price: number;
  level: number;
  maxSpeed: number;
  accel: number;
  brake: number;
  handling: number;
  color: string;
  accent: string;
  size: [number, number, number];
  desc: string;
}

export const VEHICLES: VehicleSpec[] = [
  {
    id: "pop",
    name: "Fubiquinha",
    kind: "car",
    price: 0,
    level: 1,
    maxSpeed: 26,
    accel: 9,
    brake: 17,
    handling: 1.65,
    color: "#f2c84b",
    accent: "#2a3b45",
    size: [1.9, 1.45, 4.1],
    desc: "O clássico popular. Cabe na vaga, cabe no coração.",
  },
  {
    id: "moto",
    name: "Vento 150",
    kind: "moto",
    price: 1250,
    level: 1,
    maxSpeed: 31,
    accel: 12,
    brake: 20,
    handling: 2.1,
    color: "#e94f37",
    accent: "#1b1b1b",
    size: [0.8, 1.35, 2.2],
    desc: "Ágil no trânsito e esperta na subida.",
  },
  {
    id: "sedan",
    name: "Maré Sedan",
    kind: "car",
    price: 2400,
    level: 2,
    maxSpeed: 32,
    accel: 10,
    brake: 19,
    handling: 1.6,
    color: "#e8eef2",
    accent: "#223843",
    size: [2, 1.42, 4.5],
    desc: "Conforto de Zona Sul com motor de corredor.",
  },
  {
    id: "van",
    name: "Kombi do Rolê",
    kind: "van",
    price: 3900,
    level: 3,
    maxSpeed: 27,
    accel: 7,
    brake: 14,
    handling: 1.25,
    color: "#71c6b8",
    accent: "#f7f3e9",
    size: [2.15, 2.05, 4.9],
    desc: "Leva a galera, o som e a caixa térmica.",
  },
  {
    id: "suv",
    name: "Serra 4x4",
    kind: "suv",
    price: 6200,
    level: 5,
    maxSpeed: 34,
    accel: 11,
    brake: 20,
    handling: 1.45,
    color: "#37554d",
    accent: "#c8d5c8",
    size: [2.25, 1.9, 4.7],
    desc: "Encara ladeira, areia e buraco sem drama.",
  },
  {
    id: "sport",
    name: "Carioca GT",
    kind: "sport",
    price: 11000,
    level: 7,
    maxSpeed: 43,
    accel: 16,
    brake: 25,
    handling: 1.8,
    color: "#e23b3b",
    accent: "#111",
    size: [2, 1.15, 4.6],
    desc: "Baixa, nervosa e com escape que conversa.",
  },
  {
    id: "taxi",
    name: "Amarelinho",
    kind: "taxi",
    price: 4800,
    level: 4,
    maxSpeed: 30,
    accel: 9,
    brake: 18,
    handling: 1.55,
    color: "#f6c431",
    accent: "#1b1b1b",
    size: [2, 1.48, 4.4],
    desc: "O rei do ponto. Todo carioca já entrou em um.",
  },
  {
    id: "police",
    name: "Viatura 190",
    kind: "police",
    price: 0,
    level: 99,
    maxSpeed: 36,
    accel: 12,
    brake: 22,
    handling: 1.7,
    color: "#f2f4f5",
    accent: "#172a4d",
    size: [2.05, 1.55, 4.6],
    desc: "Reservada para as autoridades da cidade.",
  },
];

export const getVehicle = (id: string) =>
  VEHICLES.find((v) => v.id === id) ?? VEHICLES[0]!;

export const SKIN_TONES = ["#f3c9a6", "#dca57a", "#c98b5e", "#a86843", "#7a492f", "#4c2c1e"];
export const SHIRT_COLORS = ["#ff6b35", "#f6c945", "#17b890", "#28a7e8", "#f25f8b", "#f4f1e8", "#343a59"];
export const PANTS_COLORS = ["#1f3c5b", "#22252b", "#4b5563", "#7b4b2a", "#e8e2d3", "#2c6e63"];
export const HAIR_COLORS = ["#17110d", "#3b2416", "#6b4428", "#c08948", "#e8d3a8", "#451f1f"];
export const PAINT_COLORS = ["#f6c945", "#e23b3b", "#2f80c9", "#f4f4ee", "#172026", "#17a67c", "#f27b35", "#8e5cc4"];

export const XP_PER_LEVEL = [0, 220, 560, 1100, 1900, 3000, 4500, 6500, 9200, 12600, 17000];
export const levelForXp = (xp: number) => {
  let lvl = 1;
  for (let i = 1; i < XP_PER_LEVEL.length; i++) if (xp >= XP_PER_LEVEL[i]!) lvl = i + 1;
  return lvl;
};
export const xpForNextLevel = (level: number) =>
  XP_PER_LEVEL[Math.min(level, XP_PER_LEVEL.length - 1)] ?? XP_PER_LEVEL[XP_PER_LEVEL.length - 1]!;

export type ShopKind = "food" | "clothes" | "mixed" | "pharmacy" | "hardware" | "bank";
export type Facing = "south" | "north";
export type District = "centro" | "vila" | "norte" | "orla";

export const DISTRICT_LABEL: Record<District, string> = {
  centro: "Centro",
  vila: "Vila",
  norte: "Zona Norte",
  orla: "Orla",
};

export const SHOP_KIND_LABEL: Record<ShopKind, string> = {
  food: "LANCHONETE",
  clothes: "LOJA DE ROUPAS",
  mixed: "MERCEARIA",
  pharmacy: "FARMÁCIA",
  hardware: "LOJA DE MATERIAIS",
  bank: "BANCO E IMOBILIÁRIA",
};

export interface CommerceSpec {
  id: string;
  name: string;
  short: string;
  kind: ShopKind;
  district: District;
  facing: Facing;
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  accent: string;
  desc: string;
  /** Deslocamento lateral da porta em relacao ao centro do predio. */
  doorOffset?: number;
  bayWidth?: number;
}

// Fachadas visuais geradas na cidade. As que estão no SHOP_KIND_BY_NAME viram
// as lojas funcionais: o jogador entra nelas, compra no balcão e usa o balcão.
export const STOREFRONT_SHOPS = [
  "PADARIA",
  "BOTECO",
  "FARMÁCIA",
  "CAFÉ",
  "MERCADO",
  "AÇAÍ",
  "SALÃO",
  "LIVRARIA",
  "DROGARIA",
  "PEÇAS",
  "BANCO",
  "BARBEARIA",
  "FLORISTA",
  "PIZZARIA",
  "SUSHI",
  "MATERIAIS",
  "CONFEITARIA",
  "PET SHOP",
  "LANCHES",
  "TÊXIL",
  "ELETRÔNICOS",
  "CINE",
  "PADARIA LITORÂNEA",
  "OFICINA",
] as const;

export type StorefrontName = (typeof STOREFRONT_SHOPS)[number];

export const SHOP_KIND_BY_NAME: Partial<Record<StorefrontName, ShopKind>> = {
  "PADARIA": "food",
  "BOTECO": "food",
  "FARMÁCIA": "pharmacy",
  "CAFÉ": "food",
  "MERCADO": "mixed",
  "AÇAÍ": "food",
  "SALÃO": "clothes",
  "DROGARIA": "pharmacy",
  "PEÇAS": "hardware",
  "BANCO": "bank",
  "BARBEARIA": "clothes",
  "PIZZARIA": "food",
  "SUSHI": "food",
  "MATERIAIS": "hardware",
  "CONFEITARIA": "food",
  "LANCHES": "food",
  "TÊXIL": "clothes",
  "ELETRÔNICOS": "hardware",
  "PADARIA LITORÂNEA": "food",
  "OFICINA": "hardware",
  "LIVRARIA": "mixed",
  "FLORISTA": "mixed",
  "PET SHOP": "mixed",
  "CINE": "mixed",
};

export const SHOP_BLURB: Record<ShopKind, string> = {
  food: "Comida, bebida e lanche pronto na hora.",
  clothes: "Camisas, calças e o visual completo.",
  mixed: "Comida, bebida e o básico para sobreviver na cidade.",
  pharmacy: "Remédios, curativos e cuidado com a saúde.",
  hardware: "Peças, ferramentas e materiais para o seu carro.",
  bank: "Empréstimos, seguros e o mercado de imóveis da cidade.",
};

export const SHOP_ACCENT: Record<ShopKind, string> = {
  food: "#ff6b35",
  clothes: "#f25f8b",
  mixed: "#17b890",
  pharmacy: "#7ef0d0",
  hardware: "#f27b35",
  bank: "#ffd166",
};

export const districtFor = (x: number, z: number): District => {
  if (x > 110) return "orla";
  if (z < -70) return "norte";
  if (Math.abs(x) < 60 && Math.abs(z) < 60) return "centro";
  return "vila";
};

export const shopKindFor = (name: string): ShopKind | null =>
  (SHOP_KIND_BY_NAME as Record<string, ShopKind | undefined>)[name] ?? null;

export const shopSlug = (name: string, index: number) =>
  `${name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")}_${index}`;

export const COMMERCE_WALL = 0.3;
export const COMMERCE_DOOR_WIDTH = 1.95;
export const COMMERCE_DOOR_HEIGHT = 2.45;
export const COMMERCE_COUNTER_DEPTH = 0.6;
/** Profundidade maxima da area de vendas:-Lojas muito fundas viram salao vazio. */
export const COMMERCE_ROOM_DEPTH = 9;

export const commerceFront = (c: CommerceSpec) => (c.facing === "north" ? c.z + c.d / 2 : c.z - c.d / 2);
/** Sinal que aponta do portao para o fundo da loja. */
export const commerceDir = (c: CommerceSpec) => (c.facing === "north" ? -1 : 1);

/**
 * Area de vendas: recorte interno da loja, encostado no portao.
 * O pedaco do predio que sobra no fundo vira deposito (inacessivel).
 */
export const commerceRoom = (c: CommerceSpec) => {
  const s = commerceDir(c);
  const depth = Math.min(c.d - COMMERCE_WALL * 2, COMMERCE_ROOM_DEPTH);
  const frontZ = commerceFront(c) + s * COMMERCE_WALL;
  const backZ = frontZ + s * depth;
  const doorX = c.x + (c.doorOffset ?? 0);
  const half = (c.bayWidth ?? c.w) / 2;
  const minX = Math.max(c.x - c.w / 2 + COMMERCE_WALL, doorX - half);
  const maxX = Math.min(c.x + c.w / 2 - COMMERCE_WALL, doorX + half);
  return {
    s,
    depth,
    frontZ,
    backZ,
    centerZ: (frontZ + backZ) / 2,
    minX,
    maxX,
    minZ: Math.min(frontZ, backZ),
    maxZ: Math.max(frontZ, backZ),
  };
};
export const commerceBack = (c: CommerceSpec) => commerceRoom(c).backZ;
export const commerceDoor = (c: CommerceSpec) => ({
  x: c.x + (c.doorOffset ?? 0),
  z: c.facing === "north" ? commerceFront(c) + 1.2 : commerceFront(c) - 1.2,
});
export const commerceEnterPoint = (c: CommerceSpec) => ({
  x: c.x + (c.doorOffset ?? 0),
  // Entra alguns passos para dentro: a camera em terceira pessoa precisa de
  // espaco atras do personagem para mostrar o corpo e o interior da loja.
  z: c.facing === "north" ? commerceFront(c) - COMMERCE_WALL - 3 : commerceFront(c) + COMMERCE_WALL + 3,
});
export const commerceCounterBox = (c: CommerceSpec) => {
  const room = commerceRoom(c);
  const w = (c.bayWidth ?? c.w) * 0.66;
  const half = w / 2;
  const raw = c.x + (c.doorOffset ?? 0);
  const x = Math.min(Math.max(raw, room.minX + half), room.maxX - half);
  const z = c.facing === "north" ? room.backZ + 1.3 : room.backZ - 1.3;
  return { x, z, w, d: COMMERCE_COUNTER_DEPTH };
};
export const commerceCounter = (c: CommerceSpec) => {
  const box = commerceCounterBox(c);
  return { x: box.x, z: c.facing === "north" ? box.z + box.d / 2 : box.z - box.d / 2 };
};
export const commerceStaffPoint = (c: CommerceSpec) => {
  const box = commerceCounterBox(c);
  return { x: box.x, z: c.facing === "north" ? box.z - box.d / 2 - 0.42 : box.z + box.d / 2 + 0.42 };
};
export const commerceBounds = (c: CommerceSpec) => {
  const room = commerceRoom(c);
  return {
    minX: room.minX,
    maxX: room.maxX,
    minZ: room.minZ,
    maxZ: room.maxZ,
  };
};
export const commerceWalls = (c: CommerceSpec) => {
  const t = COMMERCE_WALL;
  const room = commerceRoom(c);
  const s = room.s;
  const doorCenter = c.x + (c.doorOffset ?? 0);
  const doorLeft = doorCenter - COMMERCE_DOOR_WIDTH / 2;
  const doorRight = doorCenter + COMMERCE_DOOR_WIDTH / 2;
  const frontWallZ = room.frontZ - (s * t) / 2;
  const backWallZ = room.backZ - (s * t) / 2;
  const sideDepth = room.depth;
  return [
    { x: c.x, z: backWallZ, w: c.w, d: t },
    { x: room.minX + t / 2, z: room.centerZ, w: t, d: sideDepth },
    { x: room.maxX - t / 2, z: room.centerZ, w: t, d: sideDepth },
    { x: (room.minX + doorLeft) / 2, z: frontWallZ, w: doorLeft - room.minX, d: t },
    { x: (doorRight + room.maxX) / 2, z: frontWallZ, w: room.maxX - doorRight, d: t },
  ];
};
export const insideCommerce = (c: CommerceSpec, x: number, z: number) => {
  const b = commerceBounds(c);
  return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
};
export const commerceShelfPlan = (kind: ShopKind) => {
  if (kind === "pharmacy") return ["#7ef0d0", "#e8f7ff", "#ffd166", "#ff8a5c"];
  if (kind === "hardware") return ["#f27b35", "#4b4f45", "#8fa1a8", "#e0b64a"];
  if (kind === "bank") return ["#ffd166", "#315f7e", "#8fa1a8", "#e8e2d3"];
  if (kind === "clothes") return CLOTHES.map((item) => item.color);
  if (kind === "food") return ["#ff6b35", "#f6c945", "#7c4867", "#17b890", "#e23b3b", "#28a7e8"];
  return ["#ff6b35", "#f6c945", "#17b890", "#f25f8b", "#e23b3b", "#28a7e8", "#7c4867"];
};

export const PEDESTRIAN_FINE = 140;
export const PEDESTRIAN_HIT_SPEED = 2.6;

export interface HouseSpec {
  id: string;
  name: string;
  short: string;
  price: number;
  district: District;
  facing: Facing;
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  desc: string;
  rooms: number;
  beds: number;
}

export const HOUSES: HouseSpec[] = [
  {
    id: "casa_vila",
    name: "Casa da Vila",
    short: "Casa da Vila",
    price: 3500,
    district: "vila",
    facing: "south",
    x: -38,
    z: 39,
    w: 6,
    d: 5,
    color: "#d0a439",
    desc: "Casinha simples perto da garagem. Dá para descansar e voltar a viver aqui.",
    rooms: 2,
    beds: 2,
  },
  {
    id: "casa_orla",
    name: "Casa da Orla",
    short: "Casa da Orla",
    price: 18000,
    district: "orla",
    facing: "south",
    x: 176,
    z: 118,
    w: 7,
    d: 5.5,
    color: "#f2c84b",
    desc: "Casa de praia com cheiro de maresia. O endereço dos sonhos.",
    rooms: 4,
    beds: 3,
  },
];


export const HOUSE_WALL = 0.28;
export const HOUSE_DOOR_WIDTH = 1.7;
export const HOUSE_DOOR_HEIGHT = 2.35;

export const houseFront = (h: HouseSpec) => (h.facing === "north" ? h.z + h.d / 2 : h.z - h.d / 2);
export const houseBack = (h: HouseSpec) =>
  h.facing === "north" ? h.z - h.d / 2 + HOUSE_WALL : h.z + h.d / 2 - HOUSE_WALL;
export const houseDoor = (h: HouseSpec) => ({
  x: h.x,
  z: h.facing === "north" ? houseFront(h) + 1.6 : houseFront(h) - 1.6,
});
export const houseEnterPoint = (h: HouseSpec) => ({
  x: h.x,
  z: h.facing === "north" ? houseFront(h) - HOUSE_WALL - 0.8 : houseFront(h) + HOUSE_WALL + 0.8,
});
export const houseBounds = (h: HouseSpec) => ({
  minX: h.x - h.w / 2 + HOUSE_WALL,
  maxX: h.x + h.w / 2 - HOUSE_WALL,
  minZ: h.z - h.d / 2 + HOUSE_WALL,
  maxZ: h.z + h.d / 2 - HOUSE_WALL,
});
export const houseWalls = (h: HouseSpec) => {
  const t = HOUSE_WALL;
  const minX = h.x - h.w / 2;
  const maxX = h.x + h.w / 2;
  const minZ = h.z - h.d / 2;
  const maxZ = h.z + h.d / 2;
  const doorLeft = h.x - HOUSE_DOOR_WIDTH / 2;
  const doorRight = h.x + HOUSE_DOOR_WIDTH / 2;
  if (h.facing === "north") {
    return [
      { x: h.x, z: minZ + t / 2, w: h.w, d: t },
      { x: minX + t / 2, z: h.z, w: t, d: h.d - t * 2 },
      { x: maxX - t / 2, z: h.z, w: t, d: h.d - t * 2 },
      { x: (minX + doorLeft) / 2, z: maxZ - t / 2, w: doorLeft - minX, d: t },
      { x: (doorRight + maxX) / 2, z: maxZ - t / 2, w: maxX - doorRight, d: t },
    ];
  }
  return [
    { x: h.x, z: maxZ - t / 2, w: h.w, d: t },
    { x: minX + t / 2, z: h.z, w: t, d: h.d - t * 2 },
    { x: maxX - t / 2, z: h.z, w: t, d: h.d - t * 2 },
    { x: (minX + doorLeft) / 2, z: minZ + t / 2, w: doorLeft - minX, d: t },
    { x: (doorRight + maxX) / 2, z: minZ + t / 2, w: maxX - doorRight, d: t },
  ];
};
export const insideHouse = (h: HouseSpec, x: number, z: number) => {
  const b = houseBounds(h);
  return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
};
export const houseDepth = (h: HouseSpec) => h.d - HOUSE_WALL * 2;
export const houseZ = (h: HouseSpec, depth: number) =>
  h.facing === "north" ? houseBack(h) + depth : houseBack(h) - depth;
// Layout interno: cama no fundo a esquerda, guarda-roupa no fundo a direita e um
// corredor livre no meio (entre a cama e o armario) ligando a porta ate o fundo.
export const HOUSE_BED_SIZE = { w: 1.7, d: 2.1 };
export const HOUSE_WARDROBE_SIZE = { w: 1.4, d: 0.62 };
export const HOUSE_SOFA_SIZE = { w: 1.7, d: 0.85 };
export const HOUSE_FRIDGE_SIZE = { w: 0.85, d: 0.78 };

export const houseBed = (h: HouseSpec) => ({
  x: h.x - h.w / 2 + 1.13,
  z: houseZ(h, HOUSE_BED_SIZE.d / 2),
});
export const houseBedUse = (h: HouseSpec) => ({ x: houseBed(h).x + 1.55, z: houseZ(h, 2.7) });
export const houseWardrobe = (h: HouseSpec) => ({
  x: h.x + h.w / 2 - 0.98,
  z: houseZ(h, HOUSE_WARDROBE_SIZE.d / 2),
});
export const houseWardrobeUse = (h: HouseSpec) => ({ x: houseWardrobe(h).x - 1.4, z: houseZ(h, 1.22) });
export const houseSofa = (h: HouseSpec) => ({
  x: h.x + h.w / 2 - 1.13,
  z: houseZ(h, houseDepth(h) - 1.2),
});
export const houseTable = (h: HouseSpec) => ({
  x: h.x,
  z: houseZ(h, houseDepth(h) / 2),
});
export const houseFridge = (h: HouseSpec) => ({
  x: h.x - h.w / 2 + 0.705,
  z: houseZ(h, houseDepth(h) - 0.8),
});
export const houseSellPrice = (h: HouseSpec) => Math.round(h.price * HOUSE_SELL_RATE);

export const getHouse = (id: string) => HOUSES.find((h) => h.id === id);

export interface FoodSpec {
  id: string;
  name: string;
  price: number;
  hunger: number;
  heal: number;
  desc: string;
  icon: string;
}

export const FOODS: FoodSpec[] = [
  { id: "agua", name: "Água de coco", price: 5, hunger: 8, heal: 0, desc: "Refresca e mata a sede.", icon: "A" },
  { id: "salgado", name: "Salgado", price: 12, hunger: 22, heal: 0, desc: "Quentinho, direto da fritadeira.", icon: "S" },
  { id: "lanche", name: "X-Tudo", price: 20, hunger: 35, heal: 5, desc: "O clássico pós-rolê.", icon: "X" },
  { id: "acai", name: "Açaí 500ml", price: 18, hunger: 32, heal: 10, desc: "Com granola e banana.", icon: "Ç" },
  { id: "refeicao", name: "Prato feito", price: 30, hunger: 55, heal: 10, desc: "Arroz, feijão e bife. Recupera bastante fome.", icon: "P" },
  { id: "remedio", name: "Kit de saúde", price: 45, hunger: 5, heal: 45, desc: "Remédio e curativo para recuperar vida.", icon: "+" },
];

export const getFood = (id: string) => FOODS.find((f) => f.id === id);

export interface MedicineSpec {
  id: string;
  name: string;
  price: number;
  hunger: number;
  heal: number;
  desc: string;
  icon: string;
}

export const MEDICINES: MedicineSpec[] = [
  { id: "antialergico", name: "Antialérgico", price: 22, hunger: 0, heal: 14, desc: "Toma de manhã e a alergia some.", icon: "A" },
  { id: "curativo", name: "Curativo", price: 16, hunger: 0, heal: 22, desc: "Gaze, bandagem e um jeito de não piorar.", icon: "C" },
  { id: "vitamina", name: "Vitamina C", price: 34, hunger: 6, heal: 26, desc: "Suco de laranja com tudo que é importante.", icon: "V" },
  { id: "dor", name: "Remédio para dor", price: 58, hunger: 0, heal: 48, desc: "Toma com água e volta pra pista.", icon: "R" },
  { id: "antisseptico", name: "Antisséptico", price: 19, hunger: 0, heal: 12, desc: "Limpa o corte antes que piore.", icon: "S" },
];

export const getMedicine = (id: string) => MEDICINES.find((m) => m.id === id);

export type Consumable = FoodSpec | MedicineSpec;

export const CONSUMABLES: Consumable[] = [...FOODS, ...MEDICINES];

export const getConsumable = (id: string) => CONSUMABLES.find((c) => c.id === id);

export type MaterialKind = "engine" | "turbo" | "tires" | "paint";

export interface MaterialSpec {
  id: string;
  name: string;
  price: number;
  kind: MaterialKind;
  desc: string;
  icon: string;
}

export const MATERIALS: MaterialSpec[] = [
  { id: "oleo_motor", name: "Óleo do motor", price: 620, kind: "engine", desc: "Melhora o motor do seu carro em um nível.", icon: "M" },
  { id: "turbo_preparado", name: "Turbo preparado", price: 1450, kind: "turbo", desc: "Instala um turbo novo no seu veículo.", icon: "T" },
  { id: "pneu_esportivo", name: "Pneu esportivo", price: 980, kind: "tires", desc: "Pneus novos que agarram na curva.", icon: "P" },
  { id: "chapa_pintura", name: "Chapa de pintura", price: 380, kind: "paint", desc: "Uma nova cor para o seu veículo.", icon: "C" },
];

export const getMaterial = (id: string) => MATERIALS.find((m) => m.id === id);

export const blockCenters = () => {
  const out: number[] = [];
  for (let i = 0; i < ROAD_LINES.length - 1; i++) out.push((ROAD_LINES[i]! + ROAD_LINES[i + 1]!) / 2);
  return out;
};

export const RESERVED_BLOCKS = (() => {
  const centers = blockCenters();
  const keys = new Set<string>();
  const add = (x: number, z: number) => {
    const i = centers.findIndex((c) => Math.abs(x - c) <= BLOCK_HALF);
    const j = centers.findIndex((c) => Math.abs(z - c) <= BLOCK_HALF);
    if (i >= 0 && j >= 0) keys.add(`${i}:${j}`);
  };
  for (const house of HOUSES) add(house.x, house.z);
  return keys;
})();

export interface ClothesSpec {
  id: string;
  name: string;
  price: number;
  slot: "shirt" | "pants";
  color: string;
  desc: string;
}

export const CLOTHES: ClothesSpec[] = [
  { id: "camisa_vermelha", name: "Camisa Vermelha", price: 120, slot: "shirt", color: "#e23b3b", desc: "Pede atenção no rolê." },
  { id: "camisa_verde", name: "Camisa Verde", price: 120, slot: "shirt", color: "#17b890", desc: "Tranquila e estilosa." },
  { id: "camisa_azul", name: "Camisa Azul", price: 120, slot: "shirt", color: "#28a7e8", desc: "Cara de quem veio do mar." },
  { id: "camisa_rosa", name: "Camisa Rosa", price: 180, slot: "shirt", color: "#f25f8b", desc: "GhostCity é a cidade do amor." },
  { id: "camisa_creme", name: "Camisa Creme", price: 150, slot: "shirt", color: "#f4f1e8", desc: "Visual limpo e carioca." },
  { id: "calca_preta", name: "Calça Preta", price: 160, slot: "pants", color: "#22252b", desc: "Combina com tudo." },
  { id: "calca_jeans", name: "Calça Jeans", price: 160, slot: "pants", color: "#1f3c5b", desc: "O básico que nunca falha." },
  { id: "calca_caqui", name: "Calça Caqui", price: 190, slot: "pants", color: "#7b4b2a", desc: "Confortável para o dia inteiro." },
];

export const getClothes = (id: string) => CLOTHES.find((c) => c.id === id);
