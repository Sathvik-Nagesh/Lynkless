/**
 * Adaptive Chunk Sizing
 * Dynamically adjusts chunk size based on connection quality
 */

export interface ChunkSizeConfig {
  chunkSize: number;
  label: string;
  description: string;
}

const CHUNK_CONFIGS: ChunkSizeConfig[] = [
  { chunkSize: 16 * 1024, label: 'Tiny (16KB)', description: 'Very poor connections, high packet loss' },
  { chunkSize: 32 * 1024, label: 'Small (32KB)', description: 'Poor connections, cellular networks' },
  { chunkSize: 64 * 1024, label: 'Medium (64KB)', description: 'Fair connections, standard WiFi' },
  { chunkSize: 128 * 1024, label: 'Large (128KB)', description: 'Good connections, fast WiFi' },
  { chunkSize: 256 * 1024, label: 'Extra Large (256KB)', description: 'Excellent connections, wired/5G' },
];

export function getAdaptiveChunkSize(
  latency: number,
  packetLoss: number,
  bandwidth: number
): number {
  if (latency > 200 || packetLoss > 5) {
    return CHUNK_CONFIGS[0].chunkSize;
  }
  if (latency > 100 || packetLoss > 2) {
    return CHUNK_CONFIGS[1].chunkSize;
  }
  if (latency > 50 || packetLoss > 1) {
    return CHUNK_CONFIGS[2].chunkSize;
  }
  if (bandwidth > 10_000_000) {
    return CHUNK_CONFIGS[4].chunkSize;
  }
  return CHUNK_CONFIGS[3].chunkSize;
}

export function getChunkSizeConfig(chunkSize: number): ChunkSizeConfig {
  return CHUNK_CONFIGS.find(c => c.chunkSize === chunkSize) || CHUNK_CONFIGS[2];
}

export function getAllChunkConfigs(): ChunkSizeConfig[] {
  return CHUNK_CONFIGS;
}
