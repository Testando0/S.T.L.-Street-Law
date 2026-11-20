import * as THREE from "three";
import {
  CITY_LIMIT,
  HAIR_COLORS,
  PANTS_COLORS,
  PEDESTRIAN_HIT_SPEED,
  QUALITY,
  SHIRT_COLORS,
  SKIN_TONES,
  type QualityName,
} from "./config";
import { CharacterModel } from "./character";
import { Rng, clamp, dist2 } from "./util";
import type { World } from "./world";

export interface VehicleHit {
  x: number;
  z: number;
  speed: number;
  dirX: number;
  dirZ: number;
  player: boolean;
}

interface Pedestrian {
  character: CharacterModel;
  x: number;
  z: number;
  heading: number;
  targetHeading: number;
  speed: number;
  turnTimer: number;
  idleTimer: number;
  rendered: boolean;
  downed: boolean;
  downTimer: number;
  knockX: number;
  knockZ: number;
  panic: number;
  panicX: number;
  panicZ: number;
  animAcc: number;
}

const SPAWN_RING_MIN = 42;
const SPAWN_RING_MAX = 128;
const DESPAWN_EXTRA = 26;
const VISIBLE_DIST = 80;
const ANIM_DIST = 55;
/** Acima dessa distancia o NPC anima em metade dos frames e esconde os olhos. */
const FAR_ANIM_DIST = 24;
const RENDER_CAP = 8;
const SPAWN_BUDGET = 4;
const HIT_REACH = 1.45;
const DOWN_TIME = 3.8;
const PANIC_RADIUS = 17;

const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng.next() * arr.length) % arr.length]!;

export class PedestrianSystem {
  scene: THREE.Scene;
  world: World;
  private pool: Pedestrian[] = [];
  private activeCount: number;
  private maxNPCs = 6;
  private useContact = false;
  private rng = new Rng(90210);
  private dists: number[] = [];
  private candidates: number[] = [];
  private renderSet = new Set<number>();
  private frame = 0;
  private renderCap = RENDER_CAP;

  constructor(scene: THREE.Scene, world: World, quality: QualityName) {
    this.scene = scene;
    this.world = world;
    const p = QUALITY[quality];
    this.activeCount = p.maxNPCs ?? p.people;
    this.maxNPCs = p.maxNPCs ?? p.people;
    this.renderCap = quality === "low" ? 2 : RENDER_CAP;
    this.useContact = p.useBlobShadows ?? !p.shadows;
  }

  setContactShadow(enabled: boolean) {
    this.useContact = enabled;
    for (const p of this.pool) p.character.setContactShadow(enabled);
  }

  setQuality(quality: QualityName) {
    const p = QUALITY[quality];
    this.activeCount = p.maxNPCs ?? p.people;
    this.maxNPCs = p.maxNPCs ?? p.people;
    this.renderCap = quality === "low" ? 2 : RENDER_CAP;
    this.useContact = p.useBlobShadows ?? !p.shadows;
    while (this.pool.length > this.activeCount) {
      const p = this.pool.pop()!;
      p.character.group.removeFromParent();
      p.character.dispose();
    }
    for (const p of this.pool) p.character.setContactShadow(this.useContact);
  }

  private setRendered(p: Pedestrian, v: boolean) {
    if (p.rendered === v) return;
    p.rendered = v;
    p.character.setVisible(v);
  }

