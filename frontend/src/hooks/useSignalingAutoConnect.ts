'use client';
import { useEffect } from 'react';
import { useLocalDiscovery } from './useLocalDiscovery';
import { getSignalingClient } from '@/lib/socket/client';

interface UseSignalingAutoConnectParams {
  connect: () => Promise<void>;
  onLoaded: () => void;
}

export function useSignalingAutoConnect({ connect, onLoaded }: UseSignalingAutoConnectParams): void {
  const { discover } = useLocalDiscovery();

  useEffect(() => {
    const initConnection = async () => {
      // Step 1: Try the configured cloud / remote signaling server
      try {
        await connect();
        console.log('[AutoConnect] Connected to primary signaling server.');
        onLoaded();
        return;
      } catch (err) {
        console.warn('[AutoConnect] Primary signaling server unreachable:', err);
      }

      // Step 2: Fallback — scan the local LAN for a Lynkless signaling server
      console.log('[AutoConnect] Attempting LAN fallback discovery...');
      try {
        const result = await discover();
        if (result) {
          console.log(`[AutoConnect] LAN server found at ${result.wsUrl}. Reconnecting...`);
          // Update the singleton signaling client's URL and reconnect
          const client = getSignalingClient();
          if ('setUrl' in client && typeof (client as { setUrl: (url: string) => void }).setUrl === 'function') {
            (client as { setUrl: (url: string) => void }).setUrl(result.wsUrl);
          }
          await connect();
          console.log('[AutoConnect] ✅ Connected via LAN fallback!');
        } else {
          console.warn('[AutoConnect] No LAN signaling server found. App is offline.');
        }
      } catch (lanErr) {
        console.error('[AutoConnect] LAN fallback also failed:', lanErr);
      } finally {
        onLoaded();
      }
    };

    initConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only
}
