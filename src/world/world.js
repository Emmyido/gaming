import * as THREE from "three";
import { curveHeading, curveX, hillY, LANE_WIDTH, MEDIAN_HALF, ROAD_EDGE, SHOULDER } from "../game/physics.js";
import { rng } from "../game/rng.js";
import * as M from "./models.js";

export const CHUNK = 60;
const AHEAD = 14;
const BEHIND = 2;
const ROAD_HALF_TOTAL = ROAD_EDGE + SHOULDER;

export const BIOMES = {
  south: { ground: ["#3f7d3a", "#4f8f45", "#5a9a4a"], dirt: "#9c6b3f", sky: ["#7ec8f0", "#d6efff"], fog: "#cfe6ef", fogDensity: 0.0022, rain: 0.35 },
  savanna: { ground: ["#8c9a4b", "#a1a556", "#b3ad62"], dirt: "#b07a45", sky: ["#86c5ea", "#e6f2f7"], fog: "#e3e8dc", fogDensity: 0.0018, rain: 0.12 },
  sahel: { ground: ["#c9a96e", "#d4b47a", "#bf9a5e"], dirt: "#c48a52", sky: ["#c9cdb8", "#efe2c4"], fog: "#e6d3a8", fogDensity: 0.0042, rain: 0 },
  plateau: { ground: ["#6f8f4e", "#7d9a58", "#8aa063"], dirt: "#a47148", sky: ["#8fc2e6", "#e3eef5"], fog: "#d9e4ea", fogDensity: 0.0026, rain: 0.15 },
};

/**
 * Map road space (z along the road, x across it, +x = driver's right) to world space.
 * The camera looks down +z, so world +X is screen-left; road-space x is mirrored so Nigeria's
 * right-hand traffic shows correctly (median and fast lane on the driver's left).
 */
export function toWorld(z, x, y = 0, biome = "south", out = new THREE.Vector3()) {
  return out.set(curveX(z) - x, hillY(z) + y, z);
}

