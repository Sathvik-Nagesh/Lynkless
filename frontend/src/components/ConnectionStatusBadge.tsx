'use client';

import { ConnectionQuality } from '@/lib/utils/connectionMonitor';

interface ConnectionStatusBadgeProps {
  quality: ConnectionQuality;
  latency?: number;
  showDetails?: boolean;
}

export default function ConnectionStatusBadge({ 
  quality, 
  latency, 
  showDetails = false 
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
          <span className="text-[#94A3B8]">{config.text}</span>
          {latency !== undefined && latency > 0 && (
            <span className="text-[#64748B]">({latency}ms)</span>
          )}
        </div>
      )}
    </div>
  );
}
