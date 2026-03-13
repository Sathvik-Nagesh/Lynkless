'use client';

import { memo } from 'react';
import { ConnectionQuality } from '@/lib/utils/connectionMonitor';

interface ConnectionStatusBadgeProps {
  quality: ConnectionQuality;
  latency?: number;
  showDetails?: boolean;
  isRelay?: boolean;
}

const ConnectionStatusBadge = memo(function ConnectionStatusBadge({
  quality, 
  latency, 
  showDetails = false,
  isRelay = false
}: ConnectionStatusBadgeProps) {
  const getQualityConfig = (q: ConnectionQuality) => {
    switch (q) {
      case 'excellent':
        return {
          color: 'bg-green-500',
          text: 'Excellent',
          icon: '⚡',
          pulse: true,
        };
      case 'good':
        return {
          color: 'bg-blue-500',
          text: 'Good',
          icon: '✓',
          pulse: false,
        };
      case 'fair':
        return {
          color: 'bg-yellow-500',
          text: 'Fair',
          icon: '~',
          pulse: false,
        };
      case 'poor':
        return {
          color: 'bg-orange-500',
          text: 'Poor',
          icon: '!',
          pulse: true,
        };
      case 'disconnected':
        return {
          color: 'bg-red-500',
          text: 'Disconnected',
          icon: '✕',
          pulse: true,
        };
    }
  };

  const config = getQualityConfig(quality);

  return (
    <div className="flex items-center gap-2">
      {/* Status Dot */}
      <div className="relative">
        <div className={`w-2 h-2 rounded-full ${config.color}`} />
        {config.pulse && (
          <div className={`absolute inset-0 w-2 h-2 rounded-full ${config.color} animate-ping opacity-75`} />
        )}
      </div>

      {/* Details */}
      {showDetails && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#a1a1aa]">{config.text}</span>
          {latency !== undefined && latency > 0 && (
            <span className="text-[#71717a]">({latency}ms)</span>
          )}
          {isRelay && (
            <span 
              className="text-[#f59e0b] bg-[#f59e0b20] px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold group cursor-help relative"
              title="Direct connection blocked by firewall. Speeds may be limited by Relay Server."
            >
              Relay
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default ConnectionStatusBadge;
