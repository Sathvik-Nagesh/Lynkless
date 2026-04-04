'use client';

import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPeerName } from '@/lib/utils/nameGenerator';

interface TrustedPeersManagerProps {
  peerId: string;
  fingerprint?: string;
  isConnected: boolean;
}

export const TrustPeerButton = memo(function TrustPeerButton({
  peerId,
  fingerprint,
  isConnected,
}: TrustedPeersManagerProps) {
  const [isTrusted, setIsTrusted] = useState(() => {
    if (typeof window === 'undefined') return false;
    const { getTrustedPeersManager } = require('@/lib/utils/trustedPeers');
    return getTrustedPeersManager().isTrusted(peerId, fingerprint);
  });

  const handleToggleTrust = useCallback(() => {
    const { getTrustedPeersManager } = require('@/lib/utils/trustedPeers');
    const manager = getTrustedPeersManager();

    if (isTrusted) {
      manager.removePeer(peerId);
      setIsTrusted(false);
    } else {
      manager.addPeer(peerId, fingerprint || '', getPeerName(peerId));
      setIsTrusted(true);
    }
  }, [isTrusted, peerId, fingerprint]);

  if (!isConnected) return null;

  return (
    <button
      onClick={handleToggleTrust}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
        isTrusted
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'bg-[#1f1f1f] text-[#a1a1aa] border border-[#27272a] hover:bg-[#27272a]'
      }`}
      title={isTrusted ? 'Remove from trusted devices' : 'Trust this device'}
    >
      {isTrusted ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Trusted
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Trust Device
        </>
      )}
    </button>
  );
});
