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

// Bolt: Observer pattern to notify listeners when the database changes
type HistoryChangeListener = () => void;
const listeners = new Set<HistoryChangeListener>();

export const onHistoryChange = (listener: HistoryChangeListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notifyHistoryChange = () => {
  listeners.forEach((listener) => listener());
};

export const saveTransferHistory = async (entry: TransferHistoryEntry) => {
  try {
    const db = await getDB();
    if (db) {
      await db.put('transfers', entry);
      notifyHistoryChange();
    }
  } catch (err) {
    console.error('[DB] Failed to save transfer history', err);
  }
};

/**
 * Bolt: Optimized query using a reverse cursor on the timestamp index.
 * This avoids fetching the entire database and performing an in-memory sort.
 */
export const getTransferHistory = async (limit = 50): Promise<TransferHistoryEntry[]> => {
  try {
    const db = await getDB();
    if (db) {
      const results: TransferHistoryEntry[] = [];
      const tx = db.transaction('transfers', 'readonly');
      const index = tx.store.index('by-timestamp');
      let cursor = await index.openCursor(null, 'prev');

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
 * Bolt: Separate query for total stats to ensure accuracy
 * while keeping the recent items list capped.
 */
export const getTransferStats = async (): Promise<{ sent: number; received: number }> => {
  try {
    const db = await getDB();
    if (db) {
      let sent = 0;
      let received = 0;
      const tx = db.transaction('transfers', 'readonly');
      let cursor = await tx.store.openCursor();

      while (cursor) {
        const entry = cursor.value;
        if (entry.status === 'completed') {
          if (entry.transferType === 'outgoing') {
            sent += entry.totalSize;
          } else if (entry.transferType === 'incoming') {
            received += entry.totalSize;
          }
        }
        cursor = await cursor.continue();
      }
      return { sent, received };
    }
  } catch (err) {
    console.error('[DB] Failed to get transfer stats', err);
  }
  return { sent: 0, received: 0 };
};

export const clearTransferHistory = async () => {
  try {
    const db = await getDB();
    if (db) {
      await db.clear('transfers');
      notifyHistoryChange();
    }
  } catch (err) {
    console.error('[DB] Failed to clear transfer history', err);
  }
};
