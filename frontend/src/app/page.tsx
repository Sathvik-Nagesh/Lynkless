'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Radar from '@/components/Radar';
import FileDropZone from '@/components/FileDropZone';
import TransferProgress from '@/components/TransferProgress';
import ChatPanel from '@/components/ChatPanel';
import RoomControls from '@/components/RoomControls';
import ConnectionStatus from '@/components/ConnectionStatus';
import ConnectionRequestModal from '@/components/ConnectionRequestModal';
import ConnectionFingerprint from '@/components/ConnectionFingerprint';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import QRScannerModal from '@/components/QRScannerModal';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import Onboarding from '@/components/Onboarding';
import FilePreviewModal from '@/components/FilePreviewModal';
import ConnectionStatusBadge from '@/components/ConnectionStatusBadge';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { getPeerName, getEmojiForPeer } from '@/lib/utils/nameGenerator';
import { getSounds } from '@/lib/utils/sounds';
import { getConnectionMonitor, type PeerStats } from '@/lib/utils/connectionMonitor';
import { useToast } from '@/components/ToastProvider';
import Link from 'next/link';

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'ws://localhost:8080';

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [peerStats, setPeerStats] = useState<Map<string, PeerStats>>(new Map());
  const sounds = useRef(getSounds());
  const connectionMonitor = useRef(getConnectionMonitor());
  const { showToast } = useToast();

  const {
    clientId,
    isConnected,
    roomState,
    nearbyPeers,
    incomingRequests,
    peerStates,
    error,
    connect,
    createRoom,
    joinRoom,
    leaveRoom,
    sendConnectionRequest,
    acceptConnectionRequest,
    rejectConnectionRequest,
  } = useSignaling();

  const {
    peers,
    transfers,
    messages,
    fingerprints,
    connectToPeer,
    sendFile,
    sendMessage,
    cancelTransfer,
    pauseTransfer,
    resumeTransfer,
    disconnectFromPeer,
    getFingerprint,
  } = useWebRTC(clientId);

  // Auto-connect to signaling server
  useEffect(() => {
    const initConnection = async () => {
      try {
        await connect();
      } catch (err) {
        console.error('Failed to connect:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initConnection();
  }, [connect]);

  // Handle user click on radar - now sends connection REQUEST
  const handleUserClick = useCallback(async (userId: string) => {
    const currentState = peerStates.get(userId);
    
    // If already connected, just select the peer
    if (currentState?.state === 'connected') {
      setSelectedPeer(userId);
      return;
    }

    // If already have a pending request, do nothing
    if (currentState?.state === 'request-sent' || currentState?.state === 'request-received') {
      return;
    }

    // If NOT in a room, prevent connecting to multiple peers
    if (!roomState.code) {
      const connectedPeers = peers.filter(p => p.state === 'connected');
      if (connectedPeers.length > 0) {
        showToast('Disconnect from current peer first, or create a room for multi-device connections', 'info');
        return;
      }
    }

    // Send connection request
    sendConnectionRequest(userId);
  }, [peerStates, sendConnectionRequest, roomState.code, peers, showToast]);

  // Auto-close QR code when incoming connection request arrives
  useEffect(() => {
    if (incomingRequests.length > 0) {
      sounds.current.playRequestReceived();
      if (showQRCode) {
        setShowQRCode(false);
      }
    }
  }, [incomingRequests.length, showQRCode]);

  // Handle connection acceptance - now initiate WebRTC
  const handleAcceptRequest = useCallback(async (fromId: string) => {
    // If NOT in a room, prevent accepting if already connected to someone
    if (!roomState.code) {
      const connectedPeers = peers.filter(p => p.state === 'connected');
      if (connectedPeers.length > 0) {
        rejectConnectionRequest(fromId);
        showToast('Already connected to a peer. Disconnect first or use a room for multi-device.', 'info');
        return;
      }
    }

    acceptConnectionRequest(fromId);
    sounds.current.playConnected();
    showToast(`Connected to ${getPeerName(fromId)}`, 'success');
    
    // The accepter initiates the WebRTC connection
    const user = roomState.users.find(u => u.id === fromId);
    const nearbyPeer = nearbyPeers.find(p => p.id === fromId);
    const isNearby = user?.isNearby || nearbyPeer?.isNearby || false;
    
    await connectToPeer(fromId, isNearby);
    setSelectedPeer(fromId);
  }, [acceptConnectionRequest, rejectConnectionRequest, roomState.code, roomState.users, nearbyPeers, peers, connectToPeer, showToast]);

  // Handle file drop - show preview modal
  const handleFileDrop = useCallback((files: File[]) => {
    const connectedPeers = peers.filter(p => p.state === 'connected');
    
    if (connectedPeers.length === 0) {
      console.warn('[File Drop] No connected peers');
      return;
    }

    setPendingFiles(files);
    setShowFilePreview(true);
  }, [peers]);

  // Confirm and send files
  const handleConfirmSend = useCallback(async () => {
    setShowFilePreview(false);
    const connectedPeers = peers.filter(p => p.state === 'connected');

    sounds.current.playTransferStart();

    try {
      for (const file of pendingFiles) {
        for (const peer of connectedPeers) {
          await sendFile(file, peer.id);
        }
      }
      console.log(`[File Drop] Sent ${pendingFiles.length} file(s) to ${connectedPeers.length} peer(s)`);
      sounds.current.playTransferComplete();
      showToast(`Sent ${pendingFiles.length} file(s) to ${connectedPeers.length} peer(s)`, 'success');
    } catch (err) {
      console.error('Failed to send files:', err);
      sounds.current.playError();
      showToast('Failed to send files. Please try again.', 'error');
    }
    
    setPendingFiles([]);
  }, [pendingFiles, peers, sendFile]);

  // Track which users we've already sent requests to (prevent duplicates)
  const sentRequestsRef = useRef<Set<string>>(new Set());

  // Auto-connect to all users when joining a room
  // IMPORTANT: To avoid duplicate requests, only the user with LOWER ID initiates
  useEffect(() => {
    if (!roomState.code || !clientId) return;

    // Get all users in room (excluding self)
    const otherUsers = roomState.users.filter(u => u.id !== clientId);
    
    otherUsers.forEach(async (user) => {
      // Skip if we've already sent a request to this user
      if (sentRequestsRef.current.has(user.id)) {
        return;
      }

      // Skip if already connected or has pending request
      const currentState = peerStates.get(user.id);
      if (currentState?.state === 'request-sent' ||
          currentState?.state === 'request-received') {
        return;
      }

      // Check if already connected via WebRTC
      const webrtcPeer = peers.find(p => p.id === user.id);
      if (webrtcPeer && webrtcPeer.state === 'connected') {
        return;
      }

      // PREVENT LOOP: Only the user with LOWER ID sends the request
      // This ensures only ONE user initiates, avoiding duplicate requests
      if (clientId < user.id) {
        console.log('[Auto-Connect] Connecting to room user:', user.id);
        sentRequestsRef.current.add(user.id); // Mark as sent
        sendConnectionRequest(user.id);
      }
    });
  }, [roomState.code, roomState.users.length, clientId]); // REMOVED peers and peerStates to prevent re-triggering

  // Listen for connection-accepted to initiate WebRTC from requester side
  useEffect(() => {
    const handleConnectionAccepted = async () => {
      // Find newly connected peers and initiate WebRTC
      peerStates.forEach(async (state, peerId) => {
        if (state.state === 'connected') {
          const existingPeer = peers.find(p => p.id === peerId);
          if (!existingPeer || existingPeer.state !== 'connected') {
            // This is a newly accepted connection - don't initiate from here
            // The accepter will initiate. But we should update selection
            setSelectedPeer(peerId);
          }
        }
      });
    };
    
    handleConnectionAccepted();
  }, [peerStates, peers]);

  // Handle QR code scan
  const handleQRScan = useCallback((payload: { peerId: string; serverUrl: string; sessionToken: string; timestamp: number }) => {
    // Check if the QR code is from a different server
    if (payload.serverUrl !== SIGNALING_URL) {
      console.warn('QR code from different server:', payload.serverUrl);
    }
    
    // Send connection request to the scanned peer
    if (payload.peerId && payload.peerId !== clientId) {
      sendConnectionRequest(payload.peerId);
    }
  }, [clientId, sendConnectionRequest]);

  // Show errors as toast notifications
  useEffect(() => {
    if (error) {
      showToast(error, 'error');
    }
  }, [error, showToast]);

  // Toast when room is created/joined
  useEffect(() => {
    if (roomState.code && roomState.isCreator) {
      showToast(`Room ${roomState.code} created! Share the code.`, 'success');
    } else if (roomState.code && !roomState.isCreator) {
      showToast(`Joined room ${roomState.code}`, 'info');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState.code]);

  // Count connected peers
  const connectedPeersCount = peers.filter(p => p.state === 'connected').length;

  // Check if we can send files (have a connected peer)
  const canSendFile = selectedPeer && peers.some(p => p.id === selectedPeer && p.state === 'connected');

  // Prepare users for radar with their connection states
  const radarUsers = roomState.users.map(user => ({
    ...user,
    isConnected: peers.some(p => p.id === user.id && p.state === 'connected'),
  }));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="spinner w-8 h-8" />
          <p className="text-[#94A3B8] text-sm">Connecting to network...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      {/* Connection Request Modal */}
      <ConnectionRequestModal
        requests={incomingRequests}
        onAccept={handleAcceptRequest}
        onReject={rejectConnectionRequest}
      />

      {/* QR Code Modals */}
      <AnimatePresence>
        {showQRCode && (
          <QRCodeDisplay
            clientId={clientId}
            signalingUrl={SIGNALING_URL}
            onClose={() => setShowQRCode(false)}
          />
        )}
      </AnimatePresence>

      <QRScannerModal
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
      />

      {/* File Preview Modal */}
      <AnimatePresence>
        {showFilePreview && (
          <FilePreviewModal
            files={pendingFiles}
            peerCount={peers.filter(p => p.state === 'connected').length}
            onConfirm={handleConfirmSend}
            onCancel={() => {
              setShowFilePreview(false);
              setPendingFiles([]);
            }}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="max-w-6xl mx-auto mb-6 md:mb-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">
              <span className="gradient-text">Lynkless</span>
            </h1>
            <p className="text-[#64748B] text-xs md:text-sm mt-1">
              Your files don&apos;t belong in the cloud.
            </p>
          </motion.div>

          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Link
              href="/about"
              className="text-xs text-[#64748B] hover:text-[#22D3EE] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#1C2433]"
            >
              About
            </Link>
            <ConnectionStatus
              isSignalingConnected={isConnected}
              roomCode={roomState.code}
              connectedPeers={connectedPeersCount}
            />
          </motion.div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
          {/* Left column - Radar and Room Controls */}
          <div className="space-y-4 md:space-y-6">
            {/* Room Controls */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <RoomControls
                roomCode={roomState.code}
                isInRoom={!!roomState.code}
                isCreator={roomState.isCreator}
                onCreateRoom={createRoom}
                onJoinRoom={joinRoom}
                onLeaveRoom={leaveRoom}
                error={error}
              />
            </motion.div>

            {/* Radar Discovery - Refined panel */}
            <motion.div
              className="panel-elevated p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div 
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #22D3EE 0%, #6366F1 100%)' }}
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-[#E6EDF3]">Discovery Radar</h2>
                  <p className="text-xs text-[#64748B]">
                    {roomState.code 
                      ? `Room ${roomState.code} • ${roomState.users.length} peer${roomState.users.length !== 1 ? 's' : ''}`
                      : nearbyPeers.length > 0 
                        ? `${nearbyPeers.length} nearby peer${nearbyPeers.length !== 1 ? 's' : ''} detected`
                        : 'Scanning for nearby peers...'}
                  </p>
                </div>
                {/* QR Actions */}
                <div className="flex gap-2">
                  <motion.button
                    onClick={() => setShowQRCode(true)}
                    className="btn-icon"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    title="Show my QR code"
                  >
                    <svg className="w-4 h-4" style={{ color: '#22D3EE' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                  </motion.button>
                  <motion.button
                    onClick={() => setShowQRScanner(true)}
                    className="btn-icon"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    title="Scan QR code"
                  >
                    <svg className="w-4 h-4" style={{ color: '#6366F1' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </motion.button>
                </div>
              </div>

              <Radar
                users={radarUsers}
                nearbyPeers={nearbyPeers}
                peerStates={peerStates}
                onUserClick={handleUserClick}
                currentUserId={clientId}
                isInRoom={!!roomState.code}
              />

              {/* Selected peer indicator */}
              <AnimatePresence>
                {selectedPeer && (
                  <motion.div
                    className="mt-5 p-3 rounded-xl"
                    style={{ 
                      background: 'rgba(34, 211, 238, 0.08)',
                      border: '1px solid rgba(34, 211, 238, 0.15)'
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: canSendFile ? '#22C55E' : '#F59E0B' }}
                        />
                        <span className="text-sm flex items-center gap-1.5" style={{ color: '#22D3EE' }}>
                          <span className="text-base">{getEmojiForPeer(selectedPeer)}</span>
                          <span className="font-medium">{getPeerName(selectedPeer)}</span>
                        </span>
                        {/* Connection quality badge */}
                        <ConnectionStatusBadge
                          quality={canSendFile ? 'excellent' : 'disconnected'}
                          showDetails={true}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedPeer(null)}
                          className="text-[#64748B] hover:text-[#E6EDF3] text-xs transition-colors px-2 py-1"
                        >
                          Deselect
                        </button>
                        {canSendFile && (
                          <button
                            onClick={() => {
                              disconnectFromPeer(selectedPeer);
                              setSelectedPeer(null);
                            }}
                            className="text-[#EF4444] hover:text-[#F87171] text-xs transition-colors px-2 py-1"
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#64748B]">
                      {canSendFile ? 'Ready to transfer files and chat' : 'Waiting for connection...'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Connection Fingerprint Verification */}
              {selectedPeer && canSendFile && (
                <div className="mt-4">
                  <ConnectionFingerprint
                    fingerprint={getFingerprint(selectedPeer) || null}
                    peerId={selectedPeer}
                    isConnected={canSendFile}
                  />
                </div>
              )}

              {/* Nearby discovery notice (when not in room) */}
              {!roomState.code && nearbyPeers.length === 0 && (
                <div 
                  className="mt-5 p-3 rounded-xl"
                  style={{ background: 'var(--bg-hover)' }}
                >
                  <p className="text-[#64748B] text-sm text-center">
                    💡 Create or join a room to connect with remote peers, or wait for nearby peers to be detected automatically.
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          {/* Right column - File Transfer and Chat */}
          <div className="space-y-6">
            {/* Connected Peers Panel */}
            {connectedPeersCount > 0 && (
              <motion.div
                className="panel-elevated p-5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #22C55E 0%, #10B981 100%)' }}
                  >
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-[#E6EDF3]">Connected Devices</h2>
                    <p className="text-[10px] text-[#64748B]">
                      {connectedPeersCount} active connection{connectedPeersCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {peers.filter(p => p.state === 'connected').map((peer) => (
                    <motion.div
                      key={peer.id}
                      className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors"
                      style={{ 
                        background: selectedPeer === peer.id 
                          ? 'rgba(34, 211, 238, 0.1)' 
                          : 'var(--bg-hover)',
                        border: selectedPeer === peer.id
                          ? '1px solid rgba(34, 211, 238, 0.2)'
                          : '1px solid transparent'
                      }}
                      onClick={() => setSelectedPeer(peer.id)}
                      whileHover={{ 
                        background: 'rgba(34, 211, 238, 0.08)',
                      }}
                      layout
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{getEmojiForPeer(peer.id)}</span>
                        <div>
                          <p className="text-sm font-medium text-[#E6EDF3]">
                            {getPeerName(peer.id)}
                          </p>
                          <p className="text-[10px] text-[#64748B]">
                            {peer.isNearby ? '📡 Nearby' : '🌐 Remote'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ConnectionStatusBadge
                          quality="excellent"
                          showDetails={true}
                        />
                        {selectedPeer === peer.id && (
                          <span className="text-[10px] text-[#22D3EE] font-medium">Active</span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
            {/* File Drop Zone - Refined panel */}
            <motion.div
              className="panel-elevated p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div 
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)' }}
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-[#E6EDF3]">Send Files</h2>
              </div>

              <FileDropZone
                onFileDrop={handleFileDrop}
                disabled={!canSendFile}
              />

              {/* Transfer Progress */}
              <AnimatePresence>
                {transfers.length > 0 && (
                  <motion.div
                    className="mt-5 space-y-3"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {transfers.map((transfer) => (
                      <TransferProgress
                        key={transfer.fileId}
                        transfer={transfer}
                        onCancel={cancelTransfer}
                        onPause={pauseTransfer}
                        onResume={resumeTransfer}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Chat Panel */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <ChatPanel
                messages={messages}
                onSendMessage={sendMessage}
                disabled={connectedPeersCount === 0}
                connectedPeers={peers.filter(p => p.state === 'connected').map(p => ({ id: p.id }))}
              />
            </motion.div>
          </div>
        </div>

        {/* Privacy Notice - Refined */}
        <motion.div
          className="mt-10 p-4 rounded-xl text-center"
          style={{ 
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)'
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center justify-center gap-2 text-sm">
            <svg className="w-4 h-4" style={{ color: '#22C55E' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-[#94A3B8]">
              <strong style={{ color: '#22C55E' }}>Zero-storage architecture</strong> — Files transfer directly via WebRTC encryption
            </span>
          </div>
        </motion.div>
      </div>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

      {/* Onboarding Tutorial */}
      <Onboarding />
    </main>
  );
}

