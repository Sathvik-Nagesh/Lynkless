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

export const saveTransferHistory = async (entry: TransferHistoryEntry) => {
  try {
    const db = await getDB();
    if (db) {
      await db.put('transfers', entry);
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
 * Calculate aggregate statistics in a single O(N) pass using a cursor.
 * Bolt: Uses a cursor instead of getAll() to maintain O(1) space complexity,
 * preventing memory spikes and UI hangs as the history grows.
 */
export const getTransferStats = async () => {
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
      notifyChange();
    }
  } catch (err) {
    console.error('[DB] Failed to clear transfer history', err);
  }
};
