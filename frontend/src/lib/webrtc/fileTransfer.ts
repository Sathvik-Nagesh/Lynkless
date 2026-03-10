/**
 * File Transfer Engine with Resume Capability
 * Handles chunked file transfer over WebRTC DataChannel
 * Supports automatic resume on reconnection
 */

import { getWebRTCManager } from './connection';

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

const CHUNK_SIZE = 256 * 1024; // 256KB chunks for higher throughput
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB limit
const PROGRESS_UPDATE_INTERVAL = 100; // 100ms throttle interval

// Request background sync tag if available
export const requestBackgroundSync = async () => {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration) {
        // @ts-ignore - background sync API is not fully typed in standard DOM libs
        await registration.sync.register('lynkless-transfer-sync');
      }
    } catch (e) {
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
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled' | 'paused';
  resumable?: boolean;
  type: 'incoming' | 'outgoing';
  peerId: string;
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

interface FileChunkMessage extends FileMessage {
  type: 'file-chunk';
  chunkIndex: number;
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
}

interface IncomingTransferState {
  metadata: FileMetadata;
  chunks: (ArrayBuffer | null)[];
  receivedChunks: number;
  lastReceivedIndex: number;
  startTime: number;
  startOffset: number;
  peerId: string;
}

class FileTransferManager {
  private webrtc = getWebRTCManager();
  private progressHandlers: Set<ProgressHandler> = new Set();
  private fileReceivedHandlers: Set<FileReceivedHandler> = new Set();
  private meshProgressHandlers: Set<MeshProgressHandler> = new Set();
  private incomingFiles: Map<string, IncomingTransferState> = new Map();
  private pendingChunkMetadata: Map<string, { fileId: string; chunkIndex: number }> = new Map();
  private outgoingTransfers: Map<string, OutgoingTransferState> = new Map();
  private lastUpdateTimes: Map<string, number> = new Map();
  private meshTransfers: Map<string, { file: File; peerIds: string[]; transfers: Map<string, string> }> = new Map();
  private cleanupHandler: (() => void) | null = null;
  private stateCleanupHandler: (() => void) | null = null;

  constructor() {
    this.setupDataHandler();
    this.setupConnectionMonitor();
  }

  private setupDataHandler(): void {
    this.cleanupHandler = this.webrtc.onData((peerId, data) => {
      if (typeof data === 'string') {
        try {
          const message = JSON.parse(data) as FileMessage;
          if (message.type?.startsWith('file-')) {
            this.handleFileMessage(peerId, message);
          }
        } catch {
          // Not a file message, ignore
        }
      } else if (data instanceof ArrayBuffer) {
        this.handleBinaryChunk(peerId, data);
      }
    });
  }

  /**
   * Monitor connection state for resume capability
   */
  private setupConnectionMonitor(): void {
    this.stateCleanupHandler = this.webrtc.onStateChange((peerId, state) => {
      if (state === 'disconnected' || state === 'failed') {
        // Clear pending binary metadata for this peer
        this.pendingChunkMetadata.delete(peerId);

        // Mark transfers as paused for potential resume
        this.outgoingTransfers.forEach((transfer, fileId) => {
          if (transfer.peerId === peerId && transfer.progress.status === 'transferring') {
            transfer.paused = true;
            this.notifyProgress(fileId, 'paused', {
              resumable: true,
            });
          }
        });
      } else if (state === 'connected') {
        // Attempt to resume paused transfers
        this.outgoingTransfers.forEach((transfer, fileId) => {
          if (transfer.peerId === peerId && transfer.paused) {
            this.requestResumeTransfer(fileId, peerId);
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
      case 'file-chunk':
        this.handleFileChunk(peerId, message as FileChunkMessage);
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

  private handleFileMeta(peerId: string, message: FileMetaMessage): void {
    const { metadata } = message;
    console.log('[FileTransfer] Receiving file:', metadata.name);

    const now = Date.now();
    this.incomingFiles.set(metadata.id, {
      metadata,
      chunks: new Array(metadata.totalChunks).fill(null),
      receivedChunks: 0,
      lastReceivedIndex: -1,
      startTime: now,
      startOffset: 0,
      peerId,
    });

    this.notifyProgress(metadata.id, 'transferring', {
      fileName: metadata.name,
      totalSize: metadata.size,
      transferredSize: 0,
      type: 'incoming',
      peerId,
    });
  }

  private handleFileChunk(peerId: string, message: FileChunkMessage): void {
    const incoming = this.incomingFiles.get(message.fileId);
    if (!incoming) return;

    // Store metadata for the next incoming binary chunk
    this.pendingChunkMetadata.set(peerId, {
      fileId: message.fileId,
      chunkIndex: message.chunkIndex,
    });
  }

  /**
   * Process a raw binary chunk from a peer
   */
  private handleBinaryChunk(peerId: string, data: ArrayBuffer): void {
    const metadata = this.pendingChunkMetadata.get(peerId);
    if (!metadata) return;

    // Clear metadata immediately to prepare for next chunk
    this.pendingChunkMetadata.delete(peerId);

    const incoming = this.incomingFiles.get(metadata.fileId);
    if (!incoming) return;

    // Store the raw buffer
    if (incoming.chunks[metadata.chunkIndex] === null) {
      incoming.chunks[metadata.chunkIndex] = data;
      incoming.receivedChunks++;
      incoming.lastReceivedIndex = Math.max(incoming.lastReceivedIndex, metadata.chunkIndex);
    }

    // Bolt: Throttled progress update with lazy metrics calculation
    const transferredSize = incoming.receivedChunks * CHUNK_SIZE;
    this.notifyProgress(metadata.fileId, 'transferring', {
      transferredSize: Math.min(transferredSize, incoming.metadata.size),
      resumable: true,
    });
  }

  private handleFileComplete(fileId: string): void {
    const incoming = this.incomingFiles.get(fileId);
    if (!incoming) return;

    // Bolt: Avoid unnecessary array filtering if all chunks are present
    const validChunks = incoming.receivedChunks === incoming.metadata.totalChunks
      ? (incoming.chunks as ArrayBuffer[])
      : incoming.chunks.filter((c): c is ArrayBuffer => c !== null);

    const blob = new Blob(validChunks, { type: incoming.metadata.type });

    // Notify handlers
    this.fileReceivedHandlers.forEach((handler) =>
      handler(blob, incoming.metadata)
    );

    this.notifyProgress(fileId, 'completed', {
      transferredSize: incoming.metadata.size,
    });

    // Auto-download the file
    this.downloadFile(blob, incoming.metadata.name);

    // Cleanup
    this.incomingFiles.delete(fileId);
  }

  private handleFileCancel(fileId: string): void {
    const incoming = this.incomingFiles.get(fileId);
    if (incoming) {
      this.notifyProgress(fileId, 'cancelled');
      this.incomingFiles.delete(fileId);
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
      while (resumeFrom < incoming.chunks.length && incoming.chunks[resumeFrom] !== null) {
        resumeFrom++;
      }
      
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
   */
  private async resumeSendFile(fileId: string, peerId: string, fromChunk: number): Promise<void> {
    const transfer = this.outgoingTransfers.get(fileId);
    if (!transfer) return;

    const file = transfer.file;
    const startOffset = fromChunk * CHUNK_SIZE;

    if (startOffset >= file.size) {
      // Transfer was already complete
      this.webrtc.sendToPeer(peerId, JSON.stringify({
        type: 'file-complete',
        fileId,
      }));
      return;
    }

    transfer.startTime = Date.now();
    transfer.startOffset = startOffset;
    let chunkIndex = fromChunk;
    let transferredSize = startOffset;

    // Update status
    this.notifyProgress(fileId, 'transferring', {
      resumable: true,
    });

    try {
      // Create a slice of the file from the resume point
      const remainingFile = file.slice(startOffset);
      const reader = remainingFile.stream().getReader();

      while (true) {
        if (transfer.cancelled || transfer.paused) break;

        const { done, value } = await reader.read();
        if (done) break;

        let offset = 0;
        while (offset < value.length) {
          if (transfer.cancelled || transfer.paused) break;

          // Bolt: Use subarray for zero-copy chunking to reduce memory allocations
          const chunk = value.subarray(offset, offset + CHUNK_SIZE);
          offset += CHUNK_SIZE;

          // Send chunk metadata header
          await this.webrtc.sendToPeer(peerId, JSON.stringify({
            type: 'file-chunk',
            fileId,
            chunkIndex,
          }));

          // Send raw binary chunk
          await this.webrtc.sendToPeer(peerId, chunk);

          transfer.lastChunkIndex = chunkIndex;
          chunkIndex++;
          transferredSize += chunk.length;

          // Bolt: Throttled progress update with lazy metrics calculation
          this.notifyProgress(fileId, 'transferring', {
            transferredSize,
            resumable: true,
          });

          // Bolt: Yield the event loop every 16 chunks to keep UI responsive without killing performance
          if (chunkIndex % 16 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }

      if (!transfer.cancelled && !transfer.paused) {
        // Send completion message
        this.webrtc.sendToPeer(peerId, JSON.stringify({
          type: 'file-complete',
          fileId,
        }));

        this.notifyProgress(fileId, 'completed', {
          transferredSize: file.size,
        });

        this.outgoingTransfers.delete(fileId);
      }
    } catch (error) {
      console.error('[FileTransfer] Error resuming file:', error);
      this.notifyProgress(fileId, 'failed', {
        transferredSize,
      });
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
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
    };

    // Initialize transfer tracking with resume support
    this.outgoingTransfers.set(fileId, {
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
    });

    // Send metadata
    this.webrtc.sendToPeer(peerId, JSON.stringify({
      type: 'file-meta',
      fileId,
      metadata,
    }));

    // Send chunks
    const reader = file.stream().getReader();
    let chunkIndex = 0;
    let transferredSize = 0;

    try {
      while (true) {
        const transfer = this.outgoingTransfers.get(fileId);
        if (transfer?.cancelled) {
          this.webrtc.sendToPeer(peerId, JSON.stringify({
            type: 'file-cancel',
            fileId,
          }));
          break;
        }

        if (transfer?.paused) {
          // Wait for resume or cancellation
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }

        const { done, value } = await reader.read();
        if (done) break;

        // Split into CHUNK_SIZE pieces if needed
        let offset = 0;
        while (offset < value.length) {
          const currentTransfer = this.outgoingTransfers.get(fileId);
          if (currentTransfer?.cancelled || currentTransfer?.paused) break;

          // Bolt: Use subarray for zero-copy chunking to reduce memory allocations
          const chunk = value.subarray(offset, offset + CHUNK_SIZE);
          offset += CHUNK_SIZE;

          // Send chunk metadata header
          await this.webrtc.sendToPeer(peerId, JSON.stringify({
            type: 'file-chunk',
            fileId,
            chunkIndex,
          }));

          // Send raw binary chunk
          await this.webrtc.sendToPeer(peerId, chunk);

          if (currentTransfer) {
            currentTransfer.lastChunkIndex = chunkIndex;
          }
          chunkIndex++;
          transferredSize += chunk.length;

          // Bolt: Throttled progress update with lazy metrics calculation
          this.notifyProgress(fileId, 'transferring', {
            transferredSize,
            resumable: true,
          });

          // Bolt: Yield the event loop every 16 chunks to keep UI responsive without killing performance
          if (chunkIndex % 16 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }

      const finalTransfer = this.outgoingTransfers.get(fileId);
      if (!finalTransfer?.cancelled && !finalTransfer?.paused) {
        // Send completion message
        this.webrtc.sendToPeer(peerId, JSON.stringify({
          type: 'file-complete',
          fileId,
        }));

        this.notifyProgress(fileId, 'completed', {
          transferredSize: file.size,
        });

        this.outgoingTransfers.delete(fileId);
      }

    } catch (error) {
      console.error('[FileTransfer] Error sending file:', error);
      this.notifyProgress(fileId, 'failed', {
        transferredSize,
        resumable: true,
      });
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
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
    };

    this.meshTransfers.set(meshId, { file, peerIds, transfers });

    // Bolt: Parallelize initial metadata sends
    Promise.all(peerIds.map(async (peerId) => {
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

      return this.webrtc.sendToPeer(peerId, JSON.stringify({ type: 'file-meta', fileId, metadata }));
    })).catch(err => console.error('[FileTransfer] Mesh init failed', err));

    const reader = file.stream().getReader();
    let chunkIndex = 0;
    let transferredSize = 0;

    // Run async mesh transfer loop without blocking the return of meshId
    (async () => {
      try {
        while (true) {
          const activePeers = peerIds.filter(peerId => {
            const tx = this.outgoingTransfers.get(`${fileId}-${peerId}`);
            return tx && !tx.cancelled && !tx.paused;
          });

          if (activePeers.length === 0) break; // All cancelled or paused

          const { done, value } = await reader.read();
          if (done) break;

          let offset = 0;
          while (offset < value.length) {
            const chunk = value.subarray(offset, Math.min(offset + CHUNK_SIZE, value.length));
            offset += CHUNK_SIZE;

            const chunkMetaStr = JSON.stringify({ type: 'file-chunk', fileId, chunkIndex });

            // Bolt: Parallelize chunk broadcasting to prevent a slow peer from blocking others (head-of-line blocking)
            await Promise.all(activePeers.map(async (peerId) => {
              const tx = this.outgoingTransfers.get(`${fileId}-${peerId}`);
              if (tx && !tx.cancelled && !tx.paused) {
                await this.webrtc.sendToPeer(peerId, chunkMetaStr);
                await this.webrtc.sendToPeer(peerId, chunk);
                tx.lastChunkIndex = chunkIndex;
              }
            }));

            chunkIndex++;
            transferredSize += chunk.length;

            activePeers.forEach(peerId => {
              this.notifyProgress(`${fileId}-${peerId}`, 'transferring', {
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

        // Bolt: Parallelize completion notifications
        await Promise.all(peerIds.map(async (peerId) => {
          const tx = this.outgoingTransfers.get(`${fileId}-${peerId}`);
          if (tx && !tx.cancelled && !tx.paused) {
            await this.webrtc.sendToPeer(peerId, JSON.stringify({ type: 'file-complete', fileId }));
            this.notifyProgress(`${fileId}-${peerId}`, 'completed', {
              transferredSize: file.size,
            });
            this.outgoingTransfers.delete(`${fileId}-${peerId}`);
          }
        }));
      } catch (error) {
        console.error('[FileTransfer] Error in mesh broadcast:', error);
        peerIds.forEach(peerId => {
          this.notifyProgress(`${fileId}-${peerId}`, 'failed', {
            transferredSize,
          });
        });
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
        const speed = elapsed > 0 ? bytesThisSession / elapsed : 0;
        const remainingBytes = outgoing.metadata.size - transferredSize;
        const remainingTime = speed > 0 ? remainingBytes / speed : 0;

        progress = {
          ...outgoing.progress,
          status,
          transferredSize,
          progress: (transferredSize / outgoing.metadata.size) * 100,
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
        const speed = elapsed > 0 ? bytesThisSession / elapsed : 0;
        const remainingBytes = incoming.metadata.size - transferredSize;
        const remainingTime = speed > 0 ? remainingBytes / speed : 0;

        progress = {
          fileId,
          fileName: incoming.metadata.name,
          totalSize: incoming.metadata.size,
          transferredSize,
          progress: (incoming.receivedChunks / incoming.metadata.totalChunks) * 100,
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

      // Cleanup update time when finished
      if (isFinalState) {
        setTimeout(() => this.lastUpdateTimes.delete(fileId), 1000);
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
    this.progressHandlers.clear();
    this.fileReceivedHandlers.clear();
    this.incomingFiles.clear();
    this.pendingChunkMetadata.clear();
    this.outgoingTransfers.clear();
  }
}

// Singleton instance
let fileTransferManager: FileTransferManager | null = null;

export function getFileTransferManager(): FileTransferManager {
  if (!fileTransferManager) {
    fileTransferManager = new FileTransferManager();
  }
  return fileTransferManager;
}

export { CHUNK_SIZE, MAX_FILE_SIZE };
