import { useEffect, useRef } from 'react';
import type { RoomUser, PeerConnectionState } from '@/hooks/useSignaling';
import type { PeerState } from '@/hooks/useWebRTC';

interface UseAutoConnectRoomPeersParams {
  roomCode: string | null;
  roomUsers: RoomUser[];
  clientId: string | null;
  peerStates: Map<string, PeerConnectionState>;
  peers: PeerState[];
  sendConnectionRequest: (targetId: string) => void;
}

export function useAutoConnectRoomPeers({
  roomCode,
  roomUsers,
  clientId,
  peerStates,
  peers,
  sendConnectionRequest,
}: UseAutoConnectRoomPeersParams): void {
  const sentRequestsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Reset when leaving/switching rooms so future rooms can reconnect cleanly.
    if (!roomCode) {
      sentRequestsRef.current.clear();
    }
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !clientId) return;

    const otherUsers = roomUsers.filter((u) => u.id !== clientId);

    otherUsers.forEach((user) => {
      if (sentRequestsRef.current.has(user.id)) {
        return;
      }

      const currentState = peerStates.get(user.id);
      if (
        currentState?.state === 'request-sent' ||
        currentState?.state === 'request-received' ||
        currentState?.state === 'connected'
      ) {
        return;
      }

      const webrtcPeer = peers.find((p) => p.id === user.id);
      if (webrtcPeer && webrtcPeer.state === 'connected') {
        return;
      }

      if (clientId < user.id) {
        console.log('[Auto-Connect] Initiating to room user:', user.id);
        sentRequestsRef.current.add(user.id);
        sendConnectionRequest(user.id);
      }
    });
  }, [roomCode, roomUsers, clientId, peerStates, peers, sendConnectionRequest]);
}

