/**
 * AudioManager — Web Audio API music + SFX (spec §12), 100% synthesized
 * (no audio assets: tiny bundle, nothing to license).
 *
 * - AudioContext initializes on the FIRST USER GESTURE (autoplay policy);
 *   a NoAudio fallback keeps the game running if construction fails.
 * - Music: per-environment mood configs drive a lookahead step sequencer
 *   (bass / pad / arp / percussion). Adaptive intensity opens a low-pass
 *   filter and brings in the percussion layer as speed tier rises.
 * - Theme changes crossfade: quick fade-out, mood swap, fade-in.
 * - SFX are short synthesized one-shots; key sounds are layered (crash =
 *   impact + boom + debris) for a premium feel.
 * - Master/music/SFX volumes + mute come from SettingsStore, applied live.
 */

import type { SettingsStore } from '../core/Settings';

export type SfxName =
  | 'ui'
  | 'whoosh'
  | 'jump'
  | 'land'
  | 'slide'
  | 'crystal'
  | 'nearmiss'
  | 'powerup'
  | 'powerup-warn'
  | 'powerup-end'
  | 'glider'
  | 'crash'
  | 'revive'
  | 'gateway'
  | 'milestone';

export type MusicMood = 'tunnel' | 'dusk' | 'trail' | 'golden' | 'orbit';

interface MoodConfig {
  tempo: number;
  /** MIDI root note. */
  root: number;
  /** Scale intervals (semitones from root). */
  scale: number[];
  /** Scale-degree per 8th step (-1 = rest), 16 steps. */
  bass: number[];
  arp: number[];
  /** Two pad chords (scale degrees), alternating every 8 steps. */
  chords: [number[], number[]];
  kick: number[];
  hat: number[];
}

