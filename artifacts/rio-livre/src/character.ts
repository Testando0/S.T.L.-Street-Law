import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const geoCache = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const material = (color: string, roughness = 0.78, metalness = 0) => {
  const key = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
};

const ownMaterial = (color: string, roughness: number) =>
  new THREE.MeshStandardMaterial({ color, roughness });

const capsule = (radius: number, length: number, mat: THREE.Material, key?: string) => {
  const mesh = new THREE.Mesh(
    geo(key ?? `capsule:${radius}:${length}`, () => new THREE.CapsuleGeometry(radius, length, 5, 14)),
    mat,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const mergeMeshes = (target: THREE.Mesh, others: THREE.Mesh[]) => {
  const parent = target.parent;
  if (!parent || !others.length) return;
  parent.updateWorldMatrix(true, true);
  const inverse = new THREE.Matrix4().copy(target.matrixWorld).invert();
  const sources = [target, ...others];
  const parts: THREE.BufferGeometry[] = [];
  for (const mesh of sources) {
    const part = mesh.geometry.clone();
    part.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    const flat = part.index ? part.toNonIndexed() : part;
    if (flat !== part) part.dispose();
    parts.push(flat);
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) return;
  target.geometry = merged;
  target.castShadow = sources.some((mesh) => mesh.castShadow);
  target.receiveShadow = sources.some((mesh) => mesh.receiveShadow);
  for (const mesh of others) mesh.removeFromParent();
};

const HEAD_Y = 1.83;
const NECK_Y = 1.655;
const TORSO_Y = 1.1;
const SHOULDER_Y = 1.55;
const SHOULDER_X = 0.235;
const HIPS_Y = 0.94;
const KNEE_Y = -0.45;
const ELBOW_Y = -0.37;
const LABEL_Y = 2.38;

export class CharacterModel {
  group = new THREE.Group();
  name = "";
  private hips: THREE.Group;
  private torso: THREE.Mesh;
  private headRig: THREE.Group;
  private neck: THREE.Mesh;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private leftKnee!: THREE.Group;
  private rightKnee!: THREE.Group;
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private leftElbow!: THREE.Group;
  private rightElbow!: THREE.Group;
  private shirtMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private skinMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;
  private shoeMat: THREE.MeshStandardMaterial;
  private phase = Math.random() * 10;
  private eyeParts: THREE.Mesh[] = [];
  private eyeBaseScaleY: number[] = [];
  private blinkTimer = 1.5 + Math.random() * 3;
  private blinkPhase = 0;
  private lean = 0;
  private label?: THREE.Sprite;
  private contact?: THREE.Mesh;
  private contactMat?: THREE.MeshBasicMaterial;
  private labelCanvas?: HTMLCanvasElement;
  speedForAnim = 0;
  jumpVelocity = 0;

  constructor(skin = "#c98b5e", shirt = "#ff6b35", pants = "#1f3c5b", hair = "#17110d", label = "") {
    this.skinMat = ownMaterial(skin, 0.58);
    this.shirtMat = ownMaterial(shirt, 0.85);
    this.pantsMat = ownMaterial(pants, 0.9);
    this.hairMat = ownMaterial(hair, 0.82);
    this.shoeMat = material("#f4f1e9", 0.55);

    this.hips = new THREE.Group();
    this.hips.position.y = HIPS_Y;
    this.group.add(this.hips);

    this.leftLeg = new THREE.Group();
    this.leftLeg.position.x = -0.095;
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.x = 0.095;
    this.hips.add(this.leftLeg, this.rightLeg);

    for (const side of [-1, 1] as const) {
      const leg = side < 0 ? this.leftLeg : this.rightLeg;
      const thigh = capsule(0.095, 0.26, this.pantsMat, "thigh");
      thigh.position.y = -0.225;
      thigh.scale.set(1, 1, 0.95);
      leg.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = KNEE_Y;
      leg.add(knee);

      const shin = capsule(0.072, 0.28, this.pantsMat, "shin");
      shin.position.y = -0.212;
      shin.scale.set(1, 1, 0.95);
      knee.add(shin);

      const shoe = capsule(0.072, 0.16, this.shoeMat, "sneaker");
      shoe.rotation.x = Math.PI / 2;
      shoe.position.set(0, -0.4, 0.05);
      shoe.scale.set(1.06, 0.92, 1);
      knee.add(shoe);

      const tongue = new THREE.Mesh(
        geo("box:0.072:0.028:0.1", () => new THREE.BoxGeometry(0.072, 0.028, 0.1)),
        this.shoeMat,
      );
      tongue.position.set(0, -0.352, 0.115);
      tongue.rotation.x = -0.32;
      tongue.castShadow = true;
      knee.add(tongue);

      const sole = new THREE.Mesh(
        geo("box:0.17:0.04:0.3", () => new THREE.BoxGeometry(0.17, 0.04, 0.3)),
        material("#dcd7cc", 0.62),
      );
      sole.position.set(0, -0.462, 0.05);
      sole.castShadow = true;
      knee.add(sole);

      mergeMeshes(shoe, [tongue]);

      if (side < 0) this.leftKnee = knee;
      else this.rightKnee = knee;
    }

    const pelvis = capsule(0.17, 0.06, this.pantsMat, "pelvis");
    pelvis.position.y = 0.06;
    pelvis.scale.set(1.18, 1, 0.8);
    this.hips.add(pelvis);

    const belt = new THREE.Mesh(
      geo("cyl:0.2:0.2:0.048:22", () => new THREE.CylinderGeometry(0.2, 0.2, 0.048, 22)),
      material("#2b2119", 0.5),
    );
    belt.position.y = 0.135;
    belt.scale.set(1, 1, 0.67);
    belt.castShadow = true;
    this.hips.add(belt);

    const buckle = new THREE.Mesh(
      geo("box:0.052:0.04:0.022", () => new THREE.BoxGeometry(0.052, 0.04, 0.022)),
      material("#c9a34a", 0.35, 0.65),
    );
    buckle.position.set(0, 0.135, 0.137);
    this.hips.add(buckle);

    const torsoGeo = geo("torso:v2", () => {
      const profile = [
        new THREE.Vector2(0.175, 0),
        new THREE.Vector2(0.19, 0.06),
        new THREE.Vector2(0.205, 0.14),
        new THREE.Vector2(0.215, 0.26),
        new THREE.Vector2(0.22, 0.34),
        new THREE.Vector2(0.212, 0.42),
        new THREE.Vector2(0.185, 0.47),
        new THREE.Vector2(0.13, 0.5),
        new THREE.Vector2(0.06, 0.515),
        new THREE.Vector2(0.0, 0.515),
      ];
      const g = new THREE.LatheGeometry(profile, 24);
      g.computeVertexNormals();
      return g;
    });
    this.torso = new THREE.Mesh(torsoGeo, this.shirtMat);
    this.torso.position.y = TORSO_Y;
    this.torso.scale.z = 0.72;
    this.torso.castShadow = true;
    this.torso.receiveShadow = true;
    this.group.add(this.torso);

    this.neck = new THREE.Mesh(
      geo("cyl:0.056:0.07:0.17:14", () => new THREE.CylinderGeometry(0.056, 0.07, 0.17, 14)),
      this.skinMat,
    );
    this.neck.position.y = NECK_Y;
    this.neck.castShadow = true;
    this.group.add(this.neck);

    const collar = new THREE.Mesh(
      geo("torus:0.082:0.02", () => new THREE.TorusGeometry(0.082, 0.02, 6, 18)),
      this.shirtMat,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = TORSO_Y + 0.5;
    collar.scale.set(1, 1, 0.75);
    this.group.add(collar);
    mergeMeshes(this.torso, [collar]);

    this.headRig = new THREE.Group();
    this.headRig.position.y = HEAD_Y;
    this.group.add(this.headRig);

    const cranium = new THREE.Mesh(
      geo("sph:0.155:26:18:head", () => new THREE.SphereGeometry(0.155, 26, 18)),
      this.skinMat,
    );
    cranium.scale.set(0.95, 1.06, 0.98);
    cranium.castShadow = true;
    cranium.receiveShadow = true;
    this.headRig.add(cranium);
    const faceParts: THREE.Mesh[] = [cranium];

    const jaw = new THREE.Mesh(
      geo("sph:0.125:22:16:jaw", () => new THREE.SphereGeometry(0.125, 22, 16)),
      this.skinMat,
    );
    jaw.position.set(0, -0.06, 0.018);
    jaw.scale.set(0.86, 0.74, 0.92);
    jaw.castShadow = true;
    jaw.receiveShadow = true;
    this.headRig.add(jaw);
    faceParts.push(jaw);

    const earGeo = geo("sph:0.045:10:8:ear", () => new THREE.SphereGeometry(0.045, 10, 8));
    for (const x of [-0.148, 0.148]) {
      const ear = new THREE.Mesh(earGeo, this.skinMat);
      ear.position.set(x, -0.005, -0.01);
      ear.scale.set(0.4, 0.9, 0.72);
      this.headRig.add(ear);
      faceParts.push(ear);
      const inner = new THREE.Mesh(
        geo("sph:0.022:8:6:earin", () => new THREE.SphereGeometry(0.022, 8, 6)),
        material("#a86a45", 0.72),
      );
      inner.position.set(x + (x < 0 ? -0.012 : 0.012), -0.005, -0.012);
      inner.scale.set(0.32, 0.8, 0.6);
      this.headRig.add(inner);
    }

    const nose = new THREE.Mesh(
      geo("sph:0.033:12:9:nose", () => new THREE.SphereGeometry(0.033, 12, 9)),
      this.skinMat,
    );
    nose.position.set(0, -0.035, 0.146);
    nose.scale.set(0.66, 1.0, 1.12);
    this.headRig.add(nose);
    faceParts.push(nose);

    const noseTip = new THREE.Mesh(
      geo("sph:0.024:10:8:nosetip", () => new THREE.SphereGeometry(0.024, 10, 8)),
      this.skinMat,
    );
    noseTip.position.set(0, -0.05, 0.155);
    noseTip.scale.set(0.9, 0.7, 0.95);
    this.headRig.add(noseTip);
    faceParts.push(noseTip);

    const eyeWhite = material("#eae3d8", 0.34);
    const iris = material("#4b3626", 0.24);
    const pupilMat = material("#140d0a", 0.22);
    const lidGeo = geo("lid", () => new THREE.SphereGeometry(0.034, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5));
    const lowerLidGeo = geo(
      "lidlow",
      () => new THREE.SphereGeometry(0.036, 12, 8, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4),
    );
    const eyeWhites: THREE.Mesh[] = [];
    const eyeIrises: THREE.Mesh[] = [];
    const eyePupils: THREE.Mesh[] = [];
    for (const x of [-0.062, 0.062]) {
      const white = new THREE.Mesh(geo("sph:0.03:14:10:eye", () => new THREE.SphereGeometry(0.03, 14, 10)), eyeWhite);
      white.position.set(x, 0.015, 0.112);
      this.headRig.add(white);
      this.registerEye(white);
      eyeWhites.push(white);

      const irisMesh = new THREE.Mesh(
        geo("sph:0.0145:10:8:iris", () => new THREE.SphereGeometry(0.0145, 10, 8)),
        iris,
      );
      irisMesh.position.set(x, 0.015, 0.1315);
      irisMesh.scale.set(1, 1, 0.8);
      this.headRig.add(irisMesh);
      this.registerEye(irisMesh);
      eyeIrises.push(irisMesh);

      const pupil = new THREE.Mesh(geo("sph:0.0075:8:6:pupil", () => new THREE.SphereGeometry(0.0075, 8, 6)), pupilMat);
      pupil.position.set(x, 0.015, 0.1395);
      pupil.scale.set(1, 1, 0.7);
      this.headRig.add(pupil);
      this.registerEye(pupil);
      eyePupils.push(pupil);

      const lid = new THREE.Mesh(lidGeo, this.skinMat);
      lid.position.set(x, 0.017, 0.112);
      lid.rotation.x = 0.55;
      this.headRig.add(lid);
      faceParts.push(lid);

      const lower = new THREE.Mesh(lowerLidGeo, this.skinMat);
      lower.position.set(x, 0.013, 0.112);
      lower.rotation.x = -0.4;
      this.headRig.add(lower);
      faceParts.push(lower);
    }

    // Um par de olhos vira uma malha so: menos draw calls por personagem.
    mergeMeshes(eyeWhites[0]!, eyeWhites.slice(1));
    mergeMeshes(eyeIrises[0]!, eyeIrises.slice(1));
    mergeMeshes(eyePupils[0]!, eyePupils.slice(1));

    const browMat = material(hair, 0.92);
    for (const x of [-0.064, 0.064]) {
      const brow = new THREE.Mesh(
        geo("box:0.062:0.015:0.02:brow", () => new THREE.BoxGeometry(0.062, 0.015, 0.02)),
        browMat,
      );
      brow.position.set(x, 0.052, 0.138);
      brow.rotation.z = x < 0 ? -0.1 : 0.1;
      brow.rotation.x = -0.16;
      this.headRig.add(brow);
    }

    const mouth = new THREE.Mesh(
      geo("box:0.072:0.012:0.014:mouth", () => new THREE.BoxGeometry(0.072, 0.012, 0.014)),
      material("#7d4238", 0.66),
    );
    mouth.position.set(0, -0.098, 0.117);
    mouth.rotation.x = 0.12;
    this.headRig.add(mouth);

    const lip = new THREE.Mesh(
      geo("sph:0.042:12:8:lip", () => new THREE.SphereGeometry(0.042, 12, 8)),
      material("#9a5a4b", 0.6),
    );
    lip.position.set(0, -0.112, 0.106);
    lip.scale.set(0.92, 0.3, 0.42);
    this.headRig.add(lip);

    const chin = new THREE.Mesh(
      geo("sph:0.036:10:8:chin", () => new THREE.SphereGeometry(0.036, 10, 8)),
      this.skinMat,
    );
    chin.position.set(0, -0.15, 0.086);
    chin.scale.set(1, 0.6, 0.75);
    this.headRig.add(chin);
    faceParts.push(chin);
    mergeMeshes(faceParts[0]!, faceParts.slice(1));

    const hairParts: THREE.Mesh[] = [];
    const hairCap = new THREE.Mesh(
      geo("haircap", () => new THREE.SphereGeometry(0.163, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.52)),
      this.hairMat,
    );
    hairCap.position.set(0, 0.004, -0.006);
    hairCap.scale.set(0.94, 1.05, 0.97);
    hairCap.rotation.x = -0.1;
    hairCap.castShadow = true;
    this.headRig.add(hairCap);
    hairParts.push(hairCap);

    const backHair = new THREE.Mesh(
      geo("sph:0.156:20:14:backhair", () => new THREE.SphereGeometry(0.156, 20, 14)),
      this.hairMat,
    );
    backHair.position.set(0, -0.03, -0.058);
    backHair.scale.set(0.98, 0.95, 0.72);
    backHair.castShadow = true;
    this.headRig.add(backHair);
    hairParts.push(backHair);

    const tuftGeo = geo("sph:0.078:12:9:tuft", () => new THREE.SphereGeometry(0.078, 12, 9));
    for (const [tx, tz, rz] of [
      [-0.058, 0.082, 0.32],
      [0.006, 0.096, 0.05],
      [0.062, 0.078, -0.3],
    ] as const) {
      const tuft = new THREE.Mesh(tuftGeo, this.hairMat);
      tuft.position.set(tx, 0.106, tz);
      tuft.scale.set(1.15, 0.42, 0.6);
      tuft.rotation.z = rz;
      tuft.rotation.x = -0.45;
      this.headRig.add(tuft);
      hairParts.push(tuft);
    }

    for (const x of [-0.14, 0.14]) {
      const sideburn = new THREE.Mesh(
        geo("box:0.026:0.095:0.05:sideburn", () => new THREE.BoxGeometry(0.026, 0.095, 0.05)),
        this.hairMat,
      );
      sideburn.position.set(x, -0.04, 0.028);
      sideburn.rotation.z = x < 0 ? 0.1 : -0.1;
      this.headRig.add(sideburn);
      hairParts.push(sideburn);
    }
    mergeMeshes(hairParts[0]!, hairParts.slice(1));

    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-SHOULDER_X, SHOULDER_Y, 0);
    this.leftArm.rotation.z = 0.1;
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(SHOULDER_X, SHOULDER_Y, 0);
    this.rightArm.rotation.z = -0.1;
    this.group.add(this.leftArm, this.rightArm);

    for (const side of [-1, 1] as const) {
      const arm = side < 0 ? this.leftArm : this.rightArm;

      const sleeve = capsule(0.077, 0.075, this.shirtMat, "sleeve");
      sleeve.position.y = -0.06;
      sleeve.scale.set(1, 1, 0.96);
      arm.add(sleeve);

      const sleeveHem = new THREE.Mesh(
        geo("cyl:0.078:0.078:0.028:16:sleevehem", () => new THREE.CylinderGeometry(0.078, 0.078, 0.028, 16)),
        this.shirtMat,
      );
      sleeveHem.position.y = -0.162;
      arm.add(sleeveHem);
      mergeMeshes(sleeve, [sleeveHem]);

      const upper = capsule(0.055, 0.26, this.skinMat, "upperarm");
      upper.position.y = -0.185;
      upper.scale.set(1, 1, 0.96);
      arm.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = ELBOW_Y;
      arm.add(elbow);

      const forearm = capsule(0.047, 0.2, this.skinMat, "forearm");
      forearm.position.y = -0.147;
      forearm.scale.set(1, 1, 0.94);
      elbow.add(forearm);

      const wrist = new THREE.Mesh(
        geo("cyl:0.038:0.044:0.05:12:wrist", () => new THREE.CylinderGeometry(0.038, 0.044, 0.05, 12)),
        this.skinMat,
      );
      wrist.position.y = -0.3;
      elbow.add(wrist);

      const hand = new THREE.Mesh(geo("sph:0.052:12:9:hand", () => new THREE.SphereGeometry(0.052, 12, 9)), this.skinMat);
      hand.position.y = -0.335;
      hand.scale.set(0.74, 1.15, 0.56);
      hand.castShadow = true;
      elbow.add(hand);

      const thumb = capsule(0.016, 0.03, this.skinMat, "thumb");
      thumb.position.set(side * 0.036, -0.325, 0.014);
      thumb.rotation.z = side * -0.45;
      thumb.rotation.x = 0.35;
      elbow.add(thumb);
      mergeMeshes(forearm, [wrist, hand, thumb]);

      if (side < 0) this.leftElbow = elbow;
      else this.rightElbow = elbow;
    }

    this.group.scale.setScalar(0.94);

    this.contactMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.contact = new THREE.Mesh(geo("circle:0.46:22", () => new THREE.CircleGeometry(0.46, 22)), this.contactMat);
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.03;
    this.contact.renderOrder = -1;
    this.contact.visible = false;
    this.group.add(this.contact);

    this.setName(label);
  }

  private registerEye(mesh: THREE.Mesh) {
    this.eyeParts.push(mesh);
    this.eyeBaseScaleY.push(mesh.scale.y);
  }

  setName(name: string) {
    this.name = name;
    if (this.label) {
      this.group.remove(this.label);
      this.label.material.map?.dispose();
      this.label.material.dispose();
      this.label = undefined;
    }
    if (!name) return;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    this.labelCanvas = c;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = "rgba(6,23,25,.76)";
    ctx.beginPath();
    ctx.roundRect(26, 26, 460, 76, 28);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,209,102,.65)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "800 38px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 18), 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true }),
    );
    sprite.position.y = LABEL_Y;
    sprite.scale.set(3.1, 0.78, 1);
    this.label = sprite;
    this.group.add(sprite);
  }

  setColors(opts: { skin?: string; shirt?: string; pants?: string; hair?: string }) {
    if (opts.skin) this.skinMat.color.set(opts.skin);
    if (opts.shirt) this.shirtMat.color.set(opts.shirt);
    if (opts.pants) this.pantsMat.color.set(opts.pants);
    if (opts.hair) this.hairMat.color.set(opts.hair);
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  setCastShadow(v: boolean) {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && obj !== this.contact) {
        mesh.castShadow = v;
        mesh.receiveShadow = v;
      }
    });
  }

  setContactShadow(enabled: boolean) {
    // Garantir sem ShadowCaster real-time no personagem em modo leve
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && obj !== this.contact) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    if (this.contact) {
      this.contact.visible = enabled;
    }
  }

  update(dt: number, speed: number, grounded = true) {
    this.speedForAnim += (speed - this.speedForAnim) * Math.min(1, dt * 9);
    const moving = this.speedForAnim > 0.2;
    const rate = Math.min(14, 4.6 + this.speedForAnim * 1.15);
    this.phase += dt * rate;
    const amp = moving ? Math.min(0.86, 0.32 + this.speedForAnim * 0.07) : 0;
    const sin = Math.sin(this.phase);
    const cos = Math.cos(this.phase);
    const breath = Math.sin(this.phase * 0.4) * 0.006;

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkPhase = 1;
      this.blinkTimer = 2.2 + Math.random() * 3.4;
    }
    if (this.blinkPhase > 0) this.blinkPhase = Math.max(0, this.blinkPhase - dt * 7);
    const lidScale = 1 - Math.sin(this.blinkPhase * Math.PI) * 0.9;
    for (let i = 0; i < this.eyeParts.length; i++) {
      this.eyeParts[i]!.scale.y = this.eyeBaseScaleY[i]! * lidScale;
    }

    this.leftLeg.rotation.x = sin * amp * 0.95;
    this.rightLeg.rotation.x = -sin * amp * 0.95;
    this.leftKnee.rotation.x = 0.06 + Math.max(0, sin) * amp * 0.85;
    this.rightKnee.rotation.x = 0.06 + Math.max(0, -sin) * amp * 0.85;

    this.leftArm.rotation.x = -sin * amp * 0.68;
    this.rightArm.rotation.x = sin * amp * 0.68;
    this.leftArm.rotation.z = 0.1 + Math.abs(sin) * 0.018;
    this.rightArm.rotation.z = -0.1 - Math.abs(sin) * 0.018;
    this.leftElbow.rotation.x = 0.14 + Math.max(0, sin) * amp * 0.34;
    this.rightElbow.rotation.x = 0.14 + Math.max(0, -sin) * amp * 0.34;

    this.hips.rotation.z = sin * amp * 0.05;
    this.hips.rotation.y = sin * amp * 0.07;
    this.torso.rotation.y = -sin * amp * 0.06;

    const bob = moving ? Math.abs(cos) * 0.03 : breath;
    this.torso.position.y = TORSO_Y + bob;
    this.neck.position.y = NECK_Y + bob;
    this.headRig.position.y = HEAD_Y + bob;

    const targetLean = moving ? Math.min(0.08, Math.max(0, (this.speedForAnim - 4.4) * 0.016)) : 0;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 6);
    this.group.rotation.x = this.lean;

    this.headRig.rotation.y = Math.sin(this.phase * 0.11) * 0.05;
    this.headRig.rotation.x = Math.sin(this.phase * 0.07 + 1.3) * 0.03;

    if (!grounded) {
      this.group.rotation.x = Math.max(this.lean, 0.02);
      this.leftLeg.rotation.x = -0.5;
      this.rightLeg.rotation.x = 0.3;
      this.leftKnee.rotation.x = 0.95;
      this.rightKnee.rotation.x = 0.5;
      this.leftArm.rotation.x = -1.15;
      this.rightArm.rotation.x = 0.7;
      this.leftArm.rotation.z = 0.35;
      this.rightArm.rotation.z = -0.35;
      this.leftElbow.rotation.x = 0.35;
      this.rightElbow.rotation.x = 0.7;
      this.headRig.rotation.x = 0.08;
    }
    if (this.contact && this.contact.visible && this.contactMat) {
      const lift = this.group.position.y;
      const k = Math.max(0, 1 - lift / 2.2);
      this.contact.position.y = 0.03 - lift;
      this.contact.rotation.x = -Math.PI / 2 - this.group.rotation.x;
      this.contact.scale.setScalar(0.82 + k * 0.18);
      this.contactMat.opacity = 0.34 * k;
    }
    if (this.label) this.label.position.y = LABEL_Y;
  }

  dispose() {
    this.skinMat.dispose();
    this.shirtMat.dispose();
    this.pantsMat.dispose();
    this.hairMat.dispose();
    this.contactMat?.dispose();
    if (this.label) {
      this.label.material.map?.dispose();
      this.label.material.dispose();
    }
  }
}
