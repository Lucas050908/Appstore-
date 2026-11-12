// Testværktøj: syntetisk instrumentlyd føres ind ad samme vej som mikrofonen (A.useTestBuffer)
window.simRun = async function (o) {
  Object.assign(S, { instr: o.instr, latency: 0, speed: o.speed || 1, wait: false, metro: false, sens: o.sens || 1, onboarded: true }, o.set || {});
  const def = M.findEx(o.instr, o.ex); if (!def) throw new Error('ukendt øvelse ' + o.ex);
  A.startMic = async () => true;
  let res = null; const fin = Game.finish.bind(Game);
  Game.finish = function () { const st = this.st; res = { states: st.ev.map(e => e.state === 'hit' ? (e.rating || '?')[0] : '-').join(''), hits: st.hits, total: st.ev.length, perfect: st.perfect, good: st.good, ok: st.ok, miss: st.miss, score: st.score }; fin(); };
  await Game.start(def, {});
  const st = Game.st, ctx = A.ctx, sr = ctx.sampleRate, spb = st.spb;
  const dur = st.built.beats * spb + 3, N = Math.ceil(dur * sr);
  const buf = ctx.createBuffer(1, N, sr), d = buf.getChannelData(0);
  const kind = A.synthKind(o.instr), jit = (o.jitter || 0) / 1000;
  let seed = o.seed || 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const evs = st.ev.map(e => ({ e, t: Math.max(0, e.b * spb + (rnd() - 0.5) * 2 * jit) }));
  const lvl = o.level == null ? 1 : o.level;
  evs.forEach((x, i) => {
    const e = x.e, prev = i ? evs[i - 1].e : null;
    if (o.wrong === 'silent') return;
    if (o.wrong === 'norepeat' && prev && (e.c ? prev.c === e.c : prev.m === e.m)) return;   // lad den forrige klinge videre
    let end = evs[i + 1] ? evs[i + 1].t : x.t + 2.5;
    if (o.wrong === 'norepeat') { let j = i + 1; while (evs[j] && (e.c ? evs[j].e.c === e.c : evs[j].e.m === e.m)) j++; end = evs[j] ? evs[j].t : x.t + 2.5; }
    const notes = e.c ? M.shapeNotes((o.swap && o.swap[e.c]) || e.c, o.instr) : [e.m + (o.wrong === 'shift' ? 2 : 0) + (o.octave || 0)];
    notes.forEach((m, k) => {
      const src = A.ksBuffer(Math.round(m), kind).getChannelData(0), t0 = x.t + k * 0.016;
      const a = Math.floor(t0 * sr), len = Math.min(src.length, Math.floor((end - t0) * sr)), g = lvl * (e.c ? 0.6 : 1);
      for (let n = 0; n < len && a + n < N; n++) { const fade = Math.min(1, (len - n) / (0.012 * sr)); d[a + n] += src[n] * g * fade; }
    });
  });
  if (o.dist) for (let n = 0; n < N; n++) d[n] = Math.tanh(d[n] * o.dist) * 0.35;                 // forvrængning + kompression
  if (o.hum) for (let n = 0; n < N; n++) { const t = n / sr; d[n] += o.hum * (Math.sin(2 * Math.PI * 50 * t) + 0.5 * Math.sin(2 * Math.PI * 100 * t) + 0.3 * Math.sin(2 * Math.PI * 150 * t)); }
  if (o.noise) for (let n = 0; n < N; n++) d[n] += o.noise * (rnd() * 2 - 1);
  applyInput(); A.useTestBuffer(buf, st.origin);
  const t0 = performance.now();
  while (!res && performance.now() - t0 < (dur + 15) * 1000) await new Promise(r => setTimeout(r, 200));
  return res || { timeout: true };
};
