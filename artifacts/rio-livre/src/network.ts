import * as THREE from "three";
import { GAME_VERSION, getVehicle } from "./config";
import { CharacterModel } from "./character";
import type { PlayerProfile } from "./profile";
import { defaultServerUrl, isWrappedApp } from "./profile";
import { buildVehicleVisual, type VehicleVisual } from "./vehicles";
import { angleLerp, damp } from "./util";

export interface RemotePlayerData {
  id: string;
  name: string;
  x: number;
  z: number;
  ry: number;
  vehicle: string | null;
  paint: string;
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  level: number;
  speed?: number;
}

export interface NetworkHandlers {
  onStatus: (status: "connecting" | "online" | "offline", detail?: string) => void;
  onCount: (count: number) => void;
  onWelcome: (players: RemotePlayerData[]) => void;
  onPlayerUpdate: (player: RemotePlayerData) => void;
  onPlayerLeave: (id: string) => void;
  onChat: (name: string, text: string, system?: boolean) => void;
}

export const normalizeServer = (raw: string) => {
  let url = raw.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
};

export const getServerBase = (profile: PlayerProfile) => {
  if (!profile.settings.online) return "";
  const configured = normalizeServer(defaultServerUrl());
  if (configured) return configured;
  if (isWrappedApp()) return "";
  if (location.protocol === "http:" || location.protocol === "https:") return location.origin;
  return "";
};

export class NetworkClient {
  handlers: NetworkHandlers;
  status: "connecting" | "online" | "offline" = "offline";
  onlineCount = 0;
  base = "";
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private heartbeatTimer?: number;
  private reconnectAttempts = 0;
  private manualClose = false;
  private lastState = 0;
  private profile?: PlayerProfile;

  constructor(handlers: NetworkHandlers) {
    this.handlers = handlers;
  }

  connect(profile: PlayerProfile) {
    this.profile = profile;
    this.manualClose = false;
    const base = getServerBase(profile);
    this.base = base;
    if (!base) {
      this.setStatus("offline", "Modo solo");
      return;
    }
    this.closeSocket();
    this.setStatus("connecting", "Entrando na cidade...");
    let wsBase = base;
    if (/^https:/i.test(wsBase)) wsBase = "wss" + wsBase.slice(5);
    else if (/^http:/i.test(wsBase)) wsBase = "ws" + wsBase.slice(4);
    try {
      const socket = new WebSocket(`${wsBase}/ws`);
      this.socket = socket;
      socket.addEventListener("open", () => {
        this.reconnectAttempts = 0;
        this.setStatus("online", "Conectado");
        this.send({
          type: "join",
          name: profile.name,
          x: profile.lastPosition.x,
          z: profile.lastPosition.z,
          ry: profile.lastPosition.ry,
          skin: profile.skin,
          shirt: profile.shirt,
          pants: profile.pants,
          hair: profile.hair,
          activeVehicle: profile.activeVehicle,
          paint: profile.paint,
          level: Math.max(1, Math.floor(profile.xp / 500) + 1),
          money: profile.money,
          version: GAME_VERSION,
        });
        this.startHeartbeat();
      });
      socket.addEventListener("message", (event) => this.handleMessage(event.data));
      socket.addEventListener("close", () => {
        this.stopHeartbeat();
        if (this.manualClose) return;
        this.setStatus("offline", "Conexão caiu · tentando de novo");
        this.scheduleReconnect();
      });
      socket.addEventListener("error", () => {
        if (this.status !== "online") this.setStatus("offline", "Servidor indisponível · modo solo");
      });
    } catch {
      this.setStatus("offline", "Servidor indisponível · modo solo");
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.manualClose = true;
    this.clearReconnect();
    this.stopHeartbeat();
    this.closeSocket();
    this.setStatus("offline", "Modo solo");
  }

  private closeSocket() {
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      try {
        socket.close();
      } catch {
        return;
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: "ping", t: Date.now() });
    }, 20000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect() {
    this.clearReconnect();
    if (this.manualClose) return;
    const delay = Math.min(15000, 1200 * Math.pow(1.5, this.reconnectAttempts++));
    this.reconnectTimer = window.setTimeout(() => {
      if (this.profile && !this.manualClose) this.connect(this.profile);
    }, delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private setStatus(status: "connecting" | "online" | "offline", detail?: string) {
    this.status = status;
    this.handlers.onStatus(status, detail);
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string" || raw.length > 50000) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const type = msg.type;
    if (type === "welcome") {
      const players = Array.isArray(msg.players) ? (msg.players as RemotePlayerData[]) : [];
      this.onlineCount = Number(msg.online ?? players.length + 1);
      this.handlers.onCount(this.onlineCount);
      this.handlers.onWelcome(players);
      this.handlers.onChat("Sistema", "Você entrou na cidade. Boa sorte no rolê.", true);
    } else if (type === "update" && msg.player && typeof msg.player === "object") {
      this.handlers.onPlayerUpdate(msg.player as RemotePlayerData);
    } else if (type === "leave" && typeof msg.id === "string") {
      this.handlers.onPlayerLeave(msg.id);
    } else if (type === "count") {
      this.onlineCount = Number(msg.online ?? 0);
      this.handlers.onCount(this.onlineCount);
    } else if (type === "chat" && typeof msg.text === "string") {
      const name = typeof msg.name === "string" ? msg.name : "Carioca";
      this.handlers.onChat(name, msg.text.slice(0, 140));
    } else if (type === "system" && typeof msg.text === "string") {
      this.handlers.onChat("Sistema", msg.text.slice(0, 200), true);
    }
  }

  sendState(x: number, z: number, ry: number, vehicle: string | null, speed: number) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - this.lastState < 85) return;
    this.lastState = now;
    this.send({ type: "state", x, z, ry, vehicle, speed });
  }

