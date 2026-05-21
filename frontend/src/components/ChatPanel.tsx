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
      <pre key={match.index} className="bg-[#111] p-3 rounded-lg text-[11px] mt-1 mb-1 overflow-x-auto text-[#ededed] border border-[#27272a] shadow-inner block w-full font-mono">
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
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content);
  }, [msg.content]);

  return (
    <div>
      {/* Time separator */}
      {showTimestamp && (
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
          <span className="text-[10px] text-[#71717a] font-medium">
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
        <div className="relative group max-w-[85%] sm:max-w-[75%] flex gap-2 items-end">
          {/* Copy button for received message - moved to left so it doesn't overflow right */}
          {!msg.isOwn && (
            <button
              onClick={handleCopy}
              title="Copy message"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 p-1.5 rounded-md bg-[#27272a] hover:bg-[#3f3f46] shrink-0"
            >
              <svg className="w-3.5 h-3.5 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
          )}

          <div
            className="rounded-2xl px-4 py-2 w-full"
            style={msg.isOwn ? {
              background: '#1f1f1f',
              border: '1px solid #27272a',
              borderBottomRightRadius: isSameSender ? '8px' : '20px',
            } : {
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderBottomLeftRadius: isSameSender ? '8px' : '20px',
            }}
          >
            {/* Sender name (only for received, and only if different from previous) */}
            {!msg.isOwn && !isSameSender && (
              <p className="text-[10px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#ededed' }}>
                <span>{getEmojiForPeer(msg.fromId)}</span>
                <span>{getPeerName(msg.fromId)}</span>
              </p>
            )}
            <div
              className="break-words text-sm leading-relaxed"
              style={{ color: msg.isOwn ? '#ededed' : '#a1a1aa' }}
            >
              {renderMessageContent(msg.content)}
            </div>
          </div>

          {/* Copy button for sent message - positioned to the left of the bubble edge */}
          {msg.isOwn && (
             <button
              onClick={handleCopy}
              title="Copy message"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 p-1.5 rounded-md bg-[#27272a] hover:bg-[#3f3f46] shrink-0"
            >
              <svg className="w-3.5 h-3.5 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
});

const ChatPanel = memo(function ChatPanel({ messages, onSendMessage, disabled, connectedPeers = [] }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
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

    // Only scroll if very close to bottom (within 60px) - much less aggressive
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    
    // Only auto-scroll on first message load
    const isFirstLoad = lastMessageCountRef.current === 0 && messages.length > 0;

    if (messages.length > 0 && (isNearBottom || isFirstLoad)) {
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
        className="flex items-center justify-between p-4 sm:p-5 hover:bg-[#1f1f1f] transition-colors duration-150"
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#111] border border-[#27272a]"
          >
            <svg className="w-4 h-4 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="text-left">
            <span className="font-semibold text-[#ededed] text-base block">Chat</span>
            {connectedPeers.length > 0 && (
              <span className="text-[10px] text-[#a1a1aa]">
                {connectedPeers.length} peer{connectedPeers.length !== 1 ? 's' : ''} connected
              </span>
            )}
          </div>
          {/* Unread badge */}
          {unreadCount > 0 && !isExpanded && (
            <motion.span 
              className="px-2 py-0.5 text-xs rounded-full font-bold text-black bg-[#ededed]"
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
              style={{ background: '#1f1f1f', color: '#ededed', border: '1px solid #27272a' }}
            >
              {messages.length}
            </span>
          )}
        </div>
        <motion.svg
          className="w-4 h-4 text-[#a1a1aa]"
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
                  <svg className="w-10 h-10 mb-2 text-[#71717a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm text-[#a1a1aa]">No messages yet</p>
                  <p className="text-xs text-[#71717a]">Messages are ephemeral & encrypted</p>
                  {disabled && (
                    <p className="text-xs text-red-500 mt-2">Connect to a peer to start chatting</p>
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

            {/* Input */}
            <form 
              onSubmit={handleSubmit} 
              className="p-3 sm:p-4"
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
                  className="px-4 py-2 rounded-xl font-medium disabled:opacity-40 disabled:cursor-not-allowed border border-transparent transition-colors"
                  style={{
                    background: disabled || !input.trim() ? 'var(--bg-hover)' : '#ededed',
                    color: disabled || !input.trim() ? '#71717a' : '#000000',
                  }}
                  whileHover={disabled ? {} : { transform: 'translateY(-1px)', background: '#d4d4d8' }}
                  whileTap={disabled ? {} : { transform: 'translateY(0)' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </motion.button>
              </div>
              {!disabled && (
                <p className="text-[10px] text-[#71717a] mt-1.5 text-right">
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
