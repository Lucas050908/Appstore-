// Testkørsel (bruges ikke i programmet): åbner hver app med samme bro som PC-programmet,
// samler fejl og tager skærmbilleder. Kør: LAS_PAGES=http://localhost:8900/ electron test-apps.js
const { app, BrowserWindow } = require("electron");
require("./main.js");   // samme bro-håndtering som det rigtige program
const path = require("path"), fs = require("fs");
const T = (p, ms = 12000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const BASE = process.env.LAS_PAGES || "https://lucas050908.github.io/Appstore-/";
const OUT = process.env.OUT || "/tmp/etest";
app.whenReady().then(async () => {
  const cat = JSON.parse(fs.readFileSync(process.env.CATALOG, "utf8"));
  const res = {};
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  for (const a of cat.apps.filter(x => x.web && (!only.length || only.includes(x.id)))) {
    const errs = [];
    const w = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { preload: path.join(__dirname, "preload-app.js"), contextIsolation: false, nodeIntegration: false, sandbox: false, partition: "persist:test-" + a.id, additionalArguments: ["--lapp-id=" + a.id, "--lapp-name=" + encodeURIComponent(a.name)] } });
    w.webContents.on("console-message", (_e, level, msg, line, src) => { if (level >= 3) errs.push("console: " + msg.slice(0, 160) + " @" + (src || "").split("/").pop() + ":" + line); });
    w.webContents.on("render-process-gone", (_e, d) => errs.push("CRASH " + d.reason));
    w.webContents.on("did-fail-load", (_e, c, d, u, main) => { if (main) errs.push("LOADFAIL " + d); });
    try { await T(w.loadURL(BASE + a.web)); } catch (e) { errs.push("load: " + e.message); }
    await new Promise(r => setTimeout(r, 2500));
    const shot = async n => { try { fs.writeFileSync(`${OUT}/${a.id}-${n}.png`, (await T(w.webContents.capturePage(), 8000)).toPNG()); } catch (e) { errs.push('shot: ' + e.message); } };
    await shot(0);
    let tabs = 0;
    try {
      tabs = await T(w.webContents.executeJavaScript(`(()=>{const H=innerHeight;return [...document.querySelectorAll('button,a,[role=tab],[data-tab],[data-t]')].filter(e=>{const r=e.getBoundingClientRect();return e.offsetParent&&r.top>H-120&&r.height<110&&r.width<240}).length})()`));
      for (let i = 0; i < Math.min(tabs, 7); i++) {
        await T(w.webContents.executeJavaScript(`(()=>{const H=innerHeight;const els=[...document.querySelectorAll('button,a,[role=tab],[data-tab],[data-t]')].filter(e=>{const r=e.getBoundingClientRect();return e.offsetParent&&r.top>H-120&&r.height<110&&r.width<240});els[${i}]&&els[${i}].click()})()`), 5000);
        await new Promise(r => setTimeout(r, 700));
      }
      await shot(1);
    } catch (e) { errs.push("click: " + e.message); }
    const saved = fs.existsSync(path.join(app.getPath("userData"), "data", a.id));
    console.log('done', a.id); res[a.id] = { tabs, errs: [...new Set(errs)].slice(0, 8), savedFiles: saved };
    w.destroy();
    fs.writeFileSync(OUT + "/result.json", JSON.stringify(res, null, 1));
  }
  fs.writeFileSync(OUT + "/result.json", JSON.stringify(res, null, 1));
  app.quit();
});
