import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { VEHICLES, getVehicle, type VehicleSpec } from "./config";
import { makeShadowTexture } from "./textures";
import { Rng, clamp, damp } from "./util";
import type { World } from "./world";

const shadowTex = makeShadowTexture();
const bakeMaterial = new THREE.MeshBasicMaterial();

const mat = (color: string, roughness = 0.4, metalness = 0.3) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.25,
  });

export interface VehicleVisual {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  frontWheels: THREE.Object3D[];
  brakeLights: THREE.MeshStandardMaterial;
  headlights: THREE.MeshStandardMaterial;
  sirenRed?: THREE.MeshStandardMaterial;
  sirenBlue?: THREE.MeshStandardMaterial;
  shadow: THREE.Mesh;
}

const roundedPlanShape = (w: number, l: number, radius: number) => {
  const r = Math.min(radius, w / 2, l / 2);
  const x = -w / 2;
  const y = -l / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + l - r);
  s.quadraticCurveTo(x + w, y + l, x + w - r, y + l);
  s.lineTo(x + r, y + l);
  s.quadraticCurveTo(x, y + l, x, y + l - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

const slabGeometry = (w: number, l: number, h: number, radius = 0.2, bevel = 0.03) => {
  const geo = new THREE.ExtrudeGeometry(roundedPlanShape(w, l, radius), {
    depth: h,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 3,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
};

const part = (
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) => {
  const mesh = new THREE.Mesh(geo, bakeMaterial);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
};

const box = (
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
) => part(parent, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);

const bake = (parent: THREE.Group, material: THREE.Material, shadows = false) => {
  if (!parent.children.length) return undefined;
  parent.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  parent.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const src = obj.geometry;
    const geo = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(geo.attributes)) {
      if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
    }
    if (!geo.getAttribute("uv")) {
      const count = geo.getAttribute("position").count;
      geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    geo.applyMatrix4(obj.matrixWorld);
    parts.push(geo);
  });
  const merged = mergeGeometries(parts, false);
  for (const geo of parts) geo.dispose();
  parent.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
  if (!merged) return undefined;
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
};

const colorize = (source: THREE.BufferGeometry, hex: string) => {
  const geo = source.index ? source.toNonIndexed() : source;
  if (geo !== source) source.dispose();
  const count = geo.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  for (const name of Object.keys(geo.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(name)) geo.deleteAttribute(name);
  }
  return geo;
};

const buildWheelGeometry = (radius: number, width: number) => {
  const parts: THREE.BufferGeometry[] = [];
  const tire = new THREE.TorusGeometry(radius - width * 0.5, width * 0.5, 7, 20);
  tire.rotateY(Math.PI / 2);
  parts.push(colorize(tire, "#141516"));
  // Tread, brake hardware, and wheel-face accents stay in this shared, merged
  // geometry so a detailed wheel adds no extra draw calls per vehicle.
  for (let i = 0; i < 12; i++) {
    const tread = new THREE.BoxGeometry(width * 0.72, 0.016, radius * 0.3);
    tread.translate(0, radius - 0.01, 0);
    tread.rotateX((i / 12) * Math.PI * 2);
    parts.push(colorize(tread, "#1b1c1d"));
  }
  const rim = new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width * 0.62, 18);
  rim.rotateZ(Math.PI / 2);
  parts.push(colorize(rim, "#a9b2b1"));
  for (const side of [-1, 1]) {
    const rotor = new THREE.CylinderGeometry(radius * 0.43, radius * 0.43, width * 0.08, 16);
    rotor.rotateZ(Math.PI / 2);
    rotor.translate(side * width * 0.27, 0, 0);
    parts.push(colorize(rotor, "#687174"));

    const trim = new THREE.TorusGeometry(radius * 0.74, 0.009, 4, 18);
    trim.rotateY(Math.PI / 2);
    trim.translate(side * width * 0.32, 0, 0);
    parts.push(colorize(trim, "#d0d5d2"));

    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.BoxGeometry(width * 0.11, radius * 0.47, 0.032);
      spoke.translate(0, radius * 0.25, 0);
      spoke.rotateX((i / 6) * Math.PI * 2);
      spoke.translate(side * width * 0.31, 0, 0);
      parts.push(colorize(spoke, "#c3cac7"));
    }
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const lug = new THREE.CylinderGeometry(radius * 0.035, radius * 0.035, width * 0.055, 6);
      lug.rotateZ(Math.PI / 2);
      lug.translate(side * width * 0.35, Math.cos(angle) * radius * 0.29, Math.sin(angle) * radius * 0.29);
      parts.push(colorize(lug, "#e1e5e2"));
    }
    const hub = new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, width * 0.18, 12);
    hub.rotateZ(Math.PI / 2);
    hub.translate(side * width * 0.31, 0, 0);
    parts.push(colorize(hub, "#d5dad7"));
  }
  const merged = mergeGeometries(parts, false)!;
  for (const geo of parts) geo.dispose();
  return merged;
};

