# Light Mode — Handoff for the macOS native app

The **web PWA** (`apps/web-pwa`) now has full light/dark theming. This note hands the
equivalent work for the **native macOS app** (`apps/macos-native`, SwiftUI) to Claude Code.
Goal: visual + behavioral parity with the web.

## What the web does (mirror this)
- A theme mode with three states: **System · Light · Dark**.
- Default = **System** (follows the OS appearance). User choice is **persisted** and
  takes precedence; a toggle cycles System → Light → Dark.
- Web persists to `localStorage["tcs-theme"]`. Native should use `@AppStorage("tcs-theme")`.

## Recommended SwiftUI approach
1. SwiftUI is appearance-adaptive already. Define semantic colors that resolve per
   `colorScheme` — either Asset Catalog color sets (Any/Dark appearances) or a helper:
   `Color(light:dark:)` using `NSColor(name:dynamicProvider:)`.
2. Add a `ThemeMode` enum (`system/light/dark`) stored via `@AppStorage`. Apply with
   `.preferredColorScheme(mode.colorScheme)` on the root view (`nil` for system).
3. Add a toggle in the app's toolbar/sidebar header to match the web (cycles the 3 modes).
4. Replace hardcoded dark `Color(hex:)` / `Color(red:green:blue:)` with the semantic colors.

## Where to look
- `apps/macos-native/Sources/TeslaCamStudio/*.swift` — search for `Color(`, `.background(`,
  hex helpers, and any hardcoded dark values. SidebarView.swift / VideoGridView.swift exist.
- Keep the **video stage black in both themes** (like the web): video letterbox / player
  surfaces stay black; only chrome (sidebars, toolbars, panels, lists) flips.

## Exact palette (match the web tokens for parity)

| Token            | Dark        | Light       |
|------------------|-------------|-------------|
| bg-0 (page)      | #07090F     | #E9EDF4     |
| bg-1 (panel)     | #0C0F17     | #F4F6FB     |
| bg-2 (raised)    | #131724     | #FFFFFF     |
| bg-3 (raised+)   | #1A2032     | #FFFFFF     |
| border           | #FFFFFF @8% | #0F172A @12%|
| border-strong    | #FFFFFF @18%| #0F172A @22%|
| text             | #E8ECF3     | #18222F     |
| text-dim         | #98A1B4     | #51607A     |
| text-faint       | #5A6478     | #8693A8     |
| accent           | #5B8DEF     | #2F6FE0     |
| accent-2         | #7EA8FF     | #4F86EE     |
| success          | #4ADE80     | #16A34A     |
| warning          | #FBBF24     | #C2710C     |
| danger           | #F87171     | #DC2626     |
| saved            | #F59E0B     | #C2710C     |
| sentry           | #EF4444     | #DC2626     |
| recent           | #10B981     | #059669     |

Overlays (web `ov-*` elevations): dark = white @2–20%, light = `#0F172A` @2–20%.

## Tasks
- [ ] #22 Inspect native color/theme structure.
- [ ] #23 Apply light mode (appearance-adaptive colors + ThemeMode toggle).
- [ ] #24 Build (`./Scripts/make-app-bundle.sh release`) and verify Light/Dark/System.

## Coordination
The web work is committed on `main` (latest light-mode commit `6cc87f0`). Only touch
`apps/macos-native/**` to avoid conflicts with the web (`apps/web-pwa/**`).
