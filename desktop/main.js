// Lucas App Store til Windows og Linux.
// Butikken ligger i programmet; apps åbnes fra GitHub Pages i hvert sit vindue med
// en "App"-bro, så de kan gemme data, vise påmindelser, dele filer osv. som på Android.
const { app, BrowserWindow, ipcMain, net, shell, dialog, clipboard, Notification, powerSaveBlocker, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const createAI = require("./ai.js");

const RAW = "https://raw.githubusercontent.com/Lucas050908/Appstore-/main/store/";
const PAGES = process.env.LAS_PAGES || "https://lucas050908.github.io/Appstore-/";
const ICON = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png"));

const dir = (...p) => { const d = path.join(app.getPath("userData"), ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const safe = s => String(s || "data").replace(/[^A-Za-z0-9_-]/g, "_");
let storeWin = null;
const appWins = new Map();
const blockers = new Map();

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (storeWin) { if (storeWin.isMinimized()) storeWin.restore(); storeWin.focus(); } });

function externalLinks(win) {
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    const cur = win.webContents.getURL();
    try { if (new URL(url).origin !== new URL(cur).origin && !url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); } } catch (_) {}
  });
}

function createStore() {
  storeWin = new BrowserWindow({
    width: 1180, height: 860, minWidth: 380, minHeight: 500, icon: ICON, title: "Lucas App Store", backgroundColor: "#12110F", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload-store.js"), contextIsolation: false, nodeIntegration: false, sandbox: false }
  });
  storeWin.loadFile(path.join(__dirname, "store", "index.html"));
  externalLinks(storeWin);
  storeWin.on("closed", () => { storeWin = null; });
}

