/**
 * Connection Fingerprint Utility
 * 
 * Generates a SHA-256 based fingerprint from WebRTC SDP data
 * for verifying peer-to-peer connection authenticity.
 */

/**
 * Generate SHA-256 hash of input string
 * Browser-safe implementation with fallback
 */
async function sha256(message: string): Promise<string> {
  // Check if running in browser with crypto.subtle support
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[Fingerprint] crypto.subtle failed, using fallback:', e);
    }
  }
  
  // Fallback: Deterministic hash for SSR or browsers without crypto.subtle
  // Use a simple but deterministic algorithm
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  
  for (let i = 0; i < message.length; i++) {
    const ch = message.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  // Create 64-char hex string from the two 32-bit hashes
  const hash1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hash2 = (h2 >>> 0).toString(16).padStart(8, '0');
  
  // Repeat to fill 64 characters
  let result = hash1 + hash2 + hash1 + hash2;
  while (result.length < 64) {
    result += hash1 + hash2;
  }
  
  return result.slice(0, 64);
}

/**
 * Convert hash to human-readable 12-character fingerprint
 * Format: XX-XX-XX-XX-XX-XX (6 pairs)
 */
function formatFingerprint(hash: string): string {
  // Take first 12 hex characters (6 bytes) and format as pairs
  const pairs: string[] = [];
  for (let i = 0; i < 12; i += 2) {
    pairs.push(hash.substring(i, i + 2).toUpperCase());
  }
  return pairs.join('-');
}

/**
 * Generate connection fingerprint from SDP offer and answer
 * IMPORTANT: This must be symmetric - both peers should generate the same fingerprint
 */
export async function generateFingerprint(
  offer: RTCSessionDescriptionInit,
  answer: RTCSessionDescriptionInit,
  iceCandidates: RTCIceCandidate[]
): Promise<string> {
  // Combine SDP data
  const offerSdp = offer.sdp || '';
  const answerSdp = answer.sdp || '';
  
  // Extract key fingerprint data from SDPs (ice-ufrag, ice-pwd, fingerprint lines)
  const offerFingerprint = extractSdpFingerprint(offerSdp);
  const answerFingerprint = extractSdpFingerprint(answerSdp);
  
  // IMPORTANT: Sort fingerprints to ensure both peers generate the same value
  // regardless of who is the offerer or answerer
  const sortedFingerprints = [offerFingerprint, answerFingerprint].sort();
  
  // Combine ICE candidate data
  const candidateData = iceCandidates
    .map(c => c.candidate)
    .sort() // Sort for consistency
    .join('|');
  
  // Create combined data string with sorted fingerprints
  const combinedData = `${sortedFingerprints[0]}:${sortedFingerprints[1]}:${candidateData}`;
  
  // Generate hash
  const hash = await sha256(combinedData);
  
  // Format as human-readable fingerprint
  return formatFingerprint(hash);
}

/**
 * Extract fingerprint-relevant data from SDP
 * IMPORTANT: Only extract data that will be identical on both peers!
 */
function extractSdpFingerprint(sdp: string): string {
  const lines = sdp.split('\r\n');
  const relevantLines: string[] = [];
  
  for (const line of lines) {
    // ONLY extract DTLS fingerprint (sha-256 hash of certificate)
    // This is the same on both peers and uniquely identifies the connection
    // DO NOT use ice-ufrag or ice-pwd as they differ between peers
    if (line.startsWith('a=fingerprint:')) {
      relevantLines.push(line);
    }
  }
  
  return relevantLines.sort().join('|');
}

/**
 * Simple fingerprint for display (from just offer/answer)
 */
export async function generateSimpleFingerprint(
  localSdp: string,
  remoteSdp: string
): Promise<string> {
  const localFingerprint = extractSdpFingerprint(localSdp);
  const remoteFingerprint = extractSdpFingerprint(remoteSdp);
  
  // Combine in consistent order (alphabetical sort)
  const parts = [localFingerprint, remoteFingerprint].sort();
  const combinedData = parts.join(':');
  
  const hash = await sha256(combinedData);
  const fingerprint = formatFingerprint(hash);
  
  return fingerprint;
}

/**
 * Connection fingerprint data structure
 */
export interface ConnectionFingerprintData {
  fingerprint: string;
  generatedAt: number;
  peerId: string;
}

/**
 * In-memory storage for fingerprints (session only)
 */
const fingerprintStore = new Map<string, ConnectionFingerprintData>();

/**
 * Store fingerprint for a peer connection
 */
export function storeFingerprint(peerId: string, fingerprint: string): void {
  fingerprintStore.set(peerId, {
    fingerprint,
    generatedAt: Date.now(),
    peerId,
  });
}

/**
 * Get stored fingerprint for a peer
 */
export function getFingerprint(peerId: string): ConnectionFingerprintData | undefined {
  return fingerprintStore.get(peerId);
}

/**
 * Clear fingerprint when connection closes
 */
export function clearFingerprint(peerId: string): void {
  fingerprintStore.delete(peerId);
}

/**
 * Clear all fingerprints
 */
export function clearAllFingerprints(): void {
  fingerprintStore.clear();
}
