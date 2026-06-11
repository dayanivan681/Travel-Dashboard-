import { AppData } from "./types";

// Automatic local snapshots, stored in IndexedDB — a separate storage bucket
// from the live localStorage copy. They protect against crashes, accidental
// resets, bad imports, and corrupted saves. They do NOT survive the user
// clearing all site data; the manual export in Settings covers that case.

const DB_NAME = "travel-os-backups";
const STORE = "snapshots";
const MAX_SNAPSHOTS = 20;
// Snapshots younger than this get replaced in place (a rolling "latest"),
// older ones are kept — so history is spaced out instead of one-per-keystroke.
const ROLL_WINDOW_MS = 15 * 60 * 1000;

export interface SnapshotMeta {
  takenAt: string; // ISO timestamp, also the record key
  trips: number;
  bookings: number;
  expenses: number;
}

interface SnapshotRecord extends SnapshotMeta {
  data: AppData;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "takenAt" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function getAll(db: IDBDatabase): Promise<SnapshotRecord[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as SnapshotRecord[]);
    req.onerror = () => reject(req.error);
  });
}

const hasIdb = () => typeof indexedDB !== "undefined";

const isEmpty = (d: AppData) =>
  d.trips.length === 0 &&
  d.bookings.length === 0 &&
  d.ideas.length === 0 &&
  d.expenses.length === 0;

// Newest first.
export async function listSnapshots(): Promise<SnapshotMeta[]> {
  if (!hasIdb()) return [];
  try {
    const db = await openDb();
    const all = await getAll(db);
    db.close();
    return all
      .map(({ takenAt, trips, bookings, expenses }) => ({ takenAt, trips, bookings, expenses }))
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  } catch {
    return [];
  }
}

export async function getSnapshotData(takenAt: string): Promise<AppData | null> {
  if (!hasIdb()) return null;
  try {
    const db = await openDb();
    const rec = await new Promise<SnapshotRecord | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(takenAt);
      req.onsuccess = () => resolve(req.result as SnapshotRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rec?.data ?? null;
  } catch {
    return null;
  }
}

// Called on every (debounced) data change. Never throws.
export async function autoSnapshot(data: AppData): Promise<void> {
  if (!hasIdb() || isEmpty(data)) return;
  try {
    const db = await openDb();
    const all = await getAll(db);
    all.sort((a, b) => b.takenAt.localeCompare(a.takenAt));

    const now = Date.now();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);

    // Roll the newest snapshot if it's recent, so quick successive edits
    // refresh it instead of flooding the history.
    const newest = all[0];
    if (newest && now - new Date(newest.takenAt).getTime() < ROLL_WINDOW_MS) {
      store.delete(newest.takenAt);
      all.shift();
    }
    const record: SnapshotRecord = {
      takenAt: new Date(now).toISOString(),
      trips: data.trips.length,
      bookings: data.bookings.length,
      expenses: data.expenses.length,
      data,
    };
    store.put(record);
    for (const old of all.slice(MAX_SNAPSHOTS - 1)) {
      store.delete(old.takenAt);
    }
    await txDone(tx);
    db.close();
  } catch {
    // best-effort: snapshots must never break the app
  }
}
