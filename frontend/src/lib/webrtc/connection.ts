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
// TURN servers are required for Symmetric NAT (e.g., enterprise firewalls/cellular).
// Providing a free open TURN server is difficult as they frequently shut down or get abused.
// Users should configure NEXT_PUBLIC_ICE_SERVERS to add their own TURN credentials.
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

const ICE_SERVERS: RTCConfiguration = {
  iceServers: customIceServers.length > 0 ? customIceServers : DEFAULT_ICE_SERVERS,
  iceCandidatePoolSize: 10,
};

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  state: ConnectionState;
  isNearby: boolean;
  localSdp?: string;
  remoteSdp?: string;
  fingerprint?: string;
  initialNegotiationComplete: boolean;
}

export type DataHandler = (peerId: string, data: ArrayBuffer | string) => void;
export type StateChangeHandler = (peerId: string, state: ConnectionState) => void;
export type FingerprintHandler = (peerId: string, fingerprint: string) => void;
export type TrackHandler = (peerId: string, track: MediaStreamTrack, streams: readonly MediaStream[]) => void;

class WebRTCManager {
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

  constructor() {
    this.setupSignalingHandlers();
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

    // Create data channel (initiator creates it)
    const dataChannel = peerConnection.connection.createDataChannel('lynkless');
    this.setupDataChannel(peerId, dataChannel);
    peerConnection.dataChannel = dataChannel;

    // Create and send offer
    const offer = await peerConnection.connection.createOffer();
    await peerConnection.connection.setLocalDescription(offer);

    // Store local SDP for fingerprint generation
    peerConnection.localSdp = offer.sdp;
    peerConnection.initialNegotiationComplete = true;

    this.signaling.send({
      type: 'offer',
      targetId: peerId,
      offer: peerConnection.connection.localDescription,
      isNearby: isNearby,
    });
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

      // Handle incoming data channel ONLY for new connections
      peerConnection.connection.ondatachannel = (event) => {
        this.setupDataChannel(fromId, event.channel);
        peerConnection!.dataChannel = event.channel;
      };
    } else {
      // For renegotiation on an existing connection, reset tracking
      this.iceCandidateBuffer.set(fromId, []);
      this.remoteDescriptionSet.set(fromId, false);
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
      state: 'new',
      isNearby,
      initialNegotiationComplete: false,
    };

    // ICE candidate handling
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.send({
          type: 'ice-candidate',
          targetId: peerId,
          candidate: event.candidate,
        });
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
      if (connection.iceConnectionState === 'disconnected' || connection.iceConnectionState === 'failed') {
        console.log(`[WebRTC] ICE ${connection.iceConnectionState} for`, peerId, '- attempting Seamless ICE Restart');
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
        // Debounce or catch stable state
        if (connection.signalingState !== 'stable') return;

        console.log('[WebRTC] Renegotiation needed for', peerId);
        const offer = await connection.createOffer();
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
      }
    };

    this.peers.set(peerId, peerConnection);
    return peerConnection;
  }

  /**
   * Setup data channel event handlers
   */
  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 512 * 1024; // 512KB

    channel.onopen = () => {
      console.log('[WebRTC] Data channel opened with:', peerId);
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.state = 'connected';
        this.notifyStateChange(peerId, 'connected');
      }
    };

    channel.onclose = () => {
      console.log('[WebRTC] Data channel closed with:', peerId);
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.state = 'disconnected';
        this.notifyStateChange(peerId, 'disconnected');
      }
    };

    channel.onmessage = (event) => {
      this.notifyDataReceived(peerId, event.data);
    };

    channel.onerror = () => {
      // Data channel errors are often empty objects, ignore them if channel is working
      if (channel.readyState === 'open' || channel.readyState === 'connecting') {
        // Channel is fine, ignore spurious error
        return;
      }
      console.warn('[WebRTC] Data channel error for peer:', peerId, 'state:', channel.readyState);
    };
  }

  /**
   * Send data to a specific peer (with backpressure support)
   */
  async sendToPeer(peerId: string, data: string | ArrayBuffer | ArrayBufferView): Promise<boolean> {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.dataChannel || peer.dataChannel.readyState !== 'open') {
      return false;
    }

    const channel = peer.dataChannel;

    // Buffer limit ~1MB, if exceeded wait for bufferedAmountLow
    if (channel.bufferedAmount > 1024 * 1024) {
      await new Promise<void>((resolve) => {
        const onLow = () => {
          channel.removeEventListener('bufferedamountlow', onLow);
          resolve();
        };
        channel.addEventListener('bufferedamountlow', onLow);
        
        // Timeout to prevent hanging if connection drops unexpectedly
        setTimeout(() => {
          channel.removeEventListener('bufferedamountlow', onLow);
          resolve(); 
        }, 3000);
      });
    }

    try {
      // It might have closed while we were waiting
      if (channel.readyState === 'open') {
        channel.send(data as Parameters<RTCDataChannel['send']>[0]);
        return true;
      }
    } catch (e) {
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
    this.dataHandlers.clear();
    this.stateHandlers.clear();
    this.fingerprintHandlers.clear();
  }
}

// Singleton instance
let webRTCManager: WebRTCManager | null = null;

export function getWebRTCManager(): WebRTCManager {
  if (!webRTCManager) {
    webRTCManager = new WebRTCManager();
  }
  return webRTCManager;
}

export function createWebRTCManager(): WebRTCManager {
  return new WebRTCManager();
}
