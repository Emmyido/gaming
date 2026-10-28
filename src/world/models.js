import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Procedural low-poly models. Static models are built from coloured parts merged into one
 * geometry (one draw call each, shared via a cache). Animated things (people, the player's car)
 * stay as groups so limbs and wheels can move.
 */

export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });

const cache = new Map();
const tmpColor = new THREE.Color();

function part(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  tmpColor.set(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  // Slight per-vertex shade variation gives low-poly surfaces some life.
  for (let i = 0; i < n; i++) {
    const v = 0.94 + ((i * 7919) % 13) / 100;
    colors[i * 3] = tmpColor.r * v;
    colors[i * 3 + 1] = tmpColor.g * v;
    colors[i * 3 + 2] = tmpColor.b * v;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute("uv");
  return g;
}

function merged(key, build) {
  if (!cache.has(key)) cache.set(key, mergeGeometries(build()));
  return cache.get(key);
}

export function staticMesh(key, build, material = MAT) {
  const mesh = new THREE.Mesh(merged(key, build), material);
  mesh.matrixAutoUpdate = true;
  return mesh;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);

// ---------------------------------------------------------------- vehicles

const GLASS = "#1b2733";
const TYRE = "#151515";
const RIM = "#9aa0a6";

function addWheels(parts, { wb, track, r = 0.36, w = 0.26 }) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(part(cyl(r, r, w, 10), TYRE, { x: sx * track, y: r, z: sz * wb, rz: Math.PI / 2 }));
    parts.push(part(cyl(r * 0.55, r * 0.55, w + 0.02, 8), RIM, { x: sx * track, y: r, z: sz * wb, rz: Math.PI / 2 }));
  }
}

/** Lamps go in a separate list rendered unlit, so traffic glows at night. */
function lights(parts, { front, rear, y, x }) {
  parts.glow ??= [];
  for (const s of [-1, 1]) {
    parts.glow.push(part(box(0.34, 0.14, 0.06), "#fff3c4", { x: s * x, y, z: front }));
    parts.glow.push(part(box(0.3, 0.14, 0.06), "#ff1a1a", { x: s * x, y, z: rear }));
  }
}

