#!/usr/bin/env python3
"""
TeslaCam Studio — local backend.

Responsibilities:
 - Scan a TeslaCam root (RecentClips / SavedClips / SentryClips) that may be
   set at startup with --root, changed at runtime via POST /api/scan, or left
   unset (in which case /api/manifest returns an empty manifest).
 - Suggest likely TeslaCam locations on this machine (GET /api/suggestions),
   platform-aware: macOS scans /Volumes; Windows scans drive letters; Linux
   scans /media, /mnt, /run/media.
 - Serve videos with HTTP Range requests (instant seek, no full download)
 - Expose JSON manifests grouped by event/segment with metadata + GPS
 - Accept snapshot uploads from the browser canvas
 - Export entire events / single segments as a folder on Desktop
 - Produce a Markdown incident report

Designed to bind to 0.0.0.0 so a Tesla browser on the same WiFi can hit it.
"""

import argparse
import json
import os
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import threading
import urllib.parse
from base64 import b64decode
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from pathlib import Path

CLIP_NAME_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2}[_ -]\d{2}[-:]\d{2}[-:]\d{2})[-_ ]"
    r"(front|left_repeater|right_repeater|back|rear|cabin|main|wide|narrow|fisheye)\.(?:mp4|mov|m4v)$",
    re.IGNORECASE,
)

CAMERA_ALIASES = {
    "rear": "back",
    "back": "back",
    "front": "front",
    "left_repeater": "left_repeater",
    "right_repeater": "right_repeater",
    "cabin": "cabin",
    "main": "main",
    "wide": "wide",
    "narrow": "narrow",
    "fisheye": "fisheye",
}

REASON_LABELS = {
    "sentry_aware_object_detection": "Sentry · object detection",
    "sentry_aware_accel_primary": "Sentry · impact",
    "user_interaction_honk": "Honk save",
    "user_interaction_dashcam_panel_save": "Manual save",
    "user_interaction_dashcam_icon_tapped": "Manual save (icon)",
}

ROOT_DIR_ENV = "TESLACAM_ROOT"
DEFAULT_PORT = 8787

# Mutable shared state. The handler reads root from here per request, so
# POST /api/scan can swap it atomically.
_state_lock = threading.Lock()
_state: dict = {"root": None}


def _has_tesla_structure(path: Path) -> bool:
    if not path.is_dir():
        return False
    return any((path / sub).exists() for sub in ("RecentClips", "SavedClips", "SentryClips"))


def find_suggestions() -> list[str]:
    """Return a list of candidate TeslaCam directory paths discovered on this
    machine. Platform-aware. Never hardcodes user-specific paths in the
    repository; only walks the well-known OS mount points."""
    candidates: list[Path] = []

    if sys.platform == "darwin":
        candidates.append(Path.home() / "Downloads" / "TeslaCam")
        candidates.append(Path.home() / "Movies" / "TeslaCam")
        vols = Path("/Volumes")
        if vols.is_dir():
            try:
                for vol in vols.iterdir():
                    candidates.append(vol / "TeslaCam")
            except OSError:
                pass
    elif sys.platform == "win32":
        candidates.append(Path.home() / "Downloads" / "TeslaCam")
        candidates.append(Path.home() / "Videos" / "TeslaCam")
        for letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
            candidates.append(Path(f"{letter}:\\TeslaCam"))
            candidates.append(Path(f"{letter}:\\"))
    else:  # linux, *bsd, etc.
        candidates.append(Path.home() / "Downloads" / "TeslaCam")
        candidates.append(Path.home() / "Videos" / "TeslaCam")
        for base in (Path("/media"), Path("/mnt"), Path("/run/media")):
            if not base.is_dir():
                continue
            try:
                for one in base.iterdir():
                    candidates.append(one / "TeslaCam")
                    if one.is_dir():
                        try:
                            for two in one.iterdir():
                                candidates.append(two / "TeslaCam")
                        except OSError:
                            pass
            except OSError:
                pass

    seen: set[Path] = set()
    out: list[str] = []
    for p in candidates:
        try:
            r = p.resolve()
        except OSError:
            continue
        if r in seen:
            continue
        seen.add(r)
        if _has_tesla_structure(r):
            out.append(str(r))
    return out


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