  sendChat(text: string) {
    this.send({ type: "chat", text: text.slice(0, 140) });
  }

  updateIdentity(profile: PlayerProfile) {
    this.send({
      type: "identity",
      name: profile.name,
      skin: profile.skin,
      shirt: profile.shirt,
      pants: profile.pants,
      hair: profile.hair,
      activeVehicle: profile.activeVehicle,
      paint: profile.paint,
    });
  }

  private send(payload: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(payload));
      } catch {
        return;
      }
    }
  }

  async fetchStatus(): Promise<{ online: number; uptime: number } | null> {
    if (!this.base) return null;
    try {
      const res = await fetch(`${this.base}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { online?: number; uptime?: number };
      return { online: Number(data.online ?? 0), uptime: Number(data.uptime ?? 0) };
    } catch {
      return null;
    }
  }
}

interface RemoteAvatar {
  data: RemotePlayerData;
  character: CharacterModel;
  car?: THREE.Group;
  carVisual?: VehicleVisual;
  carId?: string;
  target: THREE.Vector3;
  targetRy: number;
  speed: number;
}

export class RemotePlayers {
  scene: THREE.Scene;
  avatars = new Map<string, RemoteAvatar>();
  count = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  add(data: RemotePlayerData) {
    if (this.avatars.has(data.id)) return;
    const character = new CharacterModel(data.skin, data.shirt, data.pants, data.hair, data.name, { tattoos: true, model: true });
    character.group.position.set(data.x, 0, data.z);
    character.group.rotation.y = data.ry;
    this.scene.add(character.group);
    const avatar: RemoteAvatar = {
      data,
      character,
      target: new THREE.Vector3(data.x, 0, data.z),
      targetRy: data.ry,
      speed: 0,
    };
    this.avatars.set(data.id, avatar);
    this.updateVehicle(avatar, data);
    this.count = this.avatars.size;
  }

  update(data: RemotePlayerData) {
    let avatar = this.avatars.get(data.id);
    if (!avatar) {
      this.add(data);
      avatar = this.avatars.get(data.id);
      if (!avatar) return;
    }
    const prev = avatar.data;
    if (prev.name !== data.name) avatar.character.setName(data.name);
    if (prev.skin !== data.skin || prev.shirt !== data.shirt || prev.pants !== data.pants || prev.hair !== data.hair) {
      avatar.character.setColors({ skin: data.skin, shirt: data.shirt, pants: data.pants, hair: data.hair });
    }
    const dx = data.x - prev.x;
    const dz = data.z - prev.z;
    const dt = Math.max(0.05, 0.1);
    const speed = Math.min(50, Math.hypot(dx, dz) / dt);
    avatar.speed = speed;
    avatar.target.set(data.x, 0, data.z);
    avatar.targetRy = data.ry;
    avatar.data = data;
    this.updateVehicle(avatar, data);
  }

  private updateVehicle(avatar: RemoteAvatar, data: RemotePlayerData) {
    if (data.vehicle) {
      if (avatar.carId !== data.vehicle) {
        if (avatar.car) avatar.car.removeFromParent();
        const spec = getVehicle(data.vehicle);
        avatar.carVisual = buildVehicleVisual(spec, data.paint || spec.color);
        avatar.car = avatar.carVisual.group;
        avatar.carId = data.vehicle;
        this.scene.add(avatar.car);
      }
      if (avatar.carVisual) {
        avatar.carVisual.group.visible = true;
        avatar.character.setVisible(false);
        const material = avatar.carVisual.group.children[0] as THREE.Mesh | undefined;
        if (material && material.material instanceof THREE.MeshStandardMaterial) {
          material.material.color.set(data.paint || avatar.data.paint || "#f6c945");
        }
      }
    } else {
      if (avatar.car) avatar.car.visible = false;
      avatar.character.setVisible(true);
    }
  }

  remove(id: string) {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    avatar.character.group.removeFromParent();
    avatar.character.dispose();
    if (avatar.car) avatar.car.removeFromParent();
    this.avatars.delete(id);
    this.count = this.avatars.size;
  }

  clear() {
    for (const id of Array.from(this.avatars.keys())) this.remove(id);
  }

  updateAll(dt: number) {
    for (const avatar of this.avatars.values()) {
      const group = avatar.data.vehicle && avatar.car ? avatar.car : avatar.character.group;
      group.position.x = damp(group.position.x, avatar.target.x, 8, dt);
      group.position.z = damp(group.position.z, avatar.target.z, 8, dt);
      group.rotation.y = angleLerp(group.rotation.y, avatar.targetRy, Math.min(1, dt * 9));
      if (avatar.data.vehicle && avatar.car) {
        if (avatar.carVisual) {
          avatar.carVisual.wheels.forEach((w) => (w.rotation.x += avatar.speed * dt * 2));
        }
      } else {
        avatar.character.update(dt, avatar.speed);
      }
    }
  }

  getDots() {
    return Array.from(this.avatars.values()).map((a) => ({ x: a.target.x, z: a.target.z }));
  }

  getNames() {
    return Array.from(this.avatars.values()).map((a) => a.data.name);
  }
}
