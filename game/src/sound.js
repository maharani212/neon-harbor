// Neon Harbor — all sound is synthesized with WebAudio: a low synthwave loop
// (bass, arpeggio, kick) and one-shot effects for gunfire, pickups, crashes,
// sirens and mission paydays. No audio files, no network. The context is created
// on the first user gesture, because browsers will not let it start before one.

const BPM = 112;
const STEP_SECONDS = 60 / BPM / 4; // sixteenth notes
const BASS_LINE = [55, 0, 55, 65.41, 55, 0, 49, 55, 55, 0, 55, 65.41, 73.42, 65.41, 58.27, 49];
const ARP_LINE = [220, 261.63, 329.63, 440, 261.63, 329.63, 440, 523.25, 220, 261.63, 329.63, 440, 392, 329.63, 261.63, 220];
const KICK_STEPS = [0, 4, 8, 12];

export function createSound() {
  let context = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let noiseBuffer = null;
  let muted = false;
  let musicTimer = null;
  let nextStepTime = 0;
  let stepIndex = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Shared noise buffer for gunfire and crashes.
      const length = context.sampleRate;
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      // Engine hum: a sawtooth whose pitch follows the speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Police siren: two alternating tones.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 660;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function note(freq, time, duration, type, gainValue, destination) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  function kick(time) {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  function scheduleStep(index, time) {
    const bass = BASS_LINE[index % BASS_LINE.length];
    if (bass > 0) note(bass, time, STEP_SECONDS * 1.8, 'sawtooth', 0.5, musicGain);
    const arp = ARP_LINE[index % ARP_LINE.length];
    if (index % 2 === 0) note(arp, time, STEP_SECONDS * 0.9, 'square', 0.08, musicGain);
    if (KICK_STEPS.includes(index % 16)) kick(time);
  }

  function startMusic() {
    if (musicTimer !== null) return;
    nextStepTime = context.currentTime + 0.1;
    stepIndex = 0;
    musicTimer = window.setInterval(() => {
      while (nextStepTime < context.currentTime + 0.15) {
        scheduleStep(stepIndex, nextStepTime);
        stepIndex = (stepIndex + 1) % 16;
        nextStepTime += STEP_SECONDS;
      }
    }, 40);
  }

  function burst(time, duration, filterFreq, gainValue) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(time);
    source.stop(time + duration + 0.05);
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Continuous sounds, called every frame: engine pitch and the siren. */
    update(speed, wanted, inCar) {
      if (!context) return;
      const target = inCar ? 0.035 + Math.min(0.05, Math.abs(speed) / 9000) : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + Math.abs(speed) * 0.16, context.currentTime, 0.08);
      const sirenOn = wanted >= 1;
      sirenGain.gain.setTargetAtTime(sirenOn ? 0.02 : 0, context.currentTime, 0.2);
      if (sirenOn) {
        const phase = Math.floor(context.currentTime * 2.4) % 2;
        sirenOsc.frequency.setTargetAtTime(phase === 0 ? 660 : 880, context.currentTime, 0.05);
      }
    },
    shot() {
      if (!context) return;
      const t = context.currentTime;
      burst(t, 0.12, 3200, 0.5);
      note(180, t, 0.08, 'square', 0.18, master);
    },
    pickup() {
      if (!context) return;
      const t = context.currentTime;
      note(660, t, 0.12, 'sine', 0.22, master);
      note(990, t + 0.09, 0.18, 'sine', 0.22, master);
    },
    crash() {
      if (!context) return;
      burst(context.currentTime, 0.25, 500, 0.5);
    },
    missionDone() {
      if (!context) return;
      const t = context.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => note(freq, t + i * 0.11, 0.22, 'triangle', 0.22, master));
    },
    busted() {
      if (!context) return;
      const t = context.currentTime;
      [392, 311.13, 233.08].forEach((freq, i) => note(freq, t + i * 0.16, 0.3, 'sawtooth', 0.16, master));
    },
  };
}
