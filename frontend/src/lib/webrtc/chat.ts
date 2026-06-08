/**
 * P2P Chat Module
 * Handles real-time messaging over WebRTC DataChannel
 */

import { WebRTCManager } from './connection';
import { generateUUID } from '@/lib/utils/crypto';

export interface ChatMessage {
  id: string;
  fromId: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
}

export type ChatMessageHandler = (message: ChatMessage) => void;

interface ChatPayload {
  type: 'chat-message';
  id: string;
  content: string;
  timestamp: number;
}

export class ChatManager {
  private messageHandlers: Set<ChatMessageHandler> = new Set();
  private cleanupHandler: (() => void) | null = null;
  private clientId: string | null = null;

  constructor(private webrtc: WebRTCManager) {
    this.setupDataHandler();
  }

  setClientId(id: string): void {
    this.clientId = id;
  }

  private setupDataHandler(): void {
    this.cleanupHandler = this.webrtc.onData((peerId, data) => {
      if (typeof data === 'string') {
        try {
          const payload = JSON.parse(data) as ChatPayload;
          if (payload.type === 'chat-message') {
            this.handleIncomingMessage(peerId, payload);
          }
        } catch {
          // Not a chat message, ignore
        }
      }
    });
  }

  private handleIncomingMessage(fromId: string, payload: ChatPayload): void {
    const message: ChatMessage = {
      id: payload.id,
      fromId,
      content: payload.content,
      timestamp: payload.timestamp,
      isOwn: false,
    };

    this.messageHandlers.forEach((handler) => handler(message));
  }

  /**
   * Send a chat message to a specific peer
   */
  sendMessage(content: string, peerId: string): ChatMessage {
    const message: ChatMessage = {
      id: generateUUID(),
      fromId: this.clientId || 'unknown',
      content,
      timestamp: Date.now(),
      isOwn: true,
    };

    const payload: ChatPayload = {
      type: 'chat-message',
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
    };

    this.webrtc.sendToPeer(peerId, JSON.stringify(payload));
    return message;
  }

  /**
   * Broadcast a chat message to all connected peers
   */
  broadcastMessage(content: string): ChatMessage {
    const message: ChatMessage = {
      id: generateUUID(),
      fromId: this.clientId || 'unknown',
      content,
      timestamp: Date.now(),
      isOwn: true,
    };

    const payload: ChatPayload = {
      type: 'chat-message',
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
    };

    this.webrtc.broadcast(JSON.stringify(payload));
    return message;
  }

  /**
   * Register message handler
   */
  onMessage(handler: ChatMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupHandler) {
      this.cleanupHandler();
    }
    this.messageHandlers.clear();
  }
}


