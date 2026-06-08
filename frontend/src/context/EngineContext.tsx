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
  const engineRef = useRef<EngineContextType | null>(null);

  if (!engineRef.current) {
    const webrtc = new WebRTCManager();
    const fileTransfer = new FileTransferManager(webrtc);
    const chat = new ChatManager(webrtc);
    const connectionQuality = new ConnectionQualityManager(webrtc);

    engineRef.current = {
      webrtc,
      fileTransfer,
      chat,
      connectionQuality,
    };
  }

  useEffect(() => {
    return () => {
      // Clean up all managers when the engine unmounts
      if (engineRef.current) {
        engineRef.current.fileTransfer.destroy();
        engineRef.current.chat.destroy();
        engineRef.current.connectionQuality.destroy();
        engineRef.current.webrtc.destroy();
      }
    };
  }, []);

  return (
    <EngineContext.Provider value={engineRef.current}>
      {children}
    </EngineContext.Provider>
  );
};
