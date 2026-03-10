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
          className="relative bg-[#111]/95 backdrop-blur-md rounded-2xl border border-[#27272a] p-6 max-w-sm w-full shadow-2xl"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', duration: 0.5 }}
        >

          {/* Content */}
          <div className="relative">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <motion.div
                className="w-16 h-16 rounded-full bg-[#1f1f1f] border border-[#27272a] flex items-center justify-center"
                animate={{ 
                  boxShadow: [
                    '0 0 10px rgba(0, 0, 0, 0)',
                    '0 0 15px rgba(237, 237, 237, 0.1)',
                    '0 0 10px rgba(0, 0, 0, 0)',
                  ]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <svg className="w-8 h-8 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              </motion.div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-center text-[#ededed] mb-2">
              Incoming Connection Request
            </h3>

            {/* Peer ID */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-[#a1a1aa]">From:</span>
              <span className="px-3 py-1 bg-[#1f1f1f] rounded-lg font-mono text-[#ededed]">
                {shortId}
              </span>
              {request.isNearby && (
                <span className="px-2 py-0.5 bg-[#333] text-[#ededed] text-xs rounded-full">
                  Nearby
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-[#a1a1aa] text-sm text-center mb-6">
              A peer wants to connect with you for file transfer and chat.
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <motion.button
                onClick={() => onReject(request.fromId)}
                className="flex-1 py-3 bg-[#1f1f1f] text-[#ededed] rounded-xl font-medium border border-[#27272a] hover:bg-[#27272a] hover:border-[#3f3f46] transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </div>
              </motion.button>

              <motion.button
                onClick={() => onAccept(request.fromId)}
                className="flex-1 py-3 bg-[#ededed] text-black rounded-xl font-semibold transition-shadow hover:bg-[#d4d4d8]"
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
              <p className="mt-4 text-center text-[#71717a] text-xs">
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
