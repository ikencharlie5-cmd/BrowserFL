/* BrowserFL — project data, templates, undo history and saving. */
(function () {
  const STEPS_PER_BAR = 16;
  const PATTERN_COLORS = ['#ff9a3c', '#5cc8e8', '#b4f08a', '#ff5f8a', '#a58bff', '#ffd97a', '#7fe3c8', '#ff7a59'];
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    'minor pentatonic': [0, 3, 5, 7, 10],
    'major pentatonic': [0, 2, 4, 7, 9],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  };

  const uid = () => Math.random().toString(36).slice(2, 9);
  const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
  // 'C4' -> 60, 'Eb3' -> 51
  function nn(s) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return base + acc + (parseInt(m[3], 10) + 1) * 12;
  }

  function makeChannel(inst, over) {
    const def = INSTRUMENTS[inst];
    return Object.assign({
      id: uid(), name: def.name, inst, color: def.color,
      vol: 0.8, pan: 0, pitch: 0, decay: 1, cutoff: 1, rev: 0, dly: 0,
      mute: false, solo: false,
    }, over || {});
  }
  function makePattern(name, len) {
    return { id: uid(), name, len: len || 16, steps: {}, notes: {} };
  }
  function newProject(name) {
    return {
      version: 1, name: name || 'My Beat', bpm: 120, swing: 0,
      channels: [], patterns: [], clips: [],
      master: { vol: 0.85, revSize: 2.2, dlyTime: 0.75, dlyFb: 0.35, comp: true },
      scale: { root: 0, type: 'minor', on: true, lock: false },
    };
  }

  /* ---------- Template builder helpers ---------- */
  // steps('x...x...') -> array; digits 2-4 are rolls
  function steps(str, len) {
    const s = str.replace(/\s|\|/g, '');
    const out = [];
    for (let i = 0; i < (len || s.length); i++) {
      const c = s[i % s.length];
      out.push(c === 'x' ? 1 : /[2-4]/.test(c) ? +c : 0);
    }
    return out;
  }
  const N = (start, pitch, len, vel) => ({ start, pitch: typeof pitch === 'string' ? nn(pitch) : pitch, len, vel: vel == null ? 0.8 : vel });
  function chord(start, names, len, vel) { return names.map((p) => N(start, p, len, vel)); }

  function build(def) {
    const P = newProject(def.name);
    P.bpm = def.bpm; P.swing = def.swing || 0;
    if (def.scale) Object.assign(P.scale, def.scale);
    const byKey = {};
    def.channels.forEach(([key, inst, over]) => {
      const ch = makeChannel(inst, over);
      byKey[key] = ch; P.channels.push(ch);
    });
    const patByKey = {};
    def.patterns.forEach((pd) => {
      const pat = makePattern(pd.name, pd.len);
      Object.entries(pd.steps || {}).forEach(([k, v]) => { pat.steps[byKey[k].id] = steps(v, pd.len); });
      Object.entries(pd.notes || {}).forEach(([k, v]) => { pat.notes[byKey[k].id] = v; });
      patByKey[pd.key] = pat; P.patterns.push(pat);
    });
    (def.clips || []).forEach(([track, bar, key]) => P.clips.push({ id: uid(), track, bar, pat: patByKey[key].id }));
    return P;
  }

  const TEMPLATES = {
    starter: {
      title: 'Starter Beat', blurb: 'A simple 4-on-the-floor loop. The best place to begin.',
      make: () => build({
        name: 'My First Beat', bpm: 120,
        channels: [['k', 'kick'], ['c', 'clap'], ['h', 'hat', { vol: 0.6 }], ['o', 'ohat', { vol: 0.5 }],
          ['s', 'snare', { vol: 0.7 }], ['b', 'b808'], ['p', 'keys', { rev: 0.25 }], ['l', 'lead', { vol: 0.6, dly: 0.25 }]],
        patterns: [{ key: 'a', name: 'Beat 1', len: 16, steps: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' } }],
        clips: [[0, 0, 'a'], [0, 1, 'a'], [0, 2, 'a'], [0, 3, 'a']],
      }),
    },
    trap: {
      title: 'Trap', blurb: '140 BPM, rolling hi-hats, booming 808s and a bell melody in C minor.',
      make: () => build({
        name: 'Trap Night', bpm: 140, scale: { root: 0, type: 'minor' },
        channels: [['k', 'kick'], ['c', 'clap', { rev: 0.15 }], ['h', 'hat', { vol: 0.55, pan: 0.15 }],
          ['o', 'ohat', { vol: 0.45, pan: -0.15 }], ['b', 'b808', { vol: 0.85 }],
          ['m', 'bell', { vol: 0.6, rev: 0.35, dly: 0.25 }], ['p', 'pad', { vol: 0.45, rev: 0.4, cutoff: 0.8 }]],
        patterns: [
          { key: 'mel', name: 'Melody', len: 32,
            notes: {
              m: [N(0, 'C5', 2), N(3, 'Eb5', 2), N(6, 'G5', 2), N(8, 'F5', 2), N(11, 'Eb5', 2), N(14, 'D5', 2),
                N(16, 'C5', 2), N(19, 'Eb5', 2), N(22, 'G5', 2), N(24, 'Ab5', 2), N(27, 'G5', 2), N(30, 'Eb5', 2)],
              p: [...chord(0, ['C4', 'Eb4', 'G4'], 16, 0.6), ...chord(16, ['Ab3', 'C4', 'Eb4'], 16, 0.6)],
            } },
          { key: 'dr', name: 'Drums + 808', len: 32,
            steps: {
              k: 'x......x..x.....x.....x...x.....',
              c: '........x...............x.......',
              h: 'x.x.x.2.x.x.x.3.x.x.x.2.x.x.x.4.',
              o: '............................x...',
            },
            notes: { b: [N(0, 'C2', 6), N(7, 'C2', 2), N(10, 'Eb2', 5), N(16, 'Ab1', 6), N(22, 'G1', 3), N(26, 'G1', 5)] } },
        ],
        clips: [[0, 0, 'mel'], [0, 2, 'mel'], [0, 4, 'mel'], [0, 6, 'mel'], [1, 2, 'dr'], [1, 4, 'dr'], [1, 6, 'dr']],
      }),
    },
    house: {
      title: 'House', blurb: '124 BPM four-on-the-floor with off-beat bass and chord stabs in A minor.',
      make: () => build({
        name: 'Warehouse', bpm: 124, scale: { root: 9, type: 'minor' },
        channels: [['k', 'kick'], ['c', 'clap', { rev: 0.2 }], ['h', 'hat', { vol: 0.5 }], ['o', 'ohat', { vol: 0.55 }],
          ['b', 'bass', { vol: 0.75 }], ['s', 'keys', { vol: 0.7, rev: 0.3, dly: 0.2 }], ['l', 'lead', { vol: 0.5, dly: 0.3, rev: 0.25 }]],
        patterns: [
          { key: 'dr', name: 'Drums', len: 16,
            steps: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', o: '..x...x...x...x.' } },
          { key: 'gr', name: 'Bass + Chords', len: 64,
            notes: {
              b: [0, 1, 2, 3].flatMap((bar) => {
                const root = [nn('A2'), nn('F2'), nn('C3'), nn('G2')][bar];
                return [2, 6, 10, 14].map((s) => N(bar * 16 + s, root, 1.5, 0.85));
              }),
              s: [0, 1, 2, 3].flatMap((bar) => {
                const ch = [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['G3', 'C4', 'E4'], ['G3', 'B3', 'D4']][bar];
                return [3, 6, 11, 14].flatMap((s) => chord(bar * 16 + s, ch, 1, 0.7));
              }),
            } },
          { key: 'ld', name: 'Lead Hook', len: 64,
            notes: {
              l: [N(0, 'E5', 3), N(4, 'C5', 2), N(6, 'D5', 2), N(8, 'E5', 6), N(16, 'F5', 3), N(20, 'E5', 2), N(22, 'C5', 2), N(24, 'A4', 6),
                N(32, 'G4', 3), N(36, 'C5', 2), N(38, 'E5', 2), N(40, 'G5', 6), N(48, 'D5', 4), N(52, 'B4', 4), N(56, 'G4', 6)],
            } },
        ],
        clips: [[0, 0, 'dr'], [0, 1, 'dr'], [0, 2, 'dr'], [0, 3, 'dr'], [0, 4, 'dr'], [0, 5, 'dr'], [0, 6, 'dr'], [0, 7, 'dr'],
          [0, 8, 'dr'], [0, 9, 'dr'], [0, 10, 'dr'], [0, 11, 'dr'],
          [1, 4, 'gr'], [1, 8, 'gr'], [2, 8, 'ld']],
      }),
    },
    lofi: {
      title: 'Lo-fi', blurb: '80 BPM swung drums, jazzy 7th chords and a muffled, dusty mix.',
      make: () => build({
        name: 'Rainy Window', bpm: 80, swing: 0.45, scale: { root: 0, type: 'major' },
        channels: [['k', 'kick', { cutoff: 0.7 }], ['s', 'snare', { cutoff: 0.65, rev: 0.2, vol: 0.65 }],
          ['h', 'hat', { cutoff: 0.75, vol: 0.45 }], ['r', 'rim', { cutoff: 0.8, vol: 0.5, rev: 0.2 }],
          ['p', 'keys', { cutoff: 0.72, rev: 0.4, vol: 0.75 }], ['b', 'bass', { cutoff: 0.6, vol: 0.7 }]],
        patterns: [
          { key: 'dr', name: 'Drums', len: 16,
            steps: { k: 'x......x..x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx', r: '.......x.....x..' } },
          { key: 'ch', name: 'Chords + Bass', len: 64,
            notes: {
              p: [['F3', 'A3', 'C4', 'E4'], ['E3', 'G3', 'B3', 'D4'], ['D3', 'F3', 'A3', 'C4'], ['C3', 'E3', 'G3', 'B3']]
                .flatMap((c, bar) => [...chord(bar * 16, c, 7, 0.65), ...chord(bar * 16 + 10, c, 5, 0.5)]),
              b: [['F2', 'C3'], ['E2', 'B2'], ['D2', 'A2'], ['C2', 'G2']]
                .flatMap(([r, f], bar) => [N(bar * 16, r, 6), N(bar * 16 + 7, f, 2, 0.6), N(bar * 16 + 10, r, 4, 0.7)]),
            } },
        ],
        clips: [[0, 0, 'ch'], [0, 4, 'ch'], [0, 8, 'ch'], [1, 4, 'dr'], [1, 5, 'dr'], [1, 6, 'dr'], [1, 7, 'dr'],
          [1, 8, 'dr'], [1, 9, 'dr'], [1, 10, 'dr'], [1, 11, 'dr']],
      }),
    },
    empty: {
      title: 'Empty Project', blurb: 'Just a kick, clap and hat. Build everything yourself.',
      make: () => build({
        name: 'Untitled', bpm: 120,
        channels: [['k', 'kick'], ['c', 'clap'], ['h', 'hat']],
        patterns: [{ key: 'a', name: 'Pattern 1', len: 16 }],
      }),
    },
  };

  /* ---------- Store: current project + undo ---------- */
  const LS_AUTOSAVE = 'browserfl.autosave';
  const LS_PROJECTS = 'browserfl.projects';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };

  const Store = {
    P: null,
    history: [], future: [],
    listeners: [],
    load(project, keepHistory) {
      this.P = normalize(project);
      if (!keepHistory) { this.history = [JSON.stringify(this.P)]; this.future = []; }
      this.emit('load');
    },
    // Called after any edit finishes; records an undo step if something changed.
    checkpoint() {
      const s = JSON.stringify(this.P);
      if (s === this.history[this.history.length - 1]) return;
      this.history.push(s);
      if (this.history.length > 80) this.history.shift();
      this.future = [];
      ls.set(LS_AUTOSAVE, s);
    },
    undo() {
      this.checkpoint();
      if (this.history.length < 2) return false;
      this.future.push(this.history.pop());
      this.P = JSON.parse(this.history[this.history.length - 1]);
      this.emit('load');
      return true;
    },
    redo() {
      if (!this.future.length) return false;
      const s = this.future.pop();
      this.history.push(s);
      this.P = JSON.parse(s);
      this.emit('load');
      return true;
    },
    on(fn) { this.listeners.push(fn); },
    emit(type) { this.listeners.forEach((fn) => fn(type)); },
    restoreAutosave() {
      const s = ls.get(LS_AUTOSAVE);
      if (!s) return false;
      try { this.load(JSON.parse(s)); return true; } catch (e) { return false; }
    },
    savedProjects() {
      try { return JSON.parse(ls.get(LS_PROJECTS) || '{}'); } catch (e) { return {}; }
    },
    saveAs(name) {
      const all = this.savedProjects();
      this.P.name = name;
      all[name] = { savedAt: Date.now(), data: this.P };
      return ls.set(LS_PROJECTS, JSON.stringify(all));
    },
    deleteSaved(name) {
      const all = this.savedProjects();
      delete all[name];
      ls.set(LS_PROJECTS, JSON.stringify(all));
    },
  };

  function normalize(p) {
    const base = newProject();
    p = Object.assign(base, p);
    p.master = Object.assign(newProject().master, p.master);
    p.scale = Object.assign(newProject().scale, p.scale);
    p.channels = p.channels.filter((c) => INSTRUMENTS[c.inst]);
    if (!p.patterns.length) p.patterns.push(makePattern('Pattern 1'));
    return p;
  }

  /* ---------- Queries ---------- */
  function patternById(id) { return Store.P.patterns.find((p) => p.id === id); }
  function channelById(id) { return Store.P.channels.find((c) => c.id === id); }
  function patternColor(pat) { return PATTERN_COLORS[Store.P.patterns.indexOf(pat) % PATTERN_COLORS.length]; }
  function songLengthSteps(P) {
    P = P || Store.P;
    let end = 0;
    P.clips.forEach((c) => {
      const pat = P.patterns.find((p) => p.id === c.pat);
      if (pat) end = Math.max(end, c.bar * STEPS_PER_BAR + pat.len);
    });
    return end;
  }
  function scaleNotes(P) {
    const sc = (P || Store.P).scale;
    return new Set(SCALES[sc.type].map((i) => (i + sc.root) % 12));
  }

  Object.assign(window, {
    STEPS_PER_BAR, PATTERN_COLORS, NOTE_NAMES, SCALES, TEMPLATES,
    uid, noteName, nn, makeChannel, makePattern, newProject, Store,
    patternById, channelById, patternColor, songLengthSteps, scaleNotes,
  });
})();
