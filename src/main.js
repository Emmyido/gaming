import * as THREE from "three";
import { CITIES, getRoute } from "./data/routes.js";
import { carPhysics, getCar, SAFETY_KIT } from "./data/cars.js";
import { CONFIG, openExternal, openGreenRev, track } from "./config.js";
import { Audio } from "./game/audio.js";
import { Input } from "./game/input.js";
import { planLeg } from "./game/director.js";
import { activeCampaigns, loadCampaigns } from "./game/ads.js";
import { GREETINGS, MENUS } from "./data/food.js";
import { BIOME_HILLS, crashDamage, curveHeading, hillY, laneX, lateralX, MEDIAN_HALF, overlaps, ROAD_EDGE, setHillProfile, setRoadFeatures, SHOULDER } from "./game/physics.js";
import { rng } from "./game/rng.js";
import * as S from "./game/state.js";
import * as UI from "./game/ui.js";
import { Actors, SNACKS } from "./world/actors.js";
import { animateFeatures, buildFeature } from "./world/features.js";
import * as M from "./world/models.js";
import { Traffic } from "./world/traffic.js";
import { BIOMES, toWorld, World } from "./world/world.js";

const $ = (id) => document.getElementById(id);
const naira = UI.naira;
const KMH = 3.6;

class Game {
  constructor() {
    this.state = S.load();
    this.audio = new Audio();
    this.audio.enabled = this.state.settings.sound;
    this.input = new Input();
    this.mode = "menu";
    this.paused = false;
    this.clock = new THREE.Clock();
    this.t = 0;
    this.shake = 0;
    this.cameraMode = this.state.settings.camera ?? "chase";
    this.campaigns = [];
    this.adRotation = 0;
    loadCampaigns(CONFIG.advertise.adsUrl).then((c) => (this.campaigns = c));
    this.initRenderer();
    this.input.bindTouch($("touch"));
    UI.setCtaHandler((target, context) => this.cta(target, context));
    this.bindUi();
    this.idleAttract();
    this.loop();
    this.showMenu(true);
    track("session_start", { streak: this.state.streak.count });
    addEventListener("visibilitychange", () => document.hidden && this.mode === "drive" && this.pause());
  }

  // ---------------------------------------------------------------- setup

  quality() {
    const q = this.state.settings.quality;
    if (q !== "auto") return q;
    return matchMedia("(pointer: coarse)").matches || devicePixelRatio > 2.5 ? "low" : "medium";
  }

