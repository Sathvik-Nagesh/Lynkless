'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import ConnectedPeersPanel from '@/components/ConnectedPeersPanel';
import TransferHistoryPanel from '@/components/TransferHistoryPanel';
import ScreenSharePanel from '@/components/ScreenSharePanel';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useSignalingAutoConnect } from '@/hooks/useSignalingAutoConnect';
import { useAutoJoinRoom } from '@/hooks/useAutoJoinRoom';
import { useTransferProtection } from '@/hooks/useTransferProtection';
import { useAutoConnectRoomPeers } from '@/hooks/useAutoConnectRoomPeers';
import { getPeerName, getEmojiForPeer } from '@/lib/utils/nameGenerator';
import { getSounds } from '@/lib/utils/sounds';
import { useToast } from '@/components/ToastProvider';
import { E2EEHelper } from '@/lib/webrtc/e2ee';
import DecryptionTool from '@/components/DecryptionTool';
import { SoundToggle } from '@/components/SoundToggle';
import { ConnectionQualityDashboard } from '@/components/ConnectionQualityDashboard';
import { TextSnippetShare } from '@/components/TextSnippetShare';
import { getFileInfo } from '@/lib/utils/fileTypeIcons';
import { getTrustedPeersManager } from '@/lib/utils/trustedPeers';
import Link from 'next/link';
import { createZipFromFiles } from '@/lib/utils/zipper';
import { processEntry } from '@/lib/utils/fileUpload';
import { MAX_FILE_SIZE } from '@/lib/webrtc/fileTransfer';
import { ServerWakeupGame } from '@/components/ServerWakeupGame';
import { compressImage } from '@/lib/utils/imageCompression';

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'ws://localhost:8080';
const ENABLE_CALLS = process.env.NEXT_PUBLIC_ENABLE_CALLS !== 'false';

