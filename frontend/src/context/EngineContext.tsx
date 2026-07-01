'use client';

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { WebRTCManager } from '@/lib/webrtc/connection';
import { FileTransferManager } from '@/lib/webrtc/fileTransfer';
import { ChatManager } from '@/lib/webrtc/chat';
import { ConnectionQualityManager } from '@/lib/webrtc/connectionQuality';

interface EngineContextType {
  webrtc: WebRTCManager;
  fileTransfer: FileTransferManager;
  chat: ChatManager;
  connectionQuality: ConnectionQualityManager;
}

const EngineContext = createContext<EngineContextType | null>(null);

export const useEngine = () => {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error('useEngine must be used within an EngineProvider');
  }
  return context;
};

export const EngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Bolt: Use useState with initializer for stable, render-safe singleton initialization
  const [engine] = React.useState<EngineContextType>(() => {
    const webrtc = new WebRTCManager();
    const fileTransfer = new FileTransferManager(webrtc);
    const chat = new ChatManager(webrtc);
    const connectionQuality = new ConnectionQualityManager(webrtc);

    return {
      webrtc,
      fileTransfer,
      chat,
      connectionQuality,
    };
  });

  useEffect(() => {
    return () => {
      // Clean up all managers when the engine unmounts
      engine.fileTransfer.destroy();
      engine.chat.destroy();
      engine.connectionQuality.destroy();
      engine.webrtc.destroy();
    };
  }, [engine]);

  return (
    <EngineContext.Provider value={engine}>
      {children}
    </EngineContext.Provider>
  );
};
