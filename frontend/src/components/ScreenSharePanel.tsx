'use client';

import { useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScreenSharePanelProps {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  onStartShare: () => void;
  onStopShare: () => void;
  peerCount: number;
}

const ScreenSharePanel = memo(function ScreenSharePanel({
  localStream,
  remoteStreams,
  onStartShare,
  onStopShare,
  peerCount,
}: ScreenSharePanelProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const activeRemote = Array.from(remoteStreams.values())[0]; // Support 1 remote screen easily
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && activeRemote) {
      remoteVideoRef.current.srcObject = activeRemote;
    }
  }, [activeRemote]);

  const hasAnyStream = localStream !== null || activeRemote !== undefined;

  return (
    <div className="w-full h-full min-h-[400px] flex flex-col">
      {/* State: No screen being shared */}
      {!hasAnyStream && (
        <motion.div
          className="panel-elevated flex-1 flex flex-col items-center justify-center p-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div 
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.1), rgba(99, 102, 241, 0.1))' }}
          >
            <svg className="w-8 h-8 text-[#22D3EE]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-[#E6EDF3] mb-2">Live Screen Sharing</h3>
          <p className="text-[#64748B] text-sm max-w-sm mb-6">
            Share your screen directly with {peerCount === 0 ? 'connected peers.' : `${peerCount} connected peer${peerCount !== 1 ? 's' : ''}.`}
            The stream operates purely over P2P using WebRTC with E2EE.
          </p>
          <button
            onClick={onStartShare}
            disabled={peerCount === 0}
            className="px-6 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{
              background: peerCount === 0 ? 'var(--bg-hover)' : 'linear-gradient(135deg, #22D3EE, #6366F1)',
              color: peerCount === 0 ? '#64748B' : '#FFFFFF',
            }}
          >
            {peerCount === 0 ? 'Waiting for Peers...' : 'Start Screen Share'}
          </button>
        </motion.div>
      )}

      {/* State: Stream active */}
      <AnimatePresence>
        {hasAnyStream && (
          <motion.div
            className="panel-elevated flex-1 overflow-hidden relative group"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            {/* Viewport for video */}
            <div className="absolute inset-0 bg-[#020617] rounded-xl overflow-hidden flex items-center justify-center">
              {activeRemote ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : localStream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
              ) : null}
            </div>

            {/* Overlay badge & controls */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-[#0F172A]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#334155]/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-white">
                  {activeRemote ? 'Viewing Remote Screen' : 'You are sharing your screen'}
                </span>
              </div>
              
              {localStream && !activeRemote && (
                <button
                  onClick={onStopShare}
                  className="bg-red-500/90 hover:bg-red-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors backdrop-blur-md"
                >
                  Stop Sharing
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ScreenSharePanel;
