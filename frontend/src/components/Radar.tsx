'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PeerConnectionState } from '@/hooks/useSignaling';
import { getPeerName, getEmojiForPeer } from '@/lib/utils/nameGenerator';

interface RadarUser {
  id: string;
  isNearby: boolean;
  isCreator?: boolean;
  isSelf?: boolean;
  isLocal?: boolean;
}

interface RadarProps {
  users: RadarUser[];
  nearbyPeers: RadarUser[];
  peerStates: Map<string, PeerConnectionState>;
  onUserClick: (userId: string) => void;
  currentUserId: string | null;
  isInRoom: boolean;
}

type NodeState = 'idle' | 'request-sent' | 'request-received' | 'connected' | 'rejected';

export default function Radar({
  users,
  nearbyPeers,
  peerStates,
  onUserClick,
  currentUserId,
  isInRoom
}: RadarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const angleRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const size = Math.min(canvas.parentElement?.clientWidth || 400, 400);
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const maxRadius = size / 2 - 20;

    const drawRadar = () => {
      ctx.clearRect(0, 0, size, size);

      // Draw background circles - thin, subtle lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;

      // Inner circle (nearby)
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius * 0.4, 0, Math.PI * 2);
      ctx.stroke();

      // Middle circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius * 0.7, 0, Math.PI * 2);
      ctx.stroke();

      // Outer circle (remote)
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
          centerX + Math.cos(angle) * maxRadius,
          centerY + Math.sin(angle) * maxRadius
        );
        ctx.stroke();
      }

      // Draw radar sweep - subtle gradient
      const sweepAngle = angleRef.current;
      const gradient = ctx.createConicGradient(sweepAngle, centerX, centerY);
      gradient.addColorStop(0, 'rgba(34, 211, 238, 0.12)');
      gradient.addColorStop(0.08, 'rgba(34, 211, 238, 0.04)');
      gradient.addColorStop(0.15, 'rgba(34, 211, 238, 0)');
      gradient.addColorStop(1, 'rgba(34, 211, 238, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, maxRadius, sweepAngle, sweepAngle + Math.PI * 0.4);
      ctx.closePath();
      ctx.fill();

      // Draw sweep line - subtle
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(sweepAngle) * maxRadius,
        centerY + Math.sin(sweepAngle) * maxRadius
      );
      ctx.stroke();

      // Update angle for animation (slower rotation)
      angleRef.current += 0.015;

      animationRef.current = requestAnimationFrame(drawRadar);
    };

    drawRadar();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Get node state for a user
  const getNodeState = (userId: string): NodeState => {
    const peerState = peerStates.get(userId);
    return peerState?.state || 'idle';
  };

  // Get node styles based on state - cleaner, less saturated
  const getNodeStyles = (userId: string, isNearby: boolean): {
    bgColor: string;
    borderColor: string;
    shadowColor: string;
    pulse: boolean;
  } => {
    const state = getNodeState(userId);

    switch (state) {
      case 'connected':
        return {
          bgColor: '#22C55E',
          borderColor: 'rgba(34, 197, 94, 0.3)',
          shadowColor: 'rgba(34, 197, 94, 0.2)',
          pulse: false,
        };
      case 'request-sent':
        return {
          bgColor: '#22D3EE',
          borderColor: 'rgba(34, 211, 238, 0.3)',
          shadowColor: 'rgba(34, 211, 238, 0.2)',
          pulse: true,
        };
      case 'request-received':
        return {
          bgColor: '#F472B6',
          borderColor: 'rgba(244, 114, 182, 0.3)',
          shadowColor: 'rgba(244, 114, 182, 0.2)',
          pulse: true,
        };
      case 'rejected':
        return {
          bgColor: '#64748B',
          borderColor: 'rgba(100, 116, 139, 0.3)',
          shadowColor: 'transparent',
          pulse: false,
        };
      default: // idle
        if (isNearby) {
          return {
            bgColor: '#F59E0B',
            borderColor: 'rgba(245, 158, 11, 0.3)',
            shadowColor: 'rgba(245, 158, 11, 0.15)',
            pulse: false,
          };
        }
        return {
          bgColor: '#6366F1',
          borderColor: 'rgba(99, 102, 241, 0.3)',
          shadowColor: 'rgba(99, 102, 241, 0.15)',
          pulse: false,
        };
    }
  };

  // Get state label
  const getStateLabel = (userId: string): string | null => {
    const state = getNodeState(userId);
    switch (state) {
      case 'connected':
        return 'Connected';
      case 'request-sent':
        return 'Pending...';
      case 'request-received':
        return 'Incoming!';
      case 'rejected':
        return 'Declined';
      default:
        return null;
    }
  };

  // Combine room users and nearby peers (without duplicates)
  const allNearbyUsers = isInRoom
    ? users.filter(u => u.isNearby && u.id !== currentUserId)
    : nearbyPeers.filter(u => u.id !== currentUserId);

  const remoteUsers = users.filter(u => !u.isNearby && u.id !== currentUserId);

  // Calculate positions for users
  const getUserPosition = (index: number, total: number, radius: number) => {
    const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
    return {
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
    };
  };

  const hasAnyPeers = allNearbyUsers.length > 0 || remoteUsers.length > 0;

  return (
    <div className="relative w-full max-w-[400px] aspect-square mx-auto">
      {/* Canvas radar animation */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Center node (current user) - cleaner design */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', duration: 0.5 }}
      >
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #22D3EE 0%, #6366F1 100%)',
            boxShadow: '0 0 20px rgba(34, 211, 238, 0.2)',
          }}
        >
          <span className="text-white font-semibold text-xs tracking-wide">YOU</span>
        </div>
        {/* Subtle pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full border border-cyan-400/30"
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* Nearby users (inner circle) */}
      {allNearbyUsers.map((user, index) => {
        const pos = getUserPosition(index, allNearbyUsers.length, 18);
        const styles = getNodeStyles(user.id, true);
        const stateLabel = getStateLabel(user.id);

        return (
          <motion.button
            key={user.id}
            className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            onClick={() => onUserClick(user.id)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <div
              className="relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150"
              style={{
                backgroundColor: styles.bgColor,
                boxShadow: `0 0 12px ${styles.shadowColor}`,
              }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>

              {/* Subtle pulse for pending states */}
              {styles.pulse && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: `1px solid ${styles.bgColor}` }}
                  animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
            </div>

            <motion.span
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1"
              style={{
                color: stateLabel
                  ? (getNodeState(user.id) === 'connected' ? '#22C55E' :
                    getNodeState(user.id) === 'request-sent' ? '#22D3EE' :
                      getNodeState(user.id) === 'request-received' ? '#F472B6' : '#94A3B8')
                  : '#F59E0B'
              }}
            >
              <span>{getEmojiForPeer(user.id)}</span>
              <span>{stateLabel || getPeerName(user.id).slice(0, 12)}</span>
            </motion.span>
          </motion.button>
        );
      })}

      {/* Remote users (outer circle) */}
      {remoteUsers.map((user, index) => {
        const pos = getUserPosition(index, remoteUsers.length, 38);
        const styles = getNodeStyles(user.id, false);
        const stateLabel = getStateLabel(user.id);

        return (
          <motion.button
            key={user.id}
            className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 + 0.2, duration: 0.3 }}
            onClick={() => onUserClick(user.id)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <div
              className="relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150"
              style={{
                backgroundColor: styles.bgColor,
                boxShadow: `0 0 10px ${styles.shadowColor}`,
              }}
            >
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>

              {/* Subtle pulse for pending states */}
              {styles.pulse && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: `1px solid ${styles.bgColor}` }}
                  animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
            </div>

            <motion.span
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1"
              style={{
                color: stateLabel
                  ? (getNodeState(user.id) === 'connected' ? '#22C55E' :
                    getNodeState(user.id) === 'request-sent' ? '#22D3EE' :
                      getNodeState(user.id) === 'request-received' ? '#F472B6' : '#94A3B8')
                  : '#6366F1'
              }}
            >
              <span>{getEmojiForPeer(user.id)}</span>
              <span>{stateLabel || getPeerName(user.id).slice(0, 12)}</span>
            </motion.span>
          </motion.button>
        );
      })}

      {/* Empty state message */}
      {!hasAnyPeers && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[#64748B] text-sm text-center mt-20">
            {isInRoom ? 'Waiting for peers to join...' : 'Scanning for nearby peers...'}
          </p>
        </div>
      )}

      {/* Legend - cleaner design */}
      <div className="absolute bottom-1 left-3 flex items-center gap-3 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
          <span className="text-[#64748B]">Local</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6366F1' }} />
          <span className="text-[#64748B]">Remote</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22C55E' }} />
          <span className="text-[#64748B]">Connected</span>
        </div>
      </div>
    </div>
  );
}