const buildWheels = (w: number, l: number, kind: VehicleSpec["kind"], group: THREE.Group) => {
  const radius = kind === "moto" ? 0.34 : kind === "suv" || kind === "van" ? 0.41 : kind === "sport" ? 0.35 : 0.37;
  const width = kind === "moto" ? 0.16 : widthForKind(kind);
  const geometry = buildWheelGeometry(radius, width);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.28,
    envMapIntensity: 1.05,
  });
  const track = kind === "moto" ? 0 : w / 2 - 0.08;
  const wheelZ = l * (kind === "moto" ? 0.34 : 0.31);
  const layout =
    kind === "moto"
      ? [
          { x: 0, z: wheelZ, front: true },
          { x: 0, z: -wheelZ, front: false },
        ]
      : [
          { x: -track, z: wheelZ, front: true },
          { x: track, z: wheelZ, front: true },
          { x: -track, z: -wheelZ, front: false },
          { x: track, z: -wheelZ, front: false },
        ];
  const wheels: THREE.Mesh[] = [];
  const frontWheels: THREE.Object3D[] = [];
  for (const item of layout) {
    const pivot = new THREE.Group();
    pivot.position.set(item.x, radius, item.z);
    group.add(pivot);
    const wheel = new THREE.Mesh(geometry, material);
    wheel.castShadow = false;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    wheels.push(wheel);
    if (item.front) frontWheels.push(pivot);
  }
  return { wheels, frontWheels };
};

const widthForKind = (kind: VehicleSpec["kind"]) => {
  if (kind === "suv" || kind === "van") return 0.27;
  if (kind === "sport") return 0.25;
  return 0.24;
};

