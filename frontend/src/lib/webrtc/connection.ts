/**
 * WebRTC Connection Manager
 * Handles peer connections, data channels, and ICE candidates
 */

import { getSignalingClient, SignalingMessage } from '../socket/client';
import { generateSimpleFingerprint, storeFingerprint, clearFingerprint } from './fingerprint';

// STUN servers for NAT traversal
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
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
}

export type DataHandler = (peerId: string, data: ArrayBuffer | string) => void;
export type StateChangeHandler = (peerId: string, state: ConnectionState) => void;
export type FingerprintHandler = (peerId: string, fingerprint: string) => void;

class WebRTCManager {
  private peers: Map<string, PeerConnection> = new Map();
  private dataHandlers: Set<DataHandler> = new Set();
  private stateHandlers: Set<StateChangeHandler> = new Set();
  private fingerprintHandlers: Set<FingerprintHandler> = new Set();
  private signaling = getSignalingClient();
  private cleanupHandler: (() => void) | null = null;

  constructor() {
    this.setupSignalingHandlers();
  }

  private setupSignalingHandlers(): void {
    this.cleanupHandler = this.signaling.on((message: SignalingMessage) => {
      switch (message.type) {
        case 'offer':
          this.handleOffer(message.fromId as string, message.offer as RTCSessionDescriptionInit);
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
   * Initiate connection to a peer
   */
  async connectToPeer(peerId: string, isNearby: boolean = false): Promise<void> {
    console.log('[WebRTC] Initiating connection to:', peerId);

    const peerConnection = this.createPeerConnection(peerId, isNearby);
    
    // Create data channel (initiator creates it)
    const dataChannel = peerConnection.connection.createDataChannel('lynkless', {
      ordered: true,
    });
    this.setupDataChannel(peerId, dataChannel);
    peerConnection.dataChannel = dataChannel;

    // Create and send offer
    const offer = await peerConnection.connection.createOffer();
    await peerConnection.connection.setLocalDescription(offer);

    // Store local SDP for fingerprint generation
    peerConnection.localSdp = offer.sdp;

    this.signaling.send({
      type: 'offer',
      targetId: peerId,
      offer: peerConnection.connection.localDescription,
    });
  }

  /**
   * Handle incoming offer from a peer
   */
  private async handleOffer(fromId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    console.log('[WebRTC] Received offer from:', fromId);

    const peerConnection = this.createPeerConnection(fromId, false);
    
    // Store remote SDP
    peerConnection.remoteSdp = offer.sdp;
    
    // Handle incoming data channel
    peerConnection.connection.ondatachannel = (event) => {
      this.setupDataChannel(fromId, event.channel);
      peerConnection.dataChannel = event.channel;
    };

    await peerConnection.connection.setRemoteDescription(offer);
    const answer = await peerConnection.connection.createAnswer();
    await peerConnection.connection.setLocalDescription(answer);

    // Store local SDP and generate fingerprint
    peerConnection.localSdp = answer.sdp;
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
   * Handle incoming ICE candidate
   */
  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(fromId);
    if (peer && candidate) {
      try {
        await peer.connection.addIceCandidate(candidate);
      } catch (error) {
        console.error('[WebRTC] Failed to add ICE candidate:', error);
      }
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

    // Connection state changes
    connection.onconnectionstatechange = () => {
      const state = this.mapConnectionState(connection.connectionState);
      peerConnection.state = state;
      this.notifyStateChange(peerId, state);

      if (state === 'failed' || state === 'disconnected') {
        console.log('[WebRTC] Connection to', peerId, 'is', state);
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

    channel.onerror = (error) => {
      // Data channel errors are often empty objects, ignore them if channel is working
      if (channel.readyState === 'open' || channel.readyState === 'connecting') {
        // Channel is fine, ignore spurious error
        return;
      }
      console.warn('[WebRTC] Data channel error for peer:', peerId, 'state:', channel.readyState);
    };
  }

  /**
   * Send data to a specific peer
   */
  sendToPeer(peerId: string, data: ArrayBuffer | string): boolean {
    const peer = this.peers.get(peerId);
    if (peer?.dataChannel?.readyState === 'open') {
      peer.dataChannel.send(data as ArrayBuffer);
      return true;
    }
    return false;
  }

  /**
   * Send data to all connected peers
   */
  broadcast(data: ArrayBuffer | string): void {
    this.peers.forEach((peer) => {
      if (peer.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(data as ArrayBuffer);
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
   * Get the DataChannel for a peer (used for buffer-aware sending)
   */
  getDataChannel(peerId: string): RTCDataChannel | null {
    const peer = this.peers.get(peerId);
    return peer?.dataChannel || null;
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
   * Register fingerprint handler
   */
  onFingerprint(handler: FingerprintHandler): () => void {
    this.fingerprintHandlers.add(handler);
    return () => this.fingerprintHandlers.delete(handler);
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
