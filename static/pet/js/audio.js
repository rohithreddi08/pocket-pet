// ============================================================================
// audio.js — synthesized cat sounds + the talk-back voice.
// ----------------------------------------------------------------------------
// Every sound is generated with Web Audio (no audio files to license or load).
// Voice: the mic is analysed with a simple adaptive voice-activity detector;
// when you stop talking, the clip (with a little pre-roll so the first
// syllable isn't clipped) is played back faster → higher, squeaky cat voice.
// ============================================================================

let ctx = null;
let master = null;

/** AudioContext must be created/resumed inside a user gesture. */
export function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(seconds = 1) {
  const c = audioContext();
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(gain, t0, a, peak, d, end = 0.0001) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + a);
  gain.gain.exponentialRampToValueAtTime(end, t0 + a + d);
}

export class Sound {
  constructor() {
    this.enabled = true;
    this._purr = null;
    this._shower = null;
    this._noise = null;
  }

  _ok() {
    if (!this.enabled) return false;
    audioContext();
    return true;
  }

  get noise() { return (this._noise ||= noiseBuffer(2)); }

  /**
   * A meow: a buzzy source through two vowel formants ("ee" → "ow"), with a
   * rising-then-falling pitch contour.
   * @param {{pitch?: number, dur?: number, mood?: 'happy'|'sad'|'question'|'angry'}} o
   */
  meow({ pitch = 1, dur = 0.55, mood = 'happy' } = {}) {
    if (!this._ok()) return;
    const c = ctx; const t = c.currentTime;
    const f0 = 520 * pitch;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const contour = {
      happy:    [f0 * 0.8, f0 * 1.25, f0 * 0.9],
      sad:      [f0 * 1.1, f0 * 1.0, f0 * 0.6],
      question: [f0 * 0.8, f0 * 0.9, f0 * 1.35],
      angry:    [f0 * 0.6, f0 * 0.75, f0 * 0.55],
    }[mood];
    osc.frequency.setValueAtTime(contour[0], t);
    osc.frequency.linearRampToValueAtTime(contour[1], t + dur * 0.35);
    osc.frequency.linearRampToValueAtTime(contour[2], t + dur);

    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
    f1.frequency.setValueAtTime(2400, t); f1.frequency.linearRampToValueAtTime(900, t + dur);
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 5;
    f2.frequency.setValueAtTime(3600, t); f2.frequency.linearRampToValueAtTime(1300, t + dur);
    const g = c.createGain();
    env(g, t, 0.05, 0.9, dur);
    osc.connect(f1).connect(g);
    osc.connect(f2).connect(g);
    g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.1);
  }

  /** Short chirpy trill ("mrrp!") used for giggles and greetings. */
  trill(count = 3, pitch = 1.3) {
    for (let i = 0; i < count; i += 1) {
      setTimeout(() => this.meow({ pitch: pitch + Math.random() * 0.2, dur: 0.14, mood: 'happy' }), i * 120);
    }
  }

  hiss() {
    if (!this._ok()) return;
    const c = ctx; const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = c.createGain(); env(g, t, 0.04, 0.5, 0.7);
    src.connect(hp).connect(g).connect(master);
    src.start(t); src.stop(t + 0.8);
  }

  /** Continuous purr: low rumble amplitude-modulated ~26 Hz. */
  purr(on) {
    if (on && !this._purr && this._ok()) {
      const c = ctx;
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
      const am = c.createGain(); am.gain.value = 0;
      const lfo = c.createOscillator(); lfo.frequency.value = 26;
      const lfoGain = c.createGain(); lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain).connect(am.gain);
      const out = c.createGain(); out.gain.value = 0.0001;
      out.gain.exponentialRampToValueAtTime(0.9, c.currentTime + 0.4);
      src.connect(lp).connect(am).connect(out).connect(master);
      src.start(); lfo.start();
      this._purr = { src, lfo, out };
    } else if (!on && this._purr) {
      const { src, lfo, out } = this._purr;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      src.stop(t + 0.55); lfo.stop(t + 0.55);
      this._purr = null;
    }
  }

  munch() {
    if (!this._ok()) return;
    const c = ctx; const t = c.currentTime;
    for (let i = 0; i < 3; i += 1) {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 900; bp.Q.value = 1.5;
      const g = c.createGain(); env(g, t + i * 0.16, 0.01, 0.6, 0.09);
      src.connect(bp).connect(g).connect(master);
      src.start(t + i * 0.16, Math.random()); src.stop(t + i * 0.16 + 0.12);
    }
  }

  _tone(freq, dur, type = 'sine', vol = 0.4, when = 0, slideTo = null) {
    if (!this._ok()) return;
    const c = ctx; const t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain(); env(g, t, 0.01, vol, dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  pop() { this._tone(600, 0.12, 'sine', 0.35, 0, 1200); }
  click() { this._tone(900, 0.05, 'triangle', 0.2); }
  coin() { this._tone(988, 0.08, 'square', 0.15); this._tone(1319, 0.25, 'square', 0.15, 0.08); }
  error() { this._tone(220, 0.18, 'square', 0.15); this._tone(180, 0.22, 'square', 0.15, 0.12); }
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.2, 'triangle', 0.3, i * 0.11)); }
  note(i) { const f = [392, 494, 587, 698][i % 4]; this._tone(f, 0.35, 'triangle', 0.35); }
  boing() { this._tone(180, 0.3, 'sine', 0.4, 0, 520); }
  sparkle() { [1568, 2093, 2637].forEach((f, i) => this._tone(f, 0.15, 'sine', 0.15, i * 0.05)); }

  squish() {
    if (!this._ok()) return;
    const c = ctx; const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + 0.15); bp.Q.value = 4;
    const g = c.createGain(); env(g, t, 0.02, 0.25, 0.15);
    src.connect(bp).connect(g).connect(master); src.start(t, Math.random()); src.stop(t + 0.2);
  }

  shower(on) {
    if (on && !this._shower && this._ok()) {
      const c = ctx;
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 1200;
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.3);
      src.connect(bp).connect(g).connect(master); src.start();
      this._shower = { src, g };
    } else if (!on && this._shower) {
      const { src, g } = this._shower; const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); src.stop(t + 0.45);
      this._shower = null;
    }
  }

  yawn() { this.meow({ pitch: 0.7, dur: 1.1, mood: 'sad' }); }
}