/** Car body by type. Vehicles face +z. */
export function vehicleParts(body, color, opts = {}) {
  const p = [];
  const wheels = opts.wheels === false ? () => {} : addWheels;
  switch (body) {
    case "sedan":
      p.push(part(box(1.8, 0.62, 4.5), color, { y: 0.62 }));
      p.push(part(box(1.62, 0.55, 2.3), color, { y: 1.18, z: -0.25 }));
      p.push(part(box(1.64, 0.42, 2.0), GLASS, { y: 1.2, z: -0.25, sx: 1.005 }));
      p.push(part(box(1.5, 0.08, 4.0), "#1a1a1a", { y: 0.33 }));
      p.push(part(box(1.4, 0.18, 0.05), "#2b2b2b", { y: 0.62, z: 2.26 })); // grille
      wheels(p, { wb: 1.4, track: 0.82 });
      lights(p, { front: 2.26, rear: -2.26, y: 0.75, x: 0.62 });
      break;
    case "suv":
      p.push(part(box(1.95, 0.85, 4.8), color, { y: 0.78 }));
      p.push(part(box(1.85, 0.7, 3.1), color, { y: 1.52, z: -0.35 }));
      p.push(part(box(1.87, 0.5, 2.9), GLASS, { y: 1.55, z: -0.35 }));
      p.push(part(box(1.5, 0.08, 2.4), "#2a2a2a", { y: 1.92, z: -0.4 })); // roof rails
      p.push(part(box(1.5, 0.25, 0.05), "#222", { y: 0.85, z: 2.41 }));
      wheels(p, { wb: 1.5, track: 0.88, r: 0.42 });
      lights(p, { front: 2.41, rear: -2.41, y: 0.98, x: 0.68 });
      break;
    case "pickup":
      p.push(part(box(1.9, 0.8, 5.2), color, { y: 0.8 }));
      p.push(part(box(1.82, 0.72, 1.9), color, { y: 1.55, z: 0.75 }));
      p.push(part(box(1.84, 0.5, 1.7), GLASS, { y: 1.58, z: 0.75 }));
      p.push(part(box(1.7, 0.3, 2.3), "#3a3a3a", { y: 1.06, z: -1.3 })); // bed
      wheels(p, { wb: 1.7, track: 0.86, r: 0.42 });
      lights(p, { front: 2.61, rear: -2.61, y: 0.95, x: 0.7 });
      break;
    case "danfo": {
      // Lagos yellow minibus with black stripes and a loaded roof rack
      p.push(part(box(2.0, 1.75, 4.9), "#f6c300", { y: 1.25 }));
      p.push(part(box(2.02, 0.12, 4.92), "#111", { y: 0.95 }));
      p.push(part(box(2.02, 0.12, 4.92), "#111", { y: 1.4 }));
      p.push(part(box(2.03, 0.55, 3.6), GLASS, { y: 1.75, z: -0.4 }));
      p.push(part(box(1.8, 0.6, 0.06), GLASS, { y: 1.65, z: 2.46 }));
      p.push(part(box(1.6, 0.1, 3.2), "#444", { y: 2.2 }));
      p.push(part(box(1.1, 0.45, 1.2), "#7a4b2a", { y: 2.48, z: 0.4 }));
      p.push(part(box(0.8, 0.35, 0.9), "#2f5d8a", { y: 2.42, z: -0.9 }));
      wheels(p, { wb: 1.65, track: 0.9, r: 0.38 });
      lights(p, { front: 2.46, rear: -2.46, y: 0.8, x: 0.75 });
      break;
    }
    case "bus": {
      // Intercity luxury bus (white with green livery)
      p.push(part(box(2.5, 2.6, 11), "#f3f5f4", { y: 1.75 }));
      p.push(part(box(2.52, 0.4, 11.02), "#138a43", { y: 1.0 }));
      p.push(part(box(2.53, 0.9, 9.6), GLASS, { y: 2.35, z: -0.4 }));
      p.push(part(box(2.3, 1.2, 0.06), GLASS, { y: 2.3, z: 5.51 }));
      wheels(p, { wb: 3.6, track: 1.1, r: 0.5, w: 0.34 });
      lights(p, { front: 5.51, rear: -5.51, y: 0.9, x: 0.95 });
      break;
    }
    case "truck":
    case "tanker": {
      p.push(part(box(2.5, 2.4, 2.4), color, { y: 1.75, z: 5.4 }));
      p.push(part(box(2.52, 0.9, 0.06), GLASS, { y: 2.35, z: 6.61 }));
      p.push(part(box(2.2, 0.4, 12), "#333", { y: 0.75 }));
      if (body === "tanker") {
        p.push(part(cyl(1.25, 1.25, 9.5, 14), "#d9d9d9", { y: 2.05, z: -1.2, rx: Math.PI / 2 }));
        p.push(part(cyl(1.27, 1.27, 0.4, 14), "#e85d04", { y: 2.05, z: -1.2, rx: Math.PI / 2 }));
      } else {
        p.push(part(box(2.5, 2.7, 9.6), color === "#b23a48" ? "#1d4e89" : "#b23a48", { y: 2.25, z: -1.3 }));
        p.push(part(box(2.52, 0.12, 9.62), "#ffffff", { y: 3.0, z: -1.3 }));
      }
      for (const z of [5.4, -3.5, -5.2]) for (const s of [-1, 1]) {
        p.push(part(cyl(0.52, 0.52, 0.4, 10), TYRE, { x: s * 1.05, y: 0.52, z, rz: Math.PI / 2 }));
      }
      lights(p, { front: 6.61, rear: -6.1, y: 1.0, x: 0.95 });
      break;
    }
    case "keke": {
      p.push(part(box(1.3, 0.9, 2.4), "#f6c300", { y: 0.75 }));
      p.push(part(box(1.35, 0.08, 2.3), "#1a7a3a", { y: 1.85 }));
      for (const s of [-1, 1]) p.push(part(box(0.06, 0.95, 0.06), "#333", { x: s * 0.62, y: 1.35, z: 1.05 }));
      p.push(part(cyl(0.28, 0.28, 0.18, 10), TYRE, { y: 0.28, z: 1.0, rz: Math.PI / 2 }));
      for (const s of [-1, 1]) p.push(part(cyl(0.28, 0.28, 0.18, 10), TYRE, { x: s * 0.6, y: 0.28, z: -0.8, rz: Math.PI / 2 }));
      break;
    }
    case "okada": {
      p.push(part(box(0.32, 0.4, 1.6), color, { y: 0.65 }));
      p.push(part(cyl(0.32, 0.32, 0.12, 10), TYRE, { y: 0.32, z: 0.7, rz: Math.PI / 2 }));
      p.push(part(cyl(0.32, 0.32, 0.12, 10), TYRE, { y: 0.32, z: -0.7, rz: Math.PI / 2 }));
      p.push(part(box(0.7, 0.05, 0.05), "#222", { y: 1.05, z: 0.55 }));
      // rider + passenger
      for (const [z, shirt] of [[0.15, "#2d6a4f"], [-0.45, "#c1121f"]]) {
        p.push(part(box(0.42, 0.6, 0.28), shirt, { y: 1.25, z }));
        p.push(part(sph(0.15), "#4a2c1d", { y: 1.7, z }));
        for (const s of [-1, 1]) p.push(part(box(0.13, 0.5, 0.13), "#1f2a44", { x: s * 0.18, y: 0.85, z: z + 0.1, rx: -0.9 }));
      }
      p.push(part(sph(0.18), "#ffd60a", { y: 1.75, z: 0.15, sy: 0.85 })); // helmet
      break;
    }
    default:
      return vehicleParts("sedan", color, opts);
  }
  return p;
}

