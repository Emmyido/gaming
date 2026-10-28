import * as THREE from "three";
import { curveHeading, laneX } from "../game/physics.js";
import { rng } from "../game/rng.js";
import { toWorld } from "./world.js";
import { animatePerson, cow, goat, person } from "./models.js";

const HAWKER_CALLS = {
  bread: ["Agege bread! Hot hot!", "Bread and butter!"],
  water: ["Pure water! Cold pure water!", "Buy water, oga!"],
  plantain: ["Plantain chips!", "Dodo Ikire!"],
  gala: ["Gala! Gala! Gala!", "Gala and La Casera!"],
  corn: ["Roasted corn! Ube dey!", "Fresh agbado!"],
};
const WALKER_LINES = ["Safe journey o!", "Oga, horn small!", "Wetin dey happen?", "No wahala", "Ehen!", "This road ehn…"];

export const SNACKS = {
  bread: { name: "Agege bread", price: 1_500, energy: 30 },
  water: { name: "Pure water", price: 200, energy: 15 },
  plantain: { name: "Plantain chips", price: 800, energy: 20 },
  gala: { name: "Gala", price: 300, energy: 18 },
  corn: { name: "Roasted corn", price: 700, energy: 22 },
};

/**
 * People and animals: roadside walkers, hawkers in go-slows, officers at checkpoints,
 * herders with cattle crossing the road. Each actor lives in road space and is animated.
 */
