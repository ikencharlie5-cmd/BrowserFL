/* BrowserFL — app shell: toolbar, views, tooltips, modals, tour, keyboard. */
(function () {
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  let cpTimer = null;
  Store.checkpointSoon = () => { clearTimeout(cpTimer); cpTimer = setTimeout(() => Store.checkpoint(), 300); };

  const VIEW_HINTS = {
    rack: '<b>Channel Rack:</b> click squares to add sounds, drag to paint many. <b>Right-click</b> a square for hi-hat rolls. Press <b>Space</b> to play.',
    piano: '<b>Piano Roll:</b> click to add a note, drag to move it, drag its right edge to make it longer, <b>right-click</b> to delete. Click the keys on the left to listen.',
    playlist: '<b>Playlist:</b> pick a pattern on the left, then click the grid to place it. Click the bar numbers on top to play the song from there.',
    mixer: '<b>Mixer:</b> balance loudness, panning and effects for each channel. Double-click any slider to reset it.',
  };
  let hintLocked = 0;

  const App = {
    hint(html, hold) {
      $('#hintText').innerHTML = html;
      if (hold !== false) hintLocked = Date.now() + 4000;
    },
    toast(msg) {
      const t = $('#toast');
      t.textContent = msg; t.hidden = false;
      clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 2200);
    },
    setView(v) {
      UI.view = v;
      document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
      document.querySelectorAll('.view').forEach((s) => s.classList.toggle('on', s.id === 'view-' + v));
      if (v === 'rack') Rack.render();
      if (v === 'piano') Piano.refresh();
      if (v === 'playlist') Playlist.refresh();
      if (v === 'mixer') MixerUI.render();
      hintLocked = 0;
      App.hint(VIEW_HINTS[v], false);
    },
    openPiano(chId) {
      UI.chId = chId;
      Piano.open(chId);
      Rack.panel();
      App.setView('piano');
      Store.checkpoint();
    },
    renderMixer() { if (UI.view === 'mixer') MixerUI.render(); },
    selectPattern(id, quiet) {
      UI.patId = id;
      Engine.patId = id;
      syncToolbar();
      if (!quiet || UI.view === 'rack') Rack.render();
      if (UI.view === 'piano') Piano.refresh();
      if (UI.view === 'playlist') Playlist.refresh();
    },
    setMode(m) {
      Engine.mode = m;
      document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
      if (m === 'song' && !Store.P.clips.length) App.hint('SONG mode plays the Playlist, which is empty. Open the <b>Playlist</b> tab and place some patterns.');
    },
    updatePlayBtn() { $('#btnPlay').classList.toggle('on', Engine.playing); },
  };
  window.App = App;

  /* ---------- Toolbar ---------- */
  function syncToolbar() {
    const P = Store.P;
    $('#bpm').value = P.bpm;
    $('#swing').value = P.swing;
    const sel = $('#patSelect');
    sel.innerHTML = '';
    P.patterns.forEach((p) => sel.append(h('option', { value: p.id, text: p.name, selected: p.id === UI.patId })));
    $('#patLen').value = curPat().len;
  }
  function togglePlay() {
    if (Engine.playing) Engine.stop();
    else Engine.play(0);
    App.updatePlayBtn();
  }
  function bindToolbar() {
    $('#btnPlay').addEventListener('click', togglePlay);
    $('#btnStop').addEventListener('click', () => { Engine.stop(); App.updatePlayBtn(); Rack.highlight(-1); Piano.playhead(-1); Playlist.playhead(-1); });
    document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => App.setMode(b.dataset.mode)));
    $('#bpm').addEventListener('change', (e) => {
      Store.P.bpm = Math.max(40, Math.min(220, Math.round(+e.target.value || 120)));
      e.target.value = Store.P.bpm; Engine.sync(); Store.checkpoint();
    });
    $('#swing').addEventListener('input', (e) => { Store.P.swing = +e.target.value; App.hint(`Swing: ${Math.round(Store.P.swing * 100)}%`); Store.checkpointSoon(); });
    $('#patSelect').addEventListener('change', (e) => App.selectPattern(e.target.value));
    $('#patLen').addEventListener('change', (e) => {
      curPat().len = +e.target.value;
      Rack.render(); if (UI.view === 'piano') Piano.refresh(); if (UI.view === 'playlist') Playlist.refresh();
      Store.checkpoint();
    });
    $('#patAdd').addEventListener('click', () => {
      const p = makePattern('Pattern ' + (Store.P.patterns.length + 1), curPat().len);
      Store.P.patterns.push(p);
      App.selectPattern(p.id); Store.checkpoint();
      App.toast(`Created ${p.name}`);
    });
    $('#patClone').addEventListener('click', () => {
      const src = curPat();
      const p = JSON.parse(JSON.stringify(src));
      p.id = uid(); p.name = src.name + ' copy';
      Store.P.patterns.splice(Store.P.patterns.indexOf(src) + 1, 0, p);
      App.selectPattern(p.id); Store.checkpoint();
      App.toast(`Cloned to ${p.name}`);
    });
    $('#patMore').addEventListener('click', patternModal);
    $('#btnUndo').addEventListener('click', () => { if (!Store.undo()) App.toast('Nothing to undo'); });
    $('#btnRedo').addEventListener('click', () => { if (!Store.redo()) App.toast('Nothing to redo'); });
    $('#btnTemplates').addEventListener('click', templatesModal);
    $('#btnProjects').addEventListener('click', projectsModal);
    $('#btnExport').addEventListener('click', exportModal);
    $('#btnHelp').addEventListener('click', () => Tour.start());
    document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => App.setView(b.dataset.view)));
  }

  /* ---------- Modals ---------- */
  function modal(...content) {
    const body = $('#modalBody');
    body.innerHTML = '';
    body.append(...content);
    $('#modal').hidden = false;
  }
  const closeModal = () => { $('#modal').hidden = true; };
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

  function patternModal() {
    const p = curPat();
    const name = h('input', { type: 'text', value: p.name, id: 'patName', 'aria-label': 'Pattern name' });
    const used = Store.P.clips.filter((c) => c.pat === p.id).length;
    modal(
      h('h2', { text: 'Pattern options' }),
      h('h3', { text: 'Rename' }),
      h('div', { class: 'save-row' }, name, h('button', { class: 'tbtn sm accent', text: 'Rename', onclick: () => {
        p.name = name.value.trim() || p.name; Store.checkpoint(); syncToolbar(); if (UI.view === 'playlist') Playlist.refresh(); closeModal();
      } })),
      h('h3', { text: 'Delete' }),
      Store.P.patterns.length < 2
        ? h('p', { class: 'muted', text: 'This is your only pattern, so it cannot be deleted.' })
        : h('div', { class: 'btn-row' },
          h('p', { class: 'muted', style: { margin: 0, flex: '1 1 100%' }, text: used ? `It is placed ${used} time${used > 1 ? 's' : ''} in the Playlist; those clips will be removed too.` : 'It is not used in the Playlist.' }),
          h('button', { class: 'tbtn sm danger', text: 'Delete ' + p.name, onclick: () => {
            Store.P.patterns = Store.P.patterns.filter((x) => x !== p);
            Store.P.clips = Store.P.clips.filter((c) => c.pat !== p.id);
            App.selectPattern(Store.P.patterns[0].id); Store.checkpoint(); closeModal();
            App.toast('Pattern deleted. Ctrl+Z to undo.');
          } })),
    );
  }

  function templatesModal() {
    modal(
      h('h2', { text: 'Start from a template' }),
      h('p', { class: 'muted', text: 'Each template is a finished little track. Press play, then change things to see what they do. Your current project is replaced, but you can press Undo to get it back.' }),
      h('div', { class: 'tpl-grid' }, Object.entries(TEMPLATES).map(([key, t]) =>
        h('button', { class: 'tpl', onclick: () => {
          Engine.stop(); App.updatePlayBtn();
          Store.load(TEMPLATES[key].make(), true);
          Store.checkpoint();
          closeModal();
          App.setMode(key === 'empty' ? 'pattern' : 'song');
          App.toast(`Loaded ${t.title}. Press Space to play.`);
        } }, h('b', { text: t.title }), h('span', { text: t.blurb })))),
    );
  }

  function projectsModal() {
    const name = h('input', { type: 'text', value: Store.P.name, id: 'saveName', 'aria-label': 'Project name' });
    const list = h('div', { class: 'proj-list' });
    const fill = () => {
      list.innerHTML = '';
      const all = Store.savedProjects();
      const names = Object.keys(all).sort((a, b) => all[b].savedAt - all[a].savedAt);
      if (!names.length) list.append(h('p', { class: 'muted', text: 'No saved projects yet.' }));
      names.forEach((n) => list.append(h('div', { class: 'proj' },
        h('span', { class: 'name', text: n }),
        h('span', { class: 'muted small', text: new Date(all[n].savedAt).toLocaleString() }),
        h('button', { class: 'tbtn sm', text: 'Open', onclick: () => { Engine.stop(); App.updatePlayBtn(); Store.load(all[n].data, true); Store.checkpoint(); closeModal(); App.toast(`Opened ${n}`); } }),
        h('button', { class: 'tbtn sm danger', text: 'Delete', onclick: () => { Store.deleteSaved(n); fill(); } }),
      )));
    };
    fill();
    const file = h('input', { type: 'file', accept: '.json,application/json', id: 'openFile', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        Engine.stop(); App.updatePlayBtn();
        Store.load(data, true); Store.checkpoint(); closeModal(); App.toast(`Opened ${f.name}`);
      } catch (e) { App.toast('That file is not a BrowserFL project.'); }
    });
    modal(
      h('h2', { text: 'Save and open' }),
      h('p', { class: 'muted', text: 'Projects are saved inside this browser. Your work is also auto-saved after every change.' }),
      h('h3', { text: 'Save this project' }),
      h('div', { class: 'save-row' }, name, h('button', { class: 'tbtn sm accent', text: 'Save', onclick: () => {
        const n = name.value.trim() || 'My Beat';
        App.toast(Store.saveAs(n) ? `Saved “${n}”` : 'Could not save. This browser is blocking storage.');
        fill();
      } })),
      h('h3', { text: 'Saved projects' }),
      list,
      h('h3', { text: 'Project files' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'tbtn sm', text: 'Download project file', onclick: () => {
          const blob = new Blob([JSON.stringify(Store.P)], { type: 'application/json' });
          download(blob, (Store.P.name || 'project') + '.browserfl.json');
        } }),
        h('button', { class: 'tbtn sm', text: 'Open project file…', onclick: () => file.click() }),
        h('button', { class: 'tbtn sm', text: 'New empty project', onclick: () => {
          Engine.stop(); App.updatePlayBtn(); Store.load(TEMPLATES.empty.make(), true); Store.checkpoint(); closeModal(); App.setMode('pattern');
        } }),
        file),
    );
  }
  function download(blob, filename) {
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a); a.click(); a.remove();
  }

  function exportModal() {
    const hasSong = Store.P.clips.length > 0;
    const what = h('select', { id: 'expWhat', 'aria-label': 'What to export' },
      h('option', { value: 'song', text: 'Whole song (Playlist)', selected: hasSong, disabled: !hasSong }),
      h('option', { value: 'pattern', text: `Current pattern: ${curPat().name}`, selected: !hasSong }));
    const loops = h('select', { id: 'expLoops', 'aria-label': 'Loops' }, [1, 2, 4, 8].map((n) => h('option', { value: n, text: `${n}×`, selected: n === 4 })));
    const out = h('div', { class: 'export-out' });
    const go = h('button', { class: 'tbtn accent', text: 'Render WAV', onclick: async () => {
      go.disabled = true; out.innerHTML = ''; out.append(h('p', { class: 'muted', text: 'Rendering…' }));
      try {
        const blob = await renderWav(what.value, UI.patId, +loops.value);
        const url = URL.createObjectURL(blob);
        const fname = (Store.P.name || 'beat').replace(/[^\w\- ]+/g, '') + '.wav';
        out.innerHTML = '';
        out.append(
          h('p', { text: `Done: ${(blob.size / 1048576).toFixed(1)} MB, 44.1 kHz stereo.` }),
          h('audio', { controls: true, src: url }),
          h('div', { class: 'btn-row' }, h('button', { class: 'tbtn sm accent', text: 'Download ' + fname, onclick: () => download(blob, fname) })),
          h('p', { class: 'muted small', text: 'If the download button does nothing, this page is running inside a preview that blocks downloads. Open BrowserFL from its own index.html file to download.' }),
        );
      } catch (e) {
        out.innerHTML = '';
        out.append(h('p', { text: e.message }));
      }
      go.disabled = false;
    } });
    modal(
      h('h2', { text: 'Export to WAV' }),
      h('p', { class: 'muted', text: 'Renders your music to a WAV file you can share, upload or put in a video.' }),
      h('div', { class: 'btn-row', style: { alignItems: 'center' } },
        h('label', { class: 'field' }, h('span', { text: 'What' }), what),
        h('label', { class: 'field', 'data-tip': 'How many times to repeat the pattern.' }, h('span', { text: 'Repeat' }), loops)),
      h('div', { style: { marginTop: '14px' } }, go),
      out,
    );
  }

  /* ---------- Tooltips + hint bar ---------- */
  let tipTimer = null, tipEl = null;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el === tipEl) return;
    tipEl = el;
    clearTimeout(tipTimer);
    $('#tooltip').hidden = true;
    if (!el) { if (Date.now() > hintLocked) App.hint(VIEW_HINTS[UI.view], false); return; }
    if (Date.now() > hintLocked) App.hint(el.dataset.tip, false);
    tipTimer = setTimeout(() => {
      const t = $('#tooltip');
      t.textContent = el.dataset.tip;
      t.hidden = false;
      const r = el.getBoundingClientRect();
      const tw = t.offsetWidth, th = t.offsetHeight;
      let x = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2));
      let y = r.bottom + 8;
      if (y + th > window.innerHeight - 8) y = r.top - th - 8;
      t.style.left = x + 'px'; t.style.top = y + 'px';
    }, 550);
  });
  document.addEventListener('pointerdown', () => { clearTimeout(tipTimer); $('#tooltip').hidden = true; });

  /* ---------- Keyboard ---------- */
  const KEYMAP = 'awsedftgyhujkolp;';
  const held = new Set();
  let octave = 0;
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = (tag === 'input' && !['range', 'checkbox', 'color'].includes(e.target.type)) || tag === 'textarea' || (tag === 'select' && e.key !== ' ');
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? Store.redo() : Store.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); Store.redo(); return; }
    if (mod) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
    const fk = { F5: 'playlist', F6: 'rack', F7: 'piano', F9: 'mixer' }[e.key];
    if (fk) { e.preventDefault(); App.setView(fk); return; }
    if (e.key === 'Escape') { closeModal(); Tour.end(); return; }
    if (e.key === 'z' || e.key === 'x') { octave += e.key === 'z' ? -12 : 12; octave = Math.max(-36, Math.min(36, octave)); App.hint(`Computer keyboard octave: ${octave / 12 >= 0 ? '+' : ''}${octave / 12}`); return; }
    const i = KEYMAP.indexOf(e.key.toLowerCase());
    if (i >= 0 && !held.has(e.key) && curCh() && !e.repeat) {
      held.add(e.key);
      const ch = curCh();
      const def = INSTRUMENTS[ch.inst];
      const base = def.melodic ? (def.base >= 60 ? 60 : 48) : def.base;
      Engine.preview(ch, base + octave + i, 0.85, 0.4);
    }
  });
  document.addEventListener('keyup', (e) => held.delete(e.key));

  /* ---------- Animation loop: playheads + scope + meters ---------- */
  let lastPos = -2;
  function frame() {
    const pos = Engine.updatePos();
    if (pos !== lastPos) {
      lastPos = pos;
      if (Engine.mode === 'pattern') {
        Rack.highlight(pos); Piano.playhead(pos); Playlist.playhead(-1);
      } else {
        Rack.highlight(-1); Piano.playhead(-1); Playlist.playhead(pos);
      }
    }
    const sc = $('#scope');
    const g = sc.getContext('2d');
    g.clearRect(0, 0, sc.width, sc.height);
    if (Engine.mix) {
      const an = Engine.mix.analyser, d = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(d);
      g.strokeStyle = '#ff9a3c'; g.lineWidth = 1.5; g.beginPath();
      for (let x = 0; x < sc.width; x++) {
        const v = d[Math.floor((x / sc.width) * d.length)];
        const y = sc.height / 2 - v * sc.height * 0.45;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    } else {
      g.strokeStyle = '#3c4553'; g.beginPath(); g.moveTo(0, sc.height / 2); g.lineTo(sc.width, sc.height / 2); g.stroke();
    }
    MixerUI.meters();
    requestAnimationFrame(frame);
  }

  /* ---------- Guided tour ---------- */
  const STEPS = [
    { title: 'Welcome to BrowserFL', text: 'This is a music studio that runs in your browser. This short tour shows the five things you need to make a beat. You can replay it any time with the ? button.' },
    { sel: '#btnPlay', title: 'Play and stop', text: 'Press play (or the Space bar) to hear the loop. PAT plays the pattern you are editing; SONG plays your whole arrangement.' , view: 'rack' },
    { sel: '#rackScroll', title: 'The Channel Rack', text: 'Each row is an instrument. Each square is a 16th note: 4 squares = 1 beat, 16 = 1 bar. Click squares to add hits, and right-click a lit square to turn it into a hi-hat roll.', view: 'rack' },
    { sel: '#chPanel', title: 'Shape the sound', text: 'Click a channel name to edit it here: change the sound, pitch, length, filter and effects. Hover over anything to see what it does in the hint bar at the bottom.', view: 'rack', wide: true },
    { sel: '.pattern-picker', title: 'Patterns', text: 'A pattern is a loop of up to 8 bars. Make several (intro, verse, drop) with New or Clone, then arrange them into a song.', view: 'rack' },
    { sel: '.pr-bar', title: 'The Piano Roll', text: 'Draw melodies, chords and 808 lines here. Pick a scale and the right notes light up. Set “Click places” to “Scale chord” to drop full chords that always fit.', view: 'piano' },
    { sel: '#plScroll', title: 'The Playlist', text: 'This is your song timeline. Pick a pattern on the left and click to place it. Stack drums, melody and bass on different tracks.', view: 'playlist' },
    { sel: '#mixer', title: 'The Mixer', text: 'Balance the volume of each channel, pan it left or right, and add reverb and delay. The master strip controls everything together.', view: 'mixer' },
    { sel: '#btnTemplates', title: 'Learn from templates', text: 'Load a finished Trap, House or Lo-fi beat and take it apart. When you are done, Save / Open keeps your project and Export WAV turns it into an audio file. Have fun!', view: 'rack' },
  ];
  const Tour = {
    i: 0,
    start() { this.i = 0; $('#tour').hidden = false; closeModal(); this.show(); },
    end() { $('#tour').hidden = true; ls.set('browserfl.toured', '1'); },
    show() {
      const s = STEPS[this.i];
      if (s.view && s.view !== UI.view) App.setView(s.view);
      if (s.view === 'rack' && s.sel === '#chPanel' && window.matchMedia('(max-width: 760px)').matches) $('#chPanel').classList.add('show');
      $('#tourCount').textContent = `Step ${this.i + 1} of ${STEPS.length}`;
      $('#tourTitle').textContent = s.title;
      $('#tourText').textContent = s.text;
      $('#tourBack').disabled = this.i === 0;
      $('#tourNext').textContent = this.i === STEPS.length - 1 ? 'Start making music' : 'Next';
      requestAnimationFrame(() => this.place(s));
    },
    place(s) {
      const spot = $('#tourSpot'), card = $('#tourCard');
      const el = s.sel && $(s.sel);
      const vw = window.innerWidth, vh = window.innerHeight;
      if (!el || !el.offsetParent) {
        spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
        card.style.left = (vw - card.offsetWidth) / 2 + 'px';
        card.style.top = (vh - card.offsetHeight) / 2 + 'px';
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 6;
      const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
      const w = Math.min(vw - 8 - left, r.width + pad * 2), hh = Math.min(vh - 8 - top, r.height + pad * 2);
      spot.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${hh}px;`;
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let cx = Math.min(vw - cw - 12, Math.max(12, r.left));
      let cy = top + hh + 12;
      if (cy + ch > vh - 12) cy = top - ch - 12;
      if (cy < 12) { cy = Math.max(12, (vh - ch) / 2); cx = r.left > vw / 2 ? Math.max(12, r.left - cw - 16) : Math.min(vw - cw - 12, r.right + 16); }
      card.style.left = cx + 'px'; card.style.top = cy + 'px';
    },
  };
  window.Tour = Tour;
  $('#tourNext').addEventListener('click', () => {
    if (Tour.i >= STEPS.length - 1) { Tour.end(); App.setView('rack'); return; }
    Tour.i++; Tour.show();
  });
  $('#tourBack').addEventListener('click', () => { if (Tour.i > 0) { Tour.i--; Tour.show(); } });
  $('#tourSkip').addEventListener('click', () => Tour.end());
  window.addEventListener('resize', () => { if (!$('#tour').hidden) Tour.place(STEPS[Tour.i]); });

  /* ---------- Boot ---------- */
  function renderAll() {
    const P = Store.P;
    if (!patternById(UI.patId)) UI.patId = P.patterns[0].id;
    if (!channelById(UI.chId)) UI.chId = P.channels[0] && P.channels[0].id;
    Engine.patId = UI.patId;
    Engine.sync();
    syncToolbar();
    Rack.render();
    if (UI.view === 'piano') Piano.refresh();
    if (UI.view === 'playlist') Playlist.refresh();
    if (UI.view === 'mixer') MixerUI.render();
  }
  Store.on(renderAll);

  Rack.bind();
  Piano.bind();
  Playlist.bind();
  bindToolbar();
  if (!Store.restoreAutosave()) Store.load(TEMPLATES.starter.make());
  App.setView('rack');
  requestAnimationFrame(frame);
  if (!ls.get('browserfl.toured')) setTimeout(() => Tour.start(), 400);
})();
