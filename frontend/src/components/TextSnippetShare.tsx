'use client';

import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TextSnippetShareProps {
  onSendText: (text: string) => void;
  disabled?: boolean;
}

export const TextSnippetShare = memo(function TextSnippetShare({
  onSendText,
  disabled = false,
}: TextSnippetShareProps) {
  const [text, setText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<'text' | 'code'>('text');

  const handleSend = useCallback(() => {
    if (text.trim() && !disabled) {
      onSendText(text.trim());
      setText('');
      setIsExpanded(false);
    }
  }, [text, disabled, onSendText]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setIsExpanded(false);
    }
  }, [handleSend]);

  return (
    <div className="w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 rounded-xl bg-[#111] border border-[#27272a] hover:bg-[#1f1f1f] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#1f1f1f] border border-[#27272a]">
            <svg className="w-4 h-4 text-[#ededed]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-[#ededed]">Share Text/Code</span>
            <span className="text-xs text-[#71717a] block">Quick snippet sharing</span>
          </div>
        </div>
        <motion.svg
          className="w-4 h-4 text-[#71717a]"
          animate={{ rotate: isExpanded ? 180 : 0 }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2"
          >
            <div className="p-4 rounded-xl bg-[#111] border border-[#27272a] space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('text')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    mode === 'text'
                      ? 'bg-[#ededed] text-black'
                      : 'bg-[#1f1f1f] text-[#a1a1aa] hover:bg-[#27272a]'
                  }`}
                >
                  Text
                </button>
                <button
                  onClick={() => setMode('code')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    mode === 'code'
                      ? 'bg-[#ededed] text-black'
                      : 'bg-[#1f1f1f] text-[#a1a1aa] hover:bg-[#27272a]'
                  }`}
                >
                  Code
                </button>
              </div>

              {mode === 'code' ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Paste your code here..."
                  className="w-full h-32 bg-[#1f1f1f] border border-[#27272a] rounded-lg p-3 text-sm font-mono text-[#ededed] placeholder-[#71717a] focus:outline-none focus:border-[#3f3f46] resize-none"
                  disabled={disabled}
                  maxLength={5000}
                />
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  className="w-full h-24 bg-[#1f1f1f] border border-[#27272a] rounded-lg p-3 text-sm text-[#ededed] placeholder-[#71717a] focus:outline-none focus:border-[#3f3f46] resize-none"
                  disabled={disabled}
                  maxLength={5000}
                />
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#71717a]">
                  {text.length}/5000 • ⌘+Enter to send
                </span>
                <button
                  onClick={handleSend}
                  disabled={disabled || !text.trim()}
                  className="px-4 py-2 bg-[#ededed] text-black font-medium rounded-lg hover:bg-[#d4d4d8] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
