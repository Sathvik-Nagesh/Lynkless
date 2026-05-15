'use client';
/**
 * LynklessContext — Central state provider for the entire app.
 *
 * This lifts ALL WebRTC + Signaling + UI state out of page.tsx into a single
 * context, so the page component becomes a pure renderer with zero logic.
 *
 * Design goals:
 *  - page.tsx calls useApp() and just renders what it receives
 *  - All useEffect / useCallback logic lives here
 *  - React.memo on child components now actually works (stable refs)
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useSignalingAutoConnect } from '@/hooks/useSignalingAutoConnect';
import { useAutoJoinRoom } from '@/hooks/useAutoJoinRoom';
import { useTransferProtection } from '@/hooks/useTransferProtection';
import { useAutoConnectRoomPeers } from '@/hooks/useAutoConnectRoomPeers';
import { getPeerName } from '@/lib/utils/nameGenerator';
import { getSounds } from '@/lib/utils/sounds';
import { useToast } from '@/components/ToastProvider';
import { E2EEHelper } from '@/lib/webrtc/e2ee';
import { createZipFromFiles } from '@/lib/utils/zipper';
import { compressImage } from '@/lib/utils/imageCompression';

// ─────────────────────────────────── Types ─────────────────────────────────────

type ActiveView = 'files' | 'screen';

export interface PendingTransferConfirm {
  fileCount: number;
  totalSize: string;
  peerId: string;
}

export interface AppContextValue {
  // ── Connection State ──
  clientId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  isLocalMode: boolean;   // true when connected to LAN server, not cloud
  error: string | null;

  // ── Room ──
  roomState: ReturnType<typeof useSignaling>['roomState'];
  nearbyPeers: ReturnType<typeof useSignaling>['nearbyPeers'];
  incomingRequests: ReturnType<typeof useSignaling>['incomingRequests'];
  peerStates: ReturnType<typeof useSignaling>['peerStates'];
  createRoom: ReturnType<typeof useSignaling>['createRoom'];
  joinRoom: ReturnType<typeof useSignaling>['joinRoom'];
  leaveRoom: ReturnType<typeof useSignaling>['leaveRoom'];
  sendConnectionRequest: ReturnType<typeof useSignaling>['sendConnectionRequest'];
  rejectConnectionRequest: ReturnType<typeof useSignaling>['rejectConnectionRequest'];

  // ── WebRTC ──
  peers: ReturnType<typeof useWebRTC>['peers'];
  transfers: ReturnType<typeof useWebRTC>['transfers'];
  messages: ReturnType<typeof useWebRTC>['messages'];
  localStream: ReturnType<typeof useWebRTC>['localStream'];
  remoteStreams: ReturnType<typeof useWebRTC>['remoteStreams'];
  connectedPeers: ReturnType<typeof useWebRTC>['peers'];
  connectedPeersCount: number;
  sendFile: ReturnType<typeof useWebRTC>['sendFile'];
  broadcastFile: ReturnType<typeof useWebRTC>['broadcastFile'];
  sendMessage: ReturnType<typeof useWebRTC>['sendMessage'];
  cancelTransfer: ReturnType<typeof useWebRTC>['cancelTransfer'];
  pauseTransfer: ReturnType<typeof useWebRTC>['pauseTransfer'];
  resumeTransfer: ReturnType<typeof useWebRTC>['resumeTransfer'];
  disconnectFromPeer: ReturnType<typeof useWebRTC>['disconnectFromPeer'];
  getFingerprint: ReturnType<typeof useWebRTC>['getFingerprint'];
  startScreenShare: ReturnType<typeof useWebRTC>['startScreenShare'];
  stopScreenShare: ReturnType<typeof useWebRTC>['stopScreenShare'];

  // ── UI State ──
  selectedPeer: string | null;
  setSelectedPeer: (id: string | null) => void;
  canSendFile: boolean;
  activeView: ActiveView;
  setActiveView: (v: ActiveView) => void;
  showQRCode: boolean;
  setShowQRCode: (v: boolean) => void;
  showQRScanner: boolean;
  setShowQRScanner: (v: boolean) => void;
  isGlobalDragging: boolean;
  showFilePreview: boolean;
  setShowFilePreview: (v: boolean) => void;
  pendingFiles: File[];
  showTransferConfirm: boolean;
  pendingTransferConfirm: PendingTransferConfirm | null;

  // ── Derived ──
  radarUsers: Array<{ id: string; isNearby: boolean; isConnected: boolean }>;
  chatPeers: Array<{ id: string }>;

  // ── Handlers ──
  handleUserClick: (userId: string) => Promise<void>;
  handleFileDrop: (files: File[]) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleAcceptRequest: (fromId: string) => Promise<void>;
  handleTransferConfirm: () => void;
  handleConfirmSend: (password?: string, shouldZip?: boolean, compressImages?: boolean) => Promise<void>;
  handleQRScan: (payload: { peerId: string; serverUrl: string; sessionToken: string; timestamp: number }) => void;
}

// ─────────────────────────────────── Context ───────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

// ─────────────────────────────────── Provider ──────────────────────────────────

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'ws://localhost:8080';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  // ── Core state ──
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('files');
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [pendingTransferConfirm, setPendingTransferConfirm] = useState<PendingTransferConfirm | null>(null);

  const dragCounter = useRef(0);
  const sounds = useRef(getSounds());
  const { showToast } = useToast();

  // ── Signaling ──
  const {
    clientId, isConnected, roomState, nearbyPeers,
    incomingRequests, peerStates, error, connect,
    createRoom, joinRoom, leaveRoom,
    sendConnectionRequest, acceptConnectionRequest, rejectConnectionRequest,
  } = useSignaling();

  // ── WebRTC ──
  const {
    peers, transfers, messages,
    connectToPeer, sendFile, broadcastFile, sendMessage,
    cancelTransfer, pauseTransfer, resumeTransfer,
    disconnectFromPeer, getFingerprint,
    localStream, remoteStreams,
    startScreenShare, stopScreenShare,
    startCall, endCall, callStream,
  } = useWebRTC(clientId);

  // ── Local LAN Fallback Discovery ──
  // When the remote cloud server is unreachable, automatically try the local
  // signaling server at localhost:8080 — this works even without internet.
  useSignalingAutoConnect({
    connect,
    onLoaded: () => setIsLoading(false),
  });

  // Bolt: Use memoized derived value instead of useEffect + useState to avoid cascading renders
  const isLocalMode = useMemo(() => {
    if (!isConnected) return false;
    // Detect if we're on LAN: check if the WebSocket URL resolved to localhost or a private IP
    const url = SIGNALING_URL;
    return /localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(url);
  }, [isConnected]);

  useAutoJoinRoom({
    isConnected,
    isLoading,
    roomCode: roomState.code,
    joinRoom: (code) => joinRoom(code),
  });

  const activeTransfersCount = useMemo(
    () => transfers.filter(t => t.status === 'transferring').length,
    [transfers],
  );
  useTransferProtection(activeTransfersCount);

  useAutoConnectRoomPeers({
    roomCode: roomState.code,
    roomUsers: roomState.users,
    clientId,
    peerStates,
    peers,
    sendConnectionRequest,
  });

  // ── Derived ──
  const connectedPeers = useMemo(
    () => peers.filter(p => p.state === 'connected'),
    [peers],
  );
  const connectedPeersCount = connectedPeers.length;

  const canSendFile = useMemo(
    () => !!selectedPeer && connectedPeers.some(p => p.id === selectedPeer),
    [selectedPeer, connectedPeers],
  );

  const radarUsers = useMemo(
    () => roomState.users.map(user => ({
      ...user,
      isConnected: connectedPeers.some(p => p.id === user.id),
    })),
    [roomState.users, connectedPeers],
  );

  const chatPeers = useMemo(
    () => connectedPeers.map(p => ({ id: p.id })),
    [connectedPeers],
  );

  // ── Effects ──
  useEffect(() => {
    if (incomingRequests.length > 0) {
      sounds.current.playRequestReceived();
      if (showQRCode) setTimeout(() => setShowQRCode(false), 0);
    }
  }, [incomingRequests.length, showQRCode]);

  const prevPeersRef = useRef<typeof peers>([]);
  useEffect(() => {
    const prev = prevPeersRef.current;
    for (const peer of peers) {
      const old = prev.find(p => p.id === peer.id);
      if (peer.state === 'connected' && (!old || old.state !== 'connected')) {
        sounds.current.playConnected();
        showToast(`Connected to ${getPeerName(peer.id)}`, 'success');
      }
      if (peer.state === 'failed' && (!old || old.state !== 'failed')) {
        sounds.current.playError();
        showToast(`Connection to ${getPeerName(peer.id)} failed`, 'error');
      }
    }
    prevPeersRef.current = [...peers];
  }, [peers, showToast]);

  useEffect(() => {
    if (error) showToast(error, 'error');
  }, [error, showToast]);

  useEffect(() => {
    if (roomState.code && roomState.isCreator) {
      showToast(`Room ${roomState.code} created! Share the code.`, 'success');
    } else if (roomState.code && !roomState.isCreator) {
      showToast(`Joined room ${roomState.code}`, 'info');
    }
  }, [roomState.code, roomState.isCreator, showToast]);

  useEffect(() => {
    transfers.forEach(transfer => {
      if (transfer.status === 'completed' && transfer.type === 'incoming') {
        if (transfer.fileName.endsWith('.encrypted')) {
          showToast(`Received encrypted file "${transfer.fileName}". Use the Decryption Tool to open it.`, 'success');
        }
      }
    });
  }, [transfers, showToast]);

  // Auto-accept room members
  const handleAcceptRequest = useCallback(async (fromId: string) => {
    acceptConnectionRequest(fromId);
    const incomingReq = incomingRequests.find(r => r.fromId === fromId);
    const user = roomState.users.find(u => u.id === fromId);
    const nearbyPeer = nearbyPeers.find(p => p.id === fromId);
    const isNearby = incomingReq?.isNearby || user?.isNearby || nearbyPeer?.isNearby || false;
    await connectToPeer(fromId, isNearby);
    setSelectedPeer(fromId);
  }, [acceptConnectionRequest, roomState.users, nearbyPeers, incomingRequests, connectToPeer]);

  useEffect(() => {
    if (!roomState.code) return;
    incomingRequests.forEach(req => {
      const isRoomMember = roomState.users.some(u => u.id === req.fromId);
      if (isRoomMember) handleAcceptRequest(req.fromId);
    });
  }, [incomingRequests, roomState.code, roomState.users, handleAcceptRequest]);

  useEffect(() => {
    peerStates.forEach((state, peerId) => {
      if (state.state === 'connected') {
        const existing = peers.find(p => p.id === peerId);
        if (!existing || existing.state !== 'connected') {
          setSelectedPeer(peerId);
        }
      }
    });
  }, [peerStates, peers]);

  // ── Handlers ──
  const handleUserClick = useCallback(async (userId: string) => {
    const state = peerStates.get(userId);
    if (state?.state === 'connected') { setSelectedPeer(userId); return; }
    if (state?.state === 'request-sent' || state?.state === 'request-received') return;
    sendConnectionRequest(userId);
  }, [peerStates, sendConnectionRequest]);

  const handleFileDrop = useCallback((files: File[]) => {
    const connected = peers.filter(p => p.state === 'connected');
    if (connected.length === 0) return;
    setPendingFiles(files);
    if (connected.length === 1) {
      const totalSize = files.reduce((s, f) => s + f.size, 0);
      setPendingTransferConfirm({ fileCount: files.length, totalSize: formatBytes(totalSize), peerId: connected[0].id });
      setShowTransferConfirm(true);
    } else {
      setShowFilePreview(true);
    }
  }, [peers]);

  const handleTransferConfirm = useCallback(() => {
    setShowTransferConfirm(false);
    if (pendingTransferConfirm) setShowFilePreview(true);
  }, [pendingTransferConfirm]);

  const handleConfirmSend = useCallback(async (password?: string, shouldZip?: boolean, compressImagesFlag?: boolean) => {
    setShowFilePreview(false);
    const connected = peers.filter(p => p.state === 'connected');
    sounds.current.playTransferStart();
    try {
      let finalFiles = pendingFiles;
      if (compressImagesFlag && finalFiles.some(f => f.type.startsWith('image/'))) {
        showToast('Compressing images...', 'info');
        finalFiles = await Promise.all(finalFiles.map(async f =>
          f.type.startsWith('image/') ? await compressImage(f, 0.75) : f
        ));
      }
      if (shouldZip && finalFiles.length > 1) {
        showToast('Zipping files...', 'info');
        try {
          finalFiles = [await createZipFromFiles(finalFiles, `Lynkless_Bundle_${Date.now()}.zip`)];
        } catch {
          showToast('Zipping failed, sending individually', 'error');
        }
      }
      const toSend = password
        ? await Promise.all(finalFiles.map(f => E2EEHelper.encryptFile(f, password)))
        : finalFiles;

      if (connected.length > 1) {
        for (const f of toSend) await broadcastFile(f, connected.map(p => p.id));
      } else {
        for (const f of toSend) for (const peer of connected) await sendFile(f, peer.id);
      }
      sounds.current.playTransferComplete();
      showToast(`Sent ${pendingFiles.length} file(s) to ${connected.length} peer(s)`, 'success');
    } catch {
      sounds.current.playError();
      showToast('Failed to send files. Please try again.', 'error');
    }
    setPendingFiles([]);
  }, [pendingFiles, peers, sendFile, broadcastFile, showToast]);

  const handleQRScan = useCallback((payload: { peerId: string; serverUrl: string; sessionToken: string; timestamp: number }) => {
    if (payload.peerId && payload.peerId !== clientId) {
      sendConnectionRequest(payload.peerId);
    }
  }, [clientId, sendConnectionRequest]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsGlobalDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsGlobalDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsGlobalDragging(false);
  }, []);

  // ── Context Value ──
  const value: AppContextValue = {
    clientId, isConnected, isLoading, isLocalMode, error,
    roomState, nearbyPeers, incomingRequests, peerStates,
    createRoom, joinRoom, leaveRoom,
    sendConnectionRequest, rejectConnectionRequest,
    peers, transfers, messages, localStream, remoteStreams,
    connectedPeers, connectedPeersCount,
    sendFile, broadcastFile, sendMessage,
    cancelTransfer, pauseTransfer, resumeTransfer,
    disconnectFromPeer, getFingerprint,
    startScreenShare, stopScreenShare,
    selectedPeer, setSelectedPeer, canSendFile,
    activeView, setActiveView,
    showQRCode, setShowQRCode,
    showQRScanner, setShowQRScanner,
    isGlobalDragging,
    showFilePreview, setShowFilePreview,
    pendingFiles, showTransferConfirm, pendingTransferConfirm,
    radarUsers, chatPeers,
    handleUserClick, handleFileDrop,
    handleDragEnter, handleDragLeave, handleDragOver, handleDrop,
    handleAcceptRequest, handleTransferConfirm, handleConfirmSend, handleQRScan,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
