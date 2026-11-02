/* BrowserFL — Piano Roll. */
(function () {
  const ROW_H = 14, COL_W = 24, KEYS_W = 56, LOW = 24, HIGH = 96; // C1..C7
  const ROWS = HIGH - LOW + 1;
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const S = { snap: 1, chord: '', lastLen: 1, scrolled: false, drag: null };

  const dpr = () => window.devicePixelRatio || 1;
  function sizeCanvas(c, w, hgt) {
    c.width = Math.round(w * dpr()); c.height = Math.round(hgt * dpr());
    c.style.width = w + 'px'; c.style.height = hgt + 'px';
    const g = c.getContext('2d'); g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    return g;
  }
  const notesOf = (create) => {
    const pat = curPat(), ch = curCh();
    if (!ch) return [];
    if (!pat.notes[ch.id] && create) pat.notes[ch.id] = [];
    return pat.notes[ch.id] || [];
  };
  const pitchAtY = (y) => Math.max(LOW, Math.min(HIGH, HIGH - Math.floor(y / ROW_H)));
  const inScale = (p) => scaleNotes().has(p % 12);
  function snapToScale(p) {
    const sc = Store.P.scale;
    if (!sc.on || !sc.lock || inScale(p)) return p;
    for (let d = 1; d < 12; d++) { if (inScale(p - d)) return p - d; if (inScale(p + d)) return p + d; }
    return p;
  }
  function chordPitches(root) {
    switch (S.chord) {
      case 'maj': return [root, root + 4, root + 7];
      case 'min': return [root, root + 3, root + 7];
      case 'oct': return [root, root + 12];
      case 'scale3': case 'scale4': {
        if (!inScale(root)) return [root, root + 4, root + 7];
        const up = [];
        for (let p = root; up.length < 7; p++) if (inScale(p)) up.push(p);
        const c = [up[0], up[2], up[4]];
        if (S.chord === 'scale4') c.push(up[6]);
        return c;
      }
      default: return [root];
    }
  }

  /* ---------- Drawing ---------- */
  function draw() {
    const pat = curPat(), ch = curCh();
    const W = pat.len * COL_W, H = ROWS * ROW_H;
    const g = sizeCanvas($('#prGrid'), W, H);
    const sc = Store.P.scale;
    const scaleSet = scaleNotes();
    for (let p = HIGH; p >= LOW; p--) {
      const y = (HIGH - p) * ROW_H;
      const pc = p % 12;
      let col = BLACK.has(pc) ? '#171b21' : '#1e232b';
      if (sc.on) {
        if (pc === sc.root) col = '#3a3123';
        else if (scaleSet.has(pc)) col = '#252b35';
        else col = '#14171c';
      }
      g.fillStyle = col; g.fillRect(0, y, W, ROW_H);
      g.fillStyle = pc === 0 ? '#3b4352' : '#232831';
      g.fillRect(0, y + ROW_H - 1, W, 1);
    }
    // vertical grid: snap lines, beats, bars
    const sub = Math.min(S.snap, 1);
    for (let s = 0; s <= pat.len + 1e-6; s += sub) {
      const x = Math.round(s * COL_W) + 0.5;
      const isBar = Math.abs(s % 16) < 1e-6, isBeat = Math.abs(s % 4) < 1e-6, isStep = Math.abs(s - Math.round(s)) < 1e-6;
      g.strokeStyle = isBar ? '#5a6577' : isBeat ? '#3c4553' : isStep ? '#2a313c' : '#22272f';
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }
    // ghost notes from other channels
    Store.P.channels.forEach((o) => {
      if (!ch || o.id === ch.id || !pat.notes[o.id]) return;
      g.strokeStyle = o.color + '55';
      pat.notes[o.id].forEach((n) => {
        if (n.pitch < LOW || n.pitch > HIGH) return;
        g.strokeRect(n.start * COL_W + 1.5, (HIGH - n.pitch) * ROW_H + 1.5, n.len * COL_W - 3, ROW_H - 3);
      });
    });
    if (!ch) return;
    g.font = '600 9px "JetBrains Mono", monospace';
    g.textBaseline = 'middle';
    notesOf().forEach((n) => {
      if (n.pitch < LOW || n.pitch > HIGH) return;
      const x = n.start * COL_W, y = (HIGH - n.pitch) * ROW_H, w = Math.max(3, n.len * COL_W - 1);
      g.globalAlpha = 0.45 + 0.55 * n.vel;
      g.fillStyle = ch.color; g.fillRect(x + 1, y + 1, w - 1, ROW_H - 2);
      g.globalAlpha = 1;
      g.fillStyle = '#0006'; g.fillRect(x + w - 3, y + 1, 3, ROW_H - 2);
      if (w > 28) { g.fillStyle = '#111'; g.fillText(noteName(n.pitch), x + 4, y + ROW_H / 2 + 0.5); }
    });
    drawVel();
  }
  function drawKeys() {
    const g = sizeCanvas($('#prKeys'), KEYS_W, ROWS * ROW_H);
    g.font = '600 9px "JetBrains Mono", monospace';
    g.textBaseline = 'middle';
    const sc = Store.P.scale, set = scaleNotes();
    for (let p = HIGH; p >= LOW; p--) {
      const y = (HIGH - p) * ROW_H, pc = p % 12, black = BLACK.has(pc);
      g.fillStyle = black ? '#20242b' : '#d9dde3';
      g.fillRect(0, y, KEYS_W, ROW_H);
      g.fillStyle = '#0005'; g.fillRect(0, y + ROW_H - 1, KEYS_W, 1);
      if (sc.on && set.has(pc)) { g.fillStyle = pc === sc.root ? '#ff9a3c' : '#4fd6d0'; g.fillRect(KEYS_W - 5, y + 2, 3, ROW_H - 4); }
      if (pc === 0 || (sc.on && pc === sc.root)) { g.fillStyle = black ? '#ddd' : '#222'; g.fillText(noteName(p), 4, y + ROW_H / 2 + 0.5); }
    }
  }
  function drawVel() {
    const pat = curPat(), ch = curCh();
    const W = pat.len * COL_W, H = 72;
    const g = sizeCanvas($('#prVel'), W + 40, H);
    g.fillStyle = '#1a1e25'; g.fillRect(0, 0, W, H);
    for (let s = 0; s <= pat.len; s += 4) { g.fillStyle = s % 16 ? '#2a313c' : '#3c4553'; g.fillRect(s * COL_W, 0, 1, H); }
    if (!ch) return;
    notesOf().forEach((n) => {
      const x = n.start * COL_W + 2, hh = n.vel * (H - 10);
      g.fillStyle = ch.color;
      g.fillRect(x, H - hh, 2, hh);
      g.beginPath(); g.arc(x + 1, H - hh, 3.5, 0, Math.PI * 2); g.fill();
    });
  }

  /* ---------- Editing ---------- */
  function hitNote(pos, pitch) {
    const ns = notesOf();
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (n.pitch === pitch && pos >= n.start && pos <= n.start + n.len) return n;
    }
    return null;
  }
  function localXY(e, el) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  function bind() {
    const grid = $('#prGrid');
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      const ch = curCh();
      if (!ch) return;
      grid.setPointerCapture(e.pointerId);
      const { x, y } = localXY(e, grid);
      const pos = x / COL_W, pitch = pitchAtY(y);
      const pat = curPat();
      const hit = hitNote(pos, pitch);
      if (e.button === 2) {
        S.drag = { mode: 'erase' };
        if (hit) erase(hit);
        return;
      }
      if (hit) {
        const resize = x > (hit.start + hit.len) * COL_W - 7;
        S.drag = { mode: resize ? 'resize' : 'move', group: [hit], orig: [{ start: hit.start, pitch: hit.pitch }], ax: pos, ap: pitch, lastP: hit.pitch };
        S.lastLen = hit.len;
        if (!resize) Engine.preview(ch, hit.pitch, hit.vel, 0.25);
      } else {
        const root = snapToScale(pitch);
        const start = Math.min(pat.len - S.snap, Math.floor(pos / S.snap + 1e-6) * S.snap);
        const len = Math.min(S.lastLen, pat.len - start);
        const group = chordPitches(root).filter((p) => p <= HIGH).map((p) => ({ start, pitch: p, len, vel: 0.8 }));
        notesOf(true).push(...group);
        group.forEach((n) => Engine.preview(ch, n.pitch, 0.8, 0.3));
        S.drag = { mode: 'move', group, orig: group.map((n) => ({ start: n.start, pitch: n.pitch })), ax: start, ap: root, lastP: root };
      }
      draw();
    });
    grid.addEventListener('pointermove', (e) => {
      const d = S.drag;
      if (!d) return;
      const { x, y } = localXY(e, grid);
      const pos = x / COL_W, pitch = pitchAtY(y);
      const pat = curPat();
      if (d.mode === 'erase') { const hit = hitNote(pos, pitch); if (hit) erase(hit); return; }
      if (d.mode === 'resize') {
        d.group.forEach((n) => { n.len = Math.max(S.snap, Math.min(pat.len - n.start, Math.round((pos - n.start) / S.snap) * S.snap)); S.lastLen = n.len; });
      } else {
        const ds = Math.round((pos - d.ax) / S.snap) * S.snap;
        const dp = pitch - d.ap;
        d.group.forEach((n, i) => {
          n.start = Math.max(0, Math.min(pat.len - S.snap, d.orig[i].start + ds));
          n.pitch = Math.max(LOW, Math.min(HIGH, snapToScale(d.orig[i].pitch + dp)));
        });
        if (d.group[0].pitch !== d.lastP) { d.lastP = d.group[0].pitch; Engine.preview(curCh(), d.lastP, 0.7, 0.2); }
      }
      draw();
    });
    const end = () => {
      if (!S.drag) return;
      S.drag = null;
      const pat = curPat(), ch = curCh();
      if (ch && pat.notes[ch.id] && !pat.notes[ch.id].length) delete pat.notes[ch.id];
      Store.checkpoint();
    };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
    grid.addEventListener('mousemove', (e) => {
      if (S.drag) return;
      const { x, y } = localXY(e, grid);
      const hit = hitNote(x / COL_W, pitchAtY(y));
      grid.style.cursor = hit ? (x > (hit.start + hit.len) * COL_W - 7 ? 'ew-resize' : 'move') : 'crosshair';
    });

    function erase(n) {
      const ns = notesOf();
      const i = ns.indexOf(n);
      if (i >= 0) ns.splice(i, 1);
      draw();
    }

    // keyboard preview
    const keys = $('#prKeys');
    keys.addEventListener('pointerdown', (e) => {
      const { y } = localXY(e, keys);
      if (curCh()) Engine.preview(curCh(), pitchAtY(y), 0.85, 0.5);
    });

    // velocity lane
    const vel = $('#prVel');
    let velDrag = false;
    const setVel = (e) => {
      const { x, y } = localXY(e, vel);
      const v = Math.max(0.05, Math.min(1, 1 - (y - 4) / 62));
      let changed = false;
      notesOf().forEach((n) => { if (Math.abs(n.start * COL_W + 3 - x) <= 6) { n.vel = v; changed = true; } });
      if (changed) draw();
    };
    vel.addEventListener('pointerdown', (e) => { velDrag = true; vel.setPointerCapture(e.pointerId); setVel(e); });
    vel.addEventListener('pointermove', (e) => { if (velDrag) setVel(e); });
    vel.addEventListener('pointerup', () => { velDrag = false; Store.checkpoint(); });

    $('#prWrap').addEventListener('scroll', () => { $('#prVelScroll').scrollLeft = $('#prWrap').scrollLeft; });

    // toolbar
    const root = $('#prRoot'), scale = $('#prScale');
    root.append(...NOTE_NAMES.map((n, i) => h('option', { value: i, text: n })));
    scale.append(h('option', { value: 'off', text: 'Off' }), ...Object.keys(SCALES).map((k) => h('option', { value: k, text: k[0].toUpperCase() + k.slice(1) })));
    root.addEventListener('change', () => { Store.P.scale.root = +root.value; Store.checkpoint(); refresh(); });
    scale.addEventListener('change', () => {
      if (scale.value === 'off') Store.P.scale.on = false;
      else { Store.P.scale.on = true; Store.P.scale.type = scale.value; }
      Store.checkpoint(); refresh();
    });
    $('#prLock').addEventListener('change', (e) => { Store.P.scale.lock = e.target.checked; Store.checkpoint(); });
    $('#prSnap').addEventListener('change', (e) => { S.snap = parseFloat(e.target.value); S.lastLen = Math.max(S.snap, Math.min(S.lastLen, S.snap * 4)); if (S.lastLen < S.snap || S.snap < 1) S.lastLen = S.snap; draw(); });
    $('#prChord').addEventListener('change', (e) => {
      S.chord = e.target.value;
      if (S.chord.startsWith('scale') && !Store.P.scale.on) App.hint('Scale chords need a scale. Pick one in the <b>Scale</b> menu, or a major chord is used.');
    });
    $('#prChannel').addEventListener('change', (e) => { UI.chId = e.target.value; Rack.panel(); refresh(); });
    $('#prOctUp').addEventListener('click', () => transpose(12));
    $('#prOctDown').addEventListener('click', () => transpose(-12));
    $('#prClear').addEventListener('click', () => { const ch = curCh(); if (ch) { delete curPat().notes[ch.id]; Store.checkpoint(); draw(); App.toast('Cleared. Ctrl+Z to undo.'); } });
  }
  function transpose(d) {
    notesOf().forEach((n) => { n.pitch = Math.max(LOW, Math.min(HIGH, n.pitch + d)); });
    Store.checkpoint(); draw();
  }

  // Convert step-sequencer hits into notes the first time a channel is opened here (like FL Studio).
  function convertSteps(chId) {
    const pat = curPat(), ch = channelById(chId);
    const st = pat.steps[chId];
    if (!st || !st.some(Boolean) || (pat.notes[chId] && pat.notes[chId].length)) return;
    const base = INSTRUMENTS[ch.inst].base;
    const notes = [];
    st.forEach((v, i) => {
      if (!v || i >= pat.len) return;
      for (let k = 0; k < v; k++) notes.push({ start: i + k / v, pitch: base, len: 1 / v, vel: v > 1 ? 0.55 + 0.35 * (k / (v - 1)) : 0.85 });
    });
    pat.notes[chId] = notes;
    delete pat.steps[chId];
  }

  function refresh() {
    const sel = $('#prChannel');
    sel.innerHTML = '';
    Store.P.channels.forEach((c) => sel.append(h('option', { value: c.id, text: c.name, selected: c.id === (curCh() && curCh().id) })));
    const sc = Store.P.scale;
    $('#prRoot').value = sc.root;
    $('#prScale').value = sc.on ? sc.type : 'off';
    $('#prLock').checked = !!sc.lock;
    drawKeys();
    draw();
    if (!S.scrolled && $('#prWrap').clientHeight > 0) {
      const ch = curCh();
      const ns = notesOf();
      const center = ns.length ? ns.reduce((a, n) => a + n.pitch, 0) / ns.length : ch ? INSTRUMENTS[ch.inst].base + 6 : 66;
      const wrap = $('#prWrap');
      wrap.scrollTop = (HIGH - center) * ROW_H - wrap.clientHeight / 2;
      S.scrolled = true;
    }
  }
  function open(chId) {
    convertSteps(chId);
    S.scrolled = false;
  }

  let head;
  function playhead(pos) {
    if (!head) { head = h('div', { style: { position: 'absolute', top: 0, bottom: 0, width: '2px', background: 'var(--cyan)', pointerEvents: 'none', zIndex: 3 } }); $('.pr-inner').style.position = 'relative'; $('.pr-inner').append(head); }
    head.hidden = pos < 0;
    if (pos >= 0) head.style.left = KEYS_W + pos * COL_W + 'px';
  }

  window.Piano = { bind, refresh, open, draw, playhead, convertSteps };
})();
