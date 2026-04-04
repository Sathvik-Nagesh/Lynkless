'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getWebRTCManager,
  ConnectionState,
} from '@/lib/webrtc/connection';
import {
  getFileTransferManager,
  TransferProgress
} from '@/lib/webrtc/fileTransfer';
import {
  getChatManager,
  ChatMessage
} from '@/lib/webrtc/chat';
import { saveTransferHistory } from '@/lib/db/transferHistory';

export interface PeerState {
  id: string;
  state: ConnectionState;
  isNearby: boolean;
  isRelay?: boolean;
}

export interface PeerFingerprint {
  peerId: string;
  fingerprint: string;
}

interface UseWebRTCReturn {
  peers: PeerState[];
  transfers: TransferProgress[];
  messages: ChatMessage[];
  fingerprints: Map<string, string>;
  connectToPeer: (peerId: string, isNearby?: boolean) => Promise<void>;
  sendFile: (file: File, peerId: string) => Promise<string>;
  broadcastFile: (file: File, peerIds: string[]) => Promise<string>;
  sendMessage: (content: string) => void;
  cancelTransfer: (fileId: string) => void;
  pauseTransfer: (fileId: string) => void;
  resumeTransfer: (fileId: string) => void;
  disconnectFromPeer: (peerId: string) => void;
  disconnectAll: () => void;
  getFingerprint: (peerId: string) => string | undefined;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  startCall: (peerId: string, type: 'audio' | 'video') => Promise<void>;
  endCall: (peerId: string) => void;
  callStream: MediaStream | null;
}

