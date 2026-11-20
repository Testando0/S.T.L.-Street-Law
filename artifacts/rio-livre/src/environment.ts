import * as THREE from "three";
import { QUALITY, type QualityPreset, type QualityName } from "./config";
import { makeGlowTexture } from "./textures";
import { clamp, damp, lerp, smoothstep } from "./util";

const FOG_RAIN_GRAY = new THREE.Color("#6f8f8f");
const SUN_COLOR_DAY = new THREE.Color("#ffe7a8");
const SUN_GLOW_DAY = new THREE.Color("#ffe9b0");

const skyVertex = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const skyFragment = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform vec3 sunColor;
uniform vec3 sunDirection;
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float h = max(dir.y, 0.0);
  vec3 col = mix(bottomColor, topColor, pow(h, 0.42));
  float horizon = exp(-h * 9.0);
  col = mix(col, bottomColor * 1.04, horizon * 0.3);
  float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
  col += sunColor * (pow(sunDot, 9.0) * 0.2 + pow(sunDot, 140.0) * 0.85);
  col += sunColor * smoothstep(0.99955, 0.99988, sunDot) * 1.1;
  if (dir.y < 0.0) col = mix(col, bottomColor * 0.62, clamp(-dir.y * 3.5, 0.0, 1.0));
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dither - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface EnvironmentState {
  time: number;
  night: number;
  weather: "SOL" | "CHUVA";
  altitude: number;
}

export class Environment {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  time = 10.4;
  night = 0;
  private renderer: THREE.WebGLRenderer;
  private pmrem: THREE.PMREMGenerator;
  private envRT?: THREE.WebGLRenderTarget;
  private envCanvas: HTMLCanvasElement;
  private envCtx: CanvasRenderingContext2D;
  private envTexture: THREE.CanvasTexture;
  private envTimer = 99;
  private lastEnvNight = -1;
  private shadowInterval = 0;
  private shadowTimer = 0;
  private shadowFocus = new THREE.Vector3(9999, 0, 9999);
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private sunMesh: THREE.Mesh;
  private sunGlow: THREE.Sprite;
  private moon: THREE.Mesh;
  private moonGlow: THREE.Sprite;
  private fill: THREE.DirectionalLight;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private rain?: THREE.Points;
  private rainBase?: Float32Array;
  private rainActive = false;
  private weatherTimer = 0;
  private preset: QualityPreset;
  private sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
  private focus = new THREE.Vector3();
  private baseDraw = 190;
  private skyBuilt = 230;
  private starsBuilt = 235;
  private dayTop = new THREE.Color("#1f6fb2");
  private dayBottom = new THREE.Color("#cfe6e4");
  private sunsetTop = new THREE.Color("#69547f");
  private sunsetBottom = new THREE.Color("#ff9db5");
  private nightTop = new THREE.Color("#020b17");
  private nightBottom = new THREE.Color("#09242c");
  private scratchTop = new THREE.Color();
  private scratchBottom = new THREE.Color();
  private scratchSun = new THREE.Color();
  private scratchSunset = new THREE.Color("#ff9db5");
  private scratchSunLight = new THREE.Color("#fff4dd");
  private scratchSunLightB = new THREE.Color("#ffc0c8");
  private scratchHemi = new THREE.Color("#bcdde8");
  private scratchHemiB = new THREE.Color("#3b5570");
  private scratchHemiGround = new THREE.Color("#5c6449");
  private scratchHemiGroundB = new THREE.Color("#0e2024");
  private scratchFillA = new THREE.Color("#9dc4d8");
  private scratchFillB = new THREE.Color("#f2a5bc");
  private scratchFillC = new THREE.Color("#2f4a6a");
  private scratchFog = new THREE.Color("#6f8f8f");
  private scratchGlow = new THREE.Color();
  private scratchGlowB = new THREE.Color("#ff8a45");
  private scratchDir = new THREE.Vector3();

