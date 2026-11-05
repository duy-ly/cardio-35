import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoundController } from '../src/sound.js';

describe('SoundController - Audio Synthesis & Speech', () => {
  let mockAudioContext;
  let mockSpeechSynthesis;
  let mockUtteranceConstructor;
  let createdNodes;

  beforeEach(() => {
    createdNodes = [];

    mockAudioContext = {
      state: 'suspended',
      currentTime: 0,
      destination: {},
      resume: vi.fn().mockImplementation(async () => {
        mockAudioContext.state = 'running';
      }),
      createBuffer: vi.fn().mockReturnValue({}),
      createBufferSource: vi.fn().mockReturnValue({
        connect: vi.fn(),
        start: vi.fn(),
      }),
      createOscillator: vi.fn().mockImplementation(() => {
        const osc = {
          type: '',
          frequency: {
            setValueAtTime: vi.fn(),
            value: 0,
          },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        createdNodes.push({ type: 'oscillator', node: osc });
        return osc;
      }),
      createGain: vi.fn().mockImplementation(() => {
        const gain = {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            value: 1,
          },
          connect: vi.fn(),
        };
        createdNodes.push({ type: 'gain', node: gain });
        return gain;
      }),
    };

    mockSpeechSynthesis = {
      speaking: false,
      paused: false,
      speak: vi.fn(),
      cancel: vi.fn(),
    };

    mockUtteranceConstructor = vi.fn().mockImplementation(function (text) {
      this.text = text;
      this.rate = 1;
      this.pitch = 1;
      this.lang = 'en-US';
    });
  });

  it('initializes with default options and unmuted state', () => {
    const sound = new SoundController({
      audioContext: mockAudioContext,
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: mockUtteranceConstructor,
    });

    expect(sound.isMuted).toBe(false);
  });

  it('unlocks AudioContext on unlock() call', async () => {
    const sound = new SoundController({
      audioContext: mockAudioContext,
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: mockUtteranceConstructor,
    });

    expect(mockAudioContext.state).toBe('suspended');
    await sound.unlock();
    expect(mockAudioContext.resume).toHaveBeenCalled();
  });

  it('synthesizes a 440 Hz beep for countdown tick without audio files', () => {
    const sound = new SoundController({
      audioContext: mockAudioContext,
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: mockUtteranceConstructor,
    });

    sound.playTick();

    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();

    const oscNode = createdNodes.find((n) => n.type === 'oscillator').node;
    const gainNode = createdNodes.find((n) => n.type === 'gain').node;

    expect(oscNode.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
    expect(oscNode.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledWith(mockAudioContext.destination);
    expect(oscNode.start).toHaveBeenCalled();
    expect(oscNode.stop).toHaveBeenCalled();
  });

  it('synthesizes an 880 Hz chime for phase transitions without audio files', () => {
    const sound = new SoundController({
      audioContext: mockAudioContext,
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: mockUtteranceConstructor,
    });

    sound.playChime();

    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();

    const oscNode = createdNodes.find((n) => n.type === 'oscillator').node;
    const gainNode = createdNodes.find((n) => n.type === 'gain').node;

    expect(oscNode.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
    expect(oscNode.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledWith(mockAudioContext.destination);
    expect(oscNode.start).toHaveBeenCalled();
    expect(oscNode.stop).toHaveBeenCalled();
  });

  it('speaks text cue using window.speechSynthesis and SpeechSynthesisUtterance', () => {
    const sound = new SoundController({
      audioContext: mockAudioContext,
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: mockUtteranceConstructor,
    });

    sound.speak('Next: Jumping Jacks');

    expect(mockUtteranceConstructor).toHaveBeenCalledWith('Next: Jumping Jacks');
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
  });

  it('silences all beeps, chimes, and speech when muted', () => {
    const sound = new SoundController({
      audioContext: mockAudioContext,
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: mockUtteranceConstructor,
      isMuted: true,
    });

    sound.playTick();
    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();

    sound.playChime();
    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();

    sound.speak('Halfway there.');
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('calling setMuted(true) or toggleMute() cancels active speech and silences subsequent calls', () => {
    const sound = new SoundController({
      audioContext: mockAudioContext,
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: mockUtteranceConstructor,
    });

    expect(sound.isMuted).toBe(false);

    sound.setMuted(true);
    expect(sound.isMuted).toBe(true);
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();

    // Toggle mute turns it back on
    sound.toggleMute();
    expect(sound.isMuted).toBe(false);

    // Now sound works again
    sound.playTick();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });
});
