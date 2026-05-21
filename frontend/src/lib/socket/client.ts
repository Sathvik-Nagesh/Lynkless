/**
 * WebSocket client for signaling server communication
 * Production-grade: exponential backoff, message queuing, heartbeat, connection timeout
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
  setUrl: (url: string) => void;
}

const CONNECTION_TIMEOUT_MS = 8000;
const HEARTBEAT_INTERVAL_MS = 25000;
const MAX_RECONNECT_ATTEMPTS = 7;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_QUEUED_MESSAGES = 50;

class SignalingClientImpl implements SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private connectionPromise: Promise<string> | null = null;
  private connectionResolver: ((id: string) => void) | null = null;
  private connectionRejecter: ((error: Error) => void) | null = null;
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: SignalingMessage[] = [];
  private intentionalClose = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<string> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.intentionalClose = false;
    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolver = resolve;
      this.connectionRejecter = reject;
      this.initWebSocket();
    });

    return this.connectionPromise;
  }

  private initWebSocket(): void {
    try {
      let persistentId = 'client_' + Math.random().toString(36).substring(2, 15);
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('lynkless_identity');
        if (stored) {
          persistentId = stored;
        } else {
          localStorage.setItem('lynkless_identity', persistentId);
        }
      }
      
      const urlObj = new URL(this.url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');
      urlObj.searchParams.set('id', persistentId);
      
      this.ws = new WebSocket(urlObj.toString());

      // Connection timeout — reject if server doesn't respond
      this.connectionTimeoutId = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          console.warn('[Signaling] Connection timeout after', CONNECTION_TIMEOUT_MS, 'ms');
          this.ws.close();
          this.ws = null;
          if (this.connectionRejecter && !this.clientId) {
            this.connectionRejecter(new Error('Connection timeout'));
          }
        }
      }, CONNECTION_TIMEOUT_MS);

      this.ws.onopen = () => {
        console.log('[Signaling] Connected to server');
        this.reconnectAttempts = 0;
        this.clearConnectionTimeout();
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as SignalingMessage;
          
          // Handle pong response (heartbeat)
          if (message.type === 'pong') return;

          // Handle connection confirmation
          if (message.type === 'connected' && message.clientId) {
            this.clientId = message.clientId as string;
            console.log('[Signaling] Assigned client ID:', this.clientId);
            if (this.connectionResolver) {
              this.connectionResolver(this.clientId);
            }
            // Flush queued messages
            this.flushMessageQueue();
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
        this.stopHeartbeat();
        this.clearConnectionTimeout();

        if (this.intentionalClose) return;

        // Attempt reconnection with exponential backoff + jitter
        if (event.code !== 1000 && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++;
          const delay = Math.min(
            BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 500,
            MAX_RECONNECT_DELAY_MS
          );
          console.log(`[Signaling] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          this.handlers.forEach((handler) => handler({ type: 'reconnecting', attempt: this.reconnectAttempts }));
          this.reconnectTimeoutId = setTimeout(() => this.initWebSocket(), delay);
        } else {
          if (this.connectionRejecter && !this.clientId) {
            this.connectionRejecter(new Error('Failed to connect to signaling server'));
          }
          this.handlers.forEach((handler) => handler({ type: 'disconnected' }));
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Signaling] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[Signaling] Failed to create WebSocket:', error);
      this.clearConnectionTimeout();
      if (this.connectionRejecter) {
        this.connectionRejecter(error as Error);
      }
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift()!;
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatIntervalId = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearConnectionTimeout();
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.clientId = null;
    this.connectionPromise = null;
    this.messageQueue = [];
  }

  setUrl(url: string): void {
    console.log(`[Signaling] Switching URL to: ${url}`);
    this.url = url;
    this.connectionPromise = null;
    this.connectionResolver = null;
    this.connectionRejecter = null;
    this.reconnectAttempts = 0;
    this.stopHeartbeat();
    this.clearConnectionTimeout();
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'URL switch');
      this.ws = null;
    }
  }

  send(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue messages during reconnection
      if (this.messageQueue.length < MAX_QUEUED_MESSAGES) {
        this.messageQueue.push(message);
      } else {
        console.warn('[Signaling] Message queue full, dropping message:', message.type);
      }
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
    let defaultUrl = 'ws://localhost:8080';
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      defaultUrl = `ws://${window.location.hostname}:8080`;
    }
    const url = process.env.NEXT_PUBLIC_SIGNALING_URL || defaultUrl;
    signalingClient = new SignalingClientImpl(url);
  }
  return signalingClient;
}

export function createSignalingClient(url: string): SignalingClient {
  return new SignalingClientImpl(url);
}
