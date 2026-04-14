'use client';
/**
 * Advanced useLocalDiscovery (LocalSend style)
 *
 * Implements aggressive LAN-based peer discovery without requiring an internet connection.
 * If WebRTC ICE candidiates are obscured by mDNS (typical in modern mobile browsers),
 * it performs a wide sweep of common local subnet IPs (192.168.1.x, etc.) using `Promise.any`
 * to instantly latch onto a running Lynkless local signaling server!
 */

import { useCallback, useRef } from 'react';

const LAN_SIGNALING_PORT = 8080;
const DISCOVERY_TIMEOUT_MS = 2500; // Allow 2.5s for blind sweeps

export interface LocalDiscoveryResult {
  wsUrl: string;
  localIp: string;
  serverIp: string;
}

/**
 * Extract the device's local IP address using a temporary WebRTC ICE gather.
 */
async function getLocalIpFromICE(): Promise<string | null> {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const timeout = setTimeout(() => { pc.close(); resolve(null); }, 3000);

    pc.createDataChannel('ip-discovery');
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(() => { clearTimeout(timeout); resolve(null); });

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        clearTimeout(timeout);
        pc.close();
        resolve(null);
        return;
      }
      const candidate = e.candidate.candidate;
      const match = candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (match) {
        const ip = match[1];
        if (!ip.startsWith('127.') && !ip.startsWith('169.254.')) {
          clearTimeout(timeout);
          pc.close();
          resolve(ip);
        }
      }
    };
  });
}

/**
 * Probe a specific IP to see if a Lynkless signaling server is running there.
 */
async function probeSignalingServer(ip: string): Promise<boolean> {
  const url = `http://${ip}:${LAN_SIGNALING_PORT}/health`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      return data?.status === 'ok';
    }
    return false;
  } catch {
    return false; // Silence network failures
  }
}

/**
 * Scan specific subnets concurrently. Resolves the INSTANT a server is found.
 */
async function activeSubnetSweep(subnets: string[]): Promise<string | null> {
  const candidates: string[] = [];
  
  // Build IP list for entire /24 subnets 
  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) {
        candidates.push(`${subnet}.${i}`);
    }
  }
  
  try {
     const serverIp = await Promise.any(
        candidates.map(async (ip) => {
           const found = await probeSignalingServer(ip);
           if (found) return ip;
           throw new Error('Not found'); // Rejected to trigger Promise.any fallback
        })
     );
     return serverIp;
  } catch (err) {
     // AggregateError: All promises were rejected, meaning no server was found.
     return null;
  }
}

export function useLocalDiscovery() {
  const isDiscovering = useRef(false);

  const discover = useCallback(async (): Promise<LocalDiscoveryResult | null> => {
    if (isDiscovering.current) return null;
    isDiscovering.current = true;

    try {
      console.log('[LocalDiscovery] Starting Advanced LAN scan...');

      // 1. Always check localhost first
      const localhostFound = await probeSignalingServer('localhost');
      if (localhostFound) {
        return {
          wsUrl: `ws://localhost:${LAN_SIGNALING_PORT}`,
          localIp: 'localhost',
          serverIp: 'localhost',
        };
      }

      // 2. Try precise IP discovery
      const localIp = await getLocalIpFromICE();
      if (localIp) {
        console.log(`[LocalDiscovery] Device local IP: ${localIp}. Sweeping precise subnet...`);
        const parts = localIp.split('.');
        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
        const serverIp = await activeSubnetSweep([subnet]);
        
        if (serverIp) {
          const wsUrl = `ws://${serverIp}:${LAN_SIGNALING_PORT}`;
          console.log(`[LocalDiscovery] ✅ Found exact LAN signaling server at ${wsUrl}`);
          return { wsUrl, localIp, serverIp };
        }
      }

      // 3. Fallback: Aggressive Blind LAN Scanning (LocalSend style)
      // This bridges the PWA limitation on iOS/Android where mDNS obscures local IP.
      console.log('[LocalDiscovery] WebRTC IP blocked by mDNS. Executing Blind Sweep on common subnets...');
      const COMMON_SUBNETS = ['192.168.1', '192.168.0', '192.168.2', '10.0.0'];
      
      const blindServerIp = await activeSubnetSweep(COMMON_SUBNETS);
      if (blindServerIp) {
          const wsUrl = `ws://${blindServerIp}:${LAN_SIGNALING_PORT}`;
          console.log(`[LocalDiscovery] ✅ Blind Sweep successful! Found LAN signaling server at ${wsUrl}`);
          return { wsUrl, localIp: 'mDNS-hidden', serverIp: blindServerIp };
      }

      console.log('[LocalDiscovery] No LAN signaling server found on network.');
      return null;
    } finally {
      isDiscovering.current = false;
    }
  }, []);

  return { discover };
}
