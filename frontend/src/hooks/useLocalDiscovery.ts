'use client';
/**
 * useLocalDiscovery
 *
 * Implements true LAN-based peer discovery without requiring an internet connection.
 *
 * Strategy:
 * 1. Create a temporary RTCPeerConnection to collect local ICE candidates.
 *    This reveals the device's local IP (e.g. 192.168.1.42).
 * 2. Derive the local subnet (192.168.1.x).
 * 3. Poll common gateway IPs (/health endpoint) to find a running Lynkless
 *    signaling server on the same LAN (e.g. 192.168.1.1, .2, .100 etc.)
 * 4. Return the discovered LAN WebSocket URL so the signaling client can
 *    connect to it instead of the cloud server.
 *
 * This works 100% offline — as long as all devices are on the same Wi-Fi/LAN.
 */

import { useCallback, useRef } from 'react';

const LAN_SIGNALING_PORT = 8080;
const DISCOVERY_TIMEOUT_MS = 1500; // Per IP probe timeout
const COMMON_LAN_SUFFIXES = [1, 2, 100, 101, 150, 200, 254]; // Common gateway/server IPs

export interface LocalDiscoveryResult {
  wsUrl: string;
  localIp: string;
  serverIp: string;
}

/**
 * Extract the device's local IP address using a temporary WebRTC ICE gather.
 * This is the only reliable way to get local IPs from a browser sandbox.
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
        // Gathering complete, no local IP found
        clearTimeout(timeout);
        pc.close();
        resolve(null);
        return;
      }
      // candidate.address is the local IP (e.g. "192.168.1.42")
      const candidate = e.candidate.candidate;
      const match = candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (match) {
        const ip = match[1];
        // Filter out link-local and loopback
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
    return false;
  }
}

/**
 * Given a local IP like "192.168.1.42", scan the subnet for a signaling server.
 */
async function scanSubnetForServer(localIp: string): Promise<string | null> {
  const parts = localIp.split('.');
  if (parts.length !== 4) return null;
  const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;

  // Try common addresses in parallel batches
  const candidates = COMMON_LAN_SUFFIXES.map(suffix => `${subnet}.${suffix}`);
  
  // Also try the host itself (in case the server is running locally)
  candidates.unshift('localhost', '127.0.0.1');

  const results = await Promise.allSettled(
    candidates.map(async (ip) => {
      const found = await probeSignalingServer(ip);
      if (found) return ip;
      throw new Error('not found');
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') return result.value;
  }
  return null;
}

export function useLocalDiscovery() {
  const isDiscovering = useRef(false);

  /**
   * Attempts to find a Lynkless signaling server on the local network.
   * Returns the WebSocket URL if found, null otherwise.
   */
  const discover = useCallback(async (): Promise<LocalDiscoveryResult | null> => {
    if (isDiscovering.current) return null;
    isDiscovering.current = true;

    try {
      console.log('[LocalDiscovery] Starting LAN scan for Lynkless signaling server...');

      const localIp = await getLocalIpFromICE();
      if (!localIp) {
        console.log('[LocalDiscovery] Could not detect local IP. Trying localhost...');
        const localhostFound = await probeSignalingServer('localhost');
        if (localhostFound) {
          return {
            wsUrl: `ws://localhost:${LAN_SIGNALING_PORT}`,
            localIp: 'localhost',
            serverIp: 'localhost',
          };
        }
        return null;
      }

      console.log(`[LocalDiscovery] Device local IP: ${localIp}. Scanning subnet...`);
      const serverIp = await scanSubnetForServer(localIp);

      if (serverIp) {
        const wsUrl = `ws://${serverIp}:${LAN_SIGNALING_PORT}`;
        console.log(`[LocalDiscovery] ✅ Found LAN signaling server at ${wsUrl}`);
        return { wsUrl, localIp, serverIp };
      }

      console.log('[LocalDiscovery] No LAN signaling server found.');
      return null;
    } finally {
      isDiscovering.current = false;
    }
  }, []);

  return { discover };
}
