'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConnectionDebuggerProps {
  clientId: string | null;
  isSignalingConnected: boolean;
  peers: Array<{ id: string; state: string }>;
  signalingUrl: string;
}

export default function ConnectionDebugger({
  clientId,
  isSignalingConnected,
  peers,
  signalingUrl,
}: ConnectionDebuggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
  };

  const clearLogs = () => setLogs([]);

  const copyDebugInfo = async () => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      clientId,
      signalingConnected: isSignalingConnected,
      signalingUrl,
      peers: peers.map(p => ({ id: p.id, state: p.state })),
      browser: navigator.userAgent,
      protocol: window.location.protocol,
      logs: logs.slice(0, 20),
    };
    
    await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
    addLog('Debug info copied to clipboard');
  };

  if (!isOpen) {
    return (
      <motion.button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center z-40 bg-black/50 border border-[#27272a]"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Connection Debugger"
      >
        <svg className="w-5 h-5" style={{ color: '#ededed' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </motion.button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-4 right-4 w-96 rounded-xl overflow-hidden z-40 shadow-2xl"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          maxHeight: '600px',
        }}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#ededed]">Connection Debugger</h3>
          <div className="flex gap-2">
            <button
              onClick={copyDebugInfo}
              className="p-1.5 text-[#a1a1aa] hover:text-[#ededed] transition-colors"
              title="Copy debug info"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-[#a1a1aa] hover:text-[#ededed] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="p-4 space-y-2 border-b border-[#27272a]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#a1a1aa]">Client ID:</span>
            <code className="text-[#ededed] font-mono">{clientId || 'None'}</code>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#a1a1aa]">Signaling:</span>
            <span className={isSignalingConnected ? 'text-[#10b981]' : 'text-[#ef4444]'}>
              {isSignalingConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#a1a1aa]">Server:</span>
            <code className="text-[#a1a1aa] font-mono text-[10px]">{signalingUrl}</code>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#a1a1aa]">Peers:</span>
            <span className="text-[#ededed]">{peers.length}</span>
          </div>
        </div>

        {/* Peers List */}
        {peers.length > 0 && (
          <div className="p-4 border-b border-[#27272a]">
            <p className="text-xs font-semibold text-[#ededed] mb-2">Active Peers</p>
            <div className="space-y-1">
              {peers.map(peer => (
                <div key={peer.id} className="flex items-center justify-between text-xs">
                  <code className="text-[#a1a1aa] font-mono text-[10px]">{peer.id}</code>
                  <span className={`text-[10px] uppercase ${
                    peer.state === 'connected' ? 'text-[#10b981]' : 
                    peer.state === 'connecting' ? 'text-[#f59e0b]' : 
                    'text-[#a1a1aa]'
                  }`}>
                    {peer.state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logs */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-[#ededed]">Debug Logs</p>
            <button
              onClick={clearLogs}
              className="text-[10px] text-[#a1a1aa] hover:text-[#ededed] transition-colors"
            >
              Clear
            </button>
          </div>
          <div 
            className="h-40 overflow-y-auto rounded-lg p-2 font-mono text-[10px]"
            style={{ background: '#111' }}
          >
            {logs.length === 0 ? (
              <p className="text-[#a1a1aa]">No logs yet...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-[#a1a1aa] mb-1">{log}</div>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-[#27272a] flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="btn-secondary flex-1 py-2 text-xs"
          >
            Reload App
          </button>
          <button
            onClick={() => {
              const keysToClear: string[] = [];
              for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (key && key.startsWith('lynkless-')) {
                  keysToClear.push(key);
                }
              }
              keysToClear.forEach((key) => localStorage.removeItem(key));
              window.location.reload();
            }}
            className="btn-secondary flex-1 py-2 text-xs"
          >
            Reset & Reload
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
