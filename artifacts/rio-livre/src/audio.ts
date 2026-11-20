export class AudioEngine {
  context?: AudioContext;
  master?: GainNode;
  musicGain?: GainNode;
  ambientGain?: GainNode;
  sfxGain?: GainNode;
  engineGain?: GainNode;
  sirenGain?: GainNode;
  private engineOsc?: OscillatorNode;
  private engineFilter?: BiquadFilterNode;
  private sirenOsc?: OscillatorNode;
  private musicTimer?: number;
  private step = 0;
  private started = false;
  private masterVolume = 0.8;
  private musicVolume = 0.7;

  async unlock() {
    if (!this.context) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor();
      this.buildGraph();
      this.startAmbient();
      this.startMusic();
    }
    if (this.context.state === "suspended") await this.context.resume();
    this.started = true;
  }

  private buildGraph() {
    if (!this.context) return;
    this.master = this.context.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.context.destination);
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = this.musicVolume * 0.42;
    this.musicGain.connect(this.master);
    this.ambientGain = this.context.createGain();
    this.ambientGain.gain.value = 0.34;
    this.ambientGain.connect(this.master);
    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = 0.46;
    this.sfxGain.connect(this.master);
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);
    this.sirenGain = this.context.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.master);
  }

  private startAmbient() {
    if (!this.context || !this.ambientGain) return;
    const len = this.context.sampleRate * 4;
    const buffer = this.context.createBuffer(1, len, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 2.6;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 780;
    filter.Q.value = 0.3;
    const waveGain = this.context.createGain();
    waveGain.gain.value = 0.1;
    const lfo = this.context.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = this.context.createGain();
    lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);
    source.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(this.ambientGain);
    source.start();
    lfo.start();

    const birds = this.context.createOscillator();
    const birdGain = this.context.createGain();
    const birdLfo = this.context.createOscillator();
    const birdLfoGain = this.context.createGain();
    birds.type = "sine";
    birds.frequency.value = 2350;
    birdGain.gain.value = 0.0004;
    birdLfo.frequency.value = 0.17;
    birdLfoGain.gain.value = 0.0012;
    birdLfo.connect(birdLfoGain);
    birdLfoGain.connect(birdGain.gain);
    birds.connect(birdGain);
    birdGain.connect(this.ambientGain);
    birds.start();
    birdLfo.start();
  }

  private startMusic() {
    if (!this.context || !this.musicGain) return;
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = window.setInterval(() => {
      if (!this.context || this.context.state !== "running") return;
      this.playStep(this.step++ % 8, this.context.currentTime);
    }, 285);
  }

  private playStep(step: number, at: number) {
    if (!this.context || !this.musicGain) return;
    const ctx = this.context;
    if (step % 4 === 0 || step === 3) this.kick(at);
    if (step % 2 === 0) this.shaker(at, 0.018);
    if (step === 1 || step === 5) this.snare(at);
    const bassNotes = [55, 55, 110, 82.41, 65.41, 65.41, 98, 73.42];
    this.tone(bassNotes[step]!, at, 0.22, "sine", 0.055, this.musicGain);
    if (step === 2 || step === 6) {
      const notes = step === 2 ? [329.63, 392, 493.88] : [293.66, 349.23, 440];
      notes.forEach((n, i) => this.tone(n, at + i * 0.055, 0.24, "triangle", 0.022, this.musicGain!));
    }
  }

  private kick(at: number) {
    if (!this.context || !this.musicGain) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.frequency.setValueAtTime(115, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.11);
    gain.gain.setValueAtTime(0.16, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.19);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  private shaker(at: number, volume: number) {
    if (!this.context || !this.musicGain) return;
    const len = 0.05;
    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * len), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 5000;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(at);
  }

  private snare(at: number) {
    if (!this.context || !this.musicGain) return;
    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.12), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1700;
    const gain = this.context.createGain();
    gain.gain.value = 0.075;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(at);
    this.tone(180, at, 0.08, "triangle", 0.03, this.musicGain);
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, volume: number, dest: AudioNode) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  setVolumes(master: number, music: number) {
    this.masterVolume = master;
    this.musicVolume = music;
    if (this.master && this.context) this.master.gain.setTargetAtTime(master, this.context.currentTime, 0.05);
    if (this.musicGain && this.context) this.musicGain.gain.setTargetAtTime(music * 0.42, this.context.currentTime, 0.05);
  }

  setEngine(active: boolean, speed = 0) {
    if (!this.context || !this.engineGain) return;
    if (!this.engineOsc) {
      this.engineOsc = this.context.createOscillator();
      this.engineFilter = this.context.createBiquadFilter();
      this.engineOsc.type = "sawtooth";
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 210;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineOsc.start();
    }
    const t = this.context.currentTime;
    this.engineGain.gain.setTargetAtTime(active ? 0.035 : 0, t, 0.12);
    this.engineOsc.frequency.setTargetAtTime(48 + Math.abs(speed) * 3.6, t, 0.08);
    this.engineFilter?.frequency.setTargetAtTime(150 + Math.abs(speed) * 20, t, 0.12);
  }

  setSiren(active: boolean) {
    if (!this.context || !this.sirenGain) return;
    if (!this.sirenOsc) {
      this.sirenOsc = this.context.createOscillator();
      this.sirenOsc.type = "square";
      this.sirenOsc.frequency.value = 680;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenOsc.start();
    }
    const t = this.context.currentTime;
    this.sirenGain.gain.setTargetAtTime(active ? 0.012 : 0, t, 0.16);
    if (active) {
      this.sirenOsc.frequency.cancelScheduledValues(t);
      this.sirenOsc.frequency.setValueAtTime(680, t);
      this.sirenOsc.frequency.linearRampToValueAtTime(940, t + 0.55);
      this.sirenOsc.frequency.linearRampToValueAtTime(680, t + 1.1);
    }
  }

  chime(good = true) {
    if (!this.context || !this.sfxGain) return;
    const notes = good ? [523.25, 659.25, 783.99, 1046.5] : [392, 329.63, 261.63];
    notes.forEach((n, i) => this.tone(n, this.context!.currentTime + i * 0.1, 0.35, "triangle", 0.06, this.sfxGain!));
  }

  click() {
    if (!this.context || !this.sfxGain) return;
    this.tone(700, this.context.currentTime, 0.06, "sine", 0.02, this.sfxGain);
  }

  pickup() {
    if (!this.context || !this.sfxGain) return;
    this.tone(880, this.context.currentTime, 0.12, "triangle", 0.04, this.sfxGain);
    this.tone(1320, this.context.currentTime + 0.08, 0.18, "sine", 0.035, this.sfxGain);
  }

  crash() {
    if (!this.context || !this.sfxGain) return;
    const at = this.context.currentTime;
    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.18), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.15, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.start();
  }

  suspend() {
    this.context?.suspend();
  }

  resume() {
    this.context?.resume();
  }

  isStarted() {
    return this.started;
  }
}
