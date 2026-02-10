'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getConnectionQualityManager, 
  ConnectionStats 
} from '@/lib/webrtc/connectionQuality';

interface ConnectionQualityIndicatorProps {
  peerId: string;
  compact?: boolean;
}

const QUALITY_COLORS = {
  excellent: '#22c55e', // green
  good: '#84cc16', // lime
  fair: '#eab308', // yellow
  poor: '#ef4444', // red
};

const QUALITY_LABELS = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export default function ConnectionQualityIndicator({
  peerId,
  compact = false,
}: ConnectionQualityIndicatorProps) {
  const [stats, setStats] = useState<ConnectionStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const manager = getConnectionQualityManager();

    // Register stats handler
    const unsubscribe = manager.onStats((newStats) => {
      if (newStats.peerId === peerId) {
        setStats(newStats);
      }
    });

    // Start monitoring
    manager.startMonitoring(peerId, 2000);

    return () => {
      unsubscribe();
      manager.stopMonitoring(peerId);
    };
  }, [peerId]);

  const formatBandwidth = useCallback((bps: number): string => {
    if (bps >= 1_000_000) {
      return `${(bps / 1_000_000).toFixed(1)} Mbps`;
    }
    if (bps >= 1_000) {
      return `${(bps / 1_000).toFixed(0)} Kbps`;
    }
    return `${bps.toFixed(0)} bps`;
  }, []);

  const formatBytes = useCallback((bytes: number): string => {
    if (bytes >= 1_000_000_000) {
      return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
    }
    if (bytes >= 1_000_000) {
      return `${(bytes / 1_000_000).toFixed(2)} MB`;
    }
    if (bytes >= 1_000) {
      return `${(bytes / 1_000).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center gap-1.5 text-gray-500">
        <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
        <span className="text-xs">Measuring...</span>
      </div>
    );
  }

  const qualityColor = QUALITY_COLORS[stats.quality];
  const qualityLabel = QUALITY_LABELS[stats.quality];

  if (compact) {
    return (
      <div 
        className="flex items-center gap-1.5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        title={`${qualityLabel} connection - Click for details`}
      >
        {/* Quality indicator bars */}
        <div className="flex items-end gap-0.5 h-3">
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
                    : '#374151',
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: level * 0.05 }}
            />
          ))}
        </div>
        
        {/* Latency */}
        <span className="text-xs text-gray-400">
          {stats.latency > 0 ? `${stats.latency.toFixed(0)}ms` : '--'}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      className="bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {/* Quality indicator */}
          <div 
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: qualityColor }}
          />
          <span className="text-sm font-medium text-white">{qualityLabel}</span>
          
          {/* Connection type badge */}
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            stats.connectionType === 'direct' 
              ? 'bg-green-500/20 text-green-400' 
              : stats.connectionType === 'relay'
                ? 'bg-orange-500/20 text-orange-400'
                : 'bg-gray-500/20 text-gray-400'
          }`}>
            {stats.connectionType === 'direct' ? 'Direct' : 
             stats.connectionType === 'relay' ? 'Relay' : '--'}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Latency */}
          <div className="text-right">
            <span className="text-sm font-mono text-cyan-400">
              {stats.latency > 0 ? `${stats.latency.toFixed(0)}ms` : '--'}
            </span>
            <span className="text-xs text-gray-500 ml-1">ping</span>
          </div>
          
          {/* Expand icon */}
          <motion.svg 
            className="w-4 h-4 text-gray-400"
            animate={{ rotate: isExpanded ? 180 : 0 }}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-700/50"
          >
            <div className="p-3 space-y-2">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Bandwidth:</span>
                  <span className="text-white font-mono">{formatBandwidth(stats.bandwidth)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Jitter:</span>
                  <span className="text-white font-mono">{stats.jitter.toFixed(1)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Packet Loss:</span>
                  <span className="text-white font-mono">{stats.packetLoss.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Type:</span>
                  <span className="text-white font-mono">{stats.candidateType}</span>
                </div>
              </div>

              {/* Data transferred */}
              <div className="pt-2 border-t border-gray-700/50">
                <div className="flex justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4" />
                    </svg>
                    <span className="text-gray-400">Sent:</span>
                    <span className="text-white font-mono">{formatBytes(stats.bytesSent)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8V20m0 0l4-4m-4 4l-4-4" />
                    </svg>
                    <span className="text-gray-400">Received:</span>
                    <span className="text-white font-mono">{formatBytes(stats.bytesReceived)}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
