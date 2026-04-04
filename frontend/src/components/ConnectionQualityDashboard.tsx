'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getConnectionQualityManager, ConnectionStats } from '@/lib/webrtc/connectionQuality';

interface ConnectionQualityDashboardProps {
  peerId: string;
  peerName: string;
}

export const ConnectionQualityDashboard = memo(function ConnectionQualityDashboard({
  peerId,
  peerName,
}: ConnectionQualityDashboardProps) {
  const [stats, setStats] = useState<ConnectionStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const manager = getConnectionQualityManager();

    const unsubscribe = manager.onStats((newStats) => {
      if (newStats.peerId === peerId) {
        setStats(newStats);
      }
    });

    manager.startMonitoring(peerId, 2000);

    return () => {
      unsubscribe();
      manager.stopMonitoring(peerId);
    };
  }, [peerId]);

  const formatBandwidth = useCallback((bps: number): string => {
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
    return `${bps.toFixed(0)} bps`;
  }, []);

  const formatBytes = useCallback((bytes: number): string => {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }, []);

  const qualityColors = {
    excellent: '#22c55e',
    good: '#84cc16',
    fair: '#eab308',
    poor: '#ef4444',
  };

  const qualityLabels = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
  };

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-[#71717a]">
        <div className="w-2 h-2 rounded-full bg-[#71717a] animate-pulse" />
        <span className="text-xs">Measuring connection...</span>
      </div>
    );
  }

  const qualityColor = qualityColors[stats.quality];
  const qualityLabel = qualityLabels[stats.quality];

  return (
    <div className="w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-[#1f1f1f] border border-[#27272a] hover:bg-[#27272a] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-end gap-0.5 h-4">
            {[1, 2, 3, 4].map((level) => (
              <motion.div
                key={level}
                className="w-1 rounded-sm"
                style={{
                  height: `${level * 25}%`,
                  backgroundColor:
                    (stats.quality === 'excellent' && level <= 4) ||
                    (stats.quality === 'good' && level <= 3) ||
                    (stats.quality === 'fair' && level <= 2) ||
                    (stats.quality === 'poor' && level <= 1)
                      ? qualityColor
                      : '#3f3f46',
                }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: level * 0.05 }}
              />
            ))}
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-[#ededed]">{qualityLabel}</span>
            <span className="text-xs text-[#71717a] ml-2">
              {stats.latency > 0 ? `${stats.latency.toFixed(0)}ms` : '--'}
            </span>
          </div>
        </div>
        <motion.svg
          className="w-4 h-4 text-[#71717a]"
          animate={{ rotate: isExpanded ? 180 : 0 }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2"
          >
            <div className="p-4 rounded-xl bg-[#111] border border-[#27272a] space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#71717a] block">Latency</span>
                  <span className="text-[#ededed] font-mono font-medium">
                    {stats.latency > 0 ? `${stats.latency.toFixed(0)}ms` : '--'}
                  </span>
                </div>
                <div>
                  <span className="text-[#71717a] block">Jitter</span>
                  <span className="text-[#ededed] font-mono font-medium">
                    {stats.jitter.toFixed(1)}ms
                  </span>
                </div>
                <div>
                  <span className="text-[#71717a] block">Packet Loss</span>
                  <span className="text-[#ededed] font-mono font-medium">
                    {stats.packetLoss.toFixed(2)}%
                  </span>
                </div>
                <div>
                  <span className="text-[#71717a] block">Bandwidth</span>
                  <span className="text-[#ededed] font-mono font-medium">
                    {formatBandwidth(stats.bandwidth)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#27272a]">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#71717a]">Connection Type</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    stats.connectionType === 'direct'
                      ? 'bg-green-500/10 text-green-400'
                      : stats.connectionType === 'relay'
                      ? 'bg-orange-500/10 text-orange-400'
                      : 'bg-[#27272a] text-[#a1a1aa]'
                  }`}>
                    {stats.connectionType === 'direct' ? 'Direct P2P' : 
                     stats.connectionType === 'relay' ? 'TURN Relay' : 'Unknown'}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#27272a]">
                <div className="flex justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4" />
                    </svg>
                    <span className="text-[#71717a]">Sent:</span>
                    <span className="text-[#ededed] font-mono">{formatBytes(stats.bytesSent)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8V20m0 0l4-4m-4 4l-4-4" />
                    </svg>
                    <span className="text-[#71717a]">Received:</span>
                    <span className="text-[#ededed] font-mono">{formatBytes(stats.bytesReceived)}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
