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
  // "auto": post to the host app (WebView/iframe) or open a tab on the open web.
  // "link": show a tappable link card; for sandboxed embeds that block scripted navigation.
  linkMode: "auto",
  // Roadside advertising sold to businesses. Create one Paystack Payment Page per package
  // (Paystack dashboard → Payment Pages → fixed amount) and paste its link as paystackUrl.
  advertise: {
    contactUrl: "https://greenrevs.com/advertise",   // where advertisers send artwork + payment reference
    templateUrl: "./ad-template.png",                // 1024×512 billboard template
    adsUrl: "./ads.json",                            // live campaigns (see README)
    packages: [
      { id: "3d", days: 3, price: 15_000, paystackUrl: "" },
      { id: "7d", days: 7, price: 30_000, paystackUrl: "" },
      { id: "30d", days: 30, price: 100_000, paystackUrl: "" },
    ],
  },
};

const override = globalThis.GREENREV_CONFIG ?? {};
export const CONFIG = { ...defaults, ...override, advertise: { ...defaults.advertise, ...(override.advertise ?? {}) } };

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
  if (CONFIG.linkMode === "link") return showLinkCard(LINK_LABELS[target] ?? "GreenRev", url);
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

const LINK_LABELS = { marketplace: "GreenRev Marketplace", mechanic: "GreenRev Mechanics", dealer: "GreenRev dealer sign-up", parts: "GreenRev Parts" };

/** Open any outside link (advertiser sites, Paystack) the way this embed allows. */
export function openExternal(url, label = "link") {
  if (!url) return;
  if (CONFIG.linkMode === "link") return showLinkCard(label, url);
  const rn = globalThis.ReactNativeWebView;
  const message = { type: "greenrev:open", url };
  if (rn?.postMessage) return rn.postMessage(JSON.stringify(message));
  if (globalThis.parent && globalThis.parent !== globalThis) return globalThis.parent.postMessage(message, "*");
  globalThis.open?.(url, "_blank", "noopener");
}

/** A small card with a real link the player taps to leave the game. */
function showLinkCard(label, url) {
  document.getElementById("gr-link-card")?.remove();
  const card = document.createElement("div");
  card.id = "gr-link-card";
  card.style.cssText = "position:fixed;left:50%;bottom:calc(120px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:40;background:#0b6e4f;color:#fff;padding:12px 14px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.45);display:flex;gap:10px;align-items:center;max-width:92vw;font:600 14px system-ui,sans-serif";
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = `Open ${label} →`;
  a.style.cssText = "color:#ffd60a;text-decoration:underline";
  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close");
  close.style.cssText = "background:none;border:0;color:#fff;font-size:16px;cursor:pointer";
  close.onclick = () => card.remove();
  card.append(a, close);
  document.body.appendChild(card);
  setTimeout(() => card.remove(), 9000);
}
