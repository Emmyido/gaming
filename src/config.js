/**
 * GreenRev links shown in the game. Set window.GREENREV_CONFIG before the game loads to override
 * (e.g. from the web app or a mobile WebView), or edit the defaults here.
 */
const defaults = {
  marketplaceUrl: "https://greenrevs.com",
  mechanicUrl: "https://greenrevs.com/mechanics",
  dealerSignupUrl: "https://greenrevs.com/dealers/signup",
  partsUrl: "https://greenrevs.com/parts",
  utm: "utm_source=roadtrip_game&utm_medium=game",
};

export const CONFIG = { ...defaults, ...(globalThis.GREENREV_CONFIG ?? {}) };

/**
 * Open a GreenRev destination. Inside the mobile app (React Native WebView) or an iframe, the host app
 * receives a message and navigates natively; on the open web it opens a new tab.
 */
export function openGreenRev(target, context = {}) {
  const base = {
    marketplace: CONFIG.marketplaceUrl,
    mechanic: CONFIG.mechanicUrl,
    dealer: CONFIG.dealerSignupUrl,
    parts: CONFIG.partsUrl,
  }[target] ?? CONFIG.marketplaceUrl;
  const params = new URLSearchParams(CONFIG.utm);
  if (context.query) params.set("q", context.query);
  if (context.city) params.set("city", context.city);
  params.set("utm_content", context.reason ?? target);
  const url = `${base}${base.includes("?") ? "&" : "?"}${params}`;
  const message = { type: "greenrev:navigate", target, url, context };
  track("cta_click", { target, ...context });
  const rn = globalThis.ReactNativeWebView;
  if (rn?.postMessage) return rn.postMessage(JSON.stringify(message));
  if (globalThis.parent && globalThis.parent !== globalThis) return globalThis.parent.postMessage(message, "*");
  globalThis.open?.(url, "_blank", "noopener");
}

/** Analytics hook: host apps listen for these to measure retention (sessions, streaks, CTA clicks). */
export function track(event, props = {}) {
  const payload = { type: "greenrev:event", event, props, at: Date.now() };
  try {
    globalThis.GreenRevAnalytics?.track?.(event, props);
    const rn = globalThis.ReactNativeWebView;
    if (rn?.postMessage) rn.postMessage(JSON.stringify(payload));
    else if (globalThis.parent && globalThis.parent !== globalThis) globalThis.parent.postMessage(payload, "*");
  } catch {
    /* analytics must never break the game */
  }
}
