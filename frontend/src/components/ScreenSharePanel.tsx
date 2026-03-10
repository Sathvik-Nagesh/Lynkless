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
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-[#111] border border-[#27272a]"
          >
            <svg className="w-8 h-8 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Live Screen Sharing</h3>
          <p className="text-[#a1a1aa] text-sm max-w-sm mb-6">
            Share your screen directly with {peerCount === 0 ? 'connected peers.' : `${peerCount} connected peer${peerCount !== 1 ? 's' : ''}.`}
            The stream operates purely over P2P using WebRTC with E2EE.
          </p>
          <button
            onClick={onStartShare}
            disabled={peerCount === 0}
            className="px-6 py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{
              background: peerCount === 0 ? 'var(--bg-hover)' : '#ededed',
              color: peerCount === 0 ? '#71717a' : '#000000',
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
              <div className="flex gap-2">
                <div className="bg-[#111]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#27272a] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold text-[#ededed]">
                    {activeRemote ? 'Viewing Remote Screen' : 'You are sharing your screen'}
                  </span>
                </div>
                {activeRemote && (
                  <button
                    onClick={() => {
                      if (remoteVideoRef.current) {
                        try {
                          if (document.fullscreenElement) {
                            document.exitFullscreen();
                          } else {
                            remoteVideoRef.current.requestFullscreen();
                          }
                        } catch (e) {
                          console.error('Fullscreen failed', e);
                        }
                      }
                    }}
                    className="bg-[#111]/80 hover:bg-[#1f1f1f] text-white px-3 py-1.5 rounded-lg border border-[#27272a] flex items-center justify-center transition-colors backdrop-blur-md"
                    title="Toggle Fullscreen"
                  >
                    <svg className="w-4 h-4 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                )}
              </div>
              
              {localStream && !activeRemote && (
                <button
                  onClick={onStopShare}
                  className="bg-red-500/90 hover:bg-red-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors backdrop-blur-md shadow-lg"
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