const MOODS: Record<MusicMood, MoodConfig> = {
  tunnel: {
    tempo: 96,
    root: 45, // A2 minor — dark tunnel drive
    scale: [0, 3, 5, 7, 10],
    bass: [0, -1, 0, 0, -1, 0, 2, -1, 0, -1, 0, 0, -1, 3, 2, -1],
    arp: [-1, 4, -1, 3, -1, 4, -1, 2, -1, 4, -1, 3, -1, 4, 3, 2],
    chords: [
      [0, 2, 4],
      [1, 3, 4],
    ],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0],
  },
  dusk: {
    tempo: 92,
    root: 43, // G2 — mellow rooftops
    scale: [0, 2, 4, 7, 9],
    bass: [0, -1, -1, 0, -1, 0, -1, -1, 3, -1, -1, 2, -1, 0, -1, -1],
    arp: [-1, -1, 4, -1, 2, -1, -1, 3, -1, -1, 4, -1, 2, -1, 3, -1],
    chords: [
      [0, 2, 4],
      [3, 1, 4],
    ],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    hat: [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1],
  },
  trail: {
    tempo: 100,
    root: 48, // C3 — airy forest
    scale: [0, 2, 5, 7, 9],
    bass: [0, -1, 0, -1, 2, -1, 0, -1, 3, -1, 2, -1, 0, -1, 2, -1],
    arp: [4, -1, 3, -1, -1, 4, -1, 2, 4, -1, 3, -1, -1, 2, -1, 3],
    chords: [
      [0, 2, 4],
      [1, 3, 0],
    ],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  },
  golden: {
    tempo: 104,
    root: 50, // D3 — warm stadium
    scale: [0, 2, 4, 5, 7, 9],
    bass: [0, -1, 0, 2, -1, 0, 3, -1, 0, -1, 0, 2, -1, 4, 3, 2],
    arp: [-1, 5, -1, 4, -1, 5, 3, -1, -1, 5, -1, 4, -1, 3, -1, 5],
    chords: [
      [0, 2, 4],
      [3, 5, 1],
    ],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    hat: [0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1],
  },
  orbit: {
    tempo: 84,
    root: 41, // F2 — weightless station
    scale: [0, 3, 5, 8, 10],
    bass: [0, -1, -1, -1, 2, -1, -1, -1, 0, -1, -1, -1, 3, -1, -1, -1],
    arp: [-1, -1, 4, -1, -1, 3, -1, -1, -1, 4, -1, -1, 2, -1, -1, -1],
    chords: [
      [0, 2, 4],
      [1, 4, 2],
    ],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
  },
};

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private percGain!: GainNode;
  private arpGain!: GainNode;

  private noiseBuffer: AudioBuffer | null = null;
  private unlocked = false;
  private failed = false;

  private mood: MusicMood = 'tunnel';
  private step = 0;
  private nextNoteTime = 0;
  private schedulerId = 0;
  private intensity = 0; // 0..1

  constructor(private settings: SettingsStore) {
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  /** Call on the first user gesture (spec §12 autoplay policy). */
  unlock(): void {
    if (this.unlocked || this.failed) {
      void this.ctx?.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      // NoAudio fallback — the game must never crash without audio.
      this.failed = true;
      return;
    }
    const ctx = this.ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 1200;
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.musicFilter);
    this.musicFilter.connect(this.masterGain);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.percGain = ctx.createGain();
    this.percGain.gain.value = 0;
    this.percGain.connect(this.musicGain);
    this.arpGain = ctx.createGain();
    this.arpGain.gain.value = 0.5;
    this.arpGain.connect(this.musicGain);

    // Shared noise buffer for hats/whooshes/crash layers.
    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.unlocked = true;
    this.applyVolumes();
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.schedulerId = window.setInterval(this.scheduleAhead, 90);
  }

  get isRunning(): boolean {
    return this.unlocked && !this.failed;
  }

  applyVolumes(): void {
    if (!this.isRunning || !this.ctx) return;
    const t = this.ctx.currentTime;
    const muted = this.settings.get('muted');
    this.masterGain.gain.setTargetAtTime(muted ? 0 : this.settings.get('master'), t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.settings.get('music') * 0.5, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.settings.get('sfx'), t, 0.05);
  }

  /** Adaptive intensity 0..1: opens the filter + brings percussion in (§12). */
  setIntensity(v: number): void {
    if (!this.isRunning || !this.ctx) return;
    const clamped = Math.max(0, Math.min(v, 1));
    if (Math.abs(clamped - this.intensity) < 0.02) return;
    this.intensity = clamped;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(900 + clamped * 6800, t, 0.4);
    this.percGain.gain.setTargetAtTime(clamped * 0.9, t, 0.4);
    this.arpGain.gain.setTargetAtTime(0.35 + clamped * 0.55, t, 0.4);
  }

  /** Theme-transition crossfade: dip, swap mood, restore (spec §12). */
  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    if (!this.isRunning || !this.ctx) {
      this.mood = mood;
      return;
    }
    const t = this.ctx.currentTime;
    const target = this.settings.get('music') * 0.5;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
    this.musicGain.gain.linearRampToValueAtTime(0.001, t + 0.7);
    window.setTimeout(() => {
      this.mood = mood;
      this.step = 0;
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t2);
      this.musicGain.gain.setValueAtTime(0.001, t2);
      this.musicGain.gain.linearRampToValueAtTime(target, t2 + 0.9);
    }, 720);
  }

  // ------------------------------------------------------------- sequencer

  private scheduleAhead = (): void => {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const cfg = MOODS[this.mood];
    const stepDur = 60 / cfg.tempo / 2; // 8th notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.22) {
      this.scheduleStep(this.step % 16, this.nextNoteTime, cfg, stepDur);
      this.nextNoteTime += stepDur;
      this.step++;
    }
  };

  private degreeToMidi(cfg: MoodConfig, degree: number, octave = 0): number {
    const idx = ((degree % cfg.scale.length) + cfg.scale.length) % cfg.scale.length;
    const wrap = Math.floor(degree / cfg.scale.length);
    return cfg.root + cfg.scale[idx] + (octave + wrap) * 12;
  }

  private scheduleStep(step: number, time: number, cfg: MoodConfig, stepDur: number): void {
    const bassDeg = cfg.bass[step];
    if (bassDeg >= 0) {
      this.pluck(midiToFreq(this.degreeToMidi(cfg, bassDeg)), time, stepDur * 1.8, 'triangle', 0.5, this.musicGain);
    }
    const arpDeg = cfg.arp[step];
    if (arpDeg >= 0) {
      this.pluck(midiToFreq(this.degreeToMidi(cfg, arpDeg, 2)), time, stepDur * 0.9, 'square', 0.12, this.arpGain);
    }
    if (step % 8 === 0) {
      const chord = cfg.chords[(Math.floor(this.step / 8) % 2) as 0 | 1];
      for (const deg of chord) {
        this.pad(midiToFreq(this.degreeToMidi(cfg, deg, 1)), time, stepDur * 7.6);
      }
    }
    if (cfg.kick[step]) this.kick(time);
    if (cfg.hat[step]) this.hat(time);
  }

  private pluck(
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    dest: AudioNode,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private pad(freq: number, time: number, dur: number): void {
    if (!this.ctx) return;
    for (const detune of [-6, 6]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.05, time + dur * 0.3);
      gain.gain.linearRampToValueAtTime(0.0001, time + dur);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }
  }

  private kick(time: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.connect(gain);
    gain.connect(this.percGain);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  private hat(time: number): void {
    this.noise(time, 0.035, 0.16, 7000, 'highpass', this.percGain);
  }

  private noise(
    time: number,
    dur: number,
    vol: number,
    freq: number,
    filterType: BiquadFilterType,
    dest: AudioNode,
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  // ------------------------------------------------------------------- SFX

  /** @param pitch semitone offset (crystal streak chimes rise — spec §7). */
  sfx(name: SfxName, pitch = 0): void {
    if (!this.isRunning || !this.ctx) return;
    const t = this.ctx.currentTime;
    const mult = Math.pow(2, Math.min(pitch, 14) / 12);
    switch (name) {
      case 'ui':
        this.pluck(720, t, 0.07, 'sine', 0.25, this.sfxGain);
        break;
      case 'whoosh':
        this.noise(t, 0.14, 0.3, 1400, 'bandpass', this.sfxGain);
        break;
      case 'jump': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(640, t + 0.14);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.2);
        break;
      }
      case 'land':
        this.pluck(95, t, 0.12, 'sine', 0.5, this.sfxGain);
        this.noise(t, 0.06, 0.12, 900, 'lowpass', this.sfxGain);
        break;
      case 'slide':
        this.noise(t, 0.3, 0.24, 800, 'bandpass', this.sfxGain);
        break;
      case 'crystal':
        this.pluck(660 * mult, t, 0.16, 'triangle', 0.32, this.sfxGain);
        this.pluck(1320 * mult, t + 0.01, 0.12, 'sine', 0.14, this.sfxGain);
        break;
      case 'nearmiss':
        this.pluck(1180, t, 0.08, 'sine', 0.3, this.sfxGain);
        this.pluck(1760, t + 0.06, 0.12, 'sine', 0.24, this.sfxGain);
        break;
      case 'powerup':
        this.pluck(523 * mult, t, 0.1, 'square', 0.16, this.sfxGain);
        this.pluck(659 * mult, t + 0.07, 0.1, 'square', 0.16, this.sfxGain);
        this.pluck(784 * mult, t + 0.14, 0.16, 'square', 0.18, this.sfxGain);
        break;
      case 'powerup-warn':
        this.pluck(880, t, 0.07, 'sine', 0.2, this.sfxGain);
        this.pluck(880, t + 0.12, 0.07, 'sine', 0.2, this.sfxGain);
        break;
      case 'powerup-end':
        this.pluck(520, t, 0.09, 'sine', 0.22, this.sfxGain);
        this.pluck(390, t + 0.09, 0.14, 'sine', 0.2, this.sfxGain);
        break;
      case 'glider':
        this.noise(t, 0.2, 0.24, 2400, 'bandpass', this.sfxGain);
        this.pluck(392, t, 0.14, 'triangle', 0.28, this.sfxGain);
        break;
      case 'crash':
        // Layered: impact noise + low boom + debris crackle (spec §12).
        this.noise(t, 0.22, 0.55, 1600, 'lowpass', this.sfxGain);
        this.pluck(72, t, 0.32, 'sine', 0.7, this.sfxGain);
        this.noise(t + 0.07, 0.05, 0.2, 3200, 'highpass', this.sfxGain);
        this.noise(t + 0.15, 0.05, 0.14, 2600, 'highpass', this.sfxGain);
        break;
      case 'revive':
        this.pluck(392, t, 0.1, 'triangle', 0.3, this.sfxGain);
        this.pluck(523, t + 0.09, 0.1, 'triangle', 0.3, this.sfxGain);
        this.pluck(659, t + 0.18, 0.2, 'triangle', 0.34, this.sfxGain);
        break;
      case 'gateway':
        this.noise(t, 0.5, 0.28, 900, 'bandpass', this.sfxGain);
        this.pluck(330, t + 0.1, 0.4, 'sine', 0.2, this.sfxGain);
        break;
      case 'milestone':
        this.pluck(587, t, 0.12, 'triangle', 0.3, this.sfxGain);
        this.pluck(880, t + 0.1, 0.12, 'triangle', 0.3, this.sfxGain);
        this.pluck(1174, t + 0.2, 0.24, 'triangle', 0.32, this.sfxGain);
        break;
    }
  }

  private handleVisibility = (): void => {
    if (!this.isRunning || !this.ctx) return;
    if (document.visibilityState === 'hidden') {
      void this.ctx.suspend();
    } else {
      void this.ctx.resume();
    }
  };

  dispose(): void {
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.clearInterval(this.schedulerId);
    void this.ctx?.close();
    this.ctx = null;
    this.unlocked = false;
  }
}
