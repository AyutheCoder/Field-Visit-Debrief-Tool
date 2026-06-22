import type { CreateVisitInput } from '../types';

// A tiny IndexedDB-backed queue for visits captured while offline.
// Each entry holds the visit payload plus any photo/audio blobs so the
// whole capture can be replayed against the API once connectivity returns.

const DB_NAME = 'fvd-offline';
const STORE = 'queued-visits';
const DB_VERSION = 1;

export interface QueuedMedia {
  blob: Blob;
  filename: string;
}

export interface QueuedVisit {
  id: string;
  input: CreateVisitInput;
  media: QueuedMedia[];
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store: IDBObjectStore): Promise<void> {
  return new Promise((resolve, reject) => {
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
    store.transaction.onabort = () => reject(store.transaction.error);
  });
}

export async function enqueueVisit(entry: Omit<QueuedVisit, 'id' | 'createdAt'>): Promise<QueuedVisit> {
  const record: QueuedVisit = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  };
  const db = await openDb();
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  store.put(record);
  await tx(store);
  db.close();
  notify();
  return record;
}

export async function getQueuedVisits(): Promise<QueuedVisit[]> {
  const db = await openDb();
  const store = db.transaction(STORE, 'readonly').objectStore(STORE);
  const all = await new Promise<QueuedVisit[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as QueuedVisit[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueuedVisit(id: string): Promise<void> {
  const db = await openDb();
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  store.delete(id);
  await tx(store);
  db.close();
  notify();
}

export async function countQueued(): Promise<number> {
  const db = await openDb();
  const store = db.transaction(STORE, 'readonly').objectStore(STORE);
  const n = await new Promise<number>((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return n;
}

// --- Change notifications (so the UI badge can update live) ---
const listeners = new Set<() => void>();

export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  listeners.forEach((fn) => fn());
}
