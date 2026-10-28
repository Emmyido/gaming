import * as THREE from "three";
import { curveHeading, laneX, MEDIAN_HALF, LANE_WIDTH } from "../game/physics.js";
import { rng } from "../game/rng.js";
import { toWorld } from "./world.js";
import { vehicleMesh, VEHICLE_SIZE } from "./models.js";

const CAR_COLORS = ["#c9ced6", "#1d1f24", "#f4f4f4", "#8b0000", "#0b2545", "#6c757d", "#2d6a4f", "#b08968", "#e9c46a", "#3a0ca3"];

/** What drives on which roads. Weights per body type. */
function mixFor(region) {
  switch (region) {
    case "lagos": return { sedan: 30, suv: 14, danfo: 24, keke: 8, bus: 6, truck: 8, tanker: 4, okada: 6 };
    case "south": return { sedan: 32, suv: 16, danfo: 8, keke: 6, bus: 12, truck: 12, tanker: 6, okada: 8 };
    case "north": return { sedan: 26, suv: 14, pickup: 10, bus: 12, truck: 16, tanker: 6, okada: 16 };
    default: return { sedan: 32, suv: 16, pickup: 8, bus: 12, truck: 14, tanker: 6, okada: 12 };
  }
}

function weighted(r, mix) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  let roll = r.next() * total;
  for (const [k, w] of Object.entries(mix)) if ((roll -= w) <= 0) return k;
  return "sedan";
}

const CRUISE = { sedan: 29, suv: 30, pickup: 27, danfo: 25, keke: 13, bus: 27, truck: 19, tanker: 18, okada: 17 };

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.r = rng(99);
    this.region = "south";
    this.density = 0.6;
    this.slowZones = []; // [{ from, to, speed }] go-slows and checkpoints, in route z
  }

  setRegion(region, density) {
    this.region = region;
    this.density = density;
  }

  spawn(z, dir, lane, forcedBody) {
    const body = forcedBody ?? weighted(this.r, mixFor(this.region));
    const color = this.r.pick(CAR_COLORS);
    const mesh = vehicleMesh(body, body === "truck" ? this.r.pick(["#b23a48", "#1d4e89", "#f1faee"]) : color);
    const size = VEHICLE_SIZE[body];
    // Slow vehicles keep left (lane 1 is the slow lane); okadas and kekes hug the shoulder.
    const laneSel = lane ?? (body === "okada" || body === "keke" ? 1.25 : ["truck", "tanker", "bus"].includes(body) ? (this.r.chance(0.8) ? 1 : 0) : this.r.chance(0.5) ? 0 : 1);
    const car = {
      body, mesh, dir, z, lane: laneSel, x: laneX(laneSel) * dir, ...size,
      cruise: CRUISE[body] * this.r.range(0.85, 1.12), speed: CRUISE[body] * 0.8, laneTimer: this.r.range(3, 12),
      aggressive: body === "danfo" || (body === "okada" && this.r.chance(0.5)),
      horn: 0,
    };
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  clear() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = [];
  }

  /** Keep a population around the player: more in go-slows, fewer on empty northern roads. */
  maintain(playerZ, jam) {
    const ourTarget = Math.round(6 + this.density * 12 + (jam ? 14 : 0));
    const oncomingTarget = Math.round(4 + this.density * 8);
    const ours = this.cars.filter((c) => c.dir > 0);
    const theirs = this.cars.filter((c) => c.dir < 0);
    for (let i = ours.length; i < ourTarget; i++) {
      const ahead = this.r.chance(jam ? 0.85 : 0.75);
      const z = ahead ? playerZ + this.r.range(60, 520) : playerZ - this.r.range(45, 140);
      if (this.cars.some((c) => c.dir > 0 && Math.abs(c.z - z) < 14)) continue;
      this.spawn(z, 1);
    }
    for (let i = theirs.length; i < oncomingTarget; i++) this.spawn(playerZ + this.r.range(200, 700), -1, this.r.chance(0.5) ? 0 : 1);
  }

  slowLimit(z) {
    let limit = Infinity;
    for (const s of this.slowZones) if (z > s.from && z < s.to) limit = Math.min(limit, s.speed);
    return limit;
  }

  update(dt, playerZ, biome, player) {
    for (const c of this.cars) {
      if (c.dir > 0) {
        // car following: slow for whoever is ahead in the same lane (including the player)
        let gapSpeed = c.cruise;
        for (const o of [...this.cars, player]) {
          if (o === c || (o.dir ?? 1) < 0) continue;
          const dz = o.z - c.z;
          if (dz > 0 && dz < 45 && Math.abs(o.x - c.x) < 2.6) {
            const gap = dz - (o.length + c.length) / 2;
            gapSpeed = Math.min(gapSpeed, Math.max(0, (o.speed ?? 0) + (gap - 6) * 0.8));
          }
        }
        let target = Math.min(gapSpeed, this.slowLimit(c.z));
        // stop-and-go rhythm inside jams
        if (this.slowLimit(c.z) < 6) target *= 0.5 + 0.5 * Math.max(0, Math.sin(performance.now() / 1800 + c.z));
        c.speed += THREE.MathUtils.clamp(target - c.speed, -9 * dt, 3.5 * dt);
        c.z += c.speed * dt;
        // lane changes; danfos cut in without much warning
        c.laneTimer -= dt;
        if (c.laneTimer < 0 && c.body !== "okada" && c.body !== "keke") {
          c.laneTimer = this.r.range(c.aggressive ? 2 : 6, c.aggressive ? 6 : 16);
          if (gapSpeed < c.cruise * 0.8 || c.aggressive) {
            const nl = c.lane < 0.5 ? 1 : 0;
            const clear = !this.cars.some((o) => o !== c && o.dir > 0 && Math.abs(o.z - c.z) < (c.aggressive ? 9 : 16) && Math.abs(o.x - laneX(nl)) < 2);
            if (clear) c.lane = nl;
          }
        }
        c.x += THREE.MathUtils.clamp(laneX(c.lane) - c.x, -2.2 * dt, 2.2 * dt);
      } else {
        c.speed = c.cruise;
        c.z -= c.speed * dt;
        c.x = -(MEDIAN_HALF + LANE_WIDTH * (c.lane + 0.5));
      }
      toWorld(c.z, c.x, 0, biome, c.mesh.position);
      c.mesh.rotation.y = curveHeading(c.z, c.x) + (c.dir < 0 ? Math.PI : 0) + (c.dir > 0 ? (laneX(c.lane) - c.x) * -0.04 : 0);
    }
    // recycle far-away cars
    this.cars = this.cars.filter((c) => {
      const keep = c.z > playerZ - 180 && c.z < playerZ + 800;
      if (!keep) this.scene.remove(c.mesh);
      return keep;
    });
  }
}
