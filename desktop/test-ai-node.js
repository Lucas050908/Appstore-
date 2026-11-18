// CI-test af Lokal AI-motoren med en rigtig model: node test-ai-node.js <url> <fil> [forventet ord]
const createAI = require("./ai.js");
const os = require("os"), path = require("path"), fs = require("fs");
const [url, file, expect] = process.argv.slice(2);
const dir = path.join(os.tmpdir(), "lai-test");
fs.mkdirSync(dir, { recursive: true });
let text = "";
const waiters = {};
const ai = createAI({ dir, fetchUrl: fetch, pickFile: async () => null,
  onEmit: (fn, args) => { if (fn === "onTok") { text += args[0]; process.stdout.write(args[0]); } else console.log("\n[" + fn + "]", JSON.stringify(args)); (waiters[fn] || []).splice(0).forEach(f => f(args)); } });
const wait = fn => new Promise(r => (waiters[fn] = waiters[fn] || []).push(r));
(async () => {
  if (!JSON.parse(ai.models()).some(m => m.file === file)) {
    const err = ai.download(url, file); if (err) throw new Error(err);
    for (;;) { await new Promise(r => setTimeout(r, 2000)); const d = JSON.parse(ai.downloads())[0];
      if (d) console.log("download", d.state, Math.round(d.done / 1e6) + " MB af " + Math.round(d.total / 1e6));
      if (d && d.state === "failed") throw new Error(d.error); if (!d || d.state === "done") break; }
  }
  const l = wait("onLoad"); ai.load(file, 2048, 0); const [err] = await l; if (err) throw new Error(err);
  console.log("info", ai.info());
  const d = wait("onDone");
  ai.chat(JSON.stringify([{ role: "system", content: "Du er en hjælpsom assistent. Svar på dansk, kort og præcist." }, { role: "user", content: "Hvad hedder hovedstaden i Danmark? Svar med ét ord." }]), 0.2, 40);
  const [derr] = await d; if (derr) throw new Error(derr);
  console.log("\nSVAR:", JSON.stringify(text));
  if (!text.trim()) throw new Error("tomt svar");
  if (expect && !expect.split("|").some(w => text.toLowerCase().includes(w.toLowerCase()))) throw new Error("forventede '" + expect + "' i svaret");
  await ai._dispose();
  console.log("OK");
  process.exit(0);
})().catch(e => { console.error("\nFEJL:", e.message); process.exit(1); });
