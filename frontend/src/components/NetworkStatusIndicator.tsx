'use client';

import { useState, useEffect, memo } from 'react';

export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'unknown';

interface NetworkStatus {
  type: NetworkType;
  online: boolean;
  downlink?: number;
  rtt?: number;
  effectiveType?: string;
}

interface NetworkInformation {
  type?: string;
  downlink?: number;
  rtt?: number;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

function getNetworkInfo(): NetworkStatus {
  const nav = navigator as Navigator & { connection?: NetworkInformation };
  if (typeof window === 'undefined' || !nav.connection) {
    return { type: 'unknown', online: navigator.onLine };
  }

  const conn = nav.connection;
  let type: NetworkType = 'unknown';
  
  if (conn.type === 'wifi') type = 'wifi';
  else if (conn.type === 'cellular') type = 'cellular';
  else if (conn.type === 'ethernet') type = 'ethernet';
  else if (conn.effectiveType === '4g' || conn.effectiveType === '5g') type = 'cellular';
  
  return {
    type,
    online: navigator.onLine,
    downlink: conn.downlink,
    rtt: conn.rtt,
    effectiveType: conn.effectiveType,
  };
}

export const NetworkStatusIndicator = memo(function NetworkStatusIndicator() {
  const [network, setNetwork] = useState<NetworkStatus>(() => getNetworkInfo());

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: NetworkInformation };
    const updateNetwork = () => setNetwork(getNetworkInfo());
    const conn = nav.connection;
    
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    
    if (conn && conn.addEventListener) {
      conn.addEventListener('change', updateNetwork);
    }

    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      if (conn && conn.removeEventListener) {
        conn.removeEventListener('change', updateNetwork);
      }
    };
  }, []);

  if (!network.online) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs text-red-400 font-medium">Offline</span>
      </div>
    );
  }

  const icons = {
    wifi: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
    ),
    cellular: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    ethernet: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
    unknown: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  };

  const labels = {
    wifi: 'WiFi',
    cellular: network.effectiveType ? network.effectiveType.toUpperCase() : 'Cellular',
    ethernet: 'Ethernet',
    unknown: 'Network',
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#1f1f1f] border border-[#27272a]">
      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
      <span className="text-[#a1a1aa]">{icons[network.type]}</span>
      <span className="text-xs text-[#a1a1aa] font-medium">{labels[network.type]}</span>
      {network.downlink && (
        <span className="text-xs text-[#71717a]">{network.downlink.toFixed(1)} Mbps</span>
      )}
    </div>
  );
});