export function vehicleMesh(body, color) {
  const key = `veh-${body}-${color}`;
  if (!cache.has(key)) {
    const parts = vehicleParts(body, color);
    cache.set(key, { body: mergeGeometries(parts), glow: parts.glow ? mergeGeometries(parts.glow) : null });
  }
  const { body: geo, glow } = cache.get(key);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, MAT));
  if (glow) g.add(new THREE.Mesh(glow, GLOW));
  return g;
}

export const VEHICLE_SIZE = {
  sedan: { length: 4.5, width: 1.8 },
  suv: { length: 4.8, width: 1.95 },
  pickup: { length: 5.2, width: 1.9 },
  danfo: { length: 4.9, width: 2.0 },
  bus: { length: 11, width: 2.5 },
  truck: { length: 13.2, width: 2.5 },
  tanker: { length: 13.2, width: 2.5 },
  keke: { length: 2.4, width: 1.35 },
  okada: { length: 1.8, width: 0.8 },
};

/** The player's car: a group so the wheels can spin and the body can roll and pitch. */
export function playerCar(body, color) {
  const group = new THREE.Group();
  const bodyParts = vehicleParts(body, color, { wheels: false });
  const shell = new THREE.Group();
  const shellBody = new THREE.Mesh(mergeGeometries(bodyParts), MAT);
  shellBody.castShadow = true;
  shell.add(shellBody);
  if (bodyParts.glow) shell.add(new THREE.Mesh(mergeGeometries(bodyParts.glow), GLOW));
  group.add(shell);
  const wheelGeo = mergeGeometries([part(cyl(0.38, 0.38, 0.27, 12), TYRE, { rz: Math.PI / 2 }), part(box(0.29, 0.5, 0.12), RIM, {})]);
  const size = VEHICLE_SIZE[body] ?? VEHICLE_SIZE.sedan;
  const wb = body === "pickup" ? 1.7 : body === "suv" ? 1.5 : 1.4;
  const track = body === "sedan" ? 0.82 : 0.88;
  const r = body === "sedan" ? 0.36 : 0.42;
  const wheelsArr = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(wheelGeo, MAT);
    w.position.set(sx * track, r, sz * wb);
    group.add(w);
    wheelsArr.push(w);
  }
  // Headlight beams for night driving
  const head = new THREE.SpotLight("#fff3c4", 0, 70, 0.5, 0.6, 1.2);
  head.position.set(0, 1, size.length / 2);
  head.target.position.set(0, 0, size.length / 2 + 25);
  group.add(head, head.target);
  group.userData = { wheels: wheelsArr, shell, head, size };
  return group;
}

// ---------------------------------------------------------------- people & animals

