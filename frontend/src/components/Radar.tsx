'use client';

import { useRef, useEffect, useMemo, memo } from 'react';
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
  onUserClick: (userId: string) => void;
  currentUserId: string | null;
  isInRoom: boolean;
  activeTransferPeerIds?: string[];
  peerStates: Map<string, PeerConnectionState>;
}

type NodeState = 'idle' | 'request-sent' | 'request-received' | 'connected' | 'rejected';

// Calculate positions for users - moved outside to avoid recreation
const getUserPosition = (index: number, total: number, radius: number) => {
  const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
  };
};

const Radar = memo(function Radar({
  users,
  nearbyPeers,
  peerStates,
  onUserClick,
  currentUserId,
  isInRoom,
  activeTransferPeerIds = []
}: RadarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const angleRef = useRef(0);

  // Refs for canvas animation loop to access current state
  const nearbyUsersRef = useRef<RadarUser[]>([]);
  const remoteUsersRef = useRef<RadarUser[]>([]);
  const activeTransfersRef = useRef<string[]>([]);

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
      ctx.strokeStyle = '#27272a';
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
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      gradient.addColorStop(0.08, 'rgba(255, 255, 255, 0.03)');
      gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, maxRadius, sweepAngle, sweepAngle + Math.PI * 0.4);
      ctx.closePath();
      ctx.fill();

      // Draw sweep line - subtle
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(sweepAngle) * maxRadius,
        centerY + Math.sin(sweepAngle) * maxRadius
      );
      ctx.stroke();

      // Draw active transferring particles
      const activePeers = activeTransfersRef.current;
      if (activePeers.length > 0) {
        const time = Date.now();
        const nearby = nearbyUsersRef.current;
        const remote = remoteUsersRef.current;

        activePeers.forEach(peerId => {
           let foundPos = null;

           let userIndex = nearby.findIndex(u => u.id === peerId);
           if (userIndex !== -1) {
              const posPercent = getUserPosition(userIndex, Math.max(nearby.length, 1), 40);
              foundPos = { x: (posPercent.x / 100) * size, y: (posPercent.y / 100) * size };
           } else {
              userIndex = remote.findIndex(u => u.id === peerId);
              if (userIndex !== -1) {
                 const posPercent = getUserPosition(userIndex, Math.max(remote.length, 1), 80);
                 foundPos = { x: (posPercent.x / 100) * size, y: (posPercent.y / 100) * size };
              }
           }

           if (foundPos) {
              // Draw subtle connection line
              ctx.beginPath();
              ctx.moveTo(centerX, centerY);
              ctx.lineTo(foundPos.x, foundPos.y);
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
              ctx.lineWidth = 1.5;
              ctx.stroke();

              // Draw 3 glowing flowing packets
              ctx.shadowColor = '#38bdf8';
              for(let i = 0; i < 3; i++) {
                 // Fast continuous flow
                 const progress = ((time / 600) + (i / 3)) % 1;
                 const particleX = centerX + (foundPos.x - centerX) * progress;
                 const particleY = centerY + (foundPos.y - centerY) * progress;
                 
                 ctx.beginPath();
                 ctx.arc(particleX, particleY, 2.5, 0, Math.PI * 2);
                 ctx.fillStyle = `rgba(56, 189, 248, ${1 - progress})`;
                 ctx.shadowBlur = Math.max(5, (1 - progress) * 15);
                 ctx.fill();
              }
              ctx.shadowBlur = 0; // reset
           }
        });
      }

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
          bgColor: '#10b981',
          borderColor: 'transparent',
          shadowColor: 'rgba(16, 185, 129, 0.2)',
          pulse: false,
        };
      case 'request-sent':
        return {
          bgColor: '#3f3f46',
          borderColor: '#52525b',
          shadowColor: 'rgba(255, 255, 255, 0.1)',
          pulse: true,
        };
      case 'request-received':
        return {
          bgColor: '#ededed',
          borderColor: '#ffffff',
          shadowColor: 'rgba(255, 255, 255, 0.2)',
          pulse: true,
        };
      case 'rejected':
        return {
          bgColor: '#3f3f46',
          borderColor: 'transparent',
          shadowColor: 'transparent',
          pulse: false,
        };
      default: // idle
        if (isNearby) {
          return {
            bgColor: '#f59e0b',
            borderColor: 'transparent',
            shadowColor: 'rgba(245, 158, 11, 0.15)',
            pulse: false,
          };
        }
        return {
          bgColor: '#3b82f6',
          borderColor: 'transparent',
          shadowColor: 'rgba(59, 130, 246, 0.15)',
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
  const allNearbyUsers = useMemo(() => {
    const combined = new Map<string, RadarUser>();
    
    // Always show available nearby peers
    nearbyPeers.forEach(p => {
      if (p.id !== currentUserId) {
        combined.set(p.id, { ...p });
      }
    });

    // Include room members that are also nearby
    if (isInRoom) {
      users.forEach(u => {
        if (u.isNearby && u.id !== currentUserId) {
          if (!combined.has(u.id)) {
            combined.set(u.id, { ...u });
          }
        }
      });
    }

    return Array.from(combined.values());
  }, [isInRoom, users, currentUserId, nearbyPeers]);

  const remoteUsers = useMemo(() =>
    users.filter(u => !u.isNearby && u.id !== currentUserId),
  [users, currentUserId]);

  // Keep refs updated for canvas
  useEffect(() => {
    nearbyUsersRef.current = allNearbyUsers;
    remoteUsersRef.current = remoteUsers;
    activeTransfersRef.current = activeTransferPeerIds;
  }, [allNearbyUsers, remoteUsers, activeTransferPeerIds]);

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
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', duration: 0.5 }}
      >
        <div className="relative">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center relative z-20"
            style={{
              background: '#111',
              border: '1px solid #27272a',
              boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
            }}
          >
            <span className="text-[#ededed] font-semibold text-xs tracking-wide">YOU</span>
          </div>
          {/* Subtle pulse ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-[#27272a] z-10"
            animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        {currentUserId && hasAnyPeers && (
          <span className="mt-2 text-[10px] whitespace-nowrap font-medium text-[#10b981] drop-shadow-md flex items-center gap-1">
            <span>{getEmojiForPeer(currentUserId)}</span>
            <span>{getPeerName(currentUserId).slice(0, 12)} ({currentUserId.replace('client_', '').substring(0, 6).toUpperCase()})</span>
          </span>
        )}
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
                  ? (getNodeState(user.id) === 'connected' ? '#10b981' :
                    getNodeState(user.id) === 'request-sent' ? '#a1a1aa' :
                      getNodeState(user.id) === 'request-received' ? '#ededed' : '#71717a')
                  : '#f59e0b'
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
                  ? (getNodeState(user.id) === 'connected' ? '#10b981' :
                    getNodeState(user.id) === 'request-sent' ? '#a1a1aa' :
                      getNodeState(user.id) === 'request-received' ? '#ededed' : '#71717a')
                  : '#3b82f6'
              }}
            >
              <span>{getEmojiForPeer(user.id)}</span>
              <span>{stateLabel || getPeerName(user.id).slice(0, 12)}</span>
            </motion.span>
          </motion.button>
        );
      })}

      {/* Empty state message - Contextual Onboarding */}
      {!hasAnyPeers && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-20 flex flex-col items-center gap-5 pointer-events-auto"
          >
             <div className="flex flex-col items-center">
               <p className="text-[#ededed] text-sm font-bold text-center">
                {isInRoom ? 'Awaiting peers...' : 'No one nearby.'}
              </p>
              <p className="text-[#71717a] text-[11px] text-center max-w-[180px] mt-1 leading-tight">
                {isInRoom ? 'Share your room code with others to start transferring.' : 'Share this private link to invite someone to your direct channel.'}
              </p>
             </div>
             <button 
               onClick={() => {
                 const url = window.location.href;
                 navigator.clipboard.writeText(url);
                 // We can't easily trigger the toast from here without passing it as prop, 
                 // but we can change the text temporarily
                 const btn = document.activeElement as HTMLButtonElement;
                 if (btn) {
                   const original = btn.innerText;
                   btn.innerText = 'Copied!';
                   btn.style.borderColor = '#10b981';
                   btn.style.color = '#10b981';
                   setTimeout(() => {
                     btn.innerText = original;
                     btn.style.borderColor = '';
                     btn.style.color = '';
                   }, 2000);
                 }
               }}
               className="px-5 py-2 bg-[#ededed] text-black rounded-full text-[11px] font-black hover:bg-[#d4d4d8] transition-all active:scale-95 shadow-lg shadow-blue-500/10"
             >
               INVITE FRIEND
             </button>
          </motion.div>
        </div>
      )}

      {/* Legend - cleaner design */}
      <div className="absolute bottom-1 left-3 flex items-center gap-3 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
          <span className="text-[#a1a1aa]">Local</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
          <span className="text-[#a1a1aa]">Remote</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
          <span className="text-[#a1a1aa]">Connected</span>
        </div>
      </div>
    </div>
  );
});

export default Radar;
