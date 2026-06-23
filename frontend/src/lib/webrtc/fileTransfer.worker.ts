/// <reference lib="webworker" />

interface TransferMetadata {
  id: string;
  size: number;
  totalChunks: number;
  salt?: string;
  binaryId?: Uint8Array;
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
  fileHandle: FileSystemFileHandle;
  accessHandle: SyncHandle;
  metadata: TransferMetadata;
  // Pre-calculated uint32 components for ultra-fast header validation
  exp0: number;
  exp1: number;
  exp2: number;
  exp3: number;
  receivedChunks: number;
  lastReceivedIndex: number;
  opfsName: string;
  lastReportedProgress: number;
  receivedBitfield: Uint8Array;
}

const activeTransfers = new Map<string, WorkerTransferState>();

/**
 * Cache for high-frequency binary intake (last file processed).
 * Consecutive chunks for the same file bypass Map lookups.
 */
let lastWriteCache: {
  fileId: string;
  state: WorkerTransferState;
  v0: number;
  v1: number;
  v2: number;
  v3: number;
} | null = null;

const HEADER_SIZE = 20;

const encoder = new TextEncoder();

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
      
      const expectedIdBuffer = metadata.binaryId ? new Uint8Array(metadata.binaryId) : encoder.encode(fileId);
      const expView = new DataView(expectedIdBuffer.buffer, expectedIdBuffer.byteOffset, expectedIdBuffer.byteLength);

      const fileHandle = await root.getFileHandle(opfsName, { create: true });
      const accessHandle = await (fileHandle as FileSystemFileHandle & { createSyncAccessHandle: () => Promise<SyncHandle> }).createSyncAccessHandle();

      if (metadata.size) {
        accessHandle.truncate(metadata.size);
      }
      
      const state: WorkerTransferState = {
        fileHandle,
        accessHandle,
        metadata,
        exp0: expView.getUint32(0, true),
        exp1: expView.getUint32(4, true),
        exp2: expView.getUint32(8, true),
        exp3: expView.getUint32(12, true),
        receivedChunks: 0,
        lastReceivedIndex: -1,
        opfsName,
        lastReportedProgress: 0,
        receivedBitfield: new Uint8Array(Math.ceil(metadata.totalChunks / 8))
      };

      activeTransfers.set(fileId, state);
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

    // PRE-FLIGHT GUARD: Ensure buffer is large enough for header
    if (data.byteLength < HEADER_SIZE) {
      self.postMessage({ type: 'buffer-return', fileId: msg.fileId, data: data }, [data]);
      return;
    }

    const view = new DataView(data);
    const v0 = view.getUint32(0, true);
    const v1 = view.getUint32(4, true);
    const v2 = view.getUint32(8, true);
    const v3 = view.getUint32(12, true);

    let state: WorkerTransferState | undefined;

    // Bolt: Fast-path via single-slot cache for consecutive chunks
    if (lastWriteCache &&
        v0 === lastWriteCache.v0 &&
        v1 === lastWriteCache.v1 &&
        v2 === lastWriteCache.v2 &&
        v3 === lastWriteCache.v3) {
      state = lastWriteCache.state;
    } else {
      state = activeTransfers.get(msg.fileId);
      if (state) {
        // Seed the cache
        lastWriteCache = { fileId: msg.fileId, state, v0, v1, v2, v3 };
      }
    }
    
    if (state && chunkIndex !== undefined) {
      try {
        // O(1) Header Validation via pre-calculated uint32 components
        if (v0 !== state.exp0 || v1 !== state.exp1 || v2 !== state.exp2 || v3 !== state.exp3) {
          self.postMessage({ type: 'buffer-return', fileId: msg.fileId, data: data }, [data]);
          return;
        }

        // Micro-optimized bitfield operations (>> 3 and & 7)
        const byteIndex = chunkIndex >> 3;
        const bitMask = 1 << (chunkIndex & 7);

        if ((state.receivedBitfield[byteIndex] & bitMask) !== 0) {
          self.postMessage({ type: 'buffer-return', fileId: msg.fileId, data: data }, [data]);
          return;
        }
        state.receivedBitfield[byteIndex] |= bitMask;

        const writeOffset = chunkIndex * 65536;
        const chunkData = new Uint8Array(data, HEADER_SIZE);
        state.accessHandle.write(chunkData, { at: writeOffset });
        
        state.receivedChunks++;
        state.lastReceivedIndex = Math.max(state.lastReceivedIndex, chunkIndex);
        
        self.postMessage({ type: 'buffer-return', fileId: msg.fileId, data: data }, [data]);

        const progressInt = Math.min(Math.floor((state.receivedChunks / state.metadata.totalChunks) * 100), 100);
        if (progressInt > state.lastReportedProgress || state.receivedChunks === state.metadata.totalChunks) {
          state.lastReportedProgress = progressInt;
          self.postMessage({
            type: 'progress',
            fileId: msg.fileId,
            receivedChunks: state.receivedChunks,
            lastReceivedIndex: state.lastReceivedIndex
          });
        }
       } catch (err: unknown) {
        const message = (err as Error)?.message || 'Unknown worker write error';
        if ((err as { name?: string })?.name === 'QuotaExceededError' || message.includes('quota')) {
          self.postMessage({ type: 'error', fileId: msg.fileId, error: 'DISK_FULL' });
        } else {
          self.postMessage({ type: 'error', fileId: msg.fileId, error: message });
        }
      }
    } else {
      // Return buffer even if no state found to prevent leak
      self.postMessage({ type: 'buffer-return', fileId: msg.fileId, data: data }, [data]);
    }
  }
  else if (msg.type === 'complete') {
    const state = activeTransfers.get(msg.fileId);

    if (state) {
      self.postMessage({
        type: 'progress',
        fileId: msg.fileId,
        receivedChunks: state.receivedChunks,
        lastReceivedIndex: state.lastReceivedIndex
      });

      state.accessHandle.flush();
      state.accessHandle.close();
      
      const file = await state.fileHandle.getFile();
      
      self.postMessage({ 
        type: 'complete-success', 
        fileId: msg.fileId, 
        file,
        checksum: ''
      });
      
      activeTransfers.delete(msg.fileId);
      if (lastWriteCache?.fileId === msg.fileId) lastWriteCache = null;
    }
  }
  else if (msg.type === 'abort') {
    const state = activeTransfers.get(msg.fileId);
    if (state) {
      state.accessHandle.close();
      
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(state.opfsName);
      } catch {
        // Silent fail on cleanup
      }

      activeTransfers.delete(msg.fileId);
      if (lastWriteCache?.fileId === msg.fileId) lastWriteCache = null;
      self.postMessage({ type: 'abort-success', fileId: msg.fileId });
    }
  }
}
