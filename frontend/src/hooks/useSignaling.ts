'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSignalingClient, SignalingMessage, SignalingClient } from '@/lib/socket/client';

export interface RoomUser {
  id: string;
  isNearby: boolean;
  isCreator: boolean;
  isSelf: boolean;
}

export interface NearbyPeer {
  id: string;
  isNearby: boolean;
  isLocal: boolean;
}

export interface ConnectionRequest {
  fromId: string;
  isNearby: boolean;
  timestamp: number;
}

export interface PeerConnectionState {
  peerId: string;
  state: 'idle' | 'request-sent' | 'request-received' | 'connected' | 'rejected';
}

export interface RoomState {
  code: string | null;
  hasPassword: boolean;
  users: RoomUser[];
  isCreator: boolean;
}

interface UseSignalingReturn {
  clientId: string | null;
  isConnected: boolean;
  roomState: RoomState;
  nearbyPeers: NearbyPeer[];
  incomingRequests: ConnectionRequest[];
  peerStates: Map<string, PeerConnectionState>;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  createRoom: (password?: string) => void;
  joinRoom: (code: string, password?: string) => void;
  leaveRoom: () => void;
  sendConnectionRequest: (targetId: string) => void;
  acceptConnectionRequest: (fromId: string) => void;
  rejectConnectionRequest: (fromId: string) => void;
}