  initRenderer() {
    const canvas = $("scene");
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality() !== "low", powerPreference: "high-performance" });
    } catch {
      $("webgl-error").classList.remove("hidden");
      throw new Error("WebGL unavailable");
    }
    const q = this.quality();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q === "low" ? 1 : q === "medium" ? 1.5 : 2));
    this.renderer.shadowMap.enabled = q === "high";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2400);
    this.world = new World(this.scene, q);
    this.traffic = new Traffic(this.scene);
    this.actors = new Actors(this.scene);
    this.raycaster = new THREE.Raycaster();
    const resize = () => {
      this.renderer.setSize(innerWidth, innerHeight, false);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.fov = innerWidth < innerHeight ? 74 : 62;
      this.camera.updateProjectionMatrix();
    };
    addEventListener("resize", resize);
    resize();
    canvas.addEventListener("pointerup", (e) => this.tapScene(e));
  }

  bindUi() {
    document.querySelectorAll("[data-cta]").forEach((b) => (b.onclick = () => this.cta(b.dataset.cta, { reason: "menu" })));
    document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => this.openPanel(b.dataset.open)));
    $("btn-pause").onclick = () => this.pause();
  }

  cta(target, context) {
    if (target === "advertise") return this.openAdvertise(context?.reason ?? "cta");
    S.addStat(this.state, "ctaClicks");
    this.checkProgress();
    S.save(this.state);
    openGreenRev(target, context);
  }

  async openPanel(name) {
    if (name === "garage") await UI.openGarage(this.state);
    if (name === "passport") await UI.openPassport(this.state);
    if (name === "advertise") await this.openAdvertise("menu");
    if (name === "settings") await UI.openSettings(this.state, this.audio, () => UI.toast("Graphics change applies after reload"));
    this.showMenu();
  }

  // ---------------------------------------------------------------- menu & attract mode

  /** Behind the menu, the camera cruises a scenic road so the game looks alive from the first frame. */
  idleAttract() {
    this.route = getRoute(this.state.trip?.routeId ?? "lagos-abuja");
    this.legIndex = this.state.trip?.legIndex ?? 0;
    this.legStartZ = 0;
    this.leg = this.route.legs[this.legIndex];
    this.setupLegEnvironment();
    this.player = this.makePlayer();
    this.player.z = 40;
    this.player.speed = 20;
    this.attract = true;
  }

  async showMenu(first = false) {
    this.mode = "menu";
    $("hud").classList.add("hidden");
    $("menu").classList.remove("hidden");
    UI.renderMenu(this.state, { onStart: (id) => this.startRoute(id) });
    if (first) {
      const reward = S.checkIn(this.state);
      S.dailyMissions(this.state);
      S.save(this.state);
      if (reward) {
        track("daily_checkin", { day: reward.day });
        await UI.modal({
          art: "🔥",
          title: `Day ${reward.day} streak!`,
          body: `<p>Welcome back. Your daily fuel money is in: <b>${naira(reward.reward)}</b>.</p><p>Come back tomorrow for <b>${naira(reward.nextReward)}</b>. Miss a day and the streak resets.</p><p>Today's roads are freshly generated: new potholes, new checkpoints, new go-slows.</p>`,
          actions: [{ id: "ok", label: "Oya, let's drive!", style: "primary" }],
        });
        UI.renderMenu(this.state, { onStart: (id) => this.startRoute(id) });
      }
    }
  }

  // ---------------------------------------------------------------- trips

  async startRoute(routeId) {
    this.audio.start();
    this.audio.setEnabled(this.state.settings.sound);
    const resuming = this.state.trip?.routeId === routeId;
    if (!resuming) this.state.trip = { routeId, legIndex: 0, elapsed: 0 };
    if (this.state.fuel < 15) {
      const cost = S.servicePrices(this.state).refuel;
      if (S.refuel(this.state)) UI.toast(`Tank was nearly empty. Filled up for ${naira(cost)}.`);
    }
    this.route = getRoute(routeId);
    this.legIndex = this.state.trip.legIndex;
    this.legStartZ = 0;
    this.timeOfDay = 7.5;
    this.attract = false;
    this.resetWorld();
    this.player = this.makePlayer();
    $("menu").classList.add("hidden");
    $("hud").classList.remove("hidden");
    this.mode = "drive";
    track("route_start", { routeId, leg: this.legIndex, resuming });
    this.beginLeg();
  }

  makePlayer() {
    if (this.playerMesh) this.scene.remove(this.playerMesh);
    const car = getCar(this.state.carId);
    this.playerMesh = M.playerCar(car.body, car.color);
    this.scene.add(this.playerMesh);
    const size = this.playerMesh.userData.size;
    return { z: 0, x: laneX(1), speed: 0, length: size.length, width: size.width, dir: 1, steerVis: 0, crashCooldown: 0 };
  }

  resetWorld() {
    this.world.reset();
    this.traffic.clear();
    this.actors.clear();
    this.potholeMeshes = new Map();
    this.roadFeatures = [];
    this.legFeatures = [];
    this.featureFx = [];
    setRoadFeatures([]);
  }

  setupLegEnvironment() {
    const route = this.route;
    const legs = route.legs;
    // biome and hills for any z, looking ahead into the next leg so the horizon matches
    const starts = [this.legStartZ];
    this.plan = planLeg(this.leg, `${route.id}-${this.legIndex}-${S.dayKey()}`);
    const endZ = this.legStartZ + this.plan.length;
    // bridges, flyovers and roundabouts in route z; keep the previous leg's so the road behind stays intact
    const routed = this.plan.features.map((f) => ({ ...f, from: f.from + this.legStartZ, to: f.to + this.legStartZ }));
    for (const e of this.plan.events) if (e.type === "feature") e.feature = routed[this.plan.features.indexOf(e.feature)];
    this.roadFeatures = [...(this.roadFeatures ?? []).filter((f) => f.to > this.legStartZ - 400), ...routed];
    this.legFeatures = routed;
    this.featureIdx = 0;
    setRoadFeatures(this.roadFeatures);
    const nextLeg = legs[this.legIndex + 1];
    this.legEndZ = endZ;
    this.world.setBiomeResolver((z) => (z < endZ || !nextLeg ? this.leg.biome : nextLeg.biome));
    const ampA = BIOME_HILLS[this.leg.biome];
    const ampB = nextLeg ? BIOME_HILLS[nextLeg.biome] : ampA;
    const prev = legs[this.legIndex - 1];
    const ampP = prev ? BIOME_HILLS[prev.biome] : ampA;
    setHillProfile((z) => {
      const s = THREE.MathUtils.smoothstep(z, endZ - 300, endZ);
      const p = THREE.MathUtils.smoothstep(z, starts[0], starts[0] + 300);
      return THREE.MathUtils.lerp(ampP, THREE.MathUtils.lerp(ampA, ampB, s), p);
    });
    const region = route.id.startsWith("lagos") && this.legIndex === 0 ? "lagos" : ["sahel", "savanna"].includes(this.leg.biome) && !route.id.startsWith("lagos") ? "north" : "south";
    this.traffic.setRegion(region, this.leg.traffic);
    this.traffic.slowZones = [];
    const r = rng(`${route.id}-${this.legIndex}-weather-${S.dayKey()}`);
    this.world.setRain(r.chance(BIOMES[this.leg.biome].rain));
    this.eventIdx = 0;
    this.potholeIdx = 0;
    this.active = [];
    this.legStats = { crashes: 0, checkpointsCleared: 0, potholesHit: 0, startedAt: this.t, km: 0 };
  }

  beginLeg() {
    this.gateSpawned = false;
    this.leg = this.route.legs[this.legIndex];
    this.setupLegEnvironment();
    this.player.z = Math.max(this.player.z, this.legStartZ);
    const from = CITIES[this.leg.from].name, to = CITIES[this.leg.to].name;
    $("hud-leg").textContent = `${from} → ${to}`;
    $("hud-road").textContent = this.leg.road + (this.world.raining ? " · 🌧 rain" : this.leg.biome === "sahel" ? " · 🌫 harmattan" : "");
    $("hud-next").textContent = to;
    UI.alertBanner(`${from} → ${to} · ${this.leg.km} km`, "info");
    if (this.leg.quality < 0.4) setTimeout(() => UI.toast("Travellers report a very bad road ahead. Watch for potholes!", { kind: "bad" }), 2500);
    if (this.world.raining) setTimeout(() => UI.toast("Rain! Potholes fill with water and are harder to see.", { kind: "gold" }), 4500);
  }

  // ---------------------------------------------------------------- the frame

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    if (this.mode === "drive" && !this.paused) this.updateDrive(dt);
    else if (this.attract) this.updateAttract(dt);
    this.updateCamera(dt);
    const biome = this.world.biomeAt(this.player.z);
    const light = this.world.applyAtmosphere(biome, this.timeOfDay ?? 8, this.camera);
    this.playerMesh.userData.head.intensity = light < 0.35 ? 60 : 0;
    this.spawnFeaturesAhead();
    for (const fx of this.featureFx ?? []) animateFeatures(fx, dt, this.t);
    this.cullBehind();
    this.world.update(this.player.z, dt, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderBubbles();
    this.input.endFrame();
  }

  updateAttract(dt) {
    const p = this.player;
    p.z += p.speed * dt;
    p.x = laneX(1) + Math.sin(this.t * 0.4) * 1.2;
    this.traffic.maintain(p.z, false);
    this.traffic.update(dt, p.z, this.leg.biome, p);
    this.actors.maintainWalkers(p.z, false);
    this.actors.update(dt, this.t, p.z, p.x, this.leg.biome);
    this.placePlayer(dt);
    this.timeOfDay = 8 + Math.sin(this.t / 30) * 1.5;
  }

  updateDrive(dt) {
    const s = this.state;
    const p = this.player;
    const car = getCar(s.carId);
    const phys = carPhysics(car, s.upgrades[s.carId]);
    const inp = this.input;

    // ---- one-shot actions
    if (inp.took("KeyH", "horn")) {
      this.audio.horn();
      const ahead = this.traffic.cars.find((c) => c.dir > 0 && c.z > p.z && c.z - p.z < 30 && Math.abs(c.x - p.x) < 2.5);
      if (ahead && ahead.lane === 0 && this.t - (this.lastHorn ?? 0) > 2) ahead.lane = 1; // slow car moves over
      this.lastHorn = this.t;
    }
    if (inp.took("KeyC", "camera")) this.cycleCamera();
    if (inp.took("Escape", "KeyP")) return this.pause();

    // ---- driving model
    let top = phys.topSpeed;
    if (s.condition < 20) top *= 0.55;
    if (s.fuel <= 0) top = 0;
    const offRoad = p.x > ROAD_EDGE + 0.3;
    if (offRoad) top = Math.min(top, 14);
    const throttle = inp.gas ? 1 : 0;
    if (inp.brake) p.speed -= phys.brake * dt;
    else if (throttle) p.speed += phys.accel * Math.max(0, 1 - p.speed / top) * dt;
    else p.speed -= (1.2 + p.speed * 0.03) * dt;
    if (p.speed > top) p.speed -= 6 * dt;
    p.speed = Math.max(0, p.speed);

    const grip = this.world.raining ? 0.8 : 1;
    let steer = inp.steer * phys.steer * grip * THREE.MathUtils.clamp(p.speed / 8, 0.2, 1);
    if (this.energyLow) steer += Math.sin(this.t * 1.7) * 0.8; // drowsy wobble
    p.x += steer * dt;
    p.steerVis = THREE.MathUtils.lerp(p.steerVis, inp.steer, 8 * dt);
    const minX = MEDIAN_HALF + p.width / 2 + 0.1;
    const maxX = ROAD_EDGE + SHOULDER - p.width / 2;
    if (p.x < minX) {
      p.x = minX;
      if (p.speed > 15) this.scrape("median");
    }
    if (p.x > maxX) {
      p.x = maxX;
      p.speed *= 0.97;
    }
    if (offRoad && p.speed > 6) this.shake = Math.max(this.shake, 0.08);
    p.z += p.speed * dt;
    p.crashCooldown -= dt;

    // ---- consumables
    const dist = p.speed * dt;
    s.fuel = Math.max(0, s.fuel - dist * phys.fuelUse * (1 + throttle * 0.4));
    s.energy = Math.max(0, (s.energy ?? 100) - dt * 0.55);
    s.energyLow = s.energy < 22;
    this.legStats.km += dist / 1000 * (this.leg.km / (this.plan.length / 1000)); // real-world km equivalent
    this.timeOfDay = ((this.timeOfDay ?? 7.5) + dt / 45) % 24;
    if (s.fuel <= 0 && p.speed < 0.5 && !this.outOfFuel) this.outOfFuelEvent();
    if (s.condition <= 0 && !this.brokenDown) this.breakdownEvent("engine");
    if (this.energyLow && !this.energyWarned) {
      this.energyWarned = true;
      UI.toast("You're getting tired. Buy something from a hawker or stop in the next town.", { kind: "gold" });
    }

    // ---- world
    const jam = this.traffic.slowLimit(p.z + 30) < 8;
    this.traffic.maintain(p.z, jam);
    this.traffic.update(dt, p.z, this.leg.biome, p);
    this.actors.maintainWalkers(p.z, jam);
    this.actors.update(dt, this.t, p.z, p.x, this.leg.biome);
    this.updatePotholes(phys);
    this.updateEvents(dt);
    this.checkCollisions(car);
    this.peopleDodge();
    this.placePlayer(dt);

    this.audio.engine(p.speed, throttle);
    this.updateHud(phys);

    if (p.z >= this.legEndZ) this.arrive();
  }

  placePlayer(dt) {
    const p = this.player;
    const m = this.playerMesh;
    toWorld(p.z, p.x, 0, this.leg.biome, m.position);
    m.rotation.y = curveHeading(p.z, p.x) - p.steerVis * 0.12;
    const shell = m.userData.shell;
    shell.rotation.z = p.steerVis * 0.03 * Math.min(1, p.speed / 20);
    shell.rotation.x = THREE.MathUtils.lerp(shell.rotation.x, this.input.brake ? 0.025 : this.input.gas ? -0.012 : 0, 6 * dt);
    shell.position.y = this.shake > 0.05 ? Math.sin(this.t * 60) * this.shake * 0.12 : 0;
    for (const w of m.userData.wheels) w.rotation.x += (p.speed * dt) / 0.38;
    m.userData.wheels[1].rotation.y = m.userData.wheels[3].rotation.y = -p.steerVis * 0.35;
  }

  cycleCamera() {
    const order = ["chase", "cockpit", "aerial", "cinematic"];
    this.cameraMode = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.state.settings.camera = this.cameraMode;
    UI.toast(`Camera: ${this.cameraMode}`);
  }

  updateCamera(dt) {
    const p = this.player;
    const offsets = {
      chase: { back: 8.5, up: 3.4, side: 0, look: 14, lookUp: 1.2 },
      cockpit: { back: -0.2, up: 1.25, side: -0.35, look: 30, lookUp: 1.1 },
      aerial: { back: 20, up: 18, side: 0, look: 22, lookUp: 0 },
      cinematic: { back: 10, up: 3, side: 6 + Math.sin(this.t * 0.2) * 3, look: 6, lookUp: 1 },
    };
    const o = this.attract ? { back: 11, up: 4 + Math.sin(this.t * 0.25) * 1.5, side: Math.sin(this.t * 0.15) * 5, look: 18, lookUp: 1 } : offsets[this.cameraMode];
    // the camera rides at deck height, so it stays above the river on bridges and on flyovers
    const deck = (z, x, y) => new THREE.Vector3(lateralX(z, x), hillY(z) + y, z);
    const target = deck(p.z - o.back, p.x + o.side, o.up);
    const look = deck(p.z + o.look, p.x * 0.7, o.lookUp);
    const k = this.cameraMode === "cockpit" && !this.attract ? 1 : 1 - Math.exp(-6 * dt);
    this.camera.position.lerp(target, k);
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-6 * dt);
    }
    this.camera.lookAt(look);
    this.playerMesh.visible = this.cameraMode !== "cockpit" || this.attract;
    // Hide vehicles the chase camera would sit inside.
    for (const c of this.traffic.cars) {
      const behind = p.z - c.z;
      c.mesh.visible = !(c.dir > 0 && behind > 1 && behind < o.back + c.length / 2 + 1 && Math.abs(c.x - (p.x + o.side)) < 2.8 && o.up < 6);
    }
  }

  // ---------------------------------------------------------------- potholes

  updatePotholes(phys) {
    const p = this.player;
    const base = this.legStartZ;
    const plan = this.plan;
    // spawn visuals ahead
    while (this.potholeIdx < plan.potholes.length && base + plan.potholes[this.potholeIdx].z < p.z + 400) {
      const h = plan.potholes[this.potholeIdx];
      const mesh = M.potholeMesh(Math.round(h.radius * 10) / 10, h.deep);
      const x = laneX(0) + h.lane * 3.6 - 0;
      h.wx = Math.min(ROAD_EDGE - 0.5, Math.max(MEDIAN_HALF + 0.6, x));
      h.wz = base + h.z;
      toWorld(h.wz, h.wx, 0, this.leg.biome, mesh.position);
      mesh.rotation.y = curveHeading(h.wz, h.wx);
      if (this.world.raining) mesh.scale.set(1.15, 1, 1.15);
      this.scene.add(mesh);
      this.potholeMeshes.set(h, mesh);
      this.potholeIdx++;
    }
    for (const [h, mesh] of this.potholeMeshes) {
      if (!h.passed && p.z > h.wz) {
        h.passed = true;
        const dx = Math.abs(p.x - h.wx);
        // either wheel track (±0.8 m) dropping into the hole counts
        if (dx < h.radius + 0.55) this.hitPothole(h, phys);
        else if (dx < 3.2) {
          S.addStat(this.state, "potholesDodged");
          if (this.state.stats.potholesDodged % 10 === 0) UI.toast(`Pothole ninja! ${this.state.stats.potholesDodged} dodged`, { kind: "gold" });
        }
      }
      if (p.z > h.wz + 40) {
        this.scene.remove(mesh);
        this.potholeMeshes.delete(h);
      }
    }
  }

  hitPothole(h, phys) {
    const p = this.player;
    const s = this.state;
    const sev = p.speed < 6 ? 0.15 : (p.speed / 30) * (h.deep ? 1.7 : 1);
    const dmg = Math.round(sev * 9 * phys.potholeDamage * 10) / 10;
    s.condition = Math.max(0, s.condition - dmg);
    p.speed *= h.deep ? 0.75 : 0.9;
    this.shake = Math.min(1.2, 0.25 + sev);
    this.audio.thud(sev);
    S.addStat(s, "potholesHit");
    this.legStats.potholesHit++;
    if (sev > 0.6) UI.alertBanner(h.deep ? "GBAM! Deep pothole!" : "Pothole!");
    const tyreLvl = s.upgrades[s.carId]?.tyres ?? 0;
    if (h.deep && p.speed > 18 && Math.random() < 0.35 - tyreLvl * 0.08) this.tyreBurst();
  }

  // ---------------------------------------------------------------- collisions & people

  checkCollisions(car) {
    const p = this.player;
    if (p.crashCooldown > 0) return;
    for (const c of this.traffic.cars) {
      if (c.dir < 0 || !overlaps(p, c)) continue;
      const closing = Math.abs(p.speed - c.speed);
      p.crashCooldown = 1.2;
      if (closing < 2.5) {
        // a tap: nudge apart
        p.speed = Math.min(p.speed, c.speed);
        p.z = c.z < p.z ? c.z + (c.length + p.length) / 2 + 0.3 : c.z - (c.length + p.length) / 2 - 0.3;
        UI.toast("Small bump. The other driver is shouting from his window…", { kind: "bad" });
        continue;
      }
      const dmg = Math.round(crashDamage(closing) * (1.25 - car.toughness * 0.5));
      this.state.condition = Math.max(0, this.state.condition - dmg);
      this.state.stats.crashes++;
      this.legStats.crashes++;
      if (c.z > p.z) {
        p.z = c.z - (c.length + p.length) / 2 - 0.5;
        c.speed += closing * 0.4;
      } else {
        p.z = c.z + (c.length + p.length) / 2 + 0.5;
      }
      p.speed *= 0.3;
      this.shake = 1.4;
      this.audio.thud(1.5);
      this.crashEvent(c, dmg);
      return;
    }
    // animals crossing
    for (const a of this.actors.list) {
      if (a.role !== "crossing" || (a.kind !== "cow" && a.kind !== "goat")) continue;
      if (Math.abs(a.z - p.z) < p.length / 2 + 0.7 && Math.abs(a.x - p.x) < p.width / 2 + 0.6 && p.speed > 3) {
        p.crashCooldown = 2;
        const dmg = a.kind === "cow" ? 18 : 6;
        this.state.condition = Math.max(0, this.state.condition - dmg);
        p.speed *= 0.2;
        this.shake = 1;
        this.audio.thud(1.2);
        a.vx *= 3; // it bolts
        this.animalEvent(a.kind);
        return;
      }
    }
  }

  /** People on the road jump clear of a fast car; nobody gets hurt in this game. */
  peopleDodge() {
    const p = this.player;
    for (const a of this.actors.list) {
      if (!a.mesh.userData.legs || a.role === "officer") continue;
      const dz = a.z - p.z;
      if (dz > 0 && dz < 18 + p.speed * 0.6 && Math.abs(a.x - p.x) < 2 && p.speed > 4) {
        a.x += (a.x > p.x ? 1 : -1) * 0.25;
        if (!a.dodged) {
          a.dodged = true;
          this.actors.say(a, ["Ah! Slow down!", "Oga, easy o!", "This one wan kill person?", "Jesus!", "Haba!"][Math.floor(Math.random() * 5)]);
        }
      }
    }
  }

  scrape() {
    if (this.player.crashCooldown > 0) return;
    this.player.crashCooldown = 0.8;
    this.state.condition = Math.max(0, this.state.condition - 2);
    this.player.speed *= 0.85;
    this.shake = 0.5;
    UI.toast("You scraped the median kerb!", { kind: "bad" });
  }

  // ---------------------------------------------------------------- planned events

  updateEvents(dt) {
    const p = this.player;
    const base = this.legStartZ;
    const ev = this.plan.events;
    while (this.eventIdx < ev.length && base + ev[this.eventIdx].z < p.z + 450) {
      const e = { ...ev[this.eventIdx], wz: base + ev[this.eventIdx].z, state: {} };
      this.spawnEvent(e);
      this.active.push(e);
      this.eventIdx++;
    }
    if (!this.gateSpawned && this.legEndZ - p.z < 450) {
      this.gateSpawned = true;
      const city = CITIES[this.leg.to];
      const gate = M.cityGate(city.name, city.state, 17);
      toWorld(this.legEndZ, 0.8, 0, this.leg.biome, gate.position);
      gate.rotation.y = curveHeading(this.legEndZ);
      gate.userData.z = this.legEndZ;
      this.world.dynamic.add(gate);
    }
    let action = null;
    for (const e of this.active) {
      const d = e.wz - p.z;
      switch (e.type) {
        case "goslow": {
          const inside = p.z > e.wz - 40 && p.z < e.wz + e.length;
          if (inside && !e.state.announced) {
            e.state.announced = true;
            UI.alertBanner(e.cause ? `Go-slow: ${e.cause}` : "Go-slow! Hawkers dey come…", "info");
            this.audio.horn();
          }
          if (inside && p.speed < 4) {
            const h = this.actors.nearest("hawker", p.z, p.x, 5);
            if (h) {
              const snack = SNACKS[h.data.goods];
              action = { text: `Buy ${snack.name} · ${naira(snack.price)}  (B)`, run: () => this.buySnack(h) };
            }
          }
          break;
        }
        case "checkpoint":
          action = this.updateCheckpoint(e, d) ?? action;
          break;
        case "speedtrap":
          if (!e.state.done && d < 0) {
            e.state.done = true;
            const kmh = p.speed * KMH;
            if (kmh > e.limit + 5) {
              const fine = Math.round(Math.min(50_000, (kmh - e.limit) * 600) / 1000) * 1000;
              S.spend(this.state, Math.min(this.state.coins, fine));
              this.audio.whistle();
              this.dialog({
                art: "📸",
                title: "FRSC speed check",
                body: `<p class="quote">"You were doing ${Math.round(kmh)} km/h in a ${e.limit} zone. Speed thrills but kills."</p><p>Official fine: <b>${naira(fine)}</b>. A receipt was issued.</p>`,
                actions: [{ id: "ok", label: "I'll slow down", style: "primary" }],
              });
            } else UI.toast(`FRSC radar: ${Math.round(kmh)} km/h. Within the limit. 👍`);
          }
          break;
        case "animals":
          if (!e.state.spawned && d < 170) {
            e.state.spawned = true;
            this.actors.spawnCrossing(e.wz, e.kind);
            UI.alertBanner(e.kind === "cattle" ? "🐄 Cattle crossing! Slow down" : "🐐 Goats on the road!", "info");
          }
          break;
        case "fuel":
          if (!e.state.warned && d < 300) {
            e.state.warned = true;
            UI.toast("⛽ Filling station ahead on your right. Stop beside it to buy fuel.");
          }
          if (Math.abs(d) < 25 && p.speed < 4 && this.state.fuel < 97) action = { text: `Refuel · ${naira(S.servicePrices(this.state).refuel)}  (F)`, run: () => this.roadsideRefuel() };
          break;
        case "feature":
          this.updateFeatureEvent(e);
          break;
        case "reststop":
          if (!e.state.warned && d < 520) {
            e.state.warned = true;
            UI.alertBanner(`🛑 ${e.name} in 500 m · Fuel · Food · Rest`, "info");
          }
          if (Math.abs(d - 15) < 45 && p.speed < 4) action = { text: `Pull into ${e.name}  (R)`, run: () => this.restStopDialog(e) };
          break;
        case "breakdown-scene":
          if (!e.state.told && d < 60) {
            e.state.told = true;
            UI.toast("Somebody's car don knock by the roadside. A GreenRev mechanic is already on it.", {
              cta: { label: "Find a mechanic", onClick: () => this.cta("mechanic", { reason: "roadside_scene", city: this.leg.to }) },
            });
          }
          break;
      }
    }
    this.active = this.active.filter((e) => e.wz > p.z - 200 || (e.type === "goslow" && e.wz + e.length > p.z - 50) || (e.type === "feature" && e.feature.to > p.z - 50));
    if (action) {
      UI.actionButton(action.text, action.run);
      if (this.input.took("KeyB", "KeyF", "KeyR")) action.run();
    } else UI.actionButton(null);
  }

  /** Build bridge/flyover/roundabout set pieces before they come into view. */
  spawnFeaturesAhead() {
    const list = this.legFeatures ?? [];
    while (this.featureIdx < list.length && list[this.featureIdx].from < this.player.z + 900) {
      const f = list[this.featureIdx++];
      const fx = buildFeature(this.world.dynamic, f, this.leg.biome);
      fx.to = f.to;
      (this.featureFx ??= []).push(fx);
      if (f.type === "roundabout") this.traffic.slowZones.push({ from: f.from - 50, to: f.to + 10, speed: 10 });
      if (f.type === "bridge" && f.style === "beam") this.traffic.slowZones.push({ from: f.from, to: f.to, speed: 20 });
    }
  }

  /** Drop props and set pieces well behind the player. */
  cullBehind() {
    const limit = this.player.z - 300;
    const kids = this.world.dynamic.children;
    for (let i = kids.length - 1; i >= 0; i--) if (kids[i].userData.z !== undefined && kids[i].userData.z < limit) this.world.dynamic.remove(kids[i]);
    if (this.featureFx?.length) this.featureFx = this.featureFx.filter((fx) => fx.to > limit);
  }

  /** What happens as you drive through a feature. */
  updateFeatureEvent(e) {
    const p = this.player;
    const f = e.feature;
    const st = e.state;
    if (!f) return;
    if (f.type === "bridge" && !st.on && p.z > f.from) {
      st.on = true;
      if (f.style === "beam") UI.toast(`🌉 ${f.name}. Narrow bridge, no overtaking.`);
      else {
        UI.alertBanner(`🌊 ${f.name} · River Niger`, "info");
        UI.toast(f.style === "cable" ? "The Second Niger Bridge: 1.6 km linking Asaba and Onitsha." : "Jebba Bridge: road and rail cross the Niger side by side.", { kind: "gold" });
        this.state.xp += 25;
      }
    }
    if (f.type === "flyover" && !st.on && p.z > f.from + 60) {
      st.on = true;
      UI.toast(`🛣 Up the ${f.name.toLowerCase()}. The junction traffic is below you.`);
    }
    if (f.type === "roundabout") {
      const mid = (f.from + f.to) / 2;
      if (!st.warned && p.z > f.from - 220) {
        st.warned = true;
        UI.alertBanner(`🔄 ${f.name} ahead. Slow down`, "info");
      }
      if (!st.done && p.z > mid) {
        st.done = true;
        const kmh = p.speed * KMH;
        if (kmh > 60) {
          const fine = 5_000;
          S.spend(this.state, Math.min(this.state.coins, fine));
          this.audio.whistle();
          const who = this.route.id.startsWith("lagos") && this.legIndex === 0 ? "LASTMA officer" : "traffic warden";
          this.dialog({
            art: "🔄",
            title: `${f.name}: too fast!`,
            body: `<p class="quote">The ${who} blows the whistle: "Oga! You wan fly the roundabout? Park there!"</p><p>You took the roundabout at ${Math.round(kmh)} km/h. Fine: <b>${naira(fine)}</b>. Under 60 km/h next time.</p>`,
            actions: [{ id: "ok", label: "Sorry, I'll slow down", style: "primary" }],
          });
        } else {
          this.state.xp += 10;
          UI.toast("Smooth roundabout. The warden nods at you. 👍");
        }
      }
    }
  }

  spawnEvent(e) {
    const biome = this.leg.biome;
    const put = (mesh, z, x, rot = 0) => {
      toWorld(z, x, 0, biome, mesh.position);
      mesh.rotation.y = curveHeading(z, x) + rot;
      mesh.userData.z = z;
      this.world.dynamic.add(mesh);
      return mesh;
    };
    switch (e.type) {
      case "goslow":
        this.traffic.slowZones.push({ from: e.wz - 30, to: e.wz + e.length, speed: 4 });
        this.actors.spawnHawkers(e.wz, Math.round(4 + e.length / 80));
        for (let i = 0; i < 5; i++) this.traffic.spawn(e.wz + i * 9, 1, i % 2);
        break;
      case "checkpoint": {
        put(M.checkpointProps(e.kind), e.wz, ROAD_EDGE + 1.2, -Math.PI / 2);
        put(M.speedBump(), e.wz - 50, ROAD_EDGE / 2 + 0.3);
        const label = { police: "POLICE CHECKPOINT", military: "MILITARY CHECKPOINT", frsc: "FRSC PATROL", vio: "VIO INSPECTION" }[e.kind];
        put(M.textSign(label, { bg: e.kind === "military" ? "#4b5320" : e.kind === "frsc" ? "#e0a100" : e.kind === "vio" ? "#9d0208" : "#0b1d3a", sub: "Slow down · Stop when asked" }), e.wz - 220, ROAD_EDGE + 3);
        this.actors.spawnCheckpointCrew(e.wz, e.kind);
        this.traffic.slowZones.push({ from: e.wz - 70, to: e.wz + 8, speed: 3 });
        break;
      }
      case "speedtrap":
        put(M.textSign("SPEED LIMIT 100", { bg: "#ffffff", fg: "#c1121f", sub: "FRSC radar in operation" }), e.wz - 300, ROAD_EDGE + 3);
        this.actors.add("frsc", e.wz, ROAD_EDGE + 2.2, { role: "officer", face: -Math.PI / 2 });
        break;
      case "fuel":
        put(M.fillingStation(), e.wz, ROAD_EDGE + 10, -Math.PI / 2);
        break;
      case "billboard": {
        let board;
        if (e.ad === "advertise") {
          const live = activeCampaigns(this.campaigns, S.dayKey(), this.route.id);
          if (live.length) {
            const c = live[this.adRotation++ % live.length];
            board = M.sponsoredBoard(c);
            track("ad_impression", { campaign: c.id, routeId: this.route.id, leg: this.legIndex });
          } else board = M.advertiseBoard(CONFIG.advertise.packages);
        } else board = M.billboard(e.ad);
        put(board, e.wz, e.side * (ROAD_EDGE + 9), M.boardFacing(e.side));
        break;
      }
      case "reststop": {
        // forecourt, buka, rest house and parked trailers on the right, set back from the road
        put(M.fillingStation(), e.wz, ROAD_EDGE + 10, -Math.PI / 2);
        put(M.buka(), e.wz + 32, ROAD_EDGE + 13, -Math.PI / 2);
        put(M.restHouse(), e.wz + 58, ROAD_EDGE + 21, -Math.PI / 2);
        put(M.vehicleMesh("truck", "#1d4e89"), e.wz - 26, ROAD_EDGE + 17, 0.15);
        put(M.vehicleMesh("tanker", "#f1faee"), e.wz - 40, ROAD_EDGE + 21, 0.1);
        put(M.vehicleMesh("bus", "#f3f5f4"), e.wz + 78, ROAD_EDGE + 14, 0);
        put(M.textSign(`${e.name.toUpperCase()} 500m`, { bg: "#0b6e4f", sub: "⛽ Fuel  ·  🍲 Food  ·  🛏 Rest  ·  🔧 Mechanic" }), e.wz - 500, ROAD_EDGE + 3);
        put(M.textSign("REST STOP", { bg: "#0b6e4f", w: 4, h: 1.2, sub: "Turn in here" }), e.wz - 40, ROAD_EDGE + 3);
        const ad = put(M.textSign("ADVERTISE HERE", { bg: "#ffd60a", fg: "#111", sub: "Roadside ads from 3 days · Tap to book" }), e.wz + 95, ROAD_EDGE + 3.5);
        ad.userData.ad = "advertise";
        for (const [dz, dx, kind] of [[28, 11.5, "civilian"], [33, 12.2, "civilian"], [36, 11.6, "hawker"], [-4, 11, "civilian"]]) {
          this.actors.add(kind, e.wz + dz, ROAD_EDGE + dx, { role: "scene", face: -Math.PI / 2 });
        }
        break;
      }
      case "breakdown-scene": {
        const broken = put(M.vehicleMesh("sedan", "#6c757d"), e.wz, ROAD_EDGE + 1.3);
        broken.rotation.z = 0.06;
        put(M.warningTriangle(), e.wz - 12, ROAD_EDGE - 0.4);
        this.actors.spawnMechanicScene(e.wz);
        break;
      }
    }
  }

  /** Approach → slow → stop → dialog. Running a checkpoint is a fine. */
  updateCheckpoint(e, d) {
    const p = this.player;
    const st = e.state;
    if (st.done) return null;
    const names = { police: "Police checkpoint", military: "Military checkpoint", frsc: "FRSC patrol", vio: "VIO inspection" };
    if (!st.warned && d < 260) {
      st.warned = true;
      UI.alertBanner(`${names[e.kind]} ahead. Slow down!`, "info");
    }
    if (d < 45 && d > -6) {
      st.maxSpeed = Math.max(st.maxSpeed ?? 0, p.speed);
      if (p.speed < 5.5) {
        st.done = true;
        this.checkpointDialog(e.kind);
        return null;
      }
    }
    if (d < -6) {
      st.done = true;
      if ((st.maxSpeed ?? p.speed) > 14) this.ranCheckpoint(e.kind);
      else {
        UI.toast(`The ${e.kind === "military" ? "soldier" : "officer"} waved you through. "Oya, move!"`);
        this.audio.whistle();
      }
    }
    return d < 60 && d > 0 && p.speed > 8 ? { text: "Slow down for the checkpoint ↓", run: () => {} } : null;
  }

  // ---------------------------------------------------------------- dialogs (game pauses while open)

  async dialog(opts) {
    this.paused = true;
    UI.actionButton(null);
    const id = await UI.modal(opts);
    this.paused = false;
    this.clock.getDelta();
    return id;
  }

  async checkpointDialog(kind) {
    const s = this.state;
    this.audio.whistle();
    this.player.speed = 0;
    const papersOk = s.papersValidTrips > 0;
    if (kind === "police") {
      const choice = await this.dialog({
        art: "👮🏾‍♂️",
        title: "Police checkpoint",
        body: `<p class="quote">"Good afternoon, oga. Where una dey go? Show me your vehicle particulars."</p><p>Papers: <b>${papersOk ? `valid (${s.papersValidTrips} more trips)` : "EXPIRED"}</b></p>`,
        actions: [
          { id: "papers", label: "Hand over vehicle papers", style: "primary" },
          { id: "greet", label: `"Good afternoon, officer! We dey go ${CITIES[this.leg.to].name}."` },
        ],
      });
      if (choice === "greet") await this.dialog({ art: "👮🏾‍♂️", title: "Police checkpoint", body: `<p class="quote">"Ehen, ${CITIES[this.leg.to].name}? Fine. Particulars, please."</p>`, actions: [{ id: "ok", label: "Hand over vehicle papers", style: "primary" }] });
      if (papersOk) return this.cleared("Everything correct. \"Safe journey o!\"");
      const fine = 10_000;
      S.spend(s, Math.min(s.coins, fine));
      await this.dialog({
        art: "🧾",
        title: "Papers expired",
        body: `<p class="quote">"Your papers don expire. Go and renew am for the next town."</p><p>Official fine: <b>${naira(fine)}</b>. Always ask for a receipt. You can renew your papers at any city stop.</p>`,
        actions: [{ id: "ok", label: "Okay, sir", style: "primary" }],
      });
    } else if (kind === "military") {
      await this.dialog({
        art: "🪖",
        title: "Military stop and search",
        body: `<p class="quote">"Everybody come down! Open your boot. Where you dey come from?"</p><p>Stay calm, keep your hands where they can see them, and answer politely.</p>`,
        actions: [{ id: "ok", label: "Step out and open the boot", style: "primary" }],
      });
      const quips = ["\"Na you get this fine car? Okay. Carry go.\"", "\"Wetin dey this bag?\" \"Na agege bread, sir.\" \"Hmm. You fit go.\"", "\"Drive safely, this road no good at night.\""];
      await this.dialog({ art: "🪖", title: "Search complete", body: `<p class="quote">${quips[Math.floor(Math.random() * quips.length)]}</p>`, actions: [{ id: "ok", label: "Thank you, sir", style: "primary" }] });
      return this.cleared("Search done. Back on the road.");
    } else if (kind === "frsc") {
      const missing = Object.entries(SAFETY_KIT).filter(([k]) => ["extinguisher", "triangle", "spareTyre"].includes(k) && !s.kit[k]);
      if (missing.length === 0) {
        await this.dialog({ art: "🦺", title: "FRSC patrol", body: `<p class="quote">"Fire extinguisher, warning triangle, spare tyre… complete! Thank you for keeping our roads safe."</p>`, actions: [{ id: "ok", label: "Safe journey!", style: "primary" }] });
        return this.cleared("FRSC: all safety kit present. +XP");
      }
      const fine = missing.length * 3_000;
      S.spend(s, Math.min(s.coins, fine));
      await this.dialog({
        art: "🦺",
        title: "FRSC patrol",
        cta: { target: "parts", context: { reason: "frsc_kit" } },
        body: `<p class="quote">"Where your ${missing.map(([, v]) => v.name.toLowerCase()).join(" and ")}? That's an offence."</p><p>Official fine: <b>${naira(fine)}</b>. Buy the kit in the Garage before the next patrol.</p>${UI.ctaBlock("Get a fire extinguisher, triangle and spare tyre from trusted GreenRev parts vendors.", "Shop safety kit on GreenRev")}`,
        actions: [{ id: "ok", label: "Noted, I'll buy them", style: "primary" }],
      });
    } else if (kind === "vio") {
      if (s.condition >= 50) {
        await this.dialog({ art: "🔧", title: "VIO inspection", body: `<p class="quote">"Lights, wipers, tyres… this car is roadworthy. Go well."</p>`, actions: [{ id: "ok", label: "Thank you", style: "primary" }] });
        return this.cleared("VIO: roadworthy.");
      }
      const fine = 15_000;
      S.spend(s, Math.min(s.coins, fine));
      await this.dialog({
        art: "🔧",
        title: "VIO: not roadworthy",
        cta: { target: "mechanic", context: { reason: "vio_fail", city: CITIES[this.leg.to].name } },
        body: `<p class="quote">"This car no roadworthy! Brake light no dey work, tyre don flat. See mechanic before you kill somebody."</p><p>Official fine: <b>${naira(fine)}</b>. Car condition: <b>${Math.round(s.condition)}%</b>.</p>${UI.ctaBlock("Book a verified mechanic near you on GreenRev and fix it properly.", "Find a GreenRev mechanic")}`,
        actions: [{ id: "ok", label: "I'll fix it at the next town", style: "primary" }],
      });
    }
    S.save(s);
  }

  async cleared(msg) {
    S.addStat(this.state, "checkpoints");
    this.legStats.checkpointsCleared++;
    this.state.xp += 20;
    UI.toast(msg, { kind: "gold" });
    this.checkProgress();
  }

  async ranCheckpoint(kind) {
    const fine = kind === "military" ? 50_000 : 25_000;
    S.spend(this.state, Math.min(this.state.coins, fine));
    this.audio.whistle();
    await this.dialog({
      art: "🚨",
      title: "You zoomed past a checkpoint!",
      body: `<p class="quote">"${kind === "military" ? "Stop there! You no see us?!" : "Oga! Park! Park well!"}"</p><p>They caught up with you. Fine: <b>${naira(fine)}</b>. Next time, slow down when you see the drums.</p>`,
      actions: [{ id: "ok", label: "Sorry, sir", style: "primary" }],
    });
  }

  async crashEvent(c, dmg) {
    const who = { danfo: "danfo driver", okada: "okada man", keke: "keke rider", truck: "trailer driver", tanker: "tanker driver", bus: "bus driver" }[c.body] ?? "other driver";
    if (dmg < 15) return UI.toast(`Bang! You hit a ${c.body}. −${dmg}% condition`, { kind: "bad" });
    const id = await this.dialog({
      art: "💥",
      title: "Accident!",
      cta: { target: "mechanic", context: { reason: "crash" } },
      body: `<p>You crashed into a ${c.body}. Car condition <b>−${dmg}%</b> (now ${Math.round(this.state.condition)}%).</p><p class="quote">The ${who} comes out shouting: "Na your fault! You no get eye?"</p><p>Everybody is okay. FRSC arrives to clear the road.</p>
        ${UI.ctaBlock("Get the damage looked at by a verified mechanic on GreenRev.", "Find a GreenRev mechanic")}`,
      actions: [
        { id: "settle", label: "Exchange numbers and drive on", hint: "Free" },
        { id: "fix", label: "Roadside panel beater", hint: naira(Math.round(dmg * 6_000)) },
      ],
    });
    if (id === "fix" && S.spend(this.state, Math.round(dmg * 6_000))) this.state.condition = Math.min(100, this.state.condition + dmg * 0.8);
    S.save(this.state);
  }

  async animalEvent(kind) {
    const fine = kind === "cow" ? 60_000 : 15_000;
    S.spend(this.state, Math.min(this.state.coins, fine));
    await this.dialog({
      art: kind === "cow" ? "🐄" : "🐐",
      title: kind === "cow" ? "You hit a cow!" : "You knocked a goat!",
      body: `<p class="quote">${kind === "cow" ? "The herder runs over: \"Ah! My cow! You must pay!\"" : "\"Who get this goat?!\" A woman appears from nowhere."}</p><p>The animal is fine, but you pay <b>${naira(fine)}</b> compensation. Slow down when animals are on the road.</p>`,
      actions: [{ id: "ok", label: "Pay and move on", style: "primary" }],
    });
  }

  async tyreBurst() {
    this.player.speed = 0;
    const s = this.state;
    const actions = [];
    if (s.kit.spareTyre) actions.push({ id: "spare", label: "Change to your spare tyre", hint: "Free · uses your spare", style: "primary" });
    actions.push({ id: "vulc", label: "Call the roadside vulcanizer", hint: naira(15_000) });
    actions.push({ id: "gr", label: "Find a GreenRev mechanic", hint: "Opens GreenRev · 30% off in-game fix" });
    const id = await this.dialog({ art: "🛞", title: "Tyre burst!", body: "<p>That pothole was too deep. Your tyre don burst.</p>", actions });
    if (id === "spare") {
      s.kit.spareTyre = false;
      UI.toast("Spare tyre on. Buy a new spare in the Garage, FRSC checks for it.");
    } else if (id === "vulc") S.spend(s, Math.min(s.coins, 15_000));
    else {
      this.cta("mechanic", { reason: "tyre_burst", city: this.leg.to });
      S.spend(s, Math.min(s.coins, 10_500));
    }
    S.save(s);
  }

  async breakdownEvent(cause) {
    this.brokenDown = true;
    this.player.speed = 0;
    const s = this.state;
    const cost = S.servicePrices({ ...s, condition: 0 }).repair;
    const id = await this.dialog({
      art: "🔥",
      title: "Your car don knock!",
      body: `<p>Smoke is coming from the bonnet. The ${cause} has given up in the middle of the ${this.leg.road}.</p><p>A roadside mechanic offers to fix it, at a roadside price.</p>`,
      actions: [
        { id: "gr", label: "Find a verified GreenRev mechanic", hint: `30% off · ${naira(cost * 0.7)}`, style: "primary" },
        { id: "road", label: "Roadside mechanic", hint: naira(cost * 1.3) },
        { id: "limp", label: "Limp slowly to the next town", hint: "Free · very slow" },
      ],
    });
    if (id === "gr") {
      this.cta("mechanic", { reason: "breakdown", city: this.leg.to });
      s.condition = 100;
      S.spend(s, Math.min(s.coins, Math.round(cost * 0.7)));
    } else if (id === "road") {
      s.condition = 100;
      S.spend(s, Math.min(s.coins, Math.round(cost * 1.3)));
    } else s.condition = 8;
    this.brokenDown = false;
    S.save(s);
  }

  async outOfFuelEvent() {
    this.outOfFuel = true;
    const price = 25_000;
    await this.dialog({
      art: "⛽",
      title: "You don run out of fuel!",
      body: `<p>A boy appears with a jerrycan: "Oga, I get fuel. Na ${naira(price)} for 10 litres."</p><p>Black-market price, but you're stranded.</p>`,
      actions: [{ id: "ok", label: "Buy the jerrycan", hint: naira(price), style: "primary" }],
    });
    S.spend(this.state, Math.min(this.state.coins, price));
    this.state.fuel = 25;
    this.outOfFuel = false;
  }

  buySnack(h) {
    const snack = SNACKS[h.data.goods];
    if (!S.spend(this.state, snack.price)) return UI.toast("You no get change!", { kind: "bad" });
    this.state.energy = Math.min(100, (this.state.energy ?? 100) + snack.energy);
    this.energyWarned = false;
    S.addStat(this.state, "hawkerBuys");
    this.audio.coin();
    this.actors.say(h, ["God bless you, oga!", "Thank you, ma!", "Buy another one!", "Correct customer!"][Math.floor(Math.random() * 4)]);
    h.role = "walker";
    h.vz = -1.2;
    UI.toast(`Bought ${snack.name} for ${naira(snack.price)}. Energy +${snack.energy}`, { kind: "gold" });
    this.checkProgress();
  }

  /** Pull in at a rest stop: fuel, a regional meal, a nap, a quick mechanic check, safety kit. */
  async restStopDialog(e) {
    const s = this.state;
    this.player.speed = 0;
    if (!e.state.visited) {
      e.state.visited = true;
      S.addStat(s, "restStops");
      this.checkProgress();
    }
    const menu = MENUS[this.leg.biome] ?? MENUS.south;
    const greet = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    for (;;) {
      const prices = S.servicePrices(s);
      const check = Math.round(prices.repair * 0.25);
      const missingKit = Object.entries(SAFETY_KIT).filter(([k]) => !s.kit[k]);
      const id = await this.dialog({
        art: "🛑",
        title: e.name,
        body: `<p class="quote">${greet}</p><p>Fuel <b>${Math.round(s.fuel)}%</b> · Car <b>${Math.round(s.condition)}%</b> · Energy <b>${Math.round(s.energy ?? 100)}%</b> · Wallet <b>${naira(s.coins)}</b></p>
          ${UI.ctaBlock("Want your business on this rest stop's billboard? Drivers on this road see it every day.", "Advertise at rest stops")}`,
        cta: { target: "advertise", context: { reason: "rest_stop" } },
        actions: [
          { id: "fuel", label: "⛽ Fill the tank", hint: naira(prices.refuel), disabled: s.fuel > 97 },
          ...menu.map((m, i) => ({ id: `food-${i}`, label: `🍲 ${m.name}`, hint: `${naira(m.price)} · +${m.energy} energy` })),
          { id: "rest", label: "🛏 Rest for an hour", hint: `${naira(1_000)} · energy to 100%`, disabled: (s.energy ?? 100) > 95 },
          { id: "check", label: "🔧 Quick mechanic check", hint: `${naira(check)} · +15% condition`, disabled: s.condition > 92 },
          ...(missingKit.length ? [{ id: "kit", label: `🧯 Buy ${missingKit[0][1].name}`, hint: naira(missingKit[0][1].price) }] : []),
          { id: "go", label: "Back on the road →", style: "primary" },
        ],
      });
      if (id === "go") return S.save(s);
      if (id === "fuel") S.refuel(s) || UI.toast("Not enough money for fuel", { kind: "bad" });
      else if (id.startsWith("food-")) {
        const m = menu[Number(id.slice(5))];
        if (S.spend(s, m.price)) {
          s.energy = Math.min(100, (s.energy ?? 100) + m.energy);
          this.energyWarned = false;
          S.addStat(s, "meals");
          this.audio.coin();
          UI.toast(`${m.name}. Correct food! Energy +${m.energy}`, { kind: "gold" });
          this.checkProgress();
        } else UI.toast("You no get money for food", { kind: "bad" });
      } else if (id === "rest") {
        if (S.spend(s, 1_000)) {
          s.energy = 100;
          this.energyWarned = false;
          this.timeOfDay = ((this.timeOfDay ?? 8) + 1) % 24;
          UI.toast("You slept small. Fresh again! 😴");
        }
      } else if (id === "check") {
        if (S.spend(s, check)) {
          s.condition = Math.min(100, s.condition + 15);
          UI.toast("The mechanic tightened a few things. +15% condition");
        }
      } else if (id === "kit") {
        const r = S.buyKit(s, missingKit[0][0]);
        if (!r.ok) UI.toast(r.reason, { kind: "bad" });
      }
      S.save(s);
    }
  }

  /** Booking panel for businesses that want a roadside billboard. Real links, so it works in any embed. */
  async openAdvertise(source) {
    const A = CONFIG.advertise;
    track("advertise_open", { source });
    const esc = (u) => String(u).replace(/"/g, "&quot;");
    const rows = A.packages.map((p) => {
      const href = p.paystackUrl || A.contactUrl;
      const label = p.paystackUrl ? "Pay with Paystack" : "Book now";
      return `<div class="pkg"><div><b>${p.days} days</b><small>${naira(Math.round(p.price / p.days))}/day</small></div><b class="price">${naira(p.price)}</b>
        <a class="btn primary" data-pkg="${p.id}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a></div>`;
    }).join("");
    const p = this.dialog({
      art: "📣",
      title: "Advertise on Nigeria's highways",
      body: `<p>Put your business on the roadside billboards in GreenRev Roadtrip: on the Lagos–Abuja, Lagos–Calabar, Abuja–Kano, Jos and Maiduguri roads, in the web and mobile app.</p>
        <div class="pkgs">${rows}</div>
        <h2>How it works</h2>
        <ol class="steps"><li>Pick a package and pay securely with Paystack.</li><li>Send your billboard image and payment reference to <a href="${esc(A.contactUrl)}" target="_blank" rel="noopener">GreenRev advertising</a>. Add a link (website, WhatsApp or GreenRev store) for drivers who tap your ad.</li><li>Your ad goes live within 24 hours, and we send you how many drivers saw and tapped it.</li></ol>
        <h2>Billboard image</h2>
        <p><b>1024 × 512 px</b> (2:1 landscape), JPG or PNG, under 500 KB. Drivers see it for about 3 seconds: one big message, your logo, and a phone number or web address. Keep text 40 px from the edges.</p>
        <p><a class="btn" href="${esc(A.templateUrl)}" target="_blank" rel="noopener">Download the billboard template</a></p>`,
      actions: [{ id: "close", label: "Back to the road", style: "ghost" }],
    });
    document.querySelectorAll("#modal-body [data-pkg]").forEach((a) => a.addEventListener("click", () => track("advertise_package_click", { package: a.dataset.pkg, source })));
    await p;
  }

  roadsideRefuel() {
    const cost = S.servicePrices(this.state).refuel;
    if (S.refuel(this.state)) {
      this.audio.coin();
      UI.toast(`Tank full. Paid ${naira(cost)}.`);
    } else UI.toast("Not enough money for fuel", { kind: "bad" });
  }

  // ---------------------------------------------------------------- arrivals

  async arrive() {
    const s = this.state;
    const leg = this.leg;
    const city = CITIES[leg.to];
    const seconds = this.t - this.legStats.startedAt;
    const pay = S.legPayout(leg, { ...this.legStats, seconds });
    s.coins += pay.total;
    s.xp += 40;
    s.stats.km += leg.km;
    S.addStat(s, "legs");
    if (this.legStats.crashes === 0) S.addStat(s, "cleanLegs");
    if (!s.stamps.includes(leg.from)) s.stamps.push(leg.from);
    const newStamp = !s.stamps.includes(leg.to);
    if (newStamp) s.stamps.push(leg.to);
    s.papersValidTrips = Math.max(0, s.papersValidTrips - 1);
    s.energy = 100;
    s.trip.elapsed = (s.trip.elapsed ?? 0) + seconds;
    const last = this.legIndex === this.route.legs.length - 1;
    s.trip.legIndex = this.legIndex + 1;
    this.checkProgress();
    S.save(s);
    track("leg_complete", { routeId: this.route.id, leg: this.legIndex, seconds: Math.round(seconds), crashes: this.legStats.crashes });
    this.audio.coin();

    this.paused = true;
    UI.actionButton(null);
    for (;;) {
      const prices = S.servicePrices(s);
      const cta = this.legIndex % 2 === 0
        ? UI.ctaBlock(`Are you a car dealer in ${city.name}? List your cars where thousands of buyers are looking.`, "Sign up as a GreenRev dealer")
        : UI.ctaBlock(`Ready for a stronger car for these roads? Browse cars in ${city.name} on GreenRev Marketplace.`, "Browse GreenRev Marketplace");
      const id = await UI.modal({
        art: newStamp ? "📍" : "🏙️",
        title: `Welcome to ${city.name}!`,
        cta: { target: this.legIndex % 2 === 0 ? "dealer" : "marketplace", context: { reason: "city_arrival", city: city.name } },
        body: `<p>${city.fact}</p><p>🍲 Must-eat: <b>${city.food}</b> · 🏛 ${city.landmark}</p>${newStamp ? `<p>🛂 New passport stamp: <b>${city.name}, ${city.state}</b></p>` : ""}
          <div class="kv"><span>Trip pay</span><b class="pos">${naira(pay.base)}</b><span>No-crash bonus</span><b class="pos">${naira(pay.clean)}</b><span>Checkpoints cleared</span><b class="pos">${naira(pay.law)}</b><span>Pothole damage deduction</span><b class="neg">${naira(pay.roadPenalty)}</b><span>Time</span><b>${UI.fmtTime(seconds)}</b><span>Wallet</span><b>${naira(s.coins)}</b></div>
          <p>Fuel ${Math.round(s.fuel)}% · Car ${Math.round(s.condition)}% · Papers ${s.papersValidTrips > 0 ? `${s.papersValidTrips} trips left` : "EXPIRED"}</p>${cta}`,
        actions: [
          { id: "fuel", label: "Refuel", hint: naira(prices.refuel), disabled: s.fuel > 98 },
          { id: "repair", label: "Mechanic: full repair", hint: naira(prices.repair), disabled: s.condition > 98 },
          { id: "papers", label: "Renew vehicle papers", hint: naira(prices.papers), disabled: s.papersValidTrips > 2 },
          { id: "garage", label: "Garage: cars, upgrades & safety kit" },
          last ? { id: "finish", label: "Finish the journey 🎉", style: "primary" } : { id: "go", label: `Continue to ${CITIES[this.route.legs[this.legIndex + 1].to].name} →`, style: "primary" },
          { id: "menu", label: "Save and rest here (menu)", style: "ghost" },
        ],
      });
      if (id === "fuel") S.refuel(s) || UI.toast("Not enough money", { kind: "bad" });
      else if (id === "repair") S.repair(s) || UI.toast("Not enough money", { kind: "bad" });
      else if (id === "papers") S.renewPapers(s) || UI.toast("Not enough money", { kind: "bad" });
      else if (id === "garage") {
        await UI.openGarage(s);
        this.player = { ...this.makePlayer(), z: this.player.z, x: this.player.x };
      } else if (id === "go") {
        S.save(s);
        this.legIndex++;
        this.legStartZ = this.player.z;
        this.paused = false;
        this.clock.getDelta();
        this.beginLeg();
        return;
      } else if (id === "finish") return this.finishRoute();
      else if (id === "menu") {
        this.paused = false;
        S.save(s);
        return this.showMenu();
      }
      S.save(s);
    }
  }

  async finishRoute() {
    const s = this.state;
    const r = this.route;
    const total = s.trip.elapsed ?? 0;
    const first = !s.completedRoutes.includes(r.id);
    if (first) s.completedRoutes.push(r.id);
    const best = s.bestTimes[r.id];
    if (!best || total < best) s.bestTimes[r.id] = total;
    const bonus = first ? 500_000 : 150_000;
    s.coins += bonus;
    s.xp += 200;
    s.trip = null;
    const unlocked = S.availableRoutes(s).filter((x) => x.unlockedBy === r.id).map((x) => x.name);
    this.checkProgress();
    S.save(s);
    track("route_complete", { routeId: r.id, seconds: Math.round(total), first });
    const p = UI.modal({
      art: "🏁",
      title: `${r.name}: journey complete!`,
      cta: { target: "dealer", context: { reason: "route_complete" } },
      body: `<p>You made it by road. Total driving time <b>${UI.fmtTime(total)}</b>${best && total < best ? " (new best!)" : ""}.</p><p>Completion bonus: <b>${naira(bonus)}</b></p>${unlocked.length ? `<p>🔓 New journey unlocked: <b>${unlocked.join(", ")}</b></p>` : ""}
        <p>Tomorrow the roads change: new potholes, new checkpoints, and your streak reward goes up.</p>
        ${UI.ctaBlock("Sell cars? Thousands of buyers browse GreenRev every day. Dealers sign up free.", "Become a GreenRev dealer")}`,
      actions: [
        { id: "share", label: "Share my trip" },
        { id: "menu", label: "Back to menu", style: "primary" },
      ],
    });
    const id = await p;
    if (id === "share") {
      const text = `I just drove ${r.name} on GreenRev Roadtrip in ${UI.fmtTime(total)}! 🚗🇳🇬 Potholes, checkpoints, go-slow and all.`;
      try {
        if (navigator.share) await navigator.share({ text, url: location.href });
        else await navigator.clipboard.writeText(`${text} ${location.href}`);
        UI.toast("Copied! Share it with your people.");
      } catch { /* user cancelled */ }
    }
    this.paused = false;
    this.showMenu();
  }

  checkProgress() {
    for (const m of S.updateMissions(this.state)) UI.toast(`✅ Mission done: ${m.text} (+${naira(m.reward)})`, { kind: "gold" });
    for (const a of S.checkAchievements(this.state)) UI.toast(`🏆 Achievement: ${a.name}`, { kind: "gold" });
  }

  async pause() {
    if (this.mode !== "drive" || this.paused) return;
    const id = await this.dialog({
      art: "⏸",
      title: "Paused",
      body: `<p>${CITIES[this.leg.from].name} → ${CITIES[this.leg.to].name} · ${Math.max(0, Math.round((this.legEndZ - this.player.z) / this.plan.length * this.leg.km))} km to go</p>`,
      actions: [
        { id: "resume", label: "Resume", style: "primary" },
        { id: "camera", label: `Camera: ${this.cameraMode}` },
        { id: "sound", label: `Sound: ${this.state.settings.sound ? "on" : "off"}` },
        { id: "menu", label: "Quit to menu (progress saved at last town)", style: "ghost" },
      ],
    });
    if (id === "camera") this.cycleCamera();
    if (id === "sound") {
      this.state.settings.sound = !this.state.settings.sound;
      this.audio.setEnabled(this.state.settings.sound);
    }
    S.save(this.state);
    if (id === "menu") {
      this.mode = "menu";
      this.idleAttract();
      this.resetWorld();
      this.player = this.makePlayer();
      this.player.speed = 20;
      return this.showMenu();
    }
    if (id === "camera" || id === "sound") return this.pause();
  }

  // ---------------------------------------------------------------- HUD & bubbles

  updateHud(phys) {
    const s = this.state;
    const p = this.player;
    const kmh = Math.round(p.speed * KMH);
    $("hud-speed").textContent = kmh;
    $("hud-speed").parentElement.classList.toggle("fast", kmh > 100);
    $("hud-coins").textContent = Math.round(s.coins).toLocaleString("en-NG");
    UI.setBar("bar-fuel", s.fuel);
    UI.setBar("bar-cond", s.condition);
    UI.setBar("bar-energy", s.energy ?? 100);
    const progress = Math.min(1, (p.z - this.legStartZ) / this.plan.length);
    $("hud-km").textContent = `${Math.max(0, Math.round((1 - progress) * this.leg.km))} km`;
    UI.renderProgress(this.route, this.legIndex, progress);
    if (s.condition < 20 && !this.condWarned) {
      this.condWarned = true;
      UI.toast("Engine light is on and the car is struggling. Fix it at the next town.", {
        kind: "bad",
        cta: { label: "Find a mechanic", onClick: () => this.cta("mechanic", { reason: "low_condition" }) },
        ttl: 8000,
      });
    }
    if (s.condition >= 20) this.condWarned = false;
    void phys;
  }

  renderBubbles() {
    const box = $("bubbles");
    const want = this.mode === "drive" || this.attract ? this.actors.bubbles : [];
    while (box.children.length < want.length) box.appendChild(document.createElement("div")).className = "bubble";
    while (box.children.length > want.length) box.lastChild.remove();
    const v = new THREE.Vector3();
    want.forEach((b, i) => {
      const el = box.children[i];
      v.copy(b.actor.mesh.position);
      v.y += 2.3;
      v.project(this.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = visible ? "" : "none";
      el.textContent = b.text;
      el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    });
  }

  /** Tap a GreenRev billboard in the 3D world to open it. */
  tapScene(e) {
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.dynamic.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData?.ad && !o.userData?.campaign) o = o.parent;
      if (o?.userData.campaign) {
        const c = o.userData.campaign;
        track("ad_click", { campaign: c.id, routeId: this.route.id });
        return openExternal(c.link, c.advertiser ?? "advertiser");
      }
      if (o?.userData.ad === "advertise") return this.openAdvertise("billboard_tap");
      if (o?.userData.ad) return this.cta(o.userData.ad, { reason: "billboard_tap" });
    }
  }
}


try {
  window.game = new Game();
} catch (err) {
  console.error(err);
}
