/**
 * PWA Share Target Helper
 * Handles retrieving files shared from the native OS via Service Worker + IndexedDB
 */

export async function checkSharedFiles(): Promise<File[]> {
  if (typeof window === 'undefined' || !window.indexedDB) return [];

  return new Promise((resolve) => {
    const request = indexedDB.open('LynklessShareDB', 1);
    
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('shared_files')) {
        db.createObjectStore('shared_files');
      }
    };

    request.onsuccess = async (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('shared_files')) {
        resolve([]);
        return;
      }

      const transaction = db.transaction('shared_files', 'readwrite');
      const store = transaction.objectStore('shared_files');
      const getReq = store.get('pending_share');

      getReq.onsuccess = () => {
        const files = getReq.result;
        if (files && Array.isArray(files) && files.length > 0) {
          // Clear the store after reading
          store.delete('pending_share');
          console.log('[PWA] Recovered shared files:', files.length);
          resolve(files);
        } else {
          resolve([]);
        }
      };

      getReq.onerror = () => resolve([]);
    };

    request.onerror = () => resolve([]);
  });
}
