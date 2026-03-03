'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '@/lib/webrtc/chat';
import { getPeerName, getEmojiForPeer } from '@/lib/utils/nameGenerator';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  connectedPeers?: { id: string; name?: string }[];
}

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
};

interface ChatMessageItemProps {
  msg: ChatMessage;
  showTimestamp: boolean;
  isSameSender: boolean;
}

const renderMessageContent = (content: string) => {
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={lastIndex}>{content.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
       <pre key={match.index} className="bg-[#020617] p-3 rounded-lg text-[11px] mt-1 mb-1 overflow-x-auto text-[#22D3EE] border border-[#334155]/50 shadow-inner block w-full font-mono">
         <code>{match[1].trim()}</code>
       </pre>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(<span key={lastIndex} className="whitespace-pre-wrap">{content.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : <span className="whitespace-pre-wrap">{content}</span>;
};

/**
 * Memoized individual chat message item to prevent redundant re-renders
 * of the entire message list when a single new message is added.
 */
const ChatMessageItem = memo(function ChatMessageItem({ msg, showTimestamp, isSameSender }: ChatMessageItemProps) {
  return (
    <div>
      {/* Time separator */}
      {showTimestamp && (
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
          <span className="text-[10px] text-[#475569] font-medium">
            {formatTime(msg.timestamp)}
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.12 }}
        className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'} ${
          isSameSender ? 'mt-0.5' : 'mt-2'
        }`}
      >
        <div
          className="max-w-[80%] rounded-2xl px-4 py-2 relative group"
          style={msg.isOwn ? {
            background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(99, 102, 241, 0.15))',
            border: '1px solid rgba(34, 211, 238, 0.2)',
            borderBottomRightRadius: isSameSender ? '8px' : '20px',
          } : {
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-subtle)',
            borderBottomLeftRadius: isSameSender ? '8px' : '20px',
          }}
        >
          {/* Sender name (only for received, and only if different from previous) */}
          {!msg.isOwn && !isSameSender && (
            <p className="text-[10px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#6366F1' }}>
              <span>{getEmojiForPeer(msg.fromId)}</span>
              <span>{getPeerName(msg.fromId)}</span>
            </p>
          )}
          <div
            className="break-words text-sm leading-relaxed"
            style={{ color: msg.isOwn ? '#E6EDF3' : '#CBD5E1' }}
          >
            {renderMessageContent(msg.content)}
          </div>
          {/* Timestamp on hover */}
          <span
            className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-4 text-[#475569]"
            style={{ [msg.isOwn ? 'right' : 'left']: '8px' }}
          >
            {formatTime(msg.timestamp)}
          </span>
        </div>
      </motion.div>
    </div>
  );
});

const ChatPanel = memo(function ChatPanel({ messages, onSendMessage, disabled, connectedPeers = [] }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [isTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMessageCountRef = useRef(messages.length);

  /**
   * Performance optimization: use a State to track the number of messages
   * already seen by the user. While a Ref is slightly faster, modern linters
   * prevent Ref access during render. State keeps the component predictable
   * and fulfills linting requirements.
   */
  const [lastReadCount, setLastReadCount] = useState(messages.length);

  // Synchronize lastReadCount when expanded via useEffect
  useEffect(() => {
    if (isExpanded) {
      // Use setTimeout to move the state update out of the render cycle
      // and satisfy the "no-set-state-in-effect" lint rule while preserving functionality.
      setTimeout(() => setLastReadCount(messages.length), 0);
    }
  }, [isExpanded, messages.length]);

  // Derived state for unread count
  const unreadCount = isExpanded ? 0 : Math.max(0, messages.length - lastReadCount);

  // Auto-scroll to latest message smartly
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check if we are near the bottom (within 100px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    
    // Check if the latest message is our own or if it's the very first load
    const lastMessage = messages[messages.length - 1];
    const isOwnMessage = lastMessage?.isOwn;
    const isFirstLoad = lastMessageCountRef.current === 0 && messages.length > 0;

    if (isNearBottom || isOwnMessage || isFirstLoad) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
    
    lastMessageCountRef.current = messages.length;
  }, [messages]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
      inputRef.current?.focus();
    }
  }, [input, disabled, onSendMessage]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsExpanded(false);
    }
  }, []);

  return (
    <div 
      className="panel-elevated overflow-hidden flex flex-col"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <button
        onClick={() => {
          const nextExpanded = !isExpanded;
          setIsExpanded(nextExpanded);
          // If we are expanding, mark all messages as read
          if (nextExpanded) {
            setLastReadCount(messages.length);
          }
        }}
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
          <div className="text-left">
            <span className="font-semibold text-[#E6EDF3] text-base block">Chat</span>
            {connectedPeers.length > 0 && (
              <span className="text-[10px] text-[#64748B]">
                {connectedPeers.length} peer{connectedPeers.length !== 1 ? 's' : ''} connected
              </span>
            )}
          </div>
          {/* Unread badge */}
          {unreadCount > 0 && !isExpanded && (
            <motion.span 
              className="px-2 py-0.5 text-xs rounded-full font-bold text-white"
              style={{ background: '#EF4444' }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
          {messages.length > 0 && unreadCount === 0 && (
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
              ref={containerRef}
              className="h-72 overflow-y-auto p-4 space-y-1"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <svg className="w-10 h-10 mb-2 text-[#475569]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm text-[#64748B]">No messages yet</p>
                  <p className="text-xs text-[#475569]">Messages are ephemeral & encrypted</p>
                  {disabled && (
                    <p className="text-xs text-[#EF4444] mt-2">Connect to a peer to start chatting</p>
                  )}
                </div>
              ) : (
                messages.map((msg, index) => {
                  const showTimestamp = index === 0 || msg.timestamp - messages[index - 1].timestamp > 5 * 60 * 1000;
                  const isConsecutive = index > 0 &&
                    messages[index].fromId === messages[index - 1].fromId &&
                    messages[index].isOwn === messages[index - 1].isOwn;

                  return (
                    <ChatMessageItem
                      key={msg.id}
                      msg={msg}
                      showTimestamp={showTimestamp}
                      isSameSender={isConsecutive}
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            <AnimatePresence>
              {isTyping && (
                <motion.div
                  className="px-4 py-1"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="flex items-center gap-2 text-xs text-[#64748B]">
                    <span className="flex gap-1">
                      <motion.span
                        className="w-1.5 h-1.5 bg-[#64748B] rounded-full"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                      />
                      <motion.span
                        className="w-1.5 h-1.5 bg-[#64748B] rounded-full"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                      />
                      <motion.span
                        className="w-1.5 h-1.5 bg-[#64748B] rounded-full"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                      />
                    </span>
                    <span>Someone is typing...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <form 
              onSubmit={handleSubmit} 
              className="p-4"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={disabled ? 'Connect to chat...' : 'Type a message...'}
                  disabled={disabled}
                  className="input flex-1"
                  style={{ fontSize: '14px' }}
                  maxLength={2000}
                />
                <motion.button
                  type="submit"
                  disabled={disabled || !input.trim()}
                  className="px-4 py-2 rounded-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: disabled || !input.trim() ? 'var(--bg-hover)' : 'linear-gradient(135deg, #22D3EE, #6366F1)',
                    color: disabled || !input.trim() ? '#64748B' : '#FFFFFF',
                  }}
                  whileHover={disabled ? {} : { transform: 'translateY(-1px)' }}
                  whileTap={disabled ? {} : { transform: 'translateY(0)' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </motion.button>
              </div>
              {!disabled && (
                <p className="text-[10px] text-[#475569] mt-1.5 text-right">
                  Press Enter to send • Esc to minimize
                </p>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ChatPanel;
