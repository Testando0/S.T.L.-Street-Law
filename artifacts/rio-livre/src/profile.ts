import { GAME_VERSION, PAINT_COLORS, SKIN_TONES, SPAWN, getVehicle, levelForXp } from "./config";
import { makeId, safeNumber } from "./util";

export interface GameSettings {
  quality: "low" | "medium" | "high";
  masterVolume: number;
  musicVolume: number;
  sensitivity: number;
  cameraShake: boolean;
  /** true = tenta o servidor online; false = modo solo, sem rede. */
  online: boolean;
  showFps: boolean;
  renderScale?: number;
  targetFPS?: number;
  vSync?: number;
  lodBias?: number;
  fogStart?: number;
  fogEnd?: number;
  cullingDistance?: number;
  maxCars?: number;
  maxNPCs?: number;
  saturationBoost?: number;
  contrastBoost?: number;
  useBlobShadows?: boolean;
  useAtlasMaterials?: boolean;
  useObjectPooling?: boolean;
}

export interface Upgrades {
  engine: number;
  turbo: number;
  tires: number;
}

export interface InventoryItem {
  id: string;
  type: "food" | "clothes" | "item" | "medicine";
  count: number;
  name?: string;
  heal?: number;
  hunger?: number;
}

export interface PlayerProfile {
  version: string;
  id: string;
  name: string;
  money: number;
  xp: number;
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  hairstyle: number;
  activeVehicle: string;
  paint: string;
  ownedVehicles: string[];
  upgrades: Record<string, Upgrades>;
  settings: GameSettings;
  stats: {
    missions: number;
    distance: number;
    onlineSessions: number;
    bestRace: number;
    atropelamentos: number;
  };
  lastPosition: { x: number; z: number; ry: number };
  tutorialDone: boolean;
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
  inventory: InventoryItem[];
  ownedClothes: string[];
  ownedHouses: string[];
  houseId: string | null;
}

const STORAGE_KEY = "rio_livre_profile_v1";

const randomName = () => {
  const first = ["Bia", "Duda", "Rafa", "Nina", "Léo", "Caio", "Iara", "Tati", "Zeca", "Jô", "Luan", "Mari"];
  const last = ["da Lapa", "do Vidigal", "Carioca", "da Tijuca", "do Leblon", "de Niterói", "da Vila", "do Morro"];
  return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
};

export const detectLowEnd = () => {
  try {
    if (typeof navigator === "undefined") return false;
    const cores = (navigator as any).hardwareConcurrency || 8;
    const mem = (navigator as any).deviceMemory || 8;
    // Celulares modernos (A14, intermediarios com 6-8 GB) rodam o preset
    // medio. O modo leve fica so para aparelhos realmente fracos.
    if (cores <= 4 && mem <= 4) return true;
  } catch {}
  return false;
};

const defaultProfile = (): PlayerProfile => ({
  version: GAME_VERSION,
  id: makeId(),
  name: randomName(),
  money: 780,
  xp: 0,
  skin: SKIN_TONES[1]!,
  shirt: "#121212",
  pants: "#16171a",
  hair: "#0e0b0a",
  hairstyle: 0,
  activeVehicle: "pop",
  paint: PAINT_COLORS[0]!,
  ownedVehicles: ["pop"],
  upgrades: {
    pop: { engine: 0, turbo: 0, tires: 0 },
  },
  settings: {
    quality: detectLowEnd() ? "low" : "medium",
    masterVolume: 0.8,
    musicVolume: 0.7,
    sensitivity: 1,
    cameraShake: false,
    online: true,
    showFps: false,
  },
  stats: { missions: 0, distance: 0, onlineSessions: 0, bestRace: 0, atropelamentos: 0 },
  lastPosition: { x: SPAWN.x, z: SPAWN.z, ry: 0 },
  tutorialDone: false,
  hp: 100,
  maxHp: 100,
  hunger: 100,
  maxHunger: 100,
  inventory: [],
  ownedClothes: [],
  ownedHouses: [],
  houseId: null,
});

