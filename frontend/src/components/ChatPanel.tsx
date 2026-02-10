'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '@/lib/webrtc/chat';
import { getPeerName, getEmojiForPeer } from '@/lib/utils/nameGenerator';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

export default function ChatPanel({ messages, onSendMessage, disabled }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div 
      className="panel-elevated overflow-hidden flex flex-col"
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-5 hover:bg-[#1C2433] transition-colors duration-150"
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)' }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="font-semibold text-[#E6EDF3] text-base">Chat</span>
          {messages.length > 0 && (
            <span 
              className="px-2 py-0.5 text-xs rounded-md font-medium"
              style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1' }}
            >
              {messages.length}
            </span>
          )}
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
            {/* Messages */}
            <div 
              className="h-64 overflow-y-auto p-4 space-y-3"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <svg className="w-10 h-10 mb-2 text-[#475569]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm text-[#64748B]">No messages yet</p>
                  <p className="text-xs text-[#475569]">Messages are ephemeral</p>
                </div>
              ) : (
                messages.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.15 }}
                    className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-[80%] rounded-xl px-4 py-2"
                      style={msg.isOwn ? {
                        background: 'rgba(34, 211, 238, 0.12)',
                        border: '1px solid rgba(34, 211, 238, 0.2)',
                      } : {
                        background: 'var(--bg-hover)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {!msg.isOwn && (
                        <p className="text-[9px] font-medium mb-1 flex items-center gap-1" style={{ color: '#6366F1' }}>
                          <span>{getEmojiForPeer(msg.fromId)}</span>
                          <span>{getPeerName(msg.fromId)}</span>
                        </p>
                      )}
                      <p 
                        className="break-words text-sm"
                        style={{ color: msg.isOwn ? '#E6EDF3' : '#94A3B8' }}
                      >
                        {msg.content}
                      </p>
                      <p 
                        className="text-[10px] mt-1"
                        style={{ color: msg.isOwn ? '#22D3EE' : '#64748B' }}
                      >
                        {formatTime(msg.timestamp)}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form 
              onSubmit={handleSubmit} 
              className="p-4"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={disabled ? 'Connect to chat' : 'Type a message...'}
                  disabled={disabled}
                  className="input flex-1"
                  style={{ fontSize: '14px' }}
                />
                <motion.button
                  type="submit"
                  disabled={disabled || !input.trim()}
                  className="px-4 py-2 rounded-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: disabled || !input.trim() ? 'var(--bg-hover)' : '#22D3EE',
                    color: disabled || !input.trim() ? '#64748B' : '#0B0F14',
                  }}
                  whileHover={disabled ? {} : { transform: 'translateY(-1px)' }}
                  whileTap={disabled ? {} : { transform: 'translateY(0)' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </motion.button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
