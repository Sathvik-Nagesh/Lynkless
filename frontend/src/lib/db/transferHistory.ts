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

const STATS_SENT_KEY = 'lynkless-stats-sent-v2';
const STATS_RCVD_KEY = 'lynkless-stats-received-v2';

// Helper to retrieve stats from localStorage
const getCachedStats = () => {
  if (typeof window === 'undefined') return null;
  const sent = localStorage.getItem(STATS_SENT_KEY);
  const rcvd = localStorage.getItem(STATS_RCVD_KEY);
  if (sent !== null && rcvd !== null) {
    return {
      totalSent: parseInt(sent, 10) || 0,
      totalReceived: parseInt(rcvd, 10) || 0
    };
  }
  return null;
};

// Helper to store stats in localStorage
const setCachedStats = (totalSent: number, totalReceived: number) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STATS_SENT_KEY, totalSent.toString());
  localStorage.setItem(STATS_RCVD_KEY, totalReceived.toString());
};

export const saveTransferHistory = async (entry: TransferHistoryEntry) => {
  try {
    const db = await getDB();
    if (db) {
      await db.put('transfers', entry);

      // Bolt: Update the cache incrementally for completed transfers
      if (entry.status === 'completed') {
        const cached = getCachedStats();
        if (cached) {
          if (entry.transferType === 'outgoing') {
            cached.totalSent += entry.totalSize;
          } else {
            cached.totalReceived += entry.totalSize;
          }
          setCachedStats(cached.totalSent, cached.totalReceived);
        }
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
 * Calculate aggregate statistics in O(1) time using a localStorage-based cache.
 * Bolt: Reduces the calculation from an O(N) database cursor scan to an O(1) cached lookup,
 * with incremental O(1) updates when history entries are saved or cleared.
 */
export const getTransferStats = async () => {
  const cached = getCachedStats();
  if (cached !== null) {
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

      setCachedStats(totalSent, totalReceived);
      return { totalSent, totalReceived };
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
      setCachedStats(0, 0);
      notifyChange();
    }
  } catch (err) {
    console.error('[DB] Failed to clear transfer history', err);
  }
};