import { checkSharedFiles } from '@/lib/pwa/shareTarget';

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [activeView, setActiveView] = useState<'files' | 'screen'>('files');
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const dragCounter = useRef(0);
  const sounds = useRef(getSounds());
  const { showToast } = useToast();
  
  // 120% Upgrade: Handle PWA Share Target Intent
  useEffect(() => {
    const handleSharedIntent = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('shared')) {
        const sharedFiles = await checkSharedFiles();
        if (sharedFiles.length > 0) {
          setPendingFiles(sharedFiles);
          setShowFilePreview(true);
          showToast(`Prepared ${sharedFiles.length} shared files`, 'info');
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }
      }
    };
    handleSharedIntent();
  }, [showToast]);

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
    connectToPeer,
    sendFile,
    broadcastFile,
    sendMessage,
    cancelTransfer,
    pauseTransfer,
    resumeTransfer,
    disconnectFromPeer,
    getFingerprint,
    localStream,
    remoteStreams,
    startScreenShare,
    stopScreenShare,
    startCall,
    endCall,
    callStream,
  } = useWebRTC(clientId);

  useSignalingAutoConnect({
    connect,
    onLoaded: () => setIsLoading(false),
  });

  useAutoJoinRoom({
    isConnected,
    isLoading,
    roomCode: roomState.code,
    joinRoom: (code) => joinRoom(code),
  });

  const activeTransfersCount = useMemo(() =>
    transfers.filter(t => t.status === 'transferring' || t.status === 'paused').length,
    [transfers]);

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsFocusMode(activeTransfersCount > 0);
    });
  }, [activeTransfersCount]);

  useTransferProtection(activeTransfersCount);


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

    // Send connection request
    sendConnectionRequest(userId);
  }, [peerStates, sendConnectionRequest]);

  // Auto-close QR code when incoming connection request arrives
  useEffect(() => {
    if (incomingRequests.length > 0) {
      sounds.current.playRequestReceived();
      if (showQRCode) {
        setTimeout(() => setShowQRCode(false), 0);
      }
    }
  }, [incomingRequests.length, showQRCode]);

  // Handle connection acceptance - auto-accept in-room peers, show modal for direct peers
  const handleAcceptRequest = useCallback(async (fromId: string) => {
    acceptConnectionRequest(fromId);
    const incomingReq = incomingRequests.find(r => r.fromId === fromId);
    const user = roomState.users.find(u => u.id === fromId);
    const nearbyPeer = nearbyPeers.find(p => p.id === fromId);
    const isNearby = incomingReq?.isNearby || user?.isNearby || nearbyPeer?.isNearby || false;
    await connectToPeer(fromId, isNearby);
    setSelectedPeer(fromId);
  }, [acceptConnectionRequest, roomState.users, nearbyPeers, incomingRequests, connectToPeer]);

  // Auto-accept incoming connection requests from room members
  const autoAcceptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!roomState.code) {
      autoAcceptedRef.current.clear();
      return;
    }
    // LEAK-13 FIX: Clean up auto-accepted peers that are no longer in the room
    const currentRoomUserIds = new Set(roomState.users.map(u => u.id));
    for (const acceptedId of Array.from(autoAcceptedRef.current)) {
      if (!currentRoomUserIds.has(acceptedId)) {
        autoAcceptedRef.current.delete(acceptedId);
      }
    }

    incomingRequests.forEach(req => {
      if (autoAcceptedRef.current.has(req.fromId)) return;
      const isRoomMember = roomState.users.some(u => u.id === req.fromId);
      if (isRoomMember) {
        autoAcceptedRef.current.add(req.fromId);
        console.log('[Auto-Accept] Accepting room member:', req.fromId);
        handleAcceptRequest(req.fromId);
      }
    });
  }, [incomingRequests, roomState.code, roomState.users, handleAcceptRequest]);

  // Watch for actual WebRTC connection state changes to show toasts
  const prevPeersRef = useRef<typeof peers>([]);
  useEffect(() => {
    const prevPeers = prevPeersRef.current;

    for (const peer of peers) {
      const prev = prevPeers.find(p => p.id === peer.id);

      // Peer just became connected (was not connected before)
      if (peer.state === 'connected' && (!prev || prev.state !== 'connected')) {
        sounds.current.playConnected();
        showToast(`Connected to ${getPeerName(peer.id)}`, 'success');
      }

      // Peer connection failed
      if (peer.state === 'failed' && (!prev || prev.state !== 'failed')) {
        sounds.current.playError();
        showToast(`Connection to ${getPeerName(peer.id)} failed`, 'error');
      }
    }

    prevPeersRef.current = [...peers];
  }, [peers, showToast]);

  // Handle file drop - show preview modal
  const handleFileDrop = useCallback((files: File[]) => {
    const connectedPeers = peers.filter(p => p.state === 'connected');

    if (connectedPeers.length === 0) {
      console.warn('[File Drop] No connected peers. Queueing files.');
      setPendingFiles(files);
      showToast('Files queued! Select a peer on the radar to send them.', 'info');
      return;
    }

    setPendingFiles(files);
    setShowFilePreview(true);
  }, [peers, showToast]);

  // Handle queued files when a peer connects eventually
  useEffect(() => {
    const connectedPeers = peers.filter(p => p.state === 'connected');
    if (pendingFiles.length > 0 && connectedPeers.length > 0 && !showFilePreview) {
      requestAnimationFrame(() => {
        setShowFilePreview(true);
      });
    }
  }, [pendingFiles, peers, showFilePreview]);

  // Invulnerability Patch: Service Worker Keep-Alive Loop
  useEffect(() => {
    if (activeTransfersCount === 0 || !('serviceWorker' in navigator)) return;

    const interval = setInterval(() => {
      navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({ type: 'KEEPALIVE_PING' });
      });
    }, 15000); // Ping every 15s during transfers

    return () => clearInterval(interval);
  }, [activeTransfersCount]);

  // Removed redundant manual IndexedDB Share Target effect. 
  // Intent is properly handled by the checkSharedFiles() useEffect block at the top of this component.

  // Confirm and send files
  const handleConfirmSend = useCallback(async (password?: string, shouldZip?: boolean, compressImagesFlag?: boolean) => {
    setShowFilePreview(false);

    // Clear pending files immediately so useEffect doesn't reopen modal
    const finalFilesToProcess = [...pendingFiles];
    setPendingFiles([]);

    const connectedPeers = peers.filter(p => p.state === 'connected');

    if (connectedPeers.length === 0) {
      showToast('No peers connected. Connect to someone first!', 'error');
      setPendingFiles(finalFilesToProcess); // Restore pending files
      return;
    }

    sounds.current.playTransferStart();

    try {
      let finalFiles = finalFilesToProcess;

      if (compressImagesFlag && finalFiles.some(f => f.type.startsWith('image/'))) {
        showToast('Compressing images...', 'info');
        finalFiles = await Promise.all(
          finalFiles.map(async (file) => {
            if (file.type.startsWith('image/')) {
              return await compressImage(file, 0.75); // 75% quality sweet spot
            }
            return file;
          })
        );
      }

      if (shouldZip && finalFiles.length > 1) {
        // 100% Fail-Safe: Prevent Out Of Memory (OOM) crash if user tries to ZIP massive files
        const totalSize = finalFiles.reduce((acc, f) => acc + f.size, 0);
        if (totalSize > 500 * 1024 * 1024) { // 500MB Safety Limit
          showToast('Total size exceeds 500MB. Sending files individually to prevent browser crash.', 'warning');
        } else {
          showToast('Zipping files...', 'info');
          try {
            const zippedFile = await createZipFromFiles(finalFiles, `Lynkless_Bundle_${Date.now()}.zip`);
            finalFiles = [zippedFile];
          } catch (e) {
            console.error('Zipping failed', e);
            showToast('Zipping failed, sending individually', 'error');
          }
        }
      }

      const filesToSend = password
        ? await Promise.all(finalFiles.map(f => E2EEHelper.encryptFile(f, password)))
        : finalFiles;

      if (connectedPeers.length > 1) {
        // Send to all via Mesh broadcast
        const peerIds = connectedPeers.map(p => p.id);
        for (const file of filesToSend) {
          await broadcastFile(file, peerIds);
        }
      } else {
        // Single peer sending
        for (const file of filesToSend) {
          for (const peer of connectedPeers) {
            await sendFile(file, peer.id);
          }
        }
      }

      console.log(`[File Drop] Sent ${finalFilesToProcess.length} file(s) to ${connectedPeers.length} peer(s)`);
      sounds.current.playTransferComplete();
      showToast(`Sent ${finalFilesToProcess.length} file(s) to ${connectedPeers.length} peer(s)`, 'success');
    } catch (err) {
      console.error('Failed to send files:', err);
      sounds.current.playError();
      showToast('Failed to send files. Please try again.', 'error');
    }
  }, [pendingFiles, peers, sendFile, broadcastFile, showToast]);

  useAutoConnectRoomPeers({
    roomCode: roomState.code,
    roomUsers: roomState.users,
    clientId,
    peerStates,
    peers,
    sendConnectionRequest,
  });

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
  }, [roomState.code, roomState.isCreator, showToast]);

  const notifiedTransfersRef = useRef<Set<string>>(new Set());

  // Listen for incoming transfers to notify about encrypted files and trigger Haptics
  useEffect(() => {
    // LEAK-12 FIX: Clean up notified transfers that are no longer in the active transfers list
    const currentTransferIds = new Set(transfers.map(t => t.fileId));
    for (const notifiedId of Array.from(notifiedTransfersRef.current)) {
      const baseId = notifiedId.replace('-failed', '');
      if (!currentTransferIds.has(baseId)) {
        notifiedTransfersRef.current.delete(notifiedId);
      }
    }

    transfers.forEach(transfer => {
      if (transfer.status === 'completed' && transfer.type === 'incoming') {
        if (!notifiedTransfersRef.current.has(transfer.fileId)) {
          notifiedTransfersRef.current.add(transfer.fileId);

          // Trigger Wow-Factor Haptics! (Thump-Thump)
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 200]);
          }

          const isEncrypted = transfer.fileName.endsWith('.encrypted');
          if (isEncrypted) {
            showToast(`Note: Received encrypted file "${transfer.fileName}". Use the Decryption Tool below to open it.`, 'success');
          }
        }
      } else if (transfer.status === 'failed') {
        if (!notifiedTransfersRef.current.has(transfer.fileId + '-failed')) {
          notifiedTransfersRef.current.add(transfer.fileId + '-failed');
          sounds.current.playError();
          showToast(`Transfer failed for "${transfer.fileName}". They might be out of storage or disconnected.`, 'error');
        }
      }
    });
  }, [transfers, showToast]);

  // Memoize connected peers to stabilize downstream calculations
  const connectedPeers = useMemo(() =>
    peers.filter(p => p.state === 'connected'),
    [peers]);

  // Count connected peers
  const connectedPeersCount = connectedPeers.length;

  // Check if we can send files (have a connected peer)
  const canSendFile = useMemo(() =>
    !!selectedPeer && connectedPeers.some(p => p.id === selectedPeer),
    [selectedPeer, connectedPeers]);

  // Prepare users for radar with their connection states - Memoized to prevent Radar re-renders
  const radarUsers = useMemo(() => roomState.users.map(user => ({
    ...user,
    isConnected: connectedPeers.some(p => p.id === user.id),
  })), [roomState.users, connectedPeers]);

  // Memoize peers for ChatPanel to prevent unnecessary re-renders
  const chatPeers = useMemo(() =>
    connectedPeers.map(p => ({ id: p.id })),
    [connectedPeers]);

  // Active transfer peers for Radar Particle Animation
  const activeTransferPeerIds = useMemo(() => {
    const active = transfers.filter(t => t.status === 'transferring');
    return Array.from(new Set(active.map(t => t.peerId)));
  }, [transfers]);

  return (
    <main
      className="min-h-screen p-4 md:p-10 relative overflow-hidden"
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current++;
        if (e.dataTransfer.types.includes('Files')) {
          setIsGlobalDragging(true);
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) {
          setIsGlobalDragging(false);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault(); // necessary to allow drop
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsGlobalDragging(false);

        if (connectedPeers.length === 0 && !roomState.code && nearbyPeers.length === 0) {
          // If completely empty, we can still queue, but no error to throw now.
        }

        let files: File[] = [];
        if (e.dataTransfer.items) {
          const items = Array.from(e.dataTransfer.items);
          for (const item of items) {
            if (item.kind === 'file') {
              const entry = item.webkitGetAsEntry();
              if (entry) {
                const entryFiles = await processEntry(entry);
                files = files.concat(entryFiles);
              }
            }
          }
        } else {
          files = Array.from(e.dataTransfer.files);
        }

        const validFiles: File[] = [];
        for (const file of files) {
          if (file.size <= MAX_FILE_SIZE) {
            validFiles.push(file);
          }
        }

        if (validFiles.length < files.length) {
          showToast(`Some files were skipped because they exceed the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`, 'error');
        }

        if (connectedPeers.length > 0) {
          handleFileDrop(validFiles);
        } else {
          setPendingFiles(validFiles);
          showToast('Files queued! Select a peer on the radar to send them.', 'info');
        }
      }}
    >
      {/* Global Drag Overlay */}
      <AnimatePresence>
        {isGlobalDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#111]/80 backdrop-blur-md border-4 border-[#ededed] border-dashed m-4 rounded-3xl"
            style={{ pointerEvents: 'none' }}
          >
            <div className="flex flex-col items-center gap-6 p-10 bg-[#1f1f1f]/90 rounded-3xl shadow-2xl">
              <div className="w-24 h-24 rounded-full bg-[#111] flex items-center justify-center animate-bounce border border-[#27272a]">
                <span className="text-5xl">📁</span>
              </div>
              <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Drop files anywhere to send!</h2>
                <p className="text-[#a1a1aa] text-lg">
                  {canSendFile
                    ? `Sending to connected peers`
                    : 'Select a peer from the Radar first'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection Request Modal - only show for non-room peers */}
      <ConnectionRequestModal
        requests={incomingRequests.filter(req => !roomState.users.some(u => u.id === req.fromId))}
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
            peerCount={connectedPeersCount}
            peerNames={connectedPeers.map(p => getPeerName(p.id))}
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
            className="flex items-center gap-4"
          >
            {/* Animated Mesh SVG */}
            <motion.div
              className="w-12 h-12 md:w-16 md:h-16 hidden sm:flex items-center justify-center bg-blue-500/10 rounded-2xl border border-blue-500/20 flex-shrink-0 relative overflow-hidden"
            >
              <motion.svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 absolute"
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M18.364 5.636l-2.121 2.121" />
                <path d="M5.636 18.364l2.121-2.121" />
                <path d="M5.636 5.636l2.121 2.121" />
                <path d="M18.364 18.364l-2.121-2.121" />
                <circle cx="5" cy="5" r="2" />
                <circle cx="19" cy="19" r="2" />
                <circle cx="5" cy="19" r="2" />
                <circle cx="19" cy="5" r="2" />
              </motion.svg>
              {/* Pulse effect overlay */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-tr from-blue-500/0 via-blue-400/20 to-indigo-500/0 mix-blend-overlay"
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="text-4xl md:text-6xl font-black mb-2 italic py-4 pr-12 leading-normal">
                <span className="text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">LYNK</span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 pr-2">LESS</span>
              </h1>
              <p className="text-[#a1a1aa] text-sm md:text-base font-medium flex items-center gap-2">
                Pure P2P Sharing. <span className="text-white">No Cloud.</span>
                <span className="px-2 py-0.5 rounded flex items-center text-[10px] uppercase font-black text-blue-400 bg-blue-500/10 border border-blue-500/20">
                  v2.2 Ultra
                </span>
              </p>
            </motion.div>
          </motion.div>

          {/* New Feature Highlights Bar */}
          <motion.div
            className="hidden xl:flex items-center gap-6 px-6 border-l border-[#27272a] ml-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex flex-col">
              <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-bold">Max Limit</span>
              <span className="text-sm font-black text-white">20GB+</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-bold">Engine</span>
              <span className="text-sm font-black text-white">P2P Turbo</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-bold">Security</span>
              <span className="text-sm font-black text-white">E2EE Ready</span>
            </div>
          </motion.div>

          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <SoundToggle />
            <Link
              href="/about"
              className="text-xs text-[#a1a1aa] hover:text-[#ededed] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#1f1f1f]"
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Main Content Area - Strategic Spacing */}
        <div className={`grid grid-cols-1 gap-10 lg:gap-12 transition-all duration-700 ease-in-out ${
          isFocusMode ? 'lg:grid-cols-[400px_1fr]' : 'lg:grid-cols-[1.1fr_1fr]'
        }`}>
          {/* Dashboard Left: Controls and Discovery */}
          <div className={`space-y-8 transition-all duration-500 ${isFocusMode ? 'opacity-90' : 'opacity-100'}`}>
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

              {/* Server Wakeup Game / Loading state */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <ServerWakeupGame />
                </motion.div>
              )}

              {/* Tabs for switching Views */}
              <motion.div
                className="flex gap-1 p-1 bg-[#111] rounded-xl border border-[#27272a]"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
              >
                <button
                  onClick={() => setActiveView('files')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${activeView === 'files'
                      ? 'bg-[#27272a] text-white shadow-sm'
                      : 'text-[#a1a1aa] hover:text-[#ededed] hover:bg-[#1f1f1f]'
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                  </svg>
                  Files & Radar
                </button>
                <button
                  onClick={() => setActiveView('screen')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${activeView === 'screen'
                      ? 'bg-[#27272a] text-white shadow-sm'
                      : 'text-[#a1a1aa] hover:text-[#ededed] hover:bg-[#1f1f1f]'
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Screen Share
                  {remoteStreams.size > 0 && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-1" />
                  )}
                </button>
              </motion.div>

              {/* Radar Discovery - Refined panel */}
              <AnimatePresence mode="wait">
                {activeView === 'files' ? (
                  <motion.div
                    key="files-view"
                    className="space-y-4 md:space-y-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="panel-elevated p-4 sm:p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center border border-[#27272a] shadow-sm bg-[#111]"
                        >
                          <svg className="w-4 h-4 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h2 className="text-base font-semibold text-[#ededed]">Discovery Radar</h2>
                          <p className="text-xs text-[#a1a1aa]">
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
                            className="btn-icon text-[#ededed]"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            title="Show my QR code"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                          </motion.button>
                          <motion.button
                            onClick={() => setShowQRScanner(true)}
                            className="btn-icon text-[#ededed]"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            title="Scan QR code"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                        activeTransferPeerIds={activeTransferPeerIds}
                      />

                      {/* Selected peer indicator */}
                      <AnimatePresence>
                        {selectedPeer && (
                          <motion.div
                            className="mt-5 p-3 rounded-xl"
                            style={{
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border-default)'
                            }}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: canSendFile ? 'var(--state-success)' : 'var(--state-warning)' }}
                                />
                                <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                                  <span className="text-base">{getEmojiForPeer(selectedPeer)}</span>
                                  <span className="font-medium">{getPeerName(selectedPeer)}</span>
                                </span>
                                {/* Connection quality badge */}
                                <ConnectionStatusBadge
                                  quality={canSendFile ? 'excellent' : 'disconnected'}
                                  showDetails={true}
                                  isRelay={peers.find(p => p.id === selectedPeer)?.isRelay}
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setSelectedPeer(null)}
                                  className="text-[#71717a] hover:text-[#ededed] text-xs transition-colors px-2 py-1"
                                >
                                  Deselect
                                </button>
                                {canSendFile && (
                                  <button
                                    onClick={() => {
                                      disconnectFromPeer(selectedPeer);
                                      setSelectedPeer(null);
                                    }}
                                    className="text-[#ef4444] hover:text-[#f87171] text-xs transition-colors px-2 py-1"
                                  >
                                    Disconnect
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] text-[#71717a]">
                              {canSendFile ? 'Ready to transfer files and chat' : 'Waiting for connection...'}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Connection Fingerprint Verification */}
                      {selectedPeer && canSendFile && (
                        <div className="mt-4 space-y-3">
                          <ConnectionFingerprint
                            fingerprint={getFingerprint(selectedPeer) || null}
                            peerId={selectedPeer}
                            isConnected={canSendFile}
                          />
                          <ConnectionQualityDashboard
                            peerId={selectedPeer}
                          />

                        </div>
                      )}

                      {/* Nearby discovery notice (when not in room) */}
                      {!roomState.code && nearbyPeers.length === 0 && (
                        <div
                          className="mt-5 p-3 rounded-xl"
                          style={{ background: 'var(--bg-hover)' }}
                        >
                          <p className="text-[#a1a1aa] text-sm text-center">
                            💡 Create or join a room to connect with remote peers, or wait for nearby peers to be detected automatically.
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="screen-view"
                    className="space-y-4 md:space-y-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ScreenSharePanel
                      localStream={localStream}
                      remoteStreams={remoteStreams}
                      onStartShare={startScreenShare}
                      onStopShare={stopScreenShare}
                      peerCount={connectedPeersCount}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

                {/* Right column - File Transfer and Chat */}
                <div className={`space-y-8 transition-all duration-700 ${isFocusMode ? 'lg:pl-6' : ''}`}>
                  <ConnectedPeersPanel
                    connectedPeers={connectedPeers}
                    selectedPeer={selectedPeer}
                    onSelectPeer={setSelectedPeer}
                  />
                  {/* File Drop Zone - Refined panel */}
                  <motion.div
                    className="panel-elevated p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="flex items-center gap-3 mb-5">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center border border-[#27272a] shadow-sm bg-[#111]"
                      >
                        <svg className="w-4 h-4 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <h2 className="text-base font-semibold text-[#ededed]">Send Files</h2>
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
                      connectedPeers={chatPeers}
                    />
                  </motion.div>

                  {/* Text/Code Snippet Share */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                  >
                    <TextSnippetShare
                      onSendText={sendMessage}
                      disabled={connectedPeersCount === 0}
                    />
                  </motion.div>

                  {/* Transfer History Panel */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <TransferHistoryPanel />
                  </motion.div>

                  {/* Decryption Tool */}
                  {!isFocusMode && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                    >
                      <DecryptionTool />
                    </motion.div>
                  )}
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

        {/* Footer / Safe Area Padding */}
        <div className="h-[env(safe-area-inset-bottom,24px)]" />

        {/* PWA Install Prompt */}
        <PWAInstallPrompt />

        {/* Onboarding Tutorial */}
        <Onboarding />
    </main>
  );
}

