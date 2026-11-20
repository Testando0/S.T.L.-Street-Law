import * as THREE from "three";
import { AudioEngine } from "./audio";
import { CharacterModel } from "./character";
import {
  GARAGE,
  HOUSES,
  MATERIALS,
  MEDICINES,
  PEDESTRIAN_FINE,
  PEDESTRIAN_HIT_SPEED,
  PERF,
  QUALITY,
  ROAD_LINES,
  SPAWN,
  commerceBounds,
  commerceCounter,
  commerceDoor,
  commerceEnterPoint,
  getClothes,
  getFood,
  getHouse,
  getMaterial,
  getMedicine,
  getVehicle,
  houseBedUse,
  houseBounds,
  houseDoor,
  houseEnterPoint,
  houseSellPrice,
  houseWardrobeUse,
  insideCommerce,
  insideHouse,
  levelForXp,
  type CommerceSpec,
  type HouseSpec,
  type QualityName,
} from "./config";
import { Environment } from "./environment";
import { DynamicCuller } from "./dynamic-culling";
import { FrameLimiter } from "./frame-limiter";
import { InputManager } from "./input";
import { MissionManager, type MissionEvent } from "./missions";
import { NetworkClient, RemotePlayers, getServerBase } from "./network";
import { PedestrianSystem, type VehicleHit } from "./pedestrians";
import { PostPipeline } from "./post";
import { addXp, loadProfile, saveProfile, type PlayerProfile } from "./profile";
import { UIManager, type UICallbacks } from "./ui";
import { Rng, angleLerp, clamp, damp, dist2 } from "./util";
import { PoliceCar, TrafficVehicle, Vehicle, randomTrafficSpec } from "./vehicles";
import { World } from "./world";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Mode = "menu" | "playing";

