/**
 * Hardware Hooks
 * Deals with OS-level hardware interactions like Screen Wake Locks and iOS Safari Audio Anchors.
 */

/**
 * 120% Production: Screen Wake Lock
 * Prevents the OS from sleeping while a transfer is in progress.
 */
let wakeLock: any = null;

export async function requestWakeLock() {
  if (typeof window !== 'undefined' && 'wakeLock' in navigator && !wakeLock) {
    try {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      console.log('[System] Screen Wake Lock active.');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (err) {}
  }
}

export function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
    console.log('[System] Screen Wake Lock released.');
  }
}

/**
 * 120% Mobile Web: Safari iOS Background Drop Fix
 * Safari strictly limits WebSocket & WebRTC timeouts in background mode.
 * The audio anchor ensures background execution during transfers.
 */
let audioCtx: any = null;
let oscillator: any = null;

export function startAudioAnchor() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (!oscillator) {
      oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.001; // Silent tone
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      console.log('[System] iOS Background Anchor active.');
    }
  } catch (err) {}
}

export function stopAudioAnchor() {
  if (oscillator) {
    oscillator.stop();
    oscillator.disconnect();
    oscillator = null;
    console.log('[System] iOS Background Anchor released.');
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.suspend();
  }
}