export function useSignaling(): UseSignalingReturn {
  const [clientId, setClientId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState>({
    code: null,
    hasPassword: false,
    users: [],
    isCreator: false,
  });
  const [nearbyPeers, setNearbyPeers] = useState<NearbyPeer[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<ConnectionRequest[]>([]);
  const [peerStates, setPeerStates] = useState<Map<string, PeerConnectionState>>(new Map());

  const signalingRef = useRef<SignalingClient | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const updatePeerState = useCallback((peerId: string, state: PeerConnectionState['state']) => {
    setPeerStates(prev => {
      const newMap = new Map(prev);
      newMap.set(peerId, { peerId, state });
      return newMap;
    });
  }, []);

  const removePeerState = useCallback((peerId: string) => {
    setPeerStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });
  }, []);

  const handleMessage = useCallback((message: SignalingMessage) => {
    switch (message.type) {
      case 'connected':
        setClientId(message.clientId as string);
        setIsConnected(true);
        setError(null);
        // Initial nearby peers from server
        if (message.nearbyPeers) {
          setNearbyPeers(message.nearbyPeers as NearbyPeer[]);
        }
        break;

      case 'nearby-peers':
        const filtered = (message.peers as NearbyPeer[] || []).filter(p => p.id !== clientId);
        setNearbyPeers(filtered);
        break;

      case 'room-created':
        setRoomState({
          code: message.code as string,
          hasPassword: message.hasPassword as boolean,
          users: [],
          isCreator: true,
        });
        break;

      case 'room-joined':
        setRoomState({
          code: message.code as string,
          hasPassword: false,
          users: (message.users as RoomUser[]) || [],
          isCreator: false,
        });
        break;

      case 'join-error':
        setError(getErrorMessage(message.error as string));
        break;

      case 'user-joined':
        const newUser: RoomUser = {
          id: message.userId as string,
          isNearby: message.isNearby as boolean,
          isCreator: false,
          isSelf: false,
        };
        setRoomState((prev) => ({
          ...prev,
          users: [...prev.users, newUser],
        }));
        
        // Immediate sync for nearby list
        if (newUser.isNearby && newUser.id !== clientId) {
          setNearbyPeers(prev => {
            if (prev.some(p => p.id === newUser.id)) return prev;
            return [...prev, { id: newUser.id, isNearby: true, isLocal: false }];
          });
        }
        break;

      case 'user-left':
        setRoomState((prev) => ({
          ...prev,
          users: prev.users.filter((u) => u.id !== message.userId),
        }));
        removePeerState(message.userId as string);
        setNearbyPeers(prev => prev.filter(p => p.id !== message.userId));
        break;

      case 'left-room':
        setRoomState({
          code: null,
          hasPassword: false,
          users: [],
          isCreator: false,
        });
        break;

      case 'users-list':
        setRoomState((prev) => ({
          ...prev,
          users: (message.users as RoomUser[]) || [],
        }));
        break;

      // Connection approval flow
      case 'connection-request-sent':
        updatePeerState(message.targetId as string, 'request-sent');
        break;

      case 'connection-request':
        setIncomingRequests(prev => [
          ...prev,
          {
            fromId: message.fromId as string,
            isNearby: message.isNearby as boolean,
            timestamp: Date.now(),
          },
        ]);
        updatePeerState(message.fromId as string, 'request-received');
        break;

      case 'connection-accepted':
        updatePeerState(message.fromId as string, 'connected');
        break;

      case 'connection-rejected':
        updatePeerState(message.fromId as string, 'rejected');
        // Clear rejected state after a delay
        setTimeout(() => {
          removePeerState(message.fromId as string);
        }, 3000);
        break;

      case 'connection-request-failed':
        setError(`Connection failed: ${message.reason}`);
        removePeerState(message.targetId as string);
        break;

      case 'peer-disconnected':
        removePeerState(message.peerId as string);
        setIncomingRequests(prev => prev.filter(r => r.fromId !== message.peerId));
        setNearbyPeers(prev => prev.filter(p => p.id !== message.peerId));
        setRoomState((prev) => ({
          ...prev,
          users: prev.users.filter((u) => u.id !== message.peerId),
        }));
        break;

      case 'error':
        setError(message.message as string);
        break;

      case 'reconnecting':
        setError(`Connection lost. Reconnecting (Attempt ${message.attempt})...`);
        setIsConnected(false);
        break;

      case 'disconnected':
        setError('Lost connection to server. Please refresh the page.');
        setIsConnected(false);
        setRoomState({
          code: null,
          hasPassword: false,
          users: [],
          isCreator: false,
        });
        setNearbyPeers([]);
        break;
    }
  }, [updatePeerState, removePeerState, clientId]);

  const connect = useCallback(async () => {
    try {
      setError(null);
      const signaling = getSignalingClient();
      signalingRef.current = signaling;

      const id = await signaling.connect();
      setClientId(id);
      setIsConnected(true);

      // Set up message handler
      cleanupRef.current = signaling.on((message: SignalingMessage) => {
        handleMessage(message);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnected(false);
    }
  }, [handleMessage]);

  const disconnect = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
    }
    if (signalingRef.current) {
      signalingRef.current.disconnect();
    }
    setIsConnected(false);
    setClientId(null);
    setRoomState({
      code: null,
      hasPassword: false,
      users: [],
      isCreator: false,
    });
    setNearbyPeers([]);
    setIncomingRequests([]);
    setPeerStates(new Map());
  }, []);

  const createRoom = useCallback((password?: string) => {
    if (signalingRef.current?.isConnected()) {
      signalingRef.current.send({
        type: 'create-room',
        password: password || null,
      });
    }
  }, []);

  const joinRoom = useCallback((code: string, password?: string) => {
    if (signalingRef.current?.isConnected()) {
      setError(null);
      signalingRef.current.send({
        type: 'join-room',
        code,
        password: password || null,
      });
    }
  }, []);

  const leaveRoom = useCallback(() => {
    if (signalingRef.current?.isConnected()) {
      signalingRef.current.send({
        type: 'leave-room',
      });
    }
  }, []);

  const sendConnectionRequest = useCallback((targetId: string) => {
    if (signalingRef.current?.isConnected()) {
      signalingRef.current.send({
        type: 'connection-request',
        targetId,
      });
    }
  }, []);

  const acceptConnectionRequest = useCallback((fromId: string) => {
    if (signalingRef.current?.isConnected()) {
      // Remove from incoming requests
      setIncomingRequests(prev => prev.filter(r => r.fromId !== fromId));
      updatePeerState(fromId, 'connected');
      
      signalingRef.current.send({
        type: 'connection-accepted',
        targetId: fromId,
      });
    }
  }, [updatePeerState]);

  const rejectConnectionRequest = useCallback((fromId: string) => {
    if (signalingRef.current?.isConnected()) {
      // Remove from incoming requests
      setIncomingRequests(prev => prev.filter(r => r.fromId !== fromId));
      removePeerState(fromId);
      
      signalingRef.current.send({
        type: 'connection-rejected',
        targetId: fromId,
      });
    }
  }, [removePeerState]);

  // 120% Sync: Proactive Heartbeat to ensure all devices see each other
  useEffect(() => {
    if (isConnected && signalingRef.current) {
      const interval = setInterval(() => {
        if (signalingRef.current?.isConnected()) {
          signalingRef.current.send({ type: 'get-nearby' });
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    clientId,
    isConnected,
    roomState,
    nearbyPeers,
    incomingRequests,
    peerStates,
    error,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    leaveRoom,
    sendConnectionRequest,
    acceptConnectionRequest,
    rejectConnectionRequest,
  };
}

function getErrorMessage(error: string): string {
  switch (error) {
    case 'ROOM_NOT_FOUND':
      return 'Room not found. Please check the code and try again.';
    case 'PASSWORD_REQUIRED':
      return 'This room requires a password.';
    case 'INVALID_PASSWORD':
      return 'Incorrect password.';
    case 'INVALID_ROOM_CODE':
      return 'Invalid room code format.';
    case 'ROOM_FULL':
      return 'This room is full.';
    default:
      return error;
  }
}