/* ---------- katalog ---------- */
async function getJson(url) {
  const r = await net.fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
ipcMain.handle("catalog", async () => {
  const cacheFile = path.join(dir(), "catalog.json");
  let data = null;
  try { data = await getJson(PAGES + "apps.json"); } catch (_) {}
  if (!data) { try { data = await getJson(RAW + "apps.json"); } catch (_) {} }
  if (data) { fs.writeFileSync(cacheFile, JSON.stringify(data)); return { json: JSON.stringify(data), cached: false }; }
  try { return { json: fs.readFileSync(cacheFile, "utf8"), cached: true }; } catch (_) { return { json: null, cached: true }; }
});

/* ---------- app-vinduer ---------- */
function openApp(a) {
  const old = appWins.get(a.id);
  if (old && !old.isDestroyed()) { if (old.isMinimized()) old.restore(); old.focus(); if (a.hash) old.webContents.executeJavaScript(`window.openHash?openHash(${JSON.stringify(a.hash)}):(location.hash=${JSON.stringify(a.hash)})`).catch(() => {}); return; }
  const url = /^https?:/.test(a.web) ? a.web : PAGES + a.web;
  const w = new BrowserWindow({
    width: 1100, height: 820, minWidth: 360, minHeight: 480, icon: ICON, title: a.name, backgroundColor: "#12110F", autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-app.js"), contextIsolation: false, nodeIntegration: false, sandbox: false,
      partition: "persist:app-" + safe(a.id), additionalArguments: ["--lapp-id=" + safe(a.id), "--lapp-name=" + encodeURIComponent(a.name || a.id)]
    }
  });
  w.loadURL(url + (a.hash ? "#" + a.hash : ""));
  externalLinks(w);
  w.webContents.on("page-title-updated", e => { e.preventDefault(); w.setTitle(a.name); });
  w.webContents.on("did-fail-load", (_e, code, desc, failedUrl, isMain) => {
    if (!isMain) return;
    w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<body style="font:16px system-ui;background:#12110F;color:#eee;display:grid;place-items:center;height:90vh;text-align:center"><div><h2>${a.name} kunne ikke åbnes</h2><p>Tjek din internetforbindelse og prøv igen.</p><p style="opacity:.6">${desc}</p></div></body>`));
  });
  appWins.set(a.id, w);
  w.on("closed", () => {
    appWins.delete(a.id);
    if (a.id === "lokal-ai" && ai) { ai.stop(); ai._dispose(); }   // frigør hukommelsen, når Lokal AI lukkes
  });
}
ipcMain.on("open-app", (_e, a) => openApp(a));
ipcMain.on("open-external", (_e, url) => { if (/^https?:|^mailto:/.test(url)) shell.openExternal(url); });
ipcMain.on("version", e => { e.returnValue = app.getVersion(); });

/* ---------- "App"-broen for apps ---------- */
const winOf = e => BrowserWindow.fromWebContents(e.sender);
const call = (wc, fn, ...args) => wc.executeJavaScript(`window.${fn}&&${fn}(${args.map(a => JSON.stringify(String(a ?? ""))).join(",")})`).catch(() => {});

ipcMain.on("app-load", (e, id, key) => {
  const d = dir("data", safe(id));
  for (const f of [safe(key) + ".json", safe(key) + ".json.bak"]) {
    try { const s = fs.readFileSync(path.join(d, f), "utf8"); JSON.parse(s); e.returnValue = s; return; } catch (_) {}
  }
  e.returnValue = null;
});
ipcMain.on("app-save", (e, id, key, data) => {
  try {
    const d = dir("data", safe(id)), f = path.join(d, safe(key) + ".json");
    if (fs.existsSync(f)) fs.copyFileSync(f, f + ".bak");
    fs.writeFileSync(f + ".tmp", data); fs.renameSync(f + ".tmp", f);
    const day = new Date().toISOString().slice(0, 10), b = dir("data", safe(id), "backups");
    fs.writeFileSync(path.join(b, safe(key) + "-" + day + ".json"), data);
    const all = fs.readdirSync(b).filter(n => n.startsWith(safe(key) + "-")).sort();
    while (all.length > 7) fs.unlinkSync(path.join(b, all.shift()));
    e.returnValue = true;
  } catch (_) { e.returnValue = false; }
});
ipcMain.on("app-share", async (e, name, _mime, text) => {
  const r = await dialog.showSaveDialog(winOf(e), { defaultPath: path.join(app.getPath("downloads"), String(name).replace(/[^A-Za-z0-9._-]/g, "_")) });
  if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, text); notify("Gemt", path.basename(r.filePath)); }
});
ipcMain.on("app-copy", (_e, text) => clipboard.writeText(String(text)));
ipcMain.on("app-toast", (e, text) => { const w = winOf(e); notify(w ? w.getTitle() : "Lucas App Store", text); });
ipcMain.on("app-pick", async e => {
  const r = await dialog.showOpenDialog(winOf(e), { properties: ["openFile"] });
  if (!r.canceled && r.filePaths[0]) { try { call(e.sender, "onFilePicked", fs.readFileSync(r.filePaths[0], "utf8")); } catch (_) { notify("Fejl", "Kunne ikke læse filen"); } }
});
ipcMain.on("app-awake", (e, on) => {
  const id = e.sender.id;
  if (on && !blockers.has(id)) blockers.set(id, powerSaveBlocker.start("prevent-display-sleep"));
  if (!on && blockers.has(id)) { powerSaveBlocker.stop(blockers.get(id)); blockers.delete(id); }
});
ipcMain.on("app-perm", (e, name) => call(e.sender, "onPerm", name, ["notifications", "camera", "mic"].includes(name) ? "1" : "0"));
ipcMain.on("app-location", e => call(e.sender, "onLocationError", "off"));

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: String(title || ""), body: String(body || ""), icon: ICON });
  if (onClick) n.on("click", onClick);
  n.show();
}

/* ---------- Lokal AI (llama.cpp på computeren) ---------- */
let ai = null, aiWc = null;
function getAI() {
  if (!ai) ai = createAI({
    dir: dir("ai"),
    fetchUrl: (u, o) => net.fetch(u, o),
    pickFile: async () => {
      const r = await dialog.showOpenDialog(aiWc && !aiWc.isDestroyed() ? BrowserWindow.fromWebContents(aiWc) : undefined, { properties: ["openFile"], filters: [{ name: "GGUF-model", extensions: ["gguf"] }] });
      return r.canceled ? null : r.filePaths[0];
    },
    onEmit: (fn, args) => {
      if (aiWc && !aiWc.isDestroyed()) aiWc.executeJavaScript(`window.${fn}&&${fn}(${args.map(a => a === undefined ? "null" : JSON.stringify(a)).join(",")})`).catch(() => {});
    }
  });
  return ai;
}
const AI_SYNC = ["info", "models", "downloads", "download", "cancelDownload", "deleteModel", "lastModel"];
const AI_ASYNC = ["load", "unload", "chat", "stop", "importModel", "cancelImport"];
ipcMain.on("ai-sync", (e, fn, ...args) => {
  aiWc = e.sender;
  try { e.returnValue = AI_SYNC.includes(fn) ? (getAI()[fn](...args) ?? null) : null; } catch (_) { e.returnValue = null; }
});
ipcMain.on("ai-async", (e, fn, ...args) => {
  aiWc = e.sender;
  if (AI_ASYNC.includes(fn)) Promise.resolve().then(() => getAI()[fn](...args)).catch(() => {});
});

/* ---------- påmindelser (virker mens programmet kører) ---------- */
const remFile = () => path.join(dir(), "reminders.json");
let reminders = {};
const timers = new Map();
try { reminders = JSON.parse(fs.readFileSync(remFile(), "utf8")); } catch (_) {}
const saveRem = () => fs.writeFileSync(remFile(), JSON.stringify(reminders));
function arm(key) {
  clearTimeout(timers.get(key));
  const r = reminders[key]; if (!r) return;
  const ms = Math.max(1000, r.at - Date.now());
  if (ms > 2 ** 31 - 1) { timers.set(key, setTimeout(() => arm(key), 2 ** 31 - 1)); return; }
  timers.set(key, setTimeout(() => {
    delete reminders[key]; saveRem();
    notify(r.title, r.text, () => openApp({ id: r.app, name: r.name, web: r.web, hash: r.hash }));
  }, ms));
}
ipcMain.on("app-schedule", (_e, appInfo, id, at, title, text, hash) => {
  const key = appInfo.id + ":" + id;
  reminders[key] = { app: appInfo.id, name: appInfo.name, web: appInfo.web, at: +at, title, text, hash };
  saveRem(); arm(key);
});
ipcMain.on("app-cancel", (_e, appId, id) => { const key = appId + ":" + id; clearTimeout(timers.get(key)); delete reminders[key]; saveRem(); });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (process.platform === "win32") app.setAppUserModelId("dk.lucas.appstore.desktop");
  for (const k of Object.keys(reminders)) { if (reminders[k].at < Date.now() - 6 * 3600e3) delete reminders[k]; else arm(k); }
  saveRem();
  createStore();
  app.on("activate", () => { if (!storeWin) createStore(); });
});
app.on("window-all-closed", () => app.quit());
// Luk AI-motoren pænt, før programmet lukker (ellers kan llama.cpp gå ned under nedlukning).
let aiClosed = false;
app.on("before-quit", e => {
  if (!ai || aiClosed) return;
  e.preventDefault();
  try { ai.stop(); } catch (_) {}
  Promise.race([Promise.resolve(ai._dispose()), new Promise(r => setTimeout(r, 3000))]).finally(() => { aiClosed = true; app.quit(); });
});

// Til automatisk test i CI: LAS_SHOT=fil.png tager et billede af butikken og lukker.
if (process.env.LAS_SHOT) app.whenReady().then(() => setTimeout(async () => {
  try { const img = await storeWin.webContents.capturePage(); fs.writeFileSync(process.env.LAS_SHOT, img.toPNG()); } catch (e) { console.error(e); }
  app.quit();
}, 9000));
if (process.env.LAS_TEST_APP) app.whenReady().then(() => {
  setTimeout(() => openApp({ id: process.env.LAS_TEST_APP, name: "Test", web: "apps/" + process.env.LAS_TEST_APP + "/index.html" }), 2000);
  setTimeout(async () => { const w = appWins.get(process.env.LAS_TEST_APP); if (w) { const img = await w.webContents.capturePage(); fs.writeFileSync(process.env.LAS_SHOT + ".app.png", img.toPNG()); } }, 8000);
});
