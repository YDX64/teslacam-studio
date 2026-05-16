/* ------------------------------------------------------------------ */
/*  TeslaCam Viewer - Frontend application                             */
/*  Uses safe DOM APIs (no innerHTML for user data)                    */
/* ------------------------------------------------------------------ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Build an element with attrs and children */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

const state = {
  manifest: null,
  events: [],
  filtered: [],
  currentEvent: null,
  currentMinuteIndex: 0,
  filter: "all",
  search: "",
  speed: 1,
  speedOptions: [1, 1.5, 2, 4, 0.5],
  speedIndex: 0,
  muted: true,
  isPlaying: false,
  minuteDuration: 60,
  map: null,
  marker: null,
  seekDragging: false,
};

const CAMERAS = ["front", "left_repeater", "right_repeater", "back"];

// ---------------------------------------------------------------------------
// SVG icons (static markup, safe)
// ---------------------------------------------------------------------------
const ICONS = {
  sentry: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V5l-8-3Zm0 5a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3Z"/></svg>',
  honk:   '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/></svg>',
  saved:  '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/></svg>',
  recent: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z"/></svg>',
};

function setIcon(el, key) {
  // We control the keys - SVG markup is static and safe.
  while (el.firstChild) el.removeChild(el.firstChild);
  const tpl = document.createElement("template");
  // Inserting pre-defined trusted SVG strings only
  tpl.innerHTML = ICONS[key] || "";
  el.appendChild(tpl.content);
}

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------

async function boot() {
  try {
    await loadManifest();
    bindUI();
    bindKeyboard();
    renderEventList();
    if (state.events.length > 0) {
      selectEvent(state.events[0].id);
    }
  } catch (err) {
    console.error(err);
    toast("Yükleme hatası: " + err.message, 4000);
  }
}

async function loadManifest() {
  const res = await fetch("/api/manifest");
  if (!res.ok) throw new Error(`Manifest indirilemedi (HTTP ${res.status})`);
  const data = await res.json();
  state.manifest = data;

  state.events = [...data.events];
  if (data.recent && data.recent.length > 0) {
    state.events.push({
      id: "RecentClips/all",
      category: "RecentClips",
      folder: "RecentClips",
      timestamp: data.recent[data.recent.length - 1].timestamp.replace("_", "T"),
      first_clip: data.recent[0].timestamp,
      city: "Son Kayıtlar",
      lat: null,
      lon: null,
      reason: "recent",
      reason_label: "Sürekli kayıt",
      trigger_camera: "",
      minute_count: data.recent.length,
      minutes: data.recent,
    });
  }

  const stats = data.stats || {};
  const statsEl = $("#stats");
  while (statsEl.firstChild) statsEl.removeChild(statsEl.firstChild);
  statsEl.append(
    h("span", { class: "stat-pill" }, `${stats.saved_count || 0} kayıt`),
    h("span", { class: "stat-pill sentry" }, `${stats.sentry_count || 0} sentry`),
    h("span", { class: "stat-pill recent" }, `${stats.recent_count || 0} dakika`),
  );

  const gen = new Date(data.generated_at);
  $("#generated").textContent = `tarandı ${gen.toLocaleTimeString("tr-TR", {hour: "2-digit", minute: "2-digit"})}`;
}

// ---------------------------------------------------------------------------
// UI BINDINGS
// ---------------------------------------------------------------------------

