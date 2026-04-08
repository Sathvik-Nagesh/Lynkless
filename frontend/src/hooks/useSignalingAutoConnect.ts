import { useEffect } from 'react';

interface UseSignalingAutoConnectParams {
  connect: () => Promise<void>;
  onLoaded: () => void;
}

export function useSignalingAutoConnect({ connect, onLoaded }: UseSignalingAutoConnectParams): void {
  useEffect(() => {
    const initConnection = async () => {
      try {
        await connect();
      } catch (err) {
        console.error('Failed to connect:', err);
      } finally {
        onLoaded();
      }
    };

    initConnection();
  }, [connect, onLoaded]);
}

