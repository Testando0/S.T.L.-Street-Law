import {
  CLOTHES,
  DISTRICT_LABEL,
  FOODS,
  GAME_VERSION,
  HAIR_COLORS,
  HOUSES,
  MATERIALS,
  MEDICINES,
  PANTS_COLORS,
  PAINT_COLORS,
  SHIRT_COLORS,
  SHOP_KIND_LABEL,
  SKIN_TONES,
  XP_PER_LEVEL,
  getClothes,
  getConsumable,
  getFood,
  getHouse,
  getVehicle,
  houseSellPrice,
  levelForXp,
  xpForNextLevel,
  type CommerceSpec,
  type HouseSpec,
} from "./config";
import type { PlayerProfile } from "./profile";
import { escapeHtml, money, timeClock } from "./util";
import type { MapData } from "./world";

export interface MissionCardData {
  id: string;
  icon: string;
  title: string;
  description: string;
  reward: number;
  xp: number;
  active: boolean;
  distance: number;
  duration: string;
}

export interface HudMission {
  icon: string;
  kind: string;
  title: string;
  sub: string;
  timer: string;
  progress: number;
}

export interface HudPlayerSnapshot {
  x: number;
  z: number;
  ry: number;
  vehicle: boolean;
}

export interface MapMarker {
  x: number;
  z: number;
  color: string;
  pulse?: boolean;
  label?: string;
}

export interface RemoteDot {
  x: number;
  z: number;
}

export interface UICallbacks {
  onPlay: (online: boolean) => void;
  onCoverEnter: () => void;
  onModalOpen: (name: string) => void;
  onModalClose: (name: string) => void;
  onMissionTrack: (id: string) => void;
  onCallVehicle: () => void;
  onGarageAction: (id: string) => void;
  onUpgrade: (kind: "engine" | "turbo" | "tires") => void;
  onPaint: (color: string) => void;
  onSpawnVehicle: () => void;
  onSaveCustomize: (name: string, skin: string, shirt: string, pants: string, hair: string) => void;
  onSaveSettings: (settings: PlayerProfile["settings"]) => void;
  onQualityChange?: (quality: PlayerProfile["settings"]["quality"]) => void;
  onSetOnline: (online: boolean) => void;
  onResetSave: () => void;
  onResume: () => void;
  onLeave: () => void;
  onChat: (text: string) => void;
  onFullscreen: () => void;
  onInstall: () => void;
  onPause: () => void;
  onMapOpen: () => void;
  onShopBuy: (id: string, kind: "food" | "medicine" | "clothes" | "material") => void;
  onUseItem: (id: string) => void;
  onEquipClothes: (id: string) => void;
  onBuyHouse: (id: string) => void;
  onSellHouse: (id: string) => void;
  onRestAtHome: () => void;
  onGoHome: () => void;
}

const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel));

const upgradeCost = (kind: string, level: number) => {
  const base = kind === "engine" ? 420 : kind === "turbo" ? 560 : 340;
  return Math.round(base * Math.pow(1.65, level));
};

export class MiniMapRenderer {
  base?: HTMLCanvasElement;
  width = 512;
  height = 512;