  private freeSpotNear(x: number, z: number, min: number, max: number): { x: number; z: number } | null {
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = this.rng.range(min, max);
      const nx = clamp(x + Math.cos(angle) * radius, -CITY_LIMIT + 6, CITY_LIMIT - 6);
      const nz = clamp(z + Math.sin(angle) * radius, -CITY_LIMIT + 6, CITY_LIMIT - 6);
      if (dist2(nx, nz, x, z) < 24) continue;
      if (!this.world.blocked(nx, nz, 0.5)) return { x: nx, z: nz };
    }
    return null;
  }

  private spawn(playerX: number, playerZ: number): Pedestrian | null {
    const spot = this.freeSpotNear(playerX, playerZ, SPAWN_RING_MIN, SPAWN_RING_MAX);
    if (!spot) return null;
    const character = new CharacterModel(
      pick(this.rng, SKIN_TONES),
      pick(this.rng, SHIRT_COLORS),
      pick(this.rng, PANTS_COLORS),
      pick(this.rng, HAIR_COLORS),
      "",
    );
    const ped: Pedestrian = {
      character,
      x: spot.x,
      z: spot.z,
      heading: this.rng.next() * Math.PI * 2,
      targetHeading: 0,
      speed: this.rng.chance(0.25) ? 2.7 : this.rng.range(1.1, 1.9),
      turnTimer: this.rng.range(2.5, 8),
      idleTimer: this.rng.chance(0.3) ? this.rng.range(1, 5) : 0,
      rendered: true,
      downed: false,
      downTimer: 0,
      knockX: 0,
      knockZ: 0,
      panic: 0,
      panicX: 0,
      panicZ: 0,
      animAcc: 0,
    };
    ped.targetHeading = ped.heading;
    character.group.position.set(spot.x, 0, spot.z);
    character.group.rotation.y = ped.heading;
    character.setCastShadow(false);
    character.setContactShadow(this.useContact);
    this.scene.add(character.group);
    this.pool.push(ped);
    return ped;
  }

  checkVehicleHits(cars: VehicleHit[], onHit: (hit: VehicleHit) => void) {
    for (const car of cars) {
      const speed = Math.abs(car.speed);
      if (speed < PEDESTRIAN_HIT_SPEED) continue;
      for (const ped of this.pool) {
        if (ped.downed) continue;
        if (dist2(car.x, car.z, ped.x, ped.z) > HIT_REACH) continue;
        this.knockDown(ped, car);
        onHit({
          x: ped.x,
          z: ped.z,
          speed,
          dirX: car.dirX,
          dirZ: car.dirZ,
          player: car.player,
        });
      }
    }
  }

  private knockDown(ped: Pedestrian, car: VehicleHit) {
    ped.downed = true;
    ped.downTimer = DOWN_TIME;
    const power = Math.min(11, Math.abs(car.speed) * 0.9);
    ped.knockX = car.dirX * power;
    ped.knockZ = car.dirZ * power;
    ped.panic = 8;
    ped.panicX = ped.x;
    ped.panicZ = ped.z;
    for (const other of this.pool) {
      if (other === ped) continue;
      if (dist2(ped.x, ped.z, other.x, other.z) > PANIC_RADIUS) continue;
      other.panic = Math.max(other.panic, 6.5);
      other.panicX = ped.x;
      other.panicZ = ped.z;
      other.idleTimer = 0;
    }
  }

  update(dt: number, focusX: number, focusZ: number) {
    this.frame = (this.frame + 1) | 0;
    let budget = SPAWN_BUDGET;
    while (this.pool.length < this.activeCount && budget > 0) {
      if (!this.spawn(focusX, focusZ)) break;
      budget--;
    }

    const dists = this.dists;
    const candidates = this.candidates;
    candidates.length = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const ped = this.pool[i]!;
      const d = dist2(ped.x, ped.z, focusX, focusZ);
      dists[i] = d;
      if (i < this.activeCount && d < VISIBLE_DIST) candidates.push(i);
    }
    candidates.sort((a, b) => dists[a]! - dists[b]!);
    const renderSet = this.renderSet;
    renderSet.clear();
    const renderCount = Math.min(this.renderCap, candidates.length);
    for (let i = 0; i < renderCount; i++) renderSet.add(candidates[i]!);

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!;
      const character = p.character;
      const group = character.group;
      const dist = dists[i]!;

      if (i >= this.activeCount || dist > SPAWN_RING_MAX + DESPAWN_EXTRA) {
        this.setRendered(p, false);
        if (dist > SPAWN_RING_MAX + DESPAWN_EXTRA) {
          const spot = this.freeSpotNear(focusX, focusZ, SPAWN_RING_MIN, SPAWN_RING_MAX);
          if (spot) {
            p.x = spot.x;
            p.z = spot.z;
            group.position.set(spot.x, 0, spot.z);
            p.heading = this.rng.next() * Math.PI * 2;
            p.targetHeading = p.heading;
            p.turnTimer = this.rng.range(2.5, 8);
            p.idleTimer = this.rng.chance(0.3) ? this.rng.range(1, 5) : 0;
            p.downed = false;
            p.downTimer = 0;
            p.knockX = 0;
            p.knockZ = 0;
            p.panic = 0;
          }
        }
        continue;
      }

      this.setRendered(p, renderSet.has(i));
      if (!p.rendered) continue;

      if (this.maxNPCs <= 3 && dist > 24 * 24 && ((this.frame + i) & 1) !== 0) continue;

      if (p.downed) {
        p.downTimer -= dt;
        const nextX = p.x + p.knockX * dt;
        const nextZ = p.z + p.knockZ * dt;
        if (!this.world.blocked(nextX, nextZ, 0.4)) {
          p.x = nextX;
          p.z = nextZ;
        } else {
          p.knockX *= -0.35;
          p.knockZ *= -0.35;
        }
        const decay = Math.exp(-3.4 * dt);
        p.knockX *= decay;
        p.knockZ *= decay;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        group.position.set(p.x + fx * 0.82, 0.3, p.z + fz * 0.82);
        character.update(dt, 0);
        group.rotation.set(-Math.PI / 2, p.heading, 0);
        if (p.downTimer <= 0) {
          p.downed = false;
          p.panic = 9;
          p.panicX = p.x;
          p.panicZ = p.z;
          group.position.set(p.x, 0, p.z);
          group.rotation.set(0, p.heading, 0);
        }
        continue;
      }

      p.turnTimer -= dt;
      p.idleTimer -= dt;
      if (p.panic > 0) {
        p.panic -= dt;
        p.targetHeading = Math.atan2(p.x - p.panicX, p.z - p.panicZ);
        p.turnTimer = 0.35;
        p.idleTimer = 0;
      } else if (p.turnTimer <= 0) {
        p.turnTimer = this.rng.range(3, 9);
        p.targetHeading = this.rng.next() * Math.PI * 2;
        if (this.rng.chance(0.22)) p.idleTimer = this.rng.range(1.5, 4.5);
      }
      if (p.idleTimer > 0) p.targetHeading = p.heading;

      let diff = p.targetHeading - p.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.heading += diff * Math.min(1, dt * 2.6);
      group.rotation.y = p.heading;

      const panicking = p.panic > 0;
      const moving = p.idleTimer <= 0;
      const speed = panicking ? p.speed * 1.65 : p.speed;
      if (moving) {
        const nx = p.x + Math.sin(p.heading) * speed * dt;
        const nz = p.z + Math.cos(p.heading) * speed * dt;
        const clampedX = clamp(nx, -CITY_LIMIT + 6, CITY_LIMIT - 6);
        const clampedZ = clamp(nz, -CITY_LIMIT + 6, CITY_LIMIT - 6);
        if (!this.world.blocked(clampedX, clampedZ, 0.42)) {
          p.x = clampedX;
          p.z = clampedZ;
        } else {
          p.targetHeading = p.heading + (this.rng.chance(0.5) ? 1.2 : -1.2);
          p.turnTimer = this.rng.range(1.5, 4);
        }
      }
      group.position.set(p.x, 0, p.z);

      if (dist < ANIM_DIST) {
        const far = dist > FAR_ANIM_DIST;
        character.setFar(far);
        if (far) {
          // longe: um frame sim, outro nao (acumula o dt para a animacao nao ficar lenta)
          p.animAcc += dt;
          if (((this.frame + i) & 1) === 0) {
            character.update(p.animAcc, moving ? speed : 0);
            p.animAcc = 0;
          }
        } else {
          p.animAcc = 0;
          character.update(dt, moving ? speed : 0);
        }
      }
    }
  }

  dispose() {
    for (const p of this.pool) {
      p.character.group.removeFromParent();
      p.character.dispose();
    }
    this.pool.length = 0;
    this.renderSet.clear();
    this.dists.length = 0;
    this.candidates.length = 0;
  }
}
