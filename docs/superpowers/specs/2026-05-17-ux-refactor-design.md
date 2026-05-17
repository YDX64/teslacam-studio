# TeslaCam Studio — UX & Architecture Refactor

**Date:** 2026-05-17
**Scope:** `apps/web-pwa` (Vite + React 19 + TS + Tailwind v4) and its Python backend (`server/server.py`)
**Language:** All UI strings are English. This document is also English.

---

## 1. Goals

Fix seven concrete defects in the current Web PWA and re-architect the parts of the codebase that make them recur:

| # | Defect | Root cause |
|---|--------|-----------|
| 1 | No folder selection UI — backend scans a hard-coded path | UI was built backend-first; no `SourcePicker` exists |
| 2 | Switching layouts (Studio ↔ Theater ↔ Triptych ↔ Mosaic) reloads every `<video>` | Each layout uses a different React tree, so PlayerSurfaces unmount/remount; `isPrimary` is also a reload trigger |
| 3 | Entering "focus mode" on a camera leaves the user stranded — no obvious way out except clicking the same tile again | No on-screen control affordance for "exit focus" |
| 4 | Individual camera tiles have no controls (per-cell fullscreen, per-cell mute, per-cell focus) | All controls live in the global `PlaybackControls` |
| 5 | Fullscreen is broken — `requestFullscreen` only, no exit button on screen, no Tesla-keyboard escape path | Single API call, no chrome rendered over fullscreen |
| 6 | Library/Inspector overlays cover the entire viewport — the video and timeline disappear when browsing | Drawers are `fixed inset-0 z-50` with a full backdrop |
| 7 | Pre-2021 Model S/X Tesla browser (older Chromium) fails on `requestFullscreen`, `requestVideoFrameCallback`, `showDirectoryPicker`, and Tailwind v4 features | No feature-detection layer |

After this refactor, the app should run identically on a modern desktop browser, a modern Tesla in-car browser, and an older Model S/X Tesla browser — with graceful degradation, not feature gating.

---

## 2. Non-Goals

- No new export formats. Existing snapshot/segment/event/report endpoints stay as-is.
- No Flutter or native-app changes.
- No video transcoding in the browser. The browser-side scanner produces a manifest from raw `.mp4` files; export still goes through the Python backend (which has ffmpeg).
- No re-skin. Existing color tokens, glass surfaces, and typography stay.
- No internationalization framework. UI is English.

