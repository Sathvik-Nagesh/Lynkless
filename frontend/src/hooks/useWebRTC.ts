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

export interface PeerState {
  id: string;
  state: ConnectionState;
  isNearby: boolean;
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
  sendMessage: (content: string) => void;
  cancelTransfer: (fileId: string) => void;
  pauseTransfer: (fileId: string) => void;
  resumeTransfer: (fileId: string) => void;
  disconnectFromPeer: (peerId: string) => void;
  disconnectAll: () => void;
  getFingerprint: (peerId: string) => string | undefined;
}

export function useWebRTC(clientId: string | null): UseWebRTCReturn {
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fingerprints, setFingerprints] = useState<Map<string, string>>(new Map());

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
      setPeers((prev) => {
        const existing = prev.find((p) => p.id === peerId);
        if (existing) {
          return prev.map((p) =>
            p.id === peerId ? { ...p, state } : p
          );
        }
        return [...prev, { id: peerId, state, isNearby: false }];
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

      // Remove completed transfers after delay
      if (progress.status === 'completed' || progress.status === 'failed') {
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

    return () => {
      unsubState();
      unsubFingerprint();
      unsubProgress();
      unsubChat();
    };
  }, []);

  const connectToPeer = useCallback(async (peerId: string, isNearby = false) => {
    await webrtcRef.current.connectToPeer(peerId, isNearby);
  }, []);

  const sendFile = useCallback(async (file: File, peerId: string) => {
    return fileTransferRef.current.sendFile(file, peerId);
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

  return {
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
    disconnectAll,
    getFingerprint,
  };
}
