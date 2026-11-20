import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const MODEL_URL = "./models/player.glb";
const MODEL_SCALE = 0.98;
const WALK_SPEED = 1.5;
const RUN_SPEED = 4.2;

const HIDDEN = new Set([
  "Epaulettes",
  "Uniform chest pockets",
  "Uniform pocket flaps",
  "Fitted uniform buttons",
  "Fitted uniform collar",
  "Suit trousers creases",
  "Aviators frame",
  "Aviators lenses",
  "Silver watch",
  "Watch face",
]);
const SKIN = new Set(["Skin", "Skin details"]);
const SHIRT = new Set(["Fitted uniform shirt", "Fitted uniform loose short sleeves", "Fitted uniform open sleeve hems"]);
const PANTS = new Set(["Suit trousers"]);
const HAIR = new Set(["Hair"]);
const SHOE = new Set(["Oxford leather", "Oxford laces"]);
const SOLE = new Set(["Oxford sole"]);

export interface GlbAsset {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

export interface GlbColors {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const fetchBuffer = (url: string) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => {
      const ok = xhr.status === 200 || xhr.status === 0;
      const buf = xhr.response as ArrayBuffer | null;
      if (ok && buf && buf.byteLength > 1024) resolve(buf);
      else reject(new Error("modelo indisponivel"));
    };
    xhr.onerror = () => reject(new Error("modelo indisponivel"));
    xhr.send();
  });

let pending: Promise<GlbAsset | null> | null = null;

export const loadCharacterAsset = (): Promise<GlbAsset | null> => {
  if (!pending) {
    pending = fetchBuffer(MODEL_URL)
      .then(
        (buf) =>
          new Promise<GlbAsset | null>((resolve) => {
            new GLTFLoader().parse(
              buf,
              "",
              (gltf) => resolve({ scene: gltf.scene, clips: gltf.animations }),
              () => resolve(null),
            );
          }),
      )
      .catch(() => null);
  }
  return pending;
};

const findClip = (clips: THREE.AnimationClip[], key: string) =>
  clips.find((c) => c.name.toLowerCase().includes(key)) ?? null;

const _white = new THREE.Color("#ffffff");
const _tint = new THREE.Color();

export class GlbRig {
  root: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction | null = null;
  private walk: THREE.AnimationAction | null = null;
  private run: THREE.AnimationAction | null = null;
  private all: THREE.Material[] = [];
  private skin: THREE.MeshStandardMaterial[] = [];
  private shirt: THREE.MeshStandardMaterial[] = [];
  private pants: THREE.MeshStandardMaterial[] = [];
  private hair: THREE.MeshStandardMaterial[] = [];

  constructor(asset: GlbAsset) {
    this.root = cloneSkinned(asset.scene);
    this.root.scale.setScalar(MODEL_SCALE);
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const name = source.name;
      if (HIDDEN.has(name)) {
        mesh.visible = false;
        return;
      }
      const mat = source.clone();
      mesh.material = mat;
      this.all.push(mat);
      if (SKIN.has(name)) this.skin.push(mat);
      else if (SHIRT.has(name)) this.shirt.push(mat);
      else if (PANTS.has(name)) this.pants.push(mat);
      else if (HAIR.has(name)) this.hair.push(mat);
      else if (SHOE.has(name)) {
        mat.map = null;
        mat.color.set("#f6f5f1");
        mat.roughness = 0.55;
        mat.metalness = 0;
      } else if (SOLE.has(name)) {
        mat.map = null;
        mat.color.set("#e4e1d8");
        mat.roughness = 0.7;
        mat.metalness = 0;
      }
    });

    this.mixer = new THREE.AnimationMixer(this.root);
    const start = (clip: THREE.AnimationClip | null) => {
      if (!clip) return null;
      const action = this.mixer.clipAction(clip);
      action.setEffectiveWeight(0);
      action.play();
      return action;
    };
    this.idle = start(findClip(asset.clips, "idle"));
    this.walk = start(findClip(asset.clips, "walk"));
    this.run = start(findClip(asset.clips, "run"));
    if (this.idle) this.idle.setEffectiveWeight(1);
  }

  setColors(c: GlbColors) {
    _tint.set(c.skin);
    const skin = _white.clone().lerp(_tint, 0.5);
    for (const m of this.skin) m.color.copy(skin);
    for (const m of this.shirt) m.color.set(c.shirt);
    for (const m of this.pants) m.color.set(c.pants);
    for (const m of this.hair) m.color.set(c.hair);
  }

  update(dt: number, speed: number, grounded: boolean) {
    const move = smooth(0.05, 0.9, speed);
    const runW = smooth(2.4, 3.8, speed);
    this.idle?.setEffectiveWeight(1 - move);
    this.walk?.setEffectiveWeight(move * (1 - runW));
    this.run?.setEffectiveWeight(move * runW);
    this.walk?.setEffectiveTimeScale(clampNum(speed / WALK_SPEED, 0.6, 1.5));
    this.run?.setEffectiveTimeScale(clampNum(speed / RUN_SPEED, 0.8, 1.8));
    this.mixer.update(grounded ? dt : dt * 0.25);
  }

  setShadows(on: boolean) {
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = on;
        mesh.receiveShadow = on;
      }
    });
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const m of this.all) m.dispose();
    this.all.length = 0;
    this.root.removeFromParent();
  }
}
