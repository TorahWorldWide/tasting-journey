# HANDOFF — מסע טעימות / Tasting Journey

Personal Hebrew RTL food-tasting tracker PWA for Tomer (Harish, IL). Read this first before any change.

## Live
- URL (permanent): https://torahworldwide.github.io/tasting-journey/
- Repo: TorahWorldWide/tasting-journey. `main` = source, `gh-pages` = built `dist`.
- Installable PWA (manifest + sw.js + icons). Data persists on device.

## Stack
- Vite + React 19, **no external libraries** (hooks + pure CSS only).
- Hebrew, RTL, mobile-first max-width 480px. Fonts: Frank Ruhl Libre (headings) + Heebo (body), injected at runtime.

## Files
- `src/data.js` — catalog (16 milk items incl. משקה שקדים-קוקוס) + 6 REAL Harish-area stores (coords, verified hours, delivery URLs) + helpers (uid, fmt, storeOpen, wazeUrl, mapsUrl, DAY_NAMES). **Edit catalog/stores HERE.**
- `src/MapView.jsx` — the MAP tab (the heart of the app). Leaflet + free CartoDB Voyager tiles (no API key, no billing — Pokémon-GO style). Animated store markers (color by open/closed/unknown, drop-in + pulse ring, bounce when selected), tap → flyTo + bottom sheet. Locate button → geolocation pulsing user dot. Store sheet has "כניסה לחנות" → product grid.
- `src/App.jsx` — shell + all other tabs (one file, sub-components inline). Map is the DEFAULT first tab. StoreInside component = the "enter store" product grid (tap cell = toggle bought).
- `src/App.css` — all styles + design tokens + Pokémon-GO animations + map/marker/sheet/interior CSS.
- `public/` — manifest.webmanifest, sw.js, icon*.png/svg. **Final, do not edit casually.**

## Maps decision (important)
Tomer asked for "Google Maps API". We deliberately use **Leaflet + OpenStreetMap (CartoDB Voyager tiles)** instead: free, no API key, no billing card required, and it's literally what Pokémon GO uses (Niantic moved to OSM in 2017). If he ever insists on Google tiles specifically, that needs a Google Cloud billing account + Maps JS API key — flag the cost before doing it.

## ⚠️ Persistence gotcha (same as the artifact original)
Load = `{ ...DEFAULT_STATE, ...JSON.parse(localStorage[STORAGE_KEY]) }` and `parsed.categories` overrides the default array wholesale. So **editing the default catalog in data.js will NOT reach an install that already has saved state** — only a fresh install or after the user hits ⟳ Reset. Tell Tomer to add via the in-app "+ הוסף מוצר" or Reset.
- localStorage key: `tasting-journey-v2` (text/JSON state).
- Photos live in **IndexedDB** (db `tasting-journey-photos`, store `photos`, keyed by item id), NOT in localStorage. Item `image='idb'` is a sentinel; real bytes in IDB. imageSource: user|off|web|url.

## Features
- 4 tabs: קטלוג / רשימה / חנויות / היומיום (numeric badges).
- Item status flow todo→list→tasted; rate = 5×💧 + verdict (daily/maybe/pass).
- Photo per item: 📷 camera/upload (canvas-downscaled to ~1000px JPEG q0.8 → IDB), 🔎 Open Food Facts by barcode (CC-BY-SA attribution shown), 🔗 manual URL.
- Swipeable fullscreen viewer (arrows + touch swipe): show seller, "✓ קניתי" toggle, Pokémon-GO sparkle "caught it" pop. Respects prefers-reduced-motion.
- Shopping list grouped BY STORE (where-substring match) + 🚚 delivery deep-link for chains that deliver.
- Stores: open-first sort, today + full-week hours, Waze + Google Maps, custom-store add (free-text hours).
- Add category / item / store via modals.

## Deploy (after any change)
```bash
cd ~/tasting-journey
git add -A && git -c user.email=a@b.c -c user.name=hermes commit -m "msg"
git push origin main
npm run build
cd dist && touch .nojekyll && git init -q && \
  git -c user.email=a@b.c -c user.name=hermes add -A && \
  git -c user.email=a@b.c -c user.name=hermes commit -q -m deploy && \
  git branch -M gh-pages && \
  git push -f "https://x-access-token:$(cat ~/.hermes/.github_token | tr -d '\n')@github.com/TorahWorldWide/tasting-journey.git" gh-pages
cd .. && rm -rf dist/.git
```
Pages already enabled (gh-pages branch, / path). Live build takes ~1-2 min after push. vite base = `/tasting-journey/`.

## Status / next
- PROTOTYPE — built & verified rendering, NOT yet touch-tested by Tomer.
- v2 ideas still open: structured hours for custom stores, route/itinerary across stores, export list as text, second curated category (cheese/olive oil/coffee).
- Future: can wrap same code as a real Android app (TWA/Capacitor) when he decides.
