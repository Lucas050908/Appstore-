// Lucas App Store til Windows og Linux.
// Butikken og web-udgaverne af apps ligger i programmet (lapp://<app>/...), så de virker uden internet.
// Hver app åbner i sit eget vindue med en "App"-bro, så den kan gemme data, vise påmindelser osv. som på Android.
const { app, BrowserWindow, ipcMain, net, shell, dialog, clipboard, Notification, powerSaveBlocker, Menu, nativeImage, protocol, session } = require("electron");
const path = require("path");
const fs = require("fs");
const createAI = require("./ai.js");

const RAW = "https://raw.githubusercontent.com/Lucas050908/Appstore-/main/store/";
const PAGES = process.env.LAS_PAGES || "https://lucas050908.github.io/Appstore-/";
const ICON = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png"));
const WEB = path.join(__dirname, "apps-web");
let BUNDLED = {};
try { BUNDLED = JSON.parse(fs.readFileSync(path.join(WEB, "index.json"), "utf8")); } catch (_) {}
protocol.registerSchemesAsPrivileged([{ scheme: "lapp", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".txt": "text/plain" };
function lappHandler(req) {
  const u = new URL(req.url), id = safe(u.hostname);
  let p = decodeURIComponent(u.pathname || "/");
  if (p.endsWith("/")) p += "index.html";
  const root = path.join(WEB, "apps", id), file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) return new Response("Ikke tilladt", { status: 403 });
  try { return new Response(fs.readFileSync(file), { headers: { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" } }); }
  catch (_) { return new Response("Ikke fundet", { status: 404 }); }
}
const lappDone = new WeakSet();
function ensureLapp(ses) { if (!lappDone.has(ses)) { ses.protocol.handle("lapp", lappHandler); lappDone.add(ses); } }

const dir = (...p) => { const d = path.join(app.getPath("userData"), ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const safe = s => String(s || "data").replace(/[^A-Za-z0-9_-]/g, "_");
let storeWin = null;
const appWins = new Map();
const blockers = new Map();

if (!app.requestSingleInstanceLock()) app.quit();
const openArg = argv => { const a = (argv || []).find(x => String(x).startsWith("--open=")); return a ? safe(String(a).slice(7)) : null; };
app.on("second-instance", (_e, argv) => {
  const id = openArg(argv);
  if (id) { openById(id); return; }
  if (storeWin) { if (storeWin.isMinimized()) storeWin.restore(); storeWin.focus(); } else createStore();
});

// Apps der ligger på claude.ai (fx Skilteproduktion Service): login og sider skifter mellem Anthropics domæner.
const CLAUDE_HOST = /(^|\.)(claude\.ai|claude\.com|anthropic\.com|claudeusercontent\.com|claude\.site)$/;
const LOGIN_3P = /^https:\/\/(accounts\.google\.com|accounts\.youtube\.com|appleid\.apple\.com)\//;
const isClaudeUrl = u => { try { return CLAUDE_HOST.test(new URL(u).hostname); } catch (_) { return false; } };
function loginHelp(win) {
  dialog.showMessageBox(win, {
    type: "info", title: "Log ind på Claude", buttons: ["OK"],
    message: "Google-login virker ikke i dette vindue",
    detail: "Brug \u201cFortsæt med e-mail\u201d i stedet:\n1. Skriv din mail.\n2. Åbn mailen fra Anthropic og klik på linket.\n3. Skriv den 6-cifrede kode her i vinduet.\n\nDu skal kun gøre det én gang."
  }).catch(() => {});
}
function externalLinks(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (LOGIN_3P.test(url)) loginHelp(win); else shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const cur = win.webContents.getURL();
    if (LOGIN_3P.test(url) && isClaudeUrl(cur)) { e.preventDefault(); loginHelp(win); return; }
    if (isClaudeUrl(cur) && isClaudeUrl(url)) return;
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
// Apps, der ligger i programmet, åbnes derfra (altid samme sted, så data bliver liggende og det virker offline).
// Apps, der er kommet til senere, åbnes fra hjemmesiden, hvis den findes.
function withBundled(data) {
  for (const a of data.apps || []) {
    const b = BUNDLED[a.id];
    if (b) { a.web = "lapp://" + a.id + "/" + b.entry; a.desktopOnly = b.desktopOnly; if (b.pcNote) a.pcNote = b.pcNote; }
  }
  return data;
}
async function loadCatalog() {
  const cacheFile = path.join(dir(), "catalog.json");
  let data = null;
  try { data = await getJson(PAGES + "apps.json"); } catch (_) {}
  if (!data) { try { data = await getJson(RAW + "apps.json"); } catch (_) {} }
  if (data) { try { fs.writeFileSync(cacheFile, JSON.stringify(data)); } catch (_) {} return { data: withBundled(data), cached: false }; }
  try { return { data: withBundled(JSON.parse(fs.readFileSync(cacheFile, "utf8"))), cached: true }; } catch (_) {}
  // Helt uden internet første gang: vis de apps, der ligger i programmet.
  return { data: { store: {}, apps: Object.entries(BUNDLED).map(([id, b]) => ({ id, name: id, tagline: "", category: "Apps", version: b.version, web: "lapp://" + id + "/" + b.entry })) }, cached: true };
}
ipcMain.handle("catalog", async () => { const { data, cached } = await loadCatalog(); return { json: JSON.stringify(data), cached }; });
async function openById(id) {
  const { data } = await loadCatalog();
  const a = (data.apps || []).find(x => x.id === id);
  if (a && a.web) openApp({ id: a.id, name: a.name, web: a.web, icon: a.icon }); else if (!storeWin) createStore();
}

/* ---------- app-ikoner og genveje ---------- */
function pngToIco(png) {
  const h = Buffer.alloc(22);
  h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4);
  h.writeUInt8(0, 6); h.writeUInt8(0, 7); h.writeUInt8(0, 8); h.writeUInt8(0, 9);
  h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12); h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18);
  return Buffer.concat([h, png]);
}
async function appIcon(a) {
  const d = dir("icons"), png = path.join(d, safe(a.id) + ".png"), ico = path.join(d, safe(a.id) + ".ico");
  if (!fs.existsSync(png) && a.icon) {
    try {
      const r = await net.fetch(/^https?:/.test(a.icon) ? a.icon : RAW + a.icon);
      if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(png, b); fs.writeFileSync(ico, pngToIco(b)); }
    } catch (_) {}
  }
  return fs.existsSync(png) ? { png, ico } : null;
}
ipcMain.handle("shortcut", async (_e, a) => {
  try {
    const ic = await appIcon(a);
    const name = String(a.name || a.id).replace(/[\\/:*?"<>|]/g, "");
    if (process.platform === "win32") {
      const opts = { target: process.execPath, args: "--open=" + safe(a.id), description: a.tagline || name, icon: ic ? ic.ico : process.execPath, iconIndex: 0, appUserModelId: "dk.lucas.appstore." + safe(a.id) };
      const places = [app.getPath("desktop"), path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs")];
      for (const p of places) shell.writeShortcutLink(path.join(p, name + ".lnk"), "create", opts);
      return "Genvej lagt på skrivebordet og i Start-menuen";
    }
    const exe = process.env.APPIMAGE || process.execPath;
    const entry = `[Desktop Entry]\nType=Application\nName=${name}\nComment=${a.tagline || ""}\nExec="${exe}" --open=${safe(a.id)}\nIcon=${ic ? ic.png : ""}\nTerminal=false\nCategories=Utility;\n`;
    const apps = path.join(app.getPath("home"), ".local", "share", "applications");
    fs.mkdirSync(apps, { recursive: true });
    const f = path.join(apps, "lucas-" + safe(a.id) + ".desktop");
    fs.writeFileSync(f, entry); fs.chmodSync(f, 0o755);
    try { const desk = app.getPath("desktop"); if (fs.existsSync(desk)) { const g = path.join(desk, name + ".desktop"); fs.writeFileSync(g, entry); fs.chmodSync(g, 0o755); } } catch (_) {}
    return "Genvej lagt i programmenuen og på skrivebordet";
  } catch (e) { return "Kunne ikke lave genvej: " + e.message; }
});

/* ---------- app-vinduer ---------- */
function openApp(a) {
  const old = appWins.get(a.id);
  if (old && !old.isDestroyed()) { if (old.isMinimized()) old.restore(); old.focus(); if (a.hash) old.webContents.executeJavaScript(`window.openHash?openHash(${JSON.stringify(a.hash)}):(location.hash=${JSON.stringify(a.hash)})`).catch(() => {}); return; }
  const url = /^(https?|lapp):/.test(a.web) ? a.web : PAGES + a.web;
  ensureLapp(session.fromPartition("persist:app-" + safe(a.id)));
  const w = new BrowserWindow({
    width: 1100, height: 820, minWidth: 360, minHeight: 480, icon: ICON, title: a.name, backgroundColor: "#12110F", autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-app.js"), contextIsolation: false, nodeIntegration: false, sandbox: false,
      nodeIntegrationInSubFrames: isClaudeUrl(url),   // claude.ai-apps kører i en iframe – broen skal også derind
      partition: "persist:app-" + safe(a.id), additionalArguments: ["--lapp-id=" + safe(a.id), "--lapp-name=" + encodeURIComponent(a.name || a.id)]
    }
  });
  w.loadURL(url + (a.hash ? "#" + a.hash : ""));
  // Eget ikon i vinduet og på proceslinjen – og "Fastgør til proceslinjen" åbner appen direkte.
  appIcon(a).then(ic => {
    if (!ic || w.isDestroyed()) return;
    w.setIcon(nativeImage.createFromPath(ic.png));
    if (process.platform === "win32") w.setAppDetails({ appId: "dk.lucas.appstore." + safe(a.id), appIconPath: ic.ico, appIconIndex: 0, relaunchCommand: `"${process.execPath}" --open=${safe(a.id)}`, relaunchDisplayName: a.name });
  }).catch(() => {});
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
// Hvilken app hører et vindue til? (bruges af broen i iframes, hvor kommandolinjen ikke altid følger med)
ipcMain.on("lapp-who", e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  let id = null;
  for (const [k, v] of appWins) if (v === w) id = k;
  e.returnValue = id;
});

// Skilteproduktion Service: en arbejdsmappe i Dokumenter, som appen og Claude i appen kan læse og skrive i.
// Kun tekstfiler, aldrig uden for mappen, og intet slettes: en fil der overskrives, gemmes først i "_tidligere".
const SP_TEXT = /\.(txt|md|csv|tsv|json|html?|xml|log)$/i;
function spRoot() {
  const r = path.join(app.getPath("documents"), "Skilteproduktion Service");
  fs.mkdirSync(r, { recursive: true });
  return r;
}
function spPath(rel) {
  const root = spRoot();
  const p = path.resolve(root, String(rel || "").replace(/^[\\/]+/, ""));
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error("Stien er uden for arbejdsmappen");
  return { root, p, rel: path.relative(root, p).split(path.sep).join("/") };
}
ipcMain.handle("sp-folder", async (e, op, ...args) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || appWins.get("skilteservice") !== w) throw new Error("Ikke tilladt");
  const { root } = spPath("");
  if (op === "info") return { root, name: path.basename(root) };
  if (op === "list") {
    const { p, rel } = spPath(args[0]);
    const deep = !!args[1], out = [];
    const walk = (dirp, relp, depth) => {
      for (const d of fs.readdirSync(dirp, { withFileTypes: true })) {
        if (out.length >= 500) return;
        if (d.name.startsWith(".") || d.name.endsWith(".tmp")) continue;
        const r = relp ? relp + "/" + d.name : d.name, full = path.join(dirp, d.name);
        if (d.isDirectory()) { out.push({ path: r, dir: true }); if (deep && depth < 3) walk(full, r, depth + 1); }
        else if (d.isFile()) { const st = fs.statSync(full); out.push({ path: r, dir: false, size: st.size, mtime: st.mtimeMs }); }
      }
    };
    walk(p, rel, 0);
    return out;
  }
  if (op === "read") {
    const { p } = spPath(args[0]);
    if (!SP_TEXT.test(p)) throw new Error("Kan kun læse tekstfiler (txt, md, csv, json, html)");
    if (fs.statSync(p).size > 1024 * 1024) throw new Error("Filen er for stor (over 1 MB)");
    return fs.readFileSync(p, "utf8");
  }
  if (op === "write") {
    const { p, rel } = spPath(args[0]);
    if (!SP_TEXT.test(p)) throw new Error("Kan kun gemme tekstfiler (txt, md, csv, json, html)");
    const text = String(args[1] ?? "");
    if (text.length > 2 * 1024 * 1024) throw new Error("Teksten er for lang");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    let kept = null;
    if (fs.existsSync(p)) {
      const bdir = path.join(root, "_tidligere");
      fs.mkdirSync(bdir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      kept = path.basename(p).replace(/(\.[^.]+)$/, "-" + stamp + "$1");
      fs.copyFileSync(p, path.join(bdir, kept));
    }
    fs.writeFileSync(p + ".tmp", text, "utf8");
    fs.renameSync(p + ".tmp", p);
    return { path: rel, kept: kept ? "_tidligere/" + kept : null };
  }
  if (op === "open") {
    const { p } = spPath(args[0]);
    if (!fs.existsSync(p)) throw new Error("Findes ikke");
    if (!fs.statSync(p).isDirectory() && !SP_TEXT.test(p)) throw new Error("Kan kun åbne mapper og tekstfiler");
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return true;
  }
  throw new Error("Ukendt handling");
});
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
  const first = openArg(process.argv);
  if (first) openById(first); else createStore();
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
// Til automatisk test: LAS_SHOT_APPS=prefix tager billeder af åbne app-vinduer efter 8 sek. og lukker.
if (process.env.LAS_SHOT_APPS) app.whenReady().then(() => setTimeout(async () => {
  for (const [id, w] of appWins) { try { fs.writeFileSync(process.env.LAS_SHOT_APPS + "-" + id + ".png", (await w.webContents.capturePage()).toPNG()); } catch (_) {} }
  if (storeWin && process.env.LAS_TEST_SC) { try { await storeWin.webContents.executeJavaScript(`Android.shortcut(${JSON.stringify(process.env.LAS_TEST_SC)})`); await new Promise(r => setTimeout(r, 3000)); } catch (_) {} }
  app.quit();
}, 8000));