const SKINS = ["#3b2219", "#4a2c1d", "#5c3a24", "#6b4226", "#7b4a2e", "#8d5a3b"];
const ANKARA = ["#e63946", "#f4a261", "#2a9d8f", "#e9c46a", "#264653", "#9b5de5", "#00bbf9", "#f15bb5", "#fee440", "#06d6a0"];

export const OUTFITS = {
  civilian: () => ({ shirt: pick(ANKARA), pants: pick(["#1f2a44", "#3d405b", "#6b705c", "#22223b", "#e9edc9"]) }),
  police: () => ({ shirt: "#0b1d3a", pants: "#0b1d3a", hat: "#0b1d3a", badge: "#c9a227" }),
  soldier: () => ({ shirt: "#4b5320", pants: "#3b4220", hat: "#3f4a1f", vest: "#5a6b2f", rifle: true }),
  frsc: () => ({ shirt: "#f2f2f2", pants: "#0a3d62", vest: "#ffd60a", hat: "#0a3d62" }),
  vio: () => ({ shirt: "#c2b280", pants: "#6b5b3e", hat: "#6b5b3e", vest: "#9d0208" }),
  hawker: () => ({ shirt: pick(ANKARA), pants: pick(ANKARA), tray: pick(["bread", "water", "plantain", "gala", "corn"]) }),
  herder: () => ({ shirt: "#e9e3d5", pants: "#e9e3d5", hat: "#c8a96e", stick: true }),
  mechanic: () => ({ shirt: "#1d3557", pants: "#1d3557", hat: null }),
};

let pickSeed = 1;
function pick(arr) {
  pickSeed = (pickSeed * 16807) % 2147483647;
  return arr[pickSeed % arr.length];
}

const TRAY_GOODS = {
  bread: ["#d4a373", "#bc8a5f"],
  water: ["#caf0f8", "#90e0ef"],
  plantain: ["#ffd166", "#e9c46a"],
  gala: ["#e63946", "#ffd60a"],
  corn: ["#f4d35e", "#6a994e"],
};

/** A person with swinging arms and legs. kind is a key of OUTFITS. */
export function person(kind = "civilian") {
  const o = OUTFITS[kind]();
  const skin = pick(SKINS);
  const g = new THREE.Group();
  const mesh = (geo, color, x, y, z) => {
    const m = new THREE.Mesh(merged(`p-${geo}-${color}`, () => [part(geoFor(geo), color)]), MAT);
    m.position.set(x, y, z);
    return m;
  };
  const legs = [];
  const arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.12, 0.85, 0);
    const leg = mesh("leg", o.pants, 0, -0.42, 0);
    hip.add(leg);
    g.add(hip);
    legs.push(hip);
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.29, 1.45, 0);
    shoulder.add(mesh("arm", o.shirt, 0, -0.3, 0));
    shoulder.add(mesh("hand", skin, 0, -0.62, 0));
    g.add(shoulder);
    arms.push(shoulder);
  }
  g.add(mesh("torso", o.shirt, 0, 1.18, 0));
  if (o.vest) g.add(mesh("vest", o.vest, 0, 1.2, 0));
  g.add(mesh("head", skin, 0, 1.72, 0));
  if (o.hat) g.add(mesh("cap", o.hat, 0, 1.88, 0.02));
  if (o.badge) g.add(mesh("badge", o.badge, 0.1, 1.35, 0.15));
  if (o.rifle) {
    const r = mesh("rifle", "#1b1b1b", 0.18, 1.15, 0.2);
    r.rotation.z = 0.5;
    g.add(r);
  }
  if (o.stick) {
    const st = mesh("stick", "#7f5539", 0.38, 1.0, 0.1);
    g.add(st);
  }
  if (o.tray) {
    // Tray balanced on the head, piled with goods; one arm raised to hold it.
    const [a, b] = TRAY_GOODS[o.tray];
    const tray = new THREE.Group();
    tray.position.y = 1.92;
    tray.add(mesh("tray", "#a0a0a0", 0, 0, 0));
    for (let i = 0; i < 5; i++) tray.add(mesh("good", i % 2 ? a : b, (i - 2) * 0.13, 0.1 + (i % 2) * 0.06, ((i * 3) % 5 - 2) * 0.06));
    g.add(tray);
    arms[1].rotation.z = Math.PI - 0.3;
    g.userData.tray = o.tray;
  }
  g.userData = { ...g.userData, legs, arms, kind, phase: Math.random() * 6, holdArm: !!o.tray };
  return g;
}

