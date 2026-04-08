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
    let cancelled = false;

    const initConnection = async () => {
      // Step 1: Try the primary (cloud) signaling server
      try {
        await connect();
        console.log('[AutoConnect] ✅ Connected to primary signaling server.');
      } catch (err) {
        console.warn('[AutoConnect] Primary server unreachable:', err);

        // Step 2: Background LAN fallback — runs AFTER onLoaded() so UI never blocks
        setTimeout(async () => {
          if (cancelled) return;
          console.log('[AutoConnect] Attempting silent LAN fallback discovery...');
          try {
            const result = await discover();
            if (result && !cancelled) {
              console.log(`[AutoConnect] LAN server found at ${result.wsUrl}. Switching...`);
              const client = getSignalingClient();
              client.setUrl(result.wsUrl);
              await connect();
              console.log('[AutoConnect] ✅ Connected via LAN fallback!');
            }
          } catch (lanErr) {
            console.warn('[AutoConnect] LAN fallback also failed:', lanErr);
          }
        }, 0);
      } finally {
        // Always unblock the UI immediately — LAN discovery runs in background
        onLoaded();
      }
    };

    initConnection();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount
}
