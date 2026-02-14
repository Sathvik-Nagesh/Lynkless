'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectionRequest } from '@/hooks/useSignaling';

interface ConnectionRequestModalProps {
  requests: ConnectionRequest[];
  onAccept: (fromId: string) => void;
  onReject: (fromId: string) => void;
}

const ConnectionRequestModal = memo(function ConnectionRequestModal({
  requests,
  onAccept,
  onReject,
}: ConnectionRequestModalProps) {
  if (requests.length === 0) return null;

  // Show the most recent request
  const request = requests[requests.length - 1];
  const shortId = request.fromId.replace('client_', '').toUpperCase().slice(0, 6);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Modal */}
        <motion.div
          className="relative bg-gray-900/95 backdrop-blur-md rounded-2xl border border-gray-700/50 p-6 max-w-sm w-full shadow-2xl"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', duration: 0.5 }}
        >
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-purple-500/10 pointer-events-none" />

          {/* Content */}
          <div className="relative">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <motion.div
                className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center"
                animate={{ 
                  boxShadow: [
                    '0 0 20px rgba(0, 240, 255, 0.3)',
                    '0 0 40px rgba(0, 240, 255, 0.5)',
                    '0 0 20px rgba(0, 240, 255, 0.3)',
                  ]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              </motion.div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-center text-white mb-2">
              Incoming Connection Request
            </h3>

            {/* Peer ID */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-gray-400">From:</span>
              <span className="px-3 py-1 bg-gray-800 rounded-lg font-mono text-cyan-400">
                {shortId}
              </span>
              {request.isNearby && (
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                  Nearby
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-gray-400 text-sm text-center mb-6">
              A peer wants to connect with you for file transfer and chat.
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <motion.button
                onClick={() => onReject(request.fromId)}
                className="flex-1 py-3 bg-gray-800/50 text-gray-300 rounded-xl font-medium border border-gray-700 hover:bg-gray-800 hover:border-gray-600 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </div>
              </motion.button>

              <motion.button
                onClick={() => onAccept(request.fromId)}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-cyan-500/30 transition-shadow"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Accept
                </div>
              </motion.button>
            </div>

            {/* Queue indicator */}
            {requests.length > 1 && (
              <p className="mt-4 text-center text-gray-500 text-xs">
                +{requests.length - 1} more request{requests.length > 2 ? 's' : ''} waiting
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

export default ConnectionRequestModal;
