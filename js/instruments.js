/* BrowserFL — built-in synthesized instruments.
 * Every instrument is generated with the Web Audio API, so no sample files are needed.
 * play(ctx, out, time, pitch, velocity, duration, channel)
 *   pitch    MIDI note number (60 = middle C)
 *   duration seconds the note is held (drums mostly ignore it)
 *   channel  the channel object, used for its "decay" setting
 */
(function () {
  const noiseCache = new WeakMap();
  function noise(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(ctx, b);
    }
    return b;
  }
  const curveCache = new WeakMap();
  function driveCurve(ctx) {
    let c = curveCache.get(ctx);
    if (!c) {
      c = new Float32Array(1024);
      for (let i = 0; i < c.length; i++) {
        const x = (i / (c.length - 1)) * 2 - 1;
        c[i] = Math.tanh(x * 2.2);
      }
      curveCache.set(ctx, c);
    }
    return c;
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ratio = (p, base) => Math.pow(2, (p - base) / 12);

  function noiseSrc(ctx, t, len) {
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    s.start(t, Math.random() * 1.5);
    s.stop(t + len + 0.05);
    return s;
  }
  function percEnv(ctx, t, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    return g;
  }
  function filter(ctx, type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(freq, 20000);
    if (q != null) f.Q.value = q;
    return f;
  }
  // 808-style metallic source: six detuned square waves
  function metal(ctx, t, len, r) {
    const sum = ctx.createGain();
    sum.gain.value = 0.25;
    [205.3, 304.4, 369.6, 522.7, 540, 800].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * 1.5 * r;
      o.connect(sum);
      o.start(t);
      o.stop(t + len + 0.05);
    });
    return sum;
  }

  /* Generic subtractive synth voice used by the melodic instruments. */
  function synthVoice(ctx, out, t, freq, vel, dur, o, decayMul) {
    const f = filter(ctx, 'lowpass', o.cutoff, o.q || 1);
    const peakF = Math.min(o.cutoff + (o.envAmt || 0), 18000);
    f.frequency.setValueAtTime(peakF, t);
    f.frequency.setTargetAtTime(o.cutoff, t, ((o.fDecay || 0.2) * decayMul) / 3);
    const g = ctx.createGain();
    const A = o.attack, D = o.decay * decayMul, S = o.sustain, R = o.release * decayMul;
    const peak = vel * (o.gain || 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + A);
    g.gain.setTargetAtTime(peak * S, t + A, D / 3);
    const end = t + Math.max(dur, A + 0.01);
    g.gain.setTargetAtTime(0, end, R / 3);
    const stopAt = end + R * 2 + 0.1;
    o.oscs.forEach((spec) => {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = freq * Math.pow(2, spec.oct || 0);
      osc.detune.value = spec.detune || 0;
      const og = ctx.createGain();
      og.gain.value = spec.gain == null ? 1 : spec.gain;
      osc.connect(og).connect(f);
      osc.start(t);
      osc.stop(stopAt);
    });
    f.connect(g).connect(out);
  }

  const I = {};

  /* ---------- Drums ---------- */
  I.kick = {
    name: 'Kick', group: 'Drums', base: 36, color: '#ff7a59',
    tip: 'The deep thump that drives the beat.',
    play(ctx, out, t, p, v, dur, ch) {
      const r = ratio(p, this.base), d = 0.5 * ch.decay;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(160 * r, t);
      o.frequency.exponentialRampToValueAtTime(48 * r, t + 0.08);
      const g = percEnv(ctx, t, v, d);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + d + 0.05);
      const c = noiseSrc(ctx, t, 0.01);
      const cg = percEnv(ctx, t, v * 0.3, 0.012);
      c.connect(filter(ctx, 'highpass', 2000)).connect(cg).connect(out);
    },
  };
  I.snare = {
    name: 'Snare', group: 'Drums', base: 60, color: '#ffc94a',
    tip: 'The crack on beats 2 and 4.',
    play(ctx, out, t, p, v, dur, ch) {
      const r = ratio(p, this.base), d = 0.22 * ch.decay;
      const n = noiseSrc(ctx, t, d);
      n.connect(filter(ctx, 'highpass', 1400 * r)).connect(percEnv(ctx, t, v * 0.8, d)).connect(out);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(240 * r, t);
      o.frequency.exponentialRampToValueAtTime(170 * r, t + 0.05);
      o.connect(percEnv(ctx, t, v * 0.7, 0.1 * ch.decay)).connect(out);
      o.start(t); o.stop(t + 0.2);
    },
  };
  I.clap = {
    name: 'Clap', group: 'Drums', base: 60, color: '#ffd97a',
    tip: 'Hand clap. Layer it with a snare or use it alone.',
    play(ctx, out, t, p, v, dur, ch) {
      const r = ratio(p, this.base), d = 0.25 * ch.decay;
      const n = noiseSrc(ctx, t, d + 0.03);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      [0, 0.011, 0.022].forEach((o) => {
        g.gain.setValueAtTime(v, t + o);
        g.gain.exponentialRampToValueAtTime(v * 0.2, t + o + 0.009);
      });
      g.gain.setValueAtTime(v * 0.8, t + 0.031);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.031 + d);
      n.connect(filter(ctx, 'bandpass', 1300 * r, 1.2)).connect(g).connect(out);
    },
  };
  I.hat = {
    name: 'Hi-Hat', group: 'Drums', base: 60, color: '#7fe3c8',
    tip: 'Closed hi-hat. Fast ticking that keeps time. Right-click a step for rolls.',
    play(ctx, out, t, p, v, dur, ch) {
      const r = ratio(p, this.base), d = 0.06 * ch.decay;
      const src = metal(ctx, t, d, r);
      src.connect(filter(ctx, 'bandpass', 10000, 0.8))
        .connect(filter(ctx, 'highpass', 7000))
        .connect(percEnv(ctx, t, v * 0.9, d)).connect(out);
    },
  };
  I.ohat = {
    name: 'Open Hat', group: 'Drums', base: 60, color: '#5cc8e8',
    tip: 'Open hi-hat. A longer sizzle, often on the off-beat.',
    play(ctx, out, t, p, v, dur, ch) {
      const r = ratio(p, this.base), d = 0.4 * ch.decay;
      const src = metal(ctx, t, d, r);
      src.connect(filter(ctx, 'bandpass', 10000, 0.8))
        .connect(filter(ctx, 'highpass', 7000))
        .connect(percEnv(ctx, t, v * 0.8, d)).connect(out);
    },
  };
  I.rim = {
    name: 'Rim', group: 'Drums', base: 60, color: '#c9a2ff',
    tip: 'Short woody click. Great for lo-fi and extra groove.',
    play(ctx, out, t, p, v, dur, ch) {
      const r = ratio(p, this.base), d = 0.04 * ch.decay;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 1700 * r;
      o.connect(filter(ctx, 'bandpass', 1700 * r, 3)).connect(percEnv(ctx, t, v * 1.4, d)).connect(out);
      o.start(t); o.stop(t + d + 0.05);
    },
  };
  I.tom = {
    name: 'Tom', group: 'Drums', base: 50, color: '#ff9fb3',
    tip: 'Drum tom. Use it for fills before a drop.',
    play(ctx, out, t, p, v, dur, ch) {
      const r = ratio(p, this.base), d = 0.35 * ch.decay;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(200 * r, t);
      o.frequency.exponentialRampToValueAtTime(110 * r, t + d);
      o.connect(percEnv(ctx, t, v, d)).connect(out);
      o.start(t); o.stop(t + d + 0.05);
    },
  };
  I.crash = {
    name: 'Crash', group: 'Drums', base: 60, color: '#9ad0ff',
    tip: 'Cymbal crash. Put one at the start of a new section.',
    play(ctx, out, t, p, v, dur, ch) {
      const r = ratio(p, this.base), d = 1.6 * ch.decay;
      const src = metal(ctx, t, d, r * 1.3);
      const n = noiseSrc(ctx, t, d);
      const g = percEnv(ctx, t, v * 0.6, d);
      const hp = filter(ctx, 'highpass', 5000);
      src.connect(hp); n.connect(hp); hp.connect(g).connect(out);
    },
  };

  /* ---------- Melodic ---------- */
  I.b808 = {
    name: '808', group: 'Bass', base: 36, color: '#ff5f8a', melodic: true,
    tip: 'Booming sub-bass. Open the Piano Roll to give it a melody.',
    play(ctx, out, t, p, v, dur, ch) {
      const f = mtof(p);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(ctx);
      const g = ctx.createGain();
      const peak = v * 0.9;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      g.gain.setTargetAtTime(0, t + 0.01, 0.55 * ch.decay);
      const end = t + Math.max(dur, 0.05);
      g.gain.setTargetAtTime(0, end, 0.03);
      o.connect(ws).connect(g).connect(out);
      o.start(t); o.stop(end + 0.25);
    },
  };
  I.bass = {
    name: 'Synth Bass', group: 'Bass', base: 36, color: '#ff8c42', melodic: true,
    tip: 'Punchy bass synth for house and dance music.',
    play(ctx, out, t, p, v, dur, ch) {
      synthVoice(ctx, out, t, mtof(p), v, dur, {
        oscs: [{ type: 'sawtooth' }, { type: 'square', oct: -1, gain: 0.6 }],
        cutoff: 350, envAmt: 1800, fDecay: 0.18, q: 4,
        attack: 0.004, decay: 0.25, sustain: 0.6, release: 0.08, gain: 0.32,
      }, ch.decay);
    },
  };
  I.keys = {
    name: 'Keys', group: 'Keys', base: 60, color: '#ffd6a0', melodic: true,
    tip: 'Soft electric piano. Perfect for chords and lo-fi.',
    play(ctx, out, t, p, v, dur, ch) {
      synthVoice(ctx, out, t, mtof(p), v, dur, {
        oscs: [{ type: 'sine' }, { type: 'triangle', oct: 1, gain: 0.25 }, { type: 'sine', oct: 2, gain: 0.06 }],
        cutoff: 2600, envAmt: 2000, fDecay: 0.3,
        attack: 0.004, decay: 1.4, sustain: 0.25, release: 0.35, gain: 0.32,
      }, ch.decay);
    },
  };
  I.pluck = {
    name: 'Pluck', group: 'Keys', base: 60, color: '#b4f08a', melodic: true,
    tip: 'Short plucky synth. Good for catchy riffs.',
    play(ctx, out, t, p, v, dur, ch) {
      synthVoice(ctx, out, t, mtof(p), v, dur, {
        oscs: [{ type: 'sawtooth' }, { type: 'square', detune: 7, gain: 0.5 }],
        cutoff: 500, envAmt: 5000, fDecay: 0.15, q: 2,
        attack: 0.002, decay: 0.3, sustain: 0, release: 0.15, gain: 0.25,
      }, ch.decay);
    },
  };
  I.lead = {
    name: 'Lead', group: 'Synth', base: 60, color: '#6fb8ff', melodic: true,
    tip: 'Bright, wide synth lead for melodies that stand out.',
    play(ctx, out, t, p, v, dur, ch) {
      synthVoice(ctx, out, t, mtof(p), v, dur, {
        oscs: [{ type: 'sawtooth', detune: -12 }, { type: 'sawtooth', detune: 12 }, { type: 'square', oct: -1, gain: 0.3 }],
        cutoff: 2400, envAmt: 3000, fDecay: 0.25, q: 1.5,
        attack: 0.006, decay: 0.4, sustain: 0.6, release: 0.18, gain: 0.18,
      }, ch.decay);
    },
  };
  I.pad = {
    name: 'Pad', group: 'Synth', base: 60, color: '#a58bff', melodic: true,
    tip: 'Slow, airy chords that fill the background.',
    play(ctx, out, t, p, v, dur, ch) {
      synthVoice(ctx, out, t, mtof(p), v, dur, {
        oscs: [{ type: 'sawtooth', detune: -14 }, { type: 'sawtooth', detune: 14 }, { type: 'triangle', oct: -1, gain: 0.5 }],
        cutoff: 1300, envAmt: 400, fDecay: 1,
        attack: 0.45, decay: 1, sustain: 0.8, release: 0.9, gain: 0.12,
      }, ch.decay);
    },
  };
  I.bell = {
    name: 'Bell', group: 'Synth', base: 72, color: '#f0e68c', melodic: true,
    tip: 'Glassy bell sound. A classic for trap melodies.',
    play(ctx, out, t, p, v, dur, ch) {
      const f = mtof(p), d = 1.6 * ch.decay;
      const car = ctx.createOscillator(), mod = ctx.createOscillator();
      car.frequency.value = f;
      mod.frequency.value = f * 3.5;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 2.5, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.1, t + d);
      mod.connect(mg).connect(car.frequency);
      const g = percEnv(ctx, t, v * 0.35, d);
      car.connect(g).connect(out);
      car.start(t); mod.start(t);
      car.stop(t + d + 0.05); mod.stop(t + d + 0.05);
    },
  };

  window.INSTRUMENTS = I;
  window.mtof = mtof;
})();
