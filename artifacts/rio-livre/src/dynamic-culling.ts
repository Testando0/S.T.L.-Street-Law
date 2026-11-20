import * as THREE from "three";

export interface CullOptions {
  /** Centro fixo em mundo. Use para chunks que ja estao em espaco de mundo. */
  x?: number;
  z?: number;
  /** Raio do volume: some quando a distancia do jogador passa de `distance + radius`. */
  radius?: number;
  /** Distancia especifica deste objeto (ex.: 15m para o carro parado). */
  distance?: number;
  /** true = o centro acompanha o root a cada varredura (carros, NPCs, props). */
  follow?: boolean;
}

interface CullItem {
  root: THREE.Object3D;
  x: number;
  z: number;
  radius: number;
  /** null usa a distancia global, que pode mudar ao trocar o preset. */
  distance: number | null;
  follow: boolean;
  hidden: boolean;
}

/**
 * Culling por distancia do jogador, no estilo do `DynamicCulling.cs`:
 * varre a lista registrada a cada 0.5s e desliga o renderer do que esta
 * longe demais.
 *
 * Diferente do `FindObjectsOfType` do Unity, aqui nada e procurado por frame:
 * cada objeto se registra no nascimento e sai da lista quando morre. A varredura
 * nao aloca nada (sem `new`, sem `forEach`, sem closures) para nao gerar GC spike.
 */
export class DynamicCuller {
  private items: CullItem[] = [];
  private timer = 0;
  private distance: number;
  private interval: number;
  private origin = new THREE.Vector3();

  constructor(distance = 90, interval = 0.5) {
    this.distance = distance;
    this.interval = interval;
  }

  get count(): number {
    return this.items.length;
  }

  /** Quantos objetos estao desligados por distancia agora. */
  get hiddenCount(): number {
    let hidden = 0;
    for (const item of this.items) if (item.hidden) hidden++;
    return hidden;
  }

  setDistance(distance: number) {
    this.distance = distance;
  }

  setInterval(seconds: number) {
    this.interval = Math.max(0.05, seconds);
  }

  add(root: THREE.Object3D, options: CullOptions = {}): void {
    const follow = options.follow ?? true;
    this.items.push({
      root,
      x: options.x ?? root.position.x,
      z: options.z ?? root.position.z,
      radius: options.radius ?? 0,
      distance: options.distance ?? null,
      follow,
      hidden: false,
    });
  }

  remove(root: THREE.Object3D) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      if (item.root !== root) continue;
      if (item.hidden) {
        item.root.visible = true;
        item.hidden = false;
      }
      this.items.splice(i, 1);
    }
  }

  clear() {
    for (const item of this.items) {
      if (item.hidden) item.root.visible = true;
    }
    this.items.length = 0;
  }

  /**
   * Roda a varredura no intervalo configurado (0.5s por padrao).
   * Retorna true quando uma varredura aconteceu.
   */
  update(dt: number, origin: THREE.Vector3): boolean {
    this.timer += dt;
    if (this.timer < this.interval) return false;
    this.timer = 0;
    this.origin.copy(origin);
    this.sweep();
    return true;
  }

  /** Varredura imediata (usada na troca de qualidade e no respawn). */
  forceSweep(origin: THREE.Vector3) {
    this.timer = 0;
    this.origin.copy(origin);
    this.sweep();
  }

  private sweep() {
    const ox = this.origin.x;
    const oz = this.origin.z;
    for (const item of this.items) {
      const root = item.root;
      let dx: number;
      let dz: number;
      if (item.follow) {
        dx = root.position.x - ox;
        dz = root.position.z - oz;
        item.x = root.position.x;
        item.z = root.position.z;
      } else {
        dx = item.x - ox;
        dz = item.z - oz;
      }
      const limit = (item.distance ?? this.distance) + item.radius;
      const far = dx * dx + dz * dz > limit * limit;
      if (far === item.hidden) continue;
      item.hidden = far;
      root.visible = !far;
    }
  }
}
