import * as THREE from "three";
import { commerceDoor } from "./config";
import { makeBillboardTexture } from "./textures";
import { dist2, money } from "./util";
import type { World } from "./world";
import type { MissionCardData, HudMission, MapMarker } from "./ui";

export type MissionKind = "taxi" | "delivery" | "race" | "escape" | "beach" | "job";

export interface MissionDef {
  id: string;
  kind: MissionKind;
  title: string;
  description: string;
  icon: string;
  color: string;
  start: { x: number; z: number };
  target?: { x: number; z: number };
  checkpoints?: { x: number; z: number }[];
  pickups?: { x: number; z: number }[];
  reward: number;
  xp: number;
  time: number;
  duration: string;
  requiresVehicle?: boolean;
  repeatable?: boolean;
}

export interface MissionRuntime extends MissionDef {
  status: "available" | "active" | "done";
  marker: MissionMarker;
  waypointMarkers: MissionMarker[];
  collected: Set<number>;
  timer: number;
  checkpoint: number;
  cooldown: number;
}

export interface MissionEvent {
  type: "started" | "completed" | "failed" | "pickup" | "checkpoint";
  mission?: MissionRuntime;
  reward?: number;
  xp?: number;
  text?: string;
}

export class MissionMarker {
  group = new THREE.Group();
  ring: THREE.Mesh;
  beam: THREE.Mesh;
  sprite: THREE.Sprite;
  color: string;
  private phase = Math.random() * 10;

