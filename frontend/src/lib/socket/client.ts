/**
 * WebSocket client for signaling server communication
 */

export type MessageHandler = (message: SignalingMessage) => void;

export interface SignalingMessage {
  type: string;
  [key: string]: unknown;
}

export interface SignalingClient {
  connect: () => Promise<string>;
  disconnect: () => void;
  send: (message: SignalingMessage) => void;
  on: (handler: MessageHandler) => () => void;
  isConnected: () => boolean;
  getClientId: () => string | null;
}

class SignalingClientImpl implements SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private connectionPromise: Promise<string> | null = null;
  private connectionResolver: ((id: string) => void) | null = null;
  private connectionRejecter: ((error: Error) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<string> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolver = resolve;
      this.connectionRejecter = reject;
      this.initWebSocket();
    });

    return this.connectionPromise;
  }

  private initWebSocket(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Signaling] Connected to server');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as SignalingMessage;
          
          // Handle connection confirmation
          if (message.type === 'connected' && message.clientId) {
            this.clientId = message.clientId as string;
            console.log('[Signaling] Assigned client ID:', this.clientId);
            if (this.connectionResolver) {
              this.connectionResolver(this.clientId);
            }
          }

          // Broadcast to all handlers
          this.handlers.forEach((handler) => handler(message));
        } catch (error) {
          console.error('[Signaling] Failed to parse message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[Signaling] Connection closed:', event.code, event.reason);
        this.ws = null;

        // Attempt reconnection if not intentional close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[Signaling] Reconnecting... Attempt ${this.reconnectAttempts}`);
          setTimeout(() => this.initWebSocket(), this.reconnectDelay * this.reconnectAttempts);
        } else if (this.connectionRejecter && !this.clientId) {
          this.connectionRejecter(new Error('Failed to connect to signaling server'));
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Signaling] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[Signaling] Failed to create WebSocket:', error);
      if (this.connectionRejecter) {
        this.connectionRejecter(error as Error);
      }
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.clientId = null;
    this.connectionPromise = null;
  }

  send(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[Signaling] Cannot send message - not connected');
    }
  }

  on(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getClientId(): string | null {
    return this.clientId;
  }
}

// Singleton instance
let signalingClient: SignalingClient | null = null;

export function getSignalingClient(): SignalingClient {
  if (!signalingClient) {
    const url = process.env.NEXT_PUBLIC_SIGNALING_URL || 'ws://localhost:8080';
    signalingClient = new SignalingClientImpl(url);
  }
  return signalingClient;
}

export function createSignalingClient(url: string): SignalingClient {
  return new SignalingClientImpl(url);
}
