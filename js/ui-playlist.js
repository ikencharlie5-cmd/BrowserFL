/* BrowserFL — Playlist (song arrangement). */
(function () {
  const BAR_W = 52, TRACK_H = 46, RULER_H = 24, TRACKS = 8;
  let drag = null, head = null;
  const dpr = () => window.devicePixelRatio || 1;

  function bars() { return Math.max(32, Math.ceil(songLengthSteps() / STEPS_PER_BAR) + 8); }
  const clipBars = (c) => { const p = patternById(c.pat); return p ? p.len / STEPS_PER_BAR : 1; };

  function draw() {
    const c = $('#plGrid');
    const nb = bars();
    const W = nb * BAR_W, H = RULER_H + TRACKS * TRACK_H;
    c.width = W * dpr(); c.height = H * dpr(); c.style.width = W + 'px'; c.style.height = H + 'px';
    const g = c.getContext('2d');
    g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    g.fillStyle = '#1a1e25'; g.fillRect(0, 0, W, RULER_H);
    g.font = '600 10px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    for (let t = 0; t < TRACKS; t++) {
      g.fillStyle = t % 2 ? '#161a20' : '#1a1e25';
      g.fillRect(0, RULER_H + t * TRACK_H, W, TRACK_H);
    }
    for (let b = 0; b <= nb; b++) {
      const x = b * BAR_W + 0.5;
      g.strokeStyle = b % 4 ? '#262c36' : '#3c4553';
      g.beginPath(); g.moveTo(x, b % 4 ? RULER_H : 0); g.lineTo(x, H); g.stroke();
      if (b < nb) { g.fillStyle = b % 4 ? '#5b6474' : '#aab2c0'; g.fillText(String(b + 1), x + 4, RULER_H / 2); }
    }
    g.strokeStyle = '#3c4553'; g.beginPath(); g.moveTo(0, RULER_H + 0.5); g.lineTo(W, RULER_H + 0.5); g.stroke();
    const P = Store.P;
    P.clips.forEach((cl) => {
      const pat = patternById(cl.pat);
      if (!pat) return;
      const x = cl.bar * BAR_W, y = RULER_H + cl.track * TRACK_H, w = clipBars(cl) * BAR_W;
      const col = patternColor(pat);
      g.fillStyle = col + '40'; g.fillRect(x + 1, y + 2, w - 2, TRACK_H - 4);
      g.fillStyle = col; g.fillRect(x + 1, y + 2, w - 2, 14);
      g.fillStyle = '#111'; g.fillText(pat.name.slice(0, Math.floor(w / 7)), x + 5, y + 9.5);
      // tiny preview of what the pattern contains
      g.fillStyle = col;
      const sx = (w - 4) / pat.len;
      P.channels.forEach((ch, ci) => {
        const row = y + 19 + (ci % 8) * 3;
        (pat.steps[ch.id] || []).forEach((v, i) => { if (v && i < pat.len) g.fillRect(x + 2 + i * sx, row, Math.max(1, sx - 1), 2); });
        (pat.notes[ch.id] || []).forEach((n) => g.fillRect(x + 2 + n.start * sx, row, Math.max(1, n.len * sx - 1), 2));
      });
    });
  }

  function renderPatList() {
    const list = $('#plPatList');
    list.innerHTML = '';
    Store.P.patterns.forEach((p) => {
      list.append(h('button', {
        class: 'pl-pat' + (p.id === UI.patId ? ' on' : ''), style: { '--c': patternColor(p) }, text: `${p.name} · ${p.len / 16} bar${p.len > 16 ? 's' : ''}`,
        onclick: () => App.selectPattern(p.id),
      }));
    });
  }

  function at(e) {
    const r = $('#plGrid').getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return { x, y, bar: x / BAR_W, track: Math.floor((y - RULER_H) / TRACK_H) };
  }
  function hit(bar, track) {
    const cs = Store.P.clips;
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i];
      if (c.track === track && bar >= c.bar && bar < c.bar + clipBars(c)) return c;
    }
    return null;
  }
  function bind() {
    const c = $('#plGrid');
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      const p = at(e);
      if (p.y < RULER_H) {
        App.setMode('song');
        Engine.play(Math.floor(p.bar) * STEPS_PER_BAR);
        App.updatePlayBtn();
        return;
      }
      if (p.track < 0 || p.track >= TRACKS) return;
      c.setPointerCapture(e.pointerId);
      const cl = hit(p.bar, p.track);
      if (e.button === 2) { drag = { mode: 'erase' }; if (cl) remove(cl); return; }
      if (cl) {
        drag = { mode: 'move', clip: cl, off: Math.floor(p.bar) - cl.bar };
        if (UI.patId !== cl.pat) App.selectPattern(cl.pat, true);
      } else {
        const nc = { id: uid(), track: p.track, bar: Math.floor(p.bar), pat: UI.patId };
        Store.P.clips.push(nc);
        drag = { mode: 'move', clip: nc, off: 0 };
        draw();
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = at(e);
      if (drag.mode === 'erase') { const cl = hit(p.bar, p.track); if (cl) remove(cl); return; }
      const nb = Math.max(0, Math.floor(p.bar) - drag.off);
      const nt = Math.max(0, Math.min(TRACKS - 1, p.track));
      if (nb !== drag.clip.bar || nt !== drag.clip.track) { drag.clip.bar = nb; drag.clip.track = nt; draw(); }
    });
    const end = () => { if (drag) { drag = null; Store.checkpoint(); } };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }
  function remove(cl) {
    Store.P.clips = Store.P.clips.filter((x) => x !== cl);
    draw();
  }
  function playhead(step) {
    if (!head) {
      const scroll = $('#plScroll');
      const wrap = h('div', { style: { position: 'relative', width: 'max-content' } });
      scroll.append(wrap); wrap.append($('#plGrid'));
      head = h('div', { style: { position: 'absolute', top: 0, bottom: 0, width: '2px', background: 'var(--cyan)', pointerEvents: 'none' } });
      wrap.append(head);
    }
    head.hidden = step < 0;
    if (step >= 0) head.style.left = (step / STEPS_PER_BAR) * BAR_W + 'px';
  }
  function refresh() { renderPatList(); draw(); }

  window.Playlist = { bind, refresh, playhead };
})();