def parse_clip_name(name: str):
    m = CLIP_NAME_RE.match(name)
    if not m:
        return None
    ts_raw, cam_raw = m.groups()
    norm = re.sub(r"[_: ]", "-", ts_raw)
    parts = norm.split("-")
    if len(parts) != 6:
        return None
    iso = f"{parts[0]}-{parts[1]}-{parts[2]}T{parts[3]}:{parts[4]}:{parts[5]}"
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return None
    return {
        "timestamp": dt.isoformat(),
        "ts_key": dt.strftime("%Y-%m-%d_%H-%M-%S"),
        "camera": CAMERA_ALIASES.get(cam_raw.lower(), cam_raw.lower()),
    }


def load_event_json(folder: Path):
    j = folder / "event.json"
    if not j.exists():
        return {}
    try:
        return json.loads(j.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def to_float(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def collect_minutes(files, base_dir: Path):
    minutes = {}
    for f in files:
        meta = parse_clip_name(f.name)
        if not meta:
            continue
        key = meta["ts_key"]
        bucket = minutes.setdefault(key, {
            "id": key,
            "timestamp": meta["timestamp"],
            "ts_key": key,
            "cameras": {},
        })
        try:
            size = f.stat().st_size
        except OSError:
            size = 0
        rel = f.relative_to(base_dir).as_posix()
        bucket["cameras"][meta["camera"]] = {
            "url": "/media/" + urllib.parse.quote(rel),
            "size": size,
            "name": f.name,
        }
    return sorted(minutes.values(), key=lambda m: m["timestamp"])


def _make_title(category, metadata, minutes):
    first_dt = datetime.fromisoformat(minutes[0]["timestamp"])
    last_dt = datetime.fromisoformat(minutes[-1]["timestamp"])
    city = metadata.get("city") or metadata.get("est_city") or ""
    when = first_dt.strftime("%d %b %Y · %H:%M")
    end_time = last_dt.strftime("%H:%M")
    base = f"{when}–{end_time}" if len(minutes) > 1 else when
    if city:
        return f"{city} · {base}"
    return f"{category} · {base}"


def make_event_from_folder(folder: Path, category: str, base_dir: Path):
    metadata = load_event_json(folder)
    minutes = collect_minutes(sorted(folder.glob("*.mp4"), key=lambda p: p.name), base_dir)
    if not minutes:
        return None

    reason = metadata.get("reason", "")
    return {
        "id": f"{category}/{folder.name}",
        "category": category,
        "folder": folder.name,
        "title": _make_title(category, metadata, minutes),
        "timestamp": metadata.get("timestamp") or minutes[0]["timestamp"],
        "first_clip": minutes[0]["ts_key"],
        "city": metadata.get("city") or metadata.get("est_city") or "",
        "lat": to_float(metadata.get("est_lat") or metadata.get("latitude") or metadata.get("lat")),
        "lon": to_float(metadata.get("est_lon") or metadata.get("longitude") or metadata.get("lon")),
        "reason": reason,
        "reason_label": REASON_LABELS.get(reason, reason.replace("_", " ") if reason else ""),
        "trigger_camera": str(metadata.get("camera", "")),
        "minute_count": len(minutes),
        "minutes": minutes,
        "raw_metadata": metadata,
    }


def scan_recent(base_dir: Path):
    folder = base_dir / "RecentClips"
    if not folder.exists():
        return []
    minutes = collect_minutes(sorted(folder.glob("*.mp4"), key=lambda p: p.name), base_dir)
    if not minutes:
        return []

    groups = []
    current = [minutes[0]]
    for m in minutes[1:]:
        prev = datetime.fromisoformat(current[-1]["timestamp"])
        cur = datetime.fromisoformat(m["timestamp"])
        if (cur - prev).total_seconds() > 125:
            groups.append(current)
            current = []
        current.append(m)
    if current:
        groups.append(current)

    return [{
        "id": f"RecentClips/auto-{i}",
        "category": "RecentClips",
        "folder": "RecentClips",
        "title": _make_title("Recent", {}, g),
        "timestamp": g[0]["timestamp"],
        "first_clip": g[0]["ts_key"],
        "city": "",
        "lat": None,
        "lon": None,
        "reason": "recent",
        "reason_label": "Continuous recording",
        "trigger_camera": "",
        "minute_count": len(g),
        "minutes": g,
        "raw_metadata": {},
    } for i, g in enumerate(groups)]


def _empty_manifest():
    return {
        "root": "",
        "events": [],
        "stats": {
            "saved_count": 0,
            "sentry_count": 0,
            "recent_count": 0,
            "total_minutes": 0,
        },
        "generated_at": datetime.now().isoformat(),
    }


def scan_root(base_dir):
    if base_dir is None:
        return _empty_manifest()
    base_dir = Path(base_dir)
    if not base_dir.is_dir():
        return _empty_manifest()

    events = []
    saved = base_dir / "SavedClips"
    if saved.exists():
        for folder in sorted(saved.iterdir()):
            if folder.is_dir():
                ev = make_event_from_folder(folder, "SavedClips", base_dir)
                if ev:
                    events.append(ev)

    sentry = base_dir / "SentryClips"
    if sentry.exists():
        for folder in sorted(sentry.iterdir()):
            if folder.is_dir():
                ev = make_event_from_folder(folder, "SentryClips", base_dir)
                if ev:
                    events.append(ev)

    events.extend(scan_recent(base_dir))
    events.sort(key=lambda e: e["timestamp"], reverse=True)

    return {
        "root": str(base_dir),
        "events": events,
        "stats": {
            "saved_count": sum(1 for e in events if e["category"] == "SavedClips"),
            "sentry_count": sum(1 for e in events if e["category"] == "SentryClips"),
            "recent_count": sum(1 for e in events if e["category"] == "RecentClips"),
            "total_minutes": sum(e["minute_count"] for e in events),
        },
        "generated_at": datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# Safe OS commands (no shell)
# ---------------------------------------------------------------------------

def reveal_in_file_manager(path: Path) -> None:
    if not path.exists():
        return
    if sys.platform == "darwin":
        subprocess.run(["open", "-R", str(path)], check=False)
    elif os.name == "nt":
        subprocess.run(["explorer", "/select,", str(path)], check=False)
    else:
        subprocess.run(["xdg-open", str(path.parent)], check=False)


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class TeslaCamHandler(BaseHTTPRequestHandler):
    server_version = "TeslaCamStudio/1.0"

    @property
    def base_dir(self):
        with _state_lock:
            return _state["root"]

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._dispatch(body=True)

    def do_HEAD(self):
        self._dispatch(body=False)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except json.JSONDecodeError:
            return self._json({"error": "bad json"}, status=400)

        try:
            if path == "/api/scan":
                return self._handle_scan(payload)
            if path == "/api/export/snapshot":
                return self._handle_snapshot(payload)
            if path == "/api/export/segment":
                return self._handle_export_segment(payload)
            if path == "/api/export/event":
                return self._handle_export_event(payload)
            if path == "/api/export/report":
                return self._handle_export_report(payload)
            if path == "/api/reveal":
                return self._handle_reveal(payload)
        except Exception as exc:  # noqa: BLE001
            return self._json({"error": str(exc)}, status=500)

        self._json({"error": "not found"}, status=404)

    def _dispatch(self, body: bool):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            root = self.base_dir
            return self._json({"ok": True, "root": str(root) if root else None}, body=body)

        if path == "/api/suggestions":
            return self._json({"paths": find_suggestions()}, body=body)

        if path == "/api/manifest":
            return self._json(scan_root(self.base_dir), body=body)

        if path.startswith("/media/"):
            rel = urllib.parse.unquote(path[len("/media/"):])
            return self._serve_media(rel, body=body)

        self.send_response(404)
        self._cors()
        self.end_headers()

    def _json(self, payload, status=200, body=True):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()
        if body:
            self.wfile.write(data)

    def _require_root(self) -> Path:
        root = self.base_dir
        if not root:
            raise ValueError("No folder selected. Call /api/scan with a root first.")
        return Path(root)

    def _safe_resolve(self, rel: str) -> Path:
        root = self._require_root()
        target = (root / rel).resolve()
        target.relative_to(root.resolve())  # raises if outside
        return target

    def _serve_media(self, rel_path: str, body: bool):
        if not self.base_dir:
            self.send_response(404); self._cors(); self.end_headers(); return
        try:
            safe = self._safe_resolve(rel_path)
        except (ValueError, OSError):
            self.send_response(403); self._cors(); self.end_headers(); return
        if not safe.is_file():
            self.send_response(404); self._cors(); self.end_headers(); return

        size = safe.stat().st_size
        ctype = "video/mp4"
        rng = self.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                start = int(m.group(1)) if m.group(1) else 0
                end = int(m.group(2)) if m.group(2) else size - 1
                end = min(end, size - 1)
                length = end - start + 1
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(length))
                self.send_header("Cache-Control", "public, max-age=3600")
                self._cors()
                self.end_headers()
                if not body:
                    return
                with open(safe, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk = f.read(min(65536, remaining))
                        if not chunk:
                            break
                        try:
                            self.wfile.write(chunk)
                        except (BrokenPipeError, ConnectionResetError):
                            return
                        remaining -= len(chunk)
                return

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "public, max-age=3600")
        self._cors()
        self.end_headers()
        if not body:
            return
        with open(safe, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return

    # -----------------------------------------------------------------
    # POST handlers
    # -----------------------------------------------------------------

    def _handle_scan(self, payload):
        root = payload.get("root")
        if not isinstance(root, str) or not root.strip():
            raise ValueError("Missing 'root'")
        candidate = Path(root).expanduser()
        try:
            resolved = candidate.resolve()
        except OSError as exc:
            raise ValueError(f"Cannot resolve path: {exc}") from None
        if not resolved.exists():
            raise ValueError("Path does not exist")
        if not resolved.is_dir():
            raise ValueError("Not a directory")
        if not _has_tesla_structure(resolved):
            raise ValueError(
                "Folder doesn't look like a TeslaCam root "
                "(no RecentClips, SavedClips, or SentryClips subfolder)"
            )
        with _state_lock:
            _state["root"] = resolved
        self._json({"ok": True, "root": str(resolved)})

    @staticmethod
    def _desktop() -> Path:
        return Path.home() / "Desktop"

    @staticmethod
    def _safe(name: str) -> str:
        for ch in '/\\:?%*|"<>':
            name = name.replace(ch, "-")
        return name.strip() or "untitled"

    def _handle_snapshot(self, payload):
        event_title = payload.get("event_title", "snapshot")
        timestamp = payload.get("timestamp") or datetime.now().isoformat()
        camera = payload.get("camera", "cam")
        data_url = payload.get("data_url", "")
        if "," not in data_url:
            raise ValueError("Missing image data")
        header, b64 = data_url.split(",", 1)
        if "png" not in header and "jpeg" not in header:
            raise ValueError("Unsupported image type")
        ext = "png" if "png" in header else "jpg"

        folder = self._desktop() / "TeslaCamSnapshots" / self._safe(event_title)
        folder.mkdir(parents=True, exist_ok=True)
        try:
            stamp = datetime.fromisoformat(timestamp).strftime("%Y-%m-%d_%H-%M-%S")
        except ValueError:
            stamp = "frame"
        path = folder / f"{stamp}-{self._safe(camera)}.{ext}"
        path.write_bytes(b64decode(b64))
        self._json({"ok": True, "path": str(path)})

    def _handle_export_event(self, payload):
        event_id = payload.get("event_id", "")
        if not event_id or "/" not in event_id:
            raise ValueError("Bad event_id")
        category, folder_name = event_id.split("/", 1)
        if category == "RecentClips":
            return self._export_recent_event(payload)
        if not re.match(r"^[A-Za-z0-9._\- ]+$", folder_name):
            raise ValueError("Invalid folder name")
        if category not in {"SavedClips", "SentryClips"}:
            raise ValueError("Invalid category")
        root = self._require_root()
        src = root / category / folder_name
        if not src.is_dir():
            raise ValueError("Event folder missing")

        dest = self._desktop() / "TeslaCamExports" / self._safe(folder_name)
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
        self._json({"ok": True, "path": str(dest)})

    def _export_recent_event(self, payload):
        minutes = payload.get("minutes", [])
        title = self._safe(payload.get("event_title", "recent"))
        dest = self._desktop() / "TeslaCamExports" / title
        dest.mkdir(parents=True, exist_ok=True)
        for minute in minutes:
            for cam, info in minute.get("cameras", {}).items():
                rel = info.get("url", "").replace("/media/", "")
                rel = urllib.parse.unquote(rel)
                try:
                    src = self._safe_resolve(rel)
                except (ValueError, OSError):
                    continue
                if src.is_file():
                    shutil.copy2(src, dest / src.name)
        self._json({"ok": True, "path": str(dest)})

    def _handle_export_segment(self, payload):
        minute = payload.get("minute", {})
        event_title = self._safe(payload.get("event_title", "segment"))
        ts = minute.get("ts_key") or datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        dest = self._desktop() / "TeslaCamExports" / event_title / f"Segment-{ts}"
        dest.mkdir(parents=True, exist_ok=True)
        for cam, info in minute.get("cameras", {}).items():
            rel = info.get("url", "").replace("/media/", "")
            rel = urllib.parse.unquote(rel)
            try:
                src = self._safe_resolve(rel)
            except (ValueError, OSError):
                continue
            if src.is_file():
                shutil.copy2(src, dest / src.name)
        self._json({"ok": True, "path": str(dest)})

    def _handle_export_report(self, payload):
        event = payload.get("event", {})
        if not event:
            raise ValueError("No event payload")
        title = event.get("title") or event.get("folder") or "event"
        dest = self._desktop() / "TeslaCamReports"
        dest.mkdir(parents=True, exist_ok=True)
        path = dest / f"{self._safe(title)}.md"

        lines = [
            "# TeslaCam Incident Report",
            "",
            f"- Event: {title}",
            f"- Category: {event.get('category', '—')}",
            f"- Time: {event.get('timestamp', '—')}",
            f"- Segments: {event.get('minute_count', 0)}",
            f"- Source folder: `{event.get('folder', '')}`",
        ]
        if event.get("city"):
            lines.append(f"- City: {event['city']}")
        if event.get("reason_label"):
            lines.append(f"- Reason: {event['reason_label']}")
        lat, lon = event.get("lat"), event.get("lon")
        if lat is not None and lon is not None:
            lines.append(f"- Coordinates: {lat}, {lon}")
            lines.append(f"- Apple Maps: https://maps.apple.com/?ll={lat},{lon}")
            lines.append(f"- Google Maps: https://maps.google.com/?q={lat},{lon}")
        rng = payload.get("range") or {}
        if rng.get("start") is not None:
            lines.append("")
            lines.append("## Range markers")
            lines.append(f"- In:  {rng.get('start')}")
            lines.append(f"- Out: {rng.get('end')}")
        lines.append("")
        lines.append("## Segments")
        for m in event.get("minutes", []):
            cams = ", ".join(sorted(m.get("cameras", {}).keys()))
            lines.append(f"- `{m.get('ts_key')}` — {cams}")

        path.write_text("\n".join(lines), encoding="utf-8")
        self._json({"ok": True, "path": str(path)})

    def _handle_reveal(self, payload):
        rel = payload.get("rel_path", "")
        try:
            target = self._safe_resolve(rel)
        except (ValueError, OSError):
            raise ValueError("Forbidden path") from None
        reveal_in_file_manager(target)
        self._json({"ok": True})


# ---------------------------------------------------------------------------
# Server bootstrap
# ---------------------------------------------------------------------------

class ThreadedServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def find_free_port(preferred: int):
    for port in [preferred] + list(range(preferred + 1, preferred + 50)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue
    return preferred


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    parser = argparse.ArgumentParser(description="TeslaCam Studio backend")
    parser.add_argument(
        "--root", type=Path, default=None,
        help="TeslaCam root folder (optional; can be set later via POST /api/scan)",
    )
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", DEFAULT_PORT)))
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    env_root = os.environ.get(ROOT_DIR_ENV)
    initial_root = args.root or (Path(env_root) if env_root else None)

    if initial_root is not None:
        try:
            resolved = initial_root.resolve()
        except OSError:
            resolved = None
        if resolved and resolved.exists() and _has_tesla_structure(resolved):
            with _state_lock:
                _state["root"] = resolved
        else:
            print(
                f"⚠  Initial root {initial_root} not usable; starting without a root. "
                f"Use POST /api/scan to set one.",
                file=sys.stderr,
            )

    port = find_free_port(args.port)
    httpd = ThreadedServer((args.host, port), TeslaCamHandler)
    local_ip = get_local_ip()
    current_root = _state["root"]
    print("\n  🛰  TeslaCam Studio backend\n  ──────────────────────────")
    print(f"  Root:    {current_root or '(unset — pick one in the app)'}")
    print(f"  Listen:  http://{args.host}:{port}/")
    print(f"  LAN:     http://{local_ip}:{port}/  ← reachable from Tesla browser on same WiFi")
    print("  Press Ctrl+C to stop\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down…")
        httpd.shutdown()


if __name__ == "__main__":
    main()
