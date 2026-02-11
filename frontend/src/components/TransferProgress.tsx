'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { TransferProgress as TransferProgressType } from '@/lib/webrtc/fileTransfer';

interface TransferProgressProps {
  transfer: TransferProgressType;
  onCancel?: (fileId: string) => void;
  onPause?: (fileId: string) => void;
  onResume?: (fileId: string) => void;
}

const TransferProgress = memo(function TransferProgress({ transfer, onCancel, onPause, onResume }: TransferProgressProps) {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getStatusColor = () => {
    switch (transfer.status) {
      case 'completed':
        return 'from-green-500 to-emerald-500';
      case 'failed':
      case 'cancelled':
        return 'from-red-500 to-rose-500';
      case 'paused':
        return 'from-amber-500 to-orange-500';
      default:
        return 'from-cyan-500 to-purple-500';
    }
  };

  const getStatusIcon = () => {
    switch (transfer.status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'cancelled':
        return (
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        );
      case 'paused':
        return (
          <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <motion.svg
            className="w-5 h-5 text-cyan-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </motion.svg>
        );
    }
  };

  return (
    <motion.div
      className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getStatusColor()} flex items-center justify-center flex-shrink-0`}>
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{transfer.fileName}</p>
          <p className="text-gray-400 text-sm">
            {formatSize(transfer.transferredSize)} / {formatSize(transfer.totalSize)}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {getStatusIcon()}
          
          {/* Pause button */}
          {transfer.status === 'transferring' && onPause && (
            <button
              onClick={() => onPause(transfer.fileId)}
              className="p-1.5 text-gray-400 hover:text-amber-400 transition-colors rounded-lg hover:bg-amber-500/10"
              title="Pause transfer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {/* Resume button */}
          {transfer.status === 'paused' && onResume && (
            <button
              onClick={() => onResume(transfer.fileId)}
              className="p-1.5 text-gray-400 hover:text-green-400 transition-colors rounded-lg hover:bg-green-500/10"
              title="Resume transfer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {/* Cancel button */}
          {(transfer.status === 'transferring' || transfer.status === 'paused') && onCancel && (
            <button
              onClick={() => onCancel(transfer.fileId)}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
              title="Cancel transfer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${getStatusColor()}`}
          initial={{ width: 0 }}
          animate={{ width: `${transfer.progress}%` }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Shimmer effect for active transfers */}
        {transfer.status === 'transferring' && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>

      {/* Stats */}
      {transfer.status === 'transferring' && (
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{formatSpeed(transfer.speed)}</span>
          <span>{transfer.progress.toFixed(1)}%</span>
          <span>{formatTime(transfer.remainingTime)} remaining</span>
        </div>
      )}

      {transfer.status === 'paused' && (
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-amber-400">⏸ Paused</span>
          <span className="text-gray-400">{transfer.progress.toFixed(1)}% complete</span>
          <span className="text-amber-400/70">Click ▶ to resume</span>
        </div>
      )}

      {transfer.status === 'completed' && (
        <p className="mt-2 text-xs text-green-400">✓ Transfer complete!</p>
      )}

      {transfer.status === 'failed' && (
        <p className="mt-2 text-xs text-red-400">✗ Transfer failed</p>
      )}
    </motion.div>
  );
});

export default TransferProgress;