export const buildVehicleVisual = (spec: VehicleSpec, paint: string): VehicleVisual => {
  const [w, h, l] = spec.size;
  const group = new THREE.Group();
  const bodyMat = mat(paint, 0.32, 0.42);
  const darkMat = mat("#1b2325", 0.72, 0.08);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: "#4f777d",
    roughness: 0.05,
    metalness: 0.28,
    transparent: true,
    opacity: 0.78,
    envMapIntensity: 1.8,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const chromeMat = new THREE.MeshStandardMaterial({ color: "#d9e0dd", roughness: 0.14, metalness: 0.95, envMapIntensity: 1.5 });
  const headlights = new THREE.MeshStandardMaterial({
    color: "#fff5cc",
    emissive: "#fff0a8",
    emissiveIntensity: 0.5,
    roughness: 0.18,
  });
  const brakeLights = new THREE.MeshStandardMaterial({
    color: "#8f1717",
    emissive: "#ff2f2f",
    emissiveIntensity: 0.35,
    roughness: 0.22,
  });

  if (spec.kind === "moto") {
    const body = new THREE.Group();
    const dark = new THREE.Group();
    const chrome = new THREE.Group();
    const head = new THREE.Group();
    const tail = new THREE.Group();
    const wheelRadius = 0.34;
    const tank = new THREE.SphereGeometry(0.3, 18, 14);
    part(body, tank, 0, 0.94, 0.18, 0, 0, 0, 0.83, 0.68, 1.3);
    part(body, new THREE.SphereGeometry(0.24, 16, 12), 0, 0.76, -0.62, 0, 0, 0, 0.9, 0.72, 1.5);
    part(body, slabGeometry(0.32, 0.62, 0.09, 0.1, 0.02), 0, 0.88, -0.34);
    part(body, new THREE.TorusGeometry(0.37, 0.035, 6, 14, Math.PI), 0, wheelRadius, wheelZFront(l), 0, Math.PI / 2, 0);
    part(body, new THREE.TorusGeometry(0.37, 0.035, 6, 14, Math.PI), 0, wheelRadius, -wheelZFront(l), 0, Math.PI / 2, 0);
    box(dark, 0.36, 0.3, 0.48, 0, 0.58, 0.08);
    box(dark, 0.16, 0.12, 1.18, 0, 0.7, 0, 0.04);
    part(dark, new THREE.BoxGeometry(0.34, 0.08, 0.16), 0, 0.55, -0.72);
    for (const side of [-1, 1]) {
      part(chrome, new THREE.CylinderGeometry(0.032, 0.042, 0.96, 8), side * 0.085, 0.79, 0.62, 0.22, 0, 0);
      part(chrome, new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8), side * 0.08, 1.24, 0.55, 0, 0, Math.PI / 2);
      part(dark, new THREE.SphereGeometry(0.06, 8, 6), side * 0.2, 1.27, 0.5, 0, 0, 0, 0.35, 1, 1);
    }
    part(chrome, new THREE.CylinderGeometry(0.055, 0.055, 0.7, 10), 0.23, 0.52, -0.3, Math.PI / 2, 0, 0);
    part(chrome, new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), 0.23, 0.52, -0.71, Math.PI / 2, 0, 0);
    part(head, new THREE.SphereGeometry(0.15, 14, 10), 0, 1.03, 0.76, 0, 0, 0, 1, 0.9, 0.65);
    part(tail, new THREE.BoxGeometry(0.22, 0.09, 0.05), 0, 0.79, -0.94);
    const bodyMesh = bake(body, bodyMat);
    const darkMesh = bake(dark, darkMat);
    const chromeMesh = bake(chrome, chromeMat);
    const headMesh = bake(head, headlights, false);
    const tailMesh = bake(tail, brakeLights, false);
    for (const mesh of [bodyMesh, darkMesh, chromeMesh, headMesh, tailMesh]) if (mesh) group.add(mesh);
    const shadow = makeShadow(w * 1.25, l * 1.1);
    group.add(shadow);
    const wheels = buildWheels(w, l, spec.kind, group);
    return { group, ...wheels, brakeLights, headlights, shadow };
  }

  const r = spec.kind === "suv" || spec.kind === "van" ? 0.41 : spec.kind === "sport" ? 0.35 : 0.37;
  const bodyBot = r;
  const bodyHeightFactor = spec.kind === "van" ? 0.62 : spec.kind === "suv" ? 0.6 : spec.kind === "sport" ? 0.62 : 0.63;
  const bodyTop = h * bodyHeightFactor;
  const bodyDepth = w * 0.96;
  const wheelZ = l * 0.31;
  const archR = r + 0.055;

  const paintParts = new THREE.Group();
  const darkParts = new THREE.Group();
  const chromeParts = new THREE.Group();
  const glassParts = new THREE.Group();
  const headParts = new THREE.Group();
  const tailParts = new THREE.Group();

  const profile = new THREE.Shape();
  const rear = -l / 2;
  const front = l / 2;
  profile.moveTo(rear + 0.1, bodyBot);
  profile.lineTo(-wheelZ - archR, bodyBot);
  profile.absarc(-wheelZ, bodyBot, archR, Math.PI, 0, true);
  profile.lineTo(wheelZ - archR, bodyBot);
  profile.absarc(wheelZ, bodyBot, archR, Math.PI, 0, true);
  profile.lineTo(front - 0.1, bodyBot);
  profile.quadraticCurveTo(front, bodyBot, front, bodyBot + 0.24);
  profile.lineTo(front, bodyTop - 0.18 * h);
  if (spec.kind === "van") {
    profile.quadraticCurveTo(front, bodyTop, front - 0.24, bodyTop);
  } else {
    profile.quadraticCurveTo(front, bodyTop - 0.055 * h, front - l * 0.04, bodyTop - 0.045 * h);
    profile.lineTo(front - l * 0.22, bodyTop);
  }
  profile.lineTo(rear + 0.26, bodyTop);
  profile.quadraticCurveTo(rear, bodyTop, rear, bodyTop - 0.22);
  profile.lineTo(rear, bodyBot + 0.2);
  profile.quadraticCurveTo(rear, bodyBot, rear + 0.1, bodyBot);
  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: bodyDepth - 0.1,
    bevelEnabled: true,
    bevelSize: 0.045,
    bevelThickness: 0.045,
    bevelSegments: 2,
    curveSegments: 8,
    steps: 1,
  });
  bodyGeo.rotateY(Math.PI / 2);
  bodyGeo.translate(-(bodyDepth - 0.1) / 2, 0, 0);
  part(paintParts, bodyGeo);

  part(darkParts, new THREE.BoxGeometry(bodyDepth * 0.8, 0.14, l * 0.62), 0, bodyBot - 0.04, 0);
  for (const side of [-1, 1]) {
    part(darkParts, new THREE.BoxGeometry(0.035, 0.08, l * 0.42), side * bodyDepth * 0.49, bodyBot - 0.015, 0);
  }

  const baseFactor = spec.kind === "van" ? 0.74 : spec.kind === "suv" ? 0.56 : spec.kind === "sport" ? 0.48 : 0.52;
  const topFactor = spec.kind === "van" ? 0.7 : spec.kind === "suv" ? 0.46 : spec.kind === "sport" ? 0.29 : 0.36;
  const cabinLen = l * baseFactor;
  const cabinTop = l * topFactor;
  const cabinH = h - bodyTop - 0.055;
  const cabinW = w * 0.84;
  const cabinZ = spec.kind === "van" ? 0 : -l * 0.035;
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-cabinLen / 2, 0);
  cabinShape.lineTo(cabinLen / 2, 0);
  cabinShape.lineTo(cabinTop / 2, cabinH - 0.07);
  cabinShape.quadraticCurveTo(cabinTop / 2, cabinH, cabinTop / 2 - 0.12, cabinH);
  cabinShape.lineTo(-cabinTop / 2 + 0.12, cabinH);
  cabinShape.quadraticCurveTo(-cabinTop / 2, cabinH, -cabinTop / 2, cabinH - 0.07);
  cabinShape.closePath();
  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: cabinW - 0.08,
    bevelEnabled: true,
    bevelSize: 0.04,
    bevelThickness: 0.04,
    bevelSegments: 2,
    curveSegments: 5,
    steps: 1,
  });
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.translate(-(cabinW - 0.08) / 2, 0, 0);
  const cabinPos = cabinGeo.getAttribute("position");
  for (let i = 0; i < cabinPos.count; i++) {
    const y = cabinPos.getY(i);
    const t = clamp(y / cabinH, 0, 1);
    cabinPos.setX(i, cabinPos.getX(i) * (1 - 0.13 * t));
  }
  cabinPos.needsUpdate = true;
  cabinGeo.computeVertexNormals();
  part(glassParts, cabinGeo, 0, bodyTop - 0.02, cabinZ);

  const roofTop = bodyTop + cabinH - 0.02;
  part(paintParts, slabGeometry(cabinW * 0.86, cabinTop * 0.98, 0.055, 0.2, 0.015), 0, roofTop, cabinZ);
  const frontBaseZ = cabinZ + cabinLen / 2;
  const frontTopZ = cabinZ + cabinTop / 2;
  const rearBaseZ = cabinZ - cabinLen / 2;
  const rearTopZ = cabinZ - cabinTop / 2;
  const frontPillar = Math.hypot(frontBaseZ - frontTopZ, cabinH);
  const rearPillar = Math.hypot(rearTopZ - rearBaseZ, cabinH);
  const frontTilt = Math.atan2(frontTopZ - frontBaseZ, cabinH);
  const rearTilt = Math.atan2(rearTopZ - rearBaseZ, cabinH);
  for (const side of [-1, 1]) {
    part(
      paintParts,
      new THREE.BoxGeometry(0.052, frontPillar, 0.055),
      side * cabinW * 0.45,
      bodyTop + cabinH / 2 - 0.02,
      (frontBaseZ + frontTopZ) / 2,
      frontTilt,
    );
    part(
      paintParts,
      new THREE.BoxGeometry(0.052, rearPillar, 0.055),
      side * cabinW * 0.45,
      bodyTop + cabinH / 2 - 0.02,
      (rearBaseZ + rearTopZ) / 2,
      rearTilt,
    );
  }
  const wiperZ = frontBaseZ + ((frontTopZ - frontBaseZ) * 0.1) / cabinH;
  for (const side of [-1, 1]) {
    part(
      darkParts,
      new THREE.BoxGeometry(w * 0.34, 0.014, 0.018),
      side * w * 0.12,
      bodyTop + 0.1,
      wiperZ,
      frontTilt,
    );
  }
  if (spec.kind === "suv" || spec.kind === "van") {
    for (const side of [-1, 1]) {
      part(darkParts, new THREE.BoxGeometry(0.035, 0.045, cabinTop * 0.8), side * cabinW * 0.33, roofTop + 0.08, cabinZ);
    }
  }
  for (const side of [-1, 1]) {
    part(chromeParts, new THREE.BoxGeometry(0.018, 0.022, cabinLen * 0.9), side * cabinW * 0.465, bodyTop + 0.025, cabinZ);
    part(darkParts, new THREE.BoxGeometry(0.025, cabinH * 0.74, 0.09), side * cabinW * 0.45, bodyTop + cabinH * 0.4, cabinZ - 0.02);
    part(darkParts, new THREE.BoxGeometry(0.035, 0.22, 0.18), side * cabinW * 0.45, bodyTop + cabinH * 0.28, cabinZ + cabinLen * 0.4);

    // Fine panel gaps and a raised hood crease add definition without changing
    // the player-selected paint material or creating extra meshes.
    const sideX = side * ((bodyDepth - 0.1) / 2 + 0.006);
    for (const seamZ of [cabinZ + cabinLen * 0.12, cabinZ - cabinLen * 0.18]) {
      part(
        darkParts,
        new THREE.BoxGeometry(0.012, Math.max(0.24, bodyTop - bodyBot - 0.14), 0.012),
        sideX,
        bodyBot + (bodyTop - bodyBot) / 2,
        seamZ,
      );
    }
    if (spec.kind !== "van") {
      part(
        paintParts,
        new THREE.BoxGeometry(0.016, 0.012, Math.max(0.32, l * 0.24)),
        side * w * 0.24,
        bodyTop + 0.012,
        front * 0.66,
      );
    }
  }

  part(darkParts, new THREE.BoxGeometry(cabinW * 0.78, 0.1, cabinLen * 0.84), 0, bodyTop + 0.055, cabinZ);
  for (const side of [-1, 1]) {
    part(darkParts, new THREE.BoxGeometry(0.3, 0.16, 0.4), side * cabinW * 0.22, bodyTop + 0.17, cabinZ + 0.02);
    part(darkParts, new THREE.BoxGeometry(0.3, 0.3, 0.09), side * cabinW * 0.22, bodyTop + 0.34, cabinZ - 0.17);
    part(darkParts, new THREE.BoxGeometry(0.22, 0.12, 0.07), side * cabinW * 0.22, bodyTop + 0.52, cabinZ - 0.17);
  }
  part(darkParts, new THREE.BoxGeometry(cabinW * 0.72, 0.14, 0.24), 0, bodyTop + 0.22, cabinZ + cabinLen * 0.37);

  for (const side of [-1, 1]) {
    part(chromeParts, new THREE.CapsuleGeometry(0.02, 0.12, 4, 8), side * (bodyDepth * 0.49 + 0.012), bodyTop - 0.13, cabinZ + cabinLen * 0.35, Math.PI / 2, 0, 0);
    part(chromeParts, new THREE.CapsuleGeometry(0.02, 0.12, 4, 8), side * (bodyDepth * 0.49 + 0.012), bodyTop - 0.13, cabinZ - cabinLen * 0.28, Math.PI / 2, 0, 0);
    part(darkParts, new THREE.BoxGeometry(0.015, 0.22, 0.02), side * (bodyDepth * 0.49 + 0.008), bodyTop - 0.3, cabinZ + cabinLen * 0.03);
    part(paintParts, new THREE.SphereGeometry(0.07, 12, 8), side * (w * 0.53), bodyTop + 0.08, cabinZ + cabinLen * 0.42, 0, 0, 0, 1.25, 0.62, 0.8);
    part(darkParts, new THREE.SphereGeometry(0.055, 10, 8), side * (w * 0.53 + (side > 0 ? 0.035 : -0.035)), bodyTop + 0.08, cabinZ + cabinLen * 0.38);
  }

  const frontZ = front + 0.012;
  const rearZ = rear - 0.012;
  const grilleWidth = spec.kind === "sport" ? w * 0.54 : spec.kind === "van" ? w * 0.3 : w * 0.42;
  part(chromeParts, new THREE.BoxGeometry(grilleWidth + 0.06, 0.2, 0.045), 0, bodyTop - 0.26, frontZ);
  part(darkParts, new THREE.BoxGeometry(grilleWidth, 0.145, 0.052), 0, bodyTop - 0.26, frontZ + 0.012);
  for (let i = 0; i < 4; i++) {
    part(
      chromeParts,
      new THREE.BoxGeometry(grilleWidth * 0.9, 0.012, 0.012),
      0,
      bodyTop - 0.31 + i * 0.034,
      frontZ + 0.042,
    );
  }
  part(chromeParts, new THREE.BoxGeometry(w * 0.82, 0.075, 0.045), 0, bodyBot + 0.08, frontZ - 0.015);
  part(darkParts, new THREE.BoxGeometry(w * 0.62, 0.12, 0.06), 0, bodyBot + 0.17, frontZ + 0.005);
  part(darkParts, new THREE.BoxGeometry(w * 0.97, 0.11, 0.14), 0, bodyBot + 0.02, frontZ - 0.045);
  part(darkParts, new THREE.BoxGeometry(w * 0.95, 0.1, 0.12), 0, bodyBot + 0.02, rearZ + 0.04);
  part(chromeParts, new THREE.BoxGeometry(w * 0.82, 0.055, 0.04), 0, bodyBot + 0.08, rearZ + 0.005);
  for (const side of [-1, 1]) {
    part(darkParts, new THREE.SphereGeometry(0.14, 16, 10), side * w * 0.33, bodyTop - 0.17, frontZ, 0, 0, 0, 1.42, 0.66, 0.42);
    part(chromeParts, new THREE.BoxGeometry(0.32, 0.13, 0.028), side * w * 0.33, bodyTop - 0.17, frontZ + 0.064);
    part(headParts, new THREE.SphereGeometry(0.095, 16, 10), side * w * 0.33, bodyTop - 0.17, frontZ + 0.04, 0, 0, 0, 1.5, 0.6, 0.5);
    part(tailParts, new THREE.CapsuleGeometry(0.045, 0.15, 5, 10), side * w * 0.32, bodyTop - 0.2, rearZ - 0.02, 0, 0, Math.PI / 2);
  }
  part(chromeParts, new THREE.CylinderGeometry(0.045, 0.045, 0.16, 10), w * 0.3, bodyBot - 0.015, rearZ - 0.05, Math.PI / 2, 0, 0);
  if (spec.kind === "sport") {
    part(chromeParts, new THREE.CylinderGeometry(0.045, 0.045, 0.16, 10), -w * 0.3, bodyBot - 0.015, rearZ - 0.05, Math.PI / 2, 0, 0);
  }

  const paintMesh = bake(paintParts, bodyMat);
  const darkMesh = bake(darkParts, darkMat);
  const chromeMesh = bake(chromeParts, chromeMat);
  const glassMesh = bake(glassParts, glassMat, false);
  const headMesh = bake(headParts, headlights, false);
  const tailMesh = bake(tailParts, brakeLights, false);
  for (const mesh of [paintMesh, darkMesh, chromeMesh, glassMesh, headMesh, tailMesh]) if (mesh) group.add(mesh);

  const shadow = makeShadow(w * 1.25, l * 1.1);
  group.add(shadow);
  const wheels = buildWheels(w, l, spec.kind, group);

  let sirenRed: THREE.MeshStandardMaterial | undefined;
  let sirenBlue: THREE.MeshStandardMaterial | undefined;
  if (spec.kind === "police") {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.965, 0.18, l * 0.72),
      new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.4, metalness: 0.25 }),
    );
    stripe.position.set(0, bodyTop - 0.12, 0);
    stripe.castShadow = true;
    group.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.1, 0.26), darkMat);
    bar.position.set(0, roofTop + 0.12, -0.02);
    bar.castShadow = true;
    group.add(bar);
    sirenRed = new THREE.MeshStandardMaterial({ color: "#ff2222", emissive: "#ff0000", emissiveIntensity: 0.1 });
    sirenBlue = new THREE.MeshStandardMaterial({ color: "#2277ff", emissive: "#0044ff", emissiveIntensity: 0.1 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.22), sirenRed);
    red.position.set(-0.28, roofTop + 0.22, -0.02);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.22), sirenBlue);
    blue.position.set(0.28, roofTop + 0.22, -0.02);
    group.add(red, blue);
  }

  if (spec.kind === "taxi") {
    const taxiSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.24, 0.34),
      new THREE.MeshStandardMaterial({ color: "#fff8d7", emissive: "#ffdf70", emissiveIntensity: 0.45, roughness: 0.35 }),
    );
    taxiSign.position.set(0, roofTop + 0.2, cabinZ);
    taxiSign.castShadow = true;
    group.add(taxiSign);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.24), darkMat);
    base.position.set(0, roofTop + 0.075, cabinZ);
    group.add(base);
  }

  return { group, ...wheels, brakeLights, headlights, sirenRed, sirenBlue, shadow };
};

