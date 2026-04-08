'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  type: 'radar' | 'chat' | 'transfers' | 'history' | 'peers';
  isInRoom?: boolean;
  networkType?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
}

const EMPTY_STATES = {
  radar: {
    default: {
      icon: '📡',
      title: 'Scanning for nearby peers...',
      description: 'Make sure you\'re on the same network as other devices',
    },
    inRoom: {
      icon: '⏳',
      title: 'Waiting for peers to join...',
      description: 'Share your room code to invite others',
    },
    noNetwork: {
      icon: '🌐',
      title: 'No peers detected',
      description: 'Check your network connection or create a room',
    },
  },
  chat: {
    default: {
      icon: '💬',
      title: 'No messages yet',
      description: 'Connect to a peer to start chatting',
    },
    connected: {
      icon: '👋',
      title: 'Say hello!',
      description: 'Messages are ephemeral and encrypted',
    },
  },
  transfers: {
    default: {
      icon: '📂',
      title: 'No active transfers',
      description: 'Drop files to start transferring',
    },
  },
  history: {
    default: {
      icon: '📊',
      title: 'No transfer history',
      description: 'Your completed transfers will appear here',
    },
  },
  peers: {
    default: {
      icon: '🔗',
      title: 'No connected peers',
      description: 'Select a peer from the radar to connect',
    },
  },
};

export const EmptyState = memo(function EmptyState({ 
  type, 
  isInRoom = false, 
  networkType = 'unknown'
}: EmptyStateProps) {
  const states = EMPTY_STATES[type] as { default: { icon: string; title: string; description: string; }; inRoom?: { icon: string; title: string; description: string; }; connected?: { icon: string; title: string; description: string; } };
  const state = type === 'radar' && isInRoom && states.inRoom 
    ? states.inRoom 
    : states.default;

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-8 px-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="text-4xl mb-3 opacity-60">{state.icon}</div>
      <p className="text-sm text-[#a1a1aa] text-center font-medium">{state.title}</p>
      <p className="text-xs text-[#71717a] text-center mt-1">{state.description}</p>
      
      {type === 'radar' && !isInRoom && (
        <div className="mt-4 flex items-center gap-2 text-xs text-[#71717a]">
          <span className="inline-flex items-center gap-1">
            {networkType === 'wifi' && '📶 WiFi'}
            {networkType === 'cellular' && '📱 Cellular'}
            {networkType === 'ethernet' && '🔌 Ethernet'}
            {networkType === 'unknown' && '🌐 Network'}
          </span>
        </div>
      )}
    </motion.div>
  );
});