export class Game {
  canvas: HTMLCanvasElement;
  profile: PlayerProfile;
  ui: UIManager;
  audio = new AudioEngine();
  input = new InputManager();
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  post?: PostPipeline;
  world!: World;
  environment!: Environment;
  missions!: MissionManager;
  pedestrians!: PedestrianSystem;
  network!: NetworkClient;
  remote!: RemotePlayers;
  player: CharacterModel;
  playerCar!: Vehicle;
  vehicles: Vehicle[] = [];
  traffic: TrafficVehicle[] = [];
  police: PoliceCar[] = [];
  pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  currentVehicle: Vehicle | null = null;
  mode: Mode = "menu";
  paused = false;
  private modalPaused = false;
  private cameraYaw = Math.PI;
  private cameraPitch = 0.36;
  private shake = 0;
  private crashCooldown = 0;
  private elapsed = 0;
  private lastTime = 0;
  private hudTimer = 0;
  private clockTimer = 0;
  private missionTimer = 0;
  private saveTimer = 0;
  private minimapTimer = 0;
  private fpsTimer = 0;
  private fpsFrames = 0;
  private renderScale = 1;
  /** Multiplicador adaptativo (0.6..1) aplicado sobre a escala do preset. */
  private renderScaleFactor = 1;
  private basePixelRatio = 1;
  private badSamples = 0;
  private goodSamples = 0;
  private aoDegraded = false;
  private shadowThrottled = false;
  /** Teto de FPS (30 no modo leve). Nada de renderizar a 60 em celular. */
  private frameLimiter = new FrameLimiter(30);
  /** Culling por distancia: varre a cada 0.5s e desliga o que passou de 90m. */
  private culler = new DynamicCuller(PERF.cullDistance, PERF.cullInterval);
  /** Carros parados: longe de 15m eles ficam "desligados" (sem update nem draw). */
  private parkedVehicles = new Set<Vehicle>();
  private lastNight = -1;
  private lastWanted = -1;
  private lastMissionId: string | null = null;
  private networkStatus: "connecting" | "online" | "offline" = "offline";
  private installEvent: BeforeInstallPromptEvent | null = null;
  private bustedCooldown = 0;
  private sirenActive = false;
  private focus = new THREE.Vector3();
  private cameraTarget = new THREE.Vector3();
  private cameraDesired = new THREE.Vector3();
  private cameraLook = new THREE.Vector3();
  private walkTarget = new THREE.Vector3();
  private suppressNetworkToast = false;
  private damageCooldown = 0;
  private hungerWarn = 0;
  private dead = false;
  private deathTimer = 0;
  private deathReason = "";
  private lastVitalSave = 0;
  private interior: CommerceSpec | null = null;
  private houseInterior: HouseSpec | null = null;
  private wantedCooldown = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.profile = loadProfile();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.player = new CharacterModel(this.profile.skin, this.profile.shirt, this.profile.pants, this.profile.hair);
    this.player.setContactShadow(QUALITY[this.profile.settings.quality].useBlobShadows);
    this.player.group.visible = false;
    this.player.group.userData.noMerge = true;
    this.scene.add(this.player.group);
    this.input.setEnabled(false);
    this.ui = new UIManager(this.profile, this.callbacks());
    this.input.onPause = () => {
      if (this.mode !== "playing" || this.ui.isModalOpen()) return;
      this.ui.openModal("pause");
    };
    this.audio.setVolumes(this.profile.settings.masterVolume, this.profile.settings.musicVolume);
    document.body.classList.toggle("touch", this.input.isTouch);
    this.setupWindowEvents();
  }

  async boot() {
    this.ui.setLoading(6, "Acordando a cidade GhostCity...");
    await this.nextFrame();
    const preset = QUALITY[this.profile.settings.quality];
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
    this.renderScale = preset.renderScale ?? 1;
    this.frameLimiter.setTargetFPS(preset.targetFPS ?? 30);
    this.culler.setDistance(preset.cullingDistance ?? PERF.cullDistance);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: preset.antialias,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(this.basePixelRatio * this.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = preset.name === "high" ? 1.0 : preset.name === "medium" ? 1.12 : 1.05;
    this.renderer.setClearColor(preset.fogColor);
    this.camera.far = preset.name === "low" ? preset.drawDistance + 70 : preset.drawDistance + 120;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    // O pipeline de post so nasce quando o preset pede. No modo leve isso
    // economiza ~60MB de VRAM (render target MSAA 4x, GTAO e bloom).
    if (preset.post) {
      this.post = new PostPipeline(this.renderer, this.scene, this.camera);
      this.post.setQuality(preset);
      this.post.resize(window.innerWidth, window.innerHeight, this.basePixelRatio * this.renderScale);
    }
    this.ui.setLoading(17, "Esculpindo morros e avenidas...");
    await this.nextFrame();
    this.world = new World(this.scene, this.profile.settings.quality);
    this.world.registerStaticCullables(this.culler);
    this.ui.setLoading(39, "Acendendo os postes da orla...");
    await this.nextFrame();
    this.environment = new Environment(this.scene, this.profile.settings.quality, this.renderer);
    this.pedestrians = new PedestrianSystem(this.scene, this.world, this.profile.settings.quality);
    this.setupPlayerPosition();
    this.spawnPlayerCar(true);
    this.spawnParkedVehicles();
    this.spawnTraffic();
    this.culler.forceSweep(this.pos);
    this.ui.setLoading(60, "Abrindo a garagem e o ponto de táxi...");
    await this.nextFrame();
    this.missions = new MissionManager(this.scene, this.world);
    this.missions.onEvent = (event) => this.handleMissionEvent(event);
    this.remote = new RemotePlayers(this.scene);
    this.setupNetwork();
    this.ui.setLoading(78, "Ligando o sinal do celular...");
    await this.nextFrame();
    this.ui.refreshProfile(this.profile);
    this.ui.renderMissionCards(this.missions.getMissionCards(this.pos));
    this.ui.setActiveMission(null);
    this.ui.setClock(this.environment.time, "SOL");
    this.ui.updateOnline(0, false, "Procurando servidor...");
    this.network.connect(this.profile);
    this.ui.setLoading(96, "Preparando os primeiros passos...");
    await this.nextFrame();
    this.lastTime = performance.now();
    this.updateMenuCamera(0, true);
    this.ui.finishLoading();
    requestAnimationFrame(this.tick);
  }

  private callbacks(): UICallbacks {
    return {
      onPlay: (online) => this.startGame(online),
      onModalOpen: (name) => this.handleModalOpen(name),
      onModalClose: () => this.handleModalClose(),
      onMissionTrack: (id) => this.trackMission(id),
      onCallVehicle: () => this.callVehicle(),
      onGarageAction: (id) => this.selectGarageVehicle(id),
      onUpgrade: (kind) => this.buyUpgrade(kind),
      onPaint: (color) => this.setPaint(color),
      onSpawnVehicle: () => this.spawnSelectedVehicle(),
      onSaveCustomize: (name, skin, shirt, pants, hair) => this.saveCustomization(name, skin, shirt, pants, hair),
      onSaveSettings: (settings) => this.saveSettings(settings),
      onQualityChange: (quality) => {
        this.persist();
        this.applyQuality(quality);
      },
      onSetOnline: (online) => this.setOnlineMode(online),
      onResetSave: () => this.resetSave(),
      onResume: () => this.ui.closeModal(),
      onLeave: () => this.leaveToMenu(),
      onChat: (text) => this.sendChat(text),
      onFullscreen: () => this.toggleFullscreen(),
      onInstall: () => this.installApp(),
      onPause: () => this.ui.openModal("pause"),
      onMapOpen: () => undefined,
      onShopBuy: (id, kind) => this.buyShopItem(id, kind),
      onUseItem: (id) => this.useItem(id),
      onEquipClothes: (id) => this.equipClothes(id),
      onBuyHouse: (id) => this.buyHouse(id),
      onSellHouse: (id) => this.sellHouse(id),
      onRestAtHome: () => this.restAtHome(),
      onGoHome: () => this.goHome(),
    };
  }

  private setupWindowEvents() {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => window.setTimeout(() => this.resize(), 240));
    window.addEventListener("beforeunload", () => this.persist());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.persist();
        this.audio.suspend();
      } else {
        this.audio.resume();
      }
    });
    document.addEventListener("fullscreenchange", () => this.ui.setFullscreenLabel(Boolean(document.fullscreenElement)));
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.installEvent = event as BeforeInstallPromptEvent;
      this.ui.setInstallPrompt(() => this.installApp());
    });
    window.addEventListener("appinstalled", () => {
      this.installEvent = null;
      this.ui.setInstallPrompt(null);
      this.ui.toast("App instalado", "RedRP agora está na sua tela inicial.", "good");
    });
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.ui.toast("Gráficos pausados", "Toque na tela para tentar recuperar o mundo.", "bad");
    });
    this.canvas.addEventListener("webglcontextrestored", () => this.resize());
  }

  private nextFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  private applyRenderScale() {
    if (!this.renderer) return;
    const ratio = Math.max(0.35, this.basePixelRatio * this.renderScale * this.renderScaleFactor);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (this.post?.active) this.post.resize(window.innerWidth, window.innerHeight, ratio);
  }

  private resize() {
    if (!this.renderer) return;
    const preset = QUALITY[this.profile.settings.quality];
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
    this.applyRenderScale();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.far = preset.name === "low" ? preset.drawDistance + 70 : preset.drawDistance + 120;
    this.camera.updateProjectionMatrix();
  }

  private setupPlayerPosition() {
    let x = this.profile.lastPosition.x;
    let z = this.profile.lastPosition.z;
    if (this.world.blocked(x, z, 0.5)) {
      const spot = this.world.findFreeSpot(SPAWN.x, SPAWN.z, 0.6);
      x = spot.x;
      z = spot.z;
    }
    this.pos.set(x, 0, z);
    this.player.group.position.copy(this.pos);
    this.player.group.rotation.y = this.profile.lastPosition.ry || 0;
    this.cameraYaw = this.player.group.rotation.y + Math.PI;
  }

  private spawnPlayerCar(force = false) {
    const spec = getVehicle(this.profile.activeVehicle);
    const upgrades = this.profile.upgrades[spec.id] ?? { engine: 0, turbo: 0, tires: 0 };
    const car = new Vehicle(spec, this.profile.paint, upgrades);
    const spot = force
      ? this.world.findFreeSpot(SPAWN.x, SPAWN.z + 4.7, 2.2)
      : this.world.findFreeSpot(this.pos.x + 4.2, this.pos.z + 3.4, 2.2);
    car.place(spot.x, spot.z, this.player.group.rotation.y);
    this.scene.add(car.group);
    this.playerCar = car;
    this.vehicles.push(car);
    this.registerParkedVehicle(car);
  }

  /**
   * Carro parado = objeto estatico. Longe de 15m ele fica "desligado":
   * some do culling por distancia e para de existir para o jogador.
   */
  private registerParkedVehicle(car: Vehicle) {
    this.parkedVehicles.add(car);
    this.culler.add(car.group, {
      follow: true,
      distance: PERF.vehicleActivateDistance,
    });
  }

  private unregisterParkedVehicle(car: Vehicle) {
    this.parkedVehicles.delete(car);
    this.culler.remove(car.group);
  }

  private spawnParkedVehicles() {
    const rng = new Rng(8123);
    const preset = QUALITY[this.profile.settings.quality];
    const limit = preset.name === "low" ? 4 : preset.name === "medium" ? 8 : 10;
    const spots: Array<[number, number, number]> = [
      [-32, 46, 0],
      [-36, 35, Math.PI],
      [8, 41, Math.PI / 2],
      [14, -10, 0],
      [-54, 17, Math.PI / 2],
      [-100, -101, Math.PI],
      [64, 76, -Math.PI / 2],
      [103, 101, Math.PI],
      [53, -139, 0],
      [-150, 73, Math.PI / 2],
    ];
    let spawned = 0;
    for (const [x, z, ry] of spots) {
      if (spawned >= limit) break;
      if (this.playerCar && dist2(x, z, this.playerCar.position.x, this.playerCar.position.z) < 7) continue;
      const spot = this.world.findFreeSpot(x, z, 1.8);
      const car = new Vehicle(randomTrafficSpec(rng), rng.pick(["#d7dfe2", "#365e78", "#b83939", "#e2c35d", "#3f715d", "#ded5c4", "#2c3038"]), {
        engine: rng.int(0, 1),
        turbo: 0,
        tires: rng.int(0, 1),
      });
      car.place(spot.x, spot.z, ry);
      this.scene.add(car.group);
      this.vehicles.push(car);
      this.registerParkedVehicle(car);
      this.world.addVehicleCollider(spot.x, spot.z, car.spec.size[0] ?? 1.9, car.spec.size[2] ?? 4.1, ry);
      spawned++;
    }
  }

  private spawnTraffic() {
    const preset = QUALITY[this.profile.settings.quality];
    const rng = new Rng(33117);
    const maxCars = preset.name === "low" ? 4 : (preset.maxCars ?? preset.traffic);
    for (let i = 0; i < maxCars; i++) {
      const axis = i % 2 === 0 ? "z" : "x";
      const line = ROAD_LINES[(i * 3 + 1) % ROAD_LINES.length]!;
      const offset = i % 4 < 2 ? 2.15 : -2.15;
      const dir = (i % 3 === 0 ? -1 : 1) as 1 | -1;
      const lane = line + offset;
      const traffic = new TrafficVehicle(this.scene, randomTrafficSpec(rng), axis, dir, lane, -166, 166, rng);
      this.traffic.push(traffic);
      // Carro de transito some alem do limite de culling (o script dele para).
      this.culler.add(traffic.vehicle.group, { follow: true, radius: 3.2 });
    }
  }

  private setupNetwork() {
    this.network = new NetworkClient({
      onStatus: (status, detail) => {
        const previous = this.networkStatus;
        this.networkStatus = status;
        const online = status === "online";
        const label = detail ?? (status === "connecting" ? "Conectando ao servidor..." : "Modo solo ativo");
        this.ui.updateOnline(this.network.onlineCount, online, label);
        this.ui.setServerStatus(online, online ? `Conectado ao servidor · ${this.network.onlineCount} jogadores` : label);
        if (status === "offline" && previous === "online" && !this.suppressNetworkToast) {
          this.ui.toast("Conexão perdida", "O jogo continua no modo solo.", "bad");
        }
        if (status === "online" && previous !== "online" && this.mode === "playing") {
          this.ui.toast("Você está online", "A cidade agora tem outras pessoas.", "good");
        }
      },
      onCount: (count) => {
        const online = this.network.status === "online";
        this.ui.updateOnline(count, online);
      },
      onWelcome: (players) => {
        this.remote.clear();
        for (const player of players) {
          if (player.id !== this.profile.id) this.remote.add(player);
        }
        const count = Math.max(this.remote.count + 1, this.network.onlineCount);
        this.ui.updateOnline(count, true);
        this.ui.setServerStatus(true, `Conectado ao servidor · ${count} jogadores`);
      },
      onPlayerUpdate: (player) => {
        if (player.id !== this.profile.id) this.remote.update(player);
      },
      onPlayerLeave: (id) => {
        this.remote.remove(id);
        this.ui.updateOnline(this.remote.count + 1, this.network.status === "online");
      },
      onChat: (name, text, system) => this.ui.addChatBubble(name, text, system),
    });
  }

  private startGame(online: boolean) {
    if (this.mode === "playing") return;
    this.audio.unlock().catch(() => undefined);
    this.mode = "playing";
    this.paused = false;
    this.modalPaused = false;
    this.dead = false;
    this.deathTimer = 0;
    this.damageCooldown = 0;
    this.ui.hideDeath();
    if (!this.profile.hp || this.profile.hp <= 0) this.profile.hp = this.profile.maxHp || 100;
    if (this.profile.hunger === undefined) this.profile.hunger = 100;
    this.ui.setVitals(this.profile.hp, this.profile.maxHp || 100, this.profile.hunger, this.profile.maxHunger || 100);
    this.ui.startGame();
    this.ui.showHud();
    this.input.setEnabled(true);
    this.ui.setFullscreenLabel(Boolean(document.fullscreenElement));
    if (online) {
      this.profile.stats.onlineSessions++;
      this.profile.settings.online = true;
      this.persist();
      if (this.network?.status === "offline") this.network.connect(this.profile);
    } else {
      this.profile.settings.online = false;
      this.persist();
      this.suppressNetworkToast = true;
      this.network?.disconnect();
      this.suppressNetworkToast = false;
      this.remote.clear();
      this.ui.updateOnline(0, false, "Modo solo ativo");
      this.ui.setServerStatus(false, "Modo solo · sem outros jogadores");
    }
    this.ui.setActiveMission(this.missions.active?.id ?? this.missions.trackedId);
    this.ensureCarNearPlayer();
    this.player.setVisible(!this.currentVehicle);
    if (!this.profile.tutorialDone) {
      this.profile.tutorialDone = true;
      this.persist();
      window.setTimeout(() => {
        if (this.mode === "playing" && !this.ui.isModalOpen()) this.ui.openModal("help");
      }, 900);
    } else {
      this.ui.toast("Bem-vindo de volta", `${this.profile.name}, a cidade está esperando.`, "info");
    }
    this.updateCamera(1, true);
    this.ui.setMission(this.missions.getHudMission(this.pos));
    this.ui.setWanted(this.missions.wanted);
    if (online && this.network.status === "offline" && !getServerBase(this.profile)) {
      this.ui.toast("Servidor indisponível", "Jogando em modo solo até a conexão voltar.", "info");
    } else if (online && this.network.status !== "online") {
      this.ui.toast("Entrando na cidade online", "Conectando ao servidor...", "info");
    }
  }

  private leaveToMenu() {
    if (this.currentVehicle) this.exitVehicle(true);
    this.mode = "menu";
    this.paused = false;
    this.modalPaused = false;
    this.input.setEnabled(false);
    this.player.setVisible(false);
    this.audio.setEngine(false);
    this.audio.setSiren(false);
    this.sirenActive = false;
    this.ui.setMission(null);
    this.ui.setObjective(null);
    this.ui.setSpeed(0, null);
    this.ui.setWanted(0);
    this.ui.setPrompt("", null);
    this.ui.showMenu();
    this.persist();
    this.updateMenuCamera(0, true);
  }

  private ensureCarNearPlayer() {
    if (!this.playerCar) return;
    if (dist2(this.playerCar.position.x, this.playerCar.position.z, this.pos.x, this.pos.z) < 18) return;
    const spot = this.world.findFreeSpot(this.pos.x + 4.2, this.pos.z + 3.4, 2.2);
    this.playerCar.place(spot.x, spot.z, this.player.group.rotation.y);
    this.playerCar.speed = 0;
  }

  private handleModalOpen(name: string) {
    if (this.mode !== "playing") return;
    this.paused = true;
    this.modalPaused = true;
    this.input.setEnabled(false);
    this.audio.setEngine(false);
    this.ui.setPrompt("", null);
    if (name === "garage") this.ui.renderGarage();
  }

  private handleModalClose() {
    if (!this.modalPaused) return;
    this.modalPaused = false;
    this.paused = false;
    this.input.setEnabled(true);
    if (this.currentVehicle) this.audio.setEngine(true, this.currentVehicle.speed);
  }

  private processActions() {
    if (this.input.consumeAction("pause")) {
      this.ui.openModal("pause");
      return;
    }
    if (this.input.consumeAction("phone")) {
      this.ui.openPhone("missions");
      return;
    }
    if (this.input.consumeAction("map")) {
      this.ui.openPhone("map");
      return;
    }
    if (this.input.consumeAction("chat")) {
      this.ui.openChat();
    }
    if (this.input.consumeAction("vehicle")) this.toggleVehicle();
    if (this.input.consumeAction("interact")) this.interact();
    if (this.input.consumeAction("jump") && !this.currentVehicle) this.jump();
  }

  private toggleVehicle() {
    if (this.currentVehicle) {
      this.exitVehicle();
      return;
    }
    const car = this.findNearestVehicle(6);
    if (!car) {
      this.ui.toast("Nenhum veículo por perto", "Abra o celular e chame o seu carro.", "info");
      return;
    }
    this.enterVehicle(car);
  }

  private findNearestVehicle(radius: number) {
    let best: Vehicle | null = null;
    let bestDist = radius;
    for (const car of this.vehicles) {
      const d = dist2(car.position.x, car.position.z, this.pos.x, this.pos.z);
      if (d < bestDist) {
        best = car;
        bestDist = d;
      }
    }
    return best;
  }

  private enterVehicle(car: Vehicle) {
    this.currentVehicle = car;
    car.driverId = this.profile.id;
    car.speed = 0;
    this.player.jumpVelocity = 0;
    this.player.group.position.y = 0;
    this.player.setVisible(false);
    this.player.group.position.copy(car.position);
    this.cameraYaw = car.rotation + Math.PI;
    this.cameraPitch = 0.33;
    this.audio.setEngine(true, 0);
    this.ui.toast(car.spec.name, "Veículo em uso. Acelere com o direcional.", "info");
    this.updateCamera(1, true);
  }

  private exitVehicle(force = false) {
    const car = this.currentVehicle;
    if (!car) return;
    const sideX = Math.cos(car.rotation);
    const sideZ = -Math.sin(car.rotation);
    const candidates = [
      { x: car.position.x + sideX * 2.5, z: car.position.z + sideZ * 2.5 },
      { x: car.position.x - sideX * 2.5, z: car.position.z - sideZ * 2.5 },
      { x: car.position.x - Math.sin(car.rotation) * 4.6, z: car.position.z - Math.cos(car.rotation) * 4.6 },
    ];
    let spot = candidates[0]!;
    for (const candidate of candidates) {
      if (!this.world.blocked(candidate.x, candidate.z, 0.55)) {
        spot = candidate;
        break;
      }
    }
    car.driverId = null;
    car.speed = 0;
    this.currentVehicle = null;
    this.pos.set(spot.x, 0, spot.z);
    this.player.jumpVelocity = 0;
    this.player.group.position.copy(this.pos);
    this.player.group.rotation.y = car.rotation;
    this.player.setVisible(true);
    this.cameraYaw = car.rotation + Math.PI;
    this.audio.setEngine(false);
    this.ensureCarNearPlayer();
    if (!force) this.ui.toast("De volta a pé", "O carro fica aqui, tranquilo.", "info");
    this.updateCamera(1, true);
  }

  private interact() {
    if (this.currentVehicle) {
      const result = this.missions.interact(this.pos, true);
      this.handleMissionResult(result);
      return;
    }
    if (this.houseInterior) {
      const house = this.houseInterior;
      const bed = houseBedUse(house);
      if (dist2(bed.x, bed.z, this.pos.x, this.pos.z) < 2.4) {
        this.audio.click();
        this.sleepAtBed(house);
        return;
      }
      const wardrobe = houseWardrobeUse(house);
      if (dist2(wardrobe.x, wardrobe.z, this.pos.x, this.pos.z) < 2.2) {
        this.audio.click();
        this.ui.openWardrobe();
        return;
      }
      const door = houseDoor(house);
      if (dist2(door.x, door.z, this.pos.x, this.pos.z) < 2.9) {
        this.audio.click();
        this.leaveHouse();
        return;
      }
      this.ui.toast("Sua casa", "Approxime-se da cama para dormir ou do guarda-roupa para trocar de roupa.", "info");
      return;
    }
    if (this.interior) {
      const counter = commerceCounter(this.interior);
      if (dist2(counter.x, counter.z, this.pos.x, this.pos.z) < 2.4) {
        this.audio.click();
        this.ui.openShop(this.interior);
        return;
      }
      const door = commerceDoor(this.interior);
      if (dist2(door.x, door.z, this.pos.x, this.pos.z) < 2.9) {
        this.audio.click();
        this.leaveCommerce();
        return;
      }
      this.ui.toast("Balcão à frente", "Aproxime-se do balcão para comprar ou da porta para sair.", "info");
      return;
    }
    const commerce = this.nearestCommerce(3.6);
    if (commerce) {
      this.audio.click();
      this.enterCommerce(commerce);
      return;
    }
    const house = this.nearestHouse(3.6);
    if (house) {
      this.audio.click();
      if (this.profile.ownedHouses.includes(house.id)) {
        this.enterHouse(house);
      } else {
        this.ui.openHouse(house);
      }
      return;
    }
    const result = this.missions.interact(this.pos, false);
    this.handleMissionResult(result);
  }

  private enterCommerce(commerce: CommerceSpec) {
    const point = commerceEnterPoint(commerce);
    this.pos.set(point.x, 0, point.z);
    this.player.group.position.set(point.x, 0, point.z);
    this.player.group.rotation.y = commerce.facing === "north" ? Math.PI : 0;
    this.player.jumpVelocity = 0;
    this.player.setVisible(true);
    this.cameraYaw = commerce.facing === "north" ? 0 : Math.PI;
    this.cameraPitch = 0.16;
    this.interior = commerce;
    this.world.setActiveShop(commerce.id);
    this.world.showCommerceInterior(commerce);
    this.updateCamera(1, true);
    this.ui.toast(`Você entrou no ${commerce.name}`, commerce.desc, "info");
  }

  private leaveCommerce() {
    const commerce = this.interior;
    if (!commerce) return;
    const door = commerceDoor(commerce);
    const spot = this.world.findFreeSpot(door.x, door.z, 0.6);
    this.world.hideCommerceInterior(commerce);
    this.world.setActiveShop(null);
    this.interior = null;
    this.pos.set(spot.x, 0, spot.z);
    this.player.group.position.set(spot.x, 0, spot.z);
    this.player.group.rotation.y = 0;
    this.player.setVisible(!this.currentVehicle);
    this.cameraYaw = 0;
    this.cameraPitch = 0.36;
    this.updateCamera(1, true);
    this.ui.toast("De volta à rua", `Você saiu do ${commerce.name}.`, "info");
  }

  private enterHouse(house: HouseSpec) {
    const point = houseEnterPoint(house);
    this.pos.set(point.x, 0, point.z);
    this.player.group.position.set(point.x, 0, point.z);
    this.player.group.rotation.y = house.facing === "north" ? Math.PI : 0;
    this.player.jumpVelocity = 0;
    this.player.setVisible(true);
    this.cameraYaw = house.facing === "north" ? 0 : Math.PI;
    this.cameraPitch = 0.22;
    this.houseInterior = house;
    this.updateCamera(1, true);
    this.ui.toast(`Você entrou em ${house.name}`, "Dormir na cama recupera vida. O guarda-roupa troca o visual.", "info");
  }

  private leaveHouse() {
    const house = this.houseInterior;
    if (!house) return;
    const door = houseDoor(house);
    const spot = this.world.findFreeSpot(door.x, door.z, 0.6);
    this.houseInterior = null;
    this.pos.set(spot.x, 0, spot.z);
    this.player.group.position.set(spot.x, 0, spot.z);
    this.player.group.rotation.y = 0;
    this.player.setVisible(!this.currentVehicle);
    this.cameraYaw = 0;
    this.cameraPitch = 0.36;
    this.updateCamera(1, true);
    this.ui.toast("De volta à rua", `Você saiu de ${house.name}.`, "info");
  }

  private sleepAtBed(house: HouseSpec) {
    this.profile.hp = this.profile.maxHp || 100;
    this.profile.hunger = Math.min(this.profile.maxHunger || 100, this.profile.hunger + 45);
    this.ui.setVitals(this.profile.hp, this.profile.maxHp || 100, this.profile.hunger, this.profile.maxHunger || 100);
    this.ui.toast("Boa noite", `Você dormiu em ${house.name}. Vida restaurada e fome aliviada.`, "good");
    this.audio.chime(true);
    this.persist();
    this.ui.refreshProfile(this.profile);
  }

  private updateInteriorState() {
    if (this.houseInterior) {
      if (insideHouse(this.houseInterior, this.pos.x, this.pos.z)) return;
      const house = this.houseInterior;
      this.houseInterior = null;
      this.player.setVisible(!this.currentVehicle);
      this.cameraPitch = 0.36;
      this.ui.toast("De volta à rua", `Você saiu de ${house.name}.`, "info");
      return;
    }
    if (!this.interior) return;
    if (insideCommerce(this.interior, this.pos.x, this.pos.z)) return;
    const commerce = this.interior;
    this.interior = null;
    this.player.setVisible(!this.currentVehicle);
    this.cameraPitch = 0.36;
    this.ui.toast("De volta à rua", `Você saiu do ${commerce.name}.`, "info");
  }

  private commercePoint(commerce: CommerceSpec) {
    return commerceDoor(commerce);
  }

  private housePoint(house: HouseSpec) {
    return houseDoor(house);
  }

  private nearestCommerce(radius: number) {
    let best: CommerceSpec | null = null;
    let bestDist = radius;
    for (const commerce of this.world.shops) {
      const point = this.commercePoint(commerce);
      const d = dist2(point.x, point.z, this.pos.x, this.pos.z);
      if (d < bestDist) {
        best = commerce;
        bestDist = d;
      }
    }
    return best;
  }

  private nearestHouse(radius: number) {
    let best: HouseSpec | null = null;
    let bestDist = radius;
    for (const house of HOUSES) {
      const point = this.housePoint(house);
      const d = dist2(point.x, point.z, this.pos.x, this.pos.z);
      if (d < bestDist) {
        best = house;
        bestDist = d;
      }
    }
    return best;
  }

  private buyShopItem(id: string, kind: "food" | "medicine" | "clothes" | "material") {
    if (kind === "food" || kind === "medicine") {
      const spec = kind === "food" ? getFood(id) : getMedicine(id);
      if (!spec) return;
      if (this.profile.money < spec.price) {
        this.ui.toast("Saldo insuficiente", `Faltam ${(spec.price - this.profile.money).toLocaleString("pt-BR")} reais.`, "bad");
        return;
      }
      this.profile.money -= spec.price;
      const item = this.profile.inventory.find((entry) => entry.id === spec.id && entry.type === kind);
      if (item) item.count++;
      else this.profile.inventory.push({ id: spec.id, type: kind, count: 1, name: spec.name, hunger: spec.hunger, heal: spec.heal });
      this.ui.toast("Compra feita", `${spec.name} foi para o inventário.`, "good");
      this.audio.pickup();
    } else if (kind === "material") {
      const material = getMaterial(id);
      if (!material) return;
      if (this.profile.money < material.price) {
        this.ui.toast("Saldo insuficiente", `Faltam ${(material.price - this.profile.money).toLocaleString("pt-BR")} reais.`, "bad");
        return;
      }
      this.profile.money -= material.price;
      const item = this.profile.inventory.find((entry) => entry.id === material.id && entry.type === "item");
      if (item) item.count++;
      else this.profile.inventory.push({ id: material.id, type: "item", count: 1, name: material.name });
      const upgrades = this.profile.upgrades[this.profile.activeVehicle];
      if (upgrades) {
        if (material.kind === "engine") upgrades.engine += 1;
        else if (material.kind === "turbo") upgrades.turbo += 1;
        else if (material.kind === "tires") upgrades.tires += 1;
      }
      this.ui.toast("Peça instalada", `${material.name} aplicada no seu veículo.`, "good");
      this.audio.pickup();
    } else {
      const clothes = getClothes(id);
      if (!clothes) return;
      if (this.profile.ownedClothes.includes(clothes.id)) {
        this.equipClothes(clothes.id);
        return;
      }
      if (this.profile.money < clothes.price) {
        this.ui.toast("Saldo insuficiente", `Faltam ${(clothes.price - this.profile.money).toLocaleString("pt-BR")} reais.`, "bad");
        return;
      }
      this.profile.money -= clothes.price;
      this.profile.ownedClothes.push(clothes.id);
      this.equipClothes(clothes.id, true);
      this.ui.toast("Roupa comprada", `${clothes.name} já está no seu visual.`, "good");
    }
    this.persist();
    this.ui.refreshProfile(this.profile);
    this.ui.refreshShop();
  }

  private equipClothes(id: string, silent = false) {
    const clothes = getClothes(id);
    if (!clothes || !this.profile.ownedClothes.includes(clothes.id)) return;
    if (clothes.slot === "shirt") this.profile.shirt = clothes.color;
    else this.profile.pants = clothes.color;
    this.player.setColors({
      skin: this.profile.skin,
      shirt: this.profile.shirt,
      pants: this.profile.pants,
      hair: this.profile.hair,
    });
    this.ui.applyAvatarColors();
    this.persist();
    this.ui.refreshProfile(this.profile);
    this.ui.refreshShop();
    if (!silent) this.ui.toast("Roupa equipada", clothes.name, "good");
  }

  private useItem(id: string) {
    const item = this.profile.inventory.find((entry) => entry.id === id && (entry.type === "food" || entry.type === "medicine"));
    const spec = item?.type === "medicine" ? getMedicine(id) : getFood(id);
    if (!item || !spec) return;
    item.count--;
    if (item.count <= 0) this.profile.inventory = this.profile.inventory.filter((entry) => entry !== item);
    this.profile.hunger = Math.min(this.profile.maxHunger || 100, this.profile.hunger + (spec.hunger ?? 0));
    this.profile.hp = Math.min(this.profile.maxHp || 100, this.profile.hp + (spec.heal ?? 0));
    this.ui.setVitals(this.profile.hp, this.profile.maxHp || 100, this.profile.hunger, this.profile.maxHunger || 100);
    this.ui.toast("Consumido", `${spec.name}: +${spec.hunger ?? 0} fome${spec.heal ? ` · +${spec.heal} vida` : ""}.`, "good");
    this.audio.pickup();
    this.persist();
    this.ui.refreshProfile(this.profile);
  }

  private buyHouse(id: string) {
    const house = getHouse(id);
    if (!house) return;
    const owned = this.profile.ownedHouses.includes(house.id);
    if (owned) {
      this.profile.houseId = house.id;
      this.ui.toast("Casa selecionada", `${house.name} agora é seu ponto de retorno.`, "good");
      this.persist();
      this.ui.refreshProfile(this.profile);
      this.ui.refreshShop();
      return;
    }
    if (this.profile.money < house.price) {
      this.ui.toast("Saldo insuficiente", `Faltam ${(house.price - this.profile.money).toLocaleString("pt-BR")} reais.`, "bad");
      return;
    }
    this.profile.money -= house.price;
    this.profile.ownedHouses.push(house.id);
    this.profile.houseId = house.id;
    this.ui.toast("Casa comprada", `${house.name} é sua. Vá até a porta e entre para descansar.`, "good");
    this.audio.chime(true);
    this.persist();
    this.ui.refreshProfile(this.profile);
    this.ui.refreshShop();
  }

  private sellHouse(id: string) {
    const house = getHouse(id);
    if (!house) return;
    if (!this.profile.ownedHouses.includes(house.id)) {
      this.ui.toast("Imóvel não é seu", "Só dá para vender imóveis que você comprou.", "bad");
      return;
    }
    const value = houseSellPrice(house);
    this.profile.money += value;
    this.profile.ownedHouses = this.profile.ownedHouses.filter((entry) => entry !== house.id);
    if (this.profile.houseId === house.id) {
      this.profile.houseId = this.profile.ownedHouses[0] ?? null;
    }
    this.ui.toast("Imóvel vendido", `${house.name} vendeu por ${value.toLocaleString("pt-BR")} reais.`, "good");
    this.audio.chime(true);
    this.persist();
    this.ui.refreshProfile(this.profile);
    this.ui.refreshShop();
  }

  private homePoint() {
    const house = this.profile.houseId ? getHouse(this.profile.houseId) : null;
    if (!house) return null;
    return this.housePoint(house);
  }

  private restAtHome() {
    const house = this.profile.houseId ? getHouse(this.profile.houseId) : null;
    if (!house) {
      this.ui.toast("Sem casa", "Compre uma casa na imobiliária primeiro.", "info");
      return;
    }
    const point = this.housePoint(house);
    if (dist2(point.x, point.z, this.pos.x, this.pos.z) > 14) {
      this.ui.toast("Vá para casa", `${house.name} fica longe daqui. Use o mapa para voltar.`, "info");
      return;
    }
    this.profile.hp = this.profile.maxHp || 100;
    this.profile.hunger = Math.min(this.profile.maxHunger || 100, this.profile.hunger + 45);
    this.ui.setVitals(this.profile.hp, this.profile.maxHp || 100, this.profile.hunger, this.profile.maxHunger || 100);
    this.ui.toast("Descanso em casa", "Vida restaurada e fome aliviada.", "good");
    this.persist();
    this.ui.refreshProfile(this.profile);
  }

  private goHome() {
    const house = this.profile.houseId ? getHouse(this.profile.houseId) : null;
    if (!house) return;
    const point = this.housePoint(house);
    const spot = this.world.findFreeSpot(point.x, point.z, 0.8);
    if (this.currentVehicle) this.exitVehicle(true);
    this.pos.set(spot.x, 0, spot.z);
    this.player.group.position.set(spot.x, 0, spot.z);
    this.ui.closeModal();
    this.ui.toast("Em casa", `Você voltou para ${house.name}.`, "info");
    this.updateCamera(1, true);
  }

  private handleMissionResult(event: MissionEvent | null) {
    if (!event) return;
    if (event.type === "started") {
      this.ui.toast(event.mission?.title ?? "Missão iniciada", event.text ?? "Siga o marcador no mapa.", "info");
      this.audio.click();
      this.lastWanted = -1;
      this.syncMissionUI();
    } else if (event.type === "pickup") {
      this.ui.toast("Coleta", event.text ?? "Item recolhido.", "good");
      this.audio.pickup();
    }
  }

  private handleMissionEvent(event: MissionEvent) {
    if (event.type === "completed" && event.mission) {
      const mission = event.mission;
      const reward = event.reward ?? mission.reward;
      const xp = event.xp ?? mission.xp;
      this.profile.money += reward;
      this.profile.stats.missions++;
      const level = addXp(this.profile, xp);
      if (mission.kind === "race") {
        const raceTime = Math.max(0, mission.time - Math.max(0, mission.timer));
        if (raceTime > 0 && (!this.profile.stats.bestRace || raceTime < this.profile.stats.bestRace)) {
          this.profile.stats.bestRace = raceTime;
        }
      }
      this.ui.toast(event.text ?? "Missão concluída", "Trabalho entregue na cidade.", "good", { money: reward, xp });
      this.audio.chime(true);
      if (level.leveled) {
        const bonus = level.after * 250;
        this.profile.money += bonus;
        window.setTimeout(() => {
          this.ui.toast(`Nível ${level.after}`, `Você subiu de nível. Bônus de ${bonus.toLocaleString("pt-BR")} reais.`, "good");
        }, 600);
      }
      this.persist();
      this.ui.refreshProfile(this.profile);
      this.lastWanted = -1;
      this.syncMissionUI();
    } else if (event.type === "failed") {
      this.ui.toast("Missão falhou", event.text ?? "Tente de novo quando quiser.", "bad");
      this.audio.chime(false);
      this.lastWanted = -1;
      this.syncMissionUI();
    } else if (event.type === "checkpoint") {
      this.ui.toast("Checkpoint", event.text ?? "Continue!", "good");
      this.audio.pickup();
      this.syncMissionUI();
    }
  }

  private syncMissionUI() {
    if (!this.missions) return;
    this.ui.setMission(this.missions.getHudMission(this.pos));
    this.ui.setActiveMission(this.missions.active?.id ?? this.missions.trackedId);
    this.ui.renderMissionCards(this.missions.getMissionCards(this.pos));
  }

  private trackMission(id: string) {
    this.missions.track(id);
    const activeId = this.missions.active?.id ?? this.missions.trackedId;
    this.ui.setActiveMission(activeId);
    this.ui.renderMissionCards(this.missions.getMissionCards(this.pos));
    if (this.mode === "menu") {
      this.startGame(this.network.status === "online");
    } else if (this.ui.currentModal === "phone") {
      this.ui.closeModal();
    }
    const mission = this.missions.missions.find((m) => m.id === id);
    if (mission) this.ui.toast("Objetivo marcado", mission.title, "info");
  }

  private jump() {
    if (this.player.group.position.y > 0.02 || this.player.jumpVelocity > 0) return;
    this.player.jumpVelocity = 5.4;
  }

  private updatePlaying(dt: number) {
    if (this.dead) {
      this.deathTimer = Math.max(0, this.deathTimer - dt);
      this.ui.updateDeath(this.deathTimer);
      if (this.deathTimer <= 0) this.revive();
      this.updateCamera(dt);
      return;
    }
    const look = this.input.consumeLook();
    const sensitivity = this.profile.settings.sensitivity;
    this.cameraYaw -= look.x * 0.0042 * sensitivity;
    this.cameraPitch = clamp(this.cameraPitch + look.y * 0.0028 * sensitivity, -1.35, 1.08);
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    this.bustedCooldown = Math.max(0, this.bustedCooldown - dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    if (this.currentVehicle) {
      const car = this.currentVehicle;
      const throttle = clamp(this.input.moveY, -1, 1);
      const steer = clamp(-this.input.moveX, -1, 1);
      const beforeSpeed = car.speed;
      const beforeX = car.position.x;
      const beforeZ = car.position.z;
      car.updatePlayer(dt, throttle, steer, this.world, this.environment.night);
      const moved = dist2(beforeX, beforeZ, car.position.x, car.position.z);
      this.profile.stats.distance += moved;
      this.pos.set(car.position.x, 0, car.position.z);
      this.player.group.position.copy(this.pos);
      this.player.group.rotation.y = car.rotation;
      if (
        Math.abs(beforeSpeed) > 7 &&
        Math.abs(car.speed) < Math.abs(beforeSpeed) * 0.52 &&
        this.crashCooldown <= 0
      ) {
        this.crashCooldown = 0.9;
        this.shake = Math.min(1, Math.abs(beforeSpeed) * 0.04);
        if (this.profile.settings.cameraShake) this.audio.crash();
      }
      if (Math.abs(car.speed) > 1.5 && Math.abs(look.x) < 0.2) {
        this.cameraYaw = angleLerp(this.cameraYaw, car.rotation + Math.PI, Math.min(1, dt * 2.4));
      }
      this.audio.setEngine(true, car.speed);
      this.updateCamera(dt);
    } else {
      this.updatePlayerOnFoot(dt);
      this.updateCamera(dt);
      this.audio.setEngine(false);
    }
    this.updateInteriorState();
    this.environment.setFocus(this.pos.x, this.pos.z);
    this.environment.update(dt, this.pos, this.camera);
    this.world.update(dt, this.elapsed);
    if (Math.abs(this.environment.night - this.lastNight) > 0.004) {
      this.lastNight = this.environment.night;
      this.world.setNight(this.environment.night);
    }
    const quality = this.profile.settings.quality;
    for (let i = 0; i < this.traffic.length; i++) {
      const t = this.traffic[i]!;
      const tp = t.vehicle.group.position;
      const near = Math.abs(tp.x - this.pos.x) < 110 && Math.abs(tp.z - this.pos.z) < 110;
      const distSqr = (tp.x - this.pos.x) * (tp.x - this.pos.x) + (tp.z - this.pos.z) * (tp.z - this.pos.z);
      if (quality === "low") {
        if (distSqr > 30 * 30) {
          if (distSqr > PERF.cullDistance * PERF.cullDistance) {
            t.farTimer = 0;
            continue;
          }
          t.update(dt, this.world, this.environment.night, true, this.pos);
          continue;
        }
        t.farTimer = 0;
        t.update(dt, this.world, this.environment.night, false, this.pos);
        continue;
      }
      if (near) {
        t.farTimer = 0;
        t.update(dt, this.world, this.environment.night);
      } else {
        t.farTimer += dt;
        if (t.farTimer >= 0.2) {
          const farDt = t.farTimer;
          t.farTimer = 0;
          t.update(farDt, this.world, this.environment.night);
        }
      }
    }
    this.checkTrafficHits();
    this.checkPedestrianHits();
    this.updateSurvival(dt);
    this.pedestrians.update(dt, this.pos.x, this.pos.z);
    this.missions.update(dt, this.elapsed, this.pos, Boolean(this.currentVehicle));
    this.syncPolice(dt);
    this.syncWanted();
    this.network.sendState(
      this.pos.x,
      this.pos.z,
      this.currentVehicle ? this.currentVehicle.rotation : this.player.group.rotation.y,
      this.currentVehicle?.spec.id ?? null,
      this.currentVehicle ? Math.abs(this.currentVehicle.speed) : 0,
    );
    this.saveTimer += dt;
    if (this.saveTimer > 4) {
      this.saveTimer = 0;
      this.persist();
    }
    if (this.shake > 0) this.shake = damp(this.shake, 0, 6, dt);
  }

  private checkTrafficHits() {
    if (this.currentVehicle || this.dead || this.damageCooldown > 0) return;
    for (const traffic of this.traffic) {
      const pos = traffic.vehicle.group.position;
      if (traffic.speed < 4 || dist2(pos.x, pos.z, this.pos.x, this.pos.z) > 2.6) continue;
      const damage = Math.round(clamp(8 + traffic.speed * 1.8, 12, 65));
      this.applyDamage(damage, "Atropelamento");
      this.damageCooldown = 1.25;
      return;
    }
    for (const cop of this.police) {
      const car = cop.vehicle;
      if (car.speed < 3 || dist2(car.position.x, car.position.z, this.pos.x, this.pos.z) > 2.7) continue;
      this.applyDamage(Math.round(clamp(10 + car.speed * 1.6, 14, 60)), "Atropelado pela polícia");
      this.damageCooldown = 1.25;
      return;
    }
  }

  private checkPedestrianHits() {
    const cars: VehicleHit[] = [];
    if (this.currentVehicle) {
      const car = this.currentVehicle;
      cars.push({
        x: car.position.x,
        z: car.position.z,
        speed: car.speed,
        dirX: Math.sin(car.rotation),
        dirZ: Math.cos(car.rotation),
        player: true,
      });
    }
    for (const traffic of this.traffic) {
      const car = traffic.vehicle;
      cars.push({
        x: car.position.x,
        z: car.position.z,
        speed: traffic.speed,
        dirX: Math.sin(car.rotation),
        dirZ: Math.cos(car.rotation),
        player: false,
      });
    }
    if (!cars.length) return;
    this.pedestrians.checkVehicleHits(cars, (hit) => this.handlePedestrianHit(hit));
  }

  private handlePedestrianHit(hit: VehicleHit) {
    if (!hit.player) return;
    this.profile.stats.atropelamentos = (this.profile.stats.atropelamentos ?? 0) + 1;
    const fine = PEDESTRIAN_FINE + Math.round(hit.speed * 12);
    this.profile.money = Math.max(0, this.profile.money - fine);
    this.missions.setWanted(Math.min(4, this.missions.wanted + 1));
    this.wantedCooldown = 0;
    this.ui.toast("Atropelamento", `Multa de R$ ${fine.toLocaleString("pt-BR")} e a polícia foi acionada.`, "bad");
    this.ui.flashDamage();
    this.audio.crash();
    this.shake = Math.min(1, 0.35 + hit.speed * 0.03);
    this.persist();
    this.ui.refreshProfile(this.profile);
  }

  private updateSurvival(dt: number) {
    const sprinting = this.input.sprint && !this.currentVehicle;
    const drain = dt * (0.075 + (sprinting ? 0.045 : 0));
    this.profile.hunger = Math.max(0, (this.profile.hunger ?? 100) - drain);
    this.lastVitalSave += dt;
    if (this.profile.hunger <= 0) {
      this.profile.hp = Math.max(0, (this.profile.hp ?? 100) - dt * 0.5);
      if (this.profile.hp <= 0) {
        this.die("Fome");
        return;
      }
    }
    this.hungerWarn = Math.max(0, this.hungerWarn - dt);
    if (this.profile.hunger > 0 && this.profile.hunger < 20 && this.hungerWarn <= 0) {
      this.hungerWarn = 30;
      this.ui.toast("Fome baixa", "Coma algo em um dos comércios da cidade.", "bad");
    }
    if (this.lastVitalSave >= 0.5) {
      this.lastVitalSave = 0;
      this.ui.setVitals(this.profile.hp, this.profile.maxHp || 100, this.profile.hunger, this.profile.maxHunger || 100);
    }
  }

  private applyDamage(amount: number, reason: string) {
    if (this.dead || this.mode !== "playing") return;
    const damage = Math.max(1, Math.round(amount));
    this.profile.hp = Math.max(0, (this.profile.hp ?? 100) - damage);
    this.ui.setVitals(this.profile.hp, this.profile.maxHp || 100, this.profile.hunger, this.profile.maxHunger || 100);
    this.ui.flashDamage();
    this.ui.toast(`-${damage} de vida`, reason, "bad");
    this.shake = Math.min(1, 0.35 + damage * 0.01);
    this.audio.crash();
    if (this.profile.hp <= 0) this.die(reason);
  }

  private die(reason: string) {
    if (this.dead) return;
    this.dead = true;
    this.deathReason = reason;
    this.deathTimer = 30;
    if (this.currentVehicle) this.exitVehicle(true);
    this.input.setEnabled(false);
    this.player.setVisible(!this.currentVehicle);
    this.player.group.rotation.x = -Math.PI / 2.3;
    this.ui.showDeath(reason);
    this.ui.setPrompt("", null);
    this.audio.setEngine(false);
    this.audio.chime(false);
    this.persist();
  }

  private revive() {
    const home = this.homePoint();
    const point = home ?? SPAWN;
    const spot = this.world.findFreeSpot(point.x, point.z, 0.8);
    this.dead = false;
    this.deathTimer = 0;
    if (this.interior) this.world.hideCommerceInterior(this.interior);
    this.world.setActiveShop(null);
    this.interior = null;
    this.houseInterior = null;
    this.pos.set(spot.x, 0, spot.z);
    this.player.group.position.set(spot.x, 0, spot.z);
    this.player.group.rotation.x = 0;
    this.player.jumpVelocity = 0;
    this.player.setVisible(!this.currentVehicle);
    this.profile.hp = this.profile.maxHp || 100;
    this.profile.hunger = Math.max(25, this.profile.hunger ?? 100);
    this.damageCooldown = 2;
    this.ui.hideDeath();
    this.ui.setVitals(this.profile.hp, this.profile.maxHp || 100, this.profile.hunger, this.profile.maxHunger || 100);
    this.input.setEnabled(true);
    this.ensureCarNearPlayer();
    this.updateCamera(1, true);
    this.ui.toast("Você reviveu", `De volta em ${this.profile.houseId ? getHouse(this.profile.houseId)?.name : "GhostCity"}.`, "good");
    this.persist();
  }

  private updatePlayerOnFoot(dt: number) {
    if (!this.input.enabled) return;
    const sprinting = this.input.sprint && (Math.abs(this.input.moveY) > 0.05 || Math.abs(this.input.moveX) > 0.05);
    const speed = sprinting ? 7.6 : 4.5;
    let dx = 0;
    let dz = 0;
    if (!this.ui.isChatOpen()) {
      const forwardX = -Math.sin(this.cameraYaw);
      const forwardZ = -Math.cos(this.cameraYaw);
      const rightX = Math.cos(this.cameraYaw);
      const rightZ = -Math.sin(this.cameraYaw);
      dx = forwardX * this.input.moveY + rightX * this.input.moveX;
      dz = forwardZ * this.input.moveY + rightZ * this.input.moveX;
      const len = Math.hypot(dx, dz);
      if (len > 1) {
        dx /= len;
        dz /= len;
      }
    }
    const moving = Math.hypot(dx, dz) > 0.04;
    const target = this.walkTarget.set(this.pos.x + dx * speed * dt, this.player.group.position.y, this.pos.z + dz * speed * dt);
    const resolved = this.world.resolve(this.pos, target, 0.48);
    const moved = dist2(this.pos.x, this.pos.z, resolved.x, resolved.z);
    this.pos.set(resolved.x, 0, resolved.z);
    if (moving) {
      const targetAngle = Math.atan2(dx, dz);
      this.player.group.rotation.y = angleLerp(this.player.group.rotation.y, targetAngle, Math.min(1, dt * 12));
    }
    this.player.jumpVelocity -= 18 * dt;
    let y = this.player.group.position.y + this.player.jumpVelocity * dt;
    if (y <= 0) {
      y = 0;
      this.player.jumpVelocity = 0;
    }
    this.player.group.position.set(this.pos.x, y, this.pos.z);
    this.player.update(dt, moving ? (sprinting ? 7.6 : 4.5) : 0, y <= 0.02);
    this.profile.stats.distance += moved;
  }

  private updateCamera(dt: number, snap = false) {
    if (this.houseInterior) {
      this.updateHouseCamera(dt, snap);
      return;
    }
    if (this.interior) {
      this.updateInteriorCamera(dt, snap);
      return;
    }
    const driving = Boolean(this.currentVehicle);
    const targetY = driving ? 1.15 : 1.45;
    this.cameraTarget.set(this.pos.x, targetY, this.pos.z);
    const distance = driving ? 8.4 : 5.8;
    const orbitPitch = Math.max(this.cameraPitch, 0.06);
    const horizontal = Math.cos(orbitPitch) * distance;
    const vertical = Math.sin(orbitPitch) * distance + (driving ? 1.2 : 1.7);
    this.cameraDesired.set(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * horizontal,
      this.cameraTarget.y + vertical,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * horizontal,
    );
    if (this.cameraDesired.y < 0.75) this.cameraDesired.y = 0.75;
    if (this.shake > 0 && this.profile.settings.cameraShake) {
      const s = this.shake * 0.35;
      this.cameraDesired.x += (Math.random() - 0.5) * s;
      this.cameraDesired.y += (Math.random() - 0.5) * s;
      this.cameraDesired.z += (Math.random() - 0.5) * s;
    }
    if (snap) this.camera.position.copy(this.cameraDesired);
    else this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-9 * dt));
    const lookUp = Math.max(0, 0.06 - this.cameraPitch);
    this.cameraLook.set(
      this.cameraTarget.x,
      this.cameraTarget.y + Math.tan(lookUp) * horizontal,
      this.cameraTarget.z,
    );
    this.camera.lookAt(this.cameraLook);
  }

  private updateInteriorCamera(dt: number, snap: boolean) {
    const distance = 2.6;
    const orbitPitch = Math.max(this.cameraPitch, 0.12);
    const horizontal = Math.cos(orbitPitch) * distance;
    const vertical = Math.sin(orbitPitch) * distance + 0.95;
    this.cameraTarget.set(this.pos.x, 1.25, this.pos.z);
    let camX = this.pos.x + Math.sin(this.cameraYaw) * horizontal;
    let camZ = this.pos.z + Math.cos(this.cameraYaw) * horizontal;
    if (this.interior) {
      const bounds = commerceBounds(this.interior);
      camX = clamp(camX, bounds.minX + 0.4, bounds.maxX - 0.4);
      camZ = clamp(camZ, bounds.minZ + 0.4, bounds.maxZ - 0.4);
    }
    this.cameraDesired.set(camX, Math.max(0.75, this.cameraTarget.y + vertical), camZ);
    if (snap) this.camera.position.copy(this.cameraDesired);
    else this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-16 * dt));
    this.cameraLook.set(this.cameraTarget.x, this.cameraTarget.y + 0.08, this.cameraTarget.z);
    this.camera.lookAt(this.cameraLook);
  }

  private updateHouseCamera(dt: number, snap: boolean) {
    const house = this.houseInterior;
    if (!house) return;
    const bounds = houseBounds(house);
    const distance = 3.2;
    const orbitPitch = Math.max(this.cameraPitch, 0.14);
    const horizontal = Math.cos(orbitPitch) * distance;
    const vertical = Math.sin(orbitPitch) * distance + 1.05;
    this.cameraTarget.set(this.pos.x, 1.3, this.pos.z);
    const camX = this.cameraTarget.x + Math.sin(this.cameraYaw) * horizontal;
    const camZ = this.cameraTarget.z + Math.cos(this.cameraYaw) * horizontal;
    this.cameraDesired.set(
      clamp(camX, bounds.minX + 0.2, bounds.maxX - 0.2),
      Math.max(0.6, this.cameraTarget.y + vertical),
      clamp(camZ, bounds.minZ + 0.2, bounds.maxZ - 0.2),
    );
    if (snap) this.camera.position.copy(this.cameraDesired);
    else this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-9 * dt));
    this.cameraLook.set(this.cameraTarget.x, this.cameraTarget.y + 0.12, this.cameraTarget.z);
    this.camera.lookAt(this.cameraLook);
  }

  private updateMenuCamera(dt: number, snap = false) {
    const radius = 104;
    const angle = this.elapsed * 0.035 + 0.9;
    this.focus.set(34, 9, -10);
    const x = 34 + Math.cos(angle) * radius;
    const z = -10 + Math.sin(angle) * radius;
    const y = 48 + Math.sin(this.elapsed * 0.11) * 6;
    this.cameraDesired.set(x, y, z);
    if (snap) this.camera.position.copy(this.cameraDesired);
    else this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-0.8 * dt));
    this.camera.lookAt(this.focus);
    this.environment.setFocus(34, -10);
    this.environment.update(dt, this.focus, this.camera);
    this.world.update(dt, this.elapsed);
    this.pedestrians.update(dt, 34, -10);
    if (Math.abs(this.environment.night - this.lastNight) > 0.004) {
      this.lastNight = this.environment.night;
      this.world.setNight(this.environment.night);
    }
  }

  private syncWanted() {
    if (!this.missions) return;
    if (this.missions.wanted !== this.lastWanted) {
      this.lastWanted = this.missions.wanted;
      this.ui.setWanted(this.missions.wanted);
    }
    const siren = this.missions.wanted > 0;
    if (siren !== this.sirenActive) {
      this.sirenActive = siren;
      this.audio.setSiren(siren);
    }
  }

  private syncPolice(dt: number) {
    const desired = this.missions.wanted;
    if (desired <= 0) {
      this.wantedCooldown = 0;
      if (this.police.length) {
        this.police.forEach((p) => p.dispose());
        this.police.length = 0;
      }
      return;
    }
    const chased = this.police.some(
      (cop) => dist2(cop.vehicle.position.x, cop.vehicle.position.z, this.pos.x, this.pos.z) < 34,
    );
    if (chased) {
      this.wantedCooldown = 0;
    } else {
      this.wantedCooldown += dt;
      if (this.wantedCooldown >= 14) {
        this.wantedCooldown = 0;
        this.missions.setWanted(desired - 1);
        this.ui.toast("A polícia perdeu o rastro", "Você saiu da mira.", "info");
      }
    }
    if (this.police.length < desired && this.bustedCooldown <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 58 + Math.random() * 34;
      const spot = this.world.findFreeSpot(this.pos.x + Math.cos(angle) * radius, this.pos.z + Math.sin(angle) * radius, 2.2);
      const cop = new PoliceCar(this.scene, spot.x, spot.z, this.pos);
      this.police.push(cop);
      this.ui.toast("Apoio policial", "Uma viatura entrou na sua caçada.", "bad");
    }
    while (this.police.length > desired) {
      this.police.pop()?.dispose();
    }
    for (const cop of this.police) {
      cop.update(dt, this.world, this.pos, this.environment.night);
    }
    if (!this.currentVehicle && this.bustedCooldown <= 0) {
      const caught = this.police.some((cop) => dist2(cop.vehicle.position.x, cop.vehicle.position.z, this.pos.x, this.pos.z) < 4);
      if (caught) {
        this.bustedCooldown = 4;
        this.missions.failActive("A polícia te pegou. Fuga encerrada.");
        const spot = this.world.findFreeSpot(SPAWN.x, SPAWN.z, 0.8);
        this.pos.set(spot.x, 0, spot.z);
        this.player.group.position.set(spot.x, 0, spot.z);
        this.ui.toast("Você foi pego", "A fuga terminou. A cidade te soltou no centro.", "bad");
      }
    }
  }

  private updateHud(dt: number) {
    this.fpsTimer += dt;
    this.fpsFrames++;
    if (this.fpsTimer >= 0.5) {
      const fps = this.fpsFrames / this.fpsTimer;
      this.ui.setFps(fps);
      this.fpsTimer = 0;
      this.fpsFrames = 0;
      if (this.renderer && !this.paused) {
        // Os limites sao relativos ao alvo do preset: com o teto de 30 fps do
        // modo leve, "fps < 48" degradaria a imagem para sempre sem motivo.
        const target = this.frameLimiter.targetFPS;
        const lowWater = Math.max(18, target * 0.82);
        const highWater = Math.max(lowWater + 1, target * 0.97);
        const minRenderScale = this.profile.settings.quality === "low" ? 0.85 : 0.9;
        if (fps < lowWater) {
          this.goodSamples = 0;
          if (this.renderScaleFactor > minRenderScale) {
            this.renderScaleFactor = Math.max(minRenderScale, this.renderScaleFactor - 0.05);
            this.applyRenderScale();
          }
          this.badSamples++;
          if (this.badSamples >= 3) {
            this.badSamples = 0;
            if (this.post?.active && this.post.gtaoOn && !this.aoDegraded) {
              this.aoDegraded = true;
              this.post.setAoEnabled(false);
            } else if (!this.shadowThrottled && this.profile.settings.quality !== "low") {
              this.shadowThrottled = true;
              this.environment?.setShadowInterval(0.5);
            } else if (this.renderScaleFactor > minRenderScale) {
              this.renderScaleFactor = minRenderScale;
              this.applyRenderScale();
            }
          }
        } else if (fps > highWater) {
          this.badSamples = 0;
          if (this.renderScaleFactor < 1) {
            this.renderScaleFactor = Math.min(1, this.renderScaleFactor + 0.06);
            this.applyRenderScale();
          }
          this.goodSamples++;
          if (this.goodSamples >= 30) {
            this.goodSamples = 0;
            if (this.shadowThrottled) {
              this.shadowThrottled = false;
              this.environment?.setShadowInterval(0);
            } else if (this.aoDegraded) {
              this.aoDegraded = false;
              this.post?.setAoEnabled(true);
            }
          }
        } else {
          this.badSamples = 0;
          this.goodSamples = 0;
        }
      }
    }
    if (this.mode !== "playing") return;
    this.clockTimer += dt;
    if (this.clockTimer > 0.45) {
      this.clockTimer = 0;
      const state = this.environment.getState();
      this.ui.setClock(state.time, state.weather);
      this.ui.setWeatherLabel(state.weather);
    }
    const speed = this.currentVehicle?.speed ?? 0;
    const vehicleName = this.currentVehicle?.spec.name ?? null;
    this.ui.setSpeed(speed, vehicleName);
    this.hudTimer += dt;
    if (this.hudTimer > 0.14) {
      this.hudTimer = 0;
      this.ui.setMission(this.missions.getHudMission(this.pos));
      this.ui.setWanted(this.missions.wanted);
      const nav = this.missions.getNavTarget(this.pos);
      if (nav) this.ui.setObjective(dist2(this.pos.x, this.pos.z, nav.x, nav.z), nav.label.toUpperCase());
      else this.ui.setObjective(null);
      let prompt = this.dead ? null : this.missions.getPrompt(this.pos, Boolean(this.currentVehicle));
      if (!prompt && !this.currentVehicle && !this.dead) {
        if (this.houseInterior) {
          const bed = houseBedUse(this.houseInterior);
          const wardrobe = houseWardrobeUse(this.houseInterior);
          const door = houseDoor(this.houseInterior);
          if (dist2(bed.x, bed.z, this.pos.x, this.pos.z) < 2.4) {
            prompt = { key: "E", text: "Dormir na cama", action: "mission" as const };
          } else if (dist2(wardrobe.x, wardrobe.z, this.pos.x, this.pos.z) < 2.2) {
            prompt = { key: "E", text: "Abrir guarda-roupa", action: "mission" as const };
          } else if (dist2(door.x, door.z, this.pos.x, this.pos.z) < 2.9) {
            prompt = { key: "E", text: "Sair para a rua", action: "mission" as const };
          }
        } else if (this.interior) {
          const counter = commerceCounter(this.interior);
          const door = commerceDoor(this.interior);
          if (dist2(counter.x, counter.z, this.pos.x, this.pos.z) < 2.4) {
            prompt = { key: "E", text: `Balcão do ${this.interior.short}`, action: "mission" as const };
          } else if (dist2(door.x, door.z, this.pos.x, this.pos.z) < 2.9) {
            prompt = { key: "E", text: "Sair para a rua", action: "mission" as const };
          }
        } else {
          const shop = this.nearestCommerce(3.6);
          if (shop) prompt = { key: "E", text: `Entrar no ${shop.name}`, action: "mission" as const };
          else {
            const house = this.nearestHouse(3.6);
            if (house) {
              const owned = this.profile.ownedHouses.includes(house.id);
              prompt = {
                key: "E",
                text: owned ? `Entrar em ${house.name}` : `Ver ${house.name} à venda`,
                action: "mission" as const,
              };
            }
          }
        }
      }
      if (!prompt && !this.dead) {
        if (this.currentVehicle) prompt = { key: "F", text: "Sair do veículo", action: "vehicle" as const };
        else {
          const near = this.findNearestVehicle(5.5);
          if (near) prompt = { key: "F", text: `Entrar no ${near.spec.name}`, action: "vehicle" as const };
        }
      }
      this.ui.setPrompt(prompt?.key ?? "", prompt?.text ?? null);
    }
    this.minimapTimer += dt;
    if (this.minimapTimer > 0.12) {
      this.minimapTimer = 0;
      const markers = this.missions.getMarkers();
      markers.push({ x: GARAGE.x, z: GARAGE.z, color: "#ffd166", label: "Garagem" });
      const rankedShops = this.world.shops
        .map((commerce) => ({ commerce, d: dist2(this.pos.x, this.pos.z, commerce.x, commerce.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 24);
      rankedShops.forEach(({ commerce }, index) => {
        const point = this.commercePoint(commerce);
        markers.push({
          x: point.x,
          z: point.z,
          color: commerce.accent,
          label: index < 10 ? commerce.short : undefined,
        });
      });
      for (const house of HOUSES) {
        const point = this.housePoint(house);
        const owned = this.profile.ownedHouses.includes(house.id);
        markers.push({ x: point.x, z: point.z, color: owned ? "#17b890" : "#f25f8b", label: house.short });
      }
      this.ui.updateMinimap(
        this.world.mapData,
        {
          x: this.pos.x,
          z: this.pos.z,
          ry: this.currentVehicle ? this.currentVehicle.rotation : this.player.group.rotation.y,
          vehicle: Boolean(this.currentVehicle),
        },
        markers,
        this.remote.getDots(),
      );
    }
    this.missionTimer += dt;
    if (this.missionTimer > 1.4) {
      this.missionTimer = 0;
      this.ui.renderMissionCards(this.missions.getMissionCards(this.pos));
      this.ui.setActiveMission(this.missions.active?.id ?? this.missions.trackedId);
    }
  }

  private tick = (now: number) => {
    requestAnimationFrame(this.tick);
    // Teto de FPS: o frame e descartado inteiro (sem update, sem render) ate
    // chegar a hora do proximo. No celular isso segura o clock da GPU.
    if (!this.frameLimiter.shouldRender(now)) return;
    const dt = clamp((now - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = now;
    this.elapsed += dt;
    this.input.update();
    if (this.mode === "playing") {
      if (!this.paused) {
        this.processActions();
        if (!this.paused) this.updatePlaying(dt);
      }
    } else {
      this.updateMenuCamera(dt);
    }
    this.remote.updateAll(dt);
    this.updateHud(dt);
    this.culler.update(dt, this.pos);
    if (this.post?.active) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  private persist() {
    if (!this.profile) return;
    this.profile.lastPosition = {
      x: this.pos.x,
      z: this.pos.z,
      ry: this.currentVehicle ? this.currentVehicle.rotation : this.player.group.rotation.y,
    };
    saveProfile(this.profile);
  }

  private selectGarageVehicle(id: string) {
    const spec = getVehicle(id);
    if (spec.id === "police") {
      this.ui.toast("Viatura restrita", "Essa aí só a polícia dirige.", "bad");
      return;
    }
    const owned = this.profile.ownedVehicles.includes(spec.id);
    if (!owned) {
      const level = levelForXp(this.profile.xp);
      if (level < spec.level) {
        this.ui.toast("Nível insuficiente", `Alcance o nível ${spec.level} para comprar ${spec.name}.`, "bad");
        return;
      }
      if (this.profile.money < spec.price) {
        this.ui.toast("Saldo insuficiente", `Faltam ${(spec.price - this.profile.money).toLocaleString("pt-BR")} reais.`, "bad");
        return;
      }
      this.profile.money -= spec.price;
      this.profile.ownedVehicles.push(spec.id);
      this.profile.upgrades[spec.id] = { engine: 0, turbo: 0, tires: 0 };
      this.profile.paint = spec.color;
      this.ui.toast("Veículo comprado", `${spec.name} já está na sua garagem.`, "good");
    }
    this.profile.activeVehicle = spec.id;
    if (!this.profile.upgrades[spec.id]) this.profile.upgrades[spec.id] = { engine: 0, turbo: 0, tires: 0 };
    this.rebuildPlayerCar();
    this.persist();
    this.ui.refreshProfile(this.profile);
    this.network.updateIdentity(this.profile);
    this.ui.toast("Veículo ativo", spec.name, "good");
  }

  private upgradeCost(kind: "engine" | "turbo" | "tires", level: number) {
    const base = kind === "engine" ? 420 : kind === "turbo" ? 560 : 340;
    return Math.round(base * Math.pow(1.65, level));
  }

  private buyUpgrade(kind: "engine" | "turbo" | "tires") {
    const id = this.profile.activeVehicle;
    const upgrades = (this.profile.upgrades[id] ??= { engine: 0, turbo: 0, tires: 0 });
    const level = upgrades[kind];
    if (level >= 3) return;
    const cost = this.upgradeCost(kind, level);
    if (this.profile.money < cost) {
      this.ui.toast("Saldo insuficiente", "Ganhe mais grana nas missões da cidade.", "bad");
      return;
    }
    this.profile.money -= cost;
    upgrades[kind]++;
    this.rebuildPlayerCar();
    this.persist();
    this.ui.refreshProfile(this.profile);
    const labels = { engine: "Motor", turbo: "Turbo", tires: "Pneus" };
    this.ui.toast(`${labels[kind]} melhorado`, `Nível ${upgrades[kind]} instalado.`, "good");
  }

  private setPaint(color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    this.profile.paint = color;
    this.rebuildPlayerCar();
    this.persist();
    this.ui.refreshProfile(this.profile);
    this.network.updateIdentity(this.profile);
    this.audio.click();
  }

  private rebuildPlayerCar() {
    if (!this.playerCar) return;
    const old = this.playerCar;
    const wasCurrent = this.currentVehicle === old;
    const x = old.position.x;
    const z = old.position.z;
    const ry = old.rotation;
    const hp = old.hp;
    const index = this.vehicles.indexOf(old);
    if (index >= 0) this.vehicles.splice(index, 1);
    this.unregisterParkedVehicle(old);
    if (wasCurrent) this.currentVehicle = null;
    old.dispose();
    const spec = getVehicle(this.profile.activeVehicle);
    const upgrades = this.profile.upgrades[spec.id] ?? { engine: 0, turbo: 0, tires: 0 };
    const car = new Vehicle(spec, this.profile.paint, upgrades);
    car.place(x, z, ry);
    car.hp = hp;
    this.scene.add(car.group);
    this.playerCar = car;
    this.vehicles.push(car);
    this.registerParkedVehicle(car);
    if (wasCurrent) {
      this.currentVehicle = car;
      car.driverId = this.profile.id;
      this.player.setVisible(false);
    }
  }

  private spawnSelectedVehicle() {
    this.callVehicle(true);
    this.ui.closeModal();
    this.network.updateIdentity(this.profile);
  }

  private callVehicle(force = false) {
    if (this.currentVehicle) this.exitVehicle(true);
    if (!force && this.playerCar && dist2(this.playerCar.position.x, this.playerCar.position.z, this.pos.x, this.pos.z) < 13) {
      this.ui.toast("Seu carro está aqui", "Ele já está pertinho de você.", "info");
      return;
    }
    const spot = this.world.findFreeSpot(this.pos.x + 4.4, this.pos.z + 3.6, 2.2);
    this.playerCar.place(spot.x, spot.z, this.player.group.rotation.y);
    this.playerCar.speed = 0;
    this.audio.click();
    this.ui.toast("Veículo chamado", `${this.playerCar.spec.name} chegou ao seu lado.`, "good");
    this.network.updateIdentity(this.profile);
  }

  private saveCustomization(name: string, skin: string, shirt: string, pants: string, hair: string) {
    this.profile.name = name.trim().slice(0, 18) || this.profile.name;
    this.profile.skin = skin;
    this.profile.shirt = shirt;
    this.profile.pants = pants;
    this.profile.hair = hair;
    this.player.setColors({ skin, shirt, pants, hair });
    this.persist();
    this.ui.refreshProfile(this.profile);
    this.network.updateIdentity(this.profile);
    this.ui.closeModal();
    this.ui.toast("Visual atualizado", "Agora todo mundo vê seu estilo.", "good");
  }

  private saveSettings(settings: PlayerProfile["settings"]) {
    this.profile.settings = {
      ...settings,
      masterVolume: clamp(settings.masterVolume, 0, 1),
      musicVolume: clamp(settings.musicVolume, 0, 1),
      sensitivity: clamp(settings.sensitivity, 0.3, 2.2),
      online: settings.online !== false,
    };
    this.persist();
    this.applyQuality(this.profile.settings.quality);
    this.audio.setVolumes(this.profile.settings.masterVolume, this.profile.settings.musicVolume);
    if (this.profile.settings.online) {
      if (this.network.status !== "online") this.network.connect(this.profile);
    } else if (this.network.status !== "offline") {
      this.network.disconnect();
    }
    this.ui.toast("Ajustes salvos", "A cidade agora está do seu jeito.", "good");
  }

  private applyQuality(quality: QualityName) {
    const preset = QUALITY[quality];
    this.renderScale = preset.renderScale ?? 1;
    this.renderScaleFactor = 1;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
    this.frameLimiter.setTargetFPS(preset.targetFPS ?? 30);
    this.culler.setDistance(preset.cullingDistance ?? PERF.cullDistance);
    this.culler.setInterval(PERF.cullInterval);
    this.aoDegraded = false;
    this.shadowThrottled = false;
    this.badSamples = 0;
    this.goodSamples = 0;
    if (preset.post && !this.post && this.renderer) {
      this.post = new PostPipeline(this.renderer, this.scene, this.camera);
      this.post.resize(window.innerWidth, window.innerHeight, this.basePixelRatio * this.renderScale);
    }
    this.post?.setQuality(preset);
    if (this.renderer) {
      this.renderer.shadowMap.enabled = preset.shadows;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = preset.name === "high" ? 1.0 : preset.name === "medium" ? 1.12 : 1.05;
      this.renderer.setClearColor(preset.fogColor);
      this.resize();
    }
    this.environment?.setQuality(quality);
    this.environment?.setShadowInterval(0);
    this.world?.setQuality(quality);
    this.pedestrians?.setQuality(quality);
    this.pedestrians?.setContactShadow(preset.useBlobShadows);
    this.player.setContactShadow(preset.useBlobShadows);
    this.culler.forceSweep(this.pos);
    if (quality === "low" && this.world) {
      const shops = this.world.shops || [];
      const names = ["ELETRÔNICOS", "ELETRONICOS", "CINE", "CINEMA", "VÍDEO", "VIDEO"];
      for (const shop of shops) {
        if (names.includes(shop.name?.toUpperCase())) {
          const idx = (this.world as any).shopColliders?.get(shop.id);
          if (idx !== undefined && (this.world as any).colliders?.[idx]) {
            (this.world as any).colliders[idx].disabled = true;
          }
        }
      }
    } else if (this.world) {
      if ((this.world as any).colliders) {
        for (const c of (this.world as any).colliders) {
          if (c) c.disabled = false;
        }
      }
    }
  }

  private setOnlineMode(online: boolean) {
    this.profile.settings.online = online;
    this.persist();
    if (online) {
      this.ui.setServerStatus(false, "Conectando ao servidor...");
      this.network.connect(this.profile);
      this.ui.toast("Modo online", "Procurando a galera na cidade.", "good");
    } else {
      this.network.disconnect();
      this.remote.clear();
      this.ui.updateOnline(0, false, "Modo solo ativo");
      this.ui.setServerStatus(false, "Modo solo · sem outros jogadores");
      this.ui.toast("Modo offline", "Jogando só, sem internet.", "info");
    }
  }

  private sendChat(text: string) {
    if (this.network.status === "online") {
      this.network.sendChat(text);
    } else {
      this.ui.addChatBubble("Sistema", "Modo solo: conecte um servidor nos ajustes para conversar.", true);
    }
  }

  private resetSave() {
    try {
      localStorage.removeItem("rio_livre_profile_v1");
    } catch {
      return;
    }
    location.reload();
  }

  private async toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      this.ui.toast("Tela cheia indisponível", "Seu navegador bloqueou o pedido.", "info");
    }
  }

  private async installApp() {
    const event = this.installEvent;
    if (!event) {
      this.ui.toast("Instalação", "Use o menu do navegador e escolha 'Adicionar à tela inicial'.", "info");
      return;
    }
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") this.ui.toast("Instalando", "RedRP vai para a sua tela inicial.", "good");
    } catch {
      return;
    }
    this.installEvent = null;
    this.ui.setInstallPrompt(null);
  }
}
