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

// Bolt: Simple observer pattern to avoid expensive polling
type HistoryListener = () => void;
const historyListeners = new Set<HistoryListener>();

export const onHistoryChange = (listener: HistoryListener) => {
  historyListeners.add(listener);
  return () => historyListeners.delete(listener);
};

const notifyListeners = () => {
  historyListeners.forEach(listener => listener());
};

export const saveTransferHistory = async (entry: TransferHistoryEntry) => {
  try {
    const db = await getDB();
    if (db) {
      await db.put('transfers', entry);
      notifyListeners();
    }
  } catch (err) {
    console.error('[DB] Failed to save transfer history', err);
  }
};

/**
 * Bolt: Optimized retrieval using a reverse cursor and fixed limit.
 * Fetches only the latest 50 items directly from the index in descending order,
 * avoiding fetching the entire history and manual sorting in JS.
 */
export const getTransferHistory = async (limit = 50): Promise<TransferHistoryEntry[]> => {
  try {
    const db = await getDB();
    if (db) {
      const results: TransferHistoryEntry[] = [];
      let cursor = await db.transaction('transfers').store.index('by-timestamp').openCursor(null, 'prev');

      while (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor = await cursor.continue();
      }

      return results;
    }
  } catch (err) {
    console.error('[DB] Failed to get transfer history', err);
  }
  return [];
};

export const clearTransferHistory = async () => {
  try {
    const db = await getDB();
    if (db) {
      await db.clear('transfers');
      notifyListeners();
    }
  } catch (err) {
    console.error('[DB] Failed to clear transfer history', err);
  }
};
