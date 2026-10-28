/** Tiny WebAudio synth: no sound files to download. */
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  start() {
    if (this.ctx || !this.enabled) return;
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // engine: two detuned saws through a lowpass
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    this.engineFilter = lp;
    this.osc = [this.ctx.createOscillator(), this.ctx.createOscillator()];
    this.osc.forEach((o, i) => {
      o.type = "sawtooth";
      o.frequency.value = 50 + i * 3;
      o.connect(lp);
      o.start();
    });
    lp.connect(this.engineGain).connect(this.master);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
    if (on) this.start();
  }

  engine(speed, throttle) {
    if (!this.ctx) return;
    const f = 45 + speed * 3.2 + throttle * 25;
    const t = this.ctx.currentTime;
    this.osc[0].frequency.setTargetAtTime(f, t, 0.08);
    this.osc[1].frequency.setTargetAtTime(f * 1.51, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(400 + speed * 30, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.06 + throttle * 0.05, t, 0.1);
  }

  tone(freq, dur, type = "square", vol = 0.2, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  horn() {
    this.tone(415, 0.35, "square", 0.12);
    this.tone(523, 0.35, "square", 0.12);
  }

  coin() {
    [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.14, "triangle", 0.15, i * 0.07));
  }

  thud(strength = 1) {
    if (!this.ctx || !this.enabled) return;
    const len = 0.25;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220 + strength * 300;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1, 0.3 + strength * 0.5);
    src.connect(lp).connect(g).connect(this.master);
    src.start();
  }

  whistle() {
    this.tone(2200, 0.18, "sine", 0.12);
    this.tone(2400, 0.3, "sine", 0.12, 0.2);
  }
}
