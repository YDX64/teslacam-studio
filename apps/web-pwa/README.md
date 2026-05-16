# TeslaCam Studio — Web PWA

Cross-browser viewer that scans your TeslaCam folder, plays all three (or four) cameras in sync,
and exports snapshots, events, and incident reports to your Desktop. Works in any modern browser
plus the Tesla in-car browser.

## Run

```bash
# Terminal 1: backend (serves files + handles exports)
python3 server/server.py --root /path/to/TeslaCam

# Terminal 2: frontend
npm install
npm run dev
# open http://localhost:5173
```

## Production preview

```bash
npm run build
npm run preview -- --host
# Open http://<your-mac-ip>:4173 from the Tesla browser on the same WiFi
```

## Stack

- Vite 8 + React 19 + TypeScript
- Tailwind CSS v4 (CSS-first config in `src/index.css`)
- Zustand (state)
- Leaflet (map)
- vite-plugin-pwa (manifest + service worker)
- Python stdlib backend (HTTP Range serving + snapshot/export endpoints)

## Build target

`es2019` — kept compatible with older Chromium versions found in early Tesla cars.
