'use client';

import { memo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransferProgress as TransferProgressType } from '@/lib/webrtc/fileTransfer';

interface TransferProgressProps {
  transfer: TransferProgressType;
  onCancel?: (fileId: string) => void;
  onPause?: (fileId: string) => void;
  onResume?: (fileId: string) => void;
}

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
  const pipWindowRef = useRef<Window | null>(null);

  // Speed math for Liquid Mercury effect
  const maxSpeed = 50 * 1024 * 1024; // 50 MB/s for peak visuals
  const intensity = Math.min(transfer.speed / maxSpeed, 1.0);
  const flowDuration = Math.max(0.3, 2.5 - (intensity * 2.2)); // Speed up flow animation
  const glowOpacity = 0.05 + (intensity * 0.4);
  const glowBlur = 8 + (intensity * 20);

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
          body { background: #000; color: #fff; font-family: system-ui, sans-serif; display: flex; flex-direction: column; justify-content: center; height: 100vh; overflow: hidden; margin: 0; padding: 20px; box-sizing: border-box; }
          .title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;}
          .track { width: 100%; height: 6px; background: #111; border-radius: 3px; overflow: hidden; margin-bottom: 8px; border: 1px solid #222; }
          .bar { height: 100%; background: #3b82f6; border-radius: 3px; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 15px rgba(59,130,246,0.8); }
          .stats { display: flex; justify-content: space-between; font-size: 11px; color: #aaa; font-family: monospace;}
          .speed { color: #3b82f6; font-weight: bold;}
        </style>
      `;

      pipWindow.document.body.innerHTML = `
        <div class="title" id="pip-title">--</div>
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
    } catch (err) {}
  };

  useEffect(() => {
    if (pipWindowRef.current) {
      const doc = pipWindowRef.current.document;
      const titleEl = doc.getElementById('pip-title');
      const barEl = doc.getElementById('pip-bar');
      const speedEl = doc.getElementById('pip-speed');
      const pctEl = doc.getElementById('pip-pct');
      const timeEl = doc.getElementById('pip-time');

      if (titleEl) titleEl.textContent = transfer.fileName;
      if (barEl) barEl.style.width = `${transfer.progress}%`;
      if (speedEl) speedEl.textContent = formatSpeed(transfer.speed);
      if (pctEl) pctEl.textContent = `${transfer.progress.toFixed(1)}%`;
      if (timeEl) timeEl.textContent = formatTime(transfer.remainingTime);
    }
  }, [transfer]);

  return (
    <motion.div
      className="panel-elevated p-5 relative overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      layout
    >
      {/* 120% Mercury: Reactive Background Glow */}
      <AnimatePresence>
        {transfer.status === 'transferring' && (
          <motion.div 
            className="absolute inset-x-0 bottom-0 h-1 bg-[#3b82f6] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: glowOpacity,
              filter: `blur(${glowBlur}px)`,
              height: `${10 + intensity * 30}px`
            }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#000] border border-white/5 flex items-center justify-center shadow-inner">
            <span className="text-xl">
              {transfer.status === 'completed' ? '✅' : 
               transfer.status === 'failed' ? '❌' : 
               transfer.type === 'incoming' ? '📥' : '📤'}
            </span>
          </div>
          <div className="overflow-hidden">
            <h3 className="text-sm font-semibold text-[#ededed] truncate max-w-[180px]">
              {transfer.fileName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px]">
              <span className={transfer.status === 'completed' ? 'text-green-400' : 'text-[#a1a1aa]'}>
                {formatSize(transfer.transferredSize)} / {formatSize(transfer.totalSize)}
              </span>
              {intensity > 0.8 && (
                <span className="text-blue-400 animate-pulse font-bold tracking-tighter">HYPER-MESH</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {transfer.status === 'transferring' && (
             <button onClick={handlePiP} className="btn-icon w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10" title="Pop-out">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
             </button>
          )}
          {transfer.status === 'transferring' && onPause && (
            <button onClick={() => onPause(transfer.fileId)} className="btn-icon w-8 h-8 rounded-lg bg-white/5 hover:bg-yellow-500/10">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              </svg>
            </button>
          )}
          {transfer.status === 'paused' && onResume && (
            <button onClick={() => onResume(transfer.fileId)} className="btn-icon w-8 h-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            </button>
          )}
          <button onClick={() => onCancel?.(transfer.fileId)} className="btn-icon w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/10">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 120% Liquid Mercury Progress Track */}
      <div className="relative h-2 bg-[#000] rounded-full overflow-hidden border border-white/5 mb-4 shadow-inner">
        <motion.div
          className="absolute inset-y-0 left-0 bg-[#3b82f6] shadow-[0_0_15px_rgba(59,130,246,1)]"
          initial={{ width: 0 }}
          animate={{ width: `${transfer.progress}%` }}
          transition={{ type: 'spring', bounce: 0, duration: 0.8 }}
        >
          {/* Surface Flow Pattern */}
          <AnimatePresence>
            {transfer.status === 'transferring' && transfer.speed > 0 && (
              <motion.div 
                className="absolute inset-0 opacity-60"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                }}
                animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
                transition={{ duration: flowDuration, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </AnimatePresence>

          {/* Glowing Mercury Head */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-full bg-white opacity-80 blur-[2px]" />
        </motion.div>
      </div>

      <div className="flex items-center justify-between relative z-10">
        <div className="flex gap-4">
          <div className="flex flex-col">
            <span className="text-[9px] text-[#a1a1aa] uppercase tracking-[0.1em] mb-0.5">Speed</span>
            <span className={`font-mono text-xs font-bold transition-all ${intensity > 0.9 ? 'text-blue-400 scale-110 origin-left text-shadow-glow' : 'text-[#3b82f6]'}`}>
              {formatSpeed(transfer.speed)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-[#a1a1aa] uppercase tracking-[0.1em] mb-0.5">ETA</span>
            <span className="text-[#ededed] font-mono text-xs">{formatTime(transfer.remainingTime)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-[#a1a1aa] uppercase tracking-[0.1em] mb-0.5">Progress</span>
          <span className="text-[#ededed] font-bold text-xs">{transfer.progress.toFixed(1)}%</span>
        </div>
      </div>

      {/* Connection Quality Trace */}
      <div className="mt-4 pt-3 flex items-center justify-between border-t border-white/5">
        <div className="flex items-center gap-1.5 grayscale opacity-50">
           <svg className="w-3 h-3 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
           </svg>
           <span className="text-[9px] text-[#a1a1aa] uppercase font-mono tracking-widest">P2P DATA_PIPE ACTIVE</span>
        </div>
        <span className="text-[9px] font-mono text-[#71717a]">{transfer.peerId?.substring(0, 12)}</span>
      </div>
    </motion.div>
  );
});

export default TransferProgress;