---

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│  React App                                                      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  SourcePicker (modal)                                    │ │
│  │    ├── Choose Folder       → FSA API / webkitdirectory   │ │
│  │    ├── Enter Path          → POST /api/scan to backend   │ │
│  │    ├── Suggestions list    → GET /api/suggestions        │ │
│  │    └── Recent list         → localStorage history        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                              │                                  │
│             ┌────────────────┴─────────────────┐                │
│             ▼                                  ▼                │
│  ┌──────────────────────┐         ┌────────────────────────┐  │
│  │ Backend mode         │         │ Browser mode           │  │
│  │ (kind: 'backend')    │         │ (kind: 'browser-fsa'   │  │
│  │                      │         │  or 'browser-files')   │  │
│  │  api.manifest()      │         │  browserScanner()      │  │
│  │   → /api/manifest    │         │   → builds Manifest    │  │
│  │   → /media/* URLs    │         │     in memory          │  │
│  │                      │         │   → blob: URLs for     │  │
│  │                      │         │     <video> src        │  │
│  └──────────────────────┘         └────────────────────────┘  │
│             │                                  │                │
│             └────────────────┬─────────────────┘                │
│                              ▼                                  │
│              ┌──────────────────────────────┐                  │
│              │  Manifest in libraryStore     │                  │
│              │  (identical shape regardless  │                  │
│              │   of source)                  │                  │
│              └──────────────────────────────┘                  │
│                              │                                  │
│                              ▼                                  │
│              ┌──────────────────────────────┐                  │
│              │  VideoGrid (named grid areas) │                  │
│              │  PlayerSurface × N             │                  │
│              │  PlaybackControls              │                  │
│              │  Timelines / Inspector / etc.  │                  │
│              └──────────────────────────────┘                  │
└────────────────────────────────────────────────────────────────┘
```

**Key invariant:** `Manifest` shape is identical whether produced by backend or by browser scanner. Every downstream component is source-agnostic.

---

## 4. Component & Module Inventory

### New modules

| Path | Purpose |
|---|---|
| `src/components/SourcePicker.tsx` | Modal shown on first load and on demand. Three input methods + suggestions + recents. |
| `src/components/CellControls.tsx` | Per-tile control overlay (fullscreen, mute, focus). Appears on hover (mouse) and always-visible on touch. |
| `src/components/FullscreenChrome.tsx` | Floating control bar rendered into a portal while any element is fullscreen. Always shows an Exit button. |
| `src/utils/browserScanner.ts` | Walks a `FileSystemDirectoryHandle` (or `FileList` fallback) and returns the same `Manifest` shape the Python server returns. |
| `src/utils/capabilities.ts` | Runtime feature detection — `fileSystemAccess`, `webkitDirectory`, `fullscreen`, `webkitFullscreen`, `videoFrameCallback`, `pictureInPicture`, `containerQueries`. |
| `src/utils/fullscreen.ts` | Cross-browser `enter`, `exit`, `isFullscreen`, `onChange` wrappers — handles `webkit`-prefixed variants for older Tesla browsers. |
| `src/utils/sourceHistory.ts` | Read/write the localStorage recents list. |

### Modified modules

| Path | Change |
|---|---|
| `src/App.tsx` | Mount `SourcePicker` when `source` is null. Wire fullscreen state via `useFullscreen()` hook. |
| `src/api.ts` | Add `scan(root: string)`, `suggestions()`. Manifest endpoint takes optional `root` query param. |
| `src/stores/libraryStore.ts` | Replace single `load()` with source-aware loader. Add `source`, `setSource`, `clearSource`. Persist last source to localStorage. |
| `src/components/VideoGrid.tsx` | Replace four layout-specific components with a single grid whose `grid-template-areas` is driven by a `data-layout` attribute. Stable keys per camera. |
| `src/components/PlayerSurface.tsx` | Remove `isPrimary` from the src-loading `useEffect` dependency list — primary status now only affects the rAF time loop, not the video src. Mount `CellControls`. |
| `src/components/PlaybackControls.tsx` | Add a "Fullscreen" chip that fullscreens the `.video-grid` element. Add a "Change folder" affordance (delegated to Sidebar). |
| `src/components/TeslaPortraitLayout.tsx` | Replace `FullScreenOverlay` (full-screen drawer) with a side drawer that occupies ~80% width, leaving the live video visible at the edge. Always-visible mini transport bar at the top while a drawer is open. |
| `src/components/Sidebar.tsx` | Add a "Change folder" button next to the existing rescan icon. Open `SourcePicker`. |
| `src/components/EmptyState.tsx` | Replace the existing button with "Open a folder" → opens `SourcePicker`. |
| `server/server.py` | Add `POST /api/scan {root}` (changes the runtime root and re-scans). Add `GET /api/suggestions` (platform-aware scan, returns paths with TeslaCam structure). Make `--root` optional at startup — if absent, server boots with no root and answers `/api/health` only. |
| `src/index.css` | Add named-area grid-template definitions for the four layouts plus focus modes. |
| `vite.config.ts` | Lower build target from `es2019` to `es2017` for older Tesla Chromium. |

### Removed code

| Path | Reason |
|---|---|
| Inline duplicate layout components (`StudioLayout`, `TriptychLayout`, `TheaterLayout`, `MosaicLayout`, `FocusLayout`) in `VideoGrid.tsx` | Replaced by the single CSS-grid implementation. |
| Existing `FullScreenOverlay` styling in `TeslaPortraitLayout.tsx` | Replaced by side drawer. |

---

## 5. Detailed Designs

### 5.1 SourcePicker

The picker is the single entry point for choosing a folder. It opens:

1. Automatically when `libraryStore.source === null` (cold start with no remembered source).
2. When the user clicks "Change folder" in the Sidebar or in the empty state.

**Layout (single column, mobile-first):**

```
┌─ Open your dashcam folder ──────────────────┐
│                                              │
│  ┌─ Choose Folder ─────────────────────────┐│
│  │ Pick a folder from this device.         ││
│  │                                          ││
│  │ [ Choose Folder ]                       ││
│  └──────────────────────────────────────────┘│
│                                              │
│  ┌─ Enter a path ───────────────────────────┐│
│  │ /path/to/TeslaCam                       ││
│  │ [ Scan ]                                 ││
│  └──────────────────────────────────────────┘│
│                                              │
│  ┌─ Suggestions ───────────────────────────┐│
│  │ • ~/Downloads/TeslaCam                   ││
│  │ • /Volumes/USB_DRIVE/TeslaCam           ││
│  └──────────────────────────────────────────┘│
│                                              │
│  ┌─ Recent ─────────────────────────────────┐│
│  │ • Last opened folder name                ││
│  └──────────────────────────────────────────┘│
│                                              │
└──────────────────────────────────────────────┘
```

**Visibility rules (no hardcoded paths anywhere):**

| Section | Shown when |
|---|---|
| Choose Folder | `caps.fileSystemAccess` or `caps.webkitDirectory` is true |
| Enter a path | backend is reachable (`/api/health` returns 200) |
| Suggestions | backend is reachable AND `/api/suggestions` returns ≥1 path |
| Recent | localStorage history has ≥1 entry |

If none of those four sections is available (extremely degraded environment), the picker shows a single explanatory line: *"This browser can't open files directly and no backend is reachable. Run the included Python server on a machine on your network."*

**Interactions:**

- **Choose Folder**:
  - If `caps.fileSystemAccess`: `await window.showDirectoryPicker({ id: 'teslacam', mode: 'read' })` → store the handle.
  - Else (older Chromium / Tesla S/X): render a hidden `<input type="file" webkitdirectory multiple>` and trigger it. Resulting `FileList` is wrapped in a `browser-files` source.
  - On success: run `browserScanner`, populate `manifest`, close the picker.
- **Enter a path → Scan**:
  - `POST /api/scan { root }`. On success the backend changes its root and returns the new manifest. On error, the picker shows the message inline next to the field.
- **Suggestion click**: same as Enter a path with the suggested string.
- **Recent click**:
  - Backend recents: same as Enter a path.
  - Browser recents: FSA handles can be persisted by storing them in IndexedDB (via `indexedDB.open('teslacam-handles')`). On click, `await handle.requestPermission({ mode: 'read' })` then run scanner. If permission denied, fall back to Choose Folder.

### 5.2 browserScanner

`src/utils/browserScanner.ts` walks a directory (or a flat `FileList`) and returns a `Manifest` matching `src/types.ts`. It mimics the regex parsing in `server/server.py` exactly so downstream code can't tell the source apart.

**Inputs:**

```ts
type ScannerInput =
  | { kind: 'fsa'; handle: FileSystemDirectoryHandle }
  | { kind: 'files'; files: FileList };
```

**Process:**

1. Enumerate the three category folders (`RecentClips`, `SavedClips`, `SentryClips`). For FSA, walk children. For FileList, group files by their `webkitRelativePath` prefix.
2. For each event folder, read `event.json` if present (extracts `timestamp`, `city`, `est_lat`, `est_lon`, `reason`).
3. For each `.mp4` file, parse the timestamp/camera with the same regex used in `server.py` (`CLIP_NAME_RE`).
4. Group clips into minute-segments keyed by timestamp.
5. For each `File`, generate an `objectURL` via `URL.createObjectURL(file)` lazily — only when the segment is selected, to avoid pinning blob memory for clips the user never opens.
6. Build the same `Manifest` shape including `stats` (`total_minutes`, `saved_count`, `sentry_count`, `recent_count`).

**URL lifecycle:** Keep a `Map<videoId, string>` of generated object URLs. Revoke a URL when its segment leaves the visible set (i.e. when the user navigates to a different event). Persist no longer than the session.

**Limitations recorded in code comments, not user-facing:**

- `video.duration` is decoded by the browser on demand — we don't pre-compute it; we let `PlayerSurface` populate it when the video loads, exactly as it does for backend-served videos.
- Files served from `blob:` cannot be Range-requested by the user, but the browser still handles internal seeking against the local blob, so scrubbing works.

### 5.3 VideoGrid — named grid areas

A single flat tree of `PlayerSurface` components, arranged via CSS Grid named areas. Layout switching is purely a CSS swap.

**Render:**

```tsx
const CAMERAS_ORDER: CameraKind[] = [
  'front', 'left_repeater', 'right_repeater', 'back',
  'cabin', 'main', 'wide', 'narrow', 'fisheye',
];

return (
  <div
    className="video-grid"
    data-layout={focused ? 'focus' : layout}
    data-focused={focused ?? ''}
  >
    {CAMERAS_ORDER.filter(cam => segment.cameras[cam]).map(cam => (
      <PlayerSurface
        key={cam}                                  // stable per camera
        camera={cam}
        video={segment.cameras[cam]}
        isPrimary={cam === primary}
        style={{ gridArea: cam }}
        onFocus={() => toggleFocus(cam)}
      />
    ))}
  </div>
);
```

**CSS (added to `src/index.css`):**

```css
.video-grid { display: grid; gap: 4px; height: 100%; width: 100%; }

.video-grid[data-layout="studio"] {
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  grid-template-areas:
    "front left_repeater"
    "front right_repeater"
    "front back";
}
.video-grid[data-layout="triptych"] {
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr;
  grid-template-areas: "left_repeater front right_repeater";
}
.video-grid[data-layout="theater"] {
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 3fr 1fr;
  grid-template-areas:
    "front front front"
    "left_repeater back right_repeater";
}
.video-grid[data-layout="mosaic"] {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    "front left_repeater"
    "right_repeater back";
}

/* Focus mode — the focused camera fills 3/4 of the area, others tile below */
.video-grid[data-layout="focus"] {
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 3fr 1fr;
}
.video-grid[data-layout="focus"][data-focused="front"] {
  grid-template-areas:
    "front front front"
    "left_repeater back right_repeater";
}
.video-grid[data-layout="focus"][data-focused="left_repeater"] {
  grid-template-areas:
    "left_repeater left_repeater left_repeater"
    "front back right_repeater";
}
.video-grid[data-layout="focus"][data-focused="right_repeater"] {
  grid-template-areas:
    "right_repeater right_repeater right_repeater"
    "front left_repeater back";
}
.video-grid[data-layout="focus"][data-focused="back"] {
  grid-template-areas:
    "back back back"
    "front left_repeater right_repeater";
}
/* Remaining camera kinds (cabin, main, wide, narrow, fisheye) follow the
   same pattern; they fall back to a 2x2 grid when present without
   repeaters. The exhaustive list lives in src/index.css. */
