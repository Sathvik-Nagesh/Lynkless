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

// Bolt: Simple observer pattern to avoid expensive polling in the UI
type HistoryChangeListener = () => void;
const listeners = new Set<HistoryChangeListener>();

export const onHistoryChange = (listener: HistoryChangeListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notifyListeners = () => {
  listeners.forEach(listener => listener());
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
 * Bolt: Optimized retrieval using a reverse cursor and limit.
 * This avoids loading the entire database and sorting in JavaScript.
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

/**
 * Bolt: Calculate aggregate statistics in a single O(N) pass over the database
 * to avoid redundant filtering and reducing operations in the UI.
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
      notifyListeners();
    }
  } catch (err) {
    console.error('[DB] Failed to clear transfer history', err);
  }
};
