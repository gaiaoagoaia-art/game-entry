// Synthesised sound effects with the Web Audio API — no audio files. A tiny voice plays
// short oscillator blips and filtered noise at set pitches; the game calls the named effects
// (shoot, hit, pop, coin, freeze, leak, win, lose) and never touches the context itself.
// Sound starts on the first user gesture, as browsers require, and the mute toggle is kept here.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  /** Create the context lazily; safe to call on every gesture. */
  function unlock() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(context.destination);
  }

  /** One oscillator note: frequency glides from `from` to `to` over `seconds`. */
  function tone(from, to, seconds, type = 'sine', volume = 0.5, delay = 0) {
    if (!context || muted) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A short burst of filtered noise, for pops and splashes. */
  function noise(seconds, cutoff, volume = 0.4, delay = 0) {
    if (!context || muted) return;
    const start = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMuted() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    shoot() { tone(880, 520, 0.07, 'triangle', 0.16); },
    thorn() { tone(1250, 700, 0.05, 'square', 0.08); },
    splash() { noise(0.14, 900, 0.3); tone(300, 140, 0.12, 'sine', 0.2); },
    freeze() { tone(1500, 2100, 0.18, 'sine', 0.16); noise(0.1, 4000, 0.08); },
    hit() { tone(210, 130, 0.05, 'sawtooth', 0.1); },
    pop() { noise(0.08, 1400, 0.35); tone(420, 90, 0.09, 'sine', 0.3); },
    coin() { tone(1180, 1180, 0.06, 'sine', 0.22); tone(1770, 1770, 0.1, 'sine', 0.22, 0.06); },
    plant() { tone(340, 520, 0.1, 'triangle', 0.3); noise(0.08, 500, 0.2); },
    sell() { tone(700, 980, 0.08, 'sine', 0.2); tone(980, 1320, 0.1, 'sine', 0.18, 0.07); },
    error() { tone(160, 120, 0.12, 'square', 0.14); },
    leak() { tone(520, 180, 0.22, 'sawtooth', 0.28); },
    waveHorn() { tone(392, 392, 0.12, 'triangle', 0.3); tone(523, 523, 0.16, 'triangle', 0.3, 0.11); },
    win() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((n, i) => tone(n, n, 0.22, 'triangle', 0.3, i * 0.13));
    },
    lose() {
      const notes = [392, 330, 262, 196];
      notes.forEach((n, i) => tone(n, n, 0.26, 'triangle', 0.3, i * 0.15));
    },
  };
}