  constructor(scene: THREE.Scene, quality: QualityName, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.preset = QUALITY[quality];
    this.baseDraw = this.preset.drawDistance;
    this.skyBuilt = this.baseDraw + 40;
    this.starsBuilt = this.baseDraw + 45;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.envCanvas = document.createElement("canvas");
    this.envCanvas.width = 512;
    this.envCanvas.height = 256;
    this.envCtx = this.envCanvas.getContext("2d")!;
    this.envTexture = new THREE.CanvasTexture(this.envCanvas);
    this.envTexture.mapping = THREE.EquirectangularReflectionMapping;
    this.envTexture.colorSpace = THREE.SRGBColorSpace;

    this.hemi = new THREE.HemisphereLight("#cfe8ed", "#4a5540", 0.65);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff0d0", 2.35);
    this.sun.castShadow = this.preset.shadows;
    this.sun.shadow.mapSize.set(this.preset.shadowSize, this.preset.shadowSize);
    this.sun.shadow.camera.left = -64;
    this.sun.shadow.camera.right = 64;
    this.sun.shadow.camera.top = 64;
    this.sun.shadow.camera.bottom = -64;
    this.sun.shadow.camera.near = 40;
    this.sun.shadow.camera.far = 460;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.radius = 2;
    this.sun.shadow.camera.updateProjectionMatrix();
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight("#9dc4d8", 0.18);
    this.fill.position.set(-80, 55, -70);
    scene.add(this.fill);

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color("#2f8fca") },
        bottomColor: { value: new THREE.Color("#d8e9e4") },
        sunColor: { value: new THREE.Color("#ffe0a0") },
        sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(this.skyBuilt, 24, 16), this.skyMat);
    this.sky.renderOrder = -100;
    scene.add(this.sky);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(13, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#fff1b5", transparent: true, opacity: 0.95, fog: false }),
    );
    this.sunMesh.renderOrder = -90;
    scene.add(this.sunMesh);

    const glowTexture = makeGlowTexture();
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: "#ffe3a4",
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.sunGlow.scale.set(88, 88, 1);
    this.sunGlow.renderOrder = -89;
    scene.add(this.sunGlow);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(9, 14, 10),
      new THREE.MeshBasicMaterial({ color: "#e8eef4", transparent: true, opacity: 0, fog: false }),
    );
    this.moon.renderOrder = -90;
    scene.add(this.moon);

    this.moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: "#c9dcf2",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.moonGlow.scale.set(80, 80, 1);
    this.moonGlow.renderOrder = -89;
    scene.add(this.moonGlow);

    const starCount = 900;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.46;
      const r = this.starsBuilt;
      positions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      positions[i * 3 + 1] = Math.sin(phi) * r + 30;
      positions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: "#e8f4ff",
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.renderOrder = -95;
    scene.add(this.stars);

    scene.fog = new THREE.Fog("#8CB5D6", this.baseDraw * 0.3, this.baseDraw);
    this.refreshEnvironment(new THREE.Color("#2f8fca"), new THREE.Color("#d8e9e4"), 0.9, 0);
    this.buildRain();
  }

  private refreshEnvironment(top: THREE.Color, bottom: THREE.Color, day: number, sunset: number) {
    const ctx = this.envCtx;
    const w = this.envCanvas.width;
    const h = this.envCanvas.height;
    const topHex = `#${top.getHexString()}`;
    const bottomHex = `#${bottom.getHexString()}`;
    const groundHex = `#${bottom.clone().multiplyScalar(0.42).getHexString()}`;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, topHex);
    grad.addColorStop(0.46, bottomHex);
    grad.addColorStop(0.53, bottomHex);
    grad.addColorStop(0.57, groundHex);
    grad.addColorStop(1, "#1a201c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const u = Math.atan2(this.sunDir.z, this.sunDir.x) / (Math.PI * 2) + 0.5;
    const v = Math.acos(clamp(this.sunDir.y, -1, 1)) / Math.PI;
    const sx = u * w;
    const sy = v * h;
    const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, 88);
    glow.addColorStop(0, `rgba(255,246,214,${0.95 - sunset * 0.15})`);
    glow.addColorStop(0.15, "rgba(255,227,158,.72)");
    glow.addColorStop(0.45, "rgba(255,190,110,.18)");
    glow.addColorStop(1, "rgba(255,170,90,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.16 + sunset * 0.12;
    ctx.fillStyle = "#fff3d4";
    for (let i = 0; i < 9; i++) {
      const cy = 64 + i * 9;
      const cw = 60 + i * 22;
      ctx.beginPath();
      ctx.ellipse((i * 91 + 40) % w, cy, cw, 7 + (i % 3) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    this.envTexture.needsUpdate = true;
    const rt = this.pmrem.fromEquirectangular(this.envTexture);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.2 + day * 0.72;
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
  }

  private buildRain() {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 38;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.rainBase = new Float32Array(positions);
    const mat = new THREE.PointsMaterial({
      color: "#b8e5ec",
      size: 0.09,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  setQuality(quality: QualityName) {
    this.preset = QUALITY[quality];
    this.baseDraw = this.preset.drawDistance;
    this.sun.castShadow = this.preset.shadows;
    this.sun.shadow.mapSize.set(this.preset.shadowSize, this.preset.shadowSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.sun.shadow.needsUpdate = true;
    this.shadowTimer = 0;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.preset.fogStart ?? this.baseDraw * 0.3;
    fog.far = this.preset.fogEnd ?? this.baseDraw;
    if (this.preset.fogColor) {
      try {
        fog.color.set(this.preset.fogColor);
      } catch {}
    } else if (this.preset.name === "low") {
      try {
        fog.color.set("#8CB5D6");
        fog.near = 40;
        fog.far = 110;
      } catch {}
    }
    this.sky.scale.setScalar((this.baseDraw + 40) / this.skyBuilt);
    this.stars.scale.setScalar((this.baseDraw + 45) / this.starsBuilt);
  }

  setFocus(x: number, z: number) {
    this.focus.set(x, 0, z);
  }

  setShadowInterval(seconds: number) {
    this.shadowInterval = Math.max(0, seconds);
    this.shadowTimer = 0;
    this.sun.shadow.autoUpdate = this.shadowInterval <= 0;
    this.sun.shadow.needsUpdate = true;
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera) {
    this.time = (this.time + dt * 0.009) % 24;
    this.focus.copy(focus);
    const altitude = Math.sin(((this.time - 6) / 12) * Math.PI);
    const night = clamp(1 - smoothstep(-0.1, 0.18, altitude), 0, 1);
    this.night = night;
    const sunset = Math.exp(-Math.pow((altitude - 0.03) / 0.16, 2));
    const day = clamp(altitude, 0, 1);

    const top = this.scratchTop.copy(this.dayTop).lerp(this.nightTop, night);
    top.lerp(this.sunsetTop, sunset * (1 - night) * 0.85);
    const bottom = this.scratchBottom.copy(this.dayBottom).lerp(this.nightBottom, night);
    bottom.lerp(this.sunsetBottom, sunset * (1 - night));

    this.skyMat.uniforms.topColor.value.copy(top);
    this.skyMat.uniforms.bottomColor.value.copy(bottom);
    const sunColor = this.scratchSun.copy(SUN_COLOR_DAY).lerp(this.scratchSunset, sunset);
    this.skyMat.uniforms.sunColor.value.copy(sunColor);

    const theta = (this.time / 24) * Math.PI * 2 - Math.PI / 2;
    this.sunDir.set(Math.cos(theta) * 0.85, Math.max(0.08, altitude), Math.sin(theta) * 0.85).normalize();
    this.skyMat.uniforms.sunDirection.value.copy(this.sunDir);

    this.sun.position.set(focus.x + this.sunDir.x * 190, this.sunDir.y * 240 + 20, focus.z + this.sunDir.z * 190);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.color.copy(this.scratchSunLight).lerp(this.scratchSunLightB, sunset);
    this.sun.intensity = 0.16 + day * 2.58;
    this.hemi.intensity = 0.22 + day * 0.63;
    this.hemi.color.copy(this.scratchHemi).lerp(this.scratchHemiB, night);
    this.hemi.groundColor.copy(this.scratchHemiGround).lerp(this.scratchHemiGroundB, night);
    this.fill.intensity = day * 0.24;
    this.fill.color.copy(this.scratchFillA).lerp(this.scratchFillB, sunset).lerp(this.scratchFillC, night);

    this.sky.position.set(focus.x, 10, focus.z);
    this.stars.position.set(focus.x, 0, focus.z);
    this.starMat.opacity = night * 0.85;
    this.sunMesh.position.copy(camera.position).addScaledVector(this.sunDir, this.baseDraw + 30);
    (this.sunMesh.material as THREE.MeshBasicMaterial).opacity = clamp(altitude * 3.2, 0, 1) * 0.95;
    this.sunMesh.scale.setScalar(0.8 + sunset * 0.45);
    this.sunGlow.position.copy(this.sunMesh.position);
    (this.sunGlow.material as THREE.SpriteMaterial).opacity = clamp(altitude * 2.2, 0, 1) * (0.16 + sunset * 0.34);
    (this.sunGlow.material as THREE.SpriteMaterial).color.copy(this.scratchGlow.copy(SUN_GLOW_DAY).lerp(this.scratchGlowB, sunset));
    this.scratchDir.copy(this.sunDir).negate();
    this.moon.position.copy(camera.position).addScaledVector(this.scratchDir, this.baseDraw + 30);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = night * 0.82;
    this.moonGlow.position.copy(this.moon.position);
    (this.moonGlow.material as THREE.SpriteMaterial).opacity = night * 0.32;

    this.envTimer += dt;
    if (this.envTimer > 900 || Math.abs(night - this.lastEnvNight) > 0.55) {
      this.envTimer = 0;
      this.lastEnvNight = night;
      this.refreshEnvironment(top, bottom, day, sunset);
    }

    if (this.shadowInterval > 0 && this.sun.castShadow) {
      this.shadowTimer += dt;
      const moved = this.focus.distanceToSquared(this.shadowFocus) > 1.5 * 1.5;
      if (this.shadowTimer >= this.shadowInterval || moved) {
        this.shadowTimer = 0;
        this.shadowFocus.copy(this.focus);
        this.sun.shadow.needsUpdate = true;
      }
    }

    this.weatherTimer += dt;
    const raining = this.weatherTimer > 165 && this.weatherTimer < 230;
    this.rainActive = this.preset.rain && raining;
    if (this.rain) this.rain.visible = this.rainActive;
    if (this.rain && this.rainBase && this.rainActive) {
      const attr = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= dt * 26;
        if (arr[i + 1] < 0) {
          arr[i] = (Math.random() - 0.5) * 80;
          arr[i + 1] = 38;
          arr[i + 2] = (Math.random() - 0.5) * 80;
        }
      }
      attr.needsUpdate = true;
      this.rain.position.set(focus.x, 0, focus.z);
    }
    if (this.weatherTimer > 320) this.weatherTimer = 0;

    const fog = this.scene.fog as THREE.Fog;
    const fogColor = this.scratchFog.copy(bottom).lerp(FOG_RAIN_GRAY, this.rainActive ? 0.45 : 0);
    fog.color.copy(fogColor);
    // Usa o alcance do preset em vez de encostar a neblina a 30% do draw
    // distance: era isso que deixava o modo leve sem visao nenhuma.
    fog.near = this.preset.fogStart ?? this.baseDraw * 0.45;
    const fogEnd = (this.preset.fogEnd ?? this.baseDraw) * (this.rainActive ? 0.72 : 1);
    fog.far = damp(fog.far, fogEnd, 3, dt);
  }

  getState(): EnvironmentState {
    return {
      time: this.time,
      night: this.night,
      weather: this.rainActive ? "CHUVA" : "SOL",
      altitude: Math.sin(((this.time - 6) / 12) * Math.PI),
    };
  }

  isRaining() {
    return this.rainActive;
  }
}
