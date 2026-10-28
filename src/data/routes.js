/**
 * Road trips across Nigeria. Every leg is one stretch of highway between two cities.
 * Add a city by adding a leg; add a journey by adding a route. Distances are real-world km
 * (approximate); the game compresses them (see legLengthMeters).
 *
 * biome:     south (rainforest, palms, rain) | savanna (middle belt) | sahel (far north, harmattan)
 *            | plateau (Jos rocks and hills)
 * quality:   0 (crater-filled) .. 1 (fresh asphalt); controls pothole density
 * traffic:   0 .. 1; how busy the road is
 * security:  which checkpoints to expect and how often (per leg)
 */
export const CITIES = {
  lagos: { name: "Lagos", state: "Lagos", food: "Ofada rice & ayamase", fact: "Africa's biggest city. Third Mainland Bridge is 11.8 km long.", landmark: "Third Mainland Bridge" },
  ibadan: { name: "Ibadan", state: "Oyo", food: "Amala & gbegiri", fact: "Home of Cocoa House, once the tallest building in tropical Africa.", landmark: "Cocoa House" },
  ilorin: { name: "Ilorin", state: "Kwara", food: "Ofada & ewa", fact: "Gateway between the South-West and the North.", landmark: "Sobi Hill" },
  jebba: { name: "Jebba", state: "Kwara", food: "Fresh river fish", fact: "The Jebba bridges cross the mighty River Niger.", landmark: "Jebba Bridge" },
  mokwa: { name: "Mokwa", state: "Niger", food: "Roasted yam & pepper sauce", fact: "A busy truck stop on the road to the North.", landmark: "Mokwa Junction" },
  bida: { name: "Bida", state: "Niger", food: "Masa with miyan taushe", fact: "Famous for Nupe brass and glass craft.", landmark: "Etsu Nupe's Palace" },
  abuja: { name: "Abuja", state: "FCT", food: "Suya at Wuse", fact: "Aso Rock towers 400 m over the capital.", landmark: "Aso Rock" },
  kaduna: { name: "Kaduna", state: "Kaduna", food: "Masa & suya", fact: "Lord Lugard Hall and the old colonial capital of the North.", landmark: "Lugard Hall" },
  zaria: { name: "Zaria", state: "Kaduna", food: "Tuwo shinkafa", fact: "Ancient walled city and home of Ahmadu Bello University.", landmark: "Zaria City Walls" },
  kano: { name: "Kano", state: "Kano", food: "Kilishi & fura da nono", fact: "The Kofar Mata dye pits have worked for over 500 years.", landmark: "Kofar Mata Dye Pits" },
  potiskum: { name: "Potiskum", state: "Yobe", food: "Kilishi", fact: "One of the biggest cattle markets in West Africa.", landmark: "Potiskum Cattle Market" },
  damaturu: { name: "Damaturu", state: "Yobe", food: "Dambu nama", fact: "Capital of Yobe State, at the edge of the Sahel.", landmark: "Damaturu Central Mosque" },
  maiduguri: { name: "Maiduguri", state: "Borno", food: "Kilishi & dambu", fact: "The 'Home of Peace', near Lake Chad.", landmark: "Shehu's Palace" },
  keffi: { name: "Keffi", state: "Nasarawa", food: "Kunu & kosai", fact: "An old emirate town just outside Abuja.", landmark: "Keffi Emir's Palace" },
  akwanga: { name: "Akwanga", state: "Nasarawa", food: "Roasted corn & ube", fact: "Green hills where the road starts climbing.", landmark: "Farin Ruwa Falls (nearby)" },
  jos: { name: "Jos", state: "Plateau", food: "Irish potatoes, any style", fact: "1,200 m up: the coolest weather in Nigeria.", landmark: "Shere Hills" },
  ore: { name: "Ore", state: "Ondo", food: "Boli & groundnut", fact: "The famous junction every Lagos–East traveller knows.", landmark: "Ore Junction" },
  benin: { name: "Benin City", state: "Edo", food: "Owo soup & starch", fact: "The ancient Benin Kingdom and its bronzes.", landmark: "Oba's Palace" },
  onitsha: { name: "Onitsha", state: "Anambra", food: "Ofe onugbu", fact: "Onitsha Main Market is one of the biggest in Africa.", landmark: "Second Niger Bridge" },
  owerri: { name: "Owerri", state: "Imo", food: "Ofe owerri", fact: "Nigeria's 'Heartland' and a weekend escape.", landmark: "Oguta Lake (nearby)" },
  aba: { name: "Aba", state: "Abia", food: "Ofe akwu", fact: "'Aba made': shoes, bags and clothes for half of West Africa.", landmark: "Ariaria Market" },
  uyo: { name: "Uyo", state: "Akwa Ibom", food: "Afang soup", fact: "One of the cleanest state capitals in Nigeria.", landmark: "Ibom Plaza" },
  calabar: { name: "Calabar", state: "Cross River", food: "Edikang ikong", fact: "Home of Africa's biggest street party, the Calabar Carnival.", landmark: "Tinapa & the Marina" },
};

