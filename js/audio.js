/* Green Rush — procedural lo-fi soundtrack + SFX (pure WebAudio, no assets) */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});

  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const A = {
    ctx: null,
    master: null,
    musicBus: null,
    sfxBus: null,
    musicOn: true,
    sfxOn: true,
    intensity: 0, // 0 = menu chill, 1 = running
    _timer: null,
    _nextBeat: 0,
    _beatIdx: 0,
    _noise: null,
    _crackle: null,

    /* must be called from a user gesture */
    init() {
      if (this.ctx) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.75 : 0;
      // gentle master lowpass for the lo-fi warmth
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4800;
      this.musicBus.connect(lp);
      lp.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 0.9 : 0;
      this.sfxBus.connect(this.master);

      // shared noise buffer (2s white noise)
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;

      this._startCrackle();
      this._startScheduler();
    },

    resume() {
      // covers 'suspended' and iOS Safari's non-standard 'interrupted'
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    },

    setMusic(on) {
      this.musicOn = on;
      if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.1);
    },
    setSfx(on) {
      this.sfxOn = on;
      if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
    },
    setIntensity(v) {
      this.intensity = GR.clamp(v, 0, 1);
    },

    /* ---------------------------------------------------------- music */
    _startCrackle() {
      // vinyl crackle: looped noise through tight bandpass, very quiet
      const src = this.ctx.createBufferSource();
      src.buffer = this._noise;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = 6000;
      const g = this.ctx.createGain();
      g.gain.value = 0.012;
      src.connect(bp).connect(g).connect(this.musicBus);
      src.start();
      this._crackle = src;
    },

    _startScheduler() {
      const BPM = 78;
      this._spb = 60 / BPM; // seconds per beat
      this._nextBeat = this.ctx.currentTime + 0.1;
      this._beatIdx = 0;
      this._timer = setInterval(() => this._schedule(), 90);
    },

    _schedule() {
      const ahead = 0.25;
      while (this._nextBeat < this.ctx.currentTime + ahead) {
        this._playBeat(this._beatIdx, this._nextBeat);
        this._nextBeat += this._spb / 2; // schedule in 8th notes
        this._beatIdx = (this._beatIdx + 1) % 64; // 8 bars of 8ths
      }
    },

    /* one lo-fi groove: Am7 / Fmaj7 / Cmaj7 / Em7, two bars each */
    _playBeat(i, t) {
      const bar = Math.floor(i / 8); // 0..7
      const eighth = i % 8;
      const chordIdx = Math.floor(bar / 2) % 4;
      const chords = [
        [57, 60, 64, 67], // Am7
        [53, 57, 60, 65], // Fmaj7
        [48, 52, 55, 59], // Cmaj7
        [52, 55, 59, 62], // Em7
      ];
      const roots = [45, 41, 36, 40];
      const chord = chords[chordIdx];
      const swing = eighth % 2 === 1 ? this._spb * 0.12 : 0;
      const tt = t + swing;

      // keys: chord stab on beat 1, soft echo on the "and of 2"
      if (eighth === 0 || (eighth === 5 && bar % 2 === 0)) {
        const vel = eighth === 0 ? 0.16 : 0.09;
        for (const n of chord) this._key(midiHz(n), tt, this._spb * 1.6, vel);
      }
      // bass on 1 and the "and of 3"
      if (eighth === 0) this._bass(midiHz(roots[chordIdx]), tt, this._spb * 1.4);
      if (eighth === 6) this._bass(midiHz(roots[chordIdx] + (bar % 2 ? 7 : 0)), tt, this._spb * 0.7);
      // drums
      if (eighth === 0 || eighth === 6) this._kick(tt);
      if (eighth === 2 || eighth === 6) ; // reserved
      if (eighth === 4) this._snare(tt);
      const hatChance = 0.55 + this.intensity * 0.45;
      if (Math.random() < hatChance) this._hat(tt, eighth % 2 === 1);
      // pluck melody while running
      if (this.intensity > 0.5 && (eighth === 2 || eighth === 7) && Math.random() < 0.4) {
        const penta = [69, 72, 74, 76, 79, 81];
        this._pluck(midiHz(GR.pick(penta)), tt, this._spb);
      }
    },

    _key(freq, t, dur, vel) {
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      o1.type = 'triangle';
      o2.type = 'sine';
      o1.frequency.value = freq;
      o2.frequency.value = freq * 1.004; // gentle chorus detune
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o1.connect(g);
      o2.connect(g);
      g.connect(this.musicBus);
      o1.start(t); o2.start(t);
      o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },

    _bass(freq, t, dur) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.05);
    },

    _kick(t) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.09);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g).connect(this.musicBus);
      o.start(t); o.stop(t + 0.2);
    },

    _snare(t) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noise;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 0.9;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(bp).connect(g).connect(this.musicBus);
      src.start(t, Math.random()); src.stop(t + 0.15);
    },

    _hat(t, open) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noise;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 8200;
      const g = this.ctx.createGain();
      const dur = open ? 0.09 : 0.035;
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(hp).connect(g).connect(this.musicBus);
      src.start(t, Math.random()); src.stop(t + dur + 0.02);
    },

    _pluck(freq, t, dur) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.05);
    },

    /* ------------------------------------------------------------ sfx */
    sfx(name) {
      if (!this.ctx || !this.sfxOn) return;
      const t = this.ctx.currentTime;
      const fns = {
        click: () => this._blip(660, t, 0.05, 0.12, 'square'),
        jump: () => this._sweepNoise(t, 700, 2400, 0.18, 0.1),
        slide: () => this._sweepNoise(t, 2000, 500, 0.22, 0.12),
        coin: () => { this._blip(1318, t, 0.06, 0.14); this._blip(1976, t + 0.07, 0.1, 0.12); },
        power: () => { [880, 1108, 1318, 1760].forEach((f, i) => this._blip(f, t + i * 0.06, 0.09, 0.13)); },
        hit: () => { this._thud(t); this._sweepNoise(t, 900, 200, 0.3, 0.2); },
        shield: () => { this._blip(523, t, 0.12, 0.14, 'sine'); this._blip(392, t + 0.08, 0.16, 0.12, 'sine'); },
        best: () => { [659, 784, 988, 1318, 1568].forEach((f, i) => this._blip(f, t + i * 0.08, 0.12, 0.14)); },
        whoosh: () => this._sweepNoise(t, 400, 1600, 0.12, 0.06),
      };
      if (fns[name]) fns[name]();
    },

    _blip(freq, t, dur, vel, type) {
      const o = this.ctx.createOscillator();
      o.type = type || 'triangle';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.sfxBus);
      o.start(t); o.stop(t + dur + 0.03);
    },

    _sweepNoise(t, f0, f1, dur, vel) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noise;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(bp).connect(g).connect(this.sfxBus);
      src.start(t, Math.random()); src.stop(t + dur + 0.03);
    },

    _thud(t) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(this.sfxBus);
      o.start(t); o.stop(t + 0.3);
    },
  };

  GR.Audio = A;
})();
