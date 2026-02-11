// Audio notification utility for Lynkless
// Uses Web Audio API to generate notification sounds (no external files needed)

class NotificationSounds {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Check localStorage for sound preference
      const savedPref = localStorage.getItem('lynkless-sounds-enabled');
      this.enabled = savedPref !== 'false';
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    localStorage.setItem('lynkless-sounds-enabled', String(enabled));
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Connection request received
  playRequestReceived() {
    if (!this.enabled || !this.audioContext) return;
    this.playTone(800, 0.1, 'sine');
    setTimeout(() => this.playTone(1000, 0.1, 'sine'), 100);
  }

  // File transfer started
  playTransferStart() {
    if (!this.enabled || !this.audioContext) return;
    this.playTone(600, 0.08, 'sine');
  }

  // File transfer completed
  playTransferComplete() {
    if (!this.enabled || !this.audioContext) return;
    this.playTone(800, 0.08, 'sine');
    setTimeout(() => this.playTone(1000, 0.08, 'sine'), 80);
    setTimeout(() => this.playTone(1200, 0.12, 'sine'), 160);
  }

  // Message received
  playMessageReceived() {
    if (!this.enabled || !this.audioContext) return;
    this.playTone(900, 0.06, 'sine');
  }

  // Connection established
  playConnected() {
    if (!this.enabled || !this.audioContext) return;
    this.playTone(600, 0.1, 'sine');
    setTimeout(() => this.playTone(900, 0.15, 'sine'), 100);
  }

  // Error/Warning
  playError() {
    if (!this.enabled || !this.audioContext) return;
    this.playTone(400, 0.15, 'square');
    setTimeout(() => this.playTone(350, 0.15, 'square'), 150);
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    // Envelope for smooth sound
    const now = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}

// Export singleton instance
let soundsInstance: NotificationSounds | null = null;

export function getSounds(): NotificationSounds {
  if (!soundsInstance) {
    soundsInstance = new NotificationSounds();
  }
  return soundsInstance;
}