// ============================================================================
// Voice — listen, detect speech, play it back as the cat.
// ============================================================================
export class Voice {
  constructor() {
    this.state = 'off';          // off | listening | hearing | talking
    this.pitch = 1.6;
    this.sensitivity = 0.5;      // 0..1, higher = picks up quieter speech
    this.level = 0;              // smoothed output level 0..1 (for lip-sync-ish motion)
    this.onState = () => {};
    this._chunks = [];
    this._pre = [];
    this._floor = 0.01;
    this._loud = 0;
    this._quiet = 0;
    this._cooldown = 0;
  }

  static supported() {
    return !!(navigator.mediaDevices?.getUserMedia && (window.AudioWorkletNode));
  }

  async enable() {
    const c = audioContext();
    if (!Voice.supported()) throw new Error('This browser can\'t record audio.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    await c.audioWorklet.addModule(new URL('./recorder-worklet.js', import.meta.url));
    this.src = c.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(c, 'pet-recorder');
    this.node.port.onmessage = (e) => this._onChunk(e.data);
    // The worklet must be pulled by the graph; route it through a silent gain.
    const mute = c.createGain(); mute.gain.value = 0;
    this.src.connect(this.node).connect(mute).connect(c.destination);
    this.outAnalyser = c.createAnalyser();
    this.outAnalyser.fftSize = 512;
    this._outData = new Float32Array(this.outAnalyser.fftSize);
    this._set('listening');
  }

  disable() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node?.disconnect();
    this.src?.disconnect();
    this.stream = null;
    this._chunks = [];
    this._set('off');
  }

  _set(s) {
    if (this.state !== s) { this.state = s; this.onState(s); }
  }

  _onChunk(buf) {
    if (this.state === 'off' || this.state === 'talking') return;
    const sr = ctx.sampleRate;
    const chunkSec = buf.length / sr;
    if (this._cooldown > 0) { this._cooldown -= chunkSec; return; }

    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const minLevel = 0.045 - this.sensitivity * 0.035;     // 0.045 .. 0.010
    const threshold = Math.max(minLevel, this._floor * 3);

    if (this.state === 'listening') {
      this._floor = this._floor * 0.97 + Math.min(rms, 0.05) * 0.03;
      this._pre.push(buf);
      while (this._pre.length * chunkSec > 0.35) this._pre.shift();
      if (rms > threshold) {
        this._loud += 1;
        if (this._loud >= 2) {
          this._chunks = [...this._pre];
          this._quiet = 0;
          this._set('hearing');
        }
      } else {
        this._loud = 0;
      }
    } else if (this.state === 'hearing') {
      this._chunks.push(buf);
      this._quiet = rms < threshold * 0.8 ? this._quiet + chunkSec : 0;
      const total = this._chunks.length * chunkSec;
      if (this._quiet > 0.7 || total > 7) this._playBack();
    }
  }

  _playBack() {
    const sr = ctx.sampleRate;
    // Drop most of the trailing silence.
    const chunkLen = this._chunks[0]?.length || 2048;
    const dropTail = Math.floor(Math.max(0, this._quiet - 0.15) * sr / chunkLen);
    const chunks = this._chunks.slice(0, Math.max(1, this._chunks.length - dropTail));
    this._chunks = []; this._pre = []; this._loud = 0;
    const len = chunks.reduce((n, c) => n + c.length, 0);
    if (len / sr < 0.35) { this._set('listening'); return; }  // just a cough or click

    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    let off = 0; let peak = 0.0001;
    for (const c of chunks) { data.set(c, off); off += c.length; }
    for (let i = 0; i < len; i += 1) peak = Math.max(peak, Math.abs(data[i]));
    const gain = Math.min(6, 0.8 / peak);                 // normalize quiet speakers

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = this.pitch;                   // faster = higher, chipmunk-cat
    const g = ctx.createGain(); g.gain.value = gain;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    src.connect(hp).connect(g).connect(this.outAnalyser).connect(master);
    this._set('talking');
    src.onended = () => {
      this.level = 0;
      this._cooldown = 0.35;   // don't hear our own echo tail
      if (this.state !== 'off') this._set('listening');
    };
    src.start();
  }

  update(dt) {
    if (this.state !== 'talking' || !this.outAnalyser) {
      this.level += (0 - this.level) * Math.min(1, dt * 10);
      return;
    }
    this.outAnalyser.getFloatTimeDomainData(this._outData);
    let sum = 0;
    for (let i = 0; i < this._outData.length; i += 1) sum += this._outData[i] ** 2;
    const target = Math.min(1, Math.sqrt(sum / this._outData.length) * 5);
    this.level += (target - this.level) * Math.min(1, dt * 18);
  }
}
