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
  _key: "app",
  get key() { return Kit._key; },
  set key(v) { Kit._key = v; try { Kit._had = Kit.load(v) != null; } catch (e) {} },
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
    const std = html.includes("<h2>Indstillinger</h2>");
    if (std) html = Kit._settingsExtra(html);
    sh.innerHTML = `<div class="grab"></div>` + html;
    sh.style.transform = ""; sh.classList.remove("drag");
    sc.classList.add("on"); sh.classList.add("on"); sh.scrollTop = 0;
    Kit._bindSwipe(sh);
    onReady && onReady(sh);
    if (std) Kit._bindSettings(sh);
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
  /* ---- fælles: nyheder, backup, bekræft, konfetti ---- */
  _news: null, _had: false,
  news(ver, items) {            // vis "Nyt i denne version" én gang efter en opdatering (ikke ved første installation)
    Kit._news = { ver, items };
    if (Kit.load(Kit.key + ".ver") === ver) return;
    Kit.save(ver, Kit.key + ".ver");
    if (Kit._had) setTimeout(() => { if (!Kit.sheetOpen()) Kit.showNews(); }, 700);
  },
  showNews() {
    const n = Kit._news; if (!n) return;
    Kit.sheet(`<h2>Nyt i ${esc(document.title)} ${esc(n.ver)}</h2><div class="sticky st-yellow tape knews"><ul>${n.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div><button class="btn dark block" id="kOk" style="margin-top:18px">Fedt</button>`,
      sh => { $("#kOk", sh).onclick = Kit.closeSheet; });
  },
  _settingsExtra(html) {
    let add = "";
    if (!/backup/i.test(html)) add += `<div class="field"><span class="lbl">Backup</span><span><button class="val" id="kBk">Gem</button> · <button class="val" id="kRs">Gendan</button></span></div>`;
    if (Kit._news) add += `<div class="field"><span class="lbl">Nyt i version ${esc(Kit._news.ver)}</span><button class="val" id="kNews">Se ›</button></div>`;
    const i = html.lastIndexOf("<p ");
    return i > 0 ? html.slice(0, i) + add + html.slice(i) : html + add;
  },
  _bindSettings(sh) {
    const b = $("#kBk", sh), r = $("#kRs", sh), n = $("#kNews", sh);
    if (b) b.onclick = () => Kit.share(`${Kit.key}-backup-${isoDay()}.json`, "application/json", JSON.stringify({ _app: Kit.key, _at: new Date().toISOString(), data: Kit.load() }));
    if (r) r.onclick = () => Kit.pickFile(t => {
      let o = null; try { o = JSON.parse(t); } catch (e) {}
      if (!o || o._app !== Kit.key || !o.data || typeof o.data !== "object") { Kit.toast("Det er ikke en backup fra denne app"); return; }
      Kit.confirm("Gendan backup?", `Alt i appen bliver erstattet af backuppen fra ${dayName(String(o._at || "").slice(0, 10) || isoDay())}.`, "Gendan", () => { Kit.save(o.data); location.reload(); });
    });
    if (n) n.onclick = () => Kit.showNews();
  },
  confirm(title, text, ok, fn, danger) {
    Kit.sheet(`<h2>${esc(title)}</h2><p style="color:var(--ink-2);margin:0 0 18px;line-height:1.45">${esc(text)}</p><div style="display:flex;gap:10px"><button class="btn" style="flex:1" id="kNo">Annuller</button><button class="btn ${danger ? "danger" : "dark"}" style="flex:1" id="kYes">${esc(ok)}</button></div>`,
      sh => { $("#kNo", sh).onclick = Kit.closeSheet; $("#kYes", sh).onclick = () => { Kit.closeSheet(); fn(); }; });
  },
  _bindSwipe(sh) {              // træk arket ned i toppen for at lukke
    if (sh._swipe) return; sh._swipe = true;
    let y0 = 0, x0 = 0, on = false, dy = 0;
    sh.addEventListener("touchstart", e => { const t = e.touches[0]; on = sh.scrollTop <= 0 && t.clientY - sh.getBoundingClientRect().top < 64; y0 = t.clientY; x0 = t.clientX; dy = 0; }, { passive: true });
    sh.addEventListener("touchmove", e => { if (!on) return; const t = e.touches[0]; dy = t.clientY - y0; if (dy < 10 || Math.abs(t.clientX - x0) > dy) { if (dy < 0) on = false; return; } sh.classList.add("drag"); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
    const end = () => { if (!on) return; on = false; sh.classList.remove("drag"); sh.style.transform = ""; if (dy > 90) Kit.closeSheet(); };
    sh.addEventListener("touchend", end); sh.addEventListener("touchcancel", end);
  },
  confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div"); box.className = "kconf"; const cols = ["#f3d867", "#accbef", "#f1b3c4", "#b7e0a6", "#f3c08c", "#cbbaf0"];
    for (let i = 0; i < 36; i++) { const b = document.createElement("i"); b.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % 6]};animation-delay:${Math.random() * .35}s;animation-duration:${1.3 + Math.random() * .9}s;--r:${(Math.random() * 720 - 360) | 0}deg;--x:${(Math.random() * 120 - 60) | 0}px`; box.appendChild(b); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2700);
  },
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
