'use client';

import { useState, useEffect, memo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransferHistoryEntry, getTransferHistory, clearTransferHistory } from '@/lib/db/transferHistory';

const TransferHistoryPanel = memo(function TransferHistoryPanel() {
  const [history, setHistory] = useState<TransferHistoryEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const loadHistory = useCallback(async () => {
    const data = await getTransferHistory();
    setHistory(data);
  }, []);

  /**
   * Performance optimization: use a Ref to access isExpanded within
   * the polling effect without triggering re-initialization of the interval.
   */
  const isExpandedRef = useRef(isExpanded);
  useEffect(() => {
    isExpandedRef.current = isExpanded;
    if (isExpanded) {
      // Use setTimeout to move the state update out of the render/effect cycle
      // and satisfy the "no-set-state-in-effect" lint rule while preserving functionality.
      setTimeout(loadHistory, 0);
    }
  }, [isExpanded, loadHistory]);

  // Optionally poll or listen for new history items. Simple interval when expanded:
  useEffect(() => {
    const interval = setInterval(() => {
      // Only perform expensive DB reads if the panel is actually active
      if (isExpandedRef.current) {
        loadHistory();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const clearHistory = async () => {
    if (window.confirm('Clear all transfer history?')) {
      await clearTransferHistory();
      setHistory([]);
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatSize = (bytes: number) => {
    if (!isFinite(bytes) || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const totalDataSent = history.filter(h => h.status === 'completed' && h.transferType === 'outgoing').reduce((acc, curr) => acc + curr.totalSize, 0);
  const totalDataReceived = history.filter(h => h.status === 'completed' && h.transferType === 'incoming').reduce((acc, curr) => acc + curr.totalSize, 0);

  return (
    <div className="panel-elevated overflow-hidden flex flex-col mt-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-5 hover:bg-[#1C2433] transition-colors duration-150"
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)' }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-left">
            <span className="font-semibold text-[#E6EDF3] text-base block">Transfer History</span>
            <span className="text-[10px] text-[#64748B]">Recent activity log</span>
          </div>
        </div>
        <motion.svg
          className="w-4 h-4 text-[#64748B]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
            transition={{ duration: 0.15 }}
          >
            <div className="p-4 pt-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
               <div className="flex gap-4">
                 <div className="flex flex-col">
                   <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Total Sent</span>
                   <span className="text-sm font-semibold text-[#60A5FA]">{formatSize(totalDataSent)}</span>
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Total Received</span>
                   <span className="text-sm font-semibold text-[#34D399]">{formatSize(totalDataReceived)}</span>
                 </div>
               </div>
               {history.length > 0 && (
                 <button onClick={clearHistory} className="text-[11px] px-2 py-1 rounded bg-[#EF4444]/10 text-red-500 hover:text-red-400 hover:bg-[#EF4444]/20 transition-all font-medium">
                   Clear History
                 </button>
               )}
            </div>
            <div className="h-64 overflow-y-auto px-4 pb-4 space-y-2 mt-2">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <p className="text-sm text-[#64748B]">No recent transfers</p>
                </div>
              ) : (
                history.map((entry) => (
                  <div key={entry.id} className="flex flex-col p-3 rounded-lg bg-[#0F172A]/50 border border-[#334155]/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[#E6EDF3] truncate max-w-[70%]">
                        {entry.transferType === 'incoming' ? '↓' : '↑'} {entry.fileName}
                      </span>
                      <span className={`text-xs ml-2 font-medium ${
                        entry.status === 'completed' ? 'text-green-400' :
                        entry.status === 'failed' ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1 text-[10px] text-[#94A3B8]">
                      <span>{formatSize(entry.totalSize)}</span>
                      <span>{formatTime(entry.timestamp)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default TransferHistoryPanel;
