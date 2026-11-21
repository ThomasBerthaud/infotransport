import type { Dashboard, TimetablesResponse } from '../shared/model.js';
import {
  offlineDashboard,
  timetablesDue,
  timetablesSignature,
  type Snapshot,
  type StoredTimetables,
} from '../shared/offline.js';
import { api } from './api.js';

// Browser storage for offline use. Every failure is swallowed: private browsing or a full
// quota must not break the online dashboard.
const DATABASE = 'infotransport';
const STORE = 'offline';
type Key = 'snapshot' | 'timetables';

let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible.'));
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  }));
}
function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () =>
          reject(transaction.error ?? new Error('Écriture locale impossible.'));
      }),
  );
}
async function read<T>(key: Key): Promise<T | undefined> {
  try {
    return (await run<unknown>('readonly', (store) => store.get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}
async function write(key: Key, value: unknown) {
  try {
    await run('readwrite', (store) => store.put(value, key));
  } catch {
    // Offline data is a convenience; keep the online view working.
  }
}
async function remove(key: Key) {
  try {
    await run('readwrite', (store) => store.delete(key));
  } catch {
    // Same as write.
  }
}

/** Saves a dashboard received from the server, then refreshes timetables when due. */
export async function remember(dashboard: Dashboard) {
  if (typeof indexedDB === 'undefined') return;
  await write('snapshot', { savedAt: dashboard.now, dashboard } satisfies Snapshot);
  if (!dashboard.timetables) {
    // Nothing imported (or the import was removed): do not keep outdated timetables.
    await remove('timetables');
    return;
  }
  const now = new Date();
  if (!timetablesDue(dashboard, await read<StoredTimetables>('timetables'), now)) return;
  try {
    const timetables = await api<TimetablesResponse>('/api/timetables');
    await write('timetables', {
      ...timetables,
      fetchedAt: now.toISOString(),
      signature: timetablesSignature(dashboard),
    } satisfies StoredTimetables);
  } catch {
    // Retried after the next successful dashboard refresh.
  }
}

/** Dashboard rebuilt from saved data, or undefined when nothing was ever saved here. */
export async function offlineFallback(now: Date): Promise<Dashboard | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  return offlineDashboard(
    await read<Snapshot>('snapshot'),
    await read<StoredTimetables>('timetables'),
    now,
  );
}
