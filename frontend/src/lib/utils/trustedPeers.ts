/**
 * Trusted Peers Manager
 * Stores and manages trusted peer fingerprints in localStorage
 */

interface TrustedPeer {
  peerId: string;
  fingerprint: string;
  name: string;
  addedAt: number;
  lastConnected: number;
}

class TrustedPeersManager {
  private peers: Map<string, TrustedPeer> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('lynkless-trusted-peers');
      if (stored) {
        const parsed = JSON.parse(stored) as TrustedPeer[];
        parsed.forEach(p => this.peers.set(p.peerId, p));
      }
    } catch (err) {
      console.warn('[TrustedPeers] Failed to load from storage:', err);
    }
  }

  private saveToStorage(): void {
    try {
      const data = Array.from(this.peers.values());
      localStorage.setItem('lynkless-trusted-peers', JSON.stringify(data));
    } catch (err) {
      console.warn('[TrustedPeers] Failed to save to storage:', err);
    }
  }

  addPeer(peerId: string, fingerprint: string, name: string): void {
    this.peers.set(peerId, {
      peerId,
      fingerprint,
      name,
      addedAt: Date.now(),
      lastConnected: Date.now(),
    });
    this.saveToStorage();
  }

  removePeer(peerId: string): void {
    this.peers.delete(peerId);
    this.saveToStorage();
  }

  isTrusted(peerId: string, fingerprint?: string): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) return false;
    if (fingerprint && peer.fingerprint !== fingerprint) return false;
    return true;
  }

  getPeer(peerId: string): TrustedPeer | undefined {
    return this.peers.get(peerId);
  }

  getAllPeers(): TrustedPeer[] {
    return Array.from(this.peers.values());
  }

  updateLastConnected(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.lastConnected = Date.now();
      this.saveToStorage();
    }
  }
}

let manager: TrustedPeersManager | null = null;

export function getTrustedPeersManager(): TrustedPeersManager {
  if (!manager) {
    manager = new TrustedPeersManager();
  }
  return manager;
}