function bindUI() {
  $("#refresh-btn").addEventListener("click", async () => {
    toast("Yeniden taranıyor…");
    await loadManifest();
    renderEventList();
    toast("Güncellendi");
  });

  const searchInput = $("#search");
  searchInput.addEventListener("input", () => {
    state.search = searchInput.value.toLowerCase();
    renderEventList();
  });

  $$(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      renderEventList();
    });
  });

  $("#play-btn").addEventListener("click", togglePlay);
  $("#speed-btn").addEventListener("click", cycleSpeed);
  $("#mute-btn").addEventListener("click", toggleMute);
  $("#fullscreen-btn").addEventListener("click", toggleFullscreen);

  $("#export-btn").addEventListener("click", () => {
    if (!state.currentEvent) return;
    const path = `${state.manifest.base_dir}/${state.currentEvent.category}/${state.currentEvent.folder}`;
    navigator.clipboard?.writeText(path);
    toast("Klasör yolu panoya kopyalandı");
  });

  const seek = $("#seek");
  seek.addEventListener("input", () => {
    state.seekDragging = true;
    const ratio = seek.value / 1000;
    seekToRatio(ratio);
  });
  seek.addEventListener("change", () => { state.seekDragging = false; });

  $$(".video-cell").forEach(cell => {
    cell.addEventListener("click", () => {
      const grid = $("#video-grid");
      const wasFocused = cell.classList.contains("focused");
      $$(".video-cell").forEach(c => c.classList.remove("focused"));
      if (wasFocused) {
        grid.classList.remove("layout-focus");
      } else {
        cell.classList.add("focused");
        grid.classList.add("layout-focus");
      }
    });
  });

  setInterval(syncProgress, 250);
}