function roadTexture() {
  return M.canvasTexture("road", 1024, 512, (ctx, w, h) => {
    const px = (x) => ((x + ROAD_HALF_TOTAL) / (ROAD_HALF_TOTAL * 2)) * w;
    ctx.fillStyle = "#4a4643";
    ctx.fillRect(0, 0, w, h);
    // asphalt grain and patches
    for (let i = 0; i < 9000; i++) {
      const g = 55 + Math.random() * 35;
      ctx.fillStyle = `rgb(${g},${g - 2},${g - 4})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = "rgba(30,28,26,0.35)";
      ctx.fillRect(px(-7) + Math.random() * px(7), Math.random() * h, 40 + Math.random() * 80, 20 + Math.random() * 60);
    }
    // laterite shoulders
    ctx.fillStyle = "#8f6a47";
    ctx.fillRect(0, 0, px(-ROAD_EDGE), h);
    ctx.fillRect(px(ROAD_EDGE), 0, w - px(ROAD_EDGE), h);
    // median kerb + grass
    ctx.fillStyle = "#d9d4c7";
    ctx.fillRect(px(-MEDIAN_HALF), 0, px(MEDIAN_HALF) - px(-MEDIAN_HALF), h);
    ctx.fillStyle = "#5c8a3e";
    ctx.fillRect(px(-MEDIAN_HALF + 0.15), 0, px(MEDIAN_HALF - 0.15) - px(-MEDIAN_HALF + 0.15), h);
    // edge lines (a bit faded, as on real roads)
    ctx.fillStyle = "rgba(240,240,230,0.85)";
    for (const x of [-ROAD_EDGE + 0.2, ROAD_EDGE - 0.35]) ctx.fillRect(px(x), 0, 7, h);
    ctx.fillStyle = "rgba(240,200,40,0.85)";
    for (const x of [-MEDIAN_HALF - 0.3, MEDIAN_HALF + 0.15]) ctx.fillRect(px(x), 0, 6, h);
    // lane dashes: 3 m dash, 9 m gap over a 12 m tile
    ctx.fillStyle = "rgba(240,240,230,0.9)";
    for (const x of [-(MEDIAN_HALF + LANE_WIDTH), MEDIAN_HALF + LANE_WIDTH]) ctx.fillRect(px(x) - 3, 0, 6, h * 0.25);
  });
}

function skyDome() {
  const geo = new THREE.SphereGeometry(1800, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color("#6cb7e8") }, bottom: { value: new THREE.Color("#dceefa") } },
    vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, clamp(h*1.6,0.0,1.0)), 1.0); }",
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * Streams road, terrain and roadside scenery in chunks around the player, recycling what falls
 * behind. Biome comes from the leg the chunk belongs to (see setBiomeResolver).
 */
export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.chunks = new Map();
    this.biomeAt = () => "south";
    this.roadMat = new THREE.MeshLambertMaterial({ map: roadTexture() });
    this.roadMat.map.wrapT = THREE.RepeatWrapping;
    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.dynamic = new THREE.Group(); // event props placed by the game (checkpoints, gates...)
    scene.add(this.dynamic);

    this.sky = skyDome();
    scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight("#dff1ff", "#5c4a32", 1.1);
    this.sun = new THREE.DirectionalLight("#fff4dc", 1.9);
    this.sun.castShadow = quality === "high";
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -40;
      c.right = c.top = 40;
      c.far = 220;
    }
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.FogExp2("#cfe6ef", 0.0022);
    this.clouds = this.makeClouds();
    scene.add(this.clouds);
    this.rain = this.makeRain();
    scene.add(this.rain);
    this.raining = false;
    this.timeOfDay = 8; // hours
  }

  setBiomeResolver(fn) {
    this.biomeAt = fn;
  }

  makeClouds() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, fog: false });
    const r = rng(7);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r.range(18, 34), 0), mat);
        s.position.set(j * 22 - 33, r.range(-4, 4), r.range(-8, 8));
        s.scale.y = 0.45;
        c.add(s);
      }
      c.position.set(r.range(-700, 700), r.range(160, 260), r.range(-200, 900));
      g.add(c);
    }
    return g;
  }

  makeRain() {
    const n = 2200;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 80 - 40, y = Math.random() * 40, z = Math.random() * 80 - 30;
      pos.set([x, y, z, x + 0.05, y - 0.9, z - 0.3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#c9d6e3", transparent: true, opacity: 0.55 }));
    lines.visible = false;
    lines.frustumCulled = false;
    return lines;
  }

  buildChunk(index) {
    const z0 = index * CHUNK;
    const biome = this.biomeAt(z0);
    const B = BIOMES[biome];
    const group = new THREE.Group();
    const step = this.quality === "low" ? 6 : 4;
    const rows = CHUNK / step + 1;

    // road strip following curve and hills
    {
      const cols = 2;
      const pos = [], uv = [], idx = [];
      for (let r = 0; r < rows; r++) {
        const z = z0 + r * step;
        for (let c = 0; c <= cols; c++) {
          const x = -ROAD_HALF_TOTAL + (c / cols) * ROAD_HALF_TOTAL * 2;
          pos.push(curveX(z) - x, hillY(z) + 0.02, z);
          uv.push(c / cols, z / 12);
        }
      }
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b = a + cols + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const road = new THREE.Mesh(geo, this.roadMat);
      road.receiveShadow = true;
      group.add(road);
    }

    // terrain either side, sloping into drains then rolling land
    {
      const xs = [-220, -120, -60, -30, -18, -13, -ROAD_HALF_TOTAL, ROAD_HALF_TOTAL, 13, 18, 30, 60, 120, 220];
      const pos = [], col = [], idx = [];
      const r = rng(index * 31 + 5);
      const c = new THREE.Color();
      for (let row = 0; row < rows; row++) {
        const z = z0 + row * step;
        for (const x of xs) {
          const ax = Math.abs(x);
          let y = hillY(z);
          if (ax > ROAD_HALF_TOTAL + 0.1 && ax < 13.5) y -= 0.6; // drainage ditch
          if (ax > 25) y += (Math.sin(z / 47 + x / 31) + Math.sin(x / 13 + z / 91)) * (biome === "plateau" ? 3 + ax / 25 : 1.2 + ax / 90);
          pos.push(curveX(z) - x, y - 0.05, z);
          c.set(ax < 14 ? B.dirt : B.ground[Math.floor(r.next() * 3)]);
          col.push(c.r, c.g, c.b);
        }
      }
      const cols = xs.length;
      for (let row = 0; row < rows - 1; row++) for (let k = 0; k < cols - 1; k++) {
        if (k === 6) continue; // road gap
        const a = row * cols + k, b = a + cols;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const ground = new THREE.Mesh(geo, this.groundMat);
      ground.receiveShadow = true;
      group.add(ground);
    }

    this.decorate(group, index, z0, biome);
    this.scene.add(group);
    return group;
  }

  /** Roadside life: trees, houses, kiosks, poles. Density from quality setting. */
  decorate(group, index, z0, biome) {
    const r = rng(index * 977 + 13);
    const density = this.quality === "low" ? 0.5 : this.quality === "high" ? 1.3 : 0.9;
    const put = (mesh, z, x, rotY = 0) => {
      toWorld(z, x, 0, biome, mesh.position);
      mesh.rotation.y = rotY + curveHeading(z);
      group.add(mesh);
    };
    const side = () => (r.chance(0.5) ? -1 : 1);

    // power line along the right side
    if (index % 1 === 0 && biome !== "sahel") put(M.pole(), z0 + 10, 15.5);

    const n = Math.round(r.range(6, 12) * density);
    for (let i = 0; i < n; i++) {
      const z = z0 + r.range(0, CHUNK);
      const s = side();
      const x = s * r.range(16, 70);
      const roll = r.next();
      if (biome === "south") {
        if (roll < 0.45) put(M.palm(r.range(6, 10) | 0), z, x, r.range(0, 6));
        else if (roll < 0.8) put(M.tree("round", +r.range(0.8, 1.5).toFixed(1)), z, x);
        else put(M.shrub("#2d6a4f"), z, x);
      } else if (biome === "savanna") {
        if (roll < 0.35) put(M.tree("acacia", +r.range(0.8, 1.4).toFixed(1)), z, x);
        else if (roll < 0.55) put(M.tree("round", +r.range(0.7, 1.2).toFixed(1)), z, x);
        else if (roll < 0.65) put(M.palm(7), z, x);
        else put(M.shrub("#6a7b2f"), z, x);
      } else if (biome === "sahel") {
        if (roll < 0.25) put(M.tree("baobab", +r.range(0.8, 1.3).toFixed(1)), z, x);
        else if (roll < 0.55) put(M.tree("acacia", +r.range(0.6, 1.0).toFixed(1)), z, x);
        else put(M.shrub("#8a8f4a"), z, x);
      } else {
        if (roll < 0.4) put(M.rock(+r.range(0.8, 2.6).toFixed(1)), z, x);
        else if (roll < 0.75) put(M.tree("round", +r.range(0.7, 1.1).toFixed(1)), z, x);
        else put(M.shrub("#4f772d"), z, x);
      }
    }

    // settlements: houses and roadside kiosks come in clusters
    if (r.chance(0.35 * density)) {
      const s = side();
      const houses = r.int(1, 3);
      for (let i = 0; i < houses; i++) {
        const z = z0 + r.range(5, CHUNK - 5);
        const mesh = biome === "sahel" || (biome === "savanna" && r.chance(0.4))
          ? M.mudHouse()
          : M.house(r.pick(["#e9d8a6", "#f1faee", "#ffd6a5", "#caffbf", "#bde0fe"]), r.pick(["#8d99ae", "#6c757d", "#a44a3f"]));
        put(mesh, z, s * r.range(19, 30), s > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      if (r.chance(0.7)) put(M.kiosk(r.pick(["#e63946", "#1faa59", "#ffb703", "#3a86ff"])), z0 + r.range(5, CHUNK - 5), s * 12.5, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }

  update(playerZ, dt, camera) {
    const cur = Math.floor(playerZ / CHUNK);
    for (let i = cur - BEHIND; i <= cur + AHEAD; i++) {
      if (i < 0 || this.chunks.has(i)) continue;
      this.chunks.set(i, this.buildChunk(i));
    }
    for (const [i, g] of this.chunks) {
      if (i < cur - BEHIND - 1 || i > cur + AHEAD + 1) {
        this.scene.remove(g);
        g.traverse((o) => o.isMesh && !this.isShared(o) && o.geometry.dispose());
        this.chunks.delete(i);
      }
    }
    // keep sky, clouds, rain and sun centred on the camera
    this.sky.position.copy(camera.position);
    this.clouds.position.x = camera.position.x * 0.6;
    this.clouds.position.z = camera.position.z * 0.9;
    for (const c of this.clouds.children) {
      c.position.x += dt * 4;
      if (c.position.x > 800) c.position.x = -800;
    }
    if (this.rain.visible) {
      this.rain.position.set(camera.position.x, camera.position.y - 12, camera.position.z);
      const p = this.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 32;
        if (y < 0) y += 40;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    this.sun.target.position.set(camera.position.x, 0, camera.position.z + 10);
  }

  /** Road and ground strips are per-chunk; model geometries are cached and shared. */
  isShared(mesh) {
    return mesh.material !== this.roadMat && mesh.material !== this.groundMat;
  }

  /** Lighting, sky and fog for the time of day and biome. Returns 0 (night)..1 (day). */
  applyAtmosphere(biome, hours, camera) {
    const B = BIOMES[biome];
    const dayAngle = ((hours - 6) / 12) * Math.PI; // 6am sunrise, 6pm sunset
    const sunUp = Math.sin(dayAngle);
    const light = THREE.MathUtils.clamp(sunUp * 1.4 + 0.15, 0.08, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(sunUp) * 3, 0, 1) * THREE.MathUtils.clamp(light * 3.5, 0, 1);
    const night = new THREE.Color("#0b1530");
    const duskCol = new THREE.Color("#f6a46b");
    const top = new THREE.Color(B.sky[0]).lerp(night, 1 - light).lerp(duskCol, dusk * 0.2);
    const bottom = new THREE.Color(B.sky[1]).lerp(night, 1 - light).lerp(duskCol, dusk * 0.4);
    if (this.raining) {
      top.lerp(new THREE.Color("#6c757d"), 0.6);
      bottom.lerp(new THREE.Color("#adb5bd"), 0.6);
    }
    this.sky.material.uniforms.top.value.copy(top);
    this.sky.material.uniforms.bottom.value.copy(bottom);
    this.scene.fog.color.copy(bottom);
    this.scene.fog.density = B.fogDensity * (this.raining ? 1.8 : 1) * (light < 0.3 ? 1.3 : 1);
    this.hemi.intensity = 0.12 + light * 1.05;
    this.sun.intensity = Math.max(0, sunUp) * (this.raining ? 0.6 : 1.9);
    this.sun.color.set(dusk > 0.3 ? "#ffb070" : "#fff4dc");
    this.sun.position.set(camera.position.x + Math.cos(dayAngle) * 120, Math.max(10, sunUp * 160), camera.position.z + 60);
    this.clouds.visible = light > 0.2;
    for (const c of this.clouds.children) for (const m of c.children) m.material.color.setScalar(0.55 + light * 0.45);
    return light;
  }

  setRain(on) {
    this.raining = on;
    this.rain.visible = on;
  }

  clearDynamic() {
    this.dynamic.clear();
  }

  reset() {
    for (const g of this.chunks.values()) this.scene.remove(g);
    this.chunks.clear();
    this.clearDynamic();
  }
}