function geoFor(name) {
  switch (name) {
    case "leg": return box(0.17, 0.84, 0.2);
    case "arm": return box(0.13, 0.6, 0.15);
    case "hand": return sph(0.07, 0);
    case "torso": return box(0.5, 0.68, 0.3);
    case "vest": return box(0.53, 0.5, 0.33);
    case "head": return sph(0.17, 1);
    case "cap": return cyl(0.19, 0.19, 0.1, 10);
    case "badge": return box(0.08, 0.08, 0.02);
    case "rifle": return box(0.07, 0.8, 0.08);
    case "stick": return box(0.05, 1.7, 0.05);
    case "tray": return cyl(0.38, 0.32, 0.06, 12);
    case "good": return box(0.12, 0.1, 0.12);
    default: return box(0.2, 0.2, 0.2);
  }
}

/** Animate a person's walk cycle. speed in m/s (0 = standing, idle sway). */
export function animatePerson(p, t, speed) {
  const { legs, arms, phase, holdArm } = p.userData;
  const k = speed > 0.1 ? Math.min(1, speed / 1.4) : 0;
  const swing = Math.sin(t * 7 * Math.max(0.6, speed) + phase) * 0.6 * k;
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
  arms[0].rotation.x = -swing * 0.8;
  if (!holdArm) arms[1].rotation.x = swing * 0.8;
  if (k === 0) arms[0].rotation.x = Math.sin(t * 1.5 + phase) * 0.08;
}

export function goat() {
  const color = pick(["#f1f1f1", "#7f5539", "#3a2618", "#ddb892"]);
  return staticMesh(`goat-${color}`, () => [
    part(box(0.35, 0.35, 0.8), color, { y: 0.55 }),
    part(box(0.2, 0.25, 0.3), color, { y: 0.8, z: 0.45 }),
    part(cone(0.03, 0.18, 4), "#cfc6b8", { x: 0.06, y: 1.0, z: 0.4, rx: -0.4 }),
    part(cone(0.03, 0.18, 4), "#cfc6b8", { x: -0.06, y: 1.0, z: 0.4, rx: -0.4 }),
    ...[[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]].map(([x, z]) => part(box(0.07, 0.4, 0.07), color, { x, y: 0.2, z })),
  ]);
}

export function cow() {
  const color = pick(["#f5f3ee", "#e8dcc8", "#8c5a3c", "#d9c3a5"]);
  return staticMesh(`cow-${color}`, () => [
    part(box(0.7, 0.75, 1.8), color, { y: 1.15 }),
    part(box(0.45, 0.3, 0.5), color, { y: 1.62, z: 0.45 }), // zebu hump
    part(box(0.36, 0.38, 0.55), color, { y: 1.35, z: 1.1 }),
    part(cone(0.05, 0.75, 5), "#e9e1d0", { x: 0.3, y: 1.7, z: 1.05, rz: -1.0 }),
    part(cone(0.05, 0.75, 5), "#e9e1d0", { x: -0.3, y: 1.7, z: 1.05, rz: 1.0 }),
    ...[[-0.25, 0.65], [0.25, 0.65], [-0.25, -0.65], [0.25, -0.65]].map(([x, z]) => part(box(0.14, 0.8, 0.14), color, { x, y: 0.4, z })),
  ]);
}

// ---------------------------------------------------------------- scenery

export function palm(h = 7) {
  return staticMesh(`palm-${h}`, () => {
    const p = [part(cyl(0.16, 0.26, h, 6), "#7a5c3b", { y: h / 2, rz: 0.06 })];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.push(part(box(0.5, 0.06, 3.0), i % 2 ? "#2d6a4f" : "#40916c", { x: Math.sin(a) * 1.2 + 0.4, y: h - 0.2, z: Math.cos(a) * 1.2, ry: a, rx: 0.45 }));
    }
    return p;
  });
}

