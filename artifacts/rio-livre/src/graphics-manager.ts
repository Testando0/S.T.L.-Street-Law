import * as THREE from "three";
import { QUALITY, QualityName, QualityPreset } from "./config";
import { GameSettings } from "./profile";

export interface GraphicsPresetData {
  targetFPS: number;
  vSync: number;
  renderScale: number;
  shadowQuality: "off" | "low" | "medium" | "high";
  textureQuality: "half" | "full";
  lodBias: number;
  fogStart: number;
  fogEnd: number;
  fogColor: string;
  cullingDistance: number;
  maxCars: number;
  maxNPCs: number;
  saturationBoost: number;
  contrastBoost: number;
  shadows: boolean;
  shadowSize: number;
  antialias: boolean;
  drawDistance: number;
  post: boolean;
  ao: boolean;
  bloom: boolean;
  motionBlur: boolean;
  reflexos: boolean;
  grama: boolean;
  tremor: boolean;
  pixelRatio: number;
  traffic: number;
  people: number;
  rain: boolean;
  oceanPhysical: boolean;
  maxLights: number;
  useBlobShadows: boolean;
  useAtlasMaterials: boolean;
  useObjectPooling: boolean;
  disableSSAO: boolean;
}

export class GraphicsManager {
  private static instance: GraphicsManager | null = null;
  private currentQuality: QualityName = "medium";
  private currentPreset: QualityPreset = QUALITY.medium;

  static getInstance(): GraphicsManager {
    if (!GraphicsManager.instance) {
      GraphicsManager.instance = new GraphicsManager();
    }
    return GraphicsManager.instance;
  }

  applyLeve(renderer?: THREE.WebGLRenderer, scene?: THREE.Scene): GraphicsPresetData {
    const preset = QUALITY.low;
    this.currentQuality = "low";
    this.currentPreset = preset;

    if (renderer) {
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.needsUpdate = true;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1;
      (renderer as any).setPixelRatio = (renderer as any).setPixelRatio || ((v: number) => {});
      try {
        renderer.setPixelRatio(preset.pixelRatio * preset.renderScale);
      } catch {}
      if ((renderer as any).outputColorSpace) {
        (renderer as any).outputColorSpace = (THREE as any).SRGBColorSpace;
      }
      if ((renderer as any).physicallyCorrectLights !== undefined) {
        (renderer as any).physicallyCorrectLights = false;
      }
    }

    if (scene) {
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.set(preset.fogColor);
        scene.fog.near = preset.fogStart;
        scene.fog.far = preset.fogEnd;
      } else if ((THREE as any).FogExp2) {
        scene.fog = new (THREE as any).FogExp2(preset.fogColor, 0.012);
      } else {
        scene.fog = new THREE.Fog(preset.fogColor, preset.fogStart, preset.fogEnd);
      }
      if (renderer) {
        renderer.setClearColor(preset.fogColor);
      }
    }

    return this.toPresetData(preset);
  }

  getPreset(quality: QualityName): QualityPreset {
    return QUALITY[quality];
  }

  getCurrentPreset(): QualityPreset {
    return this.currentPreset;
  }

  getCurrentQuality(): QualityName {
    return this.currentQuality;
  }

  applyPreset(quality: QualityName, renderer?: THREE.WebGLRenderer, scene?: THREE.Scene): GraphicsPresetData {
    const preset = QUALITY[quality];
    this.currentQuality = quality;
    this.currentPreset = preset;

    if (renderer) {
      renderer.shadowMap.enabled = preset.shadows;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.needsUpdate = true;
      renderer.toneMapping = quality === "low" ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = quality === "high" ? 1.16 : quality === "medium" ? 1.12 : 1;
      if (scene) {
        renderer.setClearColor("#87b7e6");
      }
    }

    if (scene && scene.fog instanceof THREE.Fog) {
      scene.fog.near = preset.fogStart ?? preset.drawDistance * 0.3;
      scene.fog.far = preset.fogEnd ?? preset.drawDistance;
      try {
        if (preset.fogColor) {
          scene.fog.color.set(preset.fogColor);
        }
      } catch {}
    }

    return this.toPresetData(preset);
  }

  toPresetData(preset: QualityPreset): GraphicsPresetData {
    return {
      targetFPS: preset.targetFPS,
      vSync: preset.vSync,
      renderScale: preset.renderScale,
      shadowQuality: preset.shadowQuality,
      textureQuality: preset.textureQuality,
      lodBias: preset.lodBias,
      fogStart: preset.fogStart,
      fogEnd: preset.fogEnd,
      fogColor: preset.fogColor,
      cullingDistance: preset.cullingDistance,
      maxCars: preset.maxCars,
      maxNPCs: preset.maxNPCs,
      saturationBoost: preset.saturationBoost,
      contrastBoost: preset.contrastBoost,
      shadows: preset.shadows,
      shadowSize: preset.shadowSize,
      antialias: preset.antialias,
      drawDistance: preset.drawDistance,
      post: preset.post,
      ao: preset.ao,
      bloom: preset.bloom,
      motionBlur: preset.motionBlur,
      reflexos: preset.reflexos,
      grama: preset.grama,
      tremor: preset.tremor,
      pixelRatio: preset.pixelRatio,
      traffic: preset.traffic,
      people: preset.people,
      rain: preset.rain,
      oceanPhysical: preset.oceanPhysical,
      maxLights: preset.maxLights,
      useBlobShadows: preset.useBlobShadows,
      useAtlasMaterials: preset.useAtlasMaterials,
      useObjectPooling: preset.useObjectPooling,
      disableSSAO: preset.disableSSAO,
    };
  }

  detectAutoPreset(): QualityName {
    try {
      if (typeof navigator === "undefined") return "medium";
      const ua = navigator.userAgent || "";
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const cores = (navigator as any).hardwareConcurrency || 4;
      const mem = (navigator as any).deviceMemory || 4;
      if (isMobile) return "low";
      if (cores <= 4 && mem <= 4) return "low";
      if (cores <= 6 || mem <= 6) return "medium";
      return "high";
    } catch {
      return "medium";
    }
  }

  getRecommendedPreset(): QualityName {
    return this.detectAutoPreset();
  }

  saveToSettings(settings: GameSettings): GameSettings {
    const preset = this.currentPreset;
    return {
      ...settings,
      renderScale: preset.renderScale,
      targetFPS: preset.targetFPS,
      vSync: preset.vSync,
      lodBias: preset.lodBias,
      fogStart: preset.fogStart,
      fogEnd: preset.fogEnd,
      cullingDistance: preset.cullingDistance,
      maxCars: preset.maxCars,
      maxNPCs: preset.maxNPCs,
      saturationBoost: preset.saturationBoost,
      contrastBoost: preset.contrastBoost,
      useBlobShadows: preset.useBlobShadows,
      useAtlasMaterials: preset.useAtlasMaterials,
      useObjectPooling: preset.useObjectPooling,
    };
  }
}

export const graphicsManager = GraphicsManager.getInstance();
