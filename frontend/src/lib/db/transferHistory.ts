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

export const saveTransferHistory = async (entry: TransferHistoryEntry) => {
  try {
    const db = await getDB();
    if (db) {
      await db.put('transfers', entry);
    }
  } catch (err) {
    console.error('[DB] Failed to save transfer history', err);
  }
};

export const getTransferHistory = async (): Promise<TransferHistoryEntry[]> => {
  try {
    const db = await getDB();
    if (db) {
      const all = await db.getAllFromIndex('transfers', 'by-timestamp');
      return all.sort((a, b) => b.timestamp - a.timestamp);
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
    }
  } catch (err) {
    console.error('[DB] Failed to clear transfer history', err);
  }
};
