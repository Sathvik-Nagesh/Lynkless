'use client';

import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RoomControlsProps {
  roomCode: string | null;
  isInRoom: boolean;
  isCreator: boolean;
  onCreateRoom: (password?: string) => void;
  onJoinRoom: (code: string, password?: string) => void;
  onLeaveRoom: () => void;
  error: string | null;
}

const RoomControls = memo(function RoomControls({
  roomCode,
  isInRoom,
  isCreator,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  error,
}: RoomControlsProps) {
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(() => {
    onCreateRoom(password || undefined);
    setPassword('');
    setMode('idle');
  }, [onCreateRoom, password]);

  const handleJoin = useCallback(() => {
    if (code.trim()) {
      onJoinRoom(code.trim().toUpperCase(), password || undefined);
      setCode('');
      setPassword('');
      setMode('idle');
    }
  }, [onJoinRoom, code, password]);

  const copyRoomCode = useCallback(async () => {
    if (roomCode) {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomCode]);

  const copyShareLink = useCallback(async () => {
    if (roomCode) {
      const url = `${window.location.origin}/room/${roomCode}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomCode]);

  if (isInRoom && roomCode) {
    return (
      <motion.div
        className="panel-elevated p-5"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[#64748B] text-xs mb-1">Room Code</p>
            <div className="flex items-center gap-3">
              <span 
                className="text-2xl font-mono font-semibold tracking-wider gradient-text"
              >
                {roomCode}
              </span>
              {isCreator && (
                <span 
                  className="px-2 py-0.5 text-[10px] rounded-md font-medium"
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1' }}
                >
                  Host
                </span>
              )}
            </div>
          </div>
          
          <motion.button
            onClick={onLeaveRoom}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
            whileHover={{ background: 'rgba(239, 68, 68, 0.15)' }}
            whileTap={{ scale: 0.98 }}
          >
            Leave Room
          </motion.button>
        </div>

        <div className="flex gap-2">
          <motion.button
            onClick={copyRoomCode}
            className="btn-secondary flex-1 py-2.5 text-sm"
            whileHover={{ transform: 'translateY(-1px)' }}
            whileTap={{ transform: 'translateY(0)' }}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" style={{ color: '#22C55E' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Code
              </>
            )}
          </motion.button>
          
          <motion.button
            onClick={copyShareLink}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(34, 211, 238, 0.08)',
              color: '#22D3EE',
              border: '1px solid rgba(34, 211, 238, 0.15)',
            }}
            whileHover={{ background: 'rgba(34, 211, 238, 0.12)', transform: 'translateY(-1px)' }}
            whileTap={{ transform: 'translateY(0)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Link
          </motion.button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="panel-elevated p-5"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
    >
      <AnimatePresence mode="wait">
        {mode === 'idle' ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="space-y-3"
          >
            <motion.button
              onClick={() => setMode('create')}
              className="btn-primary w-full py-3.5 flex items-center justify-center gap-3"
              whileHover={{ transform: 'translateY(-1px)', boxShadow: '0 4px 16px rgba(34, 211, 238, 0.15)' }}
              whileTap={{ transform: 'translateY(0)' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Room
            </motion.button>
            
            <motion.button
              onClick={() => setMode('join')}
              className="btn-secondary w-full py-3.5 flex items-center justify-center gap-3"
              whileHover={{ transform: 'translateY(-1px)' }}
              whileTap={{ transform: 'translateY(0)' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Join Room
            </motion.button>
          </motion.div>
        ) : mode === 'create' ? (
          <motion.div
            key="create"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setMode('idle')}
                className="p-2 text-[#64748B] hover:text-[#E6EDF3] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-base font-semibold text-[#E6EDF3]">Create Room</h3>
            </div>

            <div>
              <label className="block text-xs text-[#64748B] mb-2">Password (optional)</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave empty for open room"
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#E6EDF3] transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <motion.button
              onClick={handleCreate}
              className="btn-primary w-full py-3"
              whileHover={{ transform: 'translateY(-1px)', boxShadow: '0 4px 16px rgba(34, 211, 238, 0.15)' }}
              whileTap={{ transform: 'translateY(0)' }}
            >
              Create Room
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="join"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setMode('idle')}
                className="p-2 text-[#64748B] hover:text-[#E6EDF3] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-base font-semibold text-[#E6EDF3]">Join Room</h3>
            </div>

            <div>
              <label className="block text-xs text-[#64748B] mb-2">Room Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
                maxLength={6}
                className="input w-full text-center text-xl font-mono tracking-[0.3em] uppercase"
              />
            </div>

            <div>
              <label className="block text-xs text-[#64748B] mb-2">Password (if required)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty if none"
                className="input w-full"
              />
            </div>

            <motion.button
              onClick={handleJoin}
              disabled={!code.trim()}
              className="btn-primary w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
              whileHover={code.trim() ? { transform: 'translateY(-1px)', boxShadow: '0 4px 16px rgba(34, 211, 238, 0.15)' } : {}}
              whileTap={code.trim() ? { transform: 'translateY(0)' } : {}}
            >
              Join Room
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error display */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="mt-4 p-3 rounded-lg text-xs flex items-center gap-2"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#EF4444',
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default RoomControls;