function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (e.shiftKey) goToMinute(state.currentMinuteIndex - 1);
        else nudge(-5);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (e.shiftKey) goToMinute(state.currentMinuteIndex + 1);
        else nudge(5);
        break;
      case "ArrowUp":
        e.preventDefault();
        goToMinute(state.currentMinuteIndex - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        goToMinute(state.currentMinuteIndex + 1);
        break;
      case "f":
      case "F":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "m":
      case "M":
        e.preventDefault();
        toggleMute();
        break;
      case "1": case "2": case "3": case "4": {
        const idx = parseInt(e.key, 10) - 1;
        const cell = $$(".video-cell")[idx];
        if (cell) cell.click();
        break;
      }
      case "Escape":
        if (document.fullscreenElement) document.exitFullscreen();
        break;
      case "Home":
        e.preventDefault();
        goToMinute(0);
        break;
      case "End":
        e.preventDefault();
        if (state.currentEvent) goToMinute(state.currentEvent.minutes.length - 1);
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// EVENT LIST RENDERING
// ---------------------------------------------------------------------------

function renderEventList() {
  const list = $("#event-list");
  const filter = state.filter;
  const q = state.search;

  state.filtered = state.events.filter(ev => {
    if (filter !== "all" && ev.category !== filter) return false;
    if (q) {
      const hay = [ev.city, ev.reason_label, ev.reason, ev.folder, ev.timestamp].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  $("#counter").textContent = `${state.filtered.length} olay`;

  while (list.firstChild) list.removeChild(list.firstChild);

  for (const ev of state.filtered) {
    const dt = new Date(ev.timestamp);
    const dateStr = isNaN(dt) ? ev.timestamp : dt.toLocaleString("tr-TR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    });
    const isActive = state.currentEvent && state.currentEvent.id === ev.id;

    const iconKey = ev.category === "SentryClips" ? "sentry"
                  : ev.category === "SavedClips"
                    ? (ev.reason === "user_interaction_honk" ? "honk" : "saved")
                  : "recent";

    const iconEl = h("div", { class: "event-icon" });
    setIcon(iconEl, iconKey);

    const li = h("li", {
      class: `event-item${isActive ? " active" : ""}`,
      dataset: { id: ev.id, category: ev.category },
      onclick: () => selectEvent(ev.id),
    },
      iconEl,
      h("div", { class: "event-body" },
        h("div", { class: "event-city" }, ev.city || ev.folder),
        h("div", { class: "event-meta-row" },
          h("span", { class: "reason-dot" }),
          h("span", null, ev.reason_label),
        ),
        h("div", { class: "event-meta-row" },
          h("span", null, dateStr),
        ),
      ),
      h("div", { class: "event-right" },
        h("span", { class: "duration" }, `${ev.minute_count}m`),
      ),
    );

    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// EVENT SELECTION & PLAYBACK
// ---------------------------------------------------------------------------

function selectEvent(id) {
  const ev = state.events.find(e => e.id === id);
  if (!ev) return;
  state.currentEvent = ev;
  state.currentMinuteIndex = 0;
  state.isPlaying = false;

  $$(".event-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
  $("#empty-state").classList.add("hidden");
  $("#player-area").classList.remove("hidden");

  $("#event-title").textContent = ev.city || ev.folder;
  $("#event-city").textContent = ev.category;
  $("#event-time").textContent = formatEventTime(ev.timestamp);
  $("#event-reason").textContent = ev.reason_label;

  $("#d-category").textContent = ev.category;
  $("#d-folder").textContent = ev.folder;
  $("#d-firstclip").textContent = ev.first_clip;
  $("#d-minutes").textContent = ev.minute_count;
  $("#d-trigger").textContent = ev.trigger_camera ? cameraLabelByIndex(ev.trigger_camera) : "—";
  $("#d-gps").textContent = (ev.lat && ev.lon) ? `${ev.lat.toFixed(4)}, ${ev.lon.toFixed(4)}` : "GPS kaydı yok";

  renderMinuteTimeline();
  loadMinute(0);
  updateMap(ev);

  const hasBack = ev.minutes.some(m => m.cameras.back);
  $("#video-grid").classList.toggle("layout-3cam", !hasBack);
}

function formatEventTime(iso) {
  const dt = new Date(iso);
  if (isNaN(dt)) return iso;
  return dt.toLocaleString("tr-TR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function cameraLabelByIndex(idx) {
  const map = { "0": "Ön", "1": "Sol", "2": "Sağ", "3": "Arka" };
  return map[String(idx)] || `Kamera ${idx}`;
}

function renderMinuteTimeline() {
  const wrap = $("#minute-timeline");
  const ev = state.currentEvent;
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

  ev.minutes.forEach((m, i) => {
    const ts = m.timestamp.slice(-8).replace(/-/g, ":");
    const camCount = Object.keys(m.cameras).length;
    const tick = h("div", {
      class: `minute-tick${i === state.currentMinuteIndex ? " active" : ""}`,
      dataset: { idx: String(i) },
      onclick: () => goToMinute(i),
    },
      h("div", null, ts),
      h("div", { class: "cams" }, `${camCount}/4 kam`),
    );
    wrap.appendChild(tick);
  });

  $("#minute-total").textContent = String(ev.minutes.length);
}

function loadMinute(idx) {
  const ev = state.currentEvent;
  if (!ev) return;
  if (idx < 0 || idx >= ev.minutes.length) return;
  state.currentMinuteIndex = idx;

  const minute = ev.minutes[idx];
  const videos = $$(".cam-video");

  videos.forEach(v => {
    const cam = v.dataset.cam;
    const cell = v.closest(".video-cell");
    const status = $(`[data-status="${cam}"]`);
    const camData = minute.cameras[cam];
    if (camData) {
      cell.classList.remove("missing");
      if (!v.src.endsWith(camData.url)) {
        v.src = camData.url;
      }
      v.muted = state.muted;
      v.playbackRate = state.speed;
      status.classList.remove("error");
      status.classList.add("loading");
      v.addEventListener("loadeddata", () => {
        status.classList.remove("loading");
        status.classList.add("live");
        if (cam === pickMaster()) {
          state.minuteDuration = v.duration || 60;
          updateTotalTime();
        }
      }, { once: true });
      v.addEventListener("error", () => {
        status.classList.remove("loading", "live");
        status.classList.add("error");
      }, { once: true });
    } else {
      cell.classList.add("missing");
      v.removeAttribute("src");
      v.load();
      status.classList.remove("live", "loading", "error");
    }
  });

  $$(".minute-tick").forEach((t, i) => t.classList.toggle("active", i === idx));
  $("#minute-current").textContent = String(idx + 1);

  if (state.isPlaying) {
    queueMicrotask(() => playAll());
  }
}

function pickMaster() {
  const minute = state.currentEvent?.minutes[state.currentMinuteIndex];
  if (!minute) return "front";
  for (const cam of CAMERAS) if (minute.cameras[cam]) return cam;
  return "front";
}

function getMasterVideo() {
  return $(`.cam-video[data-cam="${pickMaster()}"]`);
}

function getActiveVideos() {
  const minute = state.currentEvent?.minutes[state.currentMinuteIndex];
  if (!minute) return [];
  return $$(".cam-video").filter(v => minute.cameras[v.dataset.cam]);
}

// ---------------------------------------------------------------------------
// PLAYBACK CONTROLS
// ---------------------------------------------------------------------------

function togglePlay() {
  if (!state.currentEvent) return;
  if (state.isPlaying) pauseAll();
  else playAll();
}

function playAll() {
  state.isPlaying = true;
  const master = getMasterVideo();
  if (!master) return;
  getActiveVideos().forEach(v => {
    v.playbackRate = state.speed;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  });
  $("#play-icon").classList.add("hidden");
  $("#pause-icon").classList.remove("hidden");
}

function pauseAll() {
  state.isPlaying = false;
  $$(".cam-video").forEach(v => v.pause());
  $("#play-icon").classList.remove("hidden");
  $("#pause-icon").classList.add("hidden");
}

function nudge(seconds) {
  const master = getMasterVideo();
  if (!master) return;
  let target = master.currentTime + seconds;
  if (target < 0) {
    if (state.currentMinuteIndex > 0) {
      goToMinute(state.currentMinuteIndex - 1);
      setTimeout(() => {
        const m = getMasterVideo();
        if (m) m.currentTime = Math.max(0, m.duration + target);
        syncSlaves();
      }, 80);
    } else {
      master.currentTime = 0;
    }
    return;
  }
  if (target > master.duration) {
    if (state.currentMinuteIndex < state.currentEvent.minutes.length - 1) {
      const overflow = target - master.duration;
      goToMinute(state.currentMinuteIndex + 1);
      setTimeout(() => {
        const m = getMasterVideo();
        if (m) m.currentTime = overflow;
        syncSlaves();
      }, 80);
    } else {
      master.currentTime = master.duration;
    }
    return;
  }
  master.currentTime = target;
  syncSlaves();
}

function goToMinute(idx) {
  if (!state.currentEvent) return;
  const max = state.currentEvent.minutes.length - 1;
  idx = Math.max(0, Math.min(max, idx));
  if (idx === state.currentMinuteIndex) return;
  loadMinute(idx);
}

function seekToRatio(ratio) {
  if (!state.currentEvent) return;
  const totalMinutes = state.currentEvent.minutes.length;
  const exactMinute = ratio * totalMinutes;
  const idx = Math.min(totalMinutes - 1, Math.floor(exactMinute));
  const within = exactMinute - idx;
  if (idx !== state.currentMinuteIndex) {
    loadMinute(idx);
    setTimeout(() => {
      const master = getMasterVideo();
      if (master) master.currentTime = within * (master.duration || 60);
      syncSlaves();
    }, 80);
  } else {
    const master = getMasterVideo();
    if (master) master.currentTime = within * (master.duration || 60);
    syncSlaves();
  }
}

function syncSlaves() {
  const master = getMasterVideo();
  if (!master) return;
  getActiveVideos().forEach(v => {
    if (v !== master && Math.abs(v.currentTime - master.currentTime) > 0.2) {
      try { v.currentTime = master.currentTime; } catch (e) {}
    }
  });
}

function cycleSpeed() {
  state.speedIndex = (state.speedIndex + 1) % state.speedOptions.length;
  state.speed = state.speedOptions[state.speedIndex];
  $$(".cam-video").forEach(v => v.playbackRate = state.speed);
  $("#speed-btn").textContent = `${state.speed}×`;
  toast(`Hız: ${state.speed}×`);
}

function toggleMute() {
  state.muted = !state.muted;
  $$(".cam-video").forEach(v => v.muted = state.muted);
  const btn = $("#mute-btn");
  btn.classList.toggle("active", !state.muted);
  toast(state.muted ? "Sessiz" : "Ses açık");
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.();
    document.body.classList.add("fullscreen-mode");
  } else {
    document.exitFullscreen?.();
    document.body.classList.remove("fullscreen-mode");
  }
}

document.addEventListener("fullscreenchange", () => {
  document.body.classList.toggle("fullscreen-mode", !!document.fullscreenElement);
});

// ---------------------------------------------------------------------------
// PROGRESS SYNC LOOP
// ---------------------------------------------------------------------------

function syncProgress() {
  if (state.seekDragging) return;
  const master = getMasterVideo();
  if (!master || !state.currentEvent) return;

  getActiveVideos().forEach(v => {
    if (v !== master && Math.abs(v.currentTime - master.currentTime) > 0.3) {
      try { v.currentTime = master.currentTime; } catch (e) {}
    }
  });

  if (state.isPlaying && master.duration && master.currentTime >= master.duration - 0.15) {
    const nextIdx = state.currentMinuteIndex + 1;
    if (nextIdx < state.currentEvent.minutes.length) {
      goToMinute(nextIdx);
    } else {
      pauseAll();
    }
  }

  const totalMin = state.currentEvent.minutes.length;
  const minDur = master.duration || 60;
  const elapsed = state.currentMinuteIndex * minDur + master.currentTime;
  const total = totalMin * minDur;
  $("#time-current").textContent = formatTime(elapsed);
  $("#time-total").textContent = formatTime(total);

  const ratio = (elapsed / total) * 1000;
  $("#seek").value = Math.floor(ratio);

  if (!master.paused && !state.isPlaying) {
    state.isPlaying = true;
    $("#play-icon").classList.add("hidden");
    $("#pause-icon").classList.remove("hidden");
  } else if (master.paused && state.isPlaying) {
    state.isPlaying = false;
    $("#play-icon").classList.remove("hidden");
    $("#pause-icon").classList.add("hidden");
  }
}

function updateTotalTime() {
  if (!state.currentEvent) return;
  const total = state.currentEvent.minutes.length * state.minuteDuration;
  $("#time-total").textContent = formatTime(total);
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// MAP
// ---------------------------------------------------------------------------

function updateMap(ev) {
  if (!state.map) {
    state.map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
    }).setView([57.7089, 11.9746], 12);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(state.map);
    L.control.zoom({ position: "topright" }).addTo(state.map);
  }
  if (ev.lat && ev.lon) {
    state.map.invalidateSize();
    state.map.setView([ev.lat, ev.lon], 15, { animate: true });
    if (state.marker) state.map.removeLayer(state.marker);

    // Build marker DOM safely (no innerHTML)
    const markerNode = document.createElement("div");
    markerNode.style.cssText = "width:18px;height:18px;border-radius:50%;background:#5b8def;border:3px solid #fff;box-shadow:0 0 0 6px rgba(91,141,239,0.3),0 0 18px rgba(91,141,239,0.8);";
    const icon = L.divIcon({
      className: "tesla-marker",
      html: markerNode.outerHTML,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    state.marker = L.marker([ev.lat, ev.lon], { icon }).addTo(state.map);

    // Build popup content safely
    const popupContent = h("div", null,
      h("b", null, ev.city || ""),
      h("br"),
      ev.reason_label || ""
    );
    state.marker.bindPopup(popupContent);
  } else if (state.marker) {
    state.map.removeLayer(state.marker);
    state.marker = null;
  }
  setTimeout(() => state.map?.invalidateSize(), 200);
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

function toast(msg, dur = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove("show"), dur);
}

// ---------------------------------------------------------------------------
// GO
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", boot);
