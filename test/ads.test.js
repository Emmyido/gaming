import { describe, expect, it } from "vitest";
import { activeCampaigns, campaignEnd } from "../src/game/ads.js";
import { planLeg } from "../src/game/director.js";
import { ROUTES } from "../src/data/routes.js";
import { MENUS } from "../src/data/food.js";
import { BIOMES } from "../src/world/world.js";

const c = (o) => ({ id: "x", advertiser: "Mama Cass", image: "https://cdn/x.jpg", link: "https://x", start: "2026-11-01", end: "2026-11-07", ...o });

describe("roadside ad campaigns", () => {
  it("runs only between its start and end dates, inclusive", () => {
    const list = [c({})];
    expect(activeCampaigns(list, "2026-10-31", "lagos-abuja")).toHaveLength(0);
    expect(activeCampaigns(list, "2026-11-01", "lagos-abuja")).toHaveLength(1);
    expect(activeCampaigns(list, "2026-11-07", "lagos-abuja")).toHaveLength(1);
    expect(activeCampaigns(list, "2026-11-08", "lagos-abuja")).toHaveLength(0);
  });

  it("can target specific journeys and ignores broken entries", () => {
    const list = [c({ id: "a", routes: ["abuja-kano"] }), c({ id: "b", image: "" }), null, c({ id: "c", routes: [] })];
    expect(activeCampaigns(list, "2026-11-03", "lagos-abuja").map((x) => x.id)).toEqual(["c"]);
    expect(activeCampaigns(list, "2026-11-03", "abuja-kano").map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("computes package end dates", () => {
    expect(campaignEnd("2026-11-01", 3)).toBe("2026-11-03");
    expect(campaignEnd("2026-11-25", 7)).toBe("2026-12-01");
    expect(campaignEnd("2026-11-01", 30)).toBe("2026-11-30");
  });
});

describe("rest stops and ad boards", () => {
  it("puts a rest stop on almost every leg and advertise boards along the road", () => {
    let legs = 0, stops = 0, advertise = 0;
    for (let k = 0; k < 5; k++) for (const r of ROUTES) for (const [i, leg] of r.legs.entries()) {
      const plan = planLeg(leg, `${r.id}-${i}-${k}`);
      legs++;
      stops += plan.events.some((e) => e.type === "reststop") ? 1 : 0;
      advertise += plan.events.filter((e) => e.type === "billboard" && e.ad === "advertise").length;
    }
    expect(stops / legs).toBeGreaterThan(0.9);
    expect(advertise / legs).toBeGreaterThan(0.8);
  });

  it("has a regional menu for every biome", () => {
    for (const b of Object.keys(BIOMES)) expect(MENUS[b]?.length).toBeGreaterThanOrEqual(3);
  });
});
