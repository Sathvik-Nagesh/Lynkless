'use client';

import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPeerName } from '@/lib/utils/nameGenerator';

interface TransferConfirmationProps {
  fileCount: number;
  totalSize: string;
  peerId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TransferConfirmation = memo(function TransferConfirmation({
  fileCount,
  totalSize,
  peerId,
  onConfirm,
  onCancel,
}: TransferConfirmationProps) {
  const [showDetails, setShowDetails] = useState(false);

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        />

        <motion.div
          className="relative bg-[#111] rounded-2xl border border-[#27272a] p-6 max-w-sm w-full shadow-2xl"
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#ededed]">Confirm Transfer</h3>
              <p className="text-xs text-[#a1a1aa]">Sending to peer</p>
            </div>
          </div>

          <div className="bg-[#1f1f1f] rounded-xl p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#a1a1aa]">To:</span>
              <span className="text-[#ededed] font-medium">{getPeerName(peerId)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#a1a1aa]">Files:</span>
              <span className="text-[#ededed] font-medium">{fileCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#a1a1aa]">Total Size:</span>
              <span className="text-[#ededed] font-medium">{totalSize}</span>
            </div>
          </div>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-[#a1a1aa] hover:text-[#ededed] transition-colors mb-4 flex items-center gap-1"
          >
            <svg 
              className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {showDetails ? 'Hide' : 'Show'} connection details
          </button>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-[#a1a1aa] font-medium rounded-xl hover:bg-[#1f1f1f] transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 px-4 py-2.5 bg-[#ededed] text-black font-semibold rounded-xl hover:bg-[#d4d4d8] transition-all text-sm"
            >
              Send Now
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});