const sec = (police, military, frsc, vio) => ({ police, military, frsc, vio });

export const ROUTES = [
  {
    id: "lagos-abuja",
    name: "Lagos → Abuja",
    tagline: "The classic: Lagos traffic to the capital, across the Niger at Jebba",
    color: "#1faa59",
    unlockedBy: null,
    legs: [
      { from: "lagos", to: "ibadan", km: 130, road: "Lagos–Ibadan Expressway", biome: "south", quality: 0.8, traffic: 0.95, security: sec(1, 0, 1, 1), goSlowAtStart: true },
      { from: "ibadan", to: "ilorin", km: 160, road: "Ibadan–Oyo–Ogbomoso Road", biome: "south", quality: 0.55, traffic: 0.6, security: sec(1, 0, 1, 0) },
      { from: "ilorin", to: "jebba", km: 90, road: "Ilorin–Jebba Road", biome: "savanna", quality: 0.45, traffic: 0.5, security: sec(1, 0, 0, 1), bridge: "Jebba Bridge" },
      { from: "jebba", to: "mokwa", km: 60, road: "Jebba–Mokwa Road", biome: "savanna", quality: 0.3, traffic: 0.55, security: sec(0, 1, 1, 0) },
      { from: "mokwa", to: "bida", km: 90, road: "Mokwa–Bida Road", biome: "savanna", quality: 0.35, traffic: 0.4, security: sec(1, 1, 0, 0) },
      { from: "bida", to: "abuja", km: 250, road: "Bida–Lambata–Suleja Road", biome: "savanna", quality: 0.5, traffic: 0.7, security: sec(1, 1, 1, 1), goSlowAtEnd: true },
    ],
  },
  {
    id: "lagos-calabar",
    name: "Lagos → Calabar",
    tagline: "East by road: Ore, Benin, the Second Niger Bridge and on to Cross River",
    color: "#e0a100",
    unlockedBy: null,
    legs: [
      { from: "lagos", to: "ore", km: 230, road: "Lagos–Sagamu–Ore Road", biome: "south", quality: 0.6, traffic: 0.85, security: sec(1, 0, 1, 0), goSlowAtStart: true },
      { from: "ore", to: "benin", km: 140, road: "Ore–Benin Expressway", biome: "south", quality: 0.25, traffic: 0.75, security: sec(2, 0, 1, 1) },
      { from: "benin", to: "onitsha", km: 140, road: "Benin–Asaba Expressway", biome: "south", quality: 0.5, traffic: 0.7, security: sec(1, 1, 1, 0), bridge: "Second Niger Bridge", goSlowAtEnd: true },
      { from: "onitsha", to: "owerri", km: 100, road: "Onitsha–Owerri Road", biome: "south", quality: 0.3, traffic: 0.65, security: sec(2, 0, 0, 1) },
      { from: "owerri", to: "aba", km: 65, road: "Owerri–Aba Road", biome: "south", quality: 0.35, traffic: 0.6, security: sec(1, 0, 1, 0) },
      { from: "aba", to: "uyo", km: 60, road: "Aba–Ikot Ekpene–Uyo Road", biome: "south", quality: 0.6, traffic: 0.5, security: sec(1, 0, 0, 1) },
      { from: "uyo", to: "calabar", km: 110, road: "Uyo–Itu–Calabar Highway", biome: "south", quality: 0.55, traffic: 0.45, security: sec(1, 1, 1, 0), goSlowAtEnd: true },
    ],
  },
  {
    id: "abuja-kano",
    name: "Abuja → Kano",
    tagline: "North on the A2: Kaduna suya, Zaria's walls, Kano's ancient city",
    color: "#2f7de1",
    unlockedBy: "lagos-abuja",
    legs: [
      { from: "abuja", to: "kaduna", km: 190, road: "Abuja–Kaduna Expressway", biome: "savanna", quality: 0.45, traffic: 0.7, security: sec(1, 2, 1, 0), goSlowAtStart: true },
      { from: "kaduna", to: "zaria", km: 80, road: "Kaduna–Zaria Expressway", biome: "savanna", quality: 0.55, traffic: 0.55, security: sec(1, 1, 1, 1) },
      { from: "zaria", to: "kano", km: 160, road: "Zaria–Kano Road", biome: "sahel", quality: 0.6, traffic: 0.6, security: sec(1, 1, 1, 0), goSlowAtEnd: true },
    ],
  },
  {
    id: "abuja-jos",
    name: "Abuja → Jos",
    tagline: "Climb the Plateau to Nigeria's coolest city",
    color: "#8a5cf6",
    unlockedBy: "lagos-abuja",
    legs: [
      { from: "abuja", to: "keffi", km: 55, road: "Abuja–Keffi Expressway", biome: "savanna", quality: 0.7, traffic: 0.8, security: sec(1, 0, 1, 1), goSlowAtStart: true },
      { from: "keffi", to: "akwanga", km: 75, road: "Keffi–Akwanga Road", biome: "savanna", quality: 0.45, traffic: 0.45, security: sec(1, 1, 0, 0) },
      { from: "akwanga", to: "jos", km: 130, road: "Akwanga–Jos Road", biome: "plateau", quality: 0.4, traffic: 0.4, security: sec(1, 1, 1, 0) },
    ],
  },
  {
    id: "kano-maiduguri",
    name: "Kano → Maiduguri",
    tagline: "Into the Sahel: harmattan haze, cattle markets and military checkpoints",
    color: "#d9534f",
    unlockedBy: "abuja-kano",
    legs: [
      { from: "kano", to: "potiskum", km: 280, road: "Kano–Kari–Potiskum Road", biome: "sahel", quality: 0.5, traffic: 0.45, security: sec(1, 2, 1, 0) },
      { from: "potiskum", to: "damaturu", km: 100, road: "Potiskum–Damaturu Road", biome: "sahel", quality: 0.55, traffic: 0.35, security: sec(0, 2, 1, 0) },
      { from: "damaturu", to: "maiduguri", km: 135, road: "Damaturu–Maiduguri Road", biome: "sahel", quality: 0.5, traffic: 0.4, security: sec(0, 3, 0, 0), goSlowAtEnd: true },
    ],
  },
];

/** Real km to in-game metres. Long legs are compressed more so each leg takes 1.5–4 minutes. */
export function legLengthMeters(km) {
  return Math.round(Math.min(4800, Math.max(1600, 900 + km * 14)));
}

export function getRoute(id) {
  const r = ROUTES.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown route ${id}`);
  return r;
}

export function routeCities(route) {
  return [route.legs[0].from, ...route.legs.map((l) => l.to)];
}
