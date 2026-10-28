/**
 * Paid roadside campaigns. The game reads them from CONFIG.advertise.adsUrl (a static ads.json, or
 * an endpoint on the GreenRev backend once booking is automated):
 *
 * { "campaigns": [ { "id": "mama-cass-nov", "advertiser": "Mama Cass Kitchen",
 *     "image": "https://cdn.example.com/mama-cass-1024x512.jpg", "link": "https://mamacass.ng",
 *     "start": "2026-11-01", "end": "2026-11-07", "routes": ["lagos-abuja"] } ] }
 *
 * `routes` is optional (empty = every journey). Dates are inclusive, in YYYY-MM-DD.
 */
export async function loadCampaigns(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.campaigns) ? data.campaigns : [];
  } catch {
    return []; // offline or blocked: the boards just show "Advertise here"
  }
}

export function activeCampaigns(list, today, routeId) {
  return list.filter((c) => c && c.id && c.image && c.start <= today && today <= c.end && (!c.routes?.length || c.routes.includes(routeId)));
}

/** Days a package runs, starting on `start` (inclusive), as an end date. */
export function campaignEnd(start, days) {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days - 1);
  return d.toISOString().slice(0, 10);
}