export function useWebRTC(clientId: string | null): UseWebRTCReturn {
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fingerprints, setFingerprints] = useState<Map<string, string>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [callStream, setCallStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const localSendersRef = useRef<Map<string, RTCRtpSender[]>>(new Map());
  const callSendersRef = useRef<Map<string, RTCRtpSender[]>>(new Map());

  const webrtcRef = useRef(getWebRTCManager());
  const fileTransferRef = useRef(getFileTransferManager());
  const chatRef = useRef(getChatManager());

  useEffect(() => {
    if (clientId) {
      chatRef.current.setClientId(clientId);
    }
  }, [clientId]);

  useEffect(() => {
    const webrtc = webrtcRef.current;
    const fileTransfer = fileTransferRef.current;
    const chat = chatRef.current;

    // Handle state changes
    const unsubState = webrtc.onStateChange((peerId, state) => {
      // Get isNearby from the actual WebRTC peer connection
      const peerConn = webrtc.getPeer(peerId);
      const isNearby = peerConn?.isNearby ?? false;

      setPeers((prev) => {
        const existing = prev.find((p) => p.id === peerId);
        if (existing) {
          return prev.map((p) =>
            p.id === peerId ? { ...p, state, isNearby } : p
          );
        }
        return [...prev, { id: peerId, state, isNearby }];
      });

      // Remove disconnected peers
      if (state === 'disconnected' || state === 'failed') {
        setTimeout(() => {
          setPeers((prev) => prev.filter((p) => p.id !== peerId));
          // Clear fingerprint when peer disconnects
          setFingerprints((prev) => {
            const newMap = new Map(prev);
            newMap.delete(peerId);
            return newMap;
          });
        }, 1000);
      }
    });

    // Handle fingerprint generation
    const unsubFingerprint = webrtc.onFingerprint((peerId, fingerprint) => {
      setFingerprints((prev) => {
        const newMap = new Map(prev);
        newMap.set(peerId, fingerprint);
        return newMap;
      });
    });

    // Handle relay detection
    const unsubRelay = webrtc.onRelayMode((peerId, isRelay) => {
      setPeers((prev) => {
        return prev.map((p) => (p.id === peerId ? { ...p, isRelay } : p));
      });
    });

    // Handle transfer progress
    const unsubProgress = fileTransfer.onProgress((progress) => {
      setTransfers((prev) => {
        const existing = prev.find((t) => t.fileId === progress.fileId);
        if (existing) {
          return prev.map((t) =>
            t.fileId === progress.fileId ? progress : t
          );
        }
        return [...prev, progress];
      });

      // Remove completed transfers after delay and save history
      if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') {
        saveTransferHistory({
          id: progress.fileId + '-' + Date.now(),
          fileName: progress.fileName,
          totalSize: progress.totalSize,
          transferType: progress.type,
          peerId: progress.peerId,
          timestamp: Date.now(),
          status: progress.status,
        });

        setTimeout(() => {
          setTransfers((prev) =>
            prev.filter((t) => t.fileId !== progress.fileId)
          );
        }, 5000);
      }
    });

    // Handle chat messages
    const unsubChat = chat.onMessage((message) => {
      setMessages((prev) => [...prev, message]);
    });

    // Handle track additions (remote media)
    const unsubTrack = webrtc.onTrack((peerId, track, streams) => {
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        if (streams && streams[0]) {
          newMap.set(peerId, streams[0]);
        }
        return newMap;
      });
      // Handle when track ends remotely
      track.onmute = () => {
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.delete(peerId);
          return newMap;
        });
      };
    });

    return () => {
      unsubState();
      unsubFingerprint();
      unsubRelay();
      unsubProgress();
      unsubChat();
      unsubTrack();
    };
  }, []);

  const connectToPeer = useCallback(async (peerId: string, isNearby = false) => {
    await webrtcRef.current.connectToPeer(peerId, isNearby);
  }, []);

  const sendFile = useCallback(async (file: File, peerId: string) => {
    return fileTransferRef.current.sendFile(file, peerId);
  }, []);

  const broadcastFile = useCallback(async (file: File, peerIds: string[]) => {
    return fileTransferRef.current.broadcastFile(file, peerIds);
  }, []);

  const sendMessage = useCallback((content: string) => {
    const message = chatRef.current.broadcastMessage(content);
    setMessages((prev) => [...prev, message]);
  }, []);

  const cancelTransfer = useCallback((fileId: string) => {
    fileTransferRef.current.cancelTransfer(fileId);
  }, []);

  const pauseTransfer = useCallback((fileId: string) => {
    fileTransferRef.current.pauseTransfer(fileId);
  }, []);

  const resumeTransfer = useCallback((fileId: string) => {
    fileTransferRef.current.resumeTransfer(fileId);
  }, []);

  const disconnectFromPeer = useCallback((peerId: string) => {
    webrtcRef.current.closePeerConnection(peerId);
  }, []);

  const disconnectAll = useCallback(() => {
    webrtcRef.current.closeAllConnections();
    setPeers([]);
    setMessages([]);
    setFingerprints(new Map());
  }, []);

  const getFingerprint = useCallback((peerId: string) => {
    return fingerprints.get(peerId);
  }, [fingerprints]);

  const stopScreenShare = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      
      const webrtc = webrtcRef.current;
      localSendersRef.current.forEach((senders, peerId) => {
        senders.forEach((sender) => webrtc.removeTrack(peerId, sender));
      });
      
      localSendersRef.current.clear();
      setLocalStream(null);
    }
  }, [localStream]);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setLocalStream(stream);

      // Handle user stopping screen share from browser UI
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      const webrtc = webrtcRef.current;
      localSendersRef.current.clear();

      webrtc.getConnectedPeers().forEach((peer) => {
        const senders: RTCRtpSender[] = [];
        stream.getTracks().forEach((track) => {
          const sender = webrtc.addTrack(peer.peerId, track, stream);
          if (sender) senders.push(sender);
        });
        localSendersRef.current.set(peer.peerId, senders);
      });

    } catch (err) {
      console.error('Failed to start screen share', err);
    }
  }, [stopScreenShare]);

  const startCall = useCallback(async (peerId: string, type: 'audio' | 'video') => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video' ? { width: 1280, height: 720 } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCallStream(stream);

      const webrtc = webrtcRef.current;
      const senders: RTCRtpSender[] = [];
      stream.getTracks().forEach((track) => {
        const sender = webrtc.addTrack(peerId, track, stream);
        if (sender) senders.push(sender);
      });
      callSendersRef.current.set(peerId, senders);
    } catch (err) {
      console.error('[Call] Failed to start call:', err);
      throw err;
    }
  }, []);

  const endCall = useCallback((peerId: string) => {
    if (callStream) {
      callStream.getTracks().forEach((track) => track.stop());
    }
    const webrtc = webrtcRef.current;
    const senders = callSendersRef.current.get(peerId);
    if (senders) {
      senders.forEach((sender) => webrtc.removeTrack(peerId, sender));
      callSendersRef.current.delete(peerId);
    }
    setCallStream(null);
  }, [callStream]);

  return {
    peers,
    transfers,
    messages,
    fingerprints,
    connectToPeer,
    sendFile,
    broadcastFile,
    sendMessage,
    cancelTransfer,
    pauseTransfer,
    resumeTransfer,
    disconnectFromPeer,
    disconnectAll,
    getFingerprint,
    localStream,
    remoteStreams,
    startScreenShare,
    stopScreenShare,
    startCall,
    endCall,
    callStream,
  };
}