```

**Why this fixes the bug:** PlayerSurface instances persist across layout changes because their position in the React tree never changes — only their `gridArea` style. The `<video>` element is never unmounted, so its `currentTime` and decode state are preserved.

**`isPrimary` is no longer a src-reload trigger.** The primary surface is the one driving `currentTime` updates to the store via rAF. Promoting/demoting between primary and slave is handled by a ref-based effect that starts/stops the rAF loop, without touching `el.src`.

### 5.4 PlayerSurface — per-cell controls

Each tile gets a `<CellControls />` overlay that appears in the top-right. On hover for mouse environments, always visible on touch environments (detected via `(hover: none) and (pointer: coarse)` media query).

**Controls:**

| Icon | Action |
|---|---|
| ⛶ Fullscreen | `enterFullscreen(videoEl)` — fullscreens just this camera. The global `FullscreenChrome` still renders the transport on top. |
| 🔊 / 🔇 | Per-cell audio. Only one cell can be unmuted at a time; clicking unmute on a different cell mutes the previous. The store gains `audioCamera: CameraKind \| null` (independent from the existing global `muted` flag — which gates whether *any* cell may play audio). When `audioCamera` is set and `muted` is false, exactly that cell's `<video>.muted = false`; all others stay muted. |
| ⊙ Focus | Toggles `playback.focused`. When this tile is the focused one, the icon flips to "↙ Exit focus" with a visible text label, so the escape from focus mode is always discoverable on the same tile the user entered from. |

The focus toggle button addresses defect #3: a user who clicked into focus mode now has a clearly-labeled escape hatch *on the same tile*.

### 5.5 Fullscreen — cross-browser, with chrome

`src/utils/fullscreen.ts` exposes:

```ts
enterFullscreen(el: HTMLElement): Promise<void>
exitFullscreen(): Promise<void>
isFullscreen(): boolean
onFullscreenChange(cb: () => void): () => void  // returns unsubscribe
```

All four use the standard API with `webkit`-prefixed fallbacks, matching the Tesla Model S/X Chromium build.

`FullscreenChrome.tsx` is rendered into `document.body` via a portal whenever `isFullscreen()` is true. It contains:

- Center-bottom: play/pause, prev/next clip, seek slider, time readout
- Top-right: **Exit fullscreen** button (large, labeled, not just an icon)
- ESC also exits but the on-screen button is the primary affordance for touch / Tesla environments.

The chrome is rendered *above* the fullscreen element so it stays visible. If the user fullscreened a single `<video>` tile, the chrome still controls the global playback store, so prev/next still work.

### 5.6 Drawer redesign for mobile and Tesla portrait

Current behavior:
```
[ FullScreenOverlay fixed inset-0 z-50 ]   ← obliterates the underlying view
```

New behavior:
```
┌──────────────────────────────────────┐
│  ── mini transport bar (sticky) ──   │
│    [⏯] [◀] seek ━━━━●━━━ [▶]  03:14   │  ← always interactive while drawer is open
├───────────────────┬──────────────────┤
│  drawer (≈80%)    │  edge (≈20%)     │
│                   │  ┌────────────┐  │
│  Library / Insp.  │  │ live video │  │
│                   │  │ thumbnail  │  │
│                   │  └────────────┘  │
│                   │  taps close drawer│
└───────────────────┴──────────────────┘
```

Implementation:
- `<DrawerLayout>` wraps the workspace and renders the drawer alongside it (CSS Grid with `grid-template-columns: 80% 20%` when open on tablet/Tesla portrait; `1fr 0` on narrow phones).
- Backdrop is removed. The user closes by either tapping the live-video edge thumbnail (which restores it to full size) or pressing the X button at the top of the drawer.
- On screens narrower than 480px, the drawer takes 100% width and the live video collapses into the sticky transport bar at top. The transport bar (≈48px tall) always shows: play/pause, prev/next clip, mini scrubber, time, and an X button to close the drawer.

### 5.7 Older Tesla compatibility

`src/utils/capabilities.ts` is the single source of truth. Every feature that has fallbacks consults it.

```ts
export const caps = {
  fileSystemAccess: typeof (window as any).showDirectoryPicker === 'function',
  webkitDirectory:  'webkitdirectory' in document.createElement('input'),
  fullscreen: !!(
    document.documentElement.requestFullscreen ||
    (document.documentElement as any).webkitRequestFullscreen
  ),
  videoFrameCallback: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
  pictureInPicture: 'pictureInPictureEnabled' in document,
  containerQueries: typeof CSS !== 'undefined' && CSS.supports?.('container-type: inline-size'),
};
```

**Tailwind v4 concern:** Tailwind v4 emits CSS using `@layer` and `:where()` heavily, both supported in Chromium ≥ 75. The Model S/X Chromium fork (around Chromium 79 on MCU2) supports both. `caps.containerQueries` is read only to gate a future opt-in enhancement — the structural layout in this refactor uses ordinary media queries and the named grid areas above, which work in Chromium 79. We track the capability so a later change can promote some elements to container queries without re-introducing a feature-detection pass.

**Build target:** `vite.config.ts` is changed from `target: 'es2019'` to `target: 'es2017'`. Verified compatible with Chromium 79+.

**`requestVideoFrameCallback` fallback** already exists in `PlayerSurface.tsx` (a `setTimeout(resolve, 100)` race). We keep it.

### 5.8 Backend changes

`server/server.py`:

```python
# New: GET /api/suggestions  →  {"paths": ["...", ...]}
def find_suggestions() -> list[str]:
    candidates: list[Path] = []
    if sys.platform == 'darwin':
        candidates.append(Path.home() / 'Downloads' / 'TeslaCam')
        candidates.extend(Path('/Volumes').glob('*/TeslaCam'))
    elif sys.platform == 'win32':
        candidates.append(Path.home() / 'Downloads' / 'TeslaCam')
        for letter in 'DEFGHIJKLMNOPQRSTUVWXYZ':
            candidates.append(Path(f'{letter}:\\TeslaCam'))
    elif sys.platform.startswith('linux'):
        candidates.append(Path.home() / 'Downloads' / 'TeslaCam')
        for base in (Path('/media'), Path('/mnt'), Path('/run/media')):
            if base.exists():
                for one in base.iterdir():
                    candidates.append(one / 'TeslaCam')
                    if one.is_dir():
                        for two in one.iterdir():
                            candidates.append(two / 'TeslaCam')
    seen, out = set(), []
    for p in candidates:
        try:
            r = p.resolve()
        except OSError:
            continue
        if r in seen or not r.exists() or not r.is_dir():
            continue
        if not any((r / sub).exists() for sub in ('RecentClips', 'SavedClips', 'SentryClips')):
            continue
        seen.add(r); out.append(str(r))
    return out