export function tree(kind = "round", s = 1) {
  return staticMesh(`tree-${kind}-${s}`, () => {
    if (kind === "baobab") {
      return [
        part(cyl(0.9 * s, 1.3 * s, 4 * s, 7), "#8d7b68", { y: 2 * s }),
        part(sph(2.2 * s, 0), "#6b8f3c", { y: 5 * s, sy: 0.55 }),
        part(sph(1.4 * s, 0), "#7aa046", { x: 1.4 * s, y: 4.6 * s, sy: 0.5 }),
      ];
    }
    if (kind === "acacia") {
      return [part(cyl(0.12 * s, 0.2 * s, 3 * s, 5), "#6f4e37", { y: 1.5 * s, rz: 0.15 }), part(cyl(2.4 * s, 1.6 * s, 0.6 * s, 8), "#8aa64a", { y: 3.2 * s })];
    }
    const greens = ["#2d6a4f", "#40916c", "#52b788"];
    return [
      part(cyl(0.2 * s, 0.3 * s, 2.6 * s, 6), "#6b4f3a", { y: 1.3 * s }),
      part(sph(1.6 * s, 0), greens[Math.round(s * 10) % 3], { y: 3.4 * s }),
      part(sph(1.1 * s, 0), greens[(Math.round(s * 10) + 1) % 3], { x: 0.8 * s, y: 3.0 * s }),
    ];
  });
}

export function shrub(color = "#4f772d") {
  return staticMesh(`shrub-${color}`, () => [part(sph(0.8, 0), color, { y: 0.5, sy: 0.7 }), part(sph(0.55, 0), color, { x: 0.6, y: 0.4, sy: 0.7 })]);
}

export function rock(s = 1) {
  return staticMesh(`rock-${s}`, () => [part(new THREE.DodecahedronGeometry(1.5 * s, 0), "#8d8173", { y: 0.9 * s, sy: 0.75 }), part(new THREE.DodecahedronGeometry(0.9 * s, 0), "#a39887", { x: 1.4 * s, y: 0.5 * s })]);
}

export function house(wall = "#e9d8a6", roof = "#8d99ae") {
  return staticMesh(`house-${wall}-${roof}`, () => [
    part(box(6, 3, 5), wall, { y: 1.5 }),
    part(cone(4.6, 1.6, 4), roof, { y: 3.8, ry: Math.PI / 4, sz: 0.85 }),
    part(box(1.1, 2.0, 0.05), "#6f4e37", { y: 1.0, z: 2.53 }),
    part(box(1.0, 0.9, 0.05), "#2b3a42", { x: -1.8, y: 1.8, z: 2.53 }),
    part(box(1.0, 0.9, 0.05), "#2b3a42", { x: 1.8, y: 1.8, z: 2.53 }),
  ]);
}

/** Mud-walled northern compound with a flat roof. */
export function mudHouse() {
  return staticMesh("mudhouse", () => [
    part(box(5, 2.8, 5), "#c68b59", { y: 1.4 }),
    part(box(5.2, 0.3, 5.2), "#a9714b", { y: 2.9 }),
    part(box(1.0, 1.9, 0.05), "#5c3d2e", { y: 0.95, z: 2.53 }),
    part(box(8, 1.6, 0.4), "#b97d4b", { x: 1.5, y: 0.8, z: -3 }),
  ]);
}

/** Roadside kiosk / buka with an umbrella, the classic roadside stop. */
export function kiosk(color = "#e63946") {
  return staticMesh(`kiosk-${color}`, () => [
    part(box(2.4, 1.2, 1.4), "#8d6e63", { y: 0.6 }),
    part(box(2.6, 0.08, 1.6), "#5d4037", { y: 1.22 }),
    part(cyl(0.04, 0.04, 2.6, 5), "#ddd", { y: 1.3 }),
    part(cone(1.8, 0.7, 8), color, { y: 2.6 }),
    ...[0, 1, 2, 3].map((i) => part(box(0.25, 0.3, 0.25), ANKARA[i * 2], { x: -0.8 + i * 0.5, y: 1.4 })),
  ]);
}

export function pole() {
  return staticMesh("pole", () => [part(cyl(0.1, 0.13, 9, 6), "#6d6875", { y: 4.5 }), part(box(1.8, 0.12, 0.12), "#6d6875", { y: 8.6 })]);
}

