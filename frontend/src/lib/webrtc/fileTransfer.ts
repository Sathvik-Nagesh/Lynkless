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

// Constants
const CHUNK_SIZE = 256 * 1024; // 256KB chunks (larger = fewer round trips = faster)
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB limit
const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1MB buffer threshold before backpressure
const PROGRESS_UPDATE_INTERVAL = 10; // Update UI every N chunks (reduces render overhead)

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
  data: string; // base64 encoded
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
}

interface IncomingTransferState {
  metadata: FileMetadata;
  chunks: (ArrayBuffer | null)[];
  receivedChunks: number;
  lastReceivedIndex: number;
  startTime: number;
  peerId: string;
}

class FileTransferManager {
  private webrtc = getWebRTCManager();
  private progressHandlers: Set<ProgressHandler> = new Set();
  private fileReceivedHandlers: Set<FileReceivedHandler> = new Set();
  private meshProgressHandlers: Set<MeshProgressHandler> = new Set();
  private incomingFiles: Map<string, IncomingTransferState> = new Map();
  private outgoingTransfers: Map<string, OutgoingTransferState> = new Map();
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
      }
    });
  }

  /**
   * Monitor connection state for resume capability
   */
  private setupConnectionMonitor(): void {
    this.stateCleanupHandler = this.webrtc.onStateChange((peerId, state) => {
      if (state === 'disconnected' || state === 'failed') {
        // Mark transfers as paused for potential resume
        this.outgoingTransfers.forEach((transfer, fileId) => {
          if (transfer.peerId === peerId && transfer.progress.status === 'transferring') {
            transfer.paused = true;
            this.notifyProgress({
              ...transfer.progress,
              status: 'paused',
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
        this.handleFileChunk(message as FileChunkMessage);
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

    this.incomingFiles.set(metadata.id, {
      metadata,
      chunks: new Array(metadata.totalChunks).fill(null),
      receivedChunks: 0,
      lastReceivedIndex: -1,
      startTime: Date.now(),
      peerId,
    });

    this.notifyProgress({
      fileId: metadata.id,
      fileName: metadata.name,
      totalSize: metadata.size,
      transferredSize: 0,
      progress: 0,
      speed: 0,
      remainingTime: 0,
      status: 'transferring',
    });
  }

  private handleFileChunk(message: FileChunkMessage): void {
    const incoming = this.incomingFiles.get(message.fileId);
    if (!incoming) return;

    // Decode base64 chunk
    const binaryString = atob(message.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    incoming.chunks[message.chunkIndex] = bytes.buffer;
    incoming.receivedChunks++;
    incoming.lastReceivedIndex = Math.max(incoming.lastReceivedIndex, message.chunkIndex);

    // Calculate progress
    const transferredSize = incoming.receivedChunks * CHUNK_SIZE;
    const elapsed = (Date.now() - incoming.startTime) / 1000;
    const speed = transferredSize / elapsed;
    const remainingBytes = incoming.metadata.size - transferredSize;
    const remainingTime = speed > 0 ? remainingBytes / speed : 0;

    this.notifyProgress({
      fileId: message.fileId,
      fileName: incoming.metadata.name,
      totalSize: incoming.metadata.size,
      transferredSize: Math.min(transferredSize, incoming.metadata.size),
      progress: (incoming.receivedChunks / incoming.metadata.totalChunks) * 100,
      speed,
      remainingTime,
      status: 'transferring',
      resumable: true,
    });
  }

  private handleFileComplete(fileId: string): void {
    const incoming = this.incomingFiles.get(fileId);
    if (!incoming) return;

    // Combine all chunks
    const validChunks = incoming.chunks.filter((c): c is ArrayBuffer => c !== null);
    const blob = new Blob(validChunks, { type: incoming.metadata.type });

    // Notify handlers
    this.fileReceivedHandlers.forEach((handler) => 
      handler(blob, incoming.metadata)
    );

    this.notifyProgress({
      fileId,
      fileName: incoming.metadata.name,
      totalSize: incoming.metadata.size,
      transferredSize: incoming.metadata.size,
      progress: 100,
      speed: 0,
      remainingTime: 0,
      status: 'completed',
    });

    // Auto-download the file
    this.downloadFile(blob, incoming.metadata.name);

    // Cleanup
    this.incomingFiles.delete(fileId);
  }

  private handleFileCancel(fileId: string): void {
    const incoming = this.incomingFiles.get(fileId);
    if (incoming) {
      this.notifyProgress({
        fileId,
        fileName: incoming.metadata.name,
        totalSize: incoming.metadata.size,
        transferredSize: 0,
        progress: 0,
        speed: 0,
        remainingTime: 0,
        status: 'cancelled',
      });
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

    const startTime = Date.now();
    let chunkIndex = fromChunk;
    let transferredSize = startOffset;

    // Update status
    this.notifyProgress({
      ...transfer.progress,
      status: 'transferring',
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

          const chunk = value.slice(offset, offset + CHUNK_SIZE);
          offset += CHUNK_SIZE;

          // Convert to base64
          let binary = '';
          for (let i = 0; i < chunk.length; i++) {
            binary += String.fromCharCode(chunk[i]);
          }
          const base64 = btoa(binary);

          // Send chunk
          this.webrtc.sendToPeer(peerId, JSON.stringify({
            type: 'file-chunk',
            fileId,
            chunkIndex,
            data: base64,
          }));

          transfer.lastChunkIndex = chunkIndex;
          chunkIndex++;
          transferredSize += chunk.length;

          // Update progress
          const elapsed = (Date.now() - startTime) / 1000;
          const bytesThisSession = transferredSize - startOffset;
          const speed = elapsed > 0 ? bytesThisSession / elapsed : 0;
          const remainingBytes = file.size - transferredSize;
          const remainingTime = speed > 0 ? remainingBytes / speed : 0;

          this.notifyProgress({
            fileId,
            fileName: file.name,
            totalSize: file.size,
            transferredSize,
            progress: (transferredSize / file.size) * 100,
            speed,
            remainingTime,
            status: 'transferring',
            resumable: true,
          });

          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }

      if (!transfer.cancelled && !transfer.paused) {
        // Send completion message
        this.webrtc.sendToPeer(peerId, JSON.stringify({
          type: 'file-complete',
          fileId,
        }));

        this.notifyProgress({
          fileId,
          fileName: file.name,
          totalSize: file.size,
          transferredSize: file.size,
          progress: 100,
          speed: 0,
          remainingTime: 0,
          status: 'completed',
        });

        this.outgoingTransfers.delete(fileId);
      }
    } catch (error) {
      console.error('[FileTransfer] Error resuming file:', error);
      this.notifyProgress({
        fileId,
        fileName: file.name,
        totalSize: file.size,
        transferredSize,
        progress: (transferredSize / file.size) * 100,
        speed: 0,
        remainingTime: 0,
        status: 'failed',
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
   * Wait for the DataChannel buffer to drain below threshold.
   * This implements proper backpressure instead of arbitrary setTimeout delays.
   * Result: transfers run at maximum DataChannel throughput speed.
   */
  private async waitForBufferDrain(peerId: string): Promise<void> {
    // Access the data channel via the clean public API
    const dc = this.webrtc.getDataChannel(peerId);
    if (!dc || dc.bufferedAmount <= MAX_BUFFERED_AMOUNT) return;

    // Wait until bufferedAmount drops below threshold
    return new Promise<void>((resolve) => {
      const checkBuffer = () => {
        if (!dc || dc.readyState !== 'open') {
          resolve();
          return;
        }
        if (dc.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
          resolve();
        } else {
          // Use bufferedAmountLowThreshold event if supported
          if (dc.bufferedAmountLowThreshold !== undefined) {
            dc.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT;
            dc.onbufferedamountlow = () => {
              dc.onbufferedamountlow = null;
              resolve();
            };
          } else {
            // Fallback: poll every 10ms
            setTimeout(checkBuffer, 10);
          }
        }
      };
      checkBuffer();
    });
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
      },
      cancelled: false,
      paused: false,
      lastChunkIndex: -1,
      metadata,
    });

    // Send metadata
    this.webrtc.sendToPeer(peerId, JSON.stringify({
      type: 'file-meta',
      fileId,
      metadata,
    }));

    // Send chunks
    const startTime = Date.now();
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

          const chunk = value.slice(offset, offset + CHUNK_SIZE);
          offset += CHUNK_SIZE;

          // Convert to base64
          let binary = '';
          for (let i = 0; i < chunk.length; i++) {
            binary += String.fromCharCode(chunk[i]);
          }
          const base64 = btoa(binary);

          // Send chunk
          this.webrtc.sendToPeer(peerId, JSON.stringify({
            type: 'file-chunk',
            fileId,
            chunkIndex,
            data: base64,
          }));

          if (currentTransfer) {
            currentTransfer.lastChunkIndex = chunkIndex;
          }
          chunkIndex++;
          transferredSize += chunk.length;

          // Update progress periodically (not every chunk — reduces UI thrashing)
          if (chunkIndex % PROGRESS_UPDATE_INTERVAL === 0 || transferredSize >= file.size) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? transferredSize / elapsed : 0;
            const remainingBytes = file.size - transferredSize;
            const remainingTime = speed > 0 ? remainingBytes / speed : 0;

            this.notifyProgress({
              fileId,
              fileName: file.name,
              totalSize: file.size,
              transferredSize,
              progress: (transferredSize / file.size) * 100,
              speed,
              remainingTime,
              status: 'transferring',
              resumable: true,
            });
          }

          // Backpressure: wait for the DataChannel buffer to drain
          // instead of arbitrary setTimeout — HUGE speed improvement
          await this.waitForBufferDrain(peerId);
        }
      }

      const finalTransfer = this.outgoingTransfers.get(fileId);
      if (!finalTransfer?.cancelled && !finalTransfer?.paused) {
        // Send completion message
        this.webrtc.sendToPeer(peerId, JSON.stringify({
          type: 'file-complete',
          fileId,
        }));

        this.notifyProgress({
          fileId,
          fileName: file.name,
          totalSize: file.size,
          transferredSize: file.size,
          progress: 100,
          speed: 0,
          remainingTime: 0,
          status: 'completed',
        });

        this.outgoingTransfers.delete(fileId);
      }

    } catch (error) {
      console.error('[FileTransfer] Error sending file:', error);
      this.notifyProgress({
        fileId,
        fileName: file.name,
        totalSize: file.size,
        transferredSize,
        progress: (transferredSize / file.size) * 100,
        speed: 0,
        remainingTime: 0,
        status: 'failed',
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
      this.notifyProgress({
        ...transfer.progress,
        status: 'paused',
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
    if (peerIds.length === 0) {
      throw new Error('No peers specified for broadcast');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    const meshId = generateUUID();
    const transfers = new Map<string, string>();

    // Store mesh transfer info
    this.meshTransfers.set(meshId, {
      file,
      peerIds,
      transfers,
    });

    // Start individual transfers to each peer
    const transferPromises = peerIds.map(async (peerId) => {
      try {
        const fileId = await this.sendFile(file, peerId);
        transfers.set(peerId, fileId);
        return { peerId, fileId, success: true };
      } catch (error) {
        console.error(`[FileTransfer] Failed to send to ${peerId}:`, error);
        return { peerId, fileId: '', success: false };
      }
    });

    // Run all transfers in parallel
    Promise.all(transferPromises).then((results) => {
      const successful = results.filter(r => r.success).length;
      const total = results.length;
      
      console.log(`[FileTransfer] Mesh broadcast complete: ${successful}/${total} peers`);
      
      // Cleanup mesh tracking
      this.meshTransfers.delete(meshId);
    });

    // Notify initial mesh progress
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

  private notifyProgress(progress: TransferProgress): void {
    this.progressHandlers.forEach((handler) => handler(progress));

    // Update outgoing transfer if exists
    const transfer = this.outgoingTransfers.get(progress.fileId);
    if (transfer) {
      transfer.progress = progress;
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
