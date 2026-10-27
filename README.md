# GreenRev Roadtrip 3D — stability + Nigerian mobility upgrade

**This update extends the existing GreenRev Roadtrip 3D project** (two existing 20-mission storylines). It does not replace the original app, its services or saved-game key.

## Fastest way to play on Windows (no payment setup needed)

1. Install **Node.js 20+** if not already installed (https://nodejs.org).
2. Unzip the update, then copy **index.html, game.js, world3d.js, styles.css, server.js** and the starter files into your **existing GreenRev game folder**. Keep a backup first.
3. Double-click **start-game-windows.bat**. This starts the local server and opens **http://localhost:5173/**.
4. Select an avatar and choose **Abuja → Kano** or **Lagos → Abuja**. Click **Start my road trip**.
5. Try the **Garage**, **Game Bank**, four cameras, **Horn**, **Time & light**, **Jump to next story event** and the GreenRev phone.

You can still use VS Code's Live Server for offline gameplay, but **Paystack-hosted test checkout only works using `node server.js`**. You should *not* open checkout using a `file://` URL or a generic VS Code Live Server.

## What is fixed / added

- **Missing traffic after Reset:** fixed the root cause (an emptied traffic array was not rebuilt). Now 21 NPC road users spawn, with around 18–20 usually in the nearby visual range (the count varies with movement).
- **Regional public transport:** yellow Lagos danfo only on the **Lagos → Abuja** route; white-and-green Hiace-style intercity buses on the **Abuja → Kano** route. Both are actual procedurally modelled 3D vehicles, not emoji sprites.
- **Collision recovery:** player/NPC lane-and-distance collision, NPC/NPC encounters, brake/slowdown, crash-recovery modal, and recovery saving.
- **Car details:** sedan body shaping, grille, lamps, wheels, glazing, roof/trim details; SUVs, buses and road users remain stylised WebGL 3D. This is **not photorealistic**.
- **4D-style effects:** true 3D geometry plus a simulated time dimension (sunlight/day-dusk-night cycle), weather effects, horn, speed boost, cameras and incident interaction. There is no literal fourth spatial dimension.
- **Preserved both existing 20-stage journeys:** FRSC, tyres, Passport, mobile mechanics, plaza/fuel, passenger bus encounter, rental, dashboard warning, dining, haulage, parts, rain, delivery, VIO, electrical, brakes, car purchase/finance, dealer, EV/fuel stop, arrival.
- **All three rental offers** remain playable (sedan + luggage courier, seven-seat SUV, 12-seat minibus).
- **Game Bank:** virtual **free developer credit** is separately labelled from an optional real **Paystack hosted TEST checkout**. No live payment is enabled.
- **Financing simulator:** fictional cash payment, 25% deposit + 36 months illustrative car financing and repayments (not a loan offer).

## Proper Paystack test checkout (optional)

Paystack official docs: https://paystack.com/docs/payments/accept-payments/ and https://paystack.com/docs/payments/verify-payments/.

1. Have a merchant Paystack account and use its **TEST mode** developer credentials.
2. Copy `.env.example` to `.env` in the same directory. Replace the placeholder with your own **`sk_test_` secret key**; **NEVER use `sk_live_` here**.
3. Run `node server.js` (or Windows starter), open `http://localhost:5173/`.
4. In GreenRev click **Game Bank → Paystack TEST +₦5m/₦25m/₦100m**. Enter an email; the server initializes checkout and redirects you to Paystack's hosted page.
5. Complete checkout with **Paystack's test payment credentials** from its documentation. On return, the local Node server verifies status `success`, currency `NGN`, original amount, email, reference and `domain: test`, then adds credits once per reference to the *local browser's demo game wallet*.
6. If the provider callback refuses localhost, use an appropriate secure staging URL with HTTPS and change the callback on the server. Do not switch to live keys.

The optional **FREE demo +₦25m** button never sends a payment request and is intended for development/testing expensive cars. No real bank details are handled in the game. **Production paid game currency would require authenticated users, a server-authoritative wallet/ledger, refunds/chargebacks, anti-fraud controls, terms, and payment-provider approval.** This offline build is NOT secure as a production financial product.

**Do not commit `.env` or `.local-test-payments.json` to GitHub.** They are intentionally not distributed in this ZIP.

## Controls

| Action | Controls |
|---|---|
| Accelerate | W / ↑ / GAS button |
| Steer | A / D or ← / →; hold on-screen LEFT / RIGHT |
| Brake | S / ↓ / BRAKE |
| Camera | 1–4 / Aerial, Follow, Cockpit, Far |
| Horn | H or **Horn** |
| Move light/time of day | **Time & light** |
| Accelerate short burst | **Boost** |
| Drive automatically (assistive; still monitor safety) | **Auto-drive** |
| Active story when paused | **Continue this mission** / **Jump to next story event** |
| More gameplay | GreenRev phone tabs |

**Browser graphics:** Chrome/Edge with hardware acceleration and WebGL enabled. If WebGL is blocked, the game displays a graphics compatibility message; story panels remain available.

## Files to merge

| Existing project | Action |
|---|---|
| `game.js` | Replace with enhanced version |
| `world3d.js` | Replace with updated 3D models and route scenery |
| `index.html` | Replace (UI controls, route info) |
| `styles.css` | Replace (compatible existing design) |
| `server.js` | **Add** (local static server, secure Paystack test API) |
| `.env.example` | **Add** (optional setup template) |
| `start-game-windows.bat` / `.sh` | **Add** (run helpers) |
| `MERGE-GUIDE.md` / `CHANGES-ONLY.patch` | Review changes |

Your previously saved game uses the same storage key. To test the new traffic population from the beginning, click **Reset** and then start a new route. Changes that touch saved configuration may require replaying a stage.