export class Actors {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.r = rng(4242);
    this.bubbles = []; // { actor, text, ttl }
  }

  add(kind, z, x, opts = {}) {
    const mesh = kind === "cow" ? cow() : kind === "goat" ? goat() : person(kind);
    const a = { kind, mesh, z, x, vz: opts.vz ?? 0, vx: opts.vx ?? 0, face: opts.face ?? 0, role: opts.role ?? "walker", ttlZ: opts.ttlZ ?? Infinity, data: opts.data ?? {} };
    this.scene.add(mesh);
    this.list.push(a);
    return a;
  }

  say(actor, text, ttl = 2.6) {
    this.bubbles = this.bubbles.filter((b) => b.actor !== actor);
    this.bubbles.push({ actor, text, ttl });
  }

  /** Sprinkle walkers on the footpaths ahead. */
  maintainWalkers(playerZ, busy) {
    const walkers = this.list.filter((a) => a.role === "walker");
    const target = busy ? 18 : 10;
    for (let i = walkers.length; i < target; i++) {
      const side = this.r.chance(0.75) ? 1 : -1;
      const z = playerZ + this.r.range(30, 380);
      const dir = this.r.chance(0.5) ? 1 : -1;
      const kind = this.r.chance(0.12) ? "hawker" : "civilian";
      this.add(kind, z, side * this.r.range(10.6, 13.5), { vz: dir * this.r.range(0.9, 1.5), face: dir > 0 ? 0 : Math.PI, role: "walker" });
    }
  }

  /** Hawkers weave between stopped cars in a go-slow, heading for the player's window. */
  spawnHawkers(z, n = 5) {
    for (let i = 0; i < n; i++) {
      const goods = this.r.pick(Object.keys(SNACKS));
      const a = this.add("hawker", z + this.r.range(-20, 120), this.r.pick([laneX(0) + 1.9, laneX(1) + 2.1, 0.9]), { role: "hawker", data: { goods } });
      // person() picked a random tray; align goods with what the tray shows
      if (a.mesh.userData.tray) a.data.goods = a.mesh.userData.tray;
    }
  }

  spawnCheckpointCrew(z, kind) {
    const crew = kind === "military" ? ["soldier", "soldier", "soldier"] : kind === "frsc" ? ["frsc", "frsc"] : kind === "vio" ? ["vio", "vio"] : ["police", "police", "police"];
    crew.forEach((k, i) => this.add(k, z + i * 3 - 3, 9.6 + (i % 2) * 1.2, { role: "officer", face: -Math.PI / 2, data: { kind } }));
    // one officer stands in the road waving traffic down
    this.add(crew[0], z + 6, laneX(1) + 1.2, { role: "officer", face: Math.PI, data: { kind, waver: true } });
  }

  /** Cattle or goats cross from one side of the road to the other. */
  spawnCrossing(z, kind) {
    const fromSide = this.r.chance(0.5) ? 1 : -1;
    const count = kind === "cattle" ? this.r.int(5, 8) : this.r.int(3, 5);
    const animal = kind === "cattle" ? "cow" : "goat";
    for (let i = 0; i < count; i++) {
      this.add(animal, z + this.r.range(-6, 6), fromSide * (14 + i * 2.2 + this.r.range(0, 2)), { vx: -fromSide * this.r.range(0.9, 1.3), face: -fromSide * Math.PI / 2, role: "crossing" });
    }
    if (kind === "cattle") this.add("herder", z, fromSide * (14 + count * 2.4), { vx: -fromSide * 1.05, face: -fromSide * Math.PI / 2, role: "crossing" });
  }

  spawnMechanicScene(z) {
    this.add("mechanic", z, 9.3, { role: "scene", face: Math.PI / 2 });
    this.add("civilian", z + 2.5, 10.8, { role: "scene", face: -Math.PI / 2 });
  }

  clear() {
    for (const a of this.list) this.scene.remove(a.mesh);
    this.list = [];
    this.bubbles = [];
  }

  update(dt, t, playerZ, playerX, biome) {
    for (const a of this.list) {
      if (a.role === "hawker") {
        // walk towards the player when close, otherwise idle between cars
        const dz = playerZ - a.z;
        if (Math.abs(dz) < 40) {
          a.vz = THREE.MathUtils.clamp(dz, -1.6, 1.6);
          a.x += THREE.MathUtils.clamp(playerX + 1.6 - a.x, -1.2 * dt, 1.2 * dt);
          if (Math.abs(dz) < 12 && this.r.chance(dt * 0.5)) this.say(a, this.r.pick(HAWKER_CALLS[a.data.goods] ?? ["Buy something!"]));
        } else a.vz *= 0.95;
        a.face = a.vz >= 0 ? 0 : Math.PI;
      } else if (a.role === "officer" && a.data.waver) {
        a.mesh.userData.arms[1].rotation.x = -1.4 + Math.sin(t * 4) * 0.6;
      } else if (a.role === "walker" && this.r.chance(dt * 0.03) && Math.abs(a.z - playerZ) < 25) {
        this.say(a, this.r.pick(WALKER_LINES));
      }
      a.z += a.vz * dt;
      a.x += a.vx * dt;
      toWorld(a.z, a.x, 0, biome, a.mesh.position);
      a.mesh.rotation.y = curveHeading(a.z) + a.face;
      if (a.mesh.userData.legs) animatePerson(a.mesh, t, Math.hypot(a.vz, a.vx));
      else if (a.vx || a.vz) a.mesh.position.y += Math.abs(Math.sin(t * 6 + a.z)) * 0.05; // animals bob
    }
    // crossing herds walk off the far side; everything is culled once well behind the player
    this.list = this.list.filter((a) => {
      const gone = a.z < playerZ - 60 || a.z > playerZ + 600 || Math.abs(a.x) > 40;
      if (gone) this.scene.remove(a.mesh);
      return !gone;
    });
    for (const b of this.bubbles) b.ttl -= dt;
    this.bubbles = this.bubbles.filter((b) => b.ttl > 0 && this.list.includes(b.actor));
  }

  nearest(role, z, x, maxDist) {
    let best = null, bd = maxDist;
    for (const a of this.list) {
      if (a.role !== role) continue;
      const d = Math.hypot(a.z - z, a.x - x);
      if (d < bd) (best = a), (bd = d);
    }
    return best;
  }
}
