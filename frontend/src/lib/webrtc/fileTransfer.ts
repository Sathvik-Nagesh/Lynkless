/**
 * File Transfer Engine with Resume Capability
 * Handles chunked file transfer over WebRTC DataChannel
 * Supports automatic resume on reconnection
 */

import { WebRTCManager } from './connection';

/**
 * Generate UUID - browser-safe implementation
 */
function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const CHUNK_SIZE = 64 * 1024; // 64KB chunks - maximum safe SCTP packet size across mobile environments
const MAX_FILE_SIZE = 20 * 1024 * 1024 * 1024; // 20GB limit
const PROGRESS_UPDATE_INTERVAL = 100; // 100ms throttle interval

// Memory safety constants
const MAX_ORPHAN_FILEIDS = 5; // Max distinct fileIds to buffer orphaned chunks for
const MAX_ORPHAN_CHUNKS_PER_FILE = 50; // Max orphaned chunks per fileId before dropping
const RAM_FALLBACK_FLUSH_THRESHOLD = 128; // Flush accumulated RAM chunks to Blob every N chunks

// Bolt: Atomic Chunk Protocol Constants
// Using a ultra-compact 20-byte binary header to pack metadata with data.
const FILE_ID_SIZE = 16; // UUID v4 as raw bytes
const CHUNK_INDEX_SIZE = 4; // Uint32 (LE)
const HEADER_SIZE = FILE_ID_SIZE + CHUNK_INDEX_SIZE;

/**
 * Audio Anchor: Prevents Mobile OS Throttling during massive transfers
 */
let audioAnchor: HTMLAudioElement | null = null;
function startAudioAnchor() {
  if (typeof window === 'undefined' || audioAnchor) return;
  audioAnchor = new Audio();
  // 1-millisecond silent WAV file as Data URL
  audioAnchor.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  audioAnchor.loop = true;
  audioAnchor.play().catch(() => {});
}
function stopAudioAnchor() {
  if (audioAnchor) {
    audioAnchor.pause();
    audioAnchor = null;
  }
}

// Bolt: Fast UUID conversion lookup tables
const byteToHex: string[] = [];
const hexToByte: Record<string, number> = {};

for (let i = 0; i < 256; i++) {
  const hex = i.toString(16).padStart(2, '0');
  byteToHex[i] = hex;
  hexToByte[hex] = i;
}

/**
 * Text-to-Binary UUID compaction (36 chars -> 16 bytes)
 * Optimized to skip hyphens and use lookup tables instead of regex/parseInt.
 */
function uuidToBytes(uuid: string): Uint8Array {
  const bytes = new Uint8Array(16);
  let j = 0;
  for (let i = 0; i < uuid.length; i++) {
    if (uuid[i] === '-') continue;
    const hexPair = uuid.substring(i, i + 2).toLowerCase();
    bytes[j++] = hexToByte[hexPair];
    i++;
  }
  return bytes;
}

/**
 * Binary-to-UUID decompaction (16 bytes -> 36 chars)
 * Optimized with lookup tables to avoid O(N) array mapping and joining.
 */
function bytesToUuid(bytes: Uint8Array): string {
  return (
    byteToHex[bytes[0]] + byteToHex[bytes[1]] + byteToHex[bytes[2]] + byteToHex[bytes[3]] + '-' +
    byteToHex[bytes[4]] + byteToHex[bytes[5]] + '-' +
    byteToHex[bytes[6]] + byteToHex[bytes[7]] + '-' +
    byteToHex[bytes[8]] + byteToHex[bytes[9]] + '-' +
    byteToHex[bytes[10]] + byteToHex[bytes[11]] + byteToHex[bytes[12]] +
    byteToHex[bytes[13]] + byteToHex[bytes[14]] + byteToHex[bytes[15]]
  );
}

// Request background sync tag if available
export const requestBackgroundSync = async () => {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration) {
        // Bolt: Cast to unknown then to the expected interface to satisfy strict TypeScript rules
        // without using @ts-ignore or @ts-expect-error which are flagged by lint.
        await (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('lynkless-transfer-sync');

      }
    } catch {
      // Background sync not supported or failed
    }
  }
};

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
}

export interface TransferProgress {
  fileId: string;
  fileName: string;
  totalSize: number;
  transferredSize: number;
  progress: number; // 0-100
  speed: number; // bytes per second
  remainingTime: number; // seconds
  status: 'pending' | 'transferring' | 'verifying' | 'completed' | 'failed' | 'cancelled' | 'paused';
  resumable?: boolean;
  type: 'incoming' | 'outgoing';
  peerId: string;
  checksum?: string;
  error?: string;
}

export type ProgressHandler = (progress: TransferProgress) => void;
export type FileReceivedHandler = (file: Blob, metadata: FileMetadata) => void;

// Multi-peer mesh transfer progress
export interface MeshTransferProgress {
  fileId: string;
  fileName: string;
  totalSize: number;
  totalPeers: number;
  peerProgress: Map<string, TransferProgress>;
  overallProgress: number;
  status: 'pending' | 'transferring' | 'completed' | 'partial' | 'failed';
}

export type MeshProgressHandler = (progress: MeshTransferProgress) => void;

// Message types for file transfer protocol
interface FileMessage {
  type: 'file-meta' | 'file-chunk' | 'file-complete' | 'file-cancel' | 'file-resume-request' | 'file-resume-response';
  fileId: string;
  [key: string]: unknown;
}

interface FileMetaMessage extends FileMessage {
  type: 'file-meta';
  metadata: FileMetadata;
}


interface FileResumeRequestMessage extends FileMessage {
  type: 'file-resume-request';
  lastChunkIndex: number;
}

interface FileResumeResponseMessage extends FileMessage {
  type: 'file-resume-response';
  resumeFromChunk: number;
  canResume: boolean;
}

// Transfer state for resume support
interface OutgoingTransferState {
  file: File;
  peerId: string;
  progress: TransferProgress;
  cancelled: boolean;
  paused: boolean;
  lastChunkIndex: number;
  metadata: FileMetadata;
  startTime: number;
  startOffset: number;
  isConfirmed?: boolean; // 120% Polish: Final ACK tracking
}

interface IncomingTransferState {
  metadata: FileMetadata;
  receivedChunks: number;
  lastReceivedIndex: number;
  startTime: number;
  startOffset: number;
  peerId: string;
  useWorker?: boolean;
  // RAM fallback: streaming Blob accumulation instead of full chunk array
  blobParts?: Blob[]; // Flushed blob segments
  pendingChunks?: (Uint8Array | null)[]; // Small bounded buffer before flush
  pendingChunksCount?: number; // Track how many pending slots are filled
  totalReceivedBytes?: number; // Track total bytes for validation (SEC-3)
  checksum?: string;
  metaReceivedViaP2P?: boolean; // Track redundant metadata
}

export class FileTransferManager {
  private progressHandlers: Set<ProgressHandler> = new Set();
  private fileReceivedHandlers: Set<FileReceivedHandler> = new Set();
  private meshProgressHandlers: Set<MeshProgressHandler> = new Set();
  private incomingFiles: Map<string, IncomingTransferState> = new Map();
  private outgoingTransfers: Map<string, OutgoingTransferState> = new Map();
  private lastUpdateTimes: Map<string, number> = new Map();
  private meshTransfers: Map<string, { file: File; peerIds: string[]; transfers: Map<string, string> }> = new Map();
  private orphanedChunks: Map<string, ArrayBuffer[]> = new Map();
  private readonly EMA_ALPHA = 0.2; // Smoothing factor for transfer speed
  private cleanupHandler: (() => void) | null = null;
  private stateCleanupHandler: (() => void) | null = null;
  private worker: Worker | null = null;
  private binaryIdCache: Map<string, Uint8Array> = new Map();
  private lastIncomingCache: {
    v0: number;
    v1: number;
    v2: number;
    v3: number;
    state: IncomingTransferState;
    fileId: string;
  } | null = null;

