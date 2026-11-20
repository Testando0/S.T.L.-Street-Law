import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Pass } from "three/addons/postprocessing/Pass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { QualityPreset } from "./config";

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.34 },
    uSaturation: { value: 1.07 },
    uContrast: { value: 1.045 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.9, 0.18, dot(d, d) * 2.0);
      col *= mix(1.0 - uVignette, 1.0, vig);
      gl_FragColor = vec4(max(col, 0.0), src.a);
    }
  `,
};

class SpriteHiddenPass extends Pass {
  private inner: Pass;
  private scene: THREE.Scene;
  private hidden: THREE.Object3D[] = [];

  constructor(inner: Pass, scene: THREE.Scene) {
    super();
    this.inner = inner;
    this.scene = scene;
    this.needsSwap = inner.needsSwap;
  }

  setSize(width: number, height: number) {
    this.inner.setSize(width, height);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    this.scene.traverse((object) => {
      const candidate = object as THREE.Object3D & { isSprite?: boolean };
      if (candidate.isSprite && object.visible) {
        object.visible = false;
        this.hidden.push(object);
      }
    });
    this.inner.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    for (const object of this.hidden) object.visible = true;
    this.hidden.length = 0;
  }

  dispose() {
    this.inner.dispose();
  }
}

export class PostPipeline {
  composer: EffectComposer;
  active = false;
  private gtao: GTAOPass;
  private gtaoWrap: SpriteHiddenPass;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.renderTarget1.samples = 4;
    this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, 512, 512);
    this.gtao.updateGtaoMaterial({
      radius: 0.42,
      distanceExponent: 1,
      thickness: 1,
      scale: 1,
      samples: 12,
      screenSpaceRadius: false,
    });
    this.gtao.blendIntensity = 0.9;
    this.gtaoWrap = new SpriteHiddenPass(this.gtao, scene);
    this.composer.addPass(this.gtaoWrap);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.62, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(gradeShader);
    this.composer.addPass(this.grade);
    this.gtaoWrap.enabled = false;
    this.bloom.enabled = false;
  }

  get gtaoOn() {
    return this.gtaoWrap.enabled;
  }

  setQuality(preset: QualityPreset) {
    this.active = preset.post;
    this.gtaoWrap.enabled = preset.ao && !(preset.disableSSAO);
    this.bloom.enabled = preset.bloom && preset.name !== "low";
    this.grade.enabled = true;
    if (preset.name === "low") {
      this.grade.uniforms.uSaturation.value = 1.07 + (preset.saturationBoost ?? 0.15);
      this.grade.uniforms.uContrast.value = 1.045 + (preset.contrastBoost ?? 0.05);
      this.grade.uniforms.uVignette.value = 0.28;
    } else if (preset.name === "medium") {
      this.grade.uniforms.uSaturation.value = 1.07 + (preset.saturationBoost ?? 0.08);
      this.grade.uniforms.uContrast.value = 1.045 + (preset.contrastBoost ?? 0.03);
      this.grade.uniforms.uVignette.value = 0.34;
    } else {
      this.grade.uniforms.uSaturation.value = 1.07 + (preset.saturationBoost ?? 0.05);
      this.grade.uniforms.uContrast.value = 1.045 + (preset.contrastBoost ?? 0.02);
      this.grade.uniforms.uVignette.value = 0.36;
    }
  }

  setAoEnabled(enabled: boolean) {
    this.gtaoWrap.enabled = enabled;
  }

  resize(width: number, height: number, pixelRatio: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = Math.max(0.2, pixelRatio);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
    const drawWidth = Math.max(1, Math.round(this.width * this.pixelRatio));
    const drawHeight = Math.max(1, Math.round(this.height * this.pixelRatio));
    this.gtao.setSize(Math.max(2, Math.round(drawWidth * 0.5)), Math.max(2, Math.round(drawHeight * 0.5)));
  }

  render(delta: number) {
    this.composer.render(delta);
  }

  dispose() {
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }
}