/** Military / police checkpoint props: drums, tyres, sandbags, a canopy. */
export function checkpointProps(kind) {
  return staticMesh(`checkpoint-${kind}`, () => {
    const p = [];
    for (let i = 0; i < 4; i++) {
      p.push(part(cyl(0.3, 0.3, 0.9, 10), i % 2 ? "#ffffff" : "#d00000", { x: 1 + i * 1.6, y: 0.45 }));
      p.push(part(cyl(0.31, 0.31, 0.12, 10), i % 2 ? "#d00000" : "#ffffff", { x: 1 + i * 1.6, y: 0.62 }));
    }
    for (let i = 0; i < 3; i++) p.push(part(new THREE.TorusGeometry(0.35, 0.14, 6, 10), "#111", { x: 6.4 + i * 0.4, y: 0.15 + i * 0.25, rx: Math.PI / 2 }));
    if (kind === "military") {
      for (let i = 0; i < 6; i++) p.push(part(box(0.9, 0.35, 0.5), "#a68a64", { x: -3.2 + (i % 3) * 0.9, y: 0.18 + Math.floor(i / 3) * 0.35, z: -0.6 }));
      p.push(part(box(3, 0.08, 3), "#4b5320", { x: -3, y: 2.6, z: -0.6 }));
    } else {
      p.push(part(box(2.6, 0.08, 2.6), kind === "frsc" ? "#ffd60a" : "#1d3557", { x: -3, y: 2.5, z: -0.6 }));
    }
    for (const x of [-4.2, -1.8]) p.push(part(cyl(0.05, 0.05, 2.5, 5), "#ccc", { x, y: 1.25, z: -0.6 }));
    p.push(part(box(1.2, 0.75, 0.6), "#6c584c", { x: -3, y: 0.38, z: -0.6 })); // table
    return p;
  });
}

export function warningTriangle() {
  return staticMesh("triangle", () => [part(cone(0.35, 0.6, 3), "#e63946", { y: 0.3 }), part(cone(0.22, 0.4, 3), "#ffffff", { y: 0.3, z: 0.02 })]);
}

export function speedBump() {
  return staticMesh("bump", () => [part(box(7.2, 0.12, 0.6), "#f8f9fa", {}), ...[0, 1, 2, 3, 4, 5].map((i) => part(box(0.6, 0.13, 0.61), "#111", { x: -3 + i * 1.2 }))]);
}

export function fillingStation() {
  return staticMesh("station", () => [
    part(box(10, 0.4, 7), "#f1f1f1", { y: 5 }),
    part(box(10.1, 0.5, 7.1), "#1faa59", { y: 4.6 }),
    ...[-3, 3].map((x) => part(cyl(0.2, 0.2, 4.6, 8), "#ddd", { x, y: 2.3 })),
    ...[-3, 0, 3].map((x) => part(box(0.7, 1.4, 0.5), "#1faa59", { x, y: 0.7, z: 1.5 })),
    part(box(8, 3, 4), "#e9ecef", { y: 1.5, z: -6 }),
    part(box(0.3, 7, 0.3), "#888", { x: 7, y: 3.5 }),
    part(box(2.2, 1.6, 0.3), "#1faa59", { x: 7, y: 7 }),
  ]);
}

export function potholeMesh(radius, deep) {
  const key = `pothole-${radius.toFixed(1)}-${deep}`;
  return staticMesh(key, () => {
    const g = new THREE.CircleGeometry(radius, 9);
    const pos = g.attributes.position;
    for (let i = 1; i < pos.count; i++) {
      const j = 0.7 + ((i * 37) % 10) / 22;
      pos.setXY(i, pos.getX(i) * j, pos.getY(i) * j * 0.8);
    }
    const ring = new THREE.RingGeometry(radius * 0.95, radius * 1.15, 9);
    return [
      part(ring, "#5b5650", { rx: -Math.PI / 2, y: 0.03 }),
      part(g, deep ? "#141210" : "#2a2622", { rx: -Math.PI / 2, y: 0.04 }),
    ];
  });
}

// ---------------------------------------------------------------- canvas textures (signs, billboards)

const textures = new Map();

export function canvasTexture(key, w, h, draw) {
  if (textures.has(key)) return textures.get(key);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures.set(key, t);
  return t;
}