const wheelZFront = (l: number) => l * 0.34;

const makeShadow = (w: number, l: number) => {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  return shadow;
};

export class Vehicle {
  spec: VehicleSpec;
  visual: VehicleVisual;
  group: THREE.Group;
  speed = 0;
  steering = 0;
  hp = 100;
  driverId: string | null = null;
  color: string;
  private sirenTime = 0;
  private maxSpeed: number;
  private accel: number;
  private brake: number;
  private handling: number;
  private wheelSpin = 0;

  constructor(spec: VehicleSpec, paint: string, upgradeLevels = { engine: 0, turbo: 0, tires: 0 }) {
    this.spec = spec;
    this.color = paint;
    this.visual = buildVehicleVisual(spec, paint);
    this.group = this.visual.group;
    this.maxSpeed = spec.maxSpeed * (1 + upgradeLevels.engine * 0.06 + upgradeLevels.turbo * 0.035);
    this.accel = spec.accel * (1 + upgradeLevels.engine * 0.09 + upgradeLevels.turbo * 0.05);
    this.brake = spec.brake * (1 + upgradeLevels.tires * 0.07);
    this.handling = spec.handling * (1 + upgradeLevels.tires * 0.04);
  }

  place(x: number, z: number, ry = 0) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = ry;
  }

  get position() {
    return this.group.position;
  }

  get rotation() {
    return this.group.rotation.y;
  }

  updatePlayer(dt: number, throttle: number, steer: number, world: World, night: number) {
    const forwardX = Math.sin(this.group.rotation.y);
    const forwardZ = Math.cos(this.group.rotation.y);
    if (throttle > 0) {
      this.speed += this.accel * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= this.brake * Math.abs(throttle) * dt;
      else this.speed += this.accel * 0.38 * throttle * dt;
    } else {
      this.speed = damp(this.speed, 0, 1.4, dt);
    }
    const max = this.maxSpeed;
    this.speed = clamp(this.speed, -max * 0.3, max);
    const speedFactor = clamp(Math.abs(this.speed) / 9, 0.1, 1);
    const turn = steer * this.handling * speedFactor * Math.sign(this.speed || 1) * dt;
    if (Math.abs(this.speed) > 0.2) this.group.rotation.y += turn;
    this.steering = damp(this.steering, steer, 9, dt);

    const nextX = this.group.position.x + forwardX * this.speed * dt;
    const nextZ = this.group.position.z + forwardZ * this.speed * dt;
    const radius = this.spec.kind === "moto" ? 0.75 : 1.2;
    if (!world.blocked(nextX, nextZ, radius)) {
      this.group.position.x = nextX;
      this.group.position.z = nextZ;
    } else {
      let moved = false;
      if (!world.blocked(nextX, this.group.position.z, radius)) {
        this.group.position.x = nextX;
        moved = true;
      }
      if (!world.blocked(this.group.position.x, nextZ, radius)) {
        this.group.position.z = nextZ;
        moved = true;
      }
      if (!moved) this.speed *= -0.16;
      else this.speed *= 0.78;
    }
    this.group.position.x = clamp(this.group.position.x, -236, 217);
    this.group.position.z = clamp(this.group.position.z, -234, 234);
    this.animate(dt, night);
  }

  updateSiren(dt: number) {
    if (!this.visual.sirenRed || !this.visual.sirenBlue) return;
    this.sirenTime += dt;
    const on = Math.sin(this.sirenTime * 9) > 0;
    this.visual.sirenRed.emissiveIntensity = on ? 2.4 : 0.08;
    this.visual.sirenBlue.emissiveIntensity = on ? 0.08 : 2.4;
  }

  animate(dt: number, night: number) {
    this.wheelSpin += this.speed * dt * 2.4;
    for (const wheel of this.visual.wheels) wheel.rotation.x = this.wheelSpin;
    for (const wheel of this.visual.frontWheels) wheel.rotation.y = this.steering * 0.32;
    this.visual.brakeLights.emissiveIntensity = this.speed < 0.5 ? 1.18 : 0.3;
    this.visual.headlights.emissiveIntensity = 0.5 + night * 1.4;
    if (this.spec.kind === "police") this.updateSiren(dt);
    if (this.visual.shadow && this.visual.shadow.material) {
      try {
        (this.visual.shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 + night * 0.18;
      } catch {}
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
  }
}

export class TrafficVehicle {
  vehicle: Vehicle;
  axis: "x" | "z";
  dir: 1 | -1;
  lane: number;
  speed: number;
  start: number;
  end: number;
  stopTimer = 0;
  farTimer = 0;

  constructor(scene: THREE.Scene, spec: VehicleSpec, axis: "x" | "z", dir: 1 | -1, lane: number, start: number, end: number, rng: Rng) {
    const paint = ["#d7dfe2", "#365e78", "#b83939", "#e2c35d", "#3f715d", "#ded5c4", "#2c3038"][rng.int(0, 6)]!;
    this.vehicle = new Vehicle(spec, paint);
    this.axis = axis;
    this.dir = dir;
    this.lane = lane;
    this.speed = rng.range(8, 15);
    this.start = start;
    this.end = end;
    const pos = rng.range(start, end);
    if (axis === "x") {
      this.vehicle.place(pos, lane, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    } else {
      this.vehicle.place(lane, pos, dir > 0 ? 0 : Math.PI);
    }
    scene.add(this.vehicle.group);
  }

  update(dt: number, world: World, night: number, lowQuality = false, playerPos?: THREE.Vector3) {
    const v = this.vehicle;
    if (lowQuality && playerPos) {
      const dx = v.group.position.x - playerPos.x;
      const dz = v.group.position.z - playerPos.z;
      const distSqr = dx * dx + dz * dz;
      if (distSqr > 30 * 30) {
        v.group.scale.set(0.7, 0.7, 0.7);
        if (v.visual && v.visual.wheels) {
          for (const w of v.visual.wheels) {
            w.visible = false;
          }
        }
        if (this.axis === "x") {
          let nx = v.group.position.x + this.dir * this.speed * dt;
          if ((this.dir > 0 && nx > this.end) || (this.dir < 0 && nx < this.start)) {
            nx = this.dir > 0 ? this.start : this.end;
          }
          if (!world.blocked(nx, v.group.position.z, 1.2)) v.group.position.x = nx;
          else v.group.position.x += this.dir * 0.02;
        } else {
          let nz = v.group.position.z + this.dir * this.speed * dt;
          if ((this.dir > 0 && nz > this.end) || (this.dir < 0 && nz < this.start)) {
            nz = this.dir > 0 ? this.start : this.end;
          }
          if (!world.blocked(v.group.position.x, nz, 1.2)) v.group.position.z = nz;
          else v.group.position.z += this.dir * 0.02;
        }
        v.speed = this.speed;
        v.animate(dt, night);
        return;
      } else {
        v.group.scale.set(1, 1, 1);
        if (v.visual && v.visual.wheels) {
          for (const w of v.visual.wheels) {
            w.visible = true;
          }
        }
      }
    }
    if (this.axis === "x") {
      let nx = v.group.position.x + this.dir * this.speed * dt;
      if ((this.dir > 0 && nx > this.end) || (this.dir < 0 && nx < this.start)) {
        nx = this.dir > 0 ? this.start : this.end;
      }
      if (!world.blocked(nx, v.group.position.z, 1.2)) v.group.position.x = nx;
      else v.group.position.x += this.dir * 0.02;
    } else {
      let nz = v.group.position.z + this.dir * this.speed * dt;
      if ((this.dir > 0 && nz > this.end) || (this.dir < 0 && nz < this.start)) {
        nz = this.dir > 0 ? this.start : this.end;
      }
      if (!world.blocked(v.group.position.x, nz, 1.2)) v.group.position.z = nz;
      else v.group.position.z += this.dir * 0.02;
    }
    v.speed = this.speed;
    v.animate(dt, night);
  }

  dispose() {
    this.vehicle.dispose();
  }
}

export class PoliceCar {
  vehicle: Vehicle;
  target: THREE.Vector3;
  active = true;
  private rng = new Rng(Date.now() % 9999);
  private reverseTimer = 0;

  constructor(scene: THREE.Scene, x: number, z: number, target: THREE.Vector3) {
    this.vehicle = new Vehicle(getVehicle("police"), "#f2f4f5");
    this.vehicle.place(x, z, 0);
    this.target = target.clone();
    scene.add(this.vehicle.group);
  }

  update(dt: number, world: World, target: THREE.Vector3, night: number) {
    const v = this.vehicle;
    this.target.copy(target);
    const dx = target.x - v.group.position.x;
    const dz = target.z - v.group.position.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = ((desired - v.group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.4, -1, 1);
    if (dist > 5) {
      v.speed = damp(v.speed, 18, 2, dt);
    } else {
      v.speed = damp(v.speed, 4, 4, dt);
    }
    v.group.rotation.y += steer * 1.15 * dt * clamp(v.speed / 9, 0.2, 1);
    const nx = v.group.position.x + Math.sin(v.group.rotation.y) * v.speed * dt;
    const nz = v.group.position.z + Math.cos(v.group.rotation.y) * v.speed * dt;
    if (!world.blocked(nx, nz, 1.2)) {
      v.group.position.x = nx;
      v.group.position.z = nz;
    } else {
      this.reverseTimer = 0.6;
      if (this.reverseTimer > 0) {
        v.group.position.x += Math.sin(v.group.rotation.y + Math.PI) * 4 * dt;
        v.group.position.z += Math.cos(v.group.rotation.y + Math.PI) * 4 * dt;
      }
    }
    this.reverseTimer = Math.max(0, this.reverseTimer - dt);
    v.speed = Math.max(v.speed, 0);
    v.animate(dt, night);
  }

  dispose() {
    this.vehicle.dispose();
  }
}

export const randomTrafficSpec = (rng: Rng) => {
  const pool = ["sedan", "pop", "taxi", "van", "suv"];
  return getVehicle(pool[rng.int(0, pool.length - 1)]!);
};

export const vehicleOptions = VEHICLES.filter((v) => v.id !== "police");