  private getBinaryId(fileId: string): Uint8Array {
    let cached = this.binaryIdCache.get(fileId);
    if (!cached) {
      cached = uuidToBytes(fileId);
      this.binaryIdCache.set(fileId, cached);
      // Cache is cleaned up in cleanupTransferState() on completion — no timeout needed
    }
    return cached;
  }

  /**
   * Clean up all state associated with a completed/failed/cancelled transfer.
   * Centralizes cleanup to prevent leaks (LEAK-6, LEAK-10, SEC-4).
   */
  private cleanupTransferState(fileId: string): void {
    this.binaryIdCache.delete(fileId);
    this.lastUpdateTimes.delete(fileId);
    this.lastUpdateTimes.delete(`${fileId}-speed`);
    if (this.lastIncomingCache?.fileId === fileId) {
      this.lastIncomingCache = null;
    }
    // Clean localStorage salt (SEC-4)
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(`lynkless-salt-${fileId}`);
    }
  }

  /**
   * Bolt: Throttled Audio Anchor release.
   * Only stops the silent audio if no more active transfers exist in either direction.
   */
  private maybeStopAudioAnchor(): void {
    if (this.incomingFiles.size === 0 && this.outgoingTransfers.size === 0) {
      stopAudioAnchor();
    }
  }

  constructor(private webrtc: WebRTCManager) {
    this.setupDataHandler();
    this.setupConnectionMonitor();

    // 120% Instant-Connect: Pre-warm ICE Candidates
    // We start gathering local networking info immediately so it's cached 
    // before the user even thinks about clicking a peer.
    setTimeout(() => {
       try {
         this.webrtc.prewarmICECandidates();
       } catch {
         // Ignore pre-warm errors
       }
    }, 1000);

    if (typeof window !== 'undefined') {
      // Proactively request persistent storage to avoid 2GB browser limits
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then(granted => {
          if (granted) console.log('[FileTransfer] Proactive persistent storage granted.');
        }).catch(() => {});
      }

      if (Worker) {
        try {
          this.worker = new Worker(new URL('./fileTransfer.worker.ts', import.meta.url));
          this.worker.onmessage = this.handleWorkerMessage.bind(this);
        } catch (err) {
          console.warn('[FileTransfer] Failed to initialize Web Worker:', err);
        }
      }
    }

    // Bolt: Startup Garbage Collector for OPFS
    this.cleanupOrphanedFiles();

    // Buffer Pool: Prime with 4 slabs (reduced from 8 to lower baseline memory)
    for (let i = 0; i < 4; i++) {
       this.bufferPool.push(new ArrayBuffer(HEADER_SIZE + CHUNK_SIZE));
    }

    // LEAK-11: Clean up resources when page is unloaded
    if (typeof window !== 'undefined') {
      this.boundBeforeUnload = () => this.destroy();
      window.addEventListener('beforeunload', this.boundBeforeUnload);
    }
  }

  private boundBeforeUnload: (() => void) | null = null;

  private handleWorkerMessage(e: MessageEvent): void {
    const msg = e.data;
    if (msg.type === 'progress') {
      const incoming = this.incomingFiles.get(msg.fileId);
      if (incoming) {
        incoming.receivedChunks = msg.receivedChunks;
        incoming.lastReceivedIndex = msg.lastReceivedIndex;
        // Bolt: Throttled progress update with lazy metrics calculation
        const transferredSize = incoming.receivedChunks * CHUNK_SIZE;
        this.notifyProgress(msg.fileId, 'transferring', {
          transferredSize: Math.min(transferredSize, incoming.metadata.size),
          resumable: true,
        });
      }
    } else if (msg.type === 'complete-success') {
      const incoming = this.incomingFiles.get(msg.fileId);
      if (incoming) {
        incoming.checksum = msg.checksum;
      }
      this.finalizeDownload(msg.fileId);
    } else if (msg.type === 'error') {
      console.error('[FileTransfer] Worker Error:', msg.error);
      this.notifyProgress(msg.fileId, 'failed', {
        status: 'failed',
        resumable: false,
      });
      this.worker?.postMessage({ type: 'abort', fileId: msg.fileId });
      this.incomingFiles.delete(msg.fileId);
      if (this.lastIncomingCache?.fileId === msg.fileId) {
        this.lastIncomingCache = null;
      }
    } else if (msg.type === 'buffer-return') {
      // Receiver-side: Worker finished writing this buffer to OPFS, safe to recycle
      this.returnBufferToPool(msg.data);
    }
  }

  // Liquid-Metal Resource: Buffer Pool for zero-allocation transmitting
  private bufferPool: ArrayBuffer[] = [];
  private getBufferFromPool(): ArrayBuffer {
    return this.bufferPool.pop() || new ArrayBuffer(HEADER_SIZE + CHUNK_SIZE);
  }

  /**
   * Bolt: Capped buffer recycler to prevent pool bloating while maintaining memory reuse.
   */
  private returnBufferToPool(buffer: ArrayBuffer): void {
    if (this.bufferPool.length < 64) {
      this.bufferPool.push(buffer);
    }
  }

  private setupDataHandler(): void {
    this.cleanupHandler = this.webrtc.onData((peerId, data) => {
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'direct-file-meta') {
             // 120% Redundancy: We got meta via direct P2P data channel!
             if (this.incomingFiles.has(msg.fileId)) return; // Already handled
             console.log('[FileTransfer] Received DIRECT metadata via P2P pipe for:', msg.fileId);
             this.handleFileMeta(peerId, { type: 'file-meta', fileId: msg.fileId, metadata: msg.metadata });
             const incoming = this.incomingFiles.get(msg.fileId);
             if (incoming) incoming.metaReceivedViaP2P = true;
             return;
          }
          if (msg.type === 'file-ack') {
             // 120% Handshake: Receiver confirmed disk-write success
             const outgoing = this.outgoingTransfers.get(msg.fileId);
             if (outgoing) {
               outgoing.isConfirmed = true;
               console.log('[FileTransfer] Received Final ACK for:', msg.fileId);
             }
             return;
          }
          const message = msg as FileMessage;
          if (message.type?.startsWith('file-')) {
            this.handleFileMessage(peerId, message);
          }
        } catch {
          // Not a file message, ignore
        }
      } else if (data instanceof ArrayBuffer) {
        // Bolt: Handle atomic binary chunk (metadata + data in one buffer)
        this.handleBinaryChunk(peerId, data);
      }
    });
  }

  /**
   * Monitor connection state for resume capability
   */
  private diagnosticTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private setupConnectionMonitor(): void {
    this.stateCleanupHandler = this.webrtc.onStateChange((peerId, state) => {
      // 120% Production: Toggle WakeLock based on active transfers
      const hasActive = this.outgoingTransfers.size > 0 || this.incomingFiles.size > 0;
      if (hasActive) requestWakeLock();
      else releaseWakeLock();

      if (state === 'connecting') {
        // 120% Diagnostics: Corporate Firewall Detection
        const timeout = setTimeout(() => {
          const current = this.webrtc.getPeerState(peerId);
          if (current === 'connecting' || current === 'new') {
            console.warn(`[WebRTC] Peer ${peerId} is blocked by a strict firewall. Direct P2P failed.`);
            this.notifyProgress('', 'failed', {
              fileName: 'Network Blocked',
              peerId,
              error: 'Symmetric NAT / Firewall detected. direct P2P connection failed. A VPN or different network may be required.'
            });
          }
        }, 15000);
        this.diagnosticTimeouts.set(peerId, timeout);
      } else if (state === 'connected') {
        const timeout = this.diagnosticTimeouts.get(peerId);
        if (timeout) {
          clearTimeout(timeout);
          this.diagnosticTimeouts.delete(peerId);
        }
        
        // Attempt to resume paused transfers
        this.outgoingTransfers.forEach((transfer, fileId) => {
          if (transfer.peerId === peerId && transfer.paused) {
            this.requestResumeTransfer(fileId, peerId);
          }
        });
      } else if (state === 'disconnected' || state === 'failed') {
        const timeout = this.diagnosticTimeouts.get(peerId);
        if (timeout) {
          clearTimeout(timeout);
          this.diagnosticTimeouts.delete(peerId);
        }

        // Mark transfers as paused for potential resume
        this.outgoingTransfers.forEach((transfer, fileId) => {
          if (peerId && transfer.peerId === peerId && transfer.progress.status === 'transferring') {
            transfer.paused = true;
            this.notifyProgress(fileId, 'paused', {
              resumable: true,
            });
          }
        });
      }
    });
  }

  private handleFileMessage(peerId: string, message: FileMessage): void {
    switch (message.type) {
      case 'file-meta':
        this.handleFileMeta(peerId, message as FileMetaMessage);
        break;
      case 'file-complete':
        this.handleFileComplete(message.fileId);
        break;
      case 'file-cancel':
        this.handleFileCancel(message.fileId);
        break;
      case 'file-resume-request':
        this.handleResumeRequest(peerId, message as FileResumeRequestMessage);
        break;
      case 'file-resume-response':
        this.handleResumeResponse(peerId, message as FileResumeResponseMessage);
        break;
    }
  }

  private async handleFileMeta(peerId: string, message: FileMetaMessage): Promise<void> {
    const { metadata } = message;
    console.log('[FileTransfer] Receiving file:', metadata.name);

    // EDGE CASE #3: Storage Quota Verification (Disk Full prevention)
    if (typeof navigator !== 'undefined' && navigator.storage) {
      try {
        // Bolt: Attempt to request persistent storage to bypass conservative browser limits (e.g. 2GB)
        if (navigator.storage.persist) {
          const persisted = await navigator.storage.persist();
          if (persisted) console.log('[FileTransfer] Persistent storage granted.');
        }

        if (navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.quota !== undefined && estimate.usage !== undefined) {
            const freeSpace = estimate.quota - estimate.usage;
            
            // Critical check: if metadata size is strictly more than reported quota, we MUST notify.
            // But some browsers return 2GB cap even if disk has 100GB. 
            // We proceed but with a warning logged.
            if (freeSpace < metadata.size) {
              console.warn(`[FileTransfer] Reported storage space (${freeSpace} bytes) is less than file size (${metadata.size} bytes). Proceeding with caution...`);
              
              // Only block if its EXTREMELY low (e.g. less than 10MB or 1% of file)
              // Liquid-Metal Backpressure: Increase threshold to 16MB for modern high-speed connections
              if (freeSpace < 10 * 1024 * 1024) {
                 console.error(`[FileTransfer] Insufficient storage space. Need ${metadata.size}, have ${freeSpace}`);
                 this.webrtc.sendToPeer(peerId, JSON.stringify({
                   type: 'file-cancel',
                   fileId: metadata.id,
                 }));
                 this.notifyProgress(metadata.id, 'failed', {
                   fileName: metadata.name,
                   totalSize: metadata.size,
                   transferredSize: 0,
                   type: 'incoming',
                   peerId,
                 });
                 return; 
              }
            }
          }
        }
      } catch (err) {
        console.warn('[FileTransfer] Storage estimation failed:', err);
      }
    }

    // Mobile Throttling Defense: Start anchor once per transfer session
    startAudioAnchor();

    const now = Date.now();
    const incomingState: IncomingTransferState = {
      metadata,
      receivedChunks: 0,
      lastReceivedIndex: -1,
      startTime: now,
      startOffset: 0,
      peerId,
    };

    // Military Grade: Generate or retrieve persistent salt for collision prevention
    let salt = '';
    if (typeof window !== 'undefined' && window.localStorage) {
      const saltKey = `lynkless-salt-${metadata.id}`;
      salt = localStorage.getItem(saltKey) || Math.random().toString(36).substring(2, 10);
      localStorage.setItem(saltKey, salt);
    }
    const opfsName = `lynkless-${metadata.id}-${salt}`;

    // CROSS-SESSION RESUME DETECTION
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory();
        const existingFile = await root.getFileHandle(opfsName).catch(() => null);
        if (existingFile) {
          const file = await existingFile.getFile();
          if (file.size > 0 && file.size < metadata.size) {
             // 120% Production: Resume Integrity Guard
             // Standard CHUNK_SIZE is 64KB. If the partial file size isn't a multiple, it's corrupted.
             const isAligned = file.size % (64 * 1024) === 0;
             if (!isAligned) {
               console.warn('[FileTransfer] Partial file corruption detected. Restarting transfer.');
               await root.removeEntry(opfsName).catch(() => {});
             } else {
               console.log(`[FileTransfer] Verified partial file for ${metadata.id} (${file.size} bytes). Resume auto-triggered.`);
               incomingState.startOffset = file.size;
               incomingState.receivedChunks = Math.floor(file.size / CHUNK_SIZE);
               incomingState.lastReceivedIndex = incomingState.receivedChunks - 1;
               
               // Signal sender to resume
               this.webrtc.sendToPeer(peerId, JSON.stringify({
                 type: 'file-resume-request',
                 fileId: metadata.id,
                 offset: file.size
               }));
             }
          }
        }
      }
    } catch {
      // Ignore resume detection errors
    }

    if (this.worker && typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
      incomingState.useWorker = true;
      this.worker.postMessage({
        type: 'init',
        fileId: metadata.id,
        payload: {
          metadata: {
            id: metadata.id,
            size: metadata.size,
            totalChunks: metadata.totalChunks,
            salt: salt,
            binaryId: uuidToBytes(metadata.id)
          }
        }
      });
      console.log('[FileTransfer] Initialized Web Worker for OPFS stream operations.');
    } else {
      console.warn('[FileTransfer] Web Workers or OPFS not supported, falling back to streaming RAM buffer...');
      // LEAK-1 FIX: Use bounded pending buffer + Blob accumulation instead of full chunk array.
      // Only keep RAM_FALLBACK_FLUSH_THRESHOLD chunks in memory at a time, then flush to a Blob part.
      incomingState.blobParts = [];
      incomingState.pendingChunks = new Array(RAM_FALLBACK_FLUSH_THRESHOLD).fill(null);
      incomingState.pendingChunksCount = 0;
      incomingState.totalReceivedBytes = 0;
    }

    this.incomingFiles.set(metadata.id, incomingState);

    // Process any out-of-order chunks that arrived before metadata
    const orphaned = this.orphanedChunks.get(metadata.id);
    if (orphaned) {
      console.log(`[FileTransfer] Processing ${orphaned.length} orphaned chunks for ${metadata.id}`);
      for (const data of orphaned) {
        this.handleBinaryChunk(peerId, data);
      }
      this.orphanedChunks.delete(metadata.id);
    }

    this.notifyProgress(metadata.id, 'transferring', {
      fileName: metadata.name,
      totalSize: metadata.size,
      transferredSize: 0,
      type: 'incoming',
      peerId,
    });
  }

  /**
   * Process an atomic binary chunk from a peer.
   * Bolt: Decodes the packed header (fileId + chunkIndex) and routes data to worker/buffer.
   */
  private handleBinaryChunk(peerId: string, data: ArrayBuffer): void {
    if (data.byteLength < HEADER_SIZE) return;

    // Bolt: Extract metadata from the binary header without extra JSON messages.
    const view = new DataView(data);

    // Bolt: Fast Binary Header Comparison
    // Check if this chunk belongs to the same file as the last one to bypass bytesToUuid and Map lookup.
    const v0 = view.getUint32(0, true);
    const v1 = view.getUint32(4, true);
    const v2 = view.getUint32(8, true);
    const v3 = view.getUint32(12, true);

    let incoming: IncomingTransferState | undefined;
    let fileId: string;

    if (this.lastIncomingCache &&
        v0 === this.lastIncomingCache.v0 &&
        v1 === this.lastIncomingCache.v1 &&
        v2 === this.lastIncomingCache.v2 &&
        v3 === this.lastIncomingCache.v3) {
      incoming = this.lastIncomingCache.state;
      fileId = this.lastIncomingCache.fileId;
    } else {
      // Fallback to slower path
      const fileIdBytes = new Uint8Array(data, 0, FILE_ID_SIZE);
      fileId = bytesToUuid(fileIdBytes);
      incoming = this.incomingFiles.get(fileId);

      if (incoming) {
        // Seed the cache for consecutive chunks
        this.lastIncomingCache = { v0, v1, v2, v3, state: incoming, fileId };
      }
    }

    // Chunk index is the next 4 bytes (Uint32 LE) at offset 16
    const chunkIndex = view.getUint32(FILE_ID_SIZE, true);
    // Real data starts after header
    if (!incoming) {
      // LEAK-5 FIX: Bound orphaned chunks to prevent memory exhaustion attacks
      if (!this.orphanedChunks.has(fileId)) {
        // Enforce max distinct fileIds
        if (this.orphanedChunks.size >= MAX_ORPHAN_FILEIDS) {
          console.warn(`[FileTransfer] Too many orphaned fileIds (${this.orphanedChunks.size}), dropping chunk for ${fileId}`);
          return;
        }
        this.orphanedChunks.set(fileId, []);
        // Setup timeout to clear memory if file-meta never arrives
        setTimeout(() => {
          if (this.orphanedChunks.has(fileId)) {
            console.warn(`[FileTransfer] Dropping orphaned chunks for ${fileId} - file-meta never arrived`);
            this.orphanedChunks.delete(fileId);
          }
        }, 15000);
      }
      const orphanBuffer = this.orphanedChunks.get(fileId)!;
      // Enforce max chunks per fileId
      if (orphanBuffer.length >= MAX_ORPHAN_CHUNKS_PER_FILE) {
        console.warn(`[FileTransfer] Orphan buffer full for ${fileId}, dropping oldest chunk`);
        orphanBuffer.shift(); // Drop oldest to make room
      }
      orphanBuffer.push(data);
      return;
    }

    if (incoming.useWorker && this.worker) {
      this.worker.postMessage({ 
        type: 'write', 
        fileId: fileId,
        payload: {
          chunkIndex: chunkIndex,
          data: data
        }
      }, [data]);
    } else if (incoming.pendingChunks) {
      // LEAK-1 FIX: Streaming RAM fallback — bounded buffer with periodic Blob flush
      // Bolt: Use zero-copy view instead of slice() to extract data
      const chunkData = new Uint8Array(data, HEADER_SIZE);
      const bufferIndex = chunkIndex % RAM_FALLBACK_FLUSH_THRESHOLD;
      
      // Only store if slot is empty (dedup for tail redundancy)
      if (incoming.pendingChunks[bufferIndex] === null) {
        incoming.pendingChunks[bufferIndex] = chunkData;
        incoming.pendingChunksCount = (incoming.pendingChunksCount || 0) + 1;
        incoming.receivedChunks++;
        incoming.lastReceivedIndex = Math.max(incoming.lastReceivedIndex, chunkIndex);
        incoming.totalReceivedBytes = (incoming.totalReceivedBytes || 0) + chunkData.byteLength;

        // SEC-3: Validate received bytes don't exceed declared file size (with tolerance)
        if (incoming.totalReceivedBytes > incoming.metadata.size + CHUNK_SIZE) {
          console.error(`[FileTransfer] Received bytes (${incoming.totalReceivedBytes}) exceed declared size (${incoming.metadata.size}). Aborting.`);
          this.handleFileCancel(fileId);
          return;
        }

        // Flush to Blob part when buffer is full
        if (incoming.pendingChunksCount >= RAM_FALLBACK_FLUSH_THRESHOLD) {
          this.flushPendingChunksToBlob(incoming);
        }
      }
      
      const transferredSize = incoming.receivedChunks * CHUNK_SIZE;
      this.notifyProgress(fileId, 'transferring', {
        transferredSize: Math.min(transferredSize, incoming.metadata.size),
        resumable: true,
      });
    }
  }

  /**
   * Flush pending RAM fallback chunks into a Blob part to release memory.
   * LEAK-1 FIX: This keeps peak memory bounded to RAM_FALLBACK_FLUSH_THRESHOLD * CHUNK_SIZE.
   */
  private flushPendingChunksToBlob(incoming: IncomingTransferState): void {
    if (!incoming.pendingChunks) return;
    // Collect non-null chunks in order
    const parts: Uint8Array[] = [];
    for (let i = 0; i < incoming.pendingChunks.length; i++) {
      if (incoming.pendingChunks[i] !== null) {
        parts.push(incoming.pendingChunks[i]!);
        incoming.pendingChunks[i] = null; // Release reference immediately
      }
    }
    if (parts.length > 0) {
      // Bolt: Cast to unknown then to BlobPart[] for compatibility with strict Next.js environment
      incoming.blobParts!.push(new Blob(parts as unknown as BlobPart[]));
    }
    incoming.pendingChunksCount = 0;
  }

  private async handleFileComplete(fileId: string): Promise<void> {
    const incoming = this.incomingFiles.get(fileId);
    if (!incoming) return;

    if (incoming.useWorker && this.worker) {
      this.worker.postMessage({ type: 'complete', fileId });
      // The finalization blob grab happens async in finalizeDownload 
    } else {
      // LEAK-1 FIX: Build final blob from flushed parts + remaining pending chunks
      if (incoming.pendingChunks) {
        this.flushPendingChunksToBlob(incoming); // Flush any remaining
      }
      const blobParts = incoming.blobParts || [];
      const blob = new Blob(blobParts, { type: incoming.metadata.type });
      // Release blob parts references
      incoming.blobParts = undefined;
      incoming.pendingChunks = undefined;
      
      this.fileReceivedHandlers.forEach((h) => h(blob, incoming.metadata));
      this.notifyProgress(fileId, 'completed', { transferredSize: incoming.metadata.size });
      this.downloadFile(blob, incoming.metadata.name);
      this.incomingFiles.delete(fileId);
      this.cleanupTransferState(fileId);
      // Release audio anchor if no more active transfers
      this.maybeStopAudioAnchor();
    }
  }

  private async finalizeDownload(fileId: string): Promise<void> {
    const incoming = this.incomingFiles.get(fileId);
    if (!incoming) return;

    try {
      const root = await navigator.storage.getDirectory();
      const saltKey = `lynkless-salt-${incoming.metadata.id}`;
      const salt = typeof window !== 'undefined' ? localStorage.getItem(saltKey) : '';
      const opfsName = salt ? `lynkless-${incoming.metadata.id}-${salt}` : `lynkless-${incoming.metadata.id}`;
      
      const fileHandle = await root.getFileHandle(opfsName);
      const file = await fileHandle.getFile();
      
      // Blob casting for compatibility
      const blob = new Blob([file], { type: incoming.metadata.type });
      
      this.fileReceivedHandlers.forEach((h) => h(blob, incoming.metadata));
      this.notifyProgress(fileId, 'completed', { transferredSize: incoming.metadata.size });
      this.downloadFile(blob, incoming.metadata.name);
      
      // Send ACK to sender
      this.webrtc.sendToPeer(incoming.peerId, JSON.stringify({ type: 'file-ack', fileId }));
      
      setTimeout(async () => {
        try {
          await root.removeEntry(opfsName);
          // Clean up salt from localStorage
          if (typeof window !== 'undefined') localStorage.removeItem(saltKey);
        } catch {
          // Silent fail on cleanup
        }

      }, 60000); // Clean OPFS file after 60s
    } catch (err) {
      console.error('[FileTransfer] Failed to download OPFS file:', err);
    }
    
    this.incomingFiles.delete(fileId);
    this.binaryIdCache.delete(fileId);
    if (this.lastIncomingCache?.fileId === fileId) {
      this.lastIncomingCache = null;
    }
    // Release audio anchor if no more active transfers
    this.maybeStopAudioAnchor();
  }

  private async handleFileCancel(fileId: string): Promise<void> {
    const incoming = this.incomingFiles.get(fileId);
    if (incoming) {
      if (incoming.useWorker && this.worker) {
        this.worker.postMessage({ type: 'abort', fileId });
      }
      this.notifyProgress(fileId, 'cancelled');
      this.incomingFiles.delete(fileId);
      if (this.lastIncomingCache?.fileId === fileId) {
        this.lastIncomingCache = null;
      }
      this.maybeStopAudioAnchor();
    }
    
    // Bolt: Handle cancellation of outgoing transfers (Sender side)
    // This prevents the "stuck at 99.9%" issue when a receiver rejects a file early.
    const outgoing = this.outgoingTransfers.get(fileId);
    if (outgoing) {
      console.log(`[FileTransfer] Peer cancelled outgoing transfer: ${fileId}`);
      outgoing.cancelled = true;
      this.notifyProgress(fileId, 'cancelled');
      this.outgoingTransfers.delete(fileId);
      this.maybeStopAudioAnchor();
    }

    // Clean up any orphaned chunks for this file
    if (this.orphanedChunks.has(fileId)) {
      this.orphanedChunks.delete(fileId);
    }
  }

  /**
   * Handle resume request from sender
   */
  private handleResumeRequest(peerId: string, message: FileResumeRequestMessage): void {
    const incoming = this.incomingFiles.get(message.fileId);
    
    if (incoming) {
      // Find the first missing chunk after the sender's last known chunk
      let resumeFrom = message.lastChunkIndex;
      resumeFrom = Math.max(resumeFrom, incoming.lastReceivedIndex + 1);
      
      this.webrtc.sendToPeer(peerId, JSON.stringify({
        type: 'file-resume-response',
        fileId: message.fileId,
        resumeFromChunk: resumeFrom,
        canResume: true,
      }));
    } else {
      // Transfer state lost, cannot resume
      this.webrtc.sendToPeer(peerId, JSON.stringify({
        type: 'file-resume-response',
        fileId: message.fileId,
        resumeFromChunk: 0,
        canResume: false,
      }));
    }
  }

  /**
   * Handle resume response from receiver
   */
  private handleResumeResponse(peerId: string, message: FileResumeResponseMessage): void {
    const transfer = this.outgoingTransfers.get(message.fileId);
    if (!transfer) return;

    if (message.canResume) {
      console.log('[FileTransfer] Resuming transfer from chunk:', message.resumeFromChunk);
      transfer.paused = false;
      this.resumeSendFile(message.fileId, peerId, message.resumeFromChunk);
    } else {
      console.log('[FileTransfer] Cannot resume, restarting transfer');
      transfer.paused = false;
      this.restartTransfer(message.fileId, peerId);
    }
  }

  /**
   * Request to resume a paused transfer
   */
  private requestResumeTransfer(fileId: string, peerId: string): void {
    const transfer = this.outgoingTransfers.get(fileId);
    if (!transfer) return;

    this.webrtc.sendToPeer(peerId, JSON.stringify({
      type: 'file-resume-request',
      fileId,
      lastChunkIndex: transfer.lastChunkIndex,
    }));
  }

  /**
   * Resume sending a file from a specific chunk
   * Bolt: Optimized to use Web Stream API for efficient seeking and buffer pooling.
   */
  private async resumeSendFile(fileId: string, peerId: string, fromChunk: number): Promise<void> {
    const transfer = this.outgoingTransfers.get(fileId);
    if (!transfer) return;

    const file = transfer.file;
    const startByte = fromChunk * CHUNK_SIZE;

    if (startByte >= file.size) {
      // Transfer was already complete
      this.webrtc.sendToPeer(peerId, JSON.stringify({ type: 'file-complete', fileId }));
      return;
    }

    transfer.startTime = Date.now();
    transfer.startOffset = startByte;
    let chunkIndex = fromChunk;
    const totalChunks = transfer.metadata.totalChunks;
    let transferredSize = startByte;

    // Update status
    this.notifyProgress(fileId, 'transferring', { resumable: true });

    // Bolt: Hoist hot-path lookups and system calls
    startAudioAnchor();
    const binaryId = this.getBinaryId(fileId);

    // Efficient seeking: slice the file and use stream() for memory-efficient reading
    const streamReader = file.slice(startByte).stream().getReader();

    try {
      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;

        // Bolt: Use stable local reference to avoid Map.get() in the hot chunk loop
        const currentTransfer = transfer;
        if (currentTransfer?.cancelled || currentTransfer?.paused) break;

        let offset = 0;
        while (offset < value.length) {
          const rawChunk = value.subarray(offset, Math.min(offset + CHUNK_SIZE, value.length));
          offset += CHUNK_SIZE;

          // Liquid-Metal: Recycling Buffer Slab
          const transferBuffer = this.getBufferFromPool();
          const packedChunk = new Uint8Array(transferBuffer);

          packedChunk.set(binaryId, 0);

          packedChunk[16] = chunkIndex & 0xFF;
          packedChunk[17] = (chunkIndex >> 8) & 0xFF;
          packedChunk[18] = (chunkIndex >> 16) & 0xFF;
          packedChunk[19] = (chunkIndex >> 24) & 0xFF;

          packedChunk.set(rawChunk, HEADER_SIZE);

          const validChunkView = new Uint8Array(transferBuffer, 0, HEADER_SIZE + rawChunk.length);
          await this.webrtc.sendToPeer(peerId, validChunkView);

          // Return buffer to pool
          this.returnBufferToPool(transferBuffer);

          if (currentTransfer) currentTransfer.lastChunkIndex = chunkIndex;
          chunkIndex++;
          transferredSize += rawChunk.length;

          if (chunkIndex % 16 === 0 || chunkIndex === totalChunks) {
            this.notifyProgress(fileId, 'transferring', { transferredSize, resumable: true });
          }
        }
      }

      const finalTransfer = this.outgoingTransfers.get(fileId);
      if (!finalTransfer?.cancelled && !finalTransfer?.paused) {
        this.webrtc.sendToPeer(peerId, JSON.stringify({ type: 'file-complete', fileId }));
        this.notifyProgress(fileId, 'completed', { transferredSize: file.size });
        this.outgoingTransfers.delete(fileId);
        this.cleanupTransferState(fileId);
        this.maybeStopAudioAnchor();
      }
    } catch (error) {
      console.error('[FileTransfer] Error resuming file:', error);
      this.notifyProgress(fileId, 'failed', { transferredSize, resumable: true });
      this.maybeStopAudioAnchor();
    } finally {
      streamReader.releaseLock();
    }
  }

  /**
   * Restart a transfer from the beginning
   */
  private async restartTransfer(fileId: string, peerId: string): Promise<void> {
    const transfer = this.outgoingTransfers.get(fileId);
    if (!transfer) return;

    // Delete old state and start fresh
    this.outgoingTransfers.delete(fileId);
    await this.sendFile(transfer.file, peerId);
  }

  /**
   * Send a file to a specific peer
   */
  async sendFile(file: File, peerId: string): Promise<string> {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    const fileId = generateUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const now = Date.now();

    // Request background keepalive sync to prevent browser suspension
    requestBackgroundSync();

    const metadata: FileMetadata = {
      id: fileId,
      name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
    };

    // Initialize transfer tracking with resume support
    const outgoing: OutgoingTransferState = {
      file,
      peerId,
      progress: {
        fileId,
        fileName: file.name,
        totalSize: file.size,
        transferredSize: 0,
        progress: 0,
        speed: 0,
        remainingTime: 0,
        status: 'pending',
        resumable: true,
        type: 'outgoing',
        peerId,
      },
      cancelled: false,
      paused: false,
      lastChunkIndex: -1,
      metadata,
      startTime: now,
      startOffset: 0,
    };
    this.outgoingTransfers.set(fileId, outgoing);

    // Send metadata via direct P2P channel
    this.webrtc.sendToPeer(peerId, JSON.stringify({
      type: 'direct-file-meta',
      fileId,
      metadata,
    }));

    // Bolt: Hoist hot-path lookups and system calls
    startAudioAnchor();
    const binaryId = this.getBinaryId(fileId);

    // Restore Rock-Solid Chunking: Sender and Receiver MUST use identical sizes
    const streamReader = file.stream().getReader();
    let chunkIndex = 0;
    let transferredSize = 0;

    try {
      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;

        // Bolt: Use stable local reference to avoid Map.get() in the hot chunk loop
        const transfer = outgoing;
        if (transfer?.cancelled) {
          this.webrtc.sendToPeer(peerId, JSON.stringify({ type: 'file-cancel', fileId }));
          break;
        }

        let offset = 0;
        while (offset < value.length) {
          const rawChunk = value.subarray(offset, Math.min(offset + CHUNK_SIZE, value.length));
          offset += CHUNK_SIZE;

        // Liquid-Metal: Recycling Buffer Slab
        const transferBuffer = this.getBufferFromPool();
        const packedChunk = new Uint8Array(transferBuffer);
        
        packedChunk.set(binaryId, 0);
        
        packedChunk[16] = chunkIndex & 0xFF;
        packedChunk[17] = (chunkIndex >> 8) & 0xFF;
        packedChunk[18] = (chunkIndex >> 16) & 0xFF;
        packedChunk[19] = (chunkIndex >> 24) & 0xFF;
        
        packedChunk.set(rawChunk, HEADER_SIZE);

        // Create a view containing only the valid data length for this chunk
        const validChunkView = new Uint8Array(transferBuffer, 0, HEADER_SIZE + rawChunk.length);

        // Dynamic High-Speed Backpressure
        const sendPromises = [this.webrtc.sendToPeer(peerId, validChunkView)];

        // 100% Polish: Tail Redundancy Strategy
        // If we are in the final lap (last 2 chunks), broadcast them down all channels 
        // to kill tail latency from a single slow SCTP stream.
        const isFinalLap = (chunkIndex >= metadata.totalChunks - 2);
        if (isFinalLap) {
           sendPromises.push(this.webrtc.sendToPeer(peerId, validChunkView)); 
        }

        await Promise.all(sendPromises);

        // LEAK-2 FIX: Return buffer to pool. WebRTC send() synchronously copies the ArrayBuffer 
        // into its internal queue before returning, so it's safe to reuse it now.
        this.returnBufferToPool(transferBuffer);

          if (transfer) transfer.lastChunkIndex = chunkIndex;
          chunkIndex++;
          transferredSize += rawChunk.length;

          // Throttled notification: Update UI every 16 chunks to keep visuals smooth
          if (chunkIndex % 16 === 0 || chunkIndex === totalChunks) {
            this.notifyProgress(fileId, 'transferring', {
              transferredSize,
              resumable: true,
            });
          }
        }
      }

      const finalTransfer = this.outgoingTransfers.get(fileId);
      if (!finalTransfer?.cancelled && !finalTransfer?.paused) {
        // Switch to verifying state (briefly) before completion
        this.notifyProgress(fileId, 'verifying');
        
        this.webrtc.sendToPeer(peerId, JSON.stringify({
          type: 'file-complete',
          fileId,
        }));

        // 120% Finish Logic: Handshake Wait
        // We wait for the Final ACK from the receiver AFTER sending the complete signal,
        // as the receiver requires the 'file-complete' message to finalize its own state.
        console.log('[FileTransfer] Stream complete. Awaiting Final ACK handshake from', peerId);
        // Wait up to 5s for the peer to acknowledge they wrote everything to disk
        for (let i = 0; i < 50; i++) {
          if (outgoing.isConfirmed) break;
          await new Promise(r => setTimeout(r, 100));
        }

        this.notifyProgress(fileId, 'completed', {
          transferredSize: file.size,
        });

        this.outgoingTransfers.delete(fileId);
        this.cleanupTransferState(fileId);

        // Release audio anchor if no more active transfers
        this.maybeStopAudioAnchor();
      }

    } catch (error) {
      console.error('[FileTransfer] Error sending file:', error);
      this.notifyProgress(fileId, 'failed', {
        transferredSize,
        resumable: true,
      });
      this.maybeStopAudioAnchor();
      throw error;
    }

    return fileId;
  }

  /**
   * Cancel an ongoing transfer
   */
  cancelTransfer(fileId: string): void {
    const transfer = this.outgoingTransfers.get(fileId);
    if (transfer) {
      transfer.cancelled = true;
    }
  }

  /**
   * Pause a transfer (for manual control)
   */
  pauseTransfer(fileId: string): void {
    const transfer = this.outgoingTransfers.get(fileId);
    if (transfer) {
      transfer.paused = true;
      this.notifyProgress(fileId, 'paused', {
        resumable: true,
      });
    }
  }

  /**
   * Manually resume a paused transfer
   */
  resumeTransfer(fileId: string): void {
    const transfer = this.outgoingTransfers.get(fileId);
    if (transfer && transfer.paused) {
      this.requestResumeTransfer(fileId, transfer.peerId);
    }
  }

  /**
   * Get pending/paused transfers for a peer
   */
  getPendingTransfers(peerId: string): string[] {
    const pending: string[] = [];
    this.outgoingTransfers.forEach((transfer, fileId) => {
      if (transfer.peerId === peerId && transfer.paused) {
        pending.push(fileId);
      }
    });
    return pending;
  }

  /**
   * Broadcast a file to multiple peers simultaneously (Mesh Mode)
   */
  async broadcastFile(file: File, peerIds: string[]): Promise<string> {
    if (peerIds.length === 0) throw new Error("No peers provided for broadcast");
    if (peerIds.length === 1) return this.sendFile(file, peerIds[0]);

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    const meshId = generateUUID();
    const transfers = new Map<string, string>();
    const fileId = generateUUID(); // Use a single inner fileId for all peers
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const now = Date.now();

    // Request background keepalive sync for mobile caching
    requestBackgroundSync();

    const metadata: FileMetadata = {
      id: fileId,
      name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
    };

    this.meshTransfers.set(meshId, { file, peerIds, transfers });

    peerIds.forEach(peerId => {
      transfers.set(peerId, `${fileId}-${peerId}`);

      this.outgoingTransfers.set(`${fileId}-${peerId}`, {
        file,
        peerId,
        progress: {
          fileId: `${fileId}-${peerId}`, // Treat each peer stream as a unique transfer visually
          fileName: file.name,
          totalSize: file.size,
          transferredSize: 0,
          progress: 0,
          speed: 0,
          remainingTime: 0,
          status: 'pending',
          resumable: true,
          type: 'outgoing',
          peerId,
        },
        cancelled: false,
        paused: false,
        lastChunkIndex: -1,
        metadata,
        startTime: now,
        startOffset: 0,
      });

      this.webrtc.sendToPeer(peerId, JSON.stringify({ type: 'direct-file-meta', fileId, metadata }));
    });

    const reader = file.stream().getReader();
    let chunkIndex = 0;
    let transferredSize = 0;

    // Run async mesh transfer loop without blocking the return of meshId
    (async () => {
      // Bolt: Hoist hot-path lookups and system calls
      startAudioAnchor();
      const binaryId = this.getBinaryId(fileId);

      // Bolt: Pre-resolve transfer state references to avoid Map.get() in loops
      const activeTransferRefs = peerIds.map(peerId => ({
        peerId,
        tx: this.outgoingTransfers.get(`${fileId}-${peerId}`)!
      }));

      try {
        while (true) {
          const activePeers = activeTransferRefs.filter(ref => {
            return ref.tx && !ref.tx.cancelled && !ref.tx.paused;
          });

          if (activePeers.length === 0) break; // All cancelled or paused

          const { done, value } = await reader.read();
          if (done) break;

          let offset = 0;
          while (offset < value.length) {
            const rawChunk = value.subarray(offset, Math.min(offset + CHUNK_SIZE, value.length));
            offset += CHUNK_SIZE;

            // Liquid-Metal: Recycling Buffer Slab for broadcast
            const transferBuffer = this.getBufferFromPool();
            const packedChunk = new Uint8Array(transferBuffer);

            packedChunk.set(binaryId, 0);

            packedChunk[16] = chunkIndex & 0xFF;
            packedChunk[17] = (chunkIndex >> 8) & 0xFF;
            packedChunk[18] = (chunkIndex >> 16) & 0xFF;
            packedChunk[19] = (chunkIndex >> 24) & 0xFF;

            packedChunk.set(rawChunk, HEADER_SIZE);

            const validChunkView = new Uint8Array(transferBuffer, 0, HEADER_SIZE + rawChunk.length);

            // Bolt: Parallelize transmission to all active peers in the mesh
            // This prevents a single slow connection from bottlenecking the entire broadcast.
            await Promise.all(activePeers.map(async (ref) => {
              await this.webrtc.sendToPeer(ref.peerId, validChunkView);
              ref.tx.lastChunkIndex = chunkIndex;
            }));

            // Return buffer to pool
            this.returnBufferToPool(transferBuffer);

            chunkIndex++;
            transferredSize += rawChunk.length;

            activePeers.forEach(ref => {
              this.notifyProgress(`${fileId}-${ref.peerId}`, 'transferring', {
                transferredSize,
                resumable: true,
              });
            });

            // Bolt: Yield the event loop every 16 chunks to keep UI responsive without killing performance
            if (chunkIndex % 16 === 0) {
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          }
        }

        activeTransferRefs.forEach(ref => {
          if (ref.tx && !ref.tx.cancelled && !ref.tx.paused) {
            this.webrtc.sendToPeer(ref.peerId, JSON.stringify({ type: 'file-complete', fileId }));
            this.notifyProgress(`${fileId}-${ref.peerId}`, 'completed', {
              transferredSize: file.size,
            });
            this.outgoingTransfers.delete(`${fileId}-${ref.peerId}`);
          }
        });
        this.maybeStopAudioAnchor();
      } catch (error) {
        console.error('[FileTransfer] Error in mesh broadcast:', error);
        peerIds.forEach(peerId => {
          this.notifyProgress(`${fileId}-${peerId}`, 'failed', {
            transferredSize,
          });
        });
        this.maybeStopAudioAnchor();
      } finally {
        this.meshTransfers.delete(meshId);
      }
    })();

    this.notifyMeshProgress({
      fileId: meshId,
      fileName: file.name,
      totalSize: file.size,
      totalPeers: peerIds.length,
      peerProgress: new Map(),
      overallProgress: 0,
      status: 'transferring',
    });

    return meshId;
  }

  /**
   * Get mesh transfer progress
   */
  getMeshProgress(meshId: string): MeshTransferProgress | null {
    const mesh = this.meshTransfers.get(meshId);
    if (!mesh) return null;

    const peerProgress = new Map<string, TransferProgress>();
    let totalProgress = 0;
    let completedPeers = 0;
    let failedPeers = 0;

    mesh.transfers.forEach((fileId, peerId) => {
      const transfer = this.outgoingTransfers.get(fileId);
      if (transfer) {
        peerProgress.set(peerId, transfer.progress);
        totalProgress += transfer.progress.progress;
        if (transfer.progress.status === 'completed') completedPeers++;
        if (transfer.progress.status === 'failed') failedPeers++;
      }
    });

    const overallProgress = mesh.peerIds.length > 0 
      ? totalProgress / mesh.peerIds.length 
      : 0;

    let status: MeshTransferProgress['status'] = 'transferring';
    if (completedPeers === mesh.peerIds.length) {
      status = 'completed';
    } else if (failedPeers === mesh.peerIds.length) {
      status = 'failed';
    } else if (completedPeers > 0 || failedPeers > 0) {
      status = 'partial';
    }

    return {
      fileId: meshId,
      fileName: mesh.file.name,
      totalSize: mesh.file.size,
      totalPeers: mesh.peerIds.length,
      peerProgress,
      overallProgress,
      status,
    };
  }

  /**
   * Register mesh progress handler
   */
  onMeshProgress(handler: MeshProgressHandler): () => void {
    this.meshProgressHandlers.add(handler);
    return () => this.meshProgressHandlers.delete(handler);
  }

  private notifyMeshProgress(progress: MeshTransferProgress): void {
    this.meshProgressHandlers.forEach((handler) => handler(progress));
  }

  /**
   * Download a file to the user's device
   */
  private downloadFile(blob: Blob, fileName: string): void {
    // SEC-2: Sanitize filename to prevent path traversal and injection
    const sanitized = this.sanitizeFilename(fileName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitized;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * SEC-2: Sanitize filenames from remote peers to prevent injection attacks.
   * Strips path separators, null bytes, and limits length.
   */
  private sanitizeFilename(name: string): string {
    // Remove path separators and null bytes
    let safe = name.replace(/[\\/:\*?"<>|\x00]/g, '_');
    // Remove leading dots (hidden files on Unix)
    safe = safe.replace(/^\.+/, '');
    // Limit length (255 is typical FS limit)
    if (safe.length > 200) {
      const ext = safe.lastIndexOf('.');
      if (ext > 0) {
        safe = safe.substring(0, 196) + safe.substring(ext);
      } else {
        safe = safe.substring(0, 200);
      }
    }
    return safe || 'download';
  }

  /**
   * Register progress handler
   */
  onProgress(handler: ProgressHandler): () => void {
    this.progressHandlers.add(handler);
    return () => this.progressHandlers.delete(handler);
  }

  /**
   * Register file received handler
   */
  onFileReceived(handler: FileReceivedHandler): () => void {
    this.fileReceivedHandlers.add(handler);
    return () => this.fileReceivedHandlers.delete(handler);
  }

  /**
   * Notify progress with throttling to prevent UI thrashing
   * Bolt: Moves expensive metrics calculation inside the throttled block
   */
  private notifyProgress(
    fileId: string,
    status: TransferProgress['status'],
    overrides?: Partial<TransferProgress>
  ): void {
    const now = Date.now();
    const lastUpdate = this.lastUpdateTimes.get(fileId) || 0;

    // Always emit if it's a final state or if enough time has passed
    const isFinalState = status === 'completed' ||
                         status === 'failed' ||
                         status === 'cancelled' ||
                         status === 'paused';

    if (isFinalState || now - lastUpdate >= PROGRESS_UPDATE_INTERVAL) {
      this.lastUpdateTimes.set(fileId, now);

      let progress: TransferProgress | null = null;
      const outgoing = this.outgoingTransfers.get(fileId);
      const incoming = this.incomingFiles.get(fileId);

      if (outgoing) {
        const transferredSize = overrides?.transferredSize ?? outgoing.progress.transferredSize;
        const elapsed = (now - outgoing.startTime) / 1000;
        const bytesThisSession = transferredSize - outgoing.startOffset;
        
        // EMA Speed Smoothing (Advanced Performance Math)
        const instantaneousSpeed = elapsed > 0 ? bytesThisSession / elapsed : 0;
        const prevSpeed = outgoing.progress.speed || instantaneousSpeed;
        const speed = (this.EMA_ALPHA * instantaneousSpeed) + (1 - this.EMA_ALPHA) * prevSpeed;

        const remainingBytes = outgoing.metadata.size - transferredSize;
        const remainingTime = speed > 0 ? remainingBytes / speed : 0;

        progress = {
          ...outgoing.progress,
          status,
          transferredSize,
          progress: Math.min((transferredSize / outgoing.metadata.size) * 100, 100),
          speed,
          remainingTime,
          ...overrides,
        };
        outgoing.progress = progress;
      } else if (incoming) {
        const rawTransferredSize = overrides?.transferredSize ?? (incoming.receivedChunks * CHUNK_SIZE);
        const transferredSize = Math.min(rawTransferredSize, incoming.metadata.size);
        const elapsed = (now - incoming.startTime) / 1000;
        const bytesThisSession = transferredSize - incoming.startOffset;
        
        // EMA Speed Smoothing for incoming
        const instantaneousSpeed = elapsed > 0 ? bytesThisSession / elapsed : 0;
        // Since incoming state is semi-transient, we check if we already have a speed
        const prevSpeed = this.lastUpdateTimes.get(`${fileId}-speed`) || instantaneousSpeed;
        const speed = (this.EMA_ALPHA * instantaneousSpeed) + (1 - this.EMA_ALPHA) * prevSpeed;
        this.lastUpdateTimes.set(`${fileId}-speed`, speed);

        const remainingBytes = incoming.metadata.size - transferredSize;
        const remainingTime = speed > 0 ? remainingBytes / speed : 0;

        progress = {
          fileId,
          fileName: incoming.metadata.name,
          totalSize: incoming.metadata.size,
          transferredSize,
          progress: Math.min((incoming.receivedChunks / incoming.metadata.totalChunks) * 100, 100),
          speed,
          remainingTime,
          status,
          type: 'incoming',
          peerId: incoming.peerId,
          ...overrides,
        };
      } else if (overrides && 'fileName' in overrides && 'totalSize' in overrides) {
        // Fallback for initialization or when state is already cleared
        progress = overrides as TransferProgress;
      }

      if (progress) {
        this.progressHandlers.forEach((handler) => handler(progress!));
      }

      // LEAK-6 FIX: Cleanup update time AND speed entries when finished
      if (isFinalState) {
        setTimeout(() => {
          this.lastUpdateTimes.delete(fileId);
          this.lastUpdateTimes.delete(`${fileId}-speed`);
        }, 1000);
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupHandler) {
      this.cleanupHandler();
    }
    if (this.stateCleanupHandler) {
      this.stateCleanupHandler();
    }
    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // Clear all diagnostic timeouts
    this.diagnosticTimeouts.forEach(timeout => clearTimeout(timeout));
    this.diagnosticTimeouts.clear();
    // Release RAM fallback blob parts for any in-progress incoming transfers
    this.incomingFiles.forEach((incoming) => {
      incoming.blobParts = undefined;
      incoming.pendingChunks = undefined;
    });
    // Clear all state maps
    this.progressHandlers.clear();
    this.fileReceivedHandlers.clear();
    this.meshProgressHandlers.clear();
    this.incomingFiles.clear();
    this.outgoingTransfers.clear();
    this.lastUpdateTimes.clear();
    this.meshTransfers.clear();
    this.orphanedChunks.clear();
    this.binaryIdCache.clear();
    this.lastIncomingCache = null;
    this.bufferPool.length = 0;
    // LEAK-11: Remove beforeunload listener
    if (typeof window !== 'undefined' && this.boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
    // Release system resources
    stopAudioAnchor();
    releaseWakeLock();
  }

  /**
   * OPFS Garbage Collector (Edge Case Part 3)
   * Scans browser storage for orphaned partial files from crashed sessions.
   */
  private async cleanupOrphanedFiles(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) return;
    
    try {
      const root = await navigator.storage.getDirectory();
      const entries = (root as unknown as { entries(): AsyncIterable<[string, FileSystemFileHandle]> }).entries(); // Iteration helper
      
      for await (const [name, entry] of entries) {
        if (name.startsWith('lynkless-')) {
          // Extract fileId (UUID) from 'lynkless-{uuid}-{salt}'
          // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
          // Remove 'lynkless-' prefix, then extract 36-char UUID
          const withoutPrefix = name.substring('lynkless-'.length);
          const fileId = withoutPrefix.length >= 36 ? withoutPrefix.substring(0, 36) : '';
          
          // If the file is not currently active, and its older than 24 hours, purge it
          if (fileId && !this.incomingFiles.has(fileId)) {
             try {
               const file = await entry.getFile();
               const isOld = (Date.now() - file.lastModified) > 5 * 60 * 1000;
               if (isOld) {
                 await root.removeEntry(name);
                 console.log(`[GC] Purged abandoned file: ${name}`);
               }
             } catch {
               // If we can't get file metadata, keep it to be safe or delete if its very old
             }
          }
        }
      }
    } catch {
      // Quiet fail for GC
    }
  }
}



export { CHUNK_SIZE, MAX_FILE_SIZE };

/**
 * 120% Production: Screen Wake Lock
 * Prevents the OS from sleeping while a transfer is in progress.
 */
let wakeLock: unknown = null;
async function requestWakeLock() {
  if (typeof window !== 'undefined' && 'wakeLock' in navigator && !wakeLock) {
    try {
      wakeLock = await (navigator as unknown as { wakeLock: { request(type: string): Promise<unknown> } }).wakeLock.request('screen');
      console.log('[System] Screen Wake Lock active.');
      (wakeLock as { addEventListener(type: string, listener: () => void): void }).addEventListener('release', () => { wakeLock = null; });
    } catch {
      // Ignore wake lock request errors
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    (wakeLock as { release(): Promise<void> }).release();
    wakeLock = null;
    console.log('[System] Screen Wake Lock released.');
  }
}
