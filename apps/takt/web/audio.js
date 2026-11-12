// Takt – lydmotor: mikrofon, tonegenkendelse (YIN), akkordgenkendelse (kroma), anslag, synth og metronom
'use strict';
const A = (() => {
  let ctx = null, master = null;
  let stream = null, srcNode = null, hp = null, anT = null, anF = null, testSrc = null;
  let tbuf = null, fbuf = null, yinD = null, dec = null;
  let lastCtxT = 0, env = [], envH = [], noise = 0.002, lastOnset = -1, carry = 0, prevS = 0;
  // Lydindgang: valgt enhed (USB-lydkort, iRig, headset …) og brumfilter til elguitar/elbas
  const input = { deviceId: null, hum: false, lowCut: 0, label: '' };
  let nodes = [];
  const synthCache = new Map();

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function buildGraph(source) {
    hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 30;
    anT = ctx.createAnalyser(); anT.fftSize = 4096; anT.smoothingTimeConstant = 0;
    anF = ctx.createAnalyser(); anF.fftSize = 8192; anF.smoothingTimeConstant = 0.5;
    nodes = []; let head = source;
    if (input.hum) { // netbrum: smalle kærve ved 50/100/150 Hz og – når instrumentet ikke går så dybt – et stejlt lavt snit
      for (const [f, q] of [[50, 12], [100, 30], [150, 30]]) { const n = ctx.createBiquadFilter(); n.type = 'notch'; n.frequency.value = f; n.Q.value = q; nodes.push(n); }
      if (input.lowCut > 0) for (let i = 0; i < 2; i++) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = input.lowCut; f.Q.value = i ? 1.3 : 0.54; nodes.push(f); }
    }
    for (const n of nodes) { head.connect(n); head = n; }
    head.connect(hp); hp.connect(anT); hp.connect(anF);
    tbuf = new Float32Array(anT.fftSize); fbuf = new Float32Array(anF.frequencyBinCount);
    lastCtxT = ctx.currentTime; env = []; envH = []; lastOnset = -1; prevS = 0;
  }
  function setInput(o) { Object.assign(input, o); }
  async function listInputs() {
    try { const d = await navigator.mediaDevices.enumerateDevices(); return d.filter(x => x.kind === 'audioinput' && x.deviceId !== 'communications').map(x => ({ id: x.deviceId, label: x.label || 'Mikrofon' })); }
    catch (e) { return []; }
  }

  async function startMic() {
    ensureCtx();
    if (stream && srcNode) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomic');
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: input.deviceId ? Object.assign({ deviceId: { exact: input.deviceId } }, audio) : audio }); }
    catch (e) { // den valgte indgang er væk (kablet er taget ud) → brug standardindgangen
      if (!input.deviceId) throw e;
      input.deviceId = null; input.lost = true;
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    }
    const tr = stream.getAudioTracks()[0]; input.label = (tr && tr.label) || '';
    srcNode = ctx.createMediaStreamSource(stream);
    buildGraph(srcNode);
    return true;
  }
  function stopMic() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    try { srcNode && srcNode.disconnect(); hp && hp.disconnect(); nodes.forEach(n => n.disconnect()); } catch (e) {}
    nodes = [];
    srcNode = null; hp = null; anT = null; anF = null;
    if (testSrc) { try { testSrc.stop(); } catch (e) {} testSrc = null; }
  }
  const micOn = () => !!anT;

  // Test-krog: brug en lydbuffer i stedet for mikrofonen (startes på et bestemt ctx-tidspunkt)
  function useTestBuffer(buffer, when) {
    ensureCtx(); stopMic();
    testSrc = ctx.createBufferSource(); testSrc.buffer = buffer;
    const g = ctx.createGain(); g.gain.value = 1; testSrc.connect(g);
    srcNode = g; buildGraph(g); testSrc.start(when || ctx.currentTime);
    stream = null;
  }

  // ---------- YIN ----------
  function yin(buf, sr, minF, maxF) {
    const N = buf.length;
    const tauMin = Math.max(2, Math.floor(sr / maxF)), tauMax = Math.min(Math.floor(sr / minF), (N >> 1) - 2);
    const W = N - tauMax;
    if (!yinD || yinD.length < tauMax + 2) yinD = new Float32Array(tauMax + 2);
    const d = yinD; d[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
      run += s; d[tau] = run > 0 ? s * tau / run : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < 0.15) { while (t + 1 <= tauMax && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) { // ingen under tærsklen: global minimum hvis rimelig
      let best = 1, bt = -1;
      for (let t = tauMin; t <= tauMax; t++) if (d[t] < best) { best = d[t]; bt = t; }
      if (bt < 0 || best > 0.35) return null;
      tau = bt;
    }
    let bt = tau;
    if (tau > 1 && tau < tauMax) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a + c - 2 * b;
      if (den !== 0) bt = tau + (a - c) / (2 * den);
    }
    return { f: sr / bt, clarity: 1 - d[tau] };
  }

  // ---------- Analyse af én frame ----------
  // Returnerer { t, rms, pitch(midi|null), clarity, onsets:[ctxTid], chroma|null }
  function analyze(opts) {
    if (!anT) return null;
    const sr = ctx.sampleRate, now = ctx.currentTime;
    anT.getFloatTimeDomainData(tbuf);
    const N = tbuf.length;
    // nye samples siden sidste frame → energikonvolut i blokke à 128
    let newN = Math.round((now - lastCtxT) * sr) + carry; lastCtxT = now;
    newN = Math.max(0, Math.min(N, newN));
    const onsets = [];
    const B = 128;
    let start = N - newN;
    carry = newN % B;
    const el = !!(opts && opts.electric);
    for (; start + B <= N; start += B) {
      let e = 0, h = 0;
      for (let i = start; i < start + B; i++) { const x = tbuf[i]; e += x * x; if (el) { const dx = x - (i ? tbuf[i - 1] : prevS); h += dx * dx; } }
      e = Math.sqrt(e / B); h = Math.sqrt(h / B);
      const prev = env.length ? env.slice(-8) : [0];
      const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
      const gate = Math.max(noise * 3, 0.004 * (opts && opts.sens ? 1 / opts.sens : 1));
      const t = now - (N - (start + B)) / sr;
      let hit = e > gate && e > avg * 2.0 + 0.001;
      if (el && !hit && e > gate && envH.length >= 12) {
        // Forvrænget/komprimeret signal: niveauet ændrer sig næsten ikke ved et nyt anslag, men klangen gør –
        // plekteret giver et lyst smæld. Mål "lyshed" (diskant-energi i forhold til niveau) mod de foregående ~40 ms.
        const br = h / (e + 1e-6); let m = 0; for (let k = envH.length - 14 < 0 ? 0 : envH.length - 14; k < envH.length - 2; k++) m += envH[k]; m /= Math.min(12, envH.length - 2);
        hit = br > m * 1.6 + 0.02 && e > avg * 0.7;
      }
      if (hit && (lastOnset < 0 || t - lastOnset > 0.09)) { onsets.push(t); lastOnset = t; }
      env.push(e); if (env.length > 64) env.shift();
      if (el) { envH.push(h / (e + 1e-6)); if (envH.length > 64) envH.shift(); }
    }
    prevS = tbuf[N - 1];
    // RMS over de sidste 2048
    let rs = 0; for (let i = N - 2048; i < N; i++) rs += tbuf[i] * tbuf[i];
    const rms = Math.sqrt(rs / 2048);
    // støjgulv følger langsomt efter de stille perioder
    if (rms < noise) noise = noise * 0.9 + rms * 0.1;
    else if (rms < noise * 2) noise = noise * 0.995 + rms * 0.005; // kun stille baggrund løfter gulvet
    noise = Math.max(0.0005, Math.min(noise, 0.05));
    const gate = Math.max(noise * 2.5, 0.006 / ((opts && opts.sens) || 1));
    let pitch = null, clarity = 0;
    if (rms > gate) {
      const minF = (opts && opts.minF) || 60, maxF = (opts && opts.maxF) || 1500;
      let r;
      if (minF < 60) { // decimér ×2 for bas
        if (!dec || dec.length !== N >> 1) dec = new Float32Array(N >> 1);
        for (let i = 0; i < dec.length; i++) dec[i] = 0.5 * (tbuf[2 * i] + tbuf[2 * i + 1]);
        r = yin(dec, sr / 2, minF, Math.min(maxF, sr / 5));
      } else {
        r = yin(tbuf.subarray(N - 2048), sr, minF, maxF);
      }
      if (r && r.clarity > 0.75 && r.f >= minF * 0.95 && r.f <= maxF) { pitch = 69 + 12 * Math.log2(r.f / 440); clarity = r.clarity; }
    }
    let chroma = null;
    if (opts && opts.chroma && rms > gate) {
      anF.getFloatFrequencyData(fbuf);
      chroma = new Float32Array(12);
      const binHz = sr / anF.fftSize;
      const k0 = Math.ceil(75 / binHz), k1 = Math.floor(2200 / binHz);
      let maxDb = -200; for (let k = k0; k <= k1; k++) if (fbuf[k] > maxDb) maxDb = fbuf[k];
      const floorDb = Math.max(-95, maxDb - 32);
      for (let k = k0; k <= k1; k++) {
        const db = fbuf[k]; if (db < floorDb) continue;
        // kun lokale toppe, med interpoleret frekvens
        if (!(db >= fbuf[k - 1] && db > fbuf[k + 1])) continue;
        const a = fbuf[k - 1], c = fbuf[k + 1], den = a - 2 * db + c;
        const p = den !== 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
        const m = 69 + 12 * Math.log2((k + p) * binHz / 440);
        const dev = m - Math.round(m); if (Math.abs(dev) > 0.38) continue; // læk mellem halvtoner
        const pc = ((Math.round(m) % 12) + 12) % 12;
        chroma[pc] += Math.pow(10, (db - maxDb) / 20) * (1 - Math.abs(dev));
      }
      let mx = 0; for (let i = 0; i < 12; i++) mx = Math.max(mx, chroma[i]);
      if (mx > 0) for (let i = 0; i < 12; i++) chroma[i] /= mx; else chroma = null;
    }
    return { t: now, rms, gate, pitch, clarity, onsets, chroma };
  }

  // Akkord-match: krævede toner (pcs) mod kroma
  function chordScore(chroma, pcs) {
    if (!chroma) return 0;
    let tot = 0, inn = 0; for (let i = 0; i < 12; i++) { tot += chroma[i]; if (pcs.includes(i)) inn += chroma[i]; }
    const ratio = inn / (tot || 1);
    const present = pcs.filter(p => chroma[p] >= 0.18).length;
    const need = pcs.length >= 4 ? pcs.length - 1 : pcs.length;
    return present >= need ? ratio : ratio * 0.5;
  }
  // Skabelon med overtoner for de toner der faktisk klinger i grebet
  const tplCache = new Map();
  function template(notes) {
    const key = notes.join(','); if (tplCache.has(key)) return tplCache.get(key);
    const t = new Float32Array(12);
    notes.forEach((m, i) => { for (let h = 1; h <= 8; h++) { const pc = ((Math.round(m + 12 * Math.log2(h)) % 12) + 12) % 12; t[pc] += Math.pow(0.85, h - 1); } });
    let n = 0; for (let i = 0; i < 12; i++) n += t[i] * t[i]; n = Math.sqrt(n); for (let i = 0; i < 12; i++) t[i] /= n;
    tplCache.set(key, t); return t;
  }
  function cosine(ch, t) { let dot = 0, n = 0; for (let i = 0; i < 12; i++) { dot += ch[i] * t[i]; n += ch[i] * ch[i]; } return n > 0 ? dot / Math.sqrt(n) : 0; }
  // Er akkorden "target" den der spilles? Sammenlignes med alle akkorder i biblioteket
  const pcsOf = (c, instr) => [...new Set(M.shapeNotes(c, instr).map(m => ((m % 12) + 12) % 12))];
  const related = (a, b) => a.every(p => b.includes(p)) || b.every(p => a.includes(p)); // del-/overmængde (fx G og G7)
  function chordMatch(chroma, target, instr) {
    if (!chroma) return { ok: false, cos: 0, best: null, missing: [] };
    const tp = pcsOf(target, instr);
    let best = null, bc = -1, rival = 0;
    const pw = !!M.CH[target].power;
    for (const c of M.chordNames(instr)) {
      if (!!M.CH[c].power !== pw) continue;
      const v = cosine(chroma, template(M.shapeNotes(c, instr)));
      if (v > bc) { bc = v; best = c; }
      if (c !== target && !related(pcsOf(c, instr), tp) && v > rival) rival = v;
    }
    const cos = cosine(chroma, template(M.shapeNotes(target, instr)));
    const missing = tp.filter(p => chroma[p] < 0.15);
    const need = tp.length >= 4 ? tp.length - 1 : tp.length;
    const ok = cos >= 0.7 && cos >= rival - 0.04 && tp.length - missing.length >= need;
    return { ok, cos, best, missing: missing.length > tp.length - need ? missing : [] };
  }

  // ---------- Synth ----------
  function ksBuffer(midi, kind) {
    const key = kind + midi; if (synthCache.has(key)) return synthCache.get(key);
    const sr = ctx.sampleRate, f = M.freq(midi), len = Math.floor(sr * (kind === 'piano' ? 2.2 : 1.8));
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    if (kind === 'piano' || kind === 'voice') {
      const harms = kind === 'piano' ? [1, .5, .28, .16, .09, .05] : [1, .35, .12];
      for (let i = 0; i < len; i++) {
        const t = i / sr; let s = 0;
        for (let h = 0; h < harms.length; h++) s += harms[h] * Math.sin(2 * Math.PI * f * (h + 1) * t * (1 + 0.0004 * h)) * Math.exp(-t * (kind === 'piano' ? 1.6 + h * 0.9 : 0.4));
        const att = Math.min(1, t / (kind === 'piano' ? 0.004 : 0.06));
        d[i] = s * 0.28 * att;
      }
    } else { // Karplus-Strong
      const P = Math.max(2, Math.round(sr / f)); const ring = new Float32Array(P);
      for (let i = 0; i < P; i++) ring[i] = Math.random() * 2 - 1;
      // blødere anslag
      for (let k = 0; k < 2; k++) for (let i = 1; i < P; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);
      const damp = kind === 'bass' ? 0.996 : 0.997;
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const n = (idx + 1) % P; const v = ring[idx];
        ring[idx] = damp * 0.5 * (v + ring[n]); d[i] = v * 0.45; idx = n;
      }
    }
    synthCache.set(key, buf); return buf;
  }
  function play(midi, when, dur, kind, vol = 1) {
    ensureCtx();
    const src = ctx.createBufferSource(); src.buffer = ksBuffer(Math.round(midi), kind);
    const g = ctx.createGain(); const t0 = when || ctx.currentTime;
    g.gain.setValueAtTime(vol, t0);
    const end = t0 + Math.max(0.15, dur || 1.2);
    g.gain.setValueAtTime(vol, end - 0.08); g.gain.linearRampToValueAtTime(0.0001, end);
    src.connect(g); g.connect(master); src.start(t0); src.stop(end + 0.02);
    return src;
  }
  function strum(notes, when, dur, kind, vol = 0.8) { notes.forEach((m, i) => play(m, (when || ctx.currentTime) + i * 0.018, dur, kind, vol / Math.sqrt(notes.length) * 1.4)); }
  function click(when, accent, vol = 0.5) {
    ensureCtx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = accent ? 1800 : 1200;
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol * (accent ? 0.5 : 0.32), when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    o.connect(g); g.connect(master); o.start(when); o.stop(when + 0.05);
  }
  function tone(midi, dur = 2, type = 'sine') { // ren referencetone (stemmeapparat)
    ensureCtx(); const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.value = M.freq(midi);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
    g.gain.setValueAtTime(0.25, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const synthKind = instr => instr === 'piano' ? 'piano' : instr === 'voice' ? 'voice' : instr === 'bass' ? 'bass' : 'string';

  // ---------- Metronom (lookahead-skemalægning) ----------
  const metro = { on: false, bpm: 90, beats: 4, next: 0, beat: 0, timer: null, onBeat: null };
  function metroStart(bpm, beats, onBeat) {
    ensureCtx(); metroStop();
    Object.assign(metro, { on: true, bpm, beats, beat: 0, next: ctx.currentTime + 0.1, onBeat });
    const tick = () => {
      while (metro.next < ctx.currentTime + 0.15) {
        const b = metro.beat; click(metro.next, b === 0, 0.7);
        const t = metro.next; if (metro.onBeat) setTimeout(() => metro.on && metro.onBeat(b), Math.max(0, (t - ctx.currentTime) * 1000));
        metro.next += 60 / metro.bpm; metro.beat = (metro.beat + 1) % metro.beats;
      }
    };
    tick(); metro.timer = setInterval(tick, 25);
  }
  function metroStop() { metro.on = false; if (metro.timer) clearInterval(metro.timer); metro.timer = null; }
  function metroSet(bpm, beats) { metro.bpm = bpm; if (beats) { metro.beats = beats; metro.beat = metro.beat % beats; } }

  return { ensureCtx, get ctx() { return ctx; }, startMic, stopMic, micOn, useTestBuffer, input, setInput, listInputs, analyze, yin, chordScore, chordMatch, template,
           play, strum, click, tone, synthKind, ksBuffer, metro, metroStart, metroStop, metroSet,
           get noise() { return noise; } };
})();
