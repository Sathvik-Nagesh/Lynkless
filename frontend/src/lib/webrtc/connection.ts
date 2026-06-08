/**
 * WebRTC Connection Manager
 * Handles peer connections, data channels, and ICE candidates
 */

import { getSignalingClient, SignalingMessage } from '../socket/client';
import { generateSimpleFingerprint, storeFingerprint, clearFingerprint } from './fingerprint';

// STUN/TURN servers for NAT traversal
// Allow users to provide their own TURN/STUN servers via env variables if needed
const customIceServersStr = process.env.NEXT_PUBLIC_ICE_SERVERS;
let customIceServers: RTCIceServer[] = [];
try {
  if (customIceServersStr) {
    customIceServers = JSON.parse(customIceServersStr);
  }
} catch {
  console.warn('Failed to parse NEXT_PUBLIC_ICE_SERVERS, ignoring.');
}

// Default STUN servers (Google's are very reliable for most connections)
// Added OpenRelay TURN servers as a fallback to guarantee demo success on strict University/Enterprise Wi-Fi (Symmetric NAT)
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { 
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  { 
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

const ICE_SERVERS: RTCConfiguration = {
  iceServers: customIceServers.length > 0 ? customIceServers : DEFAULT_ICE_SERVERS,
  iceCandidatePoolSize: 10,
};

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';

// Number of parallel data channels to open for higher throughput (RAID-0 style striping)
const PARALLEL_CHANNELS = 4;

export interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  dataChannels: RTCDataChannel[];  // Parallel channels for high-throughput transfers
  channelsSendIndex: number;       // Round-robin index for chunk striping
  state: ConnectionState;
  isNearby: boolean;
  localSdp?: string;
  remoteSdp?: string;
  fingerprint?: string;
  initialNegotiationComplete: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isPolite: boolean;
}

export type DataHandler = (peerId: string, data: ArrayBuffer | string) => void;
export type StateChangeHandler = (peerId: string, state: ConnectionState) => void;
export type FingerprintHandler = (peerId: string, fingerprint: string) => void;
export type TrackHandler = (peerId: string, track: MediaStreamTrack, streams: readonly MediaStream[]) => void;

export class WebRTCManager {
  private peers: Map<string, PeerConnection> = new Map();
  private dataHandlers: Set<DataHandler> = new Set();
  private stateHandlers: Set<StateChangeHandler> = new Set();
  private fingerprintHandlers: Set<FingerprintHandler> = new Set();
  private trackHandlers: Set<TrackHandler> = new Set();
  private relayHandlers: Set<(peerId: string, isRelay: boolean) => void> = new Set();
  private signaling = getSignalingClient();
  private cleanupHandler: (() => void) | null = null;
  // Buffer ICE candidates that arrive before remote description is set
  private iceCandidateBuffer: Map<string, RTCIceCandidateInit[]> = new Map();
  // Track whether remote description has been set for each peer
  private remoteDescriptionSet: Map<string, boolean> = new Map();

  private prewarmPCs: Set<RTCPeerConnection> = new Set();
  private boundBeforeUnload: (() => void) | null = null;

  constructor() {
    this.setupSignalingHandlers();
    
    // LEAK-11: Clean up WebRTC resources when page is unloaded
    if (typeof window !== 'undefined') {
      this.boundBeforeUnload = () => this.destroy();
      window.addEventListener('beforeunload', this.boundBeforeUnload);
    }
  }

  private setupSignalingHandlers(): void {
    this.cleanupHandler = this.signaling.on((message: SignalingMessage) => {
      switch (message.type) {
        case 'offer':
          this.handleOffer(message.fromId as string, message.offer as RTCSessionDescriptionInit, message.isNearby as boolean ?? false);
          break;
        case 'answer':
          this.handleAnswer(message.fromId as string, message.answer as RTCSessionDescriptionInit);
          break;
        case 'ice-candidate':
          this.handleIceCandidate(message.fromId as string, message.candidate as RTCIceCandidateInit);
          break;
        case 'ice-candidates':
          if (Array.isArray(message.candidates)) {
            message.candidates.forEach(c => this.handleIceCandidate(message.fromId as string, c as RTCIceCandidateInit));
          }
          break;
        case 'user-left':
          this.closePeerConnection(message.userId as string);
          break;
      }
    });
  }

  /**
   * Flush buffered ICE candidates after remote description is set
   */
  private async flushIceCandidateBuffer(peerId: string): Promise<void> {
    const buffered = this.iceCandidateBuffer.get(peerId);
    if (buffered && buffered.length > 0) {
      console.log(`[WebRTC] Flushing ${buffered.length} buffered ICE candidates for ${peerId}`);
      for (const candidate of buffered) {
        try {
          const peer = this.peers.get(peerId);
          if (peer) {
            await peer.connection.addIceCandidate(candidate);
          }
        } catch (error) {
          console.error('[WebRTC] Failed to add buffered ICE candidate:', error);
        }
      }
      this.iceCandidateBuffer.delete(peerId);
    }
  }

  /**
   * Initiate connection to a peer
   */
  async connectToPeer(peerId: string, isNearby: boolean = false): Promise<void> {
    console.log('[WebRTC] Initiating connection to:', peerId);

    // Initialize buffer and tracking for this peer
    this.iceCandidateBuffer.set(peerId, []);
    this.remoteDescriptionSet.set(peerId, false);

    const peerConnection = this.createPeerConnection(peerId, isNearby);

    // Open PARALLEL_CHANNELS data channels for high-throughput striped transfer
    console.log(`[WebRTC] Opening ${PARALLEL_CHANNELS} parallel data channels to ${peerId}`);
    for (let i = 0; i < PARALLEL_CHANNELS; i++) {
      const channelLabel = `lynkless-${i}`;
      const dataChannel = peerConnection.connection.createDataChannel(channelLabel, {
        ordered: false, // Elimination of HOL Blocking (100% Performance)
        maxRetransmits: undefined, // Still reliable, just unordered
      });
      this.setupDataChannel(peerId, dataChannel, i);
      peerConnection.dataChannels.push(dataChannel);
    }
    // Keep legacy dataChannel ref pointing to channel 0 for compatibility
    peerConnection.dataChannel = peerConnection.dataChannels[0] ?? null;

    // Enable onnegotiationneeded to take over and create the offer
    peerConnection.initialNegotiationComplete = true;
  }

  /**
   * Handle incoming offer from a peer
   */
  private async handleOffer(fromId: string, offer: RTCSessionDescriptionInit, isNearby: boolean = false): Promise<void> {
    console.log('[WebRTC] Received offer from:', fromId, isNearby ? '(nearby)' : '(remote)');

    let peerConnection = this.peers.get(fromId);
    
    // If we don't have an existing connection, create one
    if (!peerConnection) {
      // Initialize buffer and tracking for this peer
      this.iceCandidateBuffer.set(fromId, []);
      this.remoteDescriptionSet.set(fromId, false);
      peerConnection = this.createPeerConnection(fromId, isNearby);

      // Receiver: listen for incoming data channels and bucket them by label index
      let channelCount = 0;
      peerConnection.connection.ondatachannel = (event) => {
        const ch = event.channel;
        // Extract channel index from label e.g. "lynkless-2" -> 2
        const labelIndex = parseInt(ch.label.split('-').pop() ?? '0', 10);
        const idx = isNaN(labelIndex) ? 0 : labelIndex;
        this.setupDataChannel(fromId, ch, idx);
        peerConnection!.dataChannels[idx] = ch;
        peerConnection!.dataChannel = peerConnection!.dataChannels[0] ?? ch;
        channelCount++;
        console.log(`[WebRTC] Received data channel ${ch.label} (${channelCount}/${PARALLEL_CHANNELS})`);
      };
    } else {
      // For renegotiation on an existing connection, reset tracking
      this.iceCandidateBuffer.set(fromId, []);
      this.remoteDescriptionSet.set(fromId, false);
    }

    const polite = peerConnection.isPolite;
    
    // Perfect Negotiation collision resolution
    const offerCollision = offer.type === 'offer' && (peerConnection.makingOffer || peerConnection.connection.signalingState !== 'stable');
    
    peerConnection.ignoreOffer = !polite && offerCollision;
    if (peerConnection.ignoreOffer) {
      console.log('[WebRTC] Ignoring colliding offer from impolite peer', fromId);
      return;
    }

    // Store remote SDP
    peerConnection.remoteSdp = offer.sdp;

    await peerConnection.connection.setRemoteDescription(offer);
    // Mark remote description as set and flush buffered candidates
    this.remoteDescriptionSet.set(fromId, true);
    await this.flushIceCandidateBuffer(fromId);

    const answer = await peerConnection.connection.createAnswer();
    await peerConnection.connection.setLocalDescription(answer);

    // Store local SDP and generate fingerprint
    peerConnection.localSdp = answer.sdp;
    peerConnection.initialNegotiationComplete = true;
    await this.generateAndStoreFingerprint(fromId, peerConnection);

    this.signaling.send({
      type: 'answer',
      targetId: fromId,
      answer: peerConnection.connection.localDescription,
    });
  }

  /**
   * Handle incoming answer from a peer
   */
  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    console.log('[WebRTC] Received answer from:', fromId);
    const peer = this.peers.get(fromId);
    if (peer) {
      await peer.connection.setRemoteDescription(answer);
      // Mark remote description as set and flush buffered candidates
      this.remoteDescriptionSet.set(fromId, true);
      peer.initialNegotiationComplete = true;
      await this.flushIceCandidateBuffer(fromId);

      // Store remote SDP and generate fingerprint
      peer.remoteSdp = answer.sdp;
      await this.generateAndStoreFingerprint(fromId, peer);
    }
  }

  /**
   * Generate and store connection fingerprint
   */
  private async generateAndStoreFingerprint(peerId: string, peer: PeerConnection): Promise<void> {
    if (peer.localSdp && peer.remoteSdp) {
      try {
        const fingerprint = await generateSimpleFingerprint(peer.localSdp, peer.remoteSdp);
        peer.fingerprint = fingerprint;
        storeFingerprint(peerId, fingerprint);

        // Notify handlers
        this.fingerprintHandlers.forEach(handler => handler(peerId, fingerprint));
        console.log('[WebRTC] Generated fingerprint for', peerId, ':', fingerprint);
      } catch (error) {
        console.error('[WebRTC] Failed to generate fingerprint:', error);
      }
    }
  }

  /**
   * Handle incoming ICE candidate - buffer if remote description not yet set
   */
  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(fromId);
    if (!peer || !candidate) return;

    // If remote description is not yet set, buffer the candidate
    if (!this.remoteDescriptionSet.get(fromId)) {
      console.log('[WebRTC] Buffering ICE candidate for', fromId, '(remote description not set yet)');
      const buffer = this.iceCandidateBuffer.get(fromId) || [];
      buffer.push(candidate);
      this.iceCandidateBuffer.set(fromId, buffer);
      return;
    }

    // Remote description is set, add candidate directly
    try {
      await peer.connection.addIceCandidate(candidate);
    } catch (error) {
      console.error('[WebRTC] Failed to add ICE candidate:', error);
    }
  }

  /**
   * Create a new peer connection
   */
  private createPeerConnection(peerId: string, isNearby: boolean): PeerConnection {
    // Close existing connection if any
    if (this.peers.has(peerId)) {
      this.closePeerConnection(peerId);
    }

    const connection = new RTCPeerConnection(ICE_SERVERS);

    const peerConnection: PeerConnection = {
      peerId,
      connection,
      dataChannel: null,
      dataChannels: [],           // Will be populated after offer/answer
      channelsSendIndex: 0,       // Round-robin starting index
      state: 'new',
      isNearby,
      initialNegotiationComplete: false,
      makingOffer: false,
      ignoreOffer: false,
      isPolite: (this.signaling.getClientId() || '') > peerId,
    };

    // ICE candidate handling with batching
    let iceBatch: RTCIceCandidateInit[] = [];
    let iceBatchTimer: ReturnType<typeof setTimeout> | null = null;
    
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        iceBatch.push(event.candidate);
        if (!iceBatchTimer) {
          iceBatchTimer = setTimeout(() => {
            this.signaling.send({
              type: 'ice-candidates',
              targetId: peerId,
              candidates: iceBatch,
            });
            iceBatch = [];
            iceBatchTimer = null;
          }, 50);
        }
      }
    };

    // Log ICE gathering state for debugging
    connection.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state for', peerId, ':', connection.iceGatheringState);
    };

    // Log ICE connection state for debugging
    connection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state for', peerId, ':', connection.iceConnectionState);

      // EDGE CASE #1: ICE Restarts (Network Hopping)
      // When a user walks out the door and switches from WiFi to 5G, ICE disconnects.
      // We trigger a restart immediately to gracefully recover the data channel without destroying logic.
      if (connection.iceConnectionState === 'disconnected') {
        console.log('[WebRTC] ICE disconnected for', peerId, '- scheduling restart');
        // Wait briefly for transient disconnects before restarting
        setTimeout(() => {
          if (connection.iceConnectionState === 'disconnected' || connection.iceConnectionState === 'failed') {
            console.log('[WebRTC] ICE still disconnected, performing restart for', peerId);
            connection.restartIce();
          }
        }, 2000);
      } else if (connection.iceConnectionState === 'failed') {
        console.log('[WebRTC] ICE failed for', peerId, '- immediate restart');
        connection.restartIce();
      }
    };

    // Connection state changes
    connection.onconnectionstatechange = () => {
      const state = this.mapConnectionState(connection.connectionState);
      peerConnection.state = state;
      this.notifyStateChange(peerId, state);

      if (state === 'connected') {
        console.log('[WebRTC] Successfully connected to', peerId);
        this.checkIfRelay(peerId); // EDGE CASE #4: Detect TURN Relays
      } else if (state === 'failed' || state === 'disconnected') {
        console.log('[WebRTC] Connection to', peerId, 'is', state);
      }
    };

    // Handle remote media tracks (Screen share, Video, Audio)
    connection.ontrack = (event) => {
      console.log('[WebRTC] Received remote track from', peerId, event.track.kind);
      this.trackHandlers.forEach((handler) => handler(peerId, event.track, event.streams));
    };

    // Handle renegotiation
    connection.onnegotiationneeded = async () => {
      if (!peerConnection.initialNegotiationComplete) {
        // Ignoring negotiation needed during initial setup loop
        return;
      }
      try {
        peerConnection.makingOffer = true;
        console.log('[WebRTC] Renegotiation needed for', peerId);
        const offer = await connection.createOffer();
        
        // Check signaling state again just in case it changed during createOffer
        if (connection.signalingState !== 'stable') return;
        
        await connection.setLocalDescription(offer);
        peerConnection.localSdp = offer.sdp;
        
        this.signaling.send({
          type: 'offer',
          targetId: peerId,
          offer: connection.localDescription,
          isNearby: peerConnection.isNearby,
        });
      } catch (err) {
        console.error('[WebRTC] onnegotiationneeded error:', err);
      } finally {
        peerConnection.makingOffer = false;
      }
    };

    this.peers.set(peerId, peerConnection);
    return peerConnection;
  }

  /**
   * Setup data channel event handlers
   */
  private setupDataChannel(peerId: string, channel: RTCDataChannel, channelIndex: number = 0): void {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 512 * 1024; // 512KB

    channel.onopen = () => {
      console.log(`[WebRTC] Data channel [${channel.label}] opened with: ${peerId}`);
      const peer = this.peers.get(peerId);
      // Only notify 'connected' when the FIRST channel (index 0) opens
      if (peer && channelIndex === 0) {
        peer.state = 'connected';
        this.notifyStateChange(peerId, 'connected');
      }
    };

    channel.onclose = () => {
      console.log(`[WebRTC] Data channel [${channel.label}] closed with: ${peerId}`);
      const peer = this.peers.get(peerId);
      // Only notify 'disconnected' when the primary channel (index 0) closes
      if (peer && channelIndex === 0) {
        peer.state = 'disconnected';
        this.notifyStateChange(peerId, 'disconnected');
      }
    };

    channel.onmessage = (event) => {
      this.notifyDataReceived(peerId, event.data);
    };

    channel.onerror = () => {
      if (channel.readyState === 'open' || channel.readyState === 'connecting') {
        return; // Spurious error, channel is fine
      }
      console.warn('[WebRTC] Data channel error for peer:', peerId, 'channel:', channel.label, 'state:', channel.readyState);
    };
  }

  /**
   * Send data to a specific peer (with backpressure support)
   */
  async sendToPeer(peerId: string, data: string | ArrayBuffer | ArrayBufferView, _retryCount = 0): Promise<boolean> {
    const peer = this.peers.get(peerId);
    if (!peer) return false;

    // Pick the best available channel using round-robin striping across parallel channels
    const openChannels = peer.dataChannels.filter(ch => ch.readyState === 'open');
    
    // Fall back to legacy single channel if parallel channels aren't ready yet
    const channels = openChannels.length > 0 ? openChannels : 
      (peer.dataChannel?.readyState === 'open' ? [peer.dataChannel] : []);
    
    if (channels.length === 0) return false;

    // Round-robin: pick the channel with the least buffered data (load balancing)
    const channel = channels.reduce((best, ch) => 
      ch.bufferedAmount < best.bufferedAmount ? ch : best
    , channels[0]);

    // Backpressure: wait if the chosen channel's buffer is overwhelmed (~8MB for high-speed saturation)
    // Liquid-Metal Backpressure: Tuned to 8MB to prevent Chrome's 16MB strict limit queue-full crashes
    while (channel.bufferedAmount > 8 * 1024 * 1024) {
      await new Promise<void>((resolve) => {
        const onLow = () => {
          channel.removeEventListener('bufferedamountlow', onLow);
          resolve();
        };
        channel.addEventListener('bufferedamountlow', onLow);
        setTimeout(() => {
          channel.removeEventListener('bufferedamountlow', onLow);
          resolve();
        }, 100); // Shorter fallback timeout to keep throughput high
      });
    }

    try {
      if (channel.readyState === 'open') {
        channel.send(data as Parameters<RTCDataChannel['send']>[0]);
        return true;
      }
    } catch (e: unknown) {
      const error = e as Error;
      if (error.name === 'OperationError' || (error.message && error.message.includes('queue is full'))) {
        if (_retryCount < 5) {
          // Dynamic backpressure wait if queue is unexpectedly full
          await new Promise<void>((resolve) => {
            const onLow = () => {
              channel.removeEventListener('bufferedamountlow', onLow);
              resolve();
            };
            channel.addEventListener('bufferedamountlow', onLow);
            setTimeout(() => {
              channel.removeEventListener('bufferedamountlow', onLow);
              resolve();
            }, 100);
          });
          return this.sendToPeer(peerId, data, _retryCount + 1);
        }
        console.error('[WebRTC] Send queue permanently full after 5 retries, dropping chunk');
        return false;
      }
      console.error('[WebRTC] Data channel send error:', e);
    }
    
    return false;
  }

  /**
   * Send data to all connected peers
   */
  broadcast(data: string | ArrayBuffer | ArrayBufferView): void {
    this.peers.forEach((peer) => {
      if (peer.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(data as Parameters<RTCDataChannel['send']>[0]);
      }
    });
  }

  /**
   * Get the raw RTCPeerConnection for a peer (used for getStats)
   */
  getPeerConnection(peerId: string): RTCPeerConnection | null {
    const peer = this.peers.get(peerId);
    return peer?.connection || null;
  }

  /**
   * Close connection to a specific peer
   */
  closePeerConnection(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      // Close all parallel channels
      peer.dataChannels.forEach(ch => { try { ch.close(); } catch { /* ignore */ } });
      peer.dataChannel?.close();
      peer.connection.close();
      this.peers.delete(peerId);
      this.iceCandidateBuffer.delete(peerId);
      this.remoteDescriptionSet.delete(peerId);
      clearFingerprint(peerId);
      this.notifyStateChange(peerId, 'disconnected');
    }
  }

  /**
   * Close all peer connections
   */
  closeAllConnections(): void {
    this.peers.forEach((_, peerId) => {
      this.closePeerConnection(peerId);
    });
  }

  /**
   * Get all connected peers
   */
  getConnectedPeers(): PeerConnection[] {
    return Array.from(this.peers.values()).filter(
      (peer) => peer.state === 'connected'
    );
  }

  /**
   * Get peer by ID
   */
  getPeer(peerId: string): PeerConnection | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Get fingerprint for a peer
   */
  getFingerprint(peerId: string): string | undefined {
    return this.peers.get(peerId)?.fingerprint;
  }

  /**
   * Register data handler
   */
  onData(handler: DataHandler): () => void {
    this.dataHandlers.add(handler);
    return () => this.dataHandlers.delete(handler);
  }

  /**
   * Register state change handler
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /**
   * Register relay mode handler
   */
  onRelayMode(handler: (peerId: string, isRelay: boolean) => void): () => void {
    this.relayHandlers.add(handler);
    return () => this.relayHandlers.delete(handler);
  }

  /**
   * Register fingerprint handler
   */
  onFingerprint(handler: FingerprintHandler): () => void {
    this.fingerprintHandlers.add(handler);
    return () => this.fingerprintHandlers.delete(handler);
  }

  /**
   * Register track handler
   */
  onTrack(handler: TrackHandler): () => void {
    this.trackHandlers.add(handler);
    return () => this.trackHandlers.delete(handler);
  }

  /**
   * Add a MediaStreamTrack to a peer
   */
  addTrack(peerId: string, track: MediaStreamTrack, stream: MediaStream): RTCRtpSender | null {
    const peer = this.peers.get(peerId);
    if (!peer) return null;
    return peer.connection.addTrack(track, stream);
  }

  /**
   * Remove a MediaStreamTrack from a peer
   */
  removeTrack(peerId: string, sender: RTCRtpSender): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.removeTrack(sender);
    }
  }

  private notifyDataReceived(peerId: string, data: ArrayBuffer | string): void {
    this.dataHandlers.forEach((handler) => handler(peerId, data));
  }

  private notifyStateChange(peerId: string, state: ConnectionState): void {
    this.stateHandlers.forEach((handler) => handler(peerId, state));
  }

  private mapConnectionState(state: RTCPeerConnectionState): ConnectionState {
    switch (state) {
      case 'new':
        return 'new';
      case 'connecting':
        return 'connecting';
      case 'connected':
        return 'connected';
      case 'disconnected':
        return 'disconnected';
      case 'failed':
        return 'failed';
      case 'closed':
        return 'disconnected';
      default:
        return 'new';
    }
  }

  // EDGE CASE #4: TURN Relay Detection
  private async checkIfRelay(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      const stats = await peer.connection.getStats();
      let isRelay = false;
      
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          const localCandidate = stats.get(report.localCandidateId);
          const remoteCandidate = stats.get(report.remoteCandidateId);
          if (localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay') {
            isRelay = true;
          }
        }
      });
      
      if (isRelay) {
        console.warn(`[WebRTC] Strict Firewall Detected. Peer ${peerId} connected via TURN Relay.`);
      }
      this.relayHandlers.forEach(handler => handler(peerId, isRelay));
    } catch (err) {
      console.log('Failed to check relay stat', err);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.closeAllConnections();
    if (this.cleanupHandler) {
      this.cleanupHandler();
    }
    this.prewarmPCs.forEach(pc => {
      try { pc.close(); } catch {}
    });
    this.prewarmPCs.clear();
    
    this.dataHandlers.clear();
    this.stateHandlers.clear();
    this.fingerprintHandlers.clear();
    this.trackHandlers.clear();
    this.relayHandlers.clear();
    
    if (typeof window !== 'undefined' && this.boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
  }

  /**
   * 120% Polish: Instant-Connect Pre-warming
   * Triggers ICE gathering early so candidates are cached by the browser
   */
  prewarmICECandidates(): void {
    console.log('[WebRTC] Pre-warming ICE candidates...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.prewarmPCs.add(pc);
    pc.onicecandidate = () => { /* gathering to cache in OS stack */ };
    pc.createDataChannel('prewarm');
    pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {});
    // Close after 3s of gathering (enough for most environments)
    setTimeout(() => { 
      try { pc.close(); } catch {} 
      this.prewarmPCs.delete(pc);
    }, 3000);
  }
  /**
   * Get the current state of a peer connection
   */
  getPeerState(peerId: string): ConnectionState {
    const peer = this.peers.get(peerId);
    if (!peer) return 'disconnected';
    return peer.state;
  }
}



export function createWebRTCManager(): WebRTCManager {
  return new WebRTCManager();
}
