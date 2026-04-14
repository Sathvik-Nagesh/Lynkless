'use client';

import { memo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TransferProgress as TransferProgressType } from '@/lib/webrtc/fileTransfer';

interface TransferProgressProps {
  transfer: TransferProgressType;
  onCancel?: (fileId: string) => void;
  onPause?: (fileId: string) => void;
  onResume?: (fileId: string) => void;
}

// Helper functions moved outside to avoid recreation
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatSpeed = (bytesPerSecond: number): string => {
  if (!isFinite(bytesPerSecond) || isNaN(bytesPerSecond) || bytesPerSecond < 0) return '0 B/s';
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0s';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s`;
};

const TransferProgress = memo(function TransferProgress({ transfer, onCancel, onPause, onResume }: TransferProgressProps) {

  const isRecovering = transfer.status === 'transferring' && transfer.speed === 0 && transfer.progress > 0 && transfer.progress < 100;
  const isSlow = transfer.status === 'transferring' && transfer.speed > 0 && transfer.speed < 50 * 1024; // < 50 KB/s
  const pipWindowRef = useRef<Window | null>(null);

  const handlePiP = async () => {
    if (typeof window === 'undefined' || !('documentPictureInPicture' in window)) return;
    try {
      const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
        width: 340,
        height: 140,
      });
      pipWindowRef.current = pipWindow;
      
      pipWindow.document.head.innerHTML = `
        <title>Lynkless Transfer</title>
        <style>
          body { background: #111; color: #ededed; font-family: system-ui, sans-serif; display: flex; flex-direction: column; justify-content: center; height: 100vh; overflow: hidden; margin: 0; padding: 24px; box-sizing: border-box; }
          .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;}
          .title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;}
          .badge { font-size: 10px; background: rgba(56,189,248,0.1); color: #38bdf8; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56,189,248,0.3);}
          .track { width: 100%; height: 6px; background: #27272a; border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
          .bar { height: 100%; background: #38bdf8; border-radius: 3px; transition: width 0.2s linear; box-shadow: 0 0 10px rgba(56,189,248,0.6); }
          .stats { display: flex; justify-content: space-between; font-size: 11px; color: #a1a1aa; font-family: monospace;}
          .speed { color: #38bdf8; font-weight: bold; text-shadow: 0 0 5px rgba(56,189,248,0.4); }
        </style>
      `;

      pipWindow.document.body.innerHTML = `
        <div class="header">
          <div class="title" id="pip-title">--</div>
          <div class="badge">ACTIVE</div>
        </div>
        <div class="track"><div class="bar" id="pip-bar" style="width: 0%"></div></div>
        <div class="stats">
          <span class="speed" id="pip-speed">--</span>
          <span id="pip-pct">--</span>
          <span id="pip-time">--</span>
        </div>
      `;

      pipWindow.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
      });

    } catch (err) {
      console.error('PiP request failed:', err);
    }
  };

  // Sync to PiP window on every render
  useEffect(() => {
    if (pipWindowRef.current) {
      const doc = pipWindowRef.current.document;
      const titleEl = doc.getElementById('pip-title');
      if (titleEl && titleEl.textContent !== transfer.fileName) titleEl.textContent = transfer.fileName;
      
      const barEl = doc.getElementById('pip-bar');
      if (barEl) barEl.style.width = `${transfer.progress}%`;
      
      const speedEl = doc.getElementById('pip-speed');
      if (speedEl) speedEl.textContent = formatSpeed(transfer.speed);
      
      const pctEl = doc.getElementById('pip-pct');
      if (pctEl) pctEl.textContent = `${transfer.progress.toFixed(1)}%`;
      
      const timeEl = doc.getElementById('pip-time');
      if (timeEl) timeEl.textContent = `${formatTime(transfer.remainingTime)} remaining`;
    }
  }, [transfer]);

  const getStatusColor = () => {
    if (isRecovering) return 'bg-[#f43f5e]'; // Rose/Red
    if (isSlow) return 'bg-[#f59e0b]';       // Amber

    switch (transfer.status) {
      case 'completed':
        return 'bg-[#10b981]';
      case 'failed':
      case 'cancelled':
        return 'bg-[#ef4444]';
      case 'paused':
        return 'bg-[#f59e0b]';
      default:
        return 'bg-[#ededed]';
    }
  };

  const getStatusIcon = () => {
    switch (transfer.status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-5 h-5 text-[#ef4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'cancelled':
        return (
          <svg className="w-5 h-5 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        );
      case 'paused':
        return (
          <svg className="w-5 h-5 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <motion.svg
            className="w-5 h-5 text-[#ededed]"
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
      className="bg-[#111] rounded-xl p-4 border border-[#27272a] shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg bg-[#1f1f1f] border border-[#3f3f46] flex items-center justify-center flex-shrink-0`}>
          <svg className="w-5 h-5 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-[#ededed] font-medium truncate">{transfer.fileName}</p>
          <p className="text-[#a1a1aa] text-sm">
            {formatSize(transfer.transferredSize)} / {formatSize(transfer.totalSize)}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {getStatusIcon()}
          
          {/* PiP button */}
          {transfer.status === 'transferring' && typeof window !== 'undefined' && ('documentPictureInPicture' in window) && (
            <button
              onClick={handlePiP}
              className="p-1.5 text-[#a1a1aa] hover:text-[#38bdf8] transition-colors rounded-lg hover:bg-[#38bdf8]/10"
              title="Pop out monitor (Picture-in-Picture)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth={2}/>
                <rect x="12" y="12" width="7" height="6" rx="1" fill="#38bdf8" stroke="none"/>
              </svg>
            </button>
          )}

          {/* Pause button */}
          {transfer.status === 'transferring' && onPause && (
            <button
              onClick={() => onPause(transfer.fileId)}
              className="p-1.5 text-[#a1a1aa] hover:text-[#f59e0b] transition-colors rounded-lg hover:bg-[#f59e0b]/10"
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
              className="p-1.5 text-[#a1a1aa] hover:text-[#10b981] transition-colors rounded-lg hover:bg-[#10b981]/10"
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
              className="p-1.5 text-[#a1a1aa] hover:text-[#ef4444] transition-colors rounded-lg hover:bg-[#ef4444]/10"
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
      <div className="relative h-2 bg-[#27272a] rounded-full overflow-hidden mt-4">
        <motion.div
          className={`absolute inset-y-0 left-0 ${getStatusColor()} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${transfer.progress}%` }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Shimmer effect for active transfers */}
        {transfer.status === 'transferring' && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>

      {/* Stats */}
      {transfer.status === 'transferring' && (
        <div className="flex justify-between mt-2 text-xs text-[#a1a1aa]">
          {isRecovering ? (
            <span className="text-[#f43f5e] animate-pulse">Recovering connection...</span>
          ) : isSlow ? (
            <span className="text-[#f59e0b] drop-shadow-md">{formatSpeed(transfer.speed)} (Slow)</span>
          ) : (
            <span className="text-[#38bdf8] font-mono tracking-wider drop-shadow-[0_0_5px_rgba(56,189,248,0.8)] relative">
              {formatSpeed(transfer.speed)}
              {transfer.speed > 10 * 1024 * 1024 && (
                <span className="absolute -inset-1 bg-[#38bdf8]/20 blur-sm rounded-full -z-10 animate-pulse"></span>
              )}
            </span>
          )}
          <span>{transfer.progress.toFixed(1)}%</span>
          <span>{isRecovering ? '-- remaining' : `${formatTime(transfer.remainingTime)} remaining`}</span>
        </div>
      )}

      {transfer.status === 'paused' && (
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-[#f59e0b]">⏸ Paused</span>
          <span className="text-[#a1a1aa]">{transfer.progress.toFixed(1)}% complete</span>
          <span className="text-[#f59e0b]/70">Click ▶ to resume</span>
        </div>
      )}

      {transfer.status === 'completed' && (
        <p className="mt-2 text-xs text-[#10b981]">✓ Transfer complete!</p>
      )}

      {transfer.status === 'failed' && (
        <p className="mt-2 text-xs text-[#ef4444]">✗ Transfer failed</p>
      )}
    </motion.div>
  );
});

export default TransferProgress;