  build(data: MapData) {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d")!;
    const min = -250;
    const span = 500;
    const s = this.width / span;
    const px = (x: number) => (x - min) * s;
    const pz = (z: number) => (z - min) * s;
    ctx.fillStyle = "#102f2f";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#17392f";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#0a2d34";
    ctx.fillRect(px(226), 0, this.width - px(226), this.height);
    ctx.fillStyle = "#22636a";
    ctx.fillRect(px(232), 0, this.width - px(232), this.height);
    ctx.fillStyle = "#d9c58e";
    ctx.fillRect(px(data.beach.minX), px(data.beach.minZ), (data.beach.maxX - data.beach.minX) * s, (data.beach.maxZ - data.beach.minZ) * s);
    ctx.fillStyle = "#c5b797";
    ctx.fillRect(px(165), px(-242), 19 * s, 484 * s);
    ctx.fillStyle = "#294631";
    ctx.fillRect(px(data.favela.minX), px(data.favela.minZ), (data.favela.maxX - data.favela.minX) * s, (data.favela.maxZ - data.favela.minZ) * s);
    ctx.strokeStyle = "#7a915f";
    ctx.lineWidth = 1;
    for (let i = 0; i < 28; i++) {
      ctx.beginPath();
      ctx.arc(px(-205) + (i % 5) * 9, pz(-130) + Math.floor(i / 5) * 38, 13 + (i % 3) * 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#0e2b2d";
    for (const b of data.buildings) {
      if (b.x > 165 || b.x < -160) continue;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(px(b.x - b.w / 2), pz(b.z - b.d / 2), Math.max(1, b.w * s), Math.max(1, b.d * s));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#334c4c";
    ctx.lineWidth = 10 * s;
    ctx.lineCap = "square";
    for (const road of data.roads) {
      ctx.beginPath();
      if (road.vertical) {
        ctx.moveTo(px(road.pos), pz(-160));
        ctx.lineTo(px(road.pos), pz(160));
      } else {
        ctx.moveTo(px(-160), pz(road.pos));
        ctx.lineTo(px(160), pz(road.pos));
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "#b7a675";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    for (const road of data.roads) {
      ctx.beginPath();
      if (road.vertical) {
        ctx.moveTo(px(road.pos), pz(-155));
        ctx.lineTo(px(road.pos), pz(155));
      } else {
        ctx.moveTo(px(-155), pz(road.pos));
        ctx.lineTo(px(155), pz(road.pos));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "#f6c945";
    ctx.beginPath();
    ctx.arc(px(-27), pz(39), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f7d48";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(px(-24) + Math.cos(a) * 8, pz(72) + Math.sin(a) * 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#263d2c";
    ctx.beginPath();
    ctx.arc(px(-78), pz(-310), 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1f3a2c";
    ctx.beginPath();
    ctx.arc(px(292), pz(-237), 37, 0, Math.PI * 2);
    ctx.fill();
    this.base = canvas;
  }

  drawHud(canvas: HTMLCanvasElement, data: MapData, player: HudPlayerSnapshot, markers: MapMarker[], remotes: RemoteDot[]) {
    if (!this.base) this.build(data);
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const span = 200;
    const scale = w / span;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#17392f";
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-player.x, -player.z);
    if (this.base) ctx.drawImage(this.base, -250, -250, 500, 500);
    for (const m of markers) {
      const pulse = m.pulse ? 1 + Math.sin(performance.now() / 280) * 0.18 : 1;
      ctx.fillStyle = m.color;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(m.x, m.z, 7 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(m.x, m.z, 4 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.beginPath();
      ctx.arc(m.x, m.z, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of remotes) {
      ctx.fillStyle = "#5fd6c4";
      ctx.beginPath();
      ctx.arc(r.x, r.z, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(95,214,196,.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.z, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(player.x, player.z);
    const angle = Math.PI - player.ry;
    ctx.rotate(angle);
    ctx.fillStyle = "#fff8e8";
    ctx.strokeStyle = "#0a2022";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (player.vehicle) {
      ctx.fillStyle = "rgba(255,209,102,.9)";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.32, w / 2, h / 2, w * 0.52);
    grad.addColorStop(0, "rgba(5,23,25,0)");
    grad.addColorStop(1, "rgba(5,23,25,.72)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    for (const m of markers) {
      if (!m.label) continue;
      const dx = m.x - player.x;
      const dz = m.z - player.z;
      if (Math.hypot(dx, dz) > 92) continue;
      const sx = w / 2 + dx * scale;
      const sy = h / 2 + dz * scale;
      if (Math.hypot(sx - w / 2, sy - h / 2) > w / 2 - 16) continue;
      ctx.font = "700 12px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(4,18,20,.88)";
      ctx.strokeText(m.label, sx, sy - 9);
      ctx.fillStyle = "#fff3d6";
      ctx.fillText(m.label, sx, sy - 9);
    }
  }

  drawBig(canvas: HTMLCanvasElement, data: MapData, player: HudPlayerSnapshot, markers: MapMarker[], remotes: RemoteDot[]) {
    if (!this.base) this.build(data);
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a2728";
    ctx.fillRect(0, 0, w, h);
    if (this.base) ctx.drawImage(this.base, 8, 8, w - 16, h - 16);
    const s = (w - 16) / 500;
    const px = (x: number) => 8 + (x + 250) * s;
    const pz = (z: number) => 8 + (z + 250) * s;
    for (const m of markers) {
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.2;
      ctx.fillStyle = m.color;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(px(m.x), pz(m.z), 11 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px(m.x), pz(m.z), 6 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const m of markers) {
      if (!m.label) continue;
      ctx.font = "700 13px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(4,18,20,.82)";
      ctx.strokeText(m.label, px(m.x), pz(m.z) - 11);
      ctx.fillStyle = m.color;
      ctx.fillText(m.label, px(m.x), pz(m.z) - 11);
    }
    for (const r of remotes) {
      ctx.fillStyle = "#5fd6c4";
      ctx.beginPath();
      ctx.arc(px(r.x), pz(r.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(px(player.x), pz(player.z));
    ctx.rotate(Math.PI - player.ry);
    ctx.fillStyle = "#fff8e8";
    ctx.strokeStyle = "#0a2022";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const text = "GHOSTCITY · GPS";
    ctx.fillStyle = "rgba(246,238,217,.4)";
    ctx.font = "700 18px Trebuchet MS";
    ctx.fillText(text, 20, h - 18);
  }
}

export class UIManager {
  profile: PlayerProfile;
  callbacks: UICallbacks;
  minimap = new MiniMapRenderer();
  currentModal: string | null = null;
  private loadingValue = 0;
  private currentMarkers: MapMarker[] = [];
  private currentRemotes: RemoteDot[] = [];
  private currentPlayer: HudPlayerSnapshot = { x: -20, z: 31, ry: Math.PI, vehicle: false };
  private currentMapData?: MapData;
  private toastTimers = new Map<HTMLElement, number>();
  private missionCards: MissionCardData[] = [];
  private activeMissionId: string | null = null;
  private confirmResolver?: (v: boolean) => void;
  private installPrompt: (() => void) | null = null;
  private chatOpen = false;
  private nodeCache = new Map<string, HTMLElement>();
  private textCache = new Map<string, string>();
  private lastSpeedKmh = -1;
  private lastSpeedVehicle = "";
  private lastSpeedDial = -1;
  private lastVehicleHealth = -1;
  private lastClockText = "";
  private lastClockWeather = "";
  private lastHpPct = -1;
  private lastHungerPct = -1;
  private lastObjectiveDistance = -1;
  private lastObjectiveLabel = "";
  private shopCommerce: CommerceSpec | null = null;
  private shopHouse: HouseSpec | null = null;
  private shopMode: "commerce" | "house" | "bank" | "wardrobe" = "commerce";
  private shopTab: "food" | "clothes" | "medicine" | "material" = "food";

  private node(sel: string): HTMLElement | null {
    const cached = this.nodeCache.get(sel);
    if (cached) return cached;
    const found = q(sel);
    if (found) this.nodeCache.set(sel, found);
    return found;
  }

  private setText(sel: string, value: string): HTMLElement | null {
    const el = this.node(sel);
    if (el && this.textCache.get(sel) !== value) {
      this.textCache.set(sel, value);
      el.textContent = value;
    }
    return el;
  }

  private setHidden(sel: string, hidden: boolean) {
    const el = this.node(sel);
    if (!el) return;
    if (el.classList.contains("hidden") !== hidden) el.classList.toggle("hidden", hidden);
  }

  private setStyle(sel: string, prop: string, value: string) {
    const el = this.node(sel);
    if (!el) return;
    const key = `${sel}::${prop}`;
    if (this.textCache.get(key) === value) return;
    this.textCache.set(key, value);
    el.style.setProperty(prop, value);
  }

  constructor(profile: PlayerProfile, callbacks: UICallbacks) {
    this.profile = profile;
    this.callbacks = callbacks;
    this.bind();
    this.refreshProfile(profile);
    this.setQualityActive(profile.settings.quality);
    this.applyAvatarColors();
    this.setupApkDownload();
  }

  /**
   * Link de download do APK. Dentro do app (file://) usa a URL do servidor
   * published e cache-busting por versao, para nunca baixar o pacote velho.
   */
  private setupApkDownload() {
    const link = q<HTMLAnchorElement>("#btn-apk");
    const server = (window as unknown as { __RIO_DEFAULT_SERVER__?: string }).__RIO_DEFAULT_SERVER__ ?? "";
    const base = location.protocol.startsWith("file") && server ? server.replace(/\/+$/, "") : "";
    const url = `${base}/download/rio-livre.apk?v=${GAME_VERSION}`;
    if (link) {
      link.href = url;
      link.removeAttribute("download");
    }
    if (!base && !location.protocol.startsWith("http")) return;
    fetch(url, { method: "HEAD" })
      .then((response) => {
        if (response.ok) link?.classList.remove("hidden");
      })
      .catch(() => undefined);
  }

  private bind() {
    q("#cover")?.addEventListener("click", () => this.enterFromCover());
    q("#btn-play")?.addEventListener("click", () => this.callbacks.onPlay(false));
    q("#btn-online")?.addEventListener("click", () => this.callbacks.onPlay(true));
    q("#btn-menu-settings")?.addEventListener("click", () => this.openModal("settings"));
    q("#btn-footer-settings")?.addEventListener("click", () => this.openModal("settings"));
    q("#btn-menu-help")?.addEventListener("click", () => this.openModal("help"));
    q("#btn-profile-edit")?.addEventListener("click", () => this.openModal("customize"));
    q("#menu-online-chip")?.addEventListener("click", () => this.openModal("settings"));
    q("#btn-fullscreen")?.addEventListener("click", () => this.callbacks.onFullscreen());
    q("#btn-install")?.addEventListener("click", () => this.callbacks.onInstall());
    q("#btn-pause")?.addEventListener("click", () => this.callbacks.onPause());
    q("#btn-map")?.addEventListener("click", () => {
      this.openPhone("map");
      this.callbacks.onMapOpen();
    });
    q("#btn-resume")?.addEventListener("click", () => this.callbacks.onResume());
    q("#btn-leave")?.addEventListener("click", () => this.callbacks.onLeave());
    q("#btn-menu-online-chip")?.addEventListener("click", () => this.openModal("settings"));
    qa<HTMLElement>("[data-open]").forEach((el) => {
      el.addEventListener("click", () => {
        const name = el.dataset.open;
        if (!name) return;
        if (name === "phone") this.openPhone("missions");
        else this.openModal(name);
      });
    });
    qa<HTMLElement>("[data-close-modal]").forEach((el) => {
      el.addEventListener("click", () => {
        const modal = el.closest(".modal") as HTMLElement | null;
        if (modal?.id === "confirm-modal") return;
        this.closeModal();
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.currentModal && this.currentModal !== "confirm-modal") {
        e.preventDefault();
        e.stopPropagation();
        this.closeModal();
      }
    });
    qa<HTMLElement>(".phone-app").forEach((app) => {
      app.addEventListener("click", () => {
        const tab = app.dataset.phoneTab;
        if (tab) this.switchPhoneTab(tab);
      });
    });
    qa<HTMLElement>("[data-shop-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const kind = tab.dataset.shopTab as "food" | "clothes" | "medicine" | "material" | undefined;
        if (!kind) return;
        this.shopTab = kind;
        this.renderShop();
      });
    });
    q("#shop-items")?.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const food = target.closest<HTMLElement>("[data-buy-food]");
      if (food?.dataset.buyFood) {
        this.callbacks.onShopBuy(food.dataset.buyFood, "food");
        return;
      }
      const medicine = target.closest<HTMLElement>("[data-buy-medicine]");
      if (medicine?.dataset.buyMedicine) {
        this.callbacks.onShopBuy(medicine.dataset.buyMedicine, "medicine");
        return;
      }
      const material = target.closest<HTMLElement>("[data-buy-material]");
      if (material?.dataset.buyMaterial) {
        this.callbacks.onShopBuy(material.dataset.buyMaterial, "material");
        return;
      }
      const clothes = target.closest<HTMLElement>("[data-buy-clothes]");
      if (clothes?.dataset.buyClothes) {
        this.callbacks.onShopBuy(clothes.dataset.buyClothes, "clothes");
        return;
      }
      const equip = target.closest<HTMLElement>("[data-equip-clothes]");
      if (equip?.dataset.equipClothes) {
        this.callbacks.onEquipClothes(equip.dataset.equipClothes);
        return;
      }
      const house = target.closest<HTMLElement>("[data-buy-house]");
      if (house?.dataset.buyHouse) {
        this.callbacks.onBuyHouse(house.dataset.buyHouse);
        return;
      }
      const sell = target.closest<HTMLElement>("[data-sell-house]");
      if (sell?.dataset.sellHouse) {
        this.callbacks.onSellHouse(sell.dataset.sellHouse);
        return;
      }
      if (target.closest("[data-rest-home]")) {
        this.callbacks.onRestAtHome();
        return;
      }
      if (target.closest("[data-go-home]")) {
        this.callbacks.onGoHome();
      }
    });
    q("#phone-inventory-list")?.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const use = target.closest<HTMLElement>("[data-use-item]");
      if (use?.dataset.useItem) {
        this.callbacks.onUseItem(use.dataset.useItem);
        return;
      }
      const equip = target.closest<HTMLElement>("[data-equip-clothes]");
      if (equip?.dataset.equipClothes) this.callbacks.onEquipClothes(equip.dataset.equipClothes);
    });
    q("#phone-house-list")?.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-rest-home]")) this.callbacks.onRestAtHome();
      else if (target.closest("[data-go-home]")) this.callbacks.onGoHome();
      else {
        const sell = target.closest<HTMLElement>("[data-sell-house]");
        if (sell?.dataset.sellHouse) {
          this.callbacks.onSellHouse(sell.dataset.sellHouse);
          return;
        }
        const house = target.closest<HTMLElement>("[data-buy-house]");
        if (house?.dataset.buyHouse) this.callbacks.onBuyHouse(house.dataset.buyHouse);
      }
    });
    q("#btn-call-vehicle")?.addEventListener("click", () => this.callbacks.onCallVehicle());
    qa<HTMLElement>("[data-track-mission]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.trackMission;
        if (id) this.callbacks.onMissionTrack(id);
      });
    });
    q("#mission-list")?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-track-mission]");
      if (btn?.dataset.trackMission) this.callbacks.onMissionTrack(btn.dataset.trackMission);
    });
    q("#garage-list")?.addEventListener("click", (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>("[data-vehicle-id]");
      if (item?.dataset.vehicleId) this.callbacks.onGarageAction(item.dataset.vehicleId);
    });
    qa<HTMLElement>("[data-upgrade-buy]").forEach((el) => {
      el.addEventListener("click", () => {
        const kind = el.dataset.upgradeBuy as "engine" | "turbo" | "tires";
        if (kind) this.callbacks.onUpgrade(kind);
      });
    });
    q("#paint-swatches")?.addEventListener("click", (e) => {
      const swatch = (e.target as HTMLElement).closest<HTMLElement>("[data-paint]");
      if (swatch?.dataset.paint) this.callbacks.onPaint(swatch.dataset.paint);
    });
    q("#btn-spawn-vehicle")?.addEventListener("click", () => this.callbacks.onSpawnVehicle());
    q("#btn-custom-save")?.addEventListener("click", () => {
      const name = (q<HTMLInputElement>("#custom-name")?.value || this.profile.name).trim().slice(0, 18) || this.profile.name;
      this.callbacks.onSaveCustomize(
        name,
        this.profile.skin,
        this.profile.shirt,
        this.profile.pants,
        this.profile.hair,
      );
    });
    q("#custom-name")?.addEventListener("input", (e) => {
      const v = (e.target as HTMLInputElement).value;
      const preview = q("#preview-name");
      if (preview) preview.textContent = v || "Carioca";
    });
    qa<HTMLElement>(".option-group .swatches").forEach((group) => {
      group.addEventListener("click", (e) => {
        const swatch = (e.target as HTMLElement).closest<HTMLElement>("[data-color]");
        const color = swatch?.dataset.color;
        const key = swatch?.dataset.key as "skin" | "shirt" | "pants" | "hair" | undefined;
        if (!color || !key) return;
        this.profile[key] = color;
        this.applyAvatarColors();
        this.renderCustomizeOptions();
      });
    });
    qa<HTMLElement>("[data-quality]").forEach((el) => {
      el.addEventListener("click", () => {
        const quality = el.dataset.quality as "low" | "medium" | "high";
        if (this.profile.settings.quality === quality) return;
        this.profile.settings.quality = quality;
        this.setQualityActive(quality);
        this.callbacks.onQualityChange?.(quality);
      });
    });
    q("#setting-master")?.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.profile.settings.masterVolume = v / 100;
      const label = q("#master-value");
      if (label) label.textContent = `${v}%`;
    });
    q("#setting-music")?.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.profile.settings.musicVolume = v / 100;
      const label = q("#music-value");
      if (label) label.textContent = `${v}%`;
    });
    q("#setting-sens")?.addEventListener("input", (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.profile.settings.sensitivity = v / 100;
      const label = q("#sens-value");
      if (label) label.textContent = `${v}%`;
    });
    q("#setting-fps")?.addEventListener("change", (e) => {
      this.profile.settings.showFps = (e.target as HTMLInputElement).checked;
      q("#fps-counter")?.classList.toggle("hidden", !this.profile.settings.showFps);
    });
    q("#setting-shake")?.addEventListener("change", (e) => {
      this.profile.settings.cameraShake = (e.target as HTMLInputElement).checked;
    });
    q("#setting-online")?.addEventListener("click", () => {
      this.profile.settings.online = true;
      this.renderSettings();
      this.callbacks.onSetOnline(true);
    });
    q("#setting-offline")?.addEventListener("click", () => {
      this.profile.settings.online = false;
      this.renderSettings();
      this.callbacks.onSetOnline(false);
    });
    q("#btn-settings-done")?.addEventListener("click", () => {
      this.callbacks.onSaveSettings(this.profile.settings);
      this.closeModal();
    });
    q("#btn-reset-save")?.addEventListener("click", async () => {
      const ok = await this.confirm("Recomeçar do zero?", "Todo o progresso, dinheiro e veículos deste aparelho serão apagados. Essa ação não pode ser desfeita.");
      if (ok) this.callbacks.onResetSave();
    });
    q("#btn-chat-close")?.addEventListener("click", () => this.closeChat());
    q("#chat-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = q<HTMLInputElement>("#chat-input");
      const text = input?.value.trim();
      if (!text) return;
      this.callbacks.onChat(text.slice(0, 140));
      if (input) input.value = "";
    });
    q("#chat-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.closeChat();
      }
      e.stopPropagation();
    });
    q("#confirm-no")?.addEventListener("click", () => this.resolveConfirm(false));
    q("#confirm-yes")?.addEventListener("click", () => this.resolveConfirm(true));
    document.addEventListener("pointerdown", (e) => {
      if (!this.chatOpen || this.currentModal) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("#chat-panel")) return;
      this.closeChat();
    }, true);
  }

  setInstallPrompt(fn: (() => void) | null) {
    this.installPrompt = fn;
    q("#btn-install")?.classList.toggle("hidden", !fn);
  }

  setLoading(value: number, label?: string) {
    this.loadingValue = Math.max(this.loadingValue, Math.min(100, value));
    const bar = q("#loading-bar");
    const percent = q("#loading-percent");
    if (bar) bar.style.width = `${this.loadingValue}%`;
    if (percent) percent.textContent = `${Math.round(this.loadingValue)}%`;
    if (label) {
      const el = q("#loading-label");
      if (el) el.textContent = label;
    }
  }

  finishLoading() {
    this.setLoading(100, "A cidade está pronta.");
    setTimeout(() => {
      q("#loading-screen")?.classList.add("fade-out");
      q("#cover")?.classList.remove("hidden");
    }, 420);
  }

  enterFromCover() {
    const cover = q("#cover");
    if (!cover || cover.classList.contains("leaving")) return;
    cover.classList.add("leaving");
    q("#menu")?.classList.remove("hidden");
    this.callbacks.onCoverEnter();
    window.setTimeout(() => cover.classList.add("hidden"), 480);
  }

  showMenu() {
    q("#cover")?.classList.add("hidden");
    document.body.classList.remove("playing");
    q("#menu")?.classList.remove("hidden");
    q("#hud")?.classList.add("hidden");
    q("#pause-modal")?.classList.add("hidden");
    this.currentModal = null;
    this.closeAllModals();
  }

  startGame() {
    document.body.classList.add("playing");
    q("#menu")?.classList.add("hidden");
    q("#hud")?.classList.remove("hidden");
    this.closeAllModals();
    this.currentModal = null;
  }

  refreshProfile(profile: PlayerProfile) {
    this.profile = profile;
    const level = levelForXp(profile.xp);
    const prev = level > 1 ? XP_PER_LEVEL[level - 1] ?? 0 : 0;
    const next = xpForNextLevel(level);
    const pct = Math.max(0, Math.min(100, ((profile.xp - prev) / Math.max(1, next - prev)) * 100));
    const fields: Array<[string, string]> = [
      ["#menu-name", profile.name],
      ["#hud-name", profile.name],
      ["#menu-level", String(level)],
      ["#hud-level", String(level)],
      ["#menu-money", money(profile.money).replace("R$ ", "")],
      ["#hud-money", money(profile.money).replace("R$ ", "")],
      ["#menu-missions", String(profile.stats.missions)],
      ["#menu-distance", String(Math.round(profile.stats.distance / 1000))],
      ["#phone-profile-name", profile.name],
      ["#phone-profile-initial", profile.name.slice(0, 1).toUpperCase()],
      ["#phone-profile-id", `ID ${profile.id.slice(0, 8).toUpperCase()}`],
      ["#phone-missions", String(profile.stats.missions)],
      ["#phone-level", String(level)],
      ["#phone-money", money(profile.money)],
      ["#garage-money", money(profile.money)],
      ["#menu-best", profile.stats.bestRace ? profile.stats.bestRace.toFixed(1) + "s" : "--"],
      ["#menu-version", GAME_VERSION],
      ["#custom-name", profile.name],
      ["#preview-name", profile.name],
    ];
    for (const [sel, text] of fields) {
      const el = q(sel);
      if (el) {
        if (el instanceof HTMLInputElement) el.value = text;
        else el.textContent = text;
      }
    }
    for (const sel of ["#menu-xp-bar", "#hud-xp-bar"]) {
      const bar = q(sel);
      if (bar) bar.style.width = `${pct}%`;
    }
    const hpBar = q<HTMLElement>("#hud-hp-bar");
    if (hpBar) {
      const hp = Math.max(0, Math.min(profile.hp ?? 100, profile.maxHp ?? 100));
      const maxHp = profile.maxHp || 100;
      hpBar.style.width = `${Math.max(0, Math.min(1, hp / maxHp)) * 100}%`;
    }
    const hungerBar = q<HTMLElement>("#hud-hunger-bar");
    if (hungerBar) {
      const hunger = Math.max(0, Math.min(profile.hunger ?? 100, profile.maxHunger ?? 100));
      const maxHunger = profile.maxHunger || 100;
      hungerBar.style.width = `${Math.max(0, Math.min(1, hunger / maxHunger)) * 100}%`;
    }
    this.applyAvatarColors();
    this.renderCustomizeOptions();
    this.renderGarage();
    this.renderSettings();
    this.renderPhoneMissions();
    this.renderInventory();
  }

  applyAvatarColors() {
    document.documentElement.style.setProperty("--skin", this.profile.skin);
    document.documentElement.style.setProperty("--shirt", this.profile.shirt);
    document.documentElement.style.setProperty("--pants", this.profile.pants);
    document.documentElement.style.setProperty("--hair", this.profile.hair);
    const avatar = q("#menu-avatar");
    if (avatar) avatar.style.setProperty("--shirt", this.profile.shirt);
  }

  updateOnline(count: number, online: boolean, label?: string) {
    const text = online ? `${count} online` : label || "Modo offline";
    for (const sel of ["#menu-online-text", "#hero-online-count", "#hud-online"]) {
      const el = q(sel);
      if (el) el.textContent = sel === "#hero-online-count" ? String(count) : sel === "#hud-online" ? String(count) : text;
    }
    const phone = q("#phone-online");
    if (phone) phone.textContent = online ? `${count} ONLINE` : "OFFLINE";
    const chip = q("#menu-online-chip");
    chip?.classList.toggle("offline", !online);
    const heroCount = q("#hero-online-count");
    if (heroCount) heroCount.textContent = String(count);
    const status = q("#server-status");
    if (status) {
      status.classList.toggle("online", online);
      status.classList.toggle("offline", !online);
      const span = status.querySelector("span:last-child");
      if (span) span.textContent = online ? `Conectado ao servidor · ${count} jogadores` : label || "Servidor offline · modo solo ativo";
    }
    const build = q("#build-stamp");
    if (build) build.textContent = online ? "SERVIDOR ONLINE" : "MODO SOLO · OFFLINE";
  }

  setServerStatus(online: boolean, label: string) {
    const status = q("#server-status");
    if (!status) return;
    status.classList.toggle("online", online);
    status.classList.toggle("offline", !online);
    const span = status.querySelector("span:last-child");
    if (span) span.textContent = label;
  }

  showHud() {
    q("#hud")?.classList.remove("hidden");
  }

  setPrompt(key: string, text: string | null) {
    this.setHidden("#interaction-prompt", !text);
    if (!text) return;
    this.setText("#prompt-key", key);
    this.setText("#prompt-text", text);
  }

  setMission(mission: HudMission | null) {
    const el = this.node("#mission-hud");
    if (!el) return;
    this.setHidden("#mission-hud", !mission);
    this.setHidden("#mission-progress", !mission);
    if (!mission) return;
    this.setText("#mission-icon", mission.icon);
    this.setText("#mission-kind", mission.kind);
    this.setText("#mission-title", mission.title);
    this.setText("#mission-sub", mission.sub);
    this.setText("#mission-timer", mission.timer);
    this.setStyle("#mission-progress-fill", "width", `${Math.max(0, Math.min(100, mission.progress))}%`);
  }

  setObjective(distance: number | null, label = "DESTINO") {
    this.setHidden("#objective-card", distance === null);
    if (distance === null) {
      this.lastObjectiveDistance = -1;
      return;
    }
    const rounded = Math.round(distance);
    if (rounded !== this.lastObjectiveDistance || label !== this.lastObjectiveLabel) {
      this.lastObjectiveDistance = rounded;
      this.lastObjectiveLabel = label;
      this.setText("#objective-distance", distance > 999 ? `${(distance / 1000).toFixed(1)} km` : `${rounded} m`);
      this.setText("#objective-label", label);
    }
  }

  setWanted(level: number) {
    const el = this.node("#hud-wanted");
    if (!el) return;
    const key = String(level);
    if (this.textCache.get("wanted") === key) return;
    this.textCache.set("wanted", key);
    if (level <= 0) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    el.innerHTML = `<b>PROCURADO</b>${[0, 1, 2, 3, 4].map((i) => `<i class="${i < level ? "on" : ""}">★</i>`).join("")}`;
  }

  setSpeed(speed: number, vehicle: string | null, health = 100) {
    this.setHidden("#vehicle-hud", !vehicle);
    if (!vehicle) {
      this.lastSpeedKmh = -1;
      this.lastSpeedVehicle = "";
      this.lastSpeedDial = -1;
      this.lastVehicleHealth = -1;
      return;
    }
    // So monta string quando o numero muda: no frame a 30 fps isso evita
    // 4 alocacoes por frame (GC spike) sem perder o contador do velocimetro.
    const kmh = Math.round(Math.abs(speed) * 3.6);
    if (kmh !== this.lastSpeedKmh) {
      this.lastSpeedKmh = kmh;
      this.setText("#speed-value", String(kmh));
    }
    if (vehicle !== this.lastSpeedVehicle) {
      this.lastSpeedVehicle = vehicle;
      this.setText("#vehicle-label", vehicle.toUpperCase());
    }
    const dial = Math.min(100, Math.round((Math.abs(speed) / 40) * 100));
    if (dial !== this.lastSpeedDial) {
      this.lastSpeedDial = dial;
      this.setStyle("#vehicle-hud .speed-dial", "--speed", `${dial}%`);
    }
    if (health !== this.lastVehicleHealth) {
      this.lastVehicleHealth = health;
      const hp = this.node("#vehicle-health b");
      if (hp) {
        this.setStyle("#vehicle-health b", "width", `${health}%`);
        const background = health > 55 ? "var(--teal)" : health > 25 ? "var(--sun)" : "var(--coral)";
        const key = "#vehicle-health b::background";
        if (this.textCache.get(key) !== background) {
          this.textCache.set(key, background);
          hp.style.background = background;
        }
      }
    }
  }

  setClock(time: number, weather = "SOL") {
    const txt = timeClock(time);
    if (txt !== this.lastClockText) {
      this.lastClockText = txt;
      this.setText("#hud-clock", txt);
      this.setText("#phone-clock", txt);
    }
    if (weather !== this.lastClockWeather) {
      this.lastClockWeather = weather;
      this.setText("#hud-weather", weather);
    }
  }

  setFps(fps: number, extra = "") {
    this.setText("#fps-counter", `${Math.round(fps)} FPS${extra ? ` · ${extra}` : ""}`);
    this.setHidden("#fps-counter", !this.profile.settings.showFps);
  }

  updateMinimap(data: MapData, player: HudPlayerSnapshot, markers: MapMarker[], remotes: RemoteDot[]) {
    this.currentMapData = data;
    this.currentPlayer = player;
    this.currentMarkers = markers;
    this.currentRemotes = remotes;
    const canvas = q<HTMLCanvasElement>("#minimap");
    if (canvas && !document.body.classList.contains("playing")) return;
    if (canvas) this.minimap.drawHud(canvas, data, player, markers, remotes);
    if (this.currentModal === "phone") this.drawBigMap();
  }

  drawBigMap() {
    if (!this.currentMapData) return;
    const canvas = q<HTMLCanvasElement>("#big-map");
    if (canvas) this.minimap.drawBig(canvas, this.currentMapData, this.currentPlayer, this.currentMarkers, this.currentRemotes);
  }

  openModal(name: string) {
    const map: Record<string, string> = {
      phone: "#phone-modal",
      garage: "#garage-modal",
      customize: "#customize-modal",
      settings: "#settings-modal",
      help: "#help-modal",
      pause: "#pause-modal",
      shop: "#shop-modal",
    };
    const id = map[name];
    if (!id) return;
    this.closeChat();
    this.closeAllModalsExcept(id);
    this.currentModal = name;
    q(id)?.classList.remove("hidden");
    if (name === "garage") this.renderGarage();
    if (name === "customize") {
      this.renderCustomizeOptions();
      const input = q<HTMLInputElement>("#custom-name");
      if (input) input.value = this.profile.name;
    }
    if (name === "settings") this.renderSettings();
    if (name === "shop") this.renderShop();
    if (name === "phone") this.drawBigMap();
    document.body.classList.add("modal-open");
    this.callbacks.onModalOpen(name);
  }

  openPhone(tab = "missions") {
    this.openModal("phone");
    this.switchPhoneTab(tab);
  }

  switchPhoneTab(tab: string) {
    qa<HTMLElement>(".phone-app").forEach((el) => el.classList.toggle("active", el.dataset.phoneTab === tab));
    qa<HTMLElement>(".phone-tab").forEach((el) => el.classList.toggle("active", el.dataset.tabPanel === tab));
    if (tab === "map") this.drawBigMap();
    if (tab === "garage") this.renderPhoneGarage();
    if (tab === "missions") this.renderPhoneMissions();
    if (tab === "inventory") this.renderInventory();
  }

  closeModal() {
    if (!this.currentModal) return;
    const name = this.currentModal;
    this.closeAllModals();
    this.currentModal = null;
    document.body.classList.remove("modal-open");
    this.callbacks.onModalClose(name);
  }

  closeAllModals() {
    qa<HTMLElement>(".modal").forEach((el) => {
      if (el.id !== "confirm-modal") el.classList.add("hidden");
    });
    document.body.classList.remove("modal-open");
  }

  private closeAllModalsExcept(id: string) {
    qa<HTMLElement>(".modal").forEach((el) => {
      if (el.id !== id && el.id !== "confirm-modal") el.classList.add("hidden");
    });
  }

  addChatBubble(name: string, text: string, system = false) {
    const feed = q("#chat-feed");
    if (!feed) return;
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (system) {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = `<b>${escapeHtml(name)}</b> ${escapeHtml(text)}<span class="chat-time">${time}</span>`;
    }
    feed.appendChild(bubble);
    while (feed.children.length > 5) feed.firstElementChild?.remove();
    setTimeout(() => bubble.remove(), 15000);
    this.addChatLine(name, text, system);
  }

  addChatLine(name: string, text: string, system = false) {
    const lines = q("#chat-lines");
    if (!lines) return;
    const line = document.createElement("div");
    line.className = `chat-line${system ? " system" : ""}`;
    if (system) line.textContent = text;
    else line.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
    lines.appendChild(line);
    lines.scrollTop = lines.scrollHeight;
    while (lines.children.length > 40) lines.firstElementChild?.remove();
  }

  openChat() {
    this.closeModal();
    q("#chat-panel")?.classList.remove("hidden");
    this.chatOpen = true;
    setTimeout(() => q<HTMLInputElement>("#chat-input")?.focus(), 30);
  }

  closeChat() {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    q("#chat-panel")?.classList.add("hidden");
    q<HTMLInputElement>("#chat-input")?.blur();
  }

  isChatOpen() {
    return this.chatOpen;
  }

  toast(title: string, message = "", type: "good" | "bad" | "info" = "info", reward?: { money?: number; xp?: number }) {
    const stack = q("#toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = `toast ${type === "good" ? "good" : type === "bad" ? "bad" : ""}`;
    el.innerHTML = `<b>${escapeHtml(title)}</b>${message ? `<span>${escapeHtml(message)}</span>` : ""}${reward ? `<div class="toast-reward">${reward.money ? `<span>+ ${money(reward.money)}</span>` : ""}${reward.xp ? `<span>+ ${reward.xp} XP</span>` : ""}</div>` : ""}`;
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstElementChild?.remove();
    const timer = window.setTimeout(() => el.remove(), 4600);
    this.toastTimers.set(el, timer);
  }

  renderMissionCards(cards: MissionCardData[]) {
    this.missionCards = cards;
    this.renderPhoneMissions();
  }

  setActiveMission(id: string | null) {
    this.activeMissionId = id;
    this.renderPhoneMissions();
  }

  private renderPhoneMissions() {
    const list = q("#mission-list");
    if (!list) return;
    if (!this.missionCards.length) {
      list.innerHTML = `<div class="mission-card"><div class="mission-card-icon">!</div><div class="mission-card-copy"><b>Nenhuma missão disponível</b><small>Explore a cidade para encontrar trabalhos.</small></div></div>`;
      return;
    }
    list.innerHTML = this.missionCards
      .map(
        (m) => `<div class="mission-card">
          <div class="mission-card-icon">${escapeHtml(m.icon)}</div>
          <div class="mission-card-copy"><b>${escapeHtml(m.title)}${m.active ? " · EM ANDAMENTO" : ""}</b><small>${escapeHtml(m.description)} · ${m.distance > 999 ? (m.distance / 1000).toFixed(1) + " km" : Math.round(m.distance) + " m"} · ${escapeHtml(m.duration)}</small></div>
          <div class="mission-card-reward">${money(m.reward)}<br /><span style="opacity:.55">${m.xp} XP</span></div>
          <button data-track-mission="${escapeHtml(m.id)}">${m.active ? "VER" : "IR"}</button>
        </div>`,
      )
      .join("");
    q("#btn-call-vehicle")?.classList.toggle("hidden", false);
  }

  renderGarage() {
    const active = getVehicle(this.profile.activeVehicle);
    const set = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };
    set("#garage-active-name", active.name);
    set("#garage-active-desc", active.desc);
    set("#garage-money", money(this.profile.money));
    const preview = q<HTMLElement>("#garage-car-preview");
    if (preview) preview.style.setProperty("--paint", this.profile.paint);
    const owned = this.profile.ownedVehicles.length;
    set("#garage-owned-count", `${owned}/${8}`);
    const list = q("#garage-list");
    if (list) {
      list.innerHTML = VEHICLE_LIST.map((v) => {
        const isOwned = this.profile.ownedVehicles.includes(v.id);
        const isActive = v.id === this.profile.activeVehicle;
        const canBuy = this.profile.money >= v.price && levelForXp(this.profile.xp) >= v.level;
        return `<button class="garage-item ${isActive ? "active" : ""} ${isOwned ? "" : "locked"}" data-vehicle-id="${v.id}">
          <span class="garage-item-swatch"><span class="mini-car" style="--paint:${isActive ? this.profile.paint : v.color}"></span></span>
          <span class="garage-item-copy"><b>${escapeHtml(v.name)}</b><small>${v.kind.toUpperCase()} · nível ${v.level} · ${v.maxSpeed * 3.6 | 0} km/h máx.</small></span>
          ${isOwned ? `<span class="garage-item-state">${isActive ? "EM USO" : "USAR"}</span>` : `<span class="garage-item-price">${money(v.price)}</span>`}
        </button>`;
      }).join("");
    }
    const upg = this.profile.upgrades[this.profile.activeVehicle] ?? { engine: 0, turbo: 0, tires: 0 };
    const kinds = ["engine", "turbo", "tires"] as const;
    for (const kind of kinds) {
      const pips = q(`[data-upgrade="${kind}"]`);
      if (pips) {
        const level = upg[kind];
        pips.innerHTML = [0, 1, 2, 3].map((i) => `<i class="${i < level ? "on" : ""}"></i>`).join("");
      }
      const btn = q(`[data-upgrade-buy="${kind}"]`);
      if (btn) {
        const level = upg[kind];
        btn.textContent = level >= 3 ? "MÁXIMO" : `R$ ${upgradeCost(kind, level)}`;
        (btn as HTMLButtonElement).disabled = level >= 3 || this.profile.money < upgradeCost(kind, level);
      }
    }
    const paints = q("#paint-swatches");
    if (paints) {
      paints.innerHTML = PAINT_COLORS.map((c) => `<button class="swatch ${this.profile.paint === c ? "active" : ""}" style="background:${c}" data-paint="${c}" aria-label="Pintura ${c}"></button>`).join("");
    }
  }

  private renderPhoneGarage() {
    const list = q("#phone-garage-list");
    if (!list) return;
    list.innerHTML = this.profile.ownedVehicles
      .map((id) => {
        const v = getVehicle(id);
        const active = id === this.profile.activeVehicle;
        return `<div class="phone-car-item"><span class="mini-car" style="--paint:${active ? this.profile.paint : v.color}"></span><div><b>${escapeHtml(v.name)}</b><small>${v.kind.toUpperCase()}</small></div><span>${active ? "EM USO" : "GUARDADO"}</span></div>`;
      })
      .join("");
  }

  private renderCustomizeOptions() {
    const build = (sel: string, key: "skin" | "shirt" | "pants" | "hair", colors: string[]) => {
      const el = q(sel);
      if (!el) return;
      el.innerHTML = colors
        .map((c) => `<button class="swatch ${this.profile[key] === c ? "active" : ""}" style="background:${c}" data-color="${c}" data-key="${key}" aria-label="${key}"></button>`)
        .join("");
    };
    build("#skin-swatches", "skin", SKIN_TONES);
    build("#shirt-swatches", "shirt", SHIRT_COLORS);
    build("#pants-swatches", "pants", PANTS_COLORS);
    build("#hair-swatches", "hair", HAIR_COLORS);
  }

  private renderSettings() {
    const s = this.profile.settings;
    this.setQualityActive(s.quality);
    const setValue = (sel: string, value: string) => {
      const el = q<HTMLInputElement>(sel);
      if (el) el.value = value;
    };
    setValue("#setting-master", String(Math.round(s.masterVolume * 100)));
    setValue("#setting-music", String(Math.round(s.musicVolume * 100)));
    setValue("#setting-sens", String(Math.round(s.sensitivity * 100)));
    const labels: Array<[string, string]> = [
      ["#master-value", `${Math.round(s.masterVolume * 100)}%`],
      ["#music-value", `${Math.round(s.musicVolume * 100)}%`],
      ["#sens-value", `${Math.round(s.sensitivity * 100)}%`],
    ];
    for (const [sel, text] of labels) {
      const el = q(sel);
      if (el) el.textContent = text;
    }
    q("#setting-online")?.classList.toggle("active", s.online);
    q("#setting-offline")?.classList.toggle("active", !s.online);
    const fps = q<HTMLInputElement>("#setting-fps");
    if (fps) fps.checked = s.showFps;
    const shake = q<HTMLInputElement>("#setting-shake");
    if (shake) shake.checked = s.cameraShake;
  }

  private setQualityActive(quality: string) {
    qa<HTMLElement>("[data-quality]").forEach((el) => el.classList.toggle("active", el.dataset.quality === quality));
  }

  setFullscreenLabel(active: boolean) {
    const btn = q("#btn-fullscreen");
    if (btn) btn.textContent = active ? "SAIR DA TELA CHEIA" : "TELA CHEIA";
  }

  setVitals(hp: number, maxHp: number, hunger: number, maxHunger: number) {
    // Fome e vida mudam devagar: so escreve no DOM quando o valor muda de fato.
    const hpPct = Math.round(Math.max(0, Math.min(1, hp / Math.max(1, maxHp))) * 100);
    if (hpPct !== this.lastHpPct) {
      this.lastHpPct = hpPct;
      const hpBar = this.node("#hud-hp-bar");
      if (hpBar) hpBar.style.width = `${hpPct}%`;
    }
    const hungerPct = Math.round(Math.max(0, Math.min(1, hunger / Math.max(1, maxHunger))) * 100);
    if (hungerPct !== this.lastHungerPct) {
      this.lastHungerPct = hungerPct;
      const hungerBar = this.node("#hud-hunger-bar");
      if (hungerBar) hungerBar.style.width = `${hungerPct}%`;
    }
  }

  flashDamage() {
    const el = q("#damage-flash");
    if (!el) return;
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
  }

  showDeath(reason: string) {
    this.setText("#death-reason", reason);
    q("#death-overlay")?.classList.remove("hidden");
    this.updateDeath(30);
  }

  updateDeath(seconds: number) {
    this.setText("#death-timer", String(Math.max(0, Math.ceil(seconds))));
  }

  hideDeath() {
    q("#death-overlay")?.classList.add("hidden");
  }

  openShop(commerce: CommerceSpec) {
    this.shopCommerce = commerce;
    this.shopHouse = null;
    this.shopMode = commerce.kind === "bank" ? "bank" : "commerce";
    this.shopTab =
      commerce.kind === "clothes"
        ? "clothes"
        : commerce.kind === "pharmacy"
          ? "medicine"
          : commerce.kind === "hardware"
            ? "material"
            : "food";
    this.openModal("shop");
  }

  openHouse(house: HouseSpec) {
    this.shopCommerce = null;
    this.shopHouse = house;
    this.shopMode = "house";
    this.openModal("shop");
  }

  openWardrobe() {
    this.shopCommerce = null;
    this.shopHouse = null;
    this.shopMode = "wardrobe";
    this.openModal("shop");
  }

  refreshShop() {
    if (this.currentModal === "shop") this.renderShop();
  }

  private renderShop() {
    const commerce = this.shopCommerce;
    const house = this.shopHouse;
    const balance = money(this.profile.money);
    this.setText("#shop-money", balance);
    const tabs = q("#shop-tabs");
    const body = q("#shop-items");
    if (!body) return;

    if (this.shopMode === "wardrobe") {
      tabs?.classList.add("hidden");
      this.setText("#shop-kind", "GUARDA-ROUPA");
      this.setText("#shop-name", "Suas roupas");
      this.setText("#shop-desc", "Troque de roupa para qualquer ocasião.");
      const owned = CLOTHES.filter((item) => this.profile.ownedClothes.includes(item.id));
      body.innerHTML = owned.length
        ? owned
            .map(
              (item) => `
        <div class="shop-item">
          <div class="shop-item-icon swatch-icon" style="background:${item.color}"></div>
          <div class="shop-item-copy">
            <b>${escapeHtml(item.name)}</b>
            <small>${escapeHtml(item.desc)}</small>
            <span>${item.slot === "shirt" ? "Camisa" : "Calça"}</span>
          </div>
          <div class="shop-item-side">
            <b>Guardada</b>
            <button class="shop-buy owned" data-equip-clothes="${item.id}" type="button">VESTIR</button>
          </div>
        </div>`,
            )
            .join("")
        : `<div class="shop-empty">Você ainda não tem roupas. Compre na loja de roupas do Centro.</div>`;
      return;
    }

    if (this.shopMode === "house" && house) {
      this.setText("#shop-kind", "IMOBILIÁRIA");
      this.setText("#shop-name", house.name);
      this.setText("#shop-desc", house.desc);
      tabs?.classList.add("hidden");
      const owned = this.profile.ownedHouses.includes(house.id);
      const active = this.profile.houseId === house.id;
      body.innerHTML = `
          <div class="shop-house-card" style="--house-color:${house.color}">
            <div class="house-art"><span></span><i></i><b></b></div>
            <div class="house-copy">
              <small>${active ? "SUA CASA ATUAL" : owned ? "JÁ É SUA" : "À VENDA"}</small>
              <h3>${escapeHtml(house.name)}</h3>
              <p>${escapeHtml(house.desc)}</p>
              <div class="house-meta">${DISTRICT_LABEL[house.district]} · ${house.rooms} cômodo(s) · ${house.beds} cama(s)</div>
              <div class="house-price">${owned ? "Comprada" : money(house.price)}</div>
            </div>
          </div>
          <div class="shop-item-actions">
            ${
              owned
                ? `<button class="shop-buy owned" data-rest-home type="button">DESCANSAR E RECUPERAR</button>${active ? "" : `<button class="shop-buy alt" data-go-home type="button">MORAR AQUI</button>`}<button class="shop-buy alt danger" data-sell-house="${house.id}" type="button">VENDER POR ${money(houseSellPrice(house))}</button>`
                : `<button class="shop-buy" data-buy-house="${house.id}" type="button">COMPRAR CASA</button>`
            }
          </div>`;
      return;
    }

    if (this.shopMode === "bank") {
      this.setText("#shop-kind", "BANCO E IMOBILIÁRIA");
      this.setText("#shop-name", "Carteira de imóveis");
      this.setText("#shop-desc", "Compre, administre e venda seus imóveis na cidade.");
      tabs?.classList.add("hidden");
      body.innerHTML = HOUSES.map((item) => {
        const owned = this.profile.ownedHouses.includes(item.id);
        const active = this.profile.houseId === item.id;
        return `
          <div class="shop-item bank-row" style="--house-color:${item.color}">
            <div class="shop-item-icon swatch-icon" style="background:${item.color}"></div>
            <div class="shop-item-copy">
              <b>${escapeHtml(item.name)}</b>
              <small>${DISTRICT_LABEL[item.district]} · ${item.rooms} cômodo(s) · ${item.beds} cama(s)</small>
              <span>${owned ? (active ? "Sua casa atual" : "Você é o dono") : "À venda"}</span>
            </div>
            <div class="shop-item-side">
              <b>${owned ? money(houseSellPrice(item)) : money(item.price)}</b>
              ${
                owned
                  ? `<button class="shop-buy owned" data-sell-house="${item.id}" type="button">VENDER</button>`
                  : `<button class="shop-buy" data-buy-house="${item.id}" type="button">COMPRAR</button>`
              }
            </div>
          </div>`;
      }).join("");
      return;
    }

    if (!commerce) return;
    this.setText("#shop-kind", SHOP_KIND_LABEL[commerce.kind]);
    this.setText("#shop-name", commerce.name);
    this.setText("#shop-desc", commerce.desc);
    tabs?.classList.remove("hidden");
    const allowed: Record<string, string[]> = {
      food: ["food"],
      clothes: ["clothes"],
      pharmacy: ["medicine"],
      hardware: ["material"],
      mixed: ["food", "clothes", "medicine", "material"],
      bank: [],
    };
    const allowedTabs = allowed[commerce.kind] ?? ["food"];
    qa<HTMLElement>("[data-shop-tab]").forEach((tab) => {
      const kind = tab.dataset.shopTab;
      tab.classList.toggle("hidden", !kind || !allowedTabs.includes(kind));
      tab.classList.toggle("active", kind === this.shopTab);
      tab.classList.toggle("disabled", Boolean(kind) && !allowedTabs.includes(kind!));
    });
    if (!allowedTabs.includes(this.shopTab)) this.shopTab = allowedTabs[0] as "food" | "clothes" | "medicine" | "material";

    if (this.shopTab === "food") {
      body.innerHTML = FOODS.map(
        (item) => `
        <div class="shop-item">
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-copy">
            <b>${escapeHtml(item.name)}</b>
            <small>${escapeHtml(item.desc)}</small>
            <span>+${item.hunger} fome${item.heal ? ` · +${item.heal} vida` : ""}</span>
          </div>
          <div class="shop-item-side">
            <b>${money(item.price)}</b>
            <button class="shop-buy" data-buy-food="${item.id}" type="button">COMPRAR</button>
          </div>
        </div>`,
      ).join("");
    } else if (this.shopTab === "medicine") {
      body.innerHTML = MEDICINES.map(
        (item) => `
        <div class="shop-item">
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-copy">
            <b>${escapeHtml(item.name)}</b>
            <small>${escapeHtml(item.desc)}</small>
            <span>+${item.heal} vida${item.hunger ? ` · +${item.hunger} fome` : ""}</span>
          </div>
          <div class="shop-item-side">
            <b>${money(item.price)}</b>
            <button class="shop-buy" data-buy-medicine="${item.id}" type="button">COMPRAR</button>
          </div>
        </div>`,
      ).join("");
    } else if (this.shopTab === "material") {
      body.innerHTML = MATERIALS.map(
        (item) => `
        <div class="shop-item">
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-copy">
            <b>${escapeHtml(item.name)}</b>
            <small>${escapeHtml(item.desc)}</small>
            <span>${item.kind === "engine" ? "Motor" : item.kind === "turbo" ? "Turbo" : item.kind === "tires" ? "Pneus" : "Pintura"}</span>
          </div>
          <div class="shop-item-side">
            <b>${money(item.price)}</b>
            <button class="shop-buy" data-buy-material="${item.id}" type="button">COMPRAR</button>
          </div>
        </div>`,
      ).join("");
    } else {
      body.innerHTML = CLOTHES.map((item) => {
        const owned = this.profile.ownedClothes.includes(item.id);
        return `
        <div class="shop-item">
          <div class="shop-item-icon swatch-icon" style="background:${item.color}"></div>
          <div class="shop-item-copy">
            <b>${escapeHtml(item.name)}</b>
            <small>${escapeHtml(item.desc)}</small>
            <span>${item.slot === "shirt" ? "Camisa" : "Calça"}</span>
          </div>
          <div class="shop-item-side">
            <b>${owned ? "Comprada" : money(item.price)}</b>
            <button class="shop-buy ${owned ? "owned" : ""}" data-${owned ? "equip-clothes" : "buy-clothes"}="${item.id}" type="button">${owned ? "USAR" : "COMPRAR"}</button>
          </div>
        </div>`;
      }).join("");
    }
  }

  renderInventory() {
    const inventory = this.profile.inventory ?? [];
    const list = q("#phone-inventory-list");
    if (list) {
      list.innerHTML = inventory.length
        ? inventory.map((item) => {
            const spec = getConsumable(item.id);
            const name = item.name ?? spec?.name ?? item.id;
            const heal = item.heal ?? spec?.heal ?? 0;
            const hunger = item.hunger ?? spec?.hunger ?? 0;
            return `<div class="phone-list-row">
              <div class="phone-list-icon">${spec?.icon ?? "?"}</div>
              <div class="phone-list-copy"><b>${escapeHtml(name)}</b><small>${hunger ? `+${hunger} fome` : ""}${heal ? ` · +${heal} vida` : ""}</small></div>
              <span class="phone-list-count">x${item.count}</span>
              <button class="phone-list-btn" data-use-item="${item.id}" type="button">USAR</button>
            </div>`;
          }).join("")
        : `<div class="phone-empty">Sua mochila está vazia. Compre comida e remédios nos comércios.</div>`;
    }
    const clothesList = q("#phone-clothes-list");
    if (clothesList) {
      const owned = this.profile.ownedClothes;
      clothesList.innerHTML = owned.length
        ? owned.map((id) => {
            const spec = getClothes(id);
            if (!spec) return "";
            return `<div class="phone-list-row">
              <div class="phone-list-icon swatch-icon" style="background:${spec.color}"></div>
              <div class="phone-list-copy"><b>${escapeHtml(spec.name)}</b><small>${spec.slot === "shirt" ? "Camisa" : "Calça"}</small></div>
              <button class="phone-list-btn" data-equip-clothes="${id}" type="button">VESTIR</button>
            </div>`;
          }).join("")
        : `<div class="phone-empty">Nenhuma roupa comprada. Visite a loja Estilo Carioca.</div>`;
    }
    const houseList = q("#phone-house-list");
    if (houseList) {
      houseList.innerHTML = HOUSES.map((house) => {
        const owned = this.profile.ownedHouses.includes(house.id);
        const active = this.profile.houseId === house.id;
        return `<div class="phone-list-row house-row">
          <div class="phone-list-icon house-icon" style="background:${house.color}"></div>
          <div class="phone-list-copy"><b>${escapeHtml(house.name)}</b><small>${active ? "Sua casa atual" : owned ? "Comprada" : money(house.price)}</small></div>
          ${owned
            ? `<button class="phone-list-btn" data-${active ? "rest-home" : "buy-house"}="${house.id}" type="button">${active ? "DESCANSAR" : "MORAR"}</button><button class="phone-list-btn" data-sell-house="${house.id}" type="button">VENDER</button>`
            : `<button class="phone-list-btn" data-buy-house="${house.id}" type="button">COMPRAR</button>`}
        </div>`;
      }).join("");
    }
  }

  setWeatherLabel(label: string) {
    const el = q("#hud-weather");
    if (el) el.textContent = label;
  }

  async confirm(title: string, text: string) {
    const modal = q("#confirm-modal");
    const t = q("#confirm-title");
    const p = q("#confirm-text");
    if (t) t.textContent = title;
    if (p) p.textContent = text;
    modal?.classList.remove("hidden");
    return new Promise<boolean>((resolve) => {
      this.confirmResolver = resolve;
    });
  }

  private resolveConfirm(value: boolean) {
    q("#confirm-modal")?.classList.add("hidden");
    this.confirmResolver?.(value);
    this.confirmResolver = undefined;
  }

  isModalOpen() {
    return this.currentModal !== null;
  }

  getLoadingValue() {
    return this.loadingValue;
  }

  setInstallAvailable(fn: (() => void) | null) {
    this.installPrompt = fn;
    q("#btn-install")?.classList.toggle("hidden", !fn);
  }

  fireInstall() {
    this.installPrompt?.();
  }

  setPhoneTab(tab: string) {
    this.switchPhoneTab(tab);
  }

  setActiveVehiclePreview(color: string) {
    const preview = q<HTMLElement>("#garage-car-preview");
    if (preview) preview.style.setProperty("--paint", color);
  }
}

const VEHICLE_LIST = [
  { id: "pop", name: "Fubiquinha", kind: "car", price: 0, level: 1, maxSpeed: 26, color: "#f2c84b" },
  { id: "moto", name: "Vento 150", kind: "moto", price: 1250, level: 1, maxSpeed: 31, color: "#e94f37" },
  { id: "sedan", name: "Maré Sedan", kind: "car", price: 2400, level: 2, maxSpeed: 32, color: "#e8eef2" },
  { id: "van", name: "Kombi do Rolê", kind: "van", price: 3900, level: 3, maxSpeed: 27, color: "#71c6b8" },
  { id: "taxi", name: "Amarelinho", kind: "taxi", price: 4800, level: 4, maxSpeed: 30, color: "#f6c431" },
  { id: "suv", name: "Serra 4x4", kind: "suv", price: 6200, level: 5, maxSpeed: 34, color: "#37554d" },
  { id: "sport", name: "Carioca GT", kind: "sport", price: 11000, level: 7, maxSpeed: 43, color: "#e23b3b" },
  { id: "police", name: "Viatura 190", kind: "police", price: 0, level: 99, maxSpeed: 36, color: "#f2f4f5" },
];
