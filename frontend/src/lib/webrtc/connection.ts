/**
 * WebRTC Connection Manager
 * Handles peer connections, data channels, and ICE candidates
 */

import { getSignalingClient, SignalingMessage } from '../socket/client';
import { generateSimpleFingerprint, storeFingerprint, clearFingerprint } from './fingerprint';

// STUN/TURN servers for NAT traversal
const customIceServersStr = process.env.NEXT_PUBLIC_ICE_SERVERS;
let customIceServers: RTCIceServer[] = [];
try {
  if (customIceServersStr) {
    customIceServers = JSON.parse(customIceServersStr);
  }
} catch {
  console.warn('Failed to parse NEXT_PUBLIC_ICE_SERVERS, ignoring.');
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  // STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  // TURN via UDP (fast but may be blocked by strict firewalls)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // TURN via TCP port 80 — passes through most firewalls that block UDP
  {
    urls: 'turn:openrelay.metered.ca:80?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // TURN via TCP port 443 — passes through even strict HTTPS-only firewalls
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // TURNS (TLS) — encrypted relay, highest compatibility with corporate NATs
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Relay-only ICE config used as a fallback when direct+STUN fails
const RELAY_ONLY_ICE_SERVERS: RTCConfiguration = {
  iceServers: customIceServers.length > 0 ? customIceServers : DEFAULT_ICE_SERVERS,
  iceCandidatePoolSize: 5,
  iceTransportPolicy: 'relay', // force TURN — skip all local/STUN candidates
};

const ICE_SERVERS: RTCConfiguration = {
  iceServers: customIceServers.length > 0 ? customIceServers : DEFAULT_ICE_SERVERS,
  iceCandidatePoolSize: 10,
};

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';

// 1 reliable data channel — multiple channels cause issues across asymmetric NAT.
// Can be increased to 4 when both peers are on same LAN.
const PARALLEL_CHANNELS = 1;

export interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  dataChannels: RTCDataChannel[];
  channelsSendIndex: number;
  state: ConnectionState;
  isNearby: boolean;
  localSdp?: string;
  remoteSdp?: string;
  fingerprint?: string;
  // Perfect Negotiation state
  makingOffer: boolean;
  ignoreOffer: boolean;
  isPolite: boolean;
  // Relay fallback: after ICE fails with normal config, retry with relay-only
  relayFallbackAttempted: boolean;
  iceFailCount: number;
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
  private remoteDescriptionSet: Map<string, boolean> = new Map();

  private prewarmPCs: Set<RTCPeerConnection> = new Set();
  private boundBeforeUnload: (() => void) | null = null;

  constructor() {
    this.setupSignalingHandlers();

    if (typeof window !== 'undefined') {
      this.boundBeforeUnload = () => this.destroy();
      window.addEventListener('beforeunload', this.boundBeforeUnload);
    }
  }

  private setupSignalingHandlers(): void {
    this.cleanupHandler = this.signaling.on((message: SignalingMessage) => {
      switch (message.type) {
        case 'offer':
          this.handleOffer(
            message.fromId as string,
            message.offer as RTCSessionDescriptionInit,
            (message.isNearby as boolean) ?? false,
          );
          break;
        case 'answer':
          this.handleAnswer(message.fromId as string, message.answer as RTCSessionDescriptionInit);
          break;
        case 'ice-candidate':
          this.handleIceCandidate(
            message.fromId as string,
            message.candidate as RTCIceCandidateInit,
          );
          break;
        case 'ice-candidates':
          if (Array.isArray(message.candidates)) {
            message.candidates.forEach((c) =>
              this.handleIceCandidate(message.fromId as string, c as RTCIceCandidateInit),
            );
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
    const buffered = this.iceCandidateBuffer.get(peerId) ?? [];
    if (buffered.length === 0) return;

    console.log(`[WebRTC] Flushing ${buffered.length} buffered ICE candidates for ${peerId}`);
    this.iceCandidateBuffer.set(peerId, []); // Clear buffer before async loop to avoid double-adds

    const peer = this.peers.get(peerId);
    if (!peer) return;

    for (const candidate of buffered) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        // Ignore errors for trickled candidates after connection is established
        console.warn('[WebRTC] Skipped buffered ICE candidate:', error);
      }
    }
  }

  /**
   * Initiate connection to a peer (offerer side)
   * 
   * FIX: initialNegotiationComplete removed — we now always rely on onnegotiationneeded.
   * The fix is to NOT gate onnegotiationneeded on any flag, and instead use
   * makingOffer as the proper debounce per the Perfect Negotiation spec.
   */
  async connectToPeer(peerId: string, isNearby: boolean = false): Promise<void> {
    console.log('[WebRTC] Initiating connection to:', peerId);

    // Initialize buffer and tracking for this peer
    this.iceCandidateBuffer.set(peerId, []);
    this.remoteDescriptionSet.set(peerId, false);

    const peerConnection = this.createPeerConnection(peerId, isNearby);

    // Open PARALLEL_CHANNELS data channels for high-throughput striped transfer.
    // NOTE: createDataChannel triggers onnegotiationneeded — the handler will
    //       create and send the offer automatically. We do NOT manually create
    //       the offer here to avoid double-offers.
    console.log(`[WebRTC] Opening ${PARALLEL_CHANNELS} parallel data channels to ${peerId}`);
    for (let i = 0; i < PARALLEL_CHANNELS; i++) {
      const channelLabel = `lynkless-${i}`;
      const dataChannel = peerConnection.connection.createDataChannel(channelLabel, {
        ordered: false,      // Unordered for zero HOL-blocking
        maxRetransmits: 30,  // Limited retransmits for reliability without ordering delay
      });
      this.setupDataChannel(peerId, dataChannel, i);
      peerConnection.dataChannels.push(dataChannel);
    }
    // Legacy compatibility ref
    peerConnection.dataChannel = peerConnection.dataChannels[0] ?? null;
  }

  /**
   * Handle incoming offer from a peer (answerer side)
   */
  private async handleOffer(
    fromId: string,
    offer: RTCSessionDescriptionInit,
    isNearby: boolean = false,
  ): Promise<void> {
    console.log('[WebRTC] Received offer from:', fromId, isNearby ? '(nearby)' : '(remote)');

    let peerConnection = this.peers.get(fromId);

    if (!peerConnection) {
      // First offer — create connection as answerer
      this.iceCandidateBuffer.set(fromId, []);
      this.remoteDescriptionSet.set(fromId, false);
      peerConnection = this.createPeerConnection(fromId, isNearby);

      // Answerer side: receive data channels opened by offerer
      peerConnection.connection.ondatachannel = (event) => {
        const ch = event.channel;
        const labelIndex = parseInt(ch.label.split('-').pop() ?? '0', 10);
        const idx = isNaN(labelIndex) ? 0 : labelIndex;
        this.setupDataChannel(fromId, ch, idx);
        peerConnection!.dataChannels[idx] = ch;
        peerConnection!.dataChannel = peerConnection!.dataChannels[0] ?? ch;
        console.log(`[WebRTC] Received data channel: ${ch.label}`);
      };
    }

    const polite = peerConnection.isPolite;

    // Perfect Negotiation: collision detection
    const offerCollision =
      offer.type === 'offer' &&
      (peerConnection.makingOffer || peerConnection.connection.signalingState !== 'stable');

    peerConnection.ignoreOffer = !polite && offerCollision;
    if (peerConnection.ignoreOffer) {
      console.log('[WebRTC] Collision: impolite peer ignoring incoming offer from', fromId);
      return;
    }

    // For polite peer during collision: rollback then accept
    if (offerCollision && polite) {
      console.log('[WebRTC] Collision: polite peer rolling back to accept offer from', fromId);
      await peerConnection.connection.setLocalDescription({ type: 'rollback' });
    }

    // Reset ICE buffer for this new negotiation round
    this.iceCandidateBuffer.set(fromId, []);
    this.remoteDescriptionSet.set(fromId, false);

    try {
      await peerConnection.connection.setRemoteDescription(new RTCSessionDescription(offer));
    } catch (err) {
      console.error('[WebRTC] setRemoteDescription(offer) failed:', err);
      return;
    }

    // Mark remote description as set and flush buffered candidates
    this.remoteDescriptionSet.set(fromId, true);
    peerConnection.remoteSdp = offer.sdp;
    await this.flushIceCandidateBuffer(fromId);

    // Create and send answer
    let answer: RTCSessionDescriptionInit;
    try {
      answer = await peerConnection.connection.createAnswer();
      await peerConnection.connection.setLocalDescription(answer);
    } catch (err) {
      console.error('[WebRTC] createAnswer/setLocalDescription failed:', err);
      return;
    }

    peerConnection.localSdp = peerConnection.connection.localDescription?.sdp;
    await this.generateAndStoreFingerprint(fromId, peerConnection);

    this.signaling.send({
      type: 'answer',
      targetId: fromId,
      answer: peerConnection.connection.localDescription,
    });
  }

  /**
   * Handle incoming answer from a peer (offerer side)
   */
  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    console.log('[WebRTC] Received answer from:', fromId);
    const peer = this.peers.get(fromId);
    if (!peer) {
      console.warn('[WebRTC] Received answer but no peer connection found for', fromId);
      return;
    }

    if (peer.connection.signalingState === 'stable') {
      console.warn('[WebRTC] Received answer but already in stable state for', fromId, '— ignoring');
      return;
    }

    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('[WebRTC] setRemoteDescription(answer) failed:', err);
      return;
    }

    this.remoteDescriptionSet.set(fromId, true);
    peer.remoteSdp = answer.sdp;
    await this.flushIceCandidateBuffer(fromId);
    await this.generateAndStoreFingerprint(fromId, peer);
  }

  /**
   * Generate and store connection fingerprint
   */
  private async generateAndStoreFingerprint(
    peerId: string,
    peer: PeerConnection,
  ): Promise<void> {
    if (peer.localSdp && peer.remoteSdp) {
      try {
        const fingerprint = await generateSimpleFingerprint(peer.localSdp, peer.remoteSdp);
        peer.fingerprint = fingerprint;
        storeFingerprint(peerId, fingerprint);
        this.fingerprintHandlers.forEach((handler) => handler(peerId, fingerprint));
        console.log('[WebRTC] Generated fingerprint for', peerId, ':', fingerprint);
      } catch (error) {
        console.error('[WebRTC] Failed to generate fingerprint:', error);
      }
    }
  }

  /**
   * Handle incoming ICE candidate — buffer if remote description not yet set
   */
  private async handleIceCandidate(
    fromId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const peer = this.peers.get(fromId);
    if (!peer || !candidate || !candidate.candidate) return;

    if (!this.remoteDescriptionSet.get(fromId)) {
      const buffer = this.iceCandidateBuffer.get(fromId) ?? [];
      buffer.push(candidate);
      this.iceCandidateBuffer.set(fromId, buffer);
      return;
    }

    try {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      // Benign: can happen on offer-collision rollback
      console.warn('[WebRTC] addIceCandidate failed (benign during rollback):', error);
    }
  }

  /**
   * Create a new RTCPeerConnection with all event handlers
   */
  private createPeerConnection(peerId: string, isNearby: boolean): PeerConnection {
    // Close existing connection cleanly before creating a new one
    if (this.peers.has(peerId)) {
      this.closePeerConnection(peerId);
    }

    const connection = new RTCPeerConnection(ICE_SERVERS);

    const peerConnection: PeerConnection = {
      peerId,
      connection,
      dataChannel: null,
      dataChannels: [],
      channelsSendIndex: 0,
      state: 'new',
      isNearby,
      makingOffer: false,
      ignoreOffer: false,
      // Politeness: higher string ID is polite (deterministic)
      // Impolite peer = original offerer = owns ICE restart
      isPolite: (this.signaling.getClientId() ?? '') > peerId,
      relayFallbackAttempted: false,
      iceFailCount: 0,
    };

    // Store IMMEDIATELY so handlers can look up this peer during async negotiation
    this.peers.set(peerId, peerConnection);

    // Attach all event handlers (shared with relay-only fallback path)
    this.attachConnectionHandlers(peerId, peerConnection, connection);

    return peerConnection;
  }


  /**
   * Setup data channel event handlers
   */
  private setupDataChannel(
    peerId: string,
    channel: RTCDataChannel,
    channelIndex: number = 0,
  ): void {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 512 * 1024; // 512 KB

    channel.onopen = () => {
      console.log(`[WebRTC] ✅ Data channel [${channel.label}] opened with: ${peerId}`);
      const peer = this.peers.get(peerId);
      // Notify 'connected' when the FIRST channel (index 0) opens
      if (peer && channelIndex === 0) {
        peer.state = 'connected';
        this.notifyStateChange(peerId, 'connected');
      }
    };

    channel.onclose = () => {
      console.log(`[WebRTC] Data channel [${channel.label}] closed with: ${peerId}`);
      const peer = this.peers.get(peerId);
      if (peer && channelIndex === 0) {
        peer.state = 'disconnected';
        this.notifyStateChange(peerId, 'disconnected');
      }
    };

    channel.onmessage = (event) => {
      this.notifyDataReceived(peerId, event.data);
    };

    channel.onerror = (err) => {
      if (channel.readyState === 'open' || channel.readyState === 'connecting') {
        return; // Spurious error on some browsers; channel is fine
      }
      console.warn(
        '[WebRTC] Data channel error:',
        peerId,
        channel.label,
        channel.readyState,
        err,
      );
    };
  }

  /**
   * Send data to a specific peer with load-balanced round-robin + backpressure
   */
  async sendToPeer(
    peerId: string,
    data: string | ArrayBuffer | ArrayBufferView,
    _retryCount = 0,
  ): Promise<boolean> {
    const peer = this.peers.get(peerId);
    if (!peer) return false;

    // Bolt: Optimized data channel selection to eliminate per-chunk array allocations (filter/reduce)
    let channel: RTCDataChannel | null = null;
    let minBufferedAmount = Infinity;

    // Fast-path: Check parallel channels first
    for (let i = 0; i < peer.dataChannels.length; i++) {
      const ch = peer.dataChannels[i];
      if (ch.readyState === 'open') {
        if (ch.bufferedAmount < minBufferedAmount) {
          minBufferedAmount = ch.bufferedAmount;
          channel = ch;
        }
      }
    }

    // Fallback: Check legacy dataChannel if no parallel ones were open
    if (!channel && peer.dataChannel?.readyState === 'open') {
      channel = peer.dataChannel;
    }

    if (!channel) return false;

    // Backpressure: wait if buffer is > 8 MB
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
        }, 100);
      });
    }

    try {
      if (channel.readyState === 'open') {
        channel.send(data as Parameters<RTCDataChannel['send']>[0]);
        return true;
      }
    } catch (e: unknown) {
      const error = e as Error;
      if (
        error.name === 'OperationError' ||
        (error.message && error.message.includes('queue is full'))
      ) {
        if (_retryCount < 5) {
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
    return this.peers.get(peerId)?.connection ?? null;
  }

  /**
   * Close connection to a specific peer
   */
  closePeerConnection(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.dataChannels.forEach((ch) => {
        try { ch.close(); } catch { /* ignore */ }
      });
      try { peer.dataChannel?.close(); } catch { /* ignore */ }
      try { peer.connection.close(); } catch { /* ignore */ }
      this.peers.delete(peerId);
      this.iceCandidateBuffer.delete(peerId);
      this.remoteDescriptionSet.delete(peerId);
      clearFingerprint(peerId);
      this.notifyStateChange(peerId, 'disconnected');
    }
  }

  closeAllConnections(): void {
    this.peers.forEach((_, peerId) => this.closePeerConnection(peerId));
  }

  getConnectedPeers(): PeerConnection[] {
    return Array.from(this.peers.values()).filter((peer) => peer.state === 'connected');
  }

  getPeer(peerId: string): PeerConnection | undefined {
    return this.peers.get(peerId);
  }

  getFingerprint(peerId: string): string | undefined {
    return this.peers.get(peerId)?.fingerprint;
  }

  onData(handler: DataHandler): () => void {
    this.dataHandlers.add(handler);
    return () => this.dataHandlers.delete(handler);
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onRelayMode(handler: (peerId: string, isRelay: boolean) => void): () => void {
    this.relayHandlers.add(handler);
    return () => this.relayHandlers.delete(handler);
  }

  onFingerprint(handler: FingerprintHandler): () => void {
    this.fingerprintHandlers.add(handler);
    return () => this.fingerprintHandlers.delete(handler);
  }

  onTrack(handler: TrackHandler): () => void {
    this.trackHandlers.add(handler);
    return () => this.trackHandlers.delete(handler);
  }

  addTrack(peerId: string, track: MediaStreamTrack, stream: MediaStream): RTCRtpSender | null {
    const peer = this.peers.get(peerId);
    if (!peer) return null;
    return peer.connection.addTrack(track, stream);
  }

  removeTrack(peerId: string, sender: RTCRtpSender): void {
    this.peers.get(peerId)?.connection.removeTrack(sender);
  }

  private notifyDataReceived(peerId: string, data: ArrayBuffer | string): void {
    this.dataHandlers.forEach((handler) => handler(peerId, data));
  }

  private notifyStateChange(peerId: string, state: ConnectionState): void {
    this.stateHandlers.forEach((handler) => handler(peerId, state));
  }

  private mapConnectionState(state: RTCPeerConnectionState): ConnectionState {
    switch (state) {
      case 'new': return 'new';
      case 'connecting': return 'connecting';
      case 'connected': return 'connected';
      case 'disconnected': return 'disconnected';
      case 'failed': return 'failed';
      case 'closed': return 'disconnected';
      default: return 'new';
    }
  }

  /**
   * ICE recovery strategy with relay-only fallback.
   * - Attempt 1: restartIce() — fast, reuses same PeerConnection, tries new candidates
   * - Attempt 2+: recreate PeerConnection with relay-only policy — forces TURN relay,
   *   bypasses any broken local/STUN candidates (handles mobile data + WiFi cross-network)
   */
  private attemptIceRecovery(
    peerId: string,
    peerConnection: PeerConnection,
    connection: RTCPeerConnection,
  ): void {
    const failCount = peerConnection.iceFailCount;

    if (failCount <= 1 && !peerConnection.relayFallbackAttempted) {
      // First failure: standard ICE restart (reuse same PeerConnection)
      console.log('[WebRTC] ICE recovery attempt 1: restartIce() for', peerId);
      connection.restartIce();
    } else if (!peerConnection.relayFallbackAttempted) {
      // Second failure: recreate with relay-only (force TURN, skip STUN)
      peerConnection.relayFallbackAttempted = true;
      console.log('[WebRTC] ICE recovery attempt 2: relay-only fallback for', peerId, '— creating new PeerConnection with iceTransportPolicy=relay');
      this.reconnectPeerWithRelayOnly(peerId, peerConnection.isNearby);
    } else {
      // Already tried relay-only — notify user of permanent failure
      console.error('[WebRTC] ICE permanently failed for', peerId, '— all recovery strategies exhausted');
      this.notifyStateChange(peerId, 'failed');
    }
  }

  /**
   * Recreate peer connection with relay-only ICE policy.
   * Called when direct P2P and STUN both fail — forces all traffic through TURN relay.
   */
  private async reconnectPeerWithRelayOnly(peerId: string, isNearby: boolean): Promise<void> {
    console.log('[WebRTC] 🔄 Reconnecting', peerId, 'with relay-only ICE policy...');

    // Close old connection cleanly (but DON'T notify disconnected — we're recovering)
    const oldPeer = this.peers.get(peerId);
    if (oldPeer) {
      oldPeer.dataChannels.forEach((ch) => { try { ch.close(); } catch {} });
      try { oldPeer.dataChannel?.close(); } catch {}
      try { oldPeer.connection.close(); } catch {}
      // Delete from map without notifying — we'll reconnect immediately
      this.peers.delete(peerId);
      this.iceCandidateBuffer.delete(peerId);
      this.remoteDescriptionSet.delete(peerId);
    }

    // Create new PeerConnection with relay-only policy
    const connection = new RTCPeerConnection(RELAY_ONLY_ICE_SERVERS);

    const peerConnection: PeerConnection = {
      peerId,
      connection,
      dataChannel: null,
      dataChannels: [],
      channelsSendIndex: 0,
      state: 'connecting',
      isNearby,
      makingOffer: false,
      ignoreOffer: false,
      isPolite: (this.signaling.getClientId() ?? '') > peerId,
      relayFallbackAttempted: true,
      iceFailCount: 0,
    };

    this.peers.set(peerId, peerConnection);
    this.iceCandidateBuffer.set(peerId, []);
    this.remoteDescriptionSet.set(peerId, false);

    // Re-attach all event handlers from the new connection
    this.attachConnectionHandlers(peerId, peerConnection, connection);

    // Open data channel and trigger new offer
    const dataChannel = connection.createDataChannel('lynkless-0', {
      ordered: false,
      maxRetransmits: 30,
    });
    this.setupDataChannel(peerId, dataChannel, 0);
    peerConnection.dataChannels[0] = dataChannel;
    peerConnection.dataChannel = dataChannel;

    // ondatachannel for when the new offer arrives at the other side
    // (the other side will create a new peer connection via handleOffer)
  }

  /**
   * Attach ICE, connection state, and negotiation event handlers to a connection.
   * Extracted so it can be reused when creating relay-only fallback connections.
   */
  private attachConnectionHandlers(
    peerId: string,
    peerConnection: PeerConnection,
    connection: RTCPeerConnection,
  ): void {
    let iceBatch: RTCIceCandidateInit[] = [];
    let iceBatchTimer: ReturnType<typeof setTimeout> | null = null;

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        iceBatch.push(event.candidate.toJSON());
        if (!iceBatchTimer) {
          iceBatchTimer = setTimeout(() => {
            this.signaling.send({ type: 'ice-candidates', targetId: peerId, candidates: iceBatch });
            iceBatch = [];
            iceBatchTimer = null;
          }, 50);
        }
      } else {
        if (iceBatch.length > 0 && iceBatchTimer) {
          clearTimeout(iceBatchTimer);
          iceBatchTimer = null;
          this.signaling.send({ type: 'ice-candidates', targetId: peerId, candidates: iceBatch });
          iceBatch = [];
        }
      }
    };

    connection.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state for', peerId, ':', connection.iceGatheringState);
    };

    connection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state for', peerId, ':', connection.iceConnectionState);

      if (connection.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (
            connection.iceConnectionState === 'disconnected' ||
            connection.iceConnectionState === 'failed'
          ) {
            if (!peerConnection.isPolite) {
              peerConnection.iceFailCount++;
              this.attemptIceRecovery(peerId, peerConnection, connection);
            }
          }
        }, 2000);
      } else if (connection.iceConnectionState === 'failed') {
        if (!peerConnection.isPolite) {
          peerConnection.iceFailCount++;
          this.attemptIceRecovery(peerId, peerConnection, connection);
        }
      }
    };

    connection.onconnectionstatechange = () => {
      const state = this.mapConnectionState(connection.connectionState);
      peerConnection.state = state;
      this.notifyStateChange(peerId, state);

      if (state === 'connected') {
        console.log('[WebRTC] ✅ Successfully connected to', peerId, peerConnection.relayFallbackAttempted ? '(via TURN relay)' : '(direct)');
        this.checkIfRelay(peerId);
      } else if (state === 'failed') {
        console.log('[WebRTC] Connection to', peerId, 'permanently failed');
      }
    };

    connection.ontrack = (event) => {
      this.trackHandlers.forEach((handler) => handler(peerId, event.track, event.streams));
    };

    connection.onnegotiationneeded = async () => {
      if (peerConnection.makingOffer) return;
      try {
        peerConnection.makingOffer = true;
        console.log('[WebRTC] Creating offer for', peerId, peerConnection.relayFallbackAttempted ? '(relay-only)' : '');
        const offer = await connection.createOffer();
        if (connection.signalingState !== 'have-local-offer' && connection.signalingState !== 'stable') return;
        await connection.setLocalDescription(offer);
        peerConnection.localSdp = connection.localDescription?.sdp;
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
  }

  private async checkIfRelay(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      const stats = await peer.connection.getStats();
      let isRelay = false;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          const localCandidate = stats.get(report.localCandidateId);
          const remoteCandidate = stats.get(report.remoteCandidateId);
          if (
            localCandidate?.candidateType === 'relay' ||
            remoteCandidate?.candidateType === 'relay'
          ) {
            isRelay = true;
          }
        }
      });

      if (isRelay) {
        console.warn(`[WebRTC] Peer ${peerId} connected via TURN relay (strict firewall detected).`);
      }
      this.relayHandlers.forEach((handler) => handler(peerId, isRelay));
    } catch (err) {
      console.warn('[WebRTC] Failed to check relay stats:', err);
    }
  }

  destroy(): void {
    this.closeAllConnections();
    if (this.cleanupHandler) {
      this.cleanupHandler();
      this.cleanupHandler = null;
    }
    this.prewarmPCs.forEach((pc) => { try { pc.close(); } catch {} });
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
   * Pre-warm ICE candidates so the first connection is instant
   */
  prewarmICECandidates(): void {
    console.log('[WebRTC] Pre-warming ICE candidates...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.prewarmPCs.add(pc);
    pc.onicecandidate = () => { /* gathering to warm the OS stack */ };
    pc.createDataChannel('prewarm');
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => {});
    setTimeout(() => {
      try { pc.close(); } catch {}
      this.prewarmPCs.delete(pc);
    }, 3000);
  }

  getPeerState(peerId: string): ConnectionState {
    return this.peers.get(peerId)?.state ?? 'disconnected';
  }
}

export function createWebRTCManager(): WebRTCManager {
  return new WebRTCManager();
}
