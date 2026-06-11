/// <reference lib="webworker" />

interface TransferMetadata {
  id: string;
  size: number;
  totalChunks: number;
  salt?: string;
  binaryId?: ArrayBuffer;
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
  opfsName: string; // Store the exact salted name
  lastReportedProgress: number;
  receivedBitfield: Uint8Array; // Dedup: track which chunks have been written using bits
}

const fileHandles = new Map<string, FileSystemFileHandle>();
const accessHandles = new Map<string, SyncHandle>();
const metadataMap = new Map<string, WorkerTransferState>();
/**
 * Bolt: Single-slot cache for the most recent 'write' operation.
 * Since chunks for a file typically arrive in long consecutive sequences,
 * this bypasses expensive Map lookups in the high-frequency hot path.
 */
let lastWriteCache: {
  fileId: string;
  accessHandle: SyncHandle;
  meta: WorkerTransferState;
  expectedIdBuffer: Uint8Array;
} | null = null;

const WORKER_CHUNK_SIZE = 64 * 1024; // 64KB - MUST match CHUNK_SIZE in fileTransfer.ts

// Speed performance: Pre-allocate reusable buffers and encoders
const encoder = new TextEncoder();
const fileIdBufferMap = new Map<string, Uint8Array>();

const messageQueue: MessageEvent[] = [];
let isProcessing = false;

self.onmessage = (e: MessageEvent) => {
  messageQueue.push(e);
  processQueue();
};

async function processQueue() {
  if (isProcessing || messageQueue.length === 0) return;
  isProcessing = true;

  while (messageQueue.length > 0) {
    const e = messageQueue.shift()!;
    try {
      await handleMessage(e);
    } catch (err) {
      console.error('[Worker] Queue processing error:', err);
    }
  }

  isProcessing = false;
}

