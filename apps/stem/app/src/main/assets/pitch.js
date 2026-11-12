/* Fælles tonegenkendelse til instrumenter (Stem, Takt).
   YIN på et nedsamplet signal, så lave toner (bas ned til ~30 Hz) kan måles billigt.
   Robust overfor elguitar med forvrængning: vælger første tydelige periode, korrigerer
   oktavspring mod forventet streng og udglatter med median. */
"use strict";
const Pitch = (() => {
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "H"];
  const NOTES_B = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "H"];

  /** Åbn rå lyd fra mikrofon eller kabel (ingen støjfilter/AGC). deviceId er valgfri. */
  async function open(deviceId) {
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    if (deviceId) audio.deviceId = { exact: deviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 8192; an.smoothingTimeConstant = 0;
    src.connect(an);
    return { ctx, stream, an, buf: new Float32Array(an.fftSize), close() { stream.getTracks().forEach(t => t.stop()); ctx.close(); } };
  }
  async function inputs() {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return d.filter(x => x.kind === "audioinput").map(x => ({ id: x.deviceId, label: x.label || "Mikrofon" }));
    } catch (e) { return []; }
  }

  /** YIN. data = Float32Array, sr = samplerate. Returnerer {freq, clarity, rms} eller null. */
  function detect(data, sr, opt = {}) {
    const minF = opt.minF || 30, maxF = opt.maxF || 1400, thr = opt.threshold || 0.12;
    // RMS / støjport
    let rms = 0; for (let i = 0; i < data.length; i++) rms += data[i] * data[i];
    rms = Math.sqrt(rms / data.length);
    if (rms < (opt.gate || 0.008)) return { freq: 0, clarity: 0, rms };
    // nedsampling ×2 (bedre for lave toner, halverer arbejdet)
    const dec = opt.decimate === false ? 1 : 2;
    const n = Math.floor(data.length / dec), x = new Float32Array(n);
    if (dec === 2) for (let i = 0; i < n; i++) x[i] = (data[2 * i] + data[2 * i + 1]) * 0.5; else x.set(data.subarray(0, n));
    // fjern DC
    let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n; for (let i = 0; i < n; i++) x[i] -= mean;
    const fs = sr / dec;
    const tauMin = Math.max(2, Math.floor(fs / maxF)), tauMax = Math.min(Math.floor(n / 2), Math.ceil(fs / minF));
    const W = n - tauMax;
    if (W < 64) return null;
    const d = new Float32Array(tauMax + 1);
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const v = x[i] - x[i + tau]; s += v * v; }
      d[tau] = s;
    }
    // kumulativ normaliseret differens
    const c = new Float32Array(tauMax + 1); c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      if (tau < tauMin) { c[tau] = 1; continue; }
      run += d[tau]; c[tau] = run ? d[tau] * (tau - tauMin + 1) / run : 1;
    }
    let tau = -1;
    for (let t = tauMin + 1; t < tauMax; t++) {
      if (c[t] < thr) { while (t + 1 < tauMax && c[t + 1] < c[t]) t++; tau = t; break; }
    }
    if (tau < 0) { // intet under tærsklen: tag globalt minimum, men lav clarity
      let best = 1; for (let t = tauMin; t < tauMax; t++) if (c[t] < best) { best = c[t]; tau = t; }
      if (best > 0.35) return { freq: 0, clarity: 1 - best, rms };
    }
    // parabolsk interpolation
    const a = c[tau - 1] ?? c[tau], b = c[tau], e = c[tau + 1] ?? c[tau];
    const den = a + e - 2 * b, shift = den ? (a - e) / (2 * den) : 0;
    const freq = fs / (tau + shift);
    return { freq, clarity: 1 - b, rms };
  }

  function noteOf(freq, a4 = 440) {
    const m = 69 + 12 * Math.log2(freq / a4), r = Math.round(m);
    return { midi: r, cents: (m - r) * 100, name: NOTES[(r % 12 + 12) % 12], octave: Math.floor(r / 12) - 1 };
  }
  const midiFreq = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);
  const parse = s => { const m = s.match(/^([A-H])([#b]?)(-?\d)$/); if (!m) return null; let i = NOTES.indexOf(m[1] === "B" ? "H" : m[1]); if (i < 0) i = 11; if (m[2] === "#") i++; if (m[2] === "b") i--; return (+m[3] + 1) * 12 + i; };

  /** Udglatning + oktavkorrektion mod mål-frekvenser (strenge). */
  function smoother(size = 5) {
    const hist = [];
    return (f, targets) => {
      if (!f) { hist.length = 0; return 0; }
      if (targets && targets.length) {
        // er f ≈ 2× eller ½× en streng og ikke tæt på nogen streng direkte → fold
        const near = t => Math.abs(1200 * Math.log2(f / t));
        const direct = Math.min(...targets.map(near));
        if (direct > 60) {
          for (const k of [0.5, 2, 1 / 3]) { const g = f * k; if (Math.min(...targets.map(t => Math.abs(1200 * Math.log2(g / t)))) < 45) { f = g; break; } }
        }
      }
      if (hist.length && Math.abs(1200 * Math.log2(f / hist[hist.length - 1])) > 300) hist.length = 0;
      hist.push(f); if (hist.length > size) hist.shift();
      const s = [...hist].sort((a, b) => a - b); return s[s.length >> 1];
    };
  }

  /** Karplus-Strong guitartone (referencetone). */
  function pluck(ctx, freq, dur = 2.2, vol = 0.5) {
    const sr = ctx.sampleRate, N = Math.round(sr / freq), len = Math.floor(sr * dur);
    const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let p = 0;
    for (let i = 0; i < len; i++) { const nx = (p + 1) % N; const v = 0.996 * 0.5 * (ring[p] + ring[nx]); d[i] = ring[p]; ring[p] = v; p = nx; }
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = vol;
    s.connect(g).connect(ctx.destination); s.start(); return s;
  }
  return { open, inputs, detect, noteOf, midiFreq, parse, smoother, pluck, NOTES, NOTES_B };
})();
