import * as THREE from "three";

// Stub minimo de canvas para rodar as texturas de fora do navegador.
const ctxProxy = new Proxy({} as Record<string, unknown>, {
  get(target, prop) {
    if (prop === "measureText") return () => ({ width: 12 });
    if (prop === "createLinearGradient" || prop === "createRadialGradient")
      return () => ({ addColorStop: () => {} });
    if (prop === "getImageData" || prop === "createImageData")
      return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (prop === "canvas") return { width: 1, height: 1 };
    if (prop in target) return target[prop as string];
    return () => {};
  },
  set(target, prop, value) {
    target[prop as string] = value;
    return true;
  },
});
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => ctxProxy }),
};

const { World } = await import("../src/world");
const { PERF, QUALITY } = await import("../src/config");
const { DynamicCuller } = await import("../src/dynamic-culling");

const triangles = (mesh: THREE.Mesh) => {
  const geo = mesh.geometry;
  const count = geo.index ? geo.index.count : geo.getAttribute("position").count;
  return count / 3;
};

const analyse = (quality: "low" | "medium" | "high") => {
  const scene = new THREE.Scene();
  const world = new World(scene, quality);
  const preset = QUALITY[quality];
  const culler = new DynamicCuller(preset.cullingDistance, 0.5);
  const staticCullables = world.registerStaticCullables(culler);
  const playerPosition = new THREE.Vector3(-17.3, 0, 30.6);
  culler.forceSweep(playerPosition);

  const cameraFar = quality === "low" ? preset.cullingDistance : preset.drawDistance + 120;
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, cameraFar);
  camera.position.set(-17.3, 3.2, 30.6);
  camera.lookAt(0, 1.2, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );

  let totalTris = 0;
  let totalMeshes = 0;
  let visibleTris = 0;
  let visibleMeshes = 0;
  const materialUse = new Map<string, number>();
  const chunkUse = new Map<string, number>();
  let lights = 0;
  let sprites = 0;
  let points = 0;
  let instanced = 0;

  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    const any = obj as unknown as {
      isMesh?: boolean;
      isInstancedMesh?: boolean;
      isLight?: boolean;
      isSprite?: boolean;
      isPoints?: boolean;
      visible: boolean;
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
    };
    if (any.isLight) lights++;
    if (any.isSprite) sprites++;
    if (any.isPoints) points++;
    if (!any.isMesh && !any.isInstancedMesh) return;
    totalMeshes++;
    const mesh = obj as THREE.Mesh;
    const tris = triangles(mesh);
    const instances = any.isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    if (any.isInstancedMesh) instanced++;
    totalTris += tris * instances;
    if (!obj.visible) return;
    if (!frustum.intersectsObject(mesh)) return;
    visibleTris += tris * instances;
    visibleMeshes++;
    const groups = mesh.geometry.groups;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const drawMaterials = materials.length > 1 && groups.length
      ? groups.map((group) => materials[group.materialIndex ?? 0]).filter((material): material is THREE.Material => Boolean(material))
      : [materials[0]!];
    for (const mat of drawMaterials) {
      const key = `${mat.type}|${mat.uuid}`;
      materialUse.set(key, (materialUse.get(key) ?? 0) + 1);
    }
    const chunk = (obj.userData?.cullCell as string) ?? "sem-celula";
    chunkUse.set(chunk, (chunkUse.get(chunk) ?? 0) + tris);
  });

  const drawCalls = [...materialUse.values()].reduce((a, b) => a + b, 0);
  const setPass = materialUse.size;
  let worstSampleDrawCalls = drawCalls;
  let worstSample = "";
  let worstSampleBreakdown: {
    geometryCalls: number;
    sprites: number;
    grouped: Array<{ name: string; groups: number; merged: boolean }>;
    materials: Array<{ type: string; color: string; textured: boolean; count: number }>;
  } = {
    geometryCalls: 0,
    sprites: 0,
    grouped: [],
    materials: [],
  };
  let sampleCount = 0;
  if (quality === "low") {
    const sampleLocations: Array<[number, number]> = [
      [-144, -144], [-96, -48], [-48, 0], [0, 0], [48, 48],
      [96, 96], [144, 144], [178, 0], [120, -120], [-120, 120],
    ];
    for (const [x, z] of sampleLocations) {
      for (let direction = 0; direction < 4; direction++) {
        const yaw = direction * Math.PI * 0.5;
        culler.forceSweep(new THREE.Vector3(x, 0, z));
        camera.position.set(x - Math.sin(yaw) * 8, 3.2, z - Math.cos(yaw) * 8);
        camera.lookAt(x, 1.2, z);
        camera.updateMatrixWorld(true);
        scene.updateMatrixWorld(true);
        const sampleFrustum = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        );
        let calls = 0;
        let geometryCalls = 0;
        let spriteCalls = 0;
        const grouped: Array<{ name: string; groups: number; merged: boolean }> = [];
        const sampleMaterials = new Map<string, { type: string; color: string; textured: boolean; count: number }>();
        scene.traverse((obj) => {
          const renderable = obj as unknown as {
            isMesh?: boolean;
            isInstancedMesh?: boolean;
            isSprite?: boolean;
            isPoints?: boolean;
            isLine?: boolean;
            isLineSegments?: boolean;
            geometry?: THREE.BufferGeometry;
            material?: THREE.Material | THREE.Material[];
          };
          if (!obj.visible) return;
          const isGeometry = Boolean(
            renderable.isMesh || renderable.isInstancedMesh || renderable.isPoints || renderable.isLine || renderable.isLineSegments,
          );
          if (isGeometry && !sampleFrustum.intersectsObject(obj)) return;
          if (!isGeometry && !renderable.isSprite) return;
          const groups = renderable.geometry?.groups ?? [];
          const objectCalls = groups.length || 1;
          calls += objectCalls;
          if (isGeometry) {
            geometryCalls += objectCalls;
            const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
            for (const material of materials) {
              if (!material) continue;
              const colored = material as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
              const color = colored.color ? `#${colored.color.getHexString()}` : "-";
              const textured = Boolean(colored.map);
              const key = `${material.type}|${color}|${textured}`;
              const info = sampleMaterials.get(key) ?? { type: material.type, color, textured, count: 0 };
              info.count += groups.length || 1;
              sampleMaterials.set(key, info);
            }
            if (groups.length > 1) {
              grouped.push({
                name: obj.name || obj.type,
                groups: groups.length,
                merged: Boolean(obj.userData?.merged),
              });
            }
          } else if (renderable.isSprite) {
            spriteCalls += objectCalls;
          }
        });
        if (calls > worstSampleDrawCalls) {
          worstSampleDrawCalls = calls;
          worstSample = `${x},${z},${direction}`;
          worstSampleBreakdown = {
            geometryCalls,
            sprites: spriteCalls,
            grouped,
            materials: [...sampleMaterials.values()].sort((a, b) => b.count - a.count).slice(0, 30),
          };
        }
        sampleCount++;
      }
    }
  }

  const materialDetail = new Map<string, { type: string; color: string; map: string; count: number; tris: number }>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if (!obj.visible) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      const key = mat.uuid;
    const entry = materialDetail.get(key) ?? {
      type: mat.type,
      color: (mat as THREE.MeshStandardMaterial).color ? `#${(mat as THREE.MeshStandardMaterial).color.getHexString()}` : "-",
      map: (mat as THREE.MeshStandardMaterial).map ? "tex" : "solid",
      count: 0,
      tris: 0,
    };
    entry.count++;
    entry.tris += triangles(mesh);
    materialDetail.set(key, entry);
  });

  return {
    quality,
    preset: {
      renderScale: preset.renderScale,
      antialias: preset.antialias,
      shadows: preset.shadows,
      targetFPS: preset.targetFPS,
      lodBias: preset.lodBias,
      cullingDistance: preset.cullingDistance,
    },
    staticCullables,
    cullerHidden: culler.hiddenCount,
    worstSampleDrawCalls,
    worstSample,
    worstSampleBreakdown,
    sampleCount,
    totalTris: Math.round(totalTris),
    visibleTris: Math.round(visibleTris),
    totalMeshes,
    visibleMeshes,
    drawCalls,
    setPass,
    materials: materialUse.size,
    lights,
    sprites,
    points,
    instanced,
    chunks: chunkUse.size,
    topChunks: [...chunkUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    materialBreakdown: [...materialDetail.values()].sort((a, b) => b.count - a.count),
  };
};