async function handleMessage(e: MessageEvent) {
  const msg = e.data as WorkerMessage;
  
  if (msg.type === 'init') {
    const payload = msg.payload as InitPayload | undefined;
    if (!payload?.metadata) return;
    const { metadata } = payload;

    try {
      const root = await navigator.storage.getDirectory();
      const fileId = metadata.id;
      const salt = metadata.salt || '';
      const opfsName = salt ? `lynkless-${fileId}-${salt}` : `lynkless-${fileId}`;
      
      // Cache binary File ID for fast comparison
      const binaryId = metadata.binaryId;
      if (binaryId) {
        fileIdBufferMap.set(fileId, new Uint8Array(binaryId));
      } else {
        fileIdBufferMap.set(fileId, encoder.encode(fileId)); // Fallback
      }

      const fileHandle = await root.getFileHandle(opfsName, { create: true });
      
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
      metadataMap.set(fileId, {
        totalChunks: metadata.totalChunks,
        receivedChunks: 0,
        lastReceivedIndex: -1,
        opfsName: opfsName,
        lastReportedProgress: 0,
        // Bitfield takes 1 bit per chunk (1MB RAM handles > 8 Million chunks)
        receivedBitfield: new Uint8Array(Math.ceil(metadata.totalChunks / 8))
      });

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

    // Bolt: Use single-slot cache to bypass Map lookups for consecutive chunks
    let cache = lastWriteCache;
    if (!cache || cache.fileId !== msg.fileId) {
      const accessHandle = accessHandles.get(msg.fileId);
      const meta = metadataMap.get(msg.fileId);
      const expectedIdBuffer = fileIdBufferMap.get(msg.fileId);

      if (accessHandle && meta && expectedIdBuffer) {
        cache = { fileId: msg.fileId, accessHandle, meta, expectedIdBuffer };
        lastWriteCache = cache;
      } else {
        return;
      }
    }

    const { accessHandle, meta, expectedIdBuffer } = cache;
    
    if (chunkIndex !== undefined && data) {
      try {
        // Bolt: Optimized 4x uint32 header comparison (O(1) vs O(N))
        const view = new DataView(data);
        const expectedView = new DataView(expectedIdBuffer.buffer, expectedIdBuffer.byteOffset, expectedIdBuffer.byteLength);

        if (view.getUint32(0, true) !== expectedView.getUint32(0, true) ||
            view.getUint32(4, true) !== expectedView.getUint32(4, true) ||
            view.getUint32(8, true) !== expectedView.getUint32(8, true) ||
            view.getUint32(12, true) !== expectedView.getUint32(12, true)) {
          return;
        }

        // Bolt: Micro-optimized bitfield indexing using bitwise shifts
        const byteIndex = chunkIndex >> 3; // Equivalent to Math.floor(chunkIndex / 8)
        const bitMask = 1 << (chunkIndex & 7); // Equivalent to chunkIndex % 8
        if ((meta.receivedBitfield[byteIndex] & bitMask) !== 0) {
          // Still return the buffer for recycling
          self.postMessage({ 
            type: 'buffer-return', 
            fileId: msg.fileId, 
            data: data 
          }, [data]);
          return;
        }
        meta.receivedBitfield[byteIndex] |= bitMask;

        // Bolt: Use WORKER_CHUNK_SIZE constant for offset calculation
        const writeOffset = chunkIndex * WORKER_CHUNK_SIZE;
        const chunkData = new Uint8Array(data, 20); // 20-byte header
        accessHandle.write(chunkData, { at: writeOffset });
        
        meta.receivedChunks++;
        meta.lastReceivedIndex = Math.max(meta.lastReceivedIndex, chunkIndex);
        
        self.postMessage({ 
          type: 'buffer-return', 
          fileId: msg.fileId, 
          data: data 
        }, [data]);

        const progressInt = Math.min(Math.floor((meta.receivedChunks / meta.totalChunks) * 100), 100);
        if (progressInt > meta.lastReportedProgress || meta.receivedChunks === meta.totalChunks) {
          meta.lastReportedProgress = progressInt;
          self.postMessage({
            type: 'progress',
            fileId: msg.fileId,
            receivedChunks: meta.receivedChunks,
            lastReceivedIndex: meta.lastReceivedIndex
          });
        }
       } catch (err: unknown) {
        const error = err as { name?: string; message?: string };
        let message = error.message || 'Unknown worker write error';
        
        // DETECT STORAGE QUOTA EXCEEDED (Edge Case Part 2)
        if (error.name === 'QuotaExceededError' || message.includes('quota')) {
          message = 'DISK_FULL';
        }

        self.postMessage({ type: 'error', fileId: msg.fileId, error: message });
      }
    }
  }
  else if (msg.type === 'complete') {
    const accessHandle = accessHandles.get(msg.fileId);
    const fileHandle = fileHandles.get(msg.fileId);
    const meta = metadataMap.get(msg.fileId);

    if (accessHandle && fileHandle && meta) {
      self.postMessage({
        type: 'progress',
        fileId: msg.fileId,
        receivedChunks: meta.receivedChunks,
        lastReceivedIndex: meta.lastReceivedIndex
      });

      accessHandle.flush();
      accessHandle.close();
      
      const file = await fileHandle.getFile();
      
      // Transfer the file blob back to main thread
      self.postMessage({ 
        type: 'complete-success', 
        fileId: msg.fileId, 
        file,
        checksum: '' // Checksum disabled for performance
      });
      
      accessHandles.delete(msg.fileId);
      fileHandles.delete(msg.fileId);
      metadataMap.delete(msg.fileId);
      if (lastWriteCache?.fileId === msg.fileId) {
        lastWriteCache = null;
      }
    }
  }
  else if (msg.type === 'abort') {
    const meta = metadataMap.get(msg.fileId);
    if (meta) {
      const accessHandle = accessHandles.get(msg.fileId);
      if (accessHandle) accessHandle.close();
      
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(meta.opfsName);
      } catch {
        // Silent fail on cleanup
      }

      accessHandles.delete(msg.fileId);
      fileHandles.delete(msg.fileId);
      metadataMap.delete(msg.fileId);
      if (lastWriteCache?.fileId === msg.fileId) {
        lastWriteCache = null;
      }
      
      self.postMessage({ type: 'abort-success', fileId: msg.fileId });
    }
  }
}

// Checksum disabled for performance in current version
