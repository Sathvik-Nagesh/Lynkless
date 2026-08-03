import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface TransferHistoryEntry {
  id: string; // unique transfer ID
  fileName: string;
  totalSize: number;
  transferType: 'incoming' | 'outgoing';
  peerId: string;
  timestamp: number;
  status: 'completed' | 'failed' | 'cancelled';
}

interface LynklessDB extends DBSchema {
  transfers: {
    key: string;
    value: TransferHistoryEntry;
    indexes: { 'by-timestamp': number };
  };
}

let dbPromise: Promise<IDBPDatabase<LynklessDB>> | null = null;

export const getDB = () => {
  if (typeof window === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB<LynklessDB>('lynkless-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('transfers')) {
          const store = db.createObjectStore('transfers', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
};

// Keys for cached stats in localStorage
const STATS_CACHE_KEY = 'lynkless-transfer-stats-cache';

interface CachedStats {
  totalSent: number;
  totalReceived: number;
}

// Helper to get cached stats from localStorage
const getCachedStats = (): CachedStats | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    if (raw) {
      return JSON.parse(raw) as CachedStats;
    }
  } catch {
    // Ignore issues with localStorage or corrupted JSON
  }
  return null;
};

// Helper to set cached stats in localStorage
const setCachedStats = (stats: CachedStats) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore localStorage write quota / block issues
  }
};

// Observer pattern for history changes to eliminate polling
type HistoryChangeHandler = () => void;
const changeHandlers = new Set<HistoryChangeHandler>();

export const onHistoryChange = (handler: HistoryChangeHandler) => {
  changeHandlers.add(handler);
  return () => changeHandlers.delete(handler);
};

const notifyChange = () => {
  changeHandlers.forEach(handler => handler());
};

export const saveTransferHistory = async (entry: TransferHistoryEntry) => {
  try {
    const db = await getDB();
    if (db) {
      // 1. Fetch current record to see if it exists and what its previous status/size was
      // to correctly adjust the cached stats in case of overrides.
      const existing: TransferHistoryEntry | undefined = await db.get('transfers', entry.id);

      await db.put('transfers', entry);

      // 2. Incrementally update the stats cache in O(1) space/time
      const cached = getCachedStats();
      if (cached) {
        let { totalSent, totalReceived } = cached;

        // Subtract the previous value if there was one and it was completed
        if (existing && existing.status === 'completed') {
          if (existing.transferType === 'outgoing') {
            totalSent = Math.max(0, totalSent - existing.totalSize);
          } else {
            totalReceived = Math.max(0, totalReceived - existing.totalSize);
          }
        }

        // Add the new value if completed
        if (entry.status === 'completed') {
          if (entry.transferType === 'outgoing') {
            totalSent += entry.totalSize;
          } else {
            totalReceived += entry.totalSize;
          }
        }

        setCachedStats({ totalSent, totalReceived });
      }

      notifyChange();
    }
  } catch (err) {
    console.error('[DB] Failed to save transfer history', err);
  }
};

/**
 * Optimized history fetching using a reverse cursor and limit.
 * Bolt: Prevents loading the entire database into memory for UI display.
 */
export const getTransferHistory = async (limit = 50): Promise<TransferHistoryEntry[]> => {
  try {
    const db = await getDB();
    if (db) {
      const history: TransferHistoryEntry[] = [];
      let cursor = await db.transaction('transfers').store.index('by-timestamp').openCursor(null, 'prev');

      while (cursor && history.length < limit) {
        history.push(cursor.value);
        cursor = await cursor.continue();
      }

      return history;
    }
  } catch (err) {
    console.error('[DB] Failed to get transfer history', err);
  }
  return [];
};

/**
 * Calculate aggregate statistics in O(1) space and time using localStorage caching.
 * Bolt: Optimized using localStorage caching. If cache is missing, fallback to O(1) space cursor scan
 * and initialize cache. Incremental updates are performed on save, avoiding future DB full scans.
 */
export const getTransferStats = async (): Promise<CachedStats> => {
  // Check the memory/localStorage cache first for instant O(1) response
  const cached = getCachedStats();
  if (cached) {
    return cached;
  }

  try {
    const db = await getDB();
    if (db) {
      let totalSent = 0;
      let totalReceived = 0;

      let cursor = await db.transaction('transfers').store.openCursor();
      while (cursor) {
        const entry = cursor.value;
        if (entry.status === 'completed') {
          if (entry.transferType === 'outgoing') {
            totalSent += entry.totalSize;
          } else {
            totalReceived += entry.totalSize;
          }
        }
        cursor = await cursor.continue();
      }

      const stats = { totalSent, totalReceived };
      setCachedStats(stats);
      return stats;
    }
  } catch (err) {
    console.error('[DB] Failed to get transfer stats', err);
  }
  return { totalSent: 0, totalReceived: 0 };
};

export const clearTransferHistory = async () => {
  try {
    const db = await getDB();
    if (db) {
      await db.clear('transfers');

      // Reset stats cache
      setCachedStats({ totalSent: 0, totalReceived: 0 });

      notifyChange();
    }
  } catch (err) {
    console.error('[DB] Failed to clear transfer history', err);
  }
};
