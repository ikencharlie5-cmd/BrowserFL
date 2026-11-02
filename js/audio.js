/* BrowserFL — mixer graph, transport/scheduler and WAV export. */
(function () {
  const cutoffHz = (c) => (c >= 0.999 ? 20000 : 60 * Math.pow(20000 / 60, c));

  function makeImpulse(ctx, seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  /* Mixer: one bus per channel -> master, with shared reverb and delay sends. */
  class Mixer {
    constructor(ctx) {
      this.ctx = ctx;
      this.buses = new Map();
      const m = (this.masterIn = ctx.createGain());
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 3;
      this.comp.attack.value = 0.01; this.comp.release.value = 0.2;
      this.bypass = ctx.createGain();
      this.compIn = ctx.createGain();
      this.masterGain = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      m.connect(this.compIn).connect(this.comp).connect(this.masterGain);
      m.connect(this.bypass).connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.masterGain.connect(ctx.destination);

      this.revIn = ctx.createGain();
      this.reverb = ctx.createConvolver();
      this.revSize = 0;
      this.revIn.connect(this.reverb).connect(m);

      this.dlyIn = ctx.createGain();
      this.delay = ctx.createDelay(2);
      this.dlyFb = ctx.createGain();
      const dlyTone = ctx.createBiquadFilter();
      dlyTone.type = 'lowpass'; dlyTone.frequency.value = 4500;
      this.dlyIn.connect(this.delay).connect(dlyTone).connect(this.dlyFb).connect(this.delay);
      dlyTone.connect(m);
    }
    set(param, v) {
      param.setTargetAtTime(v, this.ctx.currentTime, 0.015);
    }
    sync(P) {
      const ctx = this.ctx;
      const anySolo = P.channels.some((c) => c.solo);
      const live = new Set();
      P.channels.forEach((ch) => {
        live.add(ch.id);
        let b = this.buses.get(ch.id);
        if (!b) {
          b = {
            input: ctx.createGain(), filter: ctx.createBiquadFilter(), vol: ctx.createGain(),
            pan: ctx.createStereoPanner(), rev: ctx.createGain(), dly: ctx.createGain(), meter: ctx.createAnalyser(),
          };
          b.filter.type = 'lowpass'; b.filter.Q.value = 0.7;
          b.meter.fftSize = 256;
          b.input.connect(b.filter).connect(b.vol).connect(b.pan).connect(this.masterIn);
          b.pan.connect(b.meter);
          b.vol.connect(b.rev).connect(this.revIn);
          b.vol.connect(b.dly).connect(this.dlyIn);
          b.vol.gain.value = 0; b.filter.frequency.value = 20000;
          this.buses.set(ch.id, b);
        }
        const audible = !ch.mute && (!anySolo || ch.solo);
        this.set(b.vol.gain, audible ? ch.vol * ch.vol : 0);
        this.set(b.pan.pan, ch.pan);
        this.set(b.filter.frequency, cutoffHz(ch.cutoff));
        this.set(b.rev.gain, ch.rev);
        this.set(b.dly.gain, ch.dly * 0.8);
      });
      for (const [id, b] of this.buses) {
        if (!live.has(id)) { b.pan.disconnect(); b.vol.disconnect(); this.buses.delete(id); }
      }
      const M = P.master;
      this.set(this.masterGain.gain, M.vol);
      this.set(this.compIn.gain, M.comp ? 1 : 0);
      this.set(this.bypass.gain, M.comp ? 0 : 1);
      if (Math.abs(this.revSize - M.revSize) > 0.01) {
        this.revSize = M.revSize;
        this.reverb.buffer = makeImpulse(ctx, M.revSize);
      }
      this.set(this.delay.delayTime, Math.min(1.99, (60 / P.bpm) * M.dlyTime));
      this.set(this.dlyFb.gain, M.dlyFb);
    }
    out(chId) { const b = this.buses.get(chId); return b && b.input; }
  }

  /* Play everything that happens at one step of a pattern. */
  function playPatternStep(mix, P, pat, s, time, spb) {
    P.channels.forEach((ch) => {
      const out = mix.out(ch.id);
      if (!out) return;
      const inst = INSTRUMENTS[ch.inst];
      const v = pat.steps[ch.id] && pat.steps[ch.id][s];
      if (v) {
        for (let i = 0; i < v; i++) {
          const vel = v > 1 ? 0.55 + 0.35 * (i / (v - 1)) : 0.85;
          inst.play(mix.ctx, out, time + (i * spb) / v, inst.base + ch.pitch, vel, spb / v, ch);
        }
      }
      const notes = pat.notes[ch.id];
      if (notes) {
        for (const n of notes) {
          if (n.start >= s && n.start < s + 1) {
            inst.play(mix.ctx, out, time + (n.start - s) * spb, n.pitch + ch.pitch, n.vel, n.len * spb, ch);
          }
        }
      }
    });
  }

  // Plays global step `step` for either pattern mode or song mode.
  function playStep(mix, P, mode, patId, step, time) {
    const spb = 60 / P.bpm / 4;
    const t = time + (step % 2 ? P.swing * spb * 0.5 : 0);
    if (mode === 'pattern') {
      const pat = P.patterns.find((p) => p.id === patId);
      if (pat) playPatternStep(mix, P, pat, step % pat.len, t, spb);
    } else {
      P.clips.forEach((c) => {
        const pat = P.patterns.find((p) => p.id === c.pat);
        if (!pat) return;
        const start = c.bar * STEPS_PER_BAR;
        if (step >= start && step < start + pat.len) playPatternStep(mix, P, pat, step - start, t, spb);
      });
    }
  }

  const Engine = {
    ctx: null, mix: null, playing: false,
    mode: 'pattern', patId: null,
    step: 0, nextTime: 0, timer: null, queue: [],
    pos: -1, // step currently audible (for playheads)
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.mix = new Mixer(this.ctx);
        this.mix.sync(Store.P);
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    },
    sync() { if (this.mix) this.mix.sync(Store.P); },
    loopLength() {
      const P = Store.P;
      if (this.mode === 'pattern') { const pat = patternById(this.patId); return pat ? pat.len : 16; }
      return Math.max(STEPS_PER_BAR, songLengthSteps(P));
    },
    play(fromStep) {
      this.ensure();
      this.sync();
      this.playing = true;
      this.step = fromStep || 0;
      this.queue = [];
      this.nextTime = this.ctx.currentTime + 0.06;
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
    },
    stop() {
      this.playing = false;
      clearInterval(this.timer);
      this.queue = [];
      this.pos = -1;
    },
    tick() {
      const P = Store.P;
      const spb = 60 / P.bpm / 4;
      while (this.nextTime < this.ctx.currentTime + 0.12) {
        const len = this.loopLength();
        if (this.step >= len) this.step = 0;
        playStep(this.mix, P, this.mode, this.patId, this.step, this.nextTime);
        this.queue.push({ step: this.step, time: this.nextTime });
        this.nextTime += spb;
        this.step++;
      }
    },
    // Called every animation frame; returns the step you can currently hear.
    updatePos() {
      if (!this.playing) return -1;
      const now = this.ctx.currentTime;
      while (this.queue.length > 1 && this.queue[1].time <= now) this.queue.shift();
      if (this.queue.length && this.queue[0].time <= now) this.pos = this.queue[0].step;
      return this.pos;
    },
    preview(ch, pitch, vel, dur) {
      this.ensure();
      this.sync();
      const out = this.mix.out(ch.id);
      if (!out) return;
      const inst = INSTRUMENTS[ch.inst];
      inst.play(this.ctx, out, this.ctx.currentTime + 0.005, (pitch == null ? inst.base : pitch) + ch.pitch, vel || 0.85, dur || 0.3, ch);
    },
  };

  /* ---------- Export ---------- */
  async function renderWav(mode, patId, loops) {
    const P = JSON.parse(JSON.stringify(Store.P));
    const spb = 60 / P.bpm / 4;
    let total;
    if (mode === 'song') total = songLengthSteps(P);
    else total = (P.patterns.find((p) => p.id === patId) || { len: 16 }).len * (loops || 1);
    if (!total) throw new Error('Nothing to export yet. Place some patterns in the Playlist first.');
    const sr = 44100;
    const seconds = total * spb + 3;
    const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const mix = new Mixer(off);
    mix.sync(P);
    // Offline params set with setTargetAtTime start at their default; snap them instead.
    snapParams(mix, P);
    for (let s = 0; s < total; s++) playStep(mix, P, mode, patId, s, 0.02 + s * spb);
    const buf = await off.startRendering();
    return encodeWav(buf);
  }
  function snapParams(mix, P) {
    const anySolo = P.channels.some((c) => c.solo);
    P.channels.forEach((ch) => {
      const b = mix.buses.get(ch.id);
      const audible = !ch.mute && (!anySolo || ch.solo);
      b.vol.gain.value = audible ? ch.vol * ch.vol : 0;
      b.pan.pan.value = ch.pan; b.filter.frequency.value = cutoffHz(ch.cutoff);
      b.rev.gain.value = ch.rev; b.dly.gain.value = ch.dly * 0.8;
    });
    const M = P.master;
    mix.masterGain.gain.value = M.vol;
    mix.compIn.gain.value = M.comp ? 1 : 0;
    mix.bypass.gain.value = M.comp ? 0 : 1;
    mix.delay.delayTime.value = Math.min(1.99, (60 / P.bpm) * M.dlyTime);
    mix.dlyFb.gain.value = M.dlyFb;
  }
  function encodeWav(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
    w(36, 'data'); data.setUint32(40, len * ch * 2, true);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i]));
        data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
      }
    }
    return new Blob([data], { type: 'audio/wav' });
  }

  Object.assign(window, { Engine, renderWav, cutoffHz });
})();
