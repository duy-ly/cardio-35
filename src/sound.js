export class SoundController {
  constructor(options = {}) {
    this.audioContext = options.audioContext || null;
    this.speechSynthesis =
      options.speechSynthesis !== undefined
        ? options.speechSynthesis
        : typeof window !== 'undefined'
          ? window.speechSynthesis
          : null;
    this.SpeechSynthesisUtterance =
      options.SpeechSynthesisUtterance !== undefined
        ? options.SpeechSynthesisUtterance
        : typeof window !== 'undefined'
          ? window.SpeechSynthesisUtterance
          : null;

    this.isMuted = Boolean(options.isMuted);
  }

  getAudioContext() {
    if (!this.audioContext && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    return this.audioContext;
  }

  async unlock() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (_) {}
    }

    // Play a silent 1-sample buffer to satisfy iOS Safari autoplay unlock
    try {
      if (typeof ctx.createBuffer === 'function') {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }
    } catch (_) {}
  }

  playTone(frequency, durationSec, maxGain = 0.3) {
    if (this.isMuted) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        ctx.resume();
      } catch (_) {}
    }

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(maxGain, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + durationSec);
    } catch (_) {}
  }

  playTick() {
    // 440 Hz tick for 3-2-1 countdown beeps
    this.playTone(440, 0.08, 0.3);
  }

  playChime() {
    // 880 Hz chime for phase transitions and switch sides
    this.playTone(880, 0.45, 0.4);
  }

  speak(text) {
    if (this.isMuted || !text || !this.speechSynthesis || !this.SpeechSynthesisUtterance) {
      return;
    }

    try {
      const utterance = new this.SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';
      this.speechSynthesis.speak(utterance);
    } catch (_) {}
  }

  cancelSpeech() {
    if (this.speechSynthesis && typeof this.speechSynthesis.cancel === 'function') {
      try {
        this.speechSynthesis.cancel();
      } catch (_) {}
    }
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (this.isMuted) {
      this.cancelSpeech();
    }
    return this.isMuted;
  }

  toggleMute() {
    return this.setMuted(!this.isMuted);
  }
}