# New: POST /api/scan {"root": "/path"}  →  {"ok": True} or {"error": "..."}
# Changes the in-memory root and returns 200; the next /api/manifest reflects the new root.
```

The handler factory currently closes over `root` (`make_handler(root)`). It is changed to close over a mutable `state` dict so `/api/scan` can update `state['root']` atomically. Other endpoints read `state['root']` per request.

`--root` becomes optional. If unset, the server still binds and answers `/api/health` with `{ok: True, root: null}`. `/api/manifest` returns `{events: [], stats: {...zeros}}` with `204` semantics until `/api/scan` is called.

### 5.9 LocalStorage schema

```
teslacam.source            = JSON.stringify(source)        // last source, restored on reload
teslacam.history           = JSON.stringify(SourceRef[])   // up to 8 most recent, MRU
teslacam.history.fsaIndex  = IndexedDB(name='teslacam-handles') maps id→FileSystemDirectoryHandle
```

`SourceRef` is `{ id: string, kind: 'backend'|'browser-fsa'|'browser-files', label: string, lastUsed: string }`. For browser-fsa, the actual handle lives in IndexedDB and `id` is the lookup key.

---

## 6. Data Flow Examples

### 6.1 Cold start, FSA-capable Mac browser, backend running on localhost

1. App boots. `libraryStore.source` is null. `SourcePicker` opens.
2. Picker queries `/api/health` (succeeds), `/api/suggestions` (returns `~/Downloads/TeslaCam` if present).
3. User clicks the suggestion. `POST /api/scan { root: "~/Downloads/TeslaCam" }`. Backend updates root, returns 200.
4. Picker writes `{ kind: 'backend', root: ... }` to `libraryStore.source` and to localStorage.
5. `libraryStore.load()` fires → `api.manifest()` → renders.

### 6.2 Cold start, Tesla S/X (older Chromium, no FSA, no backend reachable)

1. App boots. `SourcePicker` opens.
2. `/api/health` errors. Suggestions section hidden. Enter-path section hidden.
3. `caps.webkitDirectory === true`. "Choose Folder" section is shown using the legacy `<input>`.
4. User selects the USB stick's root in the file picker. Browser hands over a `FileList` rooted at `TeslaCam`.
5. `browserScanner` builds a manifest in memory. `libraryStore.source = { kind: 'browser-files', ... }`.
6. UI renders. Export and snapshot buttons are disabled with a tooltip "Requires a backend".

### 6.3 Layout switch mid-playback

1. User is watching at `t = 23.4s` in the studio layout, front camera primary.
2. User picks "Theater" from the layout menu. `playback.setLayout('theater')`.
3. `VideoGrid` re-renders with `data-layout="theater"`. CSS updates `grid-template-areas`.
4. PlayerSurface instances do not unmount. Each video keeps decoding. `t` continues uninterrupted.

### 6.4 Per-cell fullscreen on Tesla S/X

1. User taps the ⛶ button on the front camera tile.
2. `enterFullscreen(videoEl)` calls `webkitRequestFullscreen` because the standard `requestFullscreen` is absent.
3. `onFullscreenChange` fires → `FullscreenChrome` mounts via portal.
4. Chrome renders play/pause and an "Exit fullscreen" button at top-right.
5. User taps "Exit fullscreen" → `exitFullscreen()` → portal unmounts.

---

## 7. Error Handling

| Failure | Behavior |
|---|---|
| `/api/health` unreachable | Hide backend-dependent sections. Show no error to user (offline mode is valid). |
| `/api/scan` returns non-200 | Show inline error under the path field with the server message. |
| `showDirectoryPicker` rejected by user | No-op; picker stays open. |
| `FileSystemDirectoryHandle.requestPermission` denied on a recent FSA item | Surface a single-line "Permission denied — please reselect" and offer the Choose Folder button. |
| `browserScanner` finds no `.mp4` clips matching `CLIP_NAME_RE` | Manifest with empty events. UI shows the existing "No matching events." empty state. |
| `enterFullscreen` rejected (insecure context, sandboxing) | Toast: "Fullscreen unavailable in this browser." Mute by setting `isFullscreen` back to false. |
| Export action triggered while in browser-only source | Button is disabled at render time with tooltip explanation. No request is fired. |

---

## 8. Testing Notes

This refactor must not regress the desktop browser experience. Manual verification checklist (no automated UI tests exist in this repo today and we are not adding the framework as part of this change):

1. Desktop Chrome 120+, backend running on localhost — cold start lands on SourcePicker. Suggestions populated. Backend mode works. Layout switching is glitch-free. Fullscreen exits cleanly via the on-screen button. Per-cell fullscreen on each of the four cameras.
2. Desktop Chrome 120+, backend off — only Choose Folder is shown. Folder selection produces a working session with disabled export buttons.
3. Safari 17 — Choose Folder falls back to `<input webkitdirectory>` (Safari has no FSA). Manifest builds. Playback works.
4. Tesla MCU2 (or a Chromium 79 build via puppeteer locally) — Choose Folder uses webkitdirectory. Fullscreen works via `webkit*` prefix. Layout switching is glitch-free.
5. Tesla portrait mode (already detected via UA) — drawer side-slides; transport bar always visible; video keeps playing while drawer is open.
6. Layout switching during playback at `t > 30s`: confirm playback position is preserved within ±100ms.

---

## 9. Migration & Rollout

The change is large but committable in one branch because the public surface (Manifest shape, API URLs, video element behavior) is unchanged. The user-facing behavioral change is the addition of the SourcePicker. No data migration is required; the localStorage keys are new and start empty.

The branch can be merged once the manual checklist above is satisfied. There is no remote staging environment.

---

## 10. Open Questions

None. Every section above is fully specified.
