'use client';

import { motion } from 'framer-motion';
import ConnectionStatusBadge from '@/components/ConnectionStatusBadge';
import { getPeerName, getEmojiForPeer } from '@/lib/utils/nameGenerator';
import type { PeerState } from '@/hooks/useWebRTC';

interface ConnectedPeersPanelProps {
  connectedPeers: PeerState[];
  selectedPeer: string | null;
  onSelectPeer: (peerId: string) => void;
}

export default function ConnectedPeersPanel({
  connectedPeers,
  selectedPeer,
  onSelectPeer,
}: ConnectedPeersPanelProps) {
  if (connectedPeers.length === 0) {
    return null;
  }

  return (
    <motion.div
      className="panel-elevated p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-[#27272a] shadow-sm bg-[#111]"
        >
          <svg className="w-4 h-4 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-[#ededed]">Connected Devices</h2>
          <p className="text-[10px] text-[#a1a1aa]">
            {connectedPeers.length} active connection{connectedPeers.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {connectedPeers.map((peer) => (
          <motion.div
            key={peer.id}
            className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors"
            style={{
              background: selectedPeer === peer.id
                ? 'var(--bg-elevated)'
                : 'transparent',
              border: selectedPeer === peer.id
                ? '1px solid var(--border-default)'
                : '1px solid transparent',
            }}
            onClick={() => onSelectPeer(peer.id)}
            whileHover={{
              background: 'var(--bg-hover)',
            }}
            layout
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{getEmojiForPeer(peer.id)}</span>
              <div>
                <p className="text-sm font-medium text-[#ededed]">
                  {getPeerName(peer.id)}
                </p>
                <p className="text-[10px] text-[#a1a1aa]">
                  {peer.isNearby ? '📡 Local Network' : '🌐 Remote'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ConnectionStatusBadge
                quality="excellent"
                showDetails={true}
              />
              {selectedPeer === peer.id && (
                <span className="text-[10px] text-[#ededed] font-medium">Active</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

