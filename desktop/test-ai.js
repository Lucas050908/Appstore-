// Test af Lokal AI i PC-programmet. Kør: LAS_PAGES=http://localhost:8900/ electron test-ai.js
const { app, BrowserWindow } = require("electron");
require("./main.js");
const path = require("path"), fs = require("fs");
const BASE = process.env.LAS_PAGES;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1000, height: 760, webPreferences: { preload: path.join(__dirname, "preload-app.js"), contextIsolation: false, nodeIntegration: false, sandbox: false, partition: "persist:test-ai", additionalArguments: ["--lapp-id=lokal-ai", "--lapp-name=Lokal%20AI"] } });
  const errs = []; w.webContents.on("console-message", (_e, l, m) => { if (l >= 3) errs.push(m); });
  await w.loadURL(BASE + "apps/lokal-ai/index.html");
  const js = c => w.webContents.executeJavaScript(c);
  await new Promise(r => setTimeout(r, 3000));
  console.log("info", await js("Native.info()"));
  console.log("models", await js("Native.models()"));
  await js(`(()=>{ if(!info.loaded){ loadModel("tiny.gguf"); } })()`);
  await new Promise(r => setTimeout(r, 3000));
  console.log("status", await js(`document.getElementById("status").innerText`));
  await js(`document.getElementById("shModels").classList.remove("open"); document.getElementById("inp").value="Hej, hvem er du?"; send();`);
  await new Promise(r => setTimeout(r, 6000));
  console.log("msgs", JSON.stringify(await js(`document.getElementById("msgs").innerText.slice(0,300)`)));
  fs.writeFileSync("/home/claude/ai-shot.png", (await w.webContents.capturePage()).toPNG());
  console.log("errors", errs);
  app.quit();
});