  constructor(scene: THREE.Scene, color: string, icon: string, label = "") {
    this.color = color;
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.85, 32), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.group.add(this.ring);

    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.6, 13, 10, 1, true), beamMat);
    this.beam.position.y = 6.5;
    this.group.add(this.beam);

    const tex = makeBillboardTexture(icon, color, label);
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true }),
    );
    this.sprite.position.y = 5.2;
    this.sprite.scale.set(3.1, 3.1, 1);
    this.group.add(this.sprite);
    scene.add(this.group);
  }

  setPosition(x: number, z: number) {
    this.group.position.set(x, 0, z);
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  update(dt: number, time: number) {
    this.phase += dt;
    this.ring.rotation.z += dt * 0.6;
    const s = 1 + Math.sin(this.phase * 2) * 0.09;
    this.ring.scale.setScalar(s);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(this.phase * 2.2) * 0.18;
    this.sprite.position.y = 5.2 + Math.sin(this.phase * 1.8) * 0.22;
    this.beam.rotation.y += dt * 0.35;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
      if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
  }
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => dist2(a.x, a.z, b.x, b.z);

export class MissionManager {
  scene: THREE.Scene;
  world: World;
  missions: MissionRuntime[] = [];
  active: MissionRuntime | null = null;
  wanted = 0;
  trackedId: string | null = null;
  onEvent?: (event: MissionEvent) => void;
  private completedCount = 0;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    this.createMissions();
  }

  private createMissions() {
    const raw: MissionDef[] = [
      {
        id: "taxi",
        kind: "taxi",
        title: "Ponto do Taxi",
        description: "Leve a passageira até a Zona Sul",
        icon: "T",
        color: "#ffd166",
        start: { x: -62, z: 58 },
        target: { x: 112, z: -116 },
        reward: 480,
        xp: 110,
        time: 145,
        duration: "2 min",
      },
      {
        id: "delivery",
        kind: "delivery",
        title: "Entrega Expressa",
        description: "Um pacote precisa chegar inteiro",
        icon: "E",
        color: "#17b890",
        start: { x: 26, z: -62 },
        target: { x: -125, z: 92 },
        reward: 390,
        xp: 95,
        time: 150,
        duration: "2 min",
      },
      {
        id: "race",
        kind: "race",
        title: "Corrida na Orla",
        description: "Cinco checkpoints contra o relógio",
        icon: "C",
        color: "#ff6b35",
        start: { x: 152, z: 72 },
        target: { x: 152, z: 72 },
        checkpoints: [
          { x: 152, z: 15 },
          { x: 150, z: -95 },
          { x: 98, z: -144 },
          { x: -50, z: -144 },
          { x: -96, z: -48 },
        ],
        reward: 950,
        xp: 230,
        time: 95,
        duration: "1 min 35",
        requiresVehicle: true,
      },
      {
        id: "escape",
        kind: "escape",
        title: "Fuga no Morro",
        description: "Despiste a polícia e aguente 45 segundos",
        icon: "F",
        color: "#f25f5c",
        start: { x: -150, z: 112 },
        reward: 720,
        xp: 190,
        time: 45,
        duration: "45 s",
      },
      {
        id: "bico",
        kind: "job",
        title: "Bico no Bairro",
        description: "Entregue encomendas do Empório para os comércios da cidade",
        icon: "B",
        color: "#8f7ae5",
        start: { x: -120, z: -90 },
        target: { x: -120, z: -90 },
        reward: 320,
        xp: 70,
        time: 120,
        duration: "2 min",
        repeatable: true,
      },
      {
        id: "beach",
        kind: "beach",
        title: "Limpeza da Praia",
        description: "Recolha 5 sacos espalhados na areia",
        icon: "P",
        color: "#5fd6c4",
        start: { x: 188, z: -22 },
        pickups: [
          { x: 196, z: -55 },
          { x: 206, z: -5 },
          { x: 214, z: 44 },
          { x: 201, z: 102 },
          { x: 208, z: 158 },
        ],
        reward: 340,
        xp: 85,
        time: 115,
        duration: "1 min 55",
      },
    ];
    for (const def of raw) {
      const spot = this.world.findFreeSpot(def.start.x, def.start.z, 1.2);
      const start = { x: spot.x, z: spot.z };
      const marker = new MissionMarker(this.scene, def.color, def.icon, def.kind === "race" ? "corrida" : def.kind === "beach" ? "praia" : "missão");
      marker.setPosition(start.x, start.z);
      const waypointMarkers: MissionMarker[] = [];
      if (def.target) {
        const targetSpot = this.world.findFreeSpot(def.target.x, def.target.z, 1.2);
        def.target = targetSpot;
        const targetMarker = new MissionMarker(this.scene, def.color, "D", "destino");
        targetMarker.setPosition(targetSpot.x, targetSpot.z);
        targetMarker.setVisible(false);
        waypointMarkers.push(targetMarker);
      }
      if (def.checkpoints) {
        def.checkpoints = def.checkpoints.map((p, i) => {
          const pt = this.world.findFreeSpot(p.x, p.z, 1.2);
          const cpMarker = new MissionMarker(this.scene, def.color, String(i + 1), "checkpoint");
          cpMarker.setPosition(pt.x, pt.z);
          cpMarker.setVisible(false);
          waypointMarkers.push(cpMarker);
          return pt;
        });
      }
      if (def.pickups) {
        def.pickups = def.pickups.map((p, i) => {
          const pt = this.world.findFreeSpot(p.x, p.z, 0.7);
          const pickupMarker = new MissionMarker(this.scene, "#5fd6c4", "L", "lixo");
          pickupMarker.setPosition(pt.x, pt.z);
          pickupMarker.setVisible(false);
          pickupMarker.group.scale.setScalar(0.62);
          waypointMarkers.push(pickupMarker);
          return pt;
        });
      }
      this.missions.push({
        ...def,
        status: "available",
        marker,
        waypointMarkers,
        collected: new Set(),
        timer: def.time,
        checkpoint: 0,
        cooldown: 0,
      });
    }
  }

  get runtimeActive() {
    return this.active;
  }

  getMarkers(): MapMarker[] {
    const markers: MapMarker[] = [];
    for (const m of this.missions) {
      if (m.status === "available" && m !== this.active) {
        markers.push({ x: m.marker.group.position.x, z: m.marker.group.position.z, color: m.color, pulse: true, label: m.title });
      }
    }
    if (this.active) {
      const m = this.active;
      if (m.kind === "race" && m.checkpoints) {
        const cp = m.checkpoints[m.checkpoint];
        if (cp) markers.push({ x: cp.x, z: cp.z, color: m.color, pulse: true });
      } else if (m.kind === "beach" && m.pickups) {
        m.pickups.forEach((p, i) => {
          if (!m.collected.has(i)) markers.push({ x: p.x, z: p.z, color: "#5fd6c4", pulse: true });
        });
      } else if (m.target) {
        markers.push({ x: m.target.x, z: m.target.z, color: m.color, pulse: true });
      }
    }
    return markers;
  }

  getMissionCards(player: { x: number; z: number }): MissionCardData[] {
    return this.missions.map((m) => ({
      id: m.id,
      icon: m.icon,
      title: m.title,
      description: m.description,
      reward: m.reward,
      xp: m.xp,
      active: this.active?.id === m.id,
      distance: this.active?.id === m.id ? this.distanceToTarget(player) : distance(player, m.marker.group.position),
      duration: m.duration,
    }));
  }

  getHudMission(player: { x: number; z: number }): HudMission | null {
    const m = this.active;
    if (!m) return null;
    let sub = m.description;
    let progress = 0;
    if (m.kind === "race" && m.checkpoints) {
      sub = `Checkpoint ${Math.min(m.checkpoint + 1, m.checkpoints.length)} de ${m.checkpoints.length}`;
      progress = (m.checkpoint / m.checkpoints.length) * 100;
    } else if (m.kind === "beach" && m.pickups) {
      sub = `${m.collected.size} de ${m.pickups.length} sacos recolhidos`;
      progress = (m.collected.size / m.pickups.length) * 100;
    } else if (m.kind === "escape") {
      sub = "Continue em movimento. A polícia está atrás de você.";
      progress = 100 - (m.timer / m.time) * 100;
    } else {
      sub = `Destino a ${Math.round(this.distanceToTarget(player))} m`;
      progress = 100 - (this.distanceToTarget(player) / 240) * 100;
    }
    return {
      icon: m.icon,
      kind:
        m.kind === "taxi"
          ? "CORRIDA DE TAXI"
          : m.kind === "delivery"
            ? "ENTREGA"
            : m.kind === "race"
              ? "CORRIDA"
              : m.kind === "escape"
                ? "FUGA"
                : m.kind === "job"
                  ? "BICO"
                  : "TRABALHO",
      title: m.title,
      sub,
      timer: this.formatTimer(m.timer),
      progress: Math.max(0, Math.min(100, progress)),
    };
  }

  private formatTimer(seconds: number) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  distanceToTarget(player: { x: number; z: number }) {
    const m = this.active;
    if (!m) return 0;
    if (m.kind === "race" && m.checkpoints) {
      const cp = m.checkpoints[m.checkpoint];
      return cp ? dist2(player.x, player.z, cp.x, cp.z) : 0;
    }
    if (m.kind === "beach" && m.pickups) {
      const remaining = m.pickups.filter((_, i) => !m.collected.has(i));
      return remaining.length ? Math.min(...remaining.map((p) => dist2(player.x, player.z, p.x, p.z))) : 0;
    }
    if (m.target) return dist2(player.x, player.z, m.target.x, m.target.z);
    return 0;
  }

  getNavTarget(player: { x: number; z: number }): { x: number; z: number; label: string } | null {
    if (this.active) {
      const m = this.active;
      if (m.kind === "race" && m.checkpoints) {
        const cp = m.checkpoints[m.checkpoint];
        return cp ? { ...cp, label: m.title } : null;
      }
      if (m.kind === "beach" && m.pickups) {
        const remaining = m.pickups
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => !m.collected.has(i));
        if (!remaining.length) return null;
        remaining.sort((a, b) => dist2(player.x, player.z, a.p.x, a.p.z) - dist2(player.x, player.z, b.p.x, b.p.z));
        return { ...remaining[0]!.p, label: m.title };
      }
      return m.target ? { ...m.target, label: m.title } : null;
    }
    const tracked = this.missions.find((m) => m.id === this.trackedId && m.status === "available");
    if (tracked) return { ...tracked.marker.group.position, label: tracked.title };
    return null;
  }

  track(id: string) {
    const m = this.missions.find((x) => x.id === id);
    if (!m) return;
    if (this.active?.id === id) this.trackedId = id;
    else if (m.status === "available") this.trackedId = id;
    if (this.active?.id === id) this.trackedId = id;
  }

  getPrompt(player: { x: number; z: number }, inVehicle: boolean) {
    const m = this.active;
    if (m) {
      if (m.kind === "beach" && m.pickups) {
        for (let i = 0; i < m.pickups.length; i++) {
          if (!m.collected.has(i) && dist2(player.x, player.z, m.pickups[i]!.x, m.pickups[i]!.z) < 4.2) {
            return { key: "E", text: "Recolher saco de lixo", action: "mission" as const };
          }
        }
      }
      if ((m.kind === "taxi" || m.kind === "delivery" || m.kind === "job") && m.target && dist2(player.x, player.z, m.target.x, m.target.z) < 5.5) {
        return {
          key: "E",
          text: m.kind === "taxi" ? "Deixar a passageira" : m.kind === "job" ? "Entregar a encomenda" : "Entregar o pacote",
          action: "mission" as const,
        };
      }
      if (m.kind === "race" && !inVehicle) {
        return { key: "F", text: "Pegue um veículo para correr", action: "vehicle" as const };
      }
      return null;
    }
    for (const m2 of this.missions) {
      if (m2.status === "available" && dist2(player.x, player.z, m2.marker.group.position.x, m2.marker.group.position.z) < 5.5) {
        return { key: "E", text: `Aceitar: ${m2.title}`, action: "mission" as const };
      }
    }
    return null;
  }

  interact(player: { x: number; z: number }, inVehicle: boolean): MissionEvent | null {
    const prompt = this.getPrompt(player, inVehicle);
    if (!prompt || prompt.action !== "mission") return null;
    if (!this.active) {
      const m = this.missions.find(
        (x) => x.status === "available" && dist2(player.x, player.z, x.marker.group.position.x, x.marker.group.position.z) < 5.5,
      );
      if (!m) return null;
      this.start(m);
      return { type: "started", mission: m, text: `${m.title} começou. ${money(m.reward)} ao concluir.` };
    }
    const m = this.active;
    if (m.kind === "beach" && m.pickups) {
      for (let i = 0; i < m.pickups.length; i++) {
        if (!m.collected.has(i) && dist2(player.x, player.z, m.pickups[i]!.x, m.pickups[i]!.z) < 4.2) {
          m.collected.add(i);
          m.waypointMarkers[i]?.setVisible(false);
          if (m.collected.size >= m.pickups.length) return this.complete();
          return { type: "pickup", mission: m, text: `Saco recolhido (${m.collected.size}/${m.pickups.length}).` };
        }
      }
    }
    if ((m.kind === "taxi" || m.kind === "delivery" || m.kind === "job") && m.target && dist2(player.x, player.z, m.target.x, m.target.z) < 5.5) {
      return this.complete();
    }
    return null;
  }

  private start(m: MissionRuntime) {
    this.active = m;
    m.status = "active";
    m.timer = m.time;
    m.checkpoint = 0;
    m.collected.clear();
    this.trackedId = m.id;
    m.marker.setVisible(false);
    m.waypointMarkers.forEach((w, i) => {
      if (m.kind === "race" && i !== 0) w.setVisible(false);
      else if (m.kind === "beach") w.setVisible(true);
      else w.setVisible(i === 0);
    });
    if (m.kind === "job" && m.target) {
      const marker = m.waypointMarkers[0];
      if (marker) marker.setPosition(m.target.x, m.target.z);
    }
    if (m.kind === "escape") {
      this.wanted = 2;
      this.onEvent?.({ type: "started", mission: m, text: "A polícia está na sua cola. Corra!" });
    }
  }

  private complete(): MissionEvent {
    const m = this.active!;
    m.status = "done";
    m.cooldown = 25;
    this.active = null;
    this.wanted = 0;
    m.marker.setVisible(false);
    m.waypointMarkers.forEach((w) => w.setVisible(false));
    this.completedCount++;
    const event: MissionEvent = { type: "completed", mission: m, reward: m.reward, xp: m.xp, text: `${m.title} concluída!` };
    this.onEvent?.(event);
    this.trackedId = null;
    window.setTimeout(() => {
      m.status = "available";
      m.marker.setVisible(true);
      m.timer = m.time;
      m.checkpoint = 0;
      m.collected.clear();
      if (m.kind === "job") this.rotateJobTarget(m);
    }, 25000);
    return event;
  }

  private rotateJobTarget(m: MissionRuntime) {
    const spots = this.world.shops.map((commerce) => commerceDoor(commerce));
    if (!spots.length) return;
    const current = m.target ? spots.findIndex((spot) => Math.abs(spot.x - m.target!.x) < 0.6 && Math.abs(spot.z - m.target!.z) < 0.6) : -1;
    let next = current;
    while (next === current || next < 0) next = Math.floor(Math.random() * spots.length);
    const spot = spots[next]!;
    const free = this.world.findFreeSpot(spot.x, spot.z, 1.2);
    m.target = free;
    const marker = m.waypointMarkers[0];
    if (marker) {
      marker.setPosition(free.x, free.z);
      marker.setVisible(false);
    }
  }

  private fail(text: string): MissionEvent {
    const m = this.active;
    if (!m) return { type: "failed", text };
    m.status = "available";
    m.timer = m.time;
    m.checkpoint = 0;
    m.collected.clear();
    m.marker.setVisible(true);
    m.waypointMarkers.forEach((w) => w.setVisible(false));
    this.active = null;
    this.wanted = 0;
    const event: MissionEvent = { type: "failed", mission: m, text };
    this.onEvent?.(event);
    return event;
  }

  update(dt: number, time: number, player: { x: number; z: number }, inVehicle: boolean) {
    for (const m of this.missions) {
      m.marker.update(dt, time);
      for (const w of m.waypointMarkers) w.update(dt, time);
    }
    if (!this.active) return;
    const m = this.active;
    m.timer -= dt;
    if (m.timer <= 0) {
      if (m.kind === "escape") {
        this.complete();
      } else {
        this.fail(`${m.title} falhou: o tempo acabou.`);
      }
      return;
    }
    if (m.kind === "race" && m.checkpoints) {
      const cp = m.checkpoints[m.checkpoint];
      if (cp && inVehicle && dist2(player.x, player.z, cp.x, cp.z) < 8.5) {
        m.waypointMarkers[m.checkpoint]?.setVisible(false);
        m.checkpoint++;
        if (m.checkpoint >= m.checkpoints.length) {
          this.complete();
          return;
        }
        m.waypointMarkers[m.checkpoint]?.setVisible(true);
        this.onEvent?.({ type: "checkpoint", mission: m, text: `Checkpoint ${m.checkpoint}/${m.checkpoints.length}!` });
      }
    }
    if (m.kind === "beach" && m.pickups) {
      m.pickups.forEach((p, i) => {
        if (m.collected.has(i)) return;
        const marker = m.waypointMarkers[i];
        if (marker) marker.group.visible = dist2(player.x, player.z, p.x, p.z) < 130;
      });
    }
  }

  setWanted(level: number) {
    this.wanted = Math.max(0, Math.min(4, level));
  }

  failActive(text: string) {
    if (this.active) this.fail(text);
  }

  getCount() {
    return this.completedCount;
  }
}