const AD_COPY = {
  mechanic: { title: "Car don knock?", line: "Find a verified mechanic", cta: "GreenRev Mechanics", bg: "#0b6e4f" },
  marketplace: { title: "Upgrade your ride", line: "Thousands of cars, real prices", cta: "GreenRev Marketplace", bg: "#1faa59" },
  dealer: { title: "Are you a dealer?", line: "Sell faster. Sign up free.", cta: "GreenRev for Dealers", bg: "#0d3b66" },
  parts: { title: "Genuine spare parts", line: "From trusted vendors near you", cta: "GreenRev Parts", bg: "#7b2cbf" },
};

export function billboard(ad) {
  const copy = AD_COPY[ad] ?? AD_COPY.marketplace;
  const tex = canvasTexture(`ad-${ad}`, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = copy.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 6; i++) ctx.fillRect(i * 100 - 40, 0, 40, h);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 54px system-ui, sans-serif";
    ctx.fillText(copy.title, 28, 78);
    ctx.font = "32px system-ui, sans-serif";
    ctx.fillText(copy.line, 30, 128);
    ctx.fillStyle = "#ffd60a";
    roundRect(ctx, 26, 160, 400, 66, 14);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillText(copy.cta, 44, 206);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillText("greenrevs.com", 330, 248);
  });
  const g = new THREE.Group();
  g.add(staticMesh("board-frame", () => [
    part(box(0.25, 6, 0.25), "#555", { x: -3.2, y: 3 }),
    part(box(0.25, 6, 0.25), "#555", { x: 3.2, y: 3 }),
    part(box(8.4, 4.4, 0.25), "#333", { y: 6.6, z: -0.14 }),
  ]));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.set(0, 6.6, 0.01);
  g.add(panel);
  g.userData.ad = ad;
  return g;
}

export function textSign(text, { bg = "#0b6e4f", fg = "#fff", w = 6, h = 1.6, sub = "" } = {}) {
  const tex = canvasTexture(`sign-${text}-${sub}-${bg}`, 512, Math.round(512 * (h / w)), (ctx, cw, ch) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, cw - 16, ch - 16);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.round(ch * (sub ? 0.36 : 0.5))}px system-ui, sans-serif`;
    ctx.fillText(text, cw / 2, sub ? ch * 0.48 : ch * 0.66);
    if (sub) {
      ctx.font = `${Math.round(ch * 0.22)}px system-ui, sans-serif`;
      ctx.fillText(sub, cw / 2, ch * 0.8);
    }
  });
  const g = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  panel.position.y = 3 + h / 2;
  g.add(panel);
  g.add(staticMesh("sign-posts", () => [part(box(0.15, 3.2, 0.15), "#777", { x: -1.6, y: 1.6 }), part(box(0.15, 3.2, 0.15), "#777", { x: 1.6, y: 1.6 })]));
  return g;
}

/** "Welcome to <city>" arch over the road at the end of a leg. */
export function cityGate(cityName, state, span) {
  const g = new THREE.Group();
  g.add(staticMesh(`gate-${span}`, () => [
    part(box(1.4, 8, 1.4), "#f1faee", { x: -span / 2, y: 4 }),
    part(box(1.4, 8, 1.4), "#f1faee", { x: span / 2, y: 4 }),
    part(box(span + 2, 2.2, 1.2), "#1faa59", { y: 8.6 }),
    part(box(1.8, 0.5, 1.8), "#e9c46a", { x: -span / 2, y: 8.1 }),
    part(box(1.8, 0.5, 1.8), "#e9c46a", { x: span / 2, y: 8.1 }),
  ]));
  const tex = canvasTexture(`gate-${cityName}`, 1024, 128, (ctx, w, h) => {
    ctx.fillStyle = "#1faa59";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 64px system-ui, sans-serif";
    ctx.fillText(`WELCOME TO ${cityName.toUpperCase()}`, w / 2, 70);
    ctx.font = "30px system-ui, sans-serif";
    ctx.fillText(`${state} State · Drive safely · GreenRev`, w / 2, 112);
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(span + 1.6, 2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  panel.position.set(0, 8.6, 0.62);
  g.add(panel);
  return g;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
