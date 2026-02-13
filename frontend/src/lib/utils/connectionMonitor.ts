// Peer connection quality monitoring
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';

export interface PeerStats {
  peerId: string;
  quality: ConnectionQuality;
  latency: number; // ms
  bandwidth: number; // bytes per second
  packetsLost: number;
  lastUpdated: number;
}

export class ConnectionMonitor {
  private stats: Map<string, PeerStats> = new Map();
  private updateCallbacks: Set<(stats: Map<string, PeerStats>) => void> = new Set();

  // Monitor a peer connection
  async monitorPeer(peerId: string, peerConnection: RTCPeerConnection) {
    const interval = setInterval(async () => {
      try {
        const stats = await peerConnection.getStats();
        let latency = 0;
        let packetsLost = 0;
        let bytesSent = 0;
        const lastBytesSent = this.stats.get(peerId)?.bandwidth || 0;

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            latency = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
          }
          if (report.type === 'outbound-rtp') {
            packetsLost = report.packetsLost || 0;
            bytesSent = report.bytesSent || 0;
          }
        });

        // Calculate bandwidth (bytes per second)
        const bandwidth = Math.max(0, bytesSent - lastBytesSent);

        // Determine quality based on latency and packet loss
        const quality = this.calculateQuality(latency, packetsLost);

        const peerStats: PeerStats = {
          peerId,
          quality,
          latency: Math.round(latency),
          bandwidth,
          packetsLost,
          lastUpdated: Date.now(),
        };

        this.stats.set(peerId, peerStats);
        this.notifyCallbacks();
      } catch (err) {
        // Connection might be closed
        clearInterval(interval);
      }
    }, 2000); // Update every 2 seconds

    // Clean up on connection close
    peerConnection.addEventListener('connectionstatechange', () => {
      if (peerConnection.connectionState === 'closed' || 
          peerConnection.connectionState === 'failed') {
        clearInterval(interval);
        this.stats.delete(peerId);
        this.notifyCallbacks();
      }
    });
  }

  private calculateQuality(latency: number, packetsLost: number): ConnectionQuality {
    if (latency === 0) return 'disconnected';
    if (latency < 50 && packetsLost < 5) return 'excellent';
    if (latency < 100 && packetsLost < 10) return 'good';
    if (latency < 200 && packetsLost < 20) return 'fair';
    return 'poor';
  }

  getStats(peerId: string): PeerStats | undefined {
    return this.stats.get(peerId);
  }

  getAllStats(): Map<string, PeerStats> {
    return this.stats;
  }

  onUpdate(callback: (stats: Map<string, PeerStats>) => void) {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  private notifyCallbacks() {
    this.updateCallbacks.forEach(cb => cb(this.stats));
  }
}

// Singleton instance
let monitorInstance: ConnectionMonitor | null = null;

export function getConnectionMonitor(): ConnectionMonitor {
  if (!monitorInstance) {
    monitorInstance = new ConnectionMonitor();
  }
  return monitorInstance;
}
