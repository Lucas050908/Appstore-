// Lokal AI på PC: samme "Native"-bro som Android-appen, men med llama.cpp via node-llama-cpp.
// Modellerne hentes og ligger i programmets mappe; alt kører på computeren uden internet.
const path = require("path");
const fs = require("fs");
const os = require("os");

module.exports = function createAI({ dir, fetchUrl, pickFile, onEmit }) {
  const modelsDir = path.join(dir, "models");
  fs.mkdirSync(modelsDir, { recursive: true });
  const prefsFile = path.join(dir, "ai.json");
  let prefs = {};
  try { prefs = JSON.parse(fs.readFileSync(prefsFile, "utf8")); } catch (_) {}
  const savePrefs = () => { try { fs.writeFileSync(prefsFile, JSON.stringify(prefs)); } catch (_) {} };

  let lib = null, llama = null, model = null, context = null, seq = null, loaded = null, loadedInfo = "", busy = false, abort = null;
  const dls = new Map();
  let importJob = null;

  const emit = (fn, ...args) => onEmit(fn, args);
  const safeName = f => path.basename(String(f || "")).replace(/[^A-Za-z0-9._-]/g, "_");
  const errText = e => String((e && e.message) || e || "Ukendt fejl").slice(0, 300);

  async function engine() {
    if (!lib) lib = await import("node-llama-cpp");
    if (!llama) llama = await lib.getLlama({ gpu: false, build: "never", logLevel: lib.LlamaLogLevel ? lib.LlamaLogLevel.error : undefined });
    return lib;
  }
  async function dispose() {
    try { if (context) await context.dispose(); } catch (_) {}
    try { if (model) await model.dispose(); } catch (_) {}
    context = null; model = null; seq = null; loaded = null; loadedInfo = "";
  }

  function freeSpace() {
    try { const s = fs.statfsSync(modelsDir); return s.bavail * s.bsize; } catch (_) { return 0; }
  }

  return {
    info() {
      return JSON.stringify({ ramTotal: os.totalmem(), ramAvail: os.freemem(), free: freeSpace(), cores: os.cpus().length, ready: true, loaded, loadedInfo, busy });
    },
    models() {
      try {
        return JSON.stringify(fs.readdirSync(modelsDir).filter(f => /\.gguf$/i.test(f)).map(f => ({ file: f, size: fs.statSync(path.join(modelsDir, f)).size })));
      } catch (_) { return "[]"; }
    },
    downloads() {
      const out = [];
      for (const [id, d] of dls) {
        out.push({ id, file: d.file, state: d.state, done: d.done, total: d.total, error: d.error || "" });
        if (d.state === "done" || d.state === "failed") dls.delete(id);   // meld slut én gang
      }
      return JSON.stringify(out);
    },
    download(url, file) {
      file = safeName(file);
      if (!/^https:\/\//.test(url) || !/\.gguf$/i.test(file)) return "Ugyldigt link";
      if (fs.existsSync(path.join(modelsDir, file))) return "Modellen er allerede hentet";
      for (const d of dls.values()) if (d.file === file && d.state === "running") return "Bliver allerede hentet";
      const id = String(Date.now());
      const ctl = new AbortController();
      const d = { file, state: "running", done: 0, total: 0, ctl };
      dls.set(id, d);
      (async () => {
        const part = path.join(modelsDir, file + ".part");
        try {
          const r = await fetchUrl(url, { signal: ctl.signal });
          if (!r.ok) throw new Error("Serveren svarede " + r.status);
          d.total = Number(r.headers.get("content-length")) || 0;
          if (d.total && freeSpace() && d.total > freeSpace()) throw new Error("Ikke plads nok på disken");
          const out = fs.createWriteStream(part);
          const reader = r.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!out.write(Buffer.from(value))) await new Promise(res => out.once("drain", res));
            d.done += value.length;
          }
          await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
          fs.renameSync(part, path.join(modelsDir, file));
          d.state = "done";
        } catch (e) {
          try { fs.unlinkSync(part); } catch (_) {}
          if (ctl.signal.aborted) dls.delete(id); else { d.state = "failed"; d.error = errText(e); }
        }
      })();
      return null;
    },
    cancelDownload(id) { const d = dls.get(String(id)); if (d && d.ctl) d.ctl.abort(); },
    deleteModel(file) {
      file = safeName(file);
      if (loaded === file) { dispose(); emit("onLoad", null, null); }
      try { fs.unlinkSync(path.join(modelsDir, file)); return null; } catch (e) { return "Kunne ikke slette: " + errText(e); }
    },
    lastModel() { return prefs.last || ""; },
    async load(file, ctx, threads) {
      file = safeName(file);
      if (busy) { emit("onLoad", "Vent til svaret er færdigt", loaded); return; }
      try {
        const L = await engine();
        await dispose();
        model = await llama.loadModel({ modelPath: path.join(modelsDir, file) });
        const size = Math.max(512, Math.min(Number(ctx) || 4096, model.trainContextSize || 4096));
        context = await model.createContext({ contextSize: size, threads: Number(threads) > 0 ? Number(threads) : undefined });
        seq = context.getSequence();
        loaded = file;
        let arch = ""; try { arch = model.fileInfo.metadata.general.architecture || ""; } catch (_) {}
        loadedInfo = [arch, "ctx " + context.contextSize, "CPU"].filter(Boolean).join(" · ");
        prefs.last = file; savePrefs();
        emit("onLoad", null, file);
        void L;
      } catch (e) {
        await dispose();
        emit("onLoad", "Kunne ikke indlæse modellen: " + errText(e), null);
      }
    },
    async unload() { await dispose(); emit("onLoad", null, null); },
    async chat(json, temp, max) {
      if (!seq) { emit("onDone", "Ingen model er indlæst"); return; }
      if (busy) { emit("onDone", "Vent til svaret er færdigt"); return; }
      busy = true; abort = new AbortController();
      let session = null, n = 0;
      const t0 = Date.now();
      try {
        const { LlamaChatSession } = await engine();
        const msgs = JSON.parse(json || "[]");
        const sys = msgs.filter(m => m.role === "system").map(m => m.content).join("\n");
        const rest = msgs.filter(m => m.role !== "system");
        const last = rest.pop();
        if (!last || last.role !== "user") throw new Error("Der er ingen besked at svare på");
        session = new LlamaChatSession({ contextSequence: seq, systemPrompt: sys || undefined });
        const hist = session.getChatHistory().filter(h => h.type === "system");
        for (const m of rest) hist.push(m.role === "assistant" ? { type: "model", response: [String(m.content)] } : { type: "user", text: String(m.content) });
        session.setChatHistory(hist);
        await session.prompt(String(last.content), {
          temperature: Number(temp) >= 0 ? Number(temp) : 0.7,
          maxTokens: Number(max) > 0 ? Number(max) : 1024,
          signal: abort.signal, stopOnAbortSignal: true,
          onTextChunk: t => emit("onTok", t),
          onToken: toks => { n += toks.length; }
        });
        emit("onStats", n, Math.max(0.001, (Date.now() - t0) / 1000));
        emit("onDone", null);
      } catch (e) {
        emit("onDone", abort.signal.aborted ? null : "Fejl: " + errText(e));
      } finally {
        try { if (session) session.dispose({ disposeSequence: false }); } catch (_) {}
        busy = false; abort = null;
      }
    },
    stop() { if (abort) abort.abort(); },
    async importModel() {
      const src = await pickFile();
      if (!src) return;
      const file = safeName(src);
      if (!/\.gguf$/i.test(file)) { emit("onImport", { state: "error", error: "Vælg en .gguf-fil" }); return; }
      const dst = path.join(modelsDir, file), part = dst + ".part";
      const total = fs.statSync(src).size;
      importJob = { cancelled: false };
      const job = importJob;
      let done = 0, last = 0;
      try {
        await new Promise((res, rej) => {
          const rs = fs.createReadStream(src), ws = fs.createWriteStream(part);
          job.stop = () => { rs.destroy(new Error("stoppet")); };
          rs.on("data", c => { done += c.length; if (Date.now() - last > 250) { last = Date.now(); emit("onImport", { state: "progress", done, total }); } });
          rs.on("error", rej); ws.on("error", rej); ws.on("finish", res);
          rs.pipe(ws);
        });
        fs.renameSync(part, dst);
        emit("onImport", { state: "done", file });
      } catch (e) {
        try { fs.unlinkSync(part); } catch (_) {}
        emit("onImport", job.cancelled ? { state: "cancelled" } : { state: "error", error: errText(e) });
      }
      importJob = null;
    },
    cancelImport() { if (importJob) { importJob.cancelled = true; importJob.stop && importJob.stop(); } },
    _dispose: dispose
  };
};
