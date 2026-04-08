import { useEffect } from 'react';

interface UseAutoJoinRoomParams {
  isConnected: boolean;
  isLoading: boolean;
  roomCode: string | null;
  joinRoom: (code: string) => void;
}

export function useAutoJoinRoom({
  isConnected,
  isLoading,
  roomCode,
  joinRoom,
}: UseAutoJoinRoomParams): void {
  useEffect(() => {
    if (!isConnected || isLoading || roomCode) return;

    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    const pendingRoom = sessionStorage.getItem('pendingRoomCode');
    const roomToJoin = urlRoom || pendingRoom;

    if (roomToJoin && roomToJoin.length === 6) {
      console.log('[Routing] Auto-joining room from deep link:', roomToJoin);
      joinRoom(roomToJoin.toUpperCase());

      window.history.replaceState({}, document.title, window.location.pathname);
      sessionStorage.removeItem('pendingRoomCode');
    }
  }, [isConnected, isLoading, roomCode, joinRoom]);
}

