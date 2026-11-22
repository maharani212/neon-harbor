// Neon Harbor — sound, synthesised live with WebAudio. No audio files: the
// engine hum, the sirens, the pickup chime, the crash thud and the mission
// jingle are all oscillators and noise made in code. Silent until the first
// key press, and safe to call before any user gesture.

export const Sound = {
  ctx: null,
  master: null,
  engineOsc: null,
  engineGain: null,
  sirenOsc: null,
  sirenGain: null,
  muted: false,
  started: false,

  /** Create the audio graph. Call on the first key press. */
  init() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: a low sawtooth whose pitch follows the car's speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: a sine that wails between two tones when the police are near.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.started = true;
    } catch {
      // Headless or blocked audio: stay silent, never crash the game.
      this.ctx = null;
    }
  },

  /** Resume the context after a user gesture (autoplay policy). */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },

  /** Toggle mute. */
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },

  /** Engine hum: pitch and loudness follow the car's speed (0..1). */
  engine(speed01, on) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on && !this.muted ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
  },

  /** Police siren: on while the wanted level is up and a cop is close. */
  siren(on) {
    if (!this.ctx || !this.sirenOsc) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.05 : 0, t, 0.2);
    if (on) {
      const f = 620 + 180 * Math.sin(t * 4.5);
      this.sirenOsc.frequency.setTargetAtTime(f, t, 0.05);
    }
  },

  /** A short two-note pickup chime. */
  chime() {
    this.blip(880, 0.09, 0.12);
    setTimeout(() => this.blip(1318, 0.12, 0.12), 90);
  },

  /** A low crash thud (filtered noise burst). */
  thud() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const dur = 0.18;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  },

  /** The mission-complete jingle: a rising four-note arpeggio. */
  jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 0.14), i * 110));
  },

  /** One short sine blip at a frequency, for a duration, at a gain. */
  blip(freq, dur, gain) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
};