const sanitizeColor = (v: unknown, fallback: string) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;

export const loadProfile = (): PlayerProfile => {
  const base = defaultProfile();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<PlayerProfile>;
    const storedVersion = typeof data.version === "string" ? data.version : "";
    const merged: PlayerProfile = {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings ?? {}) },
      stats: { ...base.stats, ...(data.stats ?? {}) },
      lastPosition: { ...base.lastPosition, ...(data.lastPosition ?? {}) },
      upgrades: { ...base.upgrades, ...(data.upgrades ?? {}) },
    };
    merged.name = String(merged.name || base.name).slice(0, 18);
    // Migra o antigo campo de URL manual para o modo Online/Offline.
    delete (merged.settings as unknown as { serverUrl?: string }).serverUrl;
    merged.settings.online = (data.settings as { online?: unknown } | undefined)?.online !== false;
    merged.money = Math.max(0, safeNumber(merged.money, base.money));
    merged.xp = Math.max(0, safeNumber(merged.xp, 0));
    merged.skin = sanitizeColor(merged.skin, base.skin);
    merged.shirt = sanitizeColor(merged.shirt, base.shirt);
    merged.pants = sanitizeColor(merged.pants, base.pants);
    merged.hair = sanitizeColor(merged.hair, base.hair);
    merged.paint = sanitizeColor(merged.paint, base.paint);
    merged.ownedVehicles = Array.isArray(merged.ownedVehicles)
      ? Array.from(new Set(["pop", ...merged.ownedVehicles.filter((v) => typeof v === "string" && getVehicle(v))]))
      : ["pop"];
    if (!merged.ownedVehicles.includes(merged.activeVehicle)) merged.activeVehicle = "pop";
    merged.hp = Math.max(0, Math.min(safeNumber((merged as any).hp, base.hp), safeNumber((merged as any).maxHp, base.maxHp) || base.maxHp));
    merged.maxHp = Math.max(1, safeNumber((merged as any).maxHp, base.maxHp));
    merged.hunger = Math.max(0, Math.min(safeNumber((merged as any).hunger, base.hunger), safeNumber((merged as any).maxHunger, base.maxHunger) || base.maxHunger));
    merged.maxHunger = Math.max(1, safeNumber((merged as any).maxHunger, base.maxHunger));
    merged.inventory = Array.isArray((merged as any).inventory) ? (merged as any).inventory.filter((i: any) => i && typeof i.id === "string") : [];
    merged.ownedClothes = Array.isArray((merged as any).ownedClothes) ? (merged as any).ownedClothes.filter((c: any) => typeof c === "string") : [];
    merged.ownedHouses = Array.isArray((merged as any).ownedHouses) ? (merged as any).ownedHouses.filter((h: any) => typeof h === "string") : [];
    merged.houseId = typeof (merged as any).houseId === "string" ? (merged as any).houseId : null;
    if (storedVersion !== GAME_VERSION) {
      if (merged.settings.quality === "low") merged.settings.quality = "medium";
      merged.version = GAME_VERSION;
    }
    return merged;
  } catch {
    return base;
  }
};

export const saveProfile = (profile: PlayerProfile) => {
  profile.version = GAME_VERSION;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    return;
  }
};

export const addXp = (profile: PlayerProfile, amount: number) => {
  const before = levelForXp(profile.xp);
  profile.xp += Math.max(0, Math.floor(amount));
  const after = levelForXp(profile.xp);
  return { before, after, leveled: after > before };
};

export const defaultServerUrl = () => {
  const fromQuery = new URLSearchParams(location.search).get("server");
  if (fromQuery) return fromQuery.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const injected = (window as unknown as { __RIO_DEFAULT_SERVER__?: string }).__RIO_DEFAULT_SERVER__;
    if (injected) return injected.replace(/\/$/, "");
  }
  return "";
};

export const isWrappedApp = () =>
  Boolean((window as unknown as { __RIO_APK__?: boolean }).__RIO_APK__) || location.protocol === "file:";
