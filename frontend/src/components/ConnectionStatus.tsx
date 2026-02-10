'use client';

import { motion } from 'framer-motion';

interface ConnectionStatusProps {
  isSignalingConnected: boolean;
  roomCode: string | null;
  connectedPeers: number;
}

export default function ConnectionStatus({
  isSignalingConnected,
  roomCode,
  connectedPeers,
}: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-4 text-xs">
      {/* Signaling status */}
      <div className="flex items-center gap-2">
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: isSignalingConnected ? '#22C55E' : '#EF4444',
          }}
          animate={{
            scale: isSignalingConnected ? [1, 1.2, 1] : 1,
            opacity: isSignalingConnected ? [1, 0.7, 1] : 1,
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <span className="text-[#64748B]">
          {isSignalingConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Room indicator */}
      {roomCode && (
        <>
          <div className="w-px h-3" style={{ background: 'var(--border-subtle)' }} />
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3" style={{ color: '#22D3EE' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="text-[#94A3B8] font-mono">{roomCode}</span>
          </div>
        </>
      )}

      {/* Peers indicator */}
      {connectedPeers > 0 && (
        <>
          <div className="w-px h-3" style={{ background: 'var(--border-subtle)' }} />
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: '#6366F1' }}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [1, 0.7, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            <span className="text-[#94A3B8]">
              {connectedPeers} peer{connectedPeers > 1 ? 's' : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
