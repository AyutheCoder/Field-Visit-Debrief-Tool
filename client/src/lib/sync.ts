import { api } from './api';
import { getQueuedVisits, removeQueuedVisit } from './offline';

let syncing = false;

/**
 * Replay any queued offline visits against the API.
 * Stops at the first failure (likely still offline) and leaves the
 * remaining entries in the queue for the next attempt.
 * Returns the number of visits successfully synced.
 */
export async function syncQueuedVisits(): Promise<number> {
  if (syncing || !navigator.onLine) return 0;
  syncing = true;
  let synced = 0;
  try {
    const queued = await getQueuedVisits();
    for (const q of queued) {
      try {
        const visit = await api.createVisit(q.input);
        for (const m of q.media) {
          await api.uploadMedia(visit.id, m.blob, m.filename);
        }
        await removeQueuedVisit(q.id);
        synced++;
      } catch {
        break;
      }
    }
  } finally {
    syncing = false;
  }
  return synced;
}
