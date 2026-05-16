#!/usr/bin/env python3
"""
TeslaCam Viewer - Local HTTP server
Scans TeslaCam folder structure and serves both API + videos + frontend.
"""

import json
import os
import re
import sys
import socket
import socketserver
import urllib.parse
import webbrowser
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
VIEWER_DIR = Path(__file__).resolve().parent

CLIP_NAME_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-(front|left_repeater|right_repeater|back)\.mp4$"
)

CAMERA_ORDER = ["front", "left_repeater", "right_repeater", "back"]

REASON_LABELS = {
    "sentry_aware_object_detection": "Sentry: Hareket algılandı",
    "sentry_aware_accel_primary": "Sentry: Sarsıntı algılandı",
    "user_interaction_honk": "Korna çaldı",
    "user_interaction_dashcam_panel_save": "Manuel kayıt",
    "user_interaction_dashcam_icon_tapped": "Manuel kayıt (ikon)",
}


def parse_event_folder(folder: Path, category: str):
    """Parse a single event folder and return its metadata."""
    event_json = folder / "event.json"
    metadata = {}
    if event_json.exists():
        try:
            metadata = json.loads(event_json.read_text())
        except json.JSONDecodeError:
            metadata = {}

    minutes = {}
    for mp4 in folder.glob("*.mp4"):
        m = CLIP_NAME_RE.match(mp4.name)
        if not m:
            continue
        ts_str, cam = m.groups()
        if ts_str not in minutes:
            minutes[ts_str] = {"timestamp": ts_str, "cameras": {}}
        try:
            size = mp4.stat().st_size
        except OSError:
            size = 0
        rel = mp4.relative_to(BASE_DIR).as_posix()
        minutes[ts_str]["cameras"][cam] = {
            "url": "/media/" + rel,
            "size": size,
        }

    minute_list = sorted(minutes.values(), key=lambda m: m["timestamp"])
    if not minute_list:
        return None

    first_ts = minute_list[0]["timestamp"]
    duration_minutes = len(minute_list)

    reason = metadata.get("reason", "")
    return {
        "id": f"{category}/{folder.name}",
        "category": category,
        "folder": folder.name,
        "timestamp": metadata.get("timestamp", _ts_to_iso(first_ts)),
        "first_clip": first_ts,
        "city": metadata.get("city", ""),
        "lat": _to_float(metadata.get("est_lat")),
        "lon": _to_float(metadata.get("est_lon")),
        "reason": reason,
        "reason_label": REASON_LABELS.get(reason, reason or "Bilinmiyor"),
        "trigger_camera": metadata.get("camera", ""),
        "minute_count": duration_minutes,
        "minutes": minute_list,
    }


def _ts_to_iso(ts: str) -> str:
    """Convert 'YYYY-MM-DD_HH-MM-SS' to ISO string."""
    try:
        dt = datetime.strptime(ts, "%Y-%m-%d_%H-%M-%S")
        return dt.isoformat()
    except ValueError:
        return ts


def _to_float(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def scan_recent_clips():
    """Recent clips are not folder-based - they're flat files."""
    folder = BASE_DIR / "RecentClips"
    if not folder.exists():
        return []
    minutes = {}
    for mp4 in folder.glob("*.mp4"):
        m = CLIP_NAME_RE.match(mp4.name)
        if not m:
            continue
        ts_str, cam = m.groups()
        if ts_str not in minutes:
            minutes[ts_str] = {"timestamp": ts_str, "cameras": {}}
        try:
            size = mp4.stat().st_size
        except OSError:
            size = 0
        rel = mp4.relative_to(BASE_DIR).as_posix()
        minutes[ts_str]["cameras"][cam] = {
            "url": "/media/" + rel,
            "size": size,
        }
    return sorted(minutes.values(), key=lambda m: m["timestamp"])


def scan_all():
    """Scan all TeslaCam folders and return manifest."""
    events = []

    saved_dir = BASE_DIR / "SavedClips"
    if saved_dir.exists():
        for folder in sorted(saved_dir.iterdir()):
            if folder.is_dir():
                ev = parse_event_folder(folder, "SavedClips")
                if ev:
                    events.append(ev)

    sentry_dir = BASE_DIR / "SentryClips"
    if sentry_dir.exists():
        for folder in sorted(sentry_dir.iterdir()):
            if folder.is_dir():
                ev = parse_event_folder(folder, "SentryClips")
                if ev:
                    events.append(ev)

    events.sort(key=lambda e: e["timestamp"], reverse=True)

    recent = scan_recent_clips()

    return {
        "base_dir": str(BASE_DIR),
        "events": events,
        "recent": recent,
        "stats": {
            "saved_count": sum(1 for e in events if e["category"] == "SavedClips"),
            "sentry_count": sum(1 for e in events if e["category"] == "SentryClips"),
            "recent_count": len(recent),
        },
        "generated_at": datetime.now().isoformat(),
    }


class TeslaCamHandler(SimpleHTTPRequestHandler):
    """HTTP handler with API endpoints + media serving."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(VIEWER_DIR), **kwargs)

    def log_message(self, format, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

    def do_GET(self):
        return self._dispatch(serve_body=True)

    def do_HEAD(self):
        return self._dispatch(serve_body=False)

    def _dispatch(self, serve_body=True):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/manifest":
            return self._serve_json(scan_all(), body=serve_body)

        if path == "/api/health":
            return self._serve_json({"ok": True, "base": str(BASE_DIR)}, body=serve_body)

        if path.startswith("/media/"):
            rel = urllib.parse.unquote(path[len("/media/"):])
            return self._serve_media(rel, body=serve_body)

        if path == "/" or path == "":
            self.path = "/index.html"

        return super().do_GET() if serve_body else super().do_HEAD()

    def _serve_json(self, payload, body=True):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if body:
            self.wfile.write(data)

    def _serve_media(self, rel_path: str, body=True):
        """Serve video file with HTTP Range request support."""
        safe = (BASE_DIR / rel_path).resolve()
        try:
            safe.relative_to(BASE_DIR.resolve())
        except ValueError:
            self.send_error(403, "Forbidden")
            return
        if not safe.exists() or not safe.is_file():
            self.send_error(404, "Not found")
            return

        size = safe.stat().st_size
        range_header = self.headers.get("Range")
        ctype = "video/mp4" if safe.suffix.lower() == ".mp4" else "application/octet-stream"

        if range_header:
            m = re.match(r"bytes=(\d*)-(\d*)", range_header)
            if m:
                start = int(m.group(1)) if m.group(1) else 0
                end = int(m.group(2)) if m.group(2) else size - 1
                end = min(end, size - 1)
                length = end - start + 1
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Content-Length", str(length))
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


class ThreadedServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def find_free_port(preferred=8765):
    for port in [preferred] + list(range(8766, 8800)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return preferred


def main():
    port = int(os.environ.get("TESLACAM_PORT", 0)) or find_free_port()
    addr = ("127.0.0.1", port)
    httpd = ThreadedServer(addr, TeslaCamHandler)
    url = f"http://127.0.0.1:{port}/"
    print(f"\n🚗 TeslaCam Viewer çalışıyor")
    print(f"   Veri klasörü: {BASE_DIR}")
    print(f"   Adres: {url}")
    print(f"   Durdurmak için Ctrl+C\n")
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nKapatılıyor...")
        httpd.shutdown()


if __name__ == "__main__":
    main()
