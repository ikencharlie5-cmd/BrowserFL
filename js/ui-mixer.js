/* BrowserFL — Mixer. */
(function () {
  const buf = new Float32Array(1024);
  const levels = new Map();

  function mini(ch, k) {
    return h('div', { class: 'mini' },
      h('label', { for: 'p-' + k + '-' + ch.id + '-mx' }, PARAMS[k].label, h('output', { 'data-ch': ch.id, 'data-k': k, text: PARAMS[k].fmt(ch[k]) })),
      paramInput(ch, k, 'mx'));
  }
  function masterCtl(label, key, min, max, step, fmt, tip) {
    const M = Store.P.master;
    const out = h('output', { text: fmt(M[key]) });
    const inp = h('input', { type: 'range', min, max, step, value: M[key], id: 'm-' + key, 'data-tip': tip });
    inp.addEventListener('input', () => { M[key] = parseFloat(inp.value); out.textContent = fmt(M[key]); Engine.sync(); Store.checkpointSoon(); });
    return h('div', { class: 'mini' }, h('label', { for: 'm-' + key }, label, out), inp);
  }

  function render() {
    const root = $('#mixer');
    root.innerHTML = '';
    const P = Store.P;
    P.channels.forEach((ch) => {
      const fader = paramInput(ch, 'vol', 'fader');
      root.append(h('div', { class: 'strip', style: { '--c': ch.color } },
        h('div', { class: 'strip-name', text: ch.name, title: ch.name }),
        h('div', { class: 'strip-mid' }, h('canvas', { class: 'meter', width: 10, height: 150, 'data-meter': ch.id, 'data-tip': 'Level meter. Keep it out of the red at the top.' }), fader),
        mini(ch, 'pan'), mini(ch, 'cutoff'), mini(ch, 'rev'), mini(ch, 'dly'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'solo' + (ch.mute ? ' on' : ''), text: 'M', 'data-tip': 'Mute this channel.', onclick: () => { ch.mute = !ch.mute; Engine.sync(); render(); Rack.render(); Store.checkpoint(); } }),
          h('button', { class: 'solo' + (ch.solo ? ' on' : ''), text: 'S', 'data-tip': 'Solo: hear only this channel.', onclick: () => { ch.solo = !ch.solo; Engine.sync(); render(); Rack.render(); Store.checkpoint(); } })),
      ));
    });
    const M = P.master;
    const mvol = h('input', { type: 'range', class: 'fader', min: 0, max: 1, step: 0.01, value: M.vol, id: 'm-vol', 'data-tip': 'Master volume: the level of everything together.' });
    mvol.addEventListener('input', () => { M.vol = parseFloat(mvol.value); Engine.sync(); Store.checkpointSoon(); });
    const dsel = h('select', { id: 'm-dly', 'aria-label': 'Delay time', 'data-tip': 'How far apart the delay echoes are, in time with the BPM.' },
      [['1/16', 0.25], ['1/8', 0.5], ['Dotted 1/8', 0.75], ['1/4', 1], ['Dotted 1/4', 1.5]].map(([t, v]) => h('option', { value: v, text: t, selected: Math.abs(v - M.dlyTime) < 0.01 })));
    dsel.addEventListener('change', () => { M.dlyTime = parseFloat(dsel.value); Engine.sync(); Store.checkpoint(); });
    const comp = h('input', { type: 'checkbox', id: 'm-comp', checked: M.comp });
    comp.addEventListener('change', () => { M.comp = comp.checked; Engine.sync(); Store.checkpoint(); });
    root.append(h('div', { class: 'strip master' },
      h('div', { class: 'strip-name', text: 'MASTER' }),
      h('div', { class: 'strip-mid' }, h('canvas', { class: 'meter', width: 10, height: 150, 'data-meter': 'master' }), mvol),
      masterCtl('Reverb size', 'revSize', 0.4, 5, 0.1, (v) => v.toFixed(1) + 's', 'Length of the reverb tail. Bigger = larger room.'),
      h('div', { class: 'mini' }, h('label', { for: 'm-dly' }, 'Delay time'), dsel),
      masterCtl('Echo amount', 'dlyFb', 0, 0.85, 0.01, (v) => Math.round(v * 100) + '%', 'Delay feedback: how many times the echo repeats.'),
      h('label', { class: 'check', 'data-tip': 'Glue: a compressor that evens out the loud and quiet parts so the mix sounds tighter.' }, comp, 'Glue'),
    ));
  }

  function peak(an) {
    an.getFloatTimeDomainData(buf.subarray(0, an.fftSize));
    let m = 0;
    for (let i = 0; i < an.fftSize; i++) m = Math.max(m, Math.abs(buf[i]));
    return m;
  }
  function meters() {
    if (!Engine.mix || UI.view !== 'mixer') return;
    document.querySelectorAll('canvas[data-meter]').forEach((c) => {
      const id = c.dataset.meter;
      const an = id === 'master' ? Engine.mix.analyser : (Engine.mix.buses.get(id) || {}).meter;
      if (!an) return;
      const p = Math.max(peak(an), (levels.get(id) || 0) * 0.92);
      levels.set(id, p);
      const g = c.getContext('2d');
      g.clearRect(0, 0, 10, 150);
      const hgt = Math.min(1, p) * 150;
      const grad = g.createLinearGradient(0, 150, 0, 0);
      grad.addColorStop(0, '#3fd17a'); grad.addColorStop(0.7, '#ffd25a'); grad.addColorStop(1, '#ff5f6d');
      g.fillStyle = grad; g.fillRect(0, 150 - hgt, 10, hgt);
    });
  }

  window.MixerUI = { render, meters };
})();
