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
  opfsName: string; // Store the exact salted name
  lastReportedProgress: number;
  receivedSet: Set<number>; // Dedup: track which chunks have been written
}

const fileHandles = new Map<string, FileSystemFileHandle>();
const accessHandles = new Map<string, SyncHandle>();
const metadataMap = new Map<string, WorkerTransferState>();
const lastProgressUpdate = new Map<string, number>();

const PROGRESS_THROTTLE_MS = 100;
const WORKER_CHUNK_SIZE = 64 * 1024; // 64KB - MUST match CHUNK_SIZE in fileTransfer.ts

// Speed performance: Pre-allocate reusable buffers and encoders
const encoder = new TextEncoder();
const fileIdViewMap = new Map<string, { v0: number, v1: number, v2: number, v3: number }>();

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
      const salt = (metadata as any).salt || '';
      const opfsName = salt ? `lynkless-${fileId}-${salt}` : `lynkless-${fileId}`;
      
      // Cache binary File ID for fast comparison
      const binaryId = (metadata as any).binaryId;
      if (binaryId) {
        const bid = new Uint8Array(binaryId);
        const bview = new DataView(bid.buffer, bid.byteOffset, bid.byteLength);
        fileIdViewMap.set(fileId, {
          v0: bview.getUint32(0, true),
          v1: bview.getUint32(4, true),
          v2: bview.getUint32(8, true),
          v3: bview.getUint32(12, true)
        });
      } else {
        const bid = encoder.encode(fileId);
        const bview = new DataView(bid.buffer, bid.byteOffset, bid.byteLength);
        fileIdViewMap.set(fileId, {
          v0: bview.getUint32(0, true),
          v1: bview.getUint32(4, true),
          v2: bview.getUint32(8, true),
          v3: bview.getUint32(12, true)
        });
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
        receivedSet: new Set()
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

    const accessHandle = accessHandles.get(msg.fileId);
    const meta = metadataMap.get(msg.fileId);
    const expected = fileIdViewMap.get(msg.fileId);
    
    if (accessHandle && meta && expected && chunkIndex !== undefined && data) {
      try {
        // Bolt: Fast binary header validation (zero-allocation 128-bit check)
        const view = new DataView(data);
        if (view.getUint32(0, true) !== expected.v0 ||
            view.getUint32(4, true) !== expected.v1 ||
            view.getUint32(8, true) !== expected.v2 ||
            view.getUint32(12, true) !== expected.v3) {
          return;
        }

        // Dedup: Skip if this chunk was already written (Tail Redundancy sends last chunks twice)
        if (meta.receivedSet.has(chunkIndex)) {
          // Still return the buffer for recycling
          self.postMessage({ 
            type: 'buffer-return', 
            fileId: msg.fileId, 
            data: data 
          }, [data]);
          return;
        }
        meta.receivedSet.add(chunkIndex);

        // Direct Synchronous Write (Atomic and Safe for out-of-order)
        const writeOffset = chunkIndex * 65536;
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
        if (progressInt > ((meta as any).lastReportedProgress || 0) || meta.receivedChunks === meta.totalChunks) {
          (meta as any).lastReportedProgress = progressInt;
          self.postMessage({
            type: 'progress',
            fileId: msg.fileId,
            receivedChunks: meta.receivedChunks,
            lastReceivedIndex: meta.lastReceivedIndex
          });
        }
       } catch (err: unknown) {
        const error = err as any;
        let message = error?.message || 'Unknown worker write error';
        
        // DETECT STORAGE QUOTA EXCEEDED (Edge Case Part 2)
        if (error?.name === 'QuotaExceededError' || message.includes('quota')) {
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
      fileIdViewMap.delete(msg.fileId);
      lastProgressUpdate.delete(msg.fileId);
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
      fileIdViewMap.delete(msg.fileId);
      lastProgressUpdate.delete(msg.fileId);
      
      self.postMessage({ type: 'abort-success', fileId: msg.fileId });
    }
  }
}

// Checksum disabled for performance in current version
