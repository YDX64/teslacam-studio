# TeslaCam Studio

Cross-platform viewer for Tesla dashcam, Sentry, and saved clips. Native apps + PWA + web — same features everywhere, including in your Tesla's browser.

## Apps

| Path | Platform | Stack | Status |
|------|----------|-------|--------|
| `apps/web-pwa` | Browser + Tesla browser + PWA install | Vite + React + TypeScript + Tailwind | active |
| `apps/macos-native` | macOS 14+ | Swift 6 + SwiftUI + AVFoundation | active |
| `apps/flutter` | iOS / Android / macOS / Windows | Flutter | planned |
| `apps/web-legacy` | Browser (Python server) | Python + vanilla JS | legacy, kept for reference |

## Why this layout

- **Web PWA** is the lowest common denominator — anything with a browser (Tesla's old Chromium included) can run it, no install required.
- **Flutter** gives proper App Store / Play Store distribution with native rendering on iOS, Android, macOS, Windows. Same Dart codebase, native widgets via Material/Cupertino.
- **macOS Swift** is the reference implementation — fastest video decode via `AVPlayer`, used to validate behavior parity.
- **Legacy Python viewer** is kept for one-shot use without any build step.

## Folder convention

Tesla cars write to a USB drive in this layout:

```
TeslaCam/
├── RecentClips/          flat folder, ~1 min clips every minute while driving
├── SavedClips/<event>/   honk / panel save / icon-tap triggered
│   └── event.json        timestamp, city, est_lat, est_lon, reason
└── SentryClips/<event>/  Sentry-triggered, same layout
```

Per minute, up to 4 cameras: `front`, `left_repeater`, `right_repeater`, `back` (newer cars). All apps share that taxonomy.

## Getting started

```bash
# Native macOS
cd apps/macos-native && ./Scripts/make-app-bundle.sh release
open ".build/arm64-apple-macosx/release/TeslaCam Studio.app"

# PWA (dev)
cd apps/web-pwa && npm install && npm run dev
# open http://localhost:5173

# PWA (build & preview)
cd apps/web-pwa && npm run build && npm run preview
```

## Tesla browser

The PWA is built to work in Tesla's Chromium browser. To view your dashcam clips from inside the car:

1. Plug the USB stick (or your Mac via USB-C) into the car.
2. Run the PWA somewhere reachable on your home WiFi (`npm run preview -- --host`).
3. Open `http://<your-mac-ip>:4173/` in the Tesla browser.

Older Model S/X without LTE-video may still work locally; newer cars get the full experience.

## Author

Built and maintained by **Yunus** ([@YDX64](https://github.com/YDX64)) — founder of [YOURWEB](https://yourweb.se), a Gothenburg-based web agency focused on websites, e-commerce, and secure digital solutions.

Contact: [info@yourweb.se](mailto:info@yourweb.se) · [yourweb.se](https://yourweb.se)
