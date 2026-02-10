/**
 * Connection Quality Utilities
 * Uses WebRTC getStats() API to measure connection quality
 */

import { getWebRTCManager } from './connection';

export interface ConnectionStats {
  peerId: string;
  latency: number; // Round-trip time in ms
  jitter: number; // Jitter in ms
  packetLoss: number; // Packet loss percentage
  bandwidth: number; // Estimated bandwidth in bits per second
  bytesReceived: number;
  bytesSent: number;
  connectionType: 'direct' | 'relay' | 'unknown';
  candidateType: 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown';
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  timestamp: number;
}

export type StatsHandler = (stats: ConnectionStats) => void;

class ConnectionQualityManager {
  private webrtc = getWebRTCManager();
  private statsHandlers: Set<StatsHandler> = new Set();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private previousStats: Map<string, { bytesReceived: number; bytesSent: number; timestamp: number }> = new Map();

  /**
   * Start monitoring connection quality for a peer
   */
  startMonitoring(peerId: string, intervalMs: number = 2000): void {
    // Clear any existing interval
    this.stopMonitoring(peerId);

    // Create new polling interval
    const interval = setInterval(async () => {
      const stats = await this.getStats(peerId);
      if (stats) {
        this.statsHandlers.forEach((handler) => handler(stats));
      }
    }, intervalMs);

    this.pollingIntervals.set(peerId, interval);

    // Get initial stats immediately
    this.getStats(peerId).then((stats) => {
      if (stats) {
        this.statsHandlers.forEach((handler) => handler(stats));
      }
    });
  }

  /**
   * Stop monitoring for a peer
   */
  stopMonitoring(peerId: string): void {
    const interval = this.pollingIntervals.get(peerId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(peerId);
    }
    this.previousStats.delete(peerId);
  }

  /**
   * Get current stats for a peer connection
   */
  async getStats(peerId: string): Promise<ConnectionStats | null> {
    try {
      const peerConnection = this.webrtc.getPeerConnection(peerId);
      if (!peerConnection) {
        return null;
      }

      const stats = await peerConnection.getStats();
      let latency = 0;
      let jitter = 0;
      let packetLoss = 0;
      let bytesReceived = 0;
      let bytesSent = 0;
      let candidateType: ConnectionStats['candidateType'] = 'unknown';
      let connectionType: ConnectionStats['connectionType'] = 'unknown';
      let packetsReceived = 0;
      let packetsLost = 0;

      stats.forEach((report) => {
        // Get candidate pair info for connection type
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime) {
            latency = report.currentRoundTripTime * 1000; // Convert to ms
          }
          if (report.availableOutgoingBitrate) {
            // Use for bandwidth estimation
          }
        }

        // Get local candidate for candidate type
        if (report.type === 'local-candidate') {
          candidateType = report.candidateType || 'unknown';
          if (candidateType === 'relay') {
            connectionType = 'relay';
          } else if (candidateType === 'host' || candidateType === 'srflx' || candidateType === 'prflx') {
            connectionType = 'direct';
          }
        }

        // Get transport stats
        if (report.type === 'transport') {
          bytesReceived = report.bytesReceived || 0;
          bytesSent = report.bytesSent || 0;
        }

        // Get inbound RTP stats for quality metrics
        if (report.type === 'inbound-rtp') {
          if (report.jitter) {
            jitter = report.jitter * 1000; // Convert to ms
          }
          packetsReceived = report.packetsReceived || 0;
          packetsLost = report.packetsLost || 0;
        }
      });

      // Calculate packet loss percentage
      if (packetsReceived + packetsLost > 0) {
        packetLoss = (packetsLost / (packetsReceived + packetsLost)) * 100;
      }

      // Calculate bandwidth based on bytes transferred
      const now = Date.now();
      const prev = this.previousStats.get(peerId);
      let bandwidth = 0;

      if (prev) {
        const timeDiff = (now - prev.timestamp) / 1000; // seconds
        const bytesDiff = (bytesReceived - prev.bytesReceived) + (bytesSent - prev.bytesSent);
        if (timeDiff > 0) {
          bandwidth = (bytesDiff * 8) / timeDiff; // bits per second
        }
      }

      this.previousStats.set(peerId, { bytesReceived, bytesSent, timestamp: now });

      // Determine quality rating
      const quality = this.calculateQuality(latency, jitter, packetLoss);

      return {
        peerId,
        latency: Math.round(latency * 100) / 100,
        jitter: Math.round(jitter * 100) / 100,
        packetLoss: Math.round(packetLoss * 100) / 100,
        bandwidth,
        bytesReceived,
        bytesSent,
        connectionType,
        candidateType,
        quality,
        timestamp: now,
      };
    } catch (error) {
      console.error('[ConnectionQuality] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Calculate quality rating based on metrics
   */
  private calculateQuality(latency: number, jitter: number, packetLoss: number): ConnectionStats['quality'] {
    // Scoring system: lower is better
    let score = 0;

    // Latency scoring
    if (latency < 50) score += 0;
    else if (latency < 100) score += 1;
    else if (latency < 200) score += 2;
    else score += 3;

    // Jitter scoring
    if (jitter < 20) score += 0;
    else if (jitter < 50) score += 1;
    else if (jitter < 100) score += 2;
    else score += 3;

    // Packet loss scoring
    if (packetLoss < 1) score += 0;
    else if (packetLoss < 3) score += 1;
    else if (packetLoss < 5) score += 2;
    else score += 3;

    // Map score to quality
    if (score <= 1) return 'excellent';
    if (score <= 3) return 'good';
    if (score <= 5) return 'fair';
    return 'poor';
  }

  /**
   * Format bandwidth for display
   */
  static formatBandwidth(bitsPerSecond: number): string {
    if (bitsPerSecond >= 1_000_000_000) {
      return `${(bitsPerSecond / 1_000_000_000).toFixed(1)} Gbps`;
    }
    if (bitsPerSecond >= 1_000_000) {
      return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
    }
    if (bitsPerSecond >= 1_000) {
      return `${(bitsPerSecond / 1_000).toFixed(1)} Kbps`;
    }
    return `${bitsPerSecond.toFixed(0)} bps`;
  }

  /**
   * Format bytes for display
   */
  static formatBytes(bytes: number): string {
    if (bytes >= 1_000_000_000) {
      return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
    }
    if (bytes >= 1_000_000) {
      return `${(bytes / 1_000_000).toFixed(2)} MB`;
    }
    if (bytes >= 1_000) {
      return `${(bytes / 1_000).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  }

  /**
   * Register stats handler
   */
  onStats(handler: StatsHandler): () => void {
    this.statsHandlers.add(handler);
    return () => this.statsHandlers.delete(handler);
  }

  /**
   * Cleanup all monitoring
   */
  destroy(): void {
    this.pollingIntervals.forEach((interval) => clearInterval(interval));
    this.pollingIntervals.clear();
    this.previousStats.clear();
    this.statsHandlers.clear();
  }
}

// Singleton instance
let connectionQualityManager: ConnectionQualityManager | null = null;

export function getConnectionQualityManager(): ConnectionQualityManager {
  if (!connectionQualityManager) {
    connectionQualityManager = new ConnectionQualityManager();
  }
  return connectionQualityManager;
}
