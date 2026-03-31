/// <reference lib="webworker" />

interface WorkerMessage {
  type: 'init' | 'write' | 'complete' | 'abort';
  fileId: string;
  payload?: {
    metadata?: {
      id: string;
      totalChunks: number;
    };
    chunkIndex?: number;
    data?: ArrayBuffer;
  };
}

const fileHandles = new Map<string, FileSystemFileHandle>();
const accessHandles = new Map<string, unknown>(); // FileSystemSyncAccessHandle is not in standard TS libs yet
const metadataMap = new Map<string, { totalChunks: number; receivedChunks: number; lastReceivedIndex: number }>();

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as WorkerMessage;
  
  if (msg.type === 'init' && msg.payload?.metadata) {
    const { metadata } = msg.payload;
    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(`lynkless-${metadata.id}`, { create: true });
      
      // Request synchronous access handle (only available in Web Workers!)
      // This is vastly faster than asynchronous main-thread FileSystemWritableFileStream
      const accessHandle = await (fileHandle as unknown as { createSyncAccessHandle: () => Promise<unknown> }).createSyncAccessHandle();
      
      fileHandles.set(metadata.id, fileHandle);
      accessHandles.set(metadata.id, accessHandle);
      metadataMap.set(metadata.id, {
        totalChunks: metadata.totalChunks,
        receivedChunks: 0,
        lastReceivedIndex: -1,
      });

      self.postMessage({ type: 'init-success', fileId: metadata.id });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'error', fileId: metadata.id, error: errorMsg });
    }
  } 
  else if (msg.type === 'write' && msg.payload) {
    const { chunkIndex, data } = msg.payload;
    const accessHandle = accessHandles.get(msg.fileId);
    const meta = metadataMap.get(msg.fileId);
    
    if (accessHandle && meta && chunkIndex !== undefined && data) {
      try {
        const offset = chunkIndex * 64 * 1024; // 64KB CHUNK_SIZE
        
        // Synchronous absolute write to disk
        // Create Uint8Array view over the ArrayBuffer that was transferred
        const buffer = new Uint8Array(data);
        (accessHandle as { write: (buffer: Uint8Array, options: { at: number }) => number }).write(buffer, { at: offset });
        
        meta.receivedChunks++;
        meta.lastReceivedIndex = Math.max(meta.lastReceivedIndex, chunkIndex);
        
        self.postMessage({ 
          type: 'progress', 
          fileId: msg.fileId, 
          receivedChunks: meta.receivedChunks,
          lastReceivedIndex: meta.lastReceivedIndex 
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: 'error', fileId: msg.fileId, error: errorMsg });
      }
    }
  }
  else if (msg.type === 'complete') {
    const accessHandle = accessHandles.get(msg.fileId);
    if (accessHandle) {
      (accessHandle as { flush: () => void }).flush();
      (accessHandle as { close: () => void }).close();
      
      accessHandles.delete(msg.fileId);
      fileHandles.delete(msg.fileId);
      metadataMap.delete(msg.fileId);
      
      self.postMessage({ type: 'complete-success', fileId: msg.fileId });
    }
  }
  else if (msg.type === 'abort') {
    const accessHandle = accessHandles.get(msg.fileId);
    if (accessHandle) {
      (accessHandle as { close: () => void }).close();
      accessHandles.delete(msg.fileId);
      
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(`lynkless-${msg.fileId}`);
      } catch (err: unknown) {
        // Ignore removal error
      }
      
      fileHandles.delete(msg.fileId);
      metadataMap.delete(msg.fileId);
      
      self.postMessage({ type: 'abort-success', fileId: msg.fileId });
    }
  }
};
