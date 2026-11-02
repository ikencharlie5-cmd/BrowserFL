/* BrowserFL — shared UI helpers + Channel Rack (step sequencer). */
(function () {
  window.UI = { view: 'rack', patId: null, chId: null };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const curPat = () => patternById(UI.patId) || Store.P.patterns[0];
  const curCh = () => channelById(UI.chId) || Store.P.channels[0];

  const pct = (v) => Math.round(v * 100) + '%';
  const PARAMS = {
    vol: { label: 'Volume', min: 0, max: 1, step: 0.01, fmt: pct, tip: 'How loud this channel is.' },
    pan: { label: 'Pan', min: -1, max: 1, step: 0.01, fmt: (v) => (Math.abs(v) < 0.01 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100)), tip: 'Moves the sound left or right in your headphones.' },
    pitch: { label: 'Pitch', min: -24, max: 24, step: 1, fmt: (v) => (v > 0 ? '+' : '') + v + 'st', tip: 'Tune the sound up or down in semitones. 12 semitones = one octave.' },
    decay: { label: 'Length', min: 0.2, max: 3, step: 0.05, fmt: (v) => '×' + Number(v).toFixed(1), tip: 'How long the sound rings out after it is hit.' },
    cutoff: { label: 'Filter', min: 0, max: 1, step: 0.01, fmt: (v) => { const hz = cutoffHz(v); return hz >= 20000 ? 'open' : hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : Math.round(hz) + ''; }, tip: 'Low-pass filter. Turn it down for a darker, muffled sound (classic lo-fi, or a build-up effect).' },
    rev: { label: 'Reverb', min: 0, max: 1, step: 0.01, fmt: pct, tip: 'Reverb makes it sound like it is playing in a big room.' },
    dly: { label: 'Delay', min: 0, max: 1, step: 0.01, fmt: pct, tip: 'Delay adds echoes that repeat in time with the beat.' },
  };

  // Range input bound to a channel parameter. All inputs for the same param stay in sync.
  function paramInput(ch, key, cls) {
    const p = PARAMS[key];
    const inp = h('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: ch[key], class: cls, 'data-ch': ch.id, 'data-k': key, 'data-tip': p.label + ': ' + p.tip, 'aria-label': ch.name + ' ' + p.label, id: 'p-' + key + '-' + ch.id + '-' + (cls || 'x') });
    inp.addEventListener('dblclick', () => { setParam(ch.id, key, { vol: 0.8, pan: 0, pitch: 0, decay: 1, cutoff: 1, rev: 0, dly: 0 }[key]); });
    return inp;
  }
  function setParam(chId, key, v) {
    const ch = channelById(chId);
    if (!ch) return;
    ch[key] = v;
    Engine.sync();
    document.querySelectorAll(`[data-ch="${chId}"][data-k="${key}"]`).forEach((el) => {
      if (el.tagName === 'OUTPUT') el.textContent = PARAMS[key].fmt(v);
      else if (+el.value !== v) el.value = v;
    });
    Store.checkpointSoon();
  }
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.ch && t.dataset.k) setParam(t.dataset.ch, t.dataset.k, parseFloat(t.value));
  });

  /* ---------- Rack ---------- */
  function ensureSteps(pat, ch) {
    let a = pat.steps[ch.id];
    if (!a) a = pat.steps[ch.id] = [];
    while (a.length < pat.len) a.push(0);
    return a;
  }
  function hasNotes(pat, ch) { const n = pat.notes[ch.id]; return n && n.length > 0; }

  function paintStep(el, v) {
    el.classList.toggle('on', !!v);
    el.innerHTML = '';
    if (v > 1) {
      const r = h('span', { class: 'roll' });
      for (let i = 0; i < v; i++) r.append(h('i'));
      el.append(r);
    }
  }

  function renderRack() {
    const rack = $('#rack');
    rack.innerHTML = '';
    const pat = curPat();
    const P = Store.P;
    P.channels.forEach((ch) => {
      const row = h('div', { class: 'row' + (ch.id === UI.chId ? ' sel' : ''), 'data-ch-row': ch.id, style: { '--c': ch.color } });
      row.append(
        h('button', { class: 'led' + (ch.mute ? ' off' : ''), 'data-act': 'mute', 'data-tip': 'Mute: green = on, grey = muted.', 'aria-label': 'Mute ' + ch.name }),
        h('button', { class: 'solo' + (ch.solo ? ' on' : ''), 'data-act': 'solo', 'data-tip': 'Solo: hear only this channel (plus other soloed ones).', text: 'S' }),
        paramInput(ch, 'vol', 'knob-mini'),
        paramInput(ch, 'pan', 'knob-mini'),
        h('button', { class: 'ch-name', 'data-act': 'select', text: ch.name, 'data-tip': 'Click to select and edit this channel. Double-click to open it in the Piano Roll.' }),
      );
      if (hasNotes(pat, ch)) {
        const beats = pat.len / 4, w = beats * 94 + (beats - 1) * 3 + (pat.len / 16 - 1) * 9;
        const c = h('canvas', { class: 'mini-roll', width: w, height: 30, 'data-act': 'piano', 'data-tip': 'This channel uses the Piano Roll in this pattern. Click to edit its notes.' });
        c.style.width = w + 'px';
        drawMiniRoll(c, pat, ch);
        row.append(c);
      } else {
        const steps = ensureSteps(pat, ch);
        const wrap = h('div', { class: 'steps' });
        for (let b = 0; b < pat.len / 4; b++) {
          if (b && b % 4 === 0) wrap.append(h('div', { class: 'bar-gap' }));
          const beat = h('div', { class: 'beat' });
          for (let i = 0; i < 4; i++) {
            const idx = b * 4 + i;
            const st = h('div', { class: 'step', 'data-step': idx });
            paintStep(st, steps[idx]);
            beat.append(st);
          }
          wrap.append(beat);
        }
        row.append(wrap);
      }
      row.append(h('button', { class: 'pr-btn', 'data-act': 'piano', 'data-tip': 'Open this channel in the Piano Roll to draw melodies.', 'aria-label': 'Piano roll for ' + ch.name },
        pianoIcon()));
      rack.append(row);
    });
    renderChPanel();
  }
  function pianoIcon() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('width', '18'); s.setAttribute('height', '18');
    s.innerHTML = '<rect x="2" y="3" width="16" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 3v9M11 3v9M15 3v9" stroke="currentColor" stroke-width="2.4"/>';
    return s;
  }
  function drawMiniRoll(c, pat, ch) {
    const g = c.getContext('2d');
    const notes = pat.notes[ch.id];
    let lo = Infinity, hi = -Infinity;
    notes.forEach((n) => { lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); });
    const range = Math.max(1, hi - lo);
    g.fillStyle = ch.color;
    const sx = c.width / pat.len;
    notes.forEach((n) => {
      const y = 3 + (1 - (n.pitch - lo) / range) * 22;
      g.fillRect(n.start * sx, y, Math.max(2, n.len * sx - 1), 3);
    });
  }

  function setStep(chId, idx, v) {
    const pat = curPat();
    const ch = channelById(chId);
    ensureSteps(pat, ch)[idx] = v;
    const el = document.querySelector(`[data-ch-row="${chId}"] .step[data-step="${idx}"]`);
    if (el) paintStep(el, v);
  }

  let paint = null; // { chId, value }
  function stepTarget(e) {
    const el = e.target.closest ? e.target.closest('.step') : null;
    if (!el) return null;
    const row = el.closest('[data-ch-row]');
    return { el, chId: row.dataset.chRow, idx: +el.dataset.step };
  }
  function bindRack() {
    const rack = $('#rack');
    rack.addEventListener('pointerdown', (e) => {
      const t = stepTarget(e);
      if (!t || e.button !== 0) return;
      e.preventDefault();
      const cur = ensureSteps(curPat(), channelById(t.chId))[t.idx];
      paint = { chId: t.chId, value: cur ? 0 : 1 };
      setStep(t.chId, t.idx, paint.value);
      if (paint.value && !Engine.playing) Engine.preview(channelById(t.chId));
      selectChannel(t.chId, true);
    });
    document.addEventListener('pointermove', (e) => {
      if (!paint) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const t = el && stepTarget({ target: el });
      if (t && t.chId === paint.chId) {
        const cur = ensureSteps(curPat(), channelById(t.chId))[t.idx];
        if (!!cur !== !!paint.value) setStep(t.chId, t.idx, paint.value);
      }
    });
    document.addEventListener('pointerup', () => { paint = null; });
    rack.addEventListener('contextmenu', (e) => {
      const t = stepTarget(e);
      if (!t) return;
      e.preventDefault();
      const cur = ensureSteps(curPat(), channelById(t.chId))[t.idx];
      const next = cur >= 4 ? 1 : cur + 1;
      setStep(t.chId, t.idx, next);
      if (!Engine.playing) {
        const ch = channelById(t.chId);
        const spb = 60 / Store.P.bpm / 4;
        for (let i = 0; i < next; i++) setTimeout(() => Engine.preview(ch, null, 0.8, spb / next), (i * spb * 1000) / next);
      }
      App.hint(next > 1 ? `Roll ×${next}: this step now plays ${next} fast hits. Right-click again to change.` : 'Roll off. Right-click again for a 2× roll.');
      Store.checkpointSoon();
    });
    rack.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const chId = btn.closest('[data-ch-row]').dataset.chRow;
      const ch = channelById(chId);
      const act = btn.dataset.act;
      if (act === 'mute') { ch.mute = !ch.mute; btn.classList.toggle('off', ch.mute); Engine.sync(); App.renderMixer(); }
      else if (act === 'solo') { ch.solo = !ch.solo; Engine.sync(); renderRack(); App.renderMixer(); }
      else if (act === 'select') { selectChannel(chId); if (!Engine.playing) Engine.preview(ch); }
      else if (act === 'piano') { App.openPiano(chId); }
      Store.checkpointSoon();
    });
    rack.addEventListener('dblclick', (e) => {
      const btn = e.target.closest('[data-act="select"]');
      if (btn) App.openPiano(btn.closest('[data-ch-row]').dataset.chRow);
    });

    const sel = $('#addInst');
    const groups = {};
    Object.entries(INSTRUMENTS).forEach(([id, def]) => {
      if (!groups[def.group]) { groups[def.group] = h('optgroup', { label: def.group }); sel.append(groups[def.group]); }
      groups[def.group].append(h('option', { value: id, text: def.name }));
    });
    $('#addChannel').addEventListener('click', () => {
      const ch = makeChannel(sel.value);
      Store.P.channels.push(ch);
      UI.chId = ch.id;
      Engine.sync();
      renderRack();
      App.renderMixer();
      Store.checkpoint();
      App.toast(`Added ${ch.name}`);
      const melodic = INSTRUMENTS[ch.inst].melodic;
      App.hint(melodic ? `<b>${ch.name}</b> is a melodic instrument. Click the piano icon on its row to write notes.` : `Click the squares in the <b>${ch.name}</b> row to add hits.`);
    });
  }

  function selectChannel(id, quiet) {
    if (UI.chId === id && quiet) return;
    UI.chId = id;
    document.querySelectorAll('#rack .row').forEach((r) => r.classList.toggle('sel', r.dataset.chRow === id));
    renderChPanel();
    if (window.matchMedia('(max-width: 760px)').matches && !quiet) $('#chPanel').classList.add('show');
  }

  function renderChPanel() {
    const panel = $('#chPanel');
    panel.innerHTML = '';
    const ch = curCh();
    if (!ch) { panel.append(h('p', { class: 'muted', text: 'Add a channel to get started.' })); return; }
    const def = INSTRUMENTS[ch.inst];
    const name = h('input', { type: 'text', value: ch.name, 'aria-label': 'Channel name', id: 'chName', 'data-tip': 'Rename this channel.' });
    name.addEventListener('input', () => {
      ch.name = name.value;
      const b = document.querySelector(`[data-ch-row="${ch.id}"] .ch-name`);
      if (b) b.textContent = ch.name;
      Store.checkpointSoon();
    });
    const color = h('input', { type: 'color', value: ch.color, 'aria-label': 'Channel color', id: 'chColor', 'data-tip': 'Pick a color for this channel.' });
    color.addEventListener('input', () => {
      ch.color = color.value;
      const row = document.querySelector(`[data-ch-row="${ch.id}"]`);
      if (row) row.style.setProperty('--c', ch.color);
      Store.checkpointSoon();
    });

    const inst = h('select', { id: 'chInst', 'aria-label': 'Instrument', 'data-tip': 'Swap the sound this channel plays. Your notes and steps stay.' });
    const groups = {};
    Object.entries(INSTRUMENTS).forEach(([id, d]) => {
      if (!groups[d.group]) { groups[d.group] = h('optgroup', { label: d.group }); inst.append(groups[d.group]); }
      groups[d.group].append(h('option', { value: id, text: d.name, selected: id === ch.inst }));
    });
    inst.addEventListener('change', () => {
      ch.inst = inst.value;
      Store.checkpoint();
      renderChPanel();
      Engine.preview(ch);
    });

    const ctls = ['vol', 'pan', 'pitch', 'decay', 'cutoff', 'rev', 'dly'].map((k) => {
      const p = PARAMS[k];
      return h('div', { class: 'ctl' },
        h('label', { for: 'p-' + k + '-' + ch.id + '-panel', text: p.label }),
        paramInput(ch, k, 'panel'),
        h('output', { 'data-ch': ch.id, 'data-k': k, text: p.fmt(ch[k]) }));
    });

    panel.append(
      h('div', { class: 'panel-title', text: 'Channel settings' }),
      h('div', { class: 'ch-head' }, color, name),
      h('label', { class: 'field' }, h('span', { text: 'Sound' }), inst),
      h('p', { class: 'ch-desc', text: def.tip }),
      ...ctls,
      h('p', { class: 'muted small', text: 'Tip: double-click any slider to reset it.' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'tbtn sm', text: '▶ Preview', onclick: () => Engine.preview(ch), 'data-tip': 'Hear this sound.' }),
        h('button', { class: 'tbtn sm', text: 'Piano Roll', onclick: () => App.openPiano(ch.id), 'data-tip': 'Draw notes for this channel.' }),
        h('button', { class: 'tbtn sm', text: 'Clear', 'data-tip': 'Remove all steps and notes of this channel in the current pattern.', onclick: () => {
          const pat = curPat(); delete pat.steps[ch.id]; delete pat.notes[ch.id]; renderRack(); Store.checkpoint();
        } }),
        h('button', { class: 'tbtn sm danger', text: 'Delete', 'data-tip': 'Remove this channel from the project.', onclick: () => deleteChannel(ch.id) }),
      ),
      h('button', { class: 'tbtn sm only-mobile', text: 'Close', onclick: () => panel.classList.remove('show') }),
    );
  }
  function deleteChannel(id) {
    const P = Store.P;
    const ch = channelById(id);
    P.channels = P.channels.filter((c) => c.id !== id);
    P.patterns.forEach((p) => { delete p.steps[id]; delete p.notes[id]; });
    UI.chId = P.channels[0] && P.channels[0].id;
    Engine.sync();
    renderRack();
    App.renderMixer();
    Store.checkpoint();
    App.toast(`Deleted ${ch.name}. Press Ctrl+Z to undo.`);
  }

  function highlightStep(pos) {
    document.querySelectorAll('#rack .step.now').forEach((s) => s.classList.remove('now'));
    if (pos < 0) return;
    document.querySelectorAll(`#rack .step[data-step="${pos}"]`).forEach((s) => s.classList.add('now'));
  }

  Object.assign(window, { h, $, curPat, curCh, PARAMS, paramInput, setParam, Rack: { render: renderRack, bind: bindRack, highlight: highlightStep, select: selectChannel, panel: renderChPanel } });
})();
