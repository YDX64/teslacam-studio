/*  sourceHistory — persist & restore the user's recent folder selections.      */
/*                                                                              */
/*  Backend roots are plain paths.                                              */
/*  Browser folder handles (FileSystemDirectoryHandle) are stored in IndexedDB  */
/*  because they aren't JSON-serialisable. The HISTORY entry holds only the    */
/*  display name + an id used to look the handle up.                            */

const HISTORY_KEY = "teslacam.history";
const SOURCE_KEY = "teslacam.source";
const DB_NAME = "teslacam-handles";
const DB_STORE = "handles";
const MAX_HISTORY = 8;

export type SourceRef =
  | { id: string; kind: "backend"; root: string; label: string; lastUsed: string }
  | { id: string; kind: "browser-fsa"; label: string; lastUsed: string };
//   browser-files sources aren't persisted — FileList from <input> can't be re-opened.

/* -------------------------- history (localStorage) -------------------------- */

export function readHistory(): SourceRef[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSourceRef);
  } catch {
    return [];
  }
}

export function pushHistory(entry: SourceRef): void {
  const list = readHistory().filter(r => r.id !== entry.id);
  list.unshift(entry);
  while (list.length > MAX_HISTORY) list.pop();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch { /* quota / disabled — ignore */ }
}

export function removeFromHistory(id: string): void {
  const list = readHistory().filter(r => r.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

function isSourceRef(x: unknown): x is SourceRef {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string"
      && typeof o.label === "string"
      && typeof o.lastUsed === "string"
      && (o.kind === "backend" || o.kind === "browser-fsa")
      && (o.kind !== "backend" || typeof o.root === "string");
}

/* -------------------------- last source (localStorage) ---------------------- */

export type StoredSource =
  | { kind: "backend"; root: string }
  | { kind: "browser-fsa"; handleId: string; label: string };

export function readStoredSource(): StoredSource | null {
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.kind === "backend" && typeof o.root === "string") {
      return { kind: "backend", root: o.root };
    }
    if (o.kind === "browser-fsa" && typeof o.handleId === "string" && typeof o.label === "string") {
      return { kind: "browser-fsa", handleId: o.handleId, label: o.label };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeStoredSource(s: StoredSource | null): void {
  try {
    if (s == null) localStorage.removeItem(SOURCE_KEY);
    else localStorage.setItem(SOURCE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

/* -------------------------- handles (IndexedDB) ----------------------------- */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(handle, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* ignore */ }
}

export async function loadHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDB();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function deleteHandle(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* ignore */ }
}

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
