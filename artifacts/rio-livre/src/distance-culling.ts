import * as THREE from "three";

export class DistanceCuller {
  private camera: THREE.Camera;
  private objects: Map<THREE.Object3D, { visible: boolean; distance: number }> = new Map();
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private cullDistance: number;
  private occlusionEnabled: boolean;
  private player: THREE.Object3D | null = null;
  private occluders: THREE.Object3D[] = [];

  constructor(camera: THREE.Camera, cullDistance = 110, occlusionEnabled = true) {
    this.camera = camera;
    this.cullDistance = cullDistance;
    this.occlusionEnabled = occlusionEnabled;
  }

  setPlayer(player: THREE.Object3D) {
    this.player = player;
  }

  setCullDistance(distance: number) {
    this.cullDistance = distance;
  }

  addObject(obj: THREE.Object3D, trackChildren = false) {
    if (trackChildren) {
      obj.traverse((child) => {
        if (child !== obj) {
          this.objects.set(child, { visible: child.visible, distance: 0 });
        }
      });
    }
    this.objects.set(obj, { visible: obj.visible, distance: 0 });
  }

  addOccluder(obj: THREE.Object3D) {
    this.occluders.push(obj);
  }

  removeObject(obj: THREE.Object3D) {
    this.objects.delete(obj);
    obj.traverse((child) => {
      this.objects.delete(child);
    });
  }

  update() {
    if (!this.player) return;
    const playerPos = this.player.position;
    const cullDistSqr = this.cullDistance * this.cullDistance;
    const frustumDist = this.cullDistance * 1.2;

    this.camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(
      (this.camera as THREE.PerspectiveCamera).projectionMatrix,
      (this.camera as THREE.PerspectiveCamera).matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    for (const [obj, data] of this.objects) {
      if (!obj.parent && obj.type !== "Scene") continue;
      if ((obj as any).userData?.noCull) continue;

      const dx = obj.position.x - playerPos.x;
      const dy = obj.position.y - playerPos.y;
      const dz = obj.position.z - playerPos.z;
      const distSqr = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSqr);

      let shouldHide = false;

      if (distSqr > cullDistSqr) {
        shouldHide = true;
      } else if (dist > frustumDist) {
        shouldHide = true;
      } else if (!this.frustum.intersectsObject(obj)) {
        shouldHide = true;
      }

      if (!shouldHide && this.occlusionEnabled && this.occluders.length > 0) {
        const camDir = new THREE.Vector3();
        (this.camera as THREE.PerspectiveCamera).getWorldDirection(camDir);
        const objDir = new THREE.Vector3(dx, dy, dz).normalize();
        const forward = camDir.dot(objDir);
        if (forward > 0.1) {
          for (const occ of this.occluders) {
            const occBox = new THREE.Box3().setFromObject(occ);
            const objBox = new THREE.Box3().setFromObject(obj);
            if (occBox.distanceToPoint(obj.position) < 5 && occBox.containsPoint(playerPos)) {
              if (occ.position.length() < obj.position.length() && occBox.intersectsBox(objBox)) {
                const occDist = occ.position.distanceTo(playerPos);
                if (occDist < dist - 2) {
                  shouldHide = true;
                  break;
                }
              }
            }
          }
        }
      }

      if (shouldHide !== !obj.visible || dist !== data.distance) {
        obj.visible = !shouldHide;
        (data as any).visible = obj.visible;
        (data as any).distance = dist;
      }
    }
  }

  cullByDistance(object: THREE.Object3D, maxDist = 110) {
    if (!this.player) return;
    const dx = object.position.x - this.player.position.x;
    const dz = object.position.z - this.player.position.z;
    const distSqr = dx * dx + dz * dz;
    object.visible = distSqr <= maxDist * maxDist;
  }
}

export function createDistanceCulling(camera: THREE.Camera, player: THREE.Object3D, cullDistance = 110) {
  const culler = new DistanceCuller(camera, cullDistance, true);
  culler.setPlayer(player);
  return culler;
}

export function applyDistanceCullingToGroup(group: THREE.Group | THREE.Scene, camera: THREE.Camera, player: THREE.Object3D, maxDist = 110) {
  const culler = createDistanceCulling(camera, player, maxDist);
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
      culler.addObject(obj);
    }
  });
  return culler;
}
