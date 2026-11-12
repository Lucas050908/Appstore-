/* Lucas' app-kit – fælles JS for apps bygget på shared/android-template.
   Virker både i appen (window.App) og i en almindelig browser (fallbacks). */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = n => String(n).padStart(2, "0");
const NATIVE = typeof window.App !== "undefined";
const TILTS = ["tilt-a", "tilt-b", "tilt-c", "tilt-d"];
const STICKIES = ["yellow", "blue", "pink", "green", "orange", "purple"];
const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const WDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
const NF = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 });
function dayName(s) {
  const diff = Math.round((parseDay(s) - parseDay(isoDay())) / 864e5);
  if (diff === 0) return "i dag"; if (diff === -1) return "i går"; if (diff === 1) return "i morgen";
  const d = parseDay(s); return `${WDAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

const Kit = {
  key: "app",
  /* ---- data ---- */
  load(key = Kit.key) {
    let raw = null;
    try { raw = NATIVE ? App.load(key) : localStorage.getItem("kit." + key); } catch (e) {}
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  },
  save(data, key = Kit.key) {
    const s = JSON.stringify(data);
    try { if (NATIVE) { if (!App.save(key, s)) Kit.toast("Kunne ikke gemme!"); } else localStorage.setItem("kit." + key, s); } catch (e) { Kit.toast("Kunne ikke gemme!"); }
  },
  /* ---- ui ---- */
  haptic(kind) { try { NATIVE ? App.haptic(kind || "") : navigator.vibrate && navigator.vibrate(kind === "heavy" ? 30 : 8); } catch (e) {} },
  _tt: 0,
  toast(msg, action, fn) {
    let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action)}</button>` : "");
    if (action) t.querySelector("button").onclick = () => { t.classList.remove("on"); fn(); };
    t.classList.add("on"); clearTimeout(Kit._tt); Kit._tt = setTimeout(() => t.classList.remove("on"), action ? 5000 : 2600);
  },
  sheet(html, onReady) {
    let sc = $("#scrim"), sh = $("#sheet");
    if (!sc) { sc = document.createElement("div"); sc.id = "scrim"; sc.className = "scrim"; document.body.appendChild(sc); sc.onclick = () => Kit.closeSheet(); }
    if (!sh) { sh = document.createElement("div"); sh.id = "sheet"; sh.className = "sheet"; document.body.appendChild(sh); }
    sh.innerHTML = `<div class="grab"></div>` + html;
    sc.classList.add("on"); sh.classList.add("on"); sh.scrollTop = 0;
    onReady && onReady(sh);
  },
  closeSheet() { const sc = $("#scrim"), sh = $("#sheet"); sc && sc.classList.remove("on"); sh && sh.classList.remove("on"); Kit.onSheetClose && Kit.onSheetClose(); },
  sheetOpen() { const sh = $("#sheet"); return !!(sh && sh.classList.contains("on")); },
  /* ---- tema ---- */
  theme: "system",
  applyTheme(t = Kit.theme) {
    Kit.theme = t;
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { NATIVE && App.setSystemBars(dark); } catch (e) {}
  },
  /* ---- faner ---- */
  tabs: null, tab: null, onTab: null,
  initTabs(names, start) {
    Kit.tabs = names;
    $$(".tab").forEach(b => b.onclick = () => Kit.setTab(b.dataset.tab));
    Kit.setTab(names[start] ? start : Object.keys(names)[0], true);
  },
  setTab(t, silent) {
    if (!Kit.tabs[t]) return;
    Kit.tab = t; if (!silent) Kit.haptic();
    $$(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
    $$(".screen").forEach(s => s.classList.toggle("on", s.id === "s-" + t));
    const h = $("#title"); if (h) h.textContent = Kit.tabs[t];
    const m = $("#main"); if (m) m.scrollTop = 0;
    Kit.onTab && Kit.onTab(t);
  },
  /* ---- native ---- */
  widget(o) { try { NATIVE && App.widget(JSON.stringify(o)); } catch (e) {} },
  schedule(id, at, title, text, hash) { try { NATIVE && App.schedule(id, at, title, text, hash || ""); } catch (e) {} },
  cancel(id) { try { NATIVE && App.cancel(id); } catch (e) {} },
  share(name, mime, text) {
    if (NATIVE) return App.share(name, mime, text);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click();
  },
  shareText(text) { if (NATIVE) App.shareText(text); else if (navigator.share) navigator.share({ text }).catch(() => {}); else Kit.copy(text); },
  copy(text) { if (NATIVE) App.copy(text); else navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {}); Kit.toast("Kopieret"); },
  openUrl(u) { if (NATIVE) App.openUrl(u); else window.open(u, "_blank"); },
  keepAwake(on) { try { NATIVE && App.keepAwake(!!on); } catch (e) {} },
  _fileCb: null,
  pickFile(cb) {
    Kit._fileCb = cb;
    if (NATIVE) return App.pickFile();
    const i = document.createElement("input"); i.type = "file"; i.onchange = () => { const f = i.files[0]; if (f) f.text().then(cb); }; i.click();
  },
  _permCb: {},
  perm(name, cb) {   // cb(true/false)
    if (!NATIVE) return cb(true);
    if (App.hasPerm(name)) return cb(true);
    Kit._permCb[name] = cb; App.requestPerm(name);
  },
  _locCb: null,
  location(cb) {   // cb({lat, lon}) eller cb(null, grund)
    Kit._locCb = cb;
    if (NATIVE) { if (!App.hasPerm("location")) { Kit.perm("location", ok => { if (!ok) cb(null, "perm"); }); return; } App.location(); return; }
    if (!navigator.geolocation) return cb(null, "none");
    navigator.geolocation.getCurrentPosition(p => cb({ lat: p.coords.latitude, lon: p.coords.longitude }), e => cb(null, e.code === 1 ? "perm" : "none"), { timeout: 15000, maximumAge: 1800000 });
  },
  version() { try { return NATIVE ? App.version() : "web"; } catch (e) { return ""; } },
  onBack: null, onResume: null, onHash: null
};
window.onFilePicked = t => { Kit._fileCb && Kit._fileCb(t); Kit._fileCb = null; };
window.onPerm = (name, ok) => { const cb = Kit._permCb[name]; delete Kit._permCb[name]; cb && cb(ok === "1"); };
window.onLocation = (lat, lon) => { Kit._locCb && Kit._locCb({ lat: +lat, lon: +lon }); };
window.onLocationError = why => { Kit._locCb && Kit._locCb(null, why); };
window.onNativeResume = () => { Kit.onResume && Kit.onResume(); };
window.onNativeBack = () => {
  if (Kit.sheetOpen()) { Kit.closeSheet(); return true; }
  if (Kit.onBack && Kit.onBack()) return true;
  if (Kit.tabs && Kit.tab !== Object.keys(Kit.tabs)[0]) { Kit.setTab(Object.keys(Kit.tabs)[0]); return true; }
  return false;
};
window.openHash = h => { Kit.onHash ? Kit.onHash(h) : (Kit.tabs && Kit.tabs[h] && Kit.setTab(h)); };
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => Kit.theme === "system" && Kit.applyTheme());
document.addEventListener("keydown", e => { if (e.key === "Escape" && Kit.sheetOpen()) Kit.closeSheet(); });
/* Fælles ikoner (stroke, 24×24) */
const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>'
};