const drawCallBudget = PERF.budgetDrawCalls;

const verifyQualityAndCulling = () => {
  const low = QUALITY.low;
  if (low.renderScale !== 0.85 || low.antialias || low.shadows || low.targetFPS !== 30 || low.vSync !== 0) {
    throw new Error("O preset leve não corresponde às configurações pedidas para o A14.");
  }

  const culler = new DynamicCuller(PERF.cullDistance, PERF.cullInterval);
  const staticObject = new THREE.Object3D();
  const parkedVehicle = new THREE.Object3D();
  parkedVehicle.position.x = 0;
  culler.add(staticObject, { x: 0, z: 0, follow: false });
  culler.add(parkedVehicle, { follow: true, distance: PERF.vehicleActivateDistance });
  culler.forceSweep(new THREE.Vector3(100, 0, 0));
  if (staticObject.visible || parkedVehicle.visible) {
    throw new Error("O culling não ocultou objetos fora de 90m / veículos fora de 15m.");
  }
  culler.setDistance(120);
  culler.forceSweep(new THREE.Vector3(100, 0, 0));
  if (!staticObject.visible || parkedVehicle.visible) {
    throw new Error("A distância global precisa ser reconfigurável sem alterar o limite de 15m.");
  }
  parkedVehicle.position.x = 112;
  culler.forceSweep(new THREE.Vector3(100, 0, 0));
  if (!parkedVehicle.visible) throw new Error("O veículo parado não foi reativado perto do jogador.");

  const intervalCuller = new DynamicCuller(PERF.cullDistance, PERF.cullInterval);
  const distantObject = new THREE.Object3D();
  distantObject.position.x = 100;
  intervalCuller.add(distantObject);
  if (intervalCuller.update(0.49, new THREE.Vector3(0, 0, 0)) || !distantObject.visible) {
    throw new Error("O culling deve aguardar o intervalo de 0,5s.");
  }
  if (!intervalCuller.update(0.02, new THREE.Vector3(0, 0, 0)) || distantObject.visible) {
    throw new Error("O culling deve desligar o renderer na varredura de 0,5s.");
  }
};

verifyQualityAndCulling();

const sweepCells = (globalThis as unknown as { process?: { argv?: string[] } }).process?.argv?.includes("--sweep-cells");
if (sweepCells) {
  for (const cellSize of [48, 64, 72, 96, 128, 160, 240, 400, 800]) {
    PERF.worldCellSize = cellSize;
    const report = analyse("low");
    console.log(
      `cell=${cellSize} draw@spawn=${report.drawCalls} worst=${report.worstSampleDrawCalls} at ${report.worstSample} meshes=${report.totalMeshes}`,
    );
  }
} else {
for (const quality of ["low", "medium", "high"] as const) {
  const report = analyse(quality);
  console.log(`\n== ${quality} ==`);
  console.log(JSON.stringify(report, null, 2));
  if (quality === "low") {
    console.log(`\nmeta draw calls < ${drawCallBudget}: ${report.drawCalls}`);
    if (report.worstSampleDrawCalls >= drawCallBudget) {
      throw new Error(`O perfil leve excede a meta de draw calls: ${report.worstSampleDrawCalls} >= ${drawCallBudget}`);
    }
    console.log(`pior amostra em ${report.sampleCount} vistas: ${report.worstSampleDrawCalls} draw calls`);
  }
}
}
