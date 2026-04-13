/// <reference lib="webworker" />

interface TransferMetadata {
  id: string;
  size: number;
  totalChunks: number;
}

interface InitPayload {
  metadata: TransferMetadata;
}

interface WritePayload {
  chunkIndex: number;
  data: ArrayBuffer;
}

interface WorkerMessage {
  type: 'init' | 'write' | 'complete' | 'abort';
  fileId: string;
  payload?: InitPayload | WritePayload;
}

interface SyncHandle {
  write(buffer: BufferSource, options?: { at?: number }): number;
  truncate(newSize: number): void;
  flush(): void;
  close(): void;
}

interface WorkerTransferState {
  totalChunks: number;
  receivedChunks: number;
  lastReceivedIndex: number;
}

const fileHandles = new Map<string, FileSystemFileHandle>();
const accessHandles = new Map<string, SyncHandle>();
const metadataMap = new Map<string, WorkerTransferState>();
const lastProgressUpdate = new Map<string, number>();

const PROGRESS_THROTTLE_MS = 100;
const WORKER_CHUNK_SIZE = 256 * 1024; // Bolt: Match CHUNK_SIZE from fileTransfer.ts for data integrity

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as WorkerMessage;
  
  if (msg.type === 'init') {
    const payload = msg.payload as InitPayload | undefined;
    if (!payload?.metadata) return;
    const { metadata } = payload;

    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(`lynkless-${metadata.id}`, { create: true });
      
      // Request synchronous access handle (only available in Web Workers!)
      // This is vastly faster than asynchronous main-thread FileSystemWritableFileStream
      const accessHandle = await (fileHandle as FileSystemFileHandle & { createSyncAccessHandle: () => Promise<SyncHandle> }).createSyncAccessHandle();

      // Bolt: Pre-allocate disk space to improve write performance and reduce fragmentation.
      // Truncating to the final size upfront ensures the OS reserves the space.
      if (metadata.size) {
        accessHandle.truncate(metadata.size);
      }
      
      fileHandles.set(metadata.id, fileHandle);
      accessHandles.set(metadata.id, accessHandle);
      metadataMap.set(metadata.id, {
        totalChunks: metadata.totalChunks,
        receivedChunks: 0,
        lastReceivedIndex: -1,
      });
      lastProgressUpdate.set(metadata.id, 0);

      self.postMessage({ type: 'init-success', fileId: metadata.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown worker init error';
      self.postMessage({ type: 'error', fileId: metadata.id, error: message });
    }
  } 
  else if (msg.type === 'write') {
    const payload = msg.payload as WritePayload | undefined;
    if (!payload) return;
    const { chunkIndex, data } = payload;

    const accessHandle = accessHandles.get(msg.fileId);
    const meta = metadataMap.get(msg.fileId);
    
    if (accessHandle && meta && chunkIndex !== undefined && data) {
      try {
        const offset = chunkIndex * WORKER_CHUNK_SIZE;
        
        // Synchronous absolute write to disk
        // Create Uint8Array view over the ArrayBuffer that was transferred
        const buffer = new Uint8Array(data);
        accessHandle.write(buffer, { at: offset });
        
        meta.receivedChunks++;
        meta.lastReceivedIndex = Math.max(meta.lastReceivedIndex, chunkIndex);
        
        // Bolt: Throttle progress updates to reduce IPC overhead during high-speed transfers
        const now = Date.now();
        const lastUpdate = lastProgressUpdate.get(msg.fileId) || 0;

        if (now - lastUpdate >= PROGRESS_THROTTLE_MS) {
          lastProgressUpdate.set(msg.fileId, now);
          self.postMessage({
            type: 'progress',
            fileId: msg.fileId,
            receivedChunks: meta.receivedChunks,
            lastReceivedIndex: meta.lastReceivedIndex
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown worker write error';
        self.postMessage({ type: 'error', fileId: msg.fileId, error: message });
      }
    }
  }
  else if (msg.type === 'complete') {
    const accessHandle = accessHandles.get(msg.fileId);
    const meta = metadataMap.get(msg.fileId);

    if (accessHandle && meta) {
      // Bolt: Ensure final progress is reported before closing
      self.postMessage({
        type: 'progress',
        fileId: msg.fileId,
        receivedChunks: meta.receivedChunks,
        lastReceivedIndex: meta.lastReceivedIndex
      });

      accessHandle.flush();
      accessHandle.close();
      
      accessHandles.delete(msg.fileId);
      fileHandles.delete(msg.fileId);
      metadataMap.delete(msg.fileId);
      lastProgressUpdate.delete(msg.fileId);
      
      self.postMessage({ type: 'complete-success', fileId: msg.fileId });
    }
  }
  else if (msg.type === 'abort') {
    const accessHandle = accessHandles.get(msg.fileId);
    if (accessHandle) {
      accessHandle.close();
      accessHandles.delete(msg.fileId);
      
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(`lynkless-${msg.fileId}`);
      } catch {
        // Silent fail on cleanup
      }

      fileHandles.delete(msg.fileId);
      metadataMap.delete(msg.fileId);
      lastProgressUpdate.delete(msg.fileId);
      
      self.postMessage({ type: 'abort-success', fileId: msg.fileId });
    }
  }
};
