// Takt – UI og spilmotor
'use strict';
const $ = s => document.querySelector(s);
const NATIVE = window.TaktAndroid || null;
const VERSION = '1.2.0';

// ---------------- Tilstand ----------------
const KEY = 'takt.v1';
const DEF = { instr:'guitar', onboarded:false, goal:10, useH:true, latency:100, sens:1, voiceLow:false, metro:true, speed:1, wait:false,
              best:{}, xp:0, days:{}, last:{}, latencyMeasured:false, inputId:null, inputLabel:'', hum:null, egIntro:false, tuning:{},
              daily:null, dailyN:0, fav:{}, ver:'', accent:true };
let S;
try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = Object.assign({}, DEF); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} pushWidgets(); }
M.setH(S.useH);

const pad = n => (n < 10 ? '0' : '') + n;
const dayKey = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function streak() {
  let d = new Date(), n = 0;
  if (!((S.days[dayKey(d)] || 0) >= 60)) d = addDays(d, -1);
  while ((S.days[dayKey(d)] || 0) >= 60) { n++; d = addDays(d, -1); }
  return n;
}
const todaySec = () => S.days[dayKey()] || 0;
const totalSec = () => Object.values(S.days).reduce((a, b) => a + b, 0);
const level = () => { const xp = S.xp; let l = 1, need = 300, acc = 0; while (xp >= acc + need) { acc += need; l++; need = Math.round(need * 1.25); } return { l, cur: xp - acc, need }; };
const bestOf = (instr, id) => S.best[instr + ':' + id];
function nextExercise(instr = S.instr) {
  const all = M.allExercises(instr);
  const lastId = S.last[instr];
  if (lastId) {
    const i = all.findIndex(e => e.id === lastId);
    const b = bestOf(instr, lastId);
    if (i >= 0 && (!b || b.stars < 1)) return all[i];
    if (i >= 0) { for (let j = i + 1; j < all.length; j++) if (!bestOf(instr, all[j].id) || bestOf(instr, all[j].id).stars < 3) return all[j]; }
  }
  return all.find(e => !bestOf(instr, e.id)) || all.find(e => bestOf(instr, e.id).stars < 3) || all[0];
}
function pushWidgets() {
  if (!NATIVE || !NATIVE.widgets) return;
  const n = nextExercise();
  const days = {}; for (let i = 0; i < 60; i++) { const k = dayKey(addDays(new Date(), -i)); if (S.days[k]) days[k] = S.days[k]; }
  try { NATIVE.widgets(JSON.stringify({ days, goalMin: S.goal, instr: S.instr, instrName: M.INSTR[S.instr].name,
    nextId: n.id, nextTitle: n.title, nextSub: n.sub, xp: S.xp, level: level().l })); } catch (e) {}
}

// ---------------- Dagens øvelse ----------------
const DAILY_XP = 50;
function dailyState() {
  const k = dayKey();
  if (!S.daily || S.daily.day !== k) S.daily = { day: k, ids: {}, done: {} };
  return S.daily;
}
function dailyEx(instr = S.instr) {
  const D = dailyState(), all = M.allExercises(instr);
  if (D.ids[instr] && all.some(e => e.id === D.ids[instr])) return all.find(e => e.id === D.ids[instr]);
  // pulje: alt du har prøvet – plus den næste nye, så der altid er noget
  const firstNew = all.findIndex(e => !bestOf(instr, e.id));
  let pool = all.filter((e, i) => bestOf(instr, e.id) || i === firstNew);
  const weak = pool.filter(e => !bestOf(instr, e.id) || bestOf(instr, e.id).stars < 3);
  if (weak.length) pool = weak;
  if (!pool.length) pool = all;
  let h = 0; for (const ch of D.day + instr) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  const e = pool[h % pool.length];
  D.ids[instr] = e.id;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) {}
  return e;
}
const dailyDone = (instr = S.instr) => !!dailyState().done[instr];

// ---------------- Favoritakkorder ----------------
const favs = instr => (S.fav && S.fav[instr]) || [];
function toggleFav(instr, c) {
  if (!S.fav) S.fav = {};
  const l = favs(instr).slice(), i = l.indexOf(c);
  if (i >= 0) l.splice(i, 1); else l.push(c);
  S.fav[instr] = l; save();
  return i < 0;
}
const chordKind = c => /5$/.test(c) ? 'power' : /7/.test(c) ? 'syv' : /sus/.test(c) ? 'sus' : /m/.test(c) ? 'mol' : 'dur';
let chordFilter = 'alle';

// ---------------- Nyt + sikkerhedskopi ----------------
const NEWS = ['Dagens øvelse – en ny hver dag med 50 bonus-XP', 'Favoritakkorder og filtre: dur, mol, 7\'ere og power-akkorder', 'Sikkerhedskopi af stjerner, XP og streak – flyt dem til en ny telefon', 'Metronomen kan fremhæve 1-slaget og skrue tempoet op af sig selv'];
function showNews() {
  openSheet(`<div class="serif" style="font-size:24px;font-weight:600">Nyt i Takt ${VERSION}</div>
    <ul style="margin:12px 0 18px;padding-left:20px;line-height:1.45">${NEWS.map(t => `<li style="margin:7px 0">${esc(t)}</li>`).join('')}</ul>
    <button class="btn pri" style="width:100%" id="nOk">Fint</button>`);
  $('#nOk').onclick = closeSheet;
}
function copyText(t, el) {
  const done = () => toast('Kopieret');
  const old = () => { try { el.focus(); el.select(); document.execCommand('copy') ? done() : toast('Markér teksten og kopiér selv'); } catch (e) { toast('Markér teksten og kopiér selv'); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, old); else old();
}
function backupSheet() {
  const data = JSON.stringify({ _app: 'takt', _at: new Date().toISOString(), data: S });
  openSheet(`<div class="serif" style="font-size:22px;font-weight:600">Sikkerhedskopi</div>
    <p class="mut small" style="margin:6px 0 10px">Kopiér teksten og gem den et sikkert sted – fx i en note eller en mail til dig selv. På en ny telefon sætter du den ind her og trykker Indlæs.</p>
    <textarea id="bkT" rows="5" spellcheck="false" style="width:100%;box-sizing:border-box;background:var(--paper2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px;font:12px/1.4 ui-monospace,Menlo,monospace;resize:none">${esc(data)}</textarea>
    <div class="row" style="margin-top:12px"><button class="btn" style="flex:1" id="bkIn">Indlæs</button><button class="btn pri" style="flex:1.3" id="bkCp">Kopiér</button></div>`);
  $('#bkCp').onclick = () => copyText(data, $('#bkT'));
  $('#bkIn').onclick = () => {
    let o; try { o = JSON.parse($('#bkT').value.trim()); } catch (e) { toast('Det ligner ikke en sikkerhedskopi'); return; }
    if (!o || o._app !== 'takt' || !o.data || typeof o.data.best !== 'object' || typeof o.data.days !== 'object') { toast('Det ligner ikke en kopi fra Takt'); return; }
    if ($('#bkT').value.trim() === data) { toast('Sæt din gemte kopi ind i feltet først'); return; }
    S = Object.assign({}, DEF, o.data, { onboarded: true }); M.setH(S.useH); save(); closeSheet(); render(); toast('Kopien er indlæst');
  };
}

// ---------------- Ikoner ----------------
const I = {
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  ear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  star:c=>`<svg viewBox="0 0 24 24"><path fill="${c}" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>`,
  flame:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3.5 5.5 6 5.5 11.2A5.5 5.5 0 0 1 12 19a5.5 5.5 0 0 1-5.5-5.8c0-2.4 1.3-4 2.6-5.3.2 1.8.9 3 2.2 3.6C11 9 10.9 5.4 12 2z"/></svg>',
  mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  tabOv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  tabTool:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v8a3 3 0 0 0 6 0V3M12 14v7"/></svg>',
  tabChord:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M9.3 3v18M14.7 3v18"/><circle cx="12" cy="11" r="1.4" fill="currentColor"/><circle cx="6.7" cy="14" r="1.4" fill="currentColor"/></svg>',
  tabMe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  restart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/></svg>',
  instr: {
    guitar:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M30 18l9-9M36 6l6 6"/><path d="M27.5 20.5c-2-2-6-2.5-8.5 0-1.5 1.5-1.4 3.3-3 4.2-2.6 1.4-6 .4-8.2 2.6-3.3 3.3-2.3 8.6 1 11.9s8.6 4.3 11.9 1c2.2-2.2 1.2-5.6 2.6-8.2.9-1.6 2.7-1.5 4.2-3 2.5-2.5 2-6.5 0-8.5z"/><circle cx="19.5" cy="28.5" r="2.6"/><path d="M15 33l3-3"/></svg>',
    eguitar:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M27 21L40 8M37 5l6 6"/><path d="M29 19c2 2 1.5 5-1 6.500-1.800 1-2 2.500-2.500 4.500-1 4.500-3 8.500-8 10-3.500 1-7.500-.500-9.500-3.500-2.500-3.800-.500-7 2.500-8.500 1.800-.900 2.500-2 2-4-.600-2.400 1-4.500 3.500-4.500 1.800 0 2.800 1 4.500.500 2-.600 2.500-2.500 4.500-3 1.500-.400 3 .500 4 2z"/><path d="M16 30l3 3M21 27.500l2.500 2.500"/><path d="M12.500 38.500l-2 3" /></svg>',
    bass:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M28 20l13-13M38 4l6 6"/><path d="M25.5 22.5c-1.8-1.8-5-1.6-7 .4-1.2 1.2-1 3-2.3 3.9-2.2 1.4-5.6.2-8 2.6-3 3-2 8 1 11s8 4 11 1c2.4-2.4 1.2-5.8 2.6-8 .9-1.3 2.7-1.1 3.9-2.3 2-2 2.2-5.2.4-7z"/><path d="M14 34l4-4"/></svg>',
    ukulele:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M28 20l8-8M33 6l9 9"/><path d="M25.5 22.5c-2.5-2.5-6.5-2.5-9 0-1 1-1 2.5-2.5 3-3 1-6 1-8 3-3 3-2 7.5 1 10.5s7.5 4 10.5 1c2-2 2-5 3-8 .5-1.5 2-1.5 3-2.5 2.5-2.5 2.5-6.5 0-9z"/><circle cx="18" cy="30" r="3"/></svg>',
    piano:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="5" y="10" width="38" height="28" rx="3"/><path d="M14.5 38V26M24 38V26M33.5 38V26"/><path d="M12 10v16h5V10M21.5 10v16h5V10M31 10v16h5V10" fill="currentColor"/></svg>',
    voice:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="17" y="5" width="14" height="24" rx="7"/><path d="M10 23a14 14 0 0 0 28 0M24 37v7M17 44h14"/></svg>',
  },
};
const starsHtml = (n, size) => `<span class="stars">${[0,1,2].map(i => I.star(i < n ? '#f3d867' : '#3a3630')).join('')}</span>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
function toast(msg, ms = 2400) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function haptic(ms = 12) { try { NATIVE && NATIVE.haptic ? NATIVE.haptic(ms) : navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ---------------- Navigation ----------------
let tab = 'ov', toolSeg = 'tuner';
const TABS = [['ov','Øv',I.tabOv],['tool','Værktøj',I.tabTool],['chords','Akkorder',I.tabChord],['me','Mig',I.tabMe]];
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([id, l, ic]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${ic}<span>${l}</span></button>`).join('');
  $('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => { if (tab !== b.dataset.tab) { tab = b.dataset.tab; haptic(6); render(); } });
}
let leaveView = null;
function render() {
  if (leaveView) { const f = leaveView; leaveView = null; f(); }
  renderTabs();
  const v = $('#view'); v.scrollTop = 0;
  ({ ov: viewOv, tool: viewTool, chords: viewChords, me: viewMe })[tab](v);
}

// ---------------- Sheet ----------------
let sheetClose = null;
function openSheet(html, onClose) {
  if (sheetClose) { const f = sheetClose; sheetClose = null; f(); }
  $('#sheet').innerHTML = '<div class="grab"></div>' + html; $('#sheetWrap').classList.add('show'); sheetClose = onClose || null;
}
function closeSheet() { $('#sheetWrap').classList.remove('show'); if (sheetClose) { const f = sheetClose; sheetClose = null; f(); } }
$('#sheetWrap').addEventListener('click', e => { if (e.target.id === 'sheetWrap') closeSheet(); });

// ---------------- Øv (forside) ----------------
function viewOv(v) {
  const ins = M.INSTR[S.instr], st = streak(), today = todaySec() / 60, goal = S.goal;
  const pct = Math.min(1, today / goal), n = nextExercise(), nb = bestOf(S.instr, n.id);
  const ring = (p) => `<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(0,0,0,.13)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="#1d1b17" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(163.4 * p).toFixed(1)} 200" transform="rotate(-90 32 32)"/></svg>`;
  let h = `<div class="row" style="margin-bottom:16px"><h1 class="title">Takt</h1><span class="sp"></span>
    <button class="chip" id="instrBtn"><span style="width:20px;height:20px;display:inline-block">${ins && I.instr[S.instr].replace('<svg', '<svg width="20" height="20"')}</span>${ins.name} ▾</button></div>
    <div class="grid2" style="margin-bottom:6px">
      <div class="postit tape tilt-l" style="background:var(--orange)">
        <div class="ps">Streak</div>
        <div class="row" style="gap:4px;margin-top:2px"><span style="width:26px;height:26px;color:#b4471f">${I.flame}</span><span class="pt" style="font-size:40px">${st}</span></div>
        <div class="ps">${st === 1 ? 'dag i træk' : 'dage i træk'}</div>
      </div>
      <div class="postit tilt-r" style="background:var(--yellow)">
        <div class="row" style="gap:10px"><div style="position:relative">${ring(pct)}<div style="position:absolute;inset:0;display:grid;place-items:center;font-weight:700;font-size:14px">${Math.floor(today)}</div></div>
        <div><div class="ps">I dag</div><div class="pt" style="font-size:24px">${Math.floor(today)}/${goal} min</div></div></div>
      </div>
    </div>
    <div class="section-t">Fortsæt</div>
    <button class="card" id="contBtn" style="display:flex;width:100%;text-align:left;padding:14px;gap:14px;align-items:center">
      <div style="width:52px;height:52px;border-radius:12px;background:var(--pi);color:var(--yellow);display:grid;place-items:center;flex:none">${I.play.replace('<svg', '<svg width="26" height="26"')}</div>
      <div style="flex:1;min-width:0"><div class="serif" style="font-weight:600;font-size:18px">${esc(n.title)}</div><div class="mut small">${esc(n.sub)}</div></div>
      ${nb ? starsHtml(nb.stars) : ''}
    </button>`;
  const de = dailyEx(), dd = dailyDone();
  h += `<button class="postit tape" id="dailyBtn" style="display:flex;width:100%;text-align:left;gap:12px;align-items:center;margin-top:22px;background:var(--${dd ? 'green' : 'pink'})">
      <div style="flex:1;min-width:0"><div class="ps">Dagens øvelse</div><div class="pt" style="font-size:28px;margin:2px 0">${esc(de.title)}</div><div class="ps">${dd ? 'Klaret i dag ✓ – kom igen i morgen' : esc(de.sub) + ' · +' + DAILY_XP + ' XP ved mindst 1 stjerne'}</div></div>
      <div style="width:44px;height:44px;border-radius:50%;background:var(--pi);color:var(--yellow);display:grid;place-items:center;flex:none">${(dd ? I.check : I.play).replace('<svg', '<svg width="22" height="22"')}</div></button>`;
  M.COURSES[S.instr].forEach(c => {
    const done = c.items.filter(e => (bestOf(S.instr, e.id) || {}).stars >= 1).length;
    h += `<div class="section-t"><span class="dot" style="background:${c.color}"></span>${esc(c.title)}<span class="sp"></span><span class="mut small" style="font-family:system-ui;font-weight:400">${done}/${c.items.length}</span></div><div class="card list">`;
    c.items.forEach((e, i) => {
      const b = bestOf(S.instr, e.id);
      h += `<div class="item" data-ex="${e.id}"><div class="num ${b && b.stars >= 1 ? 'done' : ''}">${b && b.stars >= 1 ? I.check.replace('<svg', '<svg width="16" height="16"') : i + 1}</div>
        <div style="flex:1;min-width:0"><div class="tt">${esc(e.title)}</div><div class="st">${esc(e.sub)} · ${e.kind === 'chords' ? 'Akkorder' : 'Toner'}</div></div>${b ? starsHtml(b.stars) : ''}</div>`;
    });
    h += '</div>';
  });
  h += `<p class="mut small" style="text-align:center;margin:28px 0 8px">${ins.electric ? 'Appen lytter via kabel eller mikrofon – også med forvrængning.' : 'Appen lytter via mikrofonen – spil på dit rigtige instrument.'}</p>`;
  v.innerHTML = h;
  $('#instrBtn').onclick = pickInstrument;
  $('#contBtn').onclick = () => openPre(n);
  $('#dailyBtn').onclick = () => openPre(de);
  v.querySelectorAll('[data-ex]').forEach(el => el.onclick = () => openPre(M.findEx(S.instr, el.dataset.ex)));
}

function pickInstrument(cb) {
  const html = `<div class="serif" style="font-size:22px;font-weight:600;margin-bottom:14px">Vælg instrument</div><div class="grid2">` +
    Object.values(M.INSTR).map((x, i) => `<button class="postit ${i % 2 ? 'tilt-r' : 'tilt-l'}" data-i="${x.id}" style="background:var(--${['yellow','orange','pink','green','blue','lilac'][i]});text-align:left;${S.instr === x.id ? 'outline:3px solid var(--ink);outline-offset:3px' : ''}">
      <div style="width:44px;height:44px">${I.instr[x.id]}</div><div class="pt" style="margin-top:6px">${x.name}</div></button>`).join('') + '</div><div style="height:8px"></div>';
  openSheet(html);
  $('#sheet').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { S.instr = b.dataset.i; save(); closeSheet(); haptic(); if (typeof cb === 'function') cb(); else render(); if (M.INSTR[S.instr].electric && !S.egIntro) electricIntro(); });
}

// ---------------- Elguitar: tilslutning og lydindgang ----------------
const isCable = l => /usb|irig|interface|scarlett|focusrite|line|audiobox|behringer|wired|headset|kabel/i.test(l || '');
function electricIntro() {
  S.egIntro = true; save();
  openSheet(`<div class="serif" style="font-size:24px;font-weight:600;line-height:1.15">Sådan hører Takt din elguitar</div>
    <div class="postit tilt-l" style="background:var(--orange);margin:16px 2px 0"><div class="pt">1 · Kabel</div><div style="font-size:14px;margin-top:4px">Den mest præcise måde. Sæt et USB-lydkort eller en iRig i telefonen, og sæt guitaren i. Android skifter normalt selv til kablet.</div></div>
    <div class="postit tilt-r" style="background:var(--yellow);margin:12px 2px 0"><div class="pt">2 · Forstærker</div><div style="font-size:14px;margin-top:4px">Læg telefonen cirka en meter fra forstærkeren. Takt kan også følge med, når du spiller med forvrængning.</div></div>
    <div class="postit tilt-l" style="background:var(--green);margin:12px 2px 0"><div class="pt">3 · Uden strøm</div><div style="font-size:14px;margin-top:4px">Læg telefonen tæt på strengene, og skru op for følsomheden under Mig, hvis Takt ikke hører dig.</div></div>
    <p class="mut small" style="margin:14px 0 0">Brumfilteret mod 50 Hz-brum er slået til for elguitar. Du finder det hele under Mig → Lyd.</p>
    <div class="row" style="margin-top:16px"><button class="btn" style="flex:1" id="eiIn">Vælg indgang</button><button class="btn pri" style="flex:1.3" id="eiOk">Forstået</button></div>`);
  $('#eiOk').onclick = closeSheet; $('#eiIn').onclick = () => { closeSheet(); pickInput(); };
}
const humOn = (instr = S.instr) => S.hum == null ? !!M.INSTR[instr].electric : !!S.hum;
function applyInput(lowF) {
  const ins = M.INSTR[S.instr], lo = Math.min(lowF || 1e9, ins.minF * 1.17); // dybeste tone vi venter
  A.setInput({ deviceId: S.inputId || null, hum: humOn(), lowCut: lo >= 62 ? Math.round(lo * 0.78) : 0, lost: false });
}
async function pickInput() {
  const was = A.micOn();
  if (!was && !(await needMic())) return;
  const list = (await A.listInputs()).filter(x => x.id !== 'default');
  const cur = A.input.label;
  if (!was) A.stopMic();
  openSheet(`<div class="serif" style="font-size:22px;font-weight:600">Lydindgang</div>
    <p class="mut small" style="margin:4px 0 12px">Sæt kablet i, før du åbner listen. Bruger lige nu: ${esc(cur || 'telefonens mikrofon')}</p>
    <div class="card list"><div class="item" data-d=""><div style="flex:1"><div class="tt">Automatisk</div><div class="st">Telefonen vælger – kablet, hvis det sidder i</div></div>${!S.inputId ? I.check.replace('<svg', '<svg width="20" height="20"') : ''}</div>
    ${list.map(x => `<div class="item" data-d="${esc(x.id)}" data-l="${esc(x.label)}"><div style="flex:1;min-width:0"><div class="tt">${esc(x.label)}</div><div class="st">${isCable(x.label) ? 'Kabel / lydkort' : 'Mikrofon'}</div></div>${S.inputId === x.id ? I.check.replace('<svg', '<svg width="20" height="20"') : ''}</div>`).join('')}</div>
    ${list.length ? '' : '<p class="mut small" style="margin-top:10px">Telefonen viser ingen andre indgange lige nu.</p>'}`);
  $('#sheet').querySelectorAll('[data-d]').forEach(el => el.onclick = () => { S.inputId = el.dataset.d || null; S.inputLabel = el.dataset.l || ''; save(); closeSheet(); haptic(); toast(S.inputId ? 'Indgang: ' + S.inputLabel : 'Indgang: automatisk'); render(); });
}

// ---------------- Før spil ----------------
function openPre(e) {
  if (!e) return;
  const b = bestOf(S.instr, e.id), ins = M.INSTR[S.instr];
  let built; try { built = M.build(e, S.instr, S.voiceLow ? -12 : 0); } catch (err) { toast(err.message); return; }
  const n = built.events.length, secs = Math.round(built.beats * 60 / e.bpm);
  const chordList = e.kind === 'chords' ? [...new Set(built.events.map(x => x.c))] : [];
  const html = `<div class="row"><div style="flex:1"><div class="serif" style="font-size:24px;font-weight:600;line-height:1.15">${esc(e.title)}</div>
      <div class="mut small">${esc(e.sub)} · ${ins.name} · ${e.bpm} BPM · ${n} ${e.kind === 'chords' ? 'anslag' : 'toner'} · ca. ${secs} sek</div></div>${b ? starsHtml(b.stars) : ''}</div>
    ${b ? `<div class="mut small" style="margin-top:6px">Bedste: ${b.score} point · ${Math.round(b.acc * 100)} % ramt</div>` : ''}
    ${chordList.length && (M.INSTR[S.instr].view === 'tab' ? S.instr !== 'bass' : S.instr === 'piano') ? `<div style="display:flex;gap:12px;overflow-x:auto;margin:14px -4px 0;padding:4px">${chordList.map(c => `<div style="flex:none;text-align:center">${chordSvg(c, S.instr, 92)}</div>`).join('')}</div>` : ''}
    <div style="margin:18px 0 8px;font-weight:600">Tempo</div>
    <div class="chips" id="spd">${[[0.5,'50 %'],[0.75,'75 %'],[1,'100 %']].map(([v, l]) => `<button class="chip ${S.speed === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="row" style="margin-top:16px"><div style="flex:1"><div style="font-weight:600">Vent på mig</div><div class="mut small">Pauser ved hver tone til du rammer den</div></div><button class="toggle ${S.wait ? 'on' : ''}" id="tWait"></button></div>
    <div class="row" style="margin-top:14px"><div style="flex:1"><div style="font-weight:600">Metronom</div><div class="mut small">Klik på hvert slag (bedst med høretelefoner)</div></div><button class="toggle ${S.metro ? 'on' : ''}" id="tMet"></button></div>
    <p class="mut small" style="margin:14px 0 0">Fulde 3 stjerner kræver 100 % tempo uden "Vent på mig".</p>
    <div class="row" style="margin-top:16px"><button class="btn" id="bListen">${I.ear}Lyt først</button><button class="btn pri" style="flex:1" id="bStart">${I.play}Start</button></div>`;
  openSheet(html);
  $('#spd').querySelectorAll('button').forEach(x => x.onclick = () => { S.speed = parseFloat(x.dataset.v); save(); $('#spd').querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x)); });
  $('#tWait').onclick = ev => { S.wait = !S.wait; ev.currentTarget.classList.toggle('on', S.wait); save(); };
  $('#tMet').onclick = ev => { S.metro = !S.metro; ev.currentTarget.classList.toggle('on', S.metro); save(); };
  $('#bListen').onclick = () => { closeSheet(); Game.start(e, { listen: true }); };
  $('#bStart').onclick = () => { closeSheet(); Game.start(e, {}); };
}

// ---------------- Akkorddiagrammer ----------------
function chordSvg(c, instr, w = 120) {
  const ch = M.CH[c]; const lab = M.chordLabel(c);
  if (instr === 'piano' || instr === 'voice' || instr === 'bass') {
    const notes = instr === 'bass' ? M.shapeNotes(c, 'bass') : M.pianoChordNotes(c);
    const lo = 48, wh = []; for (let m = lo; m < lo + 36; m++) if (![1,3,6,8,10].includes(m % 12)) wh.push(m);
    if (instr === 'bass') {
      return `<svg class="cdiag" width="${w}" height="${w * 0.75}" viewBox="0 0 120 90"><text x="60" y="16" text-anchor="middle" font-family="Caveat" font-weight="700" font-size="20" fill="currentColor">${lab}</text>
        <text x="60" y="48" text-anchor="middle" font-size="13" fill="currentColor">Grundtone: ${M.pcName(M.chordRoot(c))}</text>
        <text x="60" y="68" text-anchor="middle" font-size="12" fill="#a39d8f">${notes.map(m => M.name(m)).join(' · ')}</text></svg>`;
    }
    const pcsSet = new Set(notes.map(m => m)); const kw = 120 / 21;
    let keys = '', blacks = '', k = 0;
    for (let m = 48; m < 84; m++) {
      const blk = [1,3,6,8,10].includes(m % 12);
      if (!blk) { if (k < 21) keys += `<rect x="${k * kw}" y="24" width="${kw - 0.6}" height="54" rx="1.2" fill="${pcsSet.has(m) ? '#f3d867' : '#e6e0d3'}"/>`; k++; }
      else if (k < 21) blacks += `<rect x="${k * kw - kw * 0.32}" y="24" width="${kw * 0.64}" height="33" rx="1" fill="${pcsSet.has(m) ? '#f3c08c' : '#1d1b17'}"/>`;
    }
    return `<svg class="cdiag" width="${w}" height="${w * 0.7}" viewBox="0 0 120 84"><text x="60" y="18" text-anchor="middle" font-family="Caveat" font-weight="700" font-size="20" fill="currentColor">${lab}</text>${keys}${blacks}</svg>`;
  }
  const sk = M.shapeKey(instr), shape = ch[sk], fing = ch.fingers[sk], ns = shape.length;
  const maxF = Math.max(...shape), base = maxF > 4 ? Math.min(...shape.filter(f => f > 0)) : 1;
  const W = 100, H = 134, x0 = 16, x1 = 84, y0 = 40, fh = 18, frets = 5;
  const sx = i => x0 + (x1 - x0) * i / (ns - 1);
  let g = `<text x="50" y="18" text-anchor="middle" font-family="Caveat" font-weight="700" font-size="22" fill="currentColor">${lab}</text>`;
  g += base === 1 ? `<rect x="${x0 - 1}" y="${y0 - 3}" width="${x1 - x0 + 2}" height="4" rx="1" fill="currentColor"/>` : `<text x="${x0 - (shape[0] >= base ? 10 : 6)}" y="${y0 + 13}" text-anchor="end" font-size="10" fill="currentColor">${base}</text>`;
  for (let f = 0; f <= frets; f++) g += `<line x1="${x0}" x2="${x1}" y1="${y0 + f * fh}" y2="${y0 + f * fh}" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/>`;
  for (let i = 0; i < ns; i++) g += `<line x1="${sx(i)}" x2="${sx(i)}" y1="${y0}" y2="${y0 + frets * fh}" stroke="currentColor" stroke-opacity=".7" stroke-width="${1 + (ns - 1 - i) * 0.25}"/>`;
  for (let i = 0; i < ns; i++) {
    const f = shape[i];
    if (f < 0) g += `<text x="${sx(i)}" y="${y0 - 8}" text-anchor="middle" font-size="11" fill="currentColor">×</text>`;
    else if (f === 0) g += `<circle cx="${sx(i)}" cy="${y0 - 11}" r="3.6" fill="none" stroke="currentColor" stroke-width="1.3"/>`;
    else { const y = y0 + (f - base + 0.5) * fh; g += `<circle cx="${sx(i)}" cy="${y}" r="7" fill="#f3d867" stroke="#1d1b17" stroke-width="1"/><text x="${sx(i)}" y="${y + 3.6}" text-anchor="middle" font-size="10" font-weight="700" fill="#1d1b17">${fing[i] || ''}</text>`; }
  }
  return `<svg class="cdiag" width="${w}" height="${w * H / W}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

// ---------------- Mikrofon-hjælp ----------------
async function needMic(lowF) {
  try {
    if (!A.micOn()) applyInput(lowF);
    await A.startMic();
    if (A.input.lost) { A.input.lost = false; S.inputId = null; S.inputLabel = ''; save(); toast('Den valgte indgang blev ikke fundet – bruger telefonens egen'); }
    return true;
  }
  catch (e) {
    const html = `<div style="text-align:center;padding:8px 0 4px"><div style="width:56px;height:56px;margin:0 auto 10px;color:var(--yellow)">${I.mic}</div>
      <div class="serif" style="font-size:22px;font-weight:600">Takt skal bruge mikrofonen</div>
      <p class="mut">Appen lytter til dit instrument – gennem mikrofonen eller et kabel – for at kunne give feedback. Lyden gemmes eller sendes ingen steder.</p></div>
      <div class="row"><button class="btn" style="flex:1" id="mClose">Senere</button>${NATIVE && NATIVE.openSettings ? '<button class="btn pri" style="flex:1" id="mSet">Åbn indstillinger</button>' : '<button class="btn pri" style="flex:1" id="mRetry">Prøv igen</button>'}</div>`;
    openSheet(html);
    $('#mClose').onclick = closeSheet;
    if ($('#mSet')) $('#mSet').onclick = () => { closeSheet(); NATIVE.openSettings(); };
    if ($('#mRetry')) $('#mRetry').onclick = () => { closeSheet(); needMic(); };
    return false;
  }
}
const analyzeOpts = (instr, chroma) => { const x = M.INSTR[instr]; return { minF: x.minF, maxF: x.maxF, chroma, sens: S.sens, electric: !!x.electric }; };

// ---------------- Værktøj: stemmeapparat + metronom ----------------
function viewTool(v) {
  v.innerHTML = `<div class="row" style="margin-bottom:14px"><h1 class="title">Værktøj</h1></div>
    <div class="seg" id="tseg"><button data-s="tuner" class="${toolSeg === 'tuner' ? 'on' : ''}">Stemmeapparat</button><button data-s="metro" class="${toolSeg === 'metro' ? 'on' : ''}">Metronom</button></div><div id="tbody" style="margin-top:18px"></div>`;
  v.querySelectorAll('#tseg button').forEach(b => b.onclick = () => { if (toolSeg !== b.dataset.s) { toolSeg = b.dataset.s; render(); } });
  (toolSeg === 'tuner' ? tuner : metronome)($('#tbody'));
}

function tuner(el) {
  const instr = S.instr; const ins = M.INSTR[instr];
  const tun = M.tunings(instr), tk = M.shapeKey(instr), ti = tun ? Math.min(tun.length - 1, S.tuning[tk] || 0) : 0;
  const strings = tun ? tun[ti][1].slice() : ins.strings ? ins.strings.slice() : null;
  const lowF = strings ? M.freq(Math.min(...strings)) * 0.88 : ins.minF;
  const tOpts = Object.assign(analyzeOpts(instr, false), { minF: Math.min(ins.minF, lowF) });
  let target = 'auto', raf = 0, sm = null, inTuneSince = 0, alive = true, lastSeen = 0;
  el.innerHTML = `${tun ? `<div class="row" style="justify-content:center;margin-bottom:12px"><button class="chip" id="tTun">Stemning: ${esc(tun[ti][0])} ▾</button></div>` : ''}
    <div class="chips" id="tStr" style="justify-content:center">${strings ? `<button class="chip on" data-t="auto">Auto</button>` + strings.map((m, i) => `<button class="chip" data-t="${m}">${M.name(m)}</button>`).join('') : `<span class="mut small">Kromatisk stemmeapparat</span>`}</div>
    <div class="postit tape" id="tCard" style="background:var(--white);margin:26px 6px 0;padding-top:22px;transition:background .25s">
      <svg viewBox="0 0 300 150" width="100%" style="display:block">
        <path d="M30 140 A120 120 0 0 1 270 140" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="14" stroke-linecap="round"/>
        <path d="M137.5 21 A120 120 0 0 1 162.5 21" fill="none" stroke="#3f8f4a" stroke-width="14"/>
        ${[-50,-25,0,25,50].map(c => { const a = (c / 50) * 75 * Math.PI / 180; return `<text x="${150 + 100 * Math.sin(a)}" y="${146 - 100 * Math.cos(a)}" text-anchor="middle" font-size="11" fill="#736c5b">${c > 0 ? '+' + c : c}</text>`; }).join('')}
        <g id="tNeedle" style="transition: transform .08s linear; transform-origin:150px 140px"><line x1="150" y1="140" x2="150" y2="32" stroke="#1d1b17" stroke-width="3.5" stroke-linecap="round"/></g>
        <circle cx="150" cy="140" r="8" fill="#1d1b17"/>
      </svg>
      <div class="tuner-note" id="tNote" style="margin-top:-6px">–</div>
      <div style="text-align:center;font-weight:600" id="tHint">Spil en streng</div>
      <div style="text-align:center;color:#736c5b;font-size:13px;margin-top:2px" id="tHz">&nbsp;</div>
    </div>
    <div class="row" style="margin-top:22px;justify-content:center"><button class="btn" id="tRef">${I.ear}Referencetone</button></div>
    <p class="mut small" style="text-align:center;margin-top:16px" id="tMicInfo"></p>`;
  const setNeedle = c => { $('#tNeedle').style.transform = `rotate(${Math.max(-50, Math.min(50, c)) / 50 * 75}deg)`; };
  setNeedle(0);
  if (tun) $('#tTun').onclick = () => {
    openSheet(`<div class="serif" style="font-size:22px;font-weight:600;margin-bottom:10px">Stemning</div><div class="card list">${tun.map((t, i) => `<div class="item" data-t="${i}"><div style="flex:1"><div class="tt">${esc(t[0])}</div><div class="st">${t[1].map(m => M.name(m).replace(/-?\d+$/, '')).join(' ')}</div></div>${i === ti ? I.check.replace('<svg', '<svg width="20" height="20"') : ''}</div>`).join('')}</div>
      <p class="mut small" style="margin:12px 0 0">Øvelserne i Takt bruger standardstemning.</p>`);
    $('#sheet').querySelectorAll('[data-t]').forEach(x => x.onclick = () => { S.tuning[tk] = +x.dataset.t; save(); closeSheet(); render(); });
  };
  if (strings) el.querySelectorAll('#tStr button').forEach(b => b.onclick = () => { target = b.dataset.t; el.querySelectorAll('#tStr button').forEach(x => x.classList.toggle('on', x === b)); if (target !== 'auto') A.play(+target, 0, 1.6, A.synthKind(instr)); });
  $('#tRef').onclick = () => { const m = target !== 'auto' ? +target : (sm != null ? Math.round(sm) : (strings ? strings[0] : 69)); A.tone(m, 2.2, 'triangle'); };
  leaveView = () => { alive = false; cancelAnimationFrame(raf); A.stopMic(); keepAwake(false); };
  (async () => {
    if (!(await needMic(lowF)) || !alive) { $('#tMicInfo').textContent = 'Mikrofonen er ikke tilgængelig.'; return; }
    keepAwake(true);
    $('#tMicInfo').textContent = (isCable(A.input.label) ? 'Kabel: ' : 'Lytter via ') + (A.input.label || 'mikrofonen') + (humOn() ? ' · brumfilter' : '');
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const r = A.analyze(tOpts); if (!r) return;
      const now = performance.now();
      if (r.pitch == null) {
        if (now - lastSeen > 900) { $('#tHint').textContent = strings ? 'Spil en streng' : 'Spil eller syng en tone'; $('#tCard').style.background = 'var(--white)'; sm = null; }
        return;
      }
      lastSeen = now;
      if (sm == null || Math.abs(r.pitch - sm) > 0.7) sm = r.pitch; else sm = sm * 0.8 + r.pitch * 0.2;
      let ref;
      if (target !== 'auto') { ref = +target; while (sm - ref > 6) ref += 12; while (ref - sm > 6) ref -= 12; }
      else if (strings) { ref = strings.reduce((a, b) => Math.abs(b - sm) < Math.abs(a - sm) ? b : a); if (Math.abs(ref - sm) > 2.5) ref = Math.round(sm); }
      else ref = Math.round(sm);
      const cents = (sm - ref) * 100;
      setNeedle(cents);
      $('#tNote').textContent = M.name(ref).replace(/-?\d+$/, '');
      $('#tHz').textContent = M.freq(sm).toFixed(1) + ' Hz · ' + (cents >= 0 ? '+' : '') + cents.toFixed(0) + ' cent · ' + M.name(ref);
      if (Math.abs(cents) <= 5) { if (!inTuneSince) inTuneSince = now; if (now - inTuneSince > 500) { $('#tHint').textContent = 'Stemt ✓'; $('#tCard').style.background = 'var(--green)'; if (now - inTuneSince < 540) haptic(20); } else $('#tHint').textContent = 'Næsten…'; }
      else { inTuneSince = 0; $('#tCard').style.background = 'var(--white)'; $('#tHint').textContent = cents < 0 ? (strings ? 'For dyb – stram strengen' : 'For dyb') : (strings ? 'For høj – løsn strengen' : 'For høj'); }
    };
    loop();
  })();
}

function metronome(el) {
  let bpm = A.metro.bpm || 90, beats = A.metro.beats || 4, taps = [], trainer = false, trainTop = 0, bars = 0;
  A.metro.accent = S.accent !== false;
  const draw = () => {
    el.innerHTML = `<div class="postit tape" style="background:var(--blue);margin:8px 6px 0;text-align:center;padding-top:24px">
      <div class="ps">Slag pr. minut</div>
      <div class="row" style="justify-content:center;gap:18px"><button class="btn dark" id="mM" style="width:52px;height:52px;padding:0;font-size:26px">−</button>
      <div class="hand" style="font-size:96px;line-height:.9;min-width:150px" id="mB">${bpm}</div>
      <button class="btn dark" id="mP" style="width:52px;height:52px;padding:0;font-size:26px">+</button></div>
      <input type="range" min="30" max="240" value="${bpm}" id="mR" style="margin-top:10px">
      <div class="row" id="mDots" style="justify-content:center;gap:10px;margin-top:14px">${Array.from({ length: beats }, (_, i) => `<span style="width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.15)"></span>`).join('')}</div>
    </div>
    <div style="margin:22px 0 8px;font-weight:600">Taktart</div>
    <div class="chips" id="mBeats">${[2,3,4,6].map(b => `<button class="chip ${b === beats ? 'on' : ''}" data-b="${b}">${b}/4</button>`).join('')}</div>
    <div class="row" style="margin-top:18px"><div style="flex:1"><div style="font-weight:600">Fremhæv 1-slaget</div><div class="mut small">Højere klik på første slag i takten</div></div><button class="toggle ${S.accent !== false ? 'on' : ''}" id="mAcc"></button></div>
    <div class="row" style="margin-top:14px"><div style="flex:1"><div style="font-weight:600">Tempotræner</div><div class="mut small" id="mTrS">${trainer ? '+5 BPM for hver 4. takt – op til ' + trainTop : 'Skruer langsomt tempoet op, mens du øver'}</div></div><button class="toggle ${trainer ? 'on' : ''}" id="mTr"></button></div>
    <div class="row" style="margin-top:22px"><button class="btn" style="flex:1" id="mTap">Tap tempo</button><button class="btn pri" style="flex:1.4" id="mGo">${A.metro.on ? I.pause + 'Stop' : I.play + 'Start'}</button></div>`;
    const setB = b => { bpm = Math.max(30, Math.min(240, Math.round(b))); $('#mB').textContent = bpm; $('#mR').value = bpm; A.metroSet(bpm); };
    $('#mM').onclick = () => setB(bpm - 1); $('#mP').onclick = () => setB(bpm + 1);
    $('#mR').oninput = e => setB(+e.target.value);
    el.querySelectorAll('#mBeats button').forEach(b => b.onclick = () => { beats = +b.dataset.b; A.metroSet(bpm, beats); draw(); });
    $('#mTap').onclick = () => { const t = performance.now(); taps = taps.filter(x => t - x < 2500); taps.push(t); if (taps.length >= 2) { const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); setB(60000 / d); } };
    $('#mGo').onclick = () => { if (A.metro.on) { A.metroStop(); keepAwake(false); } else { bars = 0; A.metroStart(bpm, beats, onBeat); keepAwake(true); } draw(); };
    $('#mAcc').onclick = ev => { S.accent = S.accent === false; ev.currentTarget.classList.toggle('on', S.accent); A.metro.accent = S.accent; save(); };
    $('#mTr').onclick = () => { trainer = !trainer; trainTop = Math.min(240, bpm + 40); bars = 0; draw(); };
    trainStep = () => { if (!trainer || !A.metro.on) return; if (bars++ && bars % 4 === 1) { if (bpm + 5 <= trainTop) setB(bpm + 5); else { trainer = false; draw(); toast('Toptempo nået – ' + bpm + ' BPM'); } } };
  };
  let trainStep = () => {};
  const onBeat = b => { if (b === 0) trainStep(); const d = el.querySelectorAll('#mDots span'); d.forEach((s, i) => s.style.background = i === b ? (b === 0 ? '#1d1b17' : '#2b4bd8') : 'rgba(0,0,0,.15)'); };
  if (A.metro.on) A.metro.onBeat = onBeat;
  draw();
  leaveView = () => { A.metroStop(); keepAwake(false); };
}

// ---------------- Akkorder ----------------
function viewChords(v) {
  const instr = S.instr === 'voice' ? 'piano' : S.instr;
  const all = M.chordNames(instr), fv = favs(instr);
  const FIL = [['alle', 'Alle'], ['fav', '★ Favoritter' + (fv.length ? ' ' + fv.length : '')], ['dur', 'Dur'], ['mol', 'Mol'], ['syv', '7\'ere'], ['sus', 'Sus'], ['power', 'Power']].filter(f => f[0] === 'alle' || f[0] === 'fav' || all.some(c => chordKind(c) === f[0]));
  if (!FIL.some(f => f[0] === chordFilter)) chordFilter = 'alle';
  const shown = chordFilter === 'alle' ? all : chordFilter === 'fav' ? all.filter(c => fv.includes(c)) : all.filter(c => chordKind(c) === chordFilter);
  const cols = ['yellow','pink','green','blue','orange','lilac','white'];
  v.innerHTML = `<div class="row" style="margin-bottom:6px"><h1 class="title">Akkorder</h1><span class="sp"></span><button class="chip" id="instrBtn2">${M.INSTR[S.instr].name} ▾</button></div>
    <p class="mut small" style="margin:0 0 18px">${S.instr === 'voice' ? 'Vist på klaver. ' : ''}Tryk på en akkord for at høre den og tjekke dit greb.</p>
    <div class="chips" id="cFil" style="margin-bottom:18px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px">${FIL.map(([k, l]) => `<button class="chip ${chordFilter === k ? 'on' : ''}" data-f="${k}" style="flex:none">${l}</button>`).join('')}</div>
    ${shown.length ? `<div class="grid2">${shown.map((c, i) => `<button class="postit ${i % 2 ? 'tilt-r' : 'tilt-l'}" data-c="${c}" style="background:var(--${cols[all.indexOf(c) % cols.length]});padding:12px 8px 10px">${fv.includes(c) ? '<span class="favm">★</span>' : ''}${chordSvg(c, instr, 118)}</button>`).join('')}</div>`
      : `<p class="mut" style="text-align:center;margin:40px 20px">${chordFilter === 'fav' ? 'Ingen favoritter endnu. Åbn en akkord og tryk på stjernen.' : 'Ingen akkorder af den slags til dette instrument.'}</p>`}<div style="height:12px"></div>`;
  v.querySelectorAll('#cFil button').forEach(b => b.onclick = () => { chordFilter = b.dataset.f; const y = v.scrollTop; viewChords(v); v.scrollTop = y; });
  $('#instrBtn2').onclick = pickInstrument;
  v.querySelectorAll('[data-c]').forEach(b => b.onclick = () => chordDetail(b.dataset.c, instr));
}
function chordDetail(c, instr) {
  let alive = true, raf = 0, okSince = 0, done = false;
  const notes = M.shapeNotes(c, instr);
  const pcs = [...new Set(notes.map(m => ((m % 12) + 12) % 12))];
  openSheet(`<div style="color:var(--ink);position:relative">${chordSvg(c, instr, 170)}<button id="cFav" aria-label="Favorit" class="favb ${favs(instr).includes(c) ? 'on' : ''}">★</button></div>
    <div class="mut small" style="text-align:center;margin:6px 0 14px">Toner: ${[...new Set(notes.map(m => M.pcName(m)))].join(' · ')}</div>
    <div class="row"><button class="btn" style="flex:1" id="cL">${I.ear}Lyt</button><button class="btn pri" style="flex:1.3" id="cT">${I.mic}Tjek mit greb</button></div>
    <div id="cLive" style="display:none;margin-top:18px">
      <div style="display:flex;gap:4px;align-items:flex-end;height:70px" id="cBars">${Array.from({ length: 12 }, (_, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end"><b style="width:100%;border-radius:3px;background:${pcs.includes(i) ? 'var(--yellow)' : 'var(--line)'};height:2px"></b><span style="font-size:10px;color:var(--mut)">${M.pcName(i)}</span></div>`).join('')}</div>
      <div style="text-align:center;font-family:Caveat;font-weight:700;font-size:30px;margin-top:8px" id="cMsg">Slå akkorden an…</div>
    </div>`, () => { alive = false; cancelAnimationFrame(raf); A.stopMic(); keepAwake(false); });
  $('#cL').onclick = () => A.strum(notes, 0, 2, A.synthKind(instr));
  $('#cFav').onclick = ev => { const on = toggleFav(instr, c); ev.currentTarget.classList.toggle('on', on); haptic(10); toast(on ? M.chordLabel(c) + ' er nu en favorit' : 'Fjernet fra favoritter', 1400); if (tab === 'chords') { const v = $('#view'), y = v.scrollTop; viewChords(v); v.scrollTop = y; } };
  $('#cT').onclick = async () => {
    if (!(await needMic()) || !alive) return;
    $('#cLive').style.display = 'block'; $('#cT').style.display = 'none'; keepAwake(true);
    const bars = [...document.querySelectorAll('#cBars b')];
    const loop = () => {
      if (!alive) return; raf = requestAnimationFrame(loop);
      const r = A.analyze(analyzeOpts(instr, true)); if (!r) return;
      if (!r.chroma) { bars.forEach(b => b.style.height = '2px'); if (!done) okSince = 0; return; }
      r.chroma.forEach((x, i) => bars[i].style.height = Math.max(2, x * 56) + 'px');
      const cm = A.chordMatch(r.chroma, c, instr);
      if (cm.ok) { if (!okSince) okSince = performance.now(); if (performance.now() - okSince > 350 && !done) { done = true; $('#cMsg').textContent = 'Rigtigt! ' + M.chordLabel(c) + ' ✓'; $('#cMsg').style.color = 'var(--ok)'; haptic(30); } }
      else { okSince = 0; if (!done) { const missing = cm.missing.map(p => M.pcName(p)); $('#cMsg').textContent = missing.length ? 'Jeg mangler: ' + missing.join(', ') : cm.best && cm.best !== c && cm.cos < 0.8 ? 'Lyder som ' + M.chordLabel(cm.best) : 'Næsten – slå alle strenge an'; } }
    };
    loop();
  };
}

// ---------------- Mig ----------------
function viewMe(v) {
  const lv = level(), st = streak(), tot = Math.round(totalSec() / 60);
  const doneN = Object.values(S.best).filter(b => b.stars >= 1).length, starsN = Object.values(S.best).reduce((a, b) => a + b.stars, 0);
  const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(new Date(), i - 6); return { l: 'smtotfl'[d.getDay()].toUpperCase(), m: (S.days[dayKey(d)] || 0) / 60 }; });
  const mx = Math.max(S.goal, ...week.map(w => w.m));
  v.innerHTML = `<div class="row" style="margin-bottom:16px"><h1 class="title">Mig</h1></div>
    <div class="grid2">
      <div class="postit tape tilt-l" style="background:var(--lilac)"><div class="ps">Niveau</div><div class="pt" style="font-size:40px">${lv.l}</div>
        <div style="height:6px;background:rgba(0,0,0,.14);border-radius:9px;margin-top:6px"><div style="height:100%;width:${(lv.cur / lv.need * 100).toFixed(0)}%;background:#1d1b17;border-radius:9px"></div></div><div class="ps" style="margin-top:4px">${lv.cur}/${lv.need} XP</div></div>
      <div class="postit tilt-r" style="background:var(--green)"><div class="ps">Øvet i alt</div><div class="pt" style="font-size:40px">${tot}</div><div class="ps">minutter · ${st} ${st === 1 ? 'dag' : 'dage'} i træk</div></div>
    </div>
    <div class="postit" style="background:var(--yellow);margin-top:18px"><div class="row"><div class="pt">Denne uge</div><span class="sp"></span><span class="ps">${doneN} øvelser · ${starsN} ★${S.dailyN ? ' · ' + S.dailyN + ' dagens' : ''}</span></div>
      <div class="weekbars" style="margin-top:10px">${week.map(w => `<div><b style="height:${Math.max(3, w.m / mx * 70)}px;${w.m >= S.goal ? '' : 'opacity:.45'}"></b>${w.l}</div>`).join('')}</div></div>
    <div class="section-t">Indstillinger</div>
    <div class="card">
      <div class="setrow"><div class="l"><div>Instrument</div><div>${M.INSTR[S.instr].name}</div></div><button class="chip" id="sIn">Skift</button></div>
      <div class="setrow"><div class="l"><div>Dagligt mål</div><div>Minutter pr. dag</div></div><div class="chips" id="sGoal">${[5,10,15,20,30].map(g => `<button class="chip ${S.goal === g ? 'on' : ''}" data-g="${g}" style="padding:6px 10px">${g}</button>`).join('')}</div></div>
      <div class="setrow"><div class="l"><div>Tonenavne</div><div>Dansk H eller international B</div></div><div class="seg" style="padding:2px"><button id="sH" class="${S.useH ? 'on' : ''}" style="padding:6px 14px">H</button><button id="sB" class="${S.useH ? '' : 'on'}" style="padding:6px 14px">B</button></div></div>
      <div class="setrow"><div class="l"><div>Stemmeleje (sang)</div><div>Dyb stemme synger en oktav lavere</div></div><div class="seg" style="padding:2px"><button id="sVh" class="${S.voiceLow ? '' : 'on'}" style="padding:6px 12px">Lys</button><button id="sVl" class="${S.voiceLow ? 'on' : ''}" style="padding:6px 12px">Dyb</button></div></div>
    </div>
    <div class="section-t">Lyd</div>
    <div class="card">
      <div class="setrow"><div class="l"><div>Lydindgang</div><div>${S.inputId ? esc(S.inputLabel || 'Valgt enhed') : 'Automatisk – mikrofon eller kabel'}</div></div><button class="chip" id="sInp">Vælg</button></div>
      <div class="setrow"><div class="l"><div>Brumfilter</div><div>Fjerner 50 Hz-brum fra pickupper og kabler</div></div><button class="toggle ${humOn() ? 'on' : ''}" id="sHum"></button></div>
      <div class="setrow" style="flex-wrap:wrap"><div class="l"><div>Følsomhed</div><div>Højere hvis appen ikke hører dig – fx elguitar uden forstærker</div></div><div style="width:100%"><input type="range" min="0.5" max="6" step="0.1" value="${S.sens}" id="sSens"></div></div>
      <div class="setrow"><div class="l"><div>Forsinkelse</div><div id="sLatV">${S.latency} ms${S.latencyMeasured ? ' (målt)' : ''}</div></div><div class="row" style="gap:6px"><button class="chip" id="sLm" style="padding:6px 11px">−</button><button class="chip" id="sLp" style="padding:6px 11px">+</button><button class="chip" id="sLat">Mål</button></div></div>
      <div class="setrow"><div class="l"><div>Test lyden</div><div>Se hvad appen hører</div></div><button class="chip" id="sMic">Test</button></div>
    </div>
    <div class="section-t">Data</div>
    <div class="card">
      <div class="setrow"><div class="l"><div>Sikkerhedskopi</div><div>Gem eller hent stjerner, XP og streak</div></div><button class="chip" id="sBk">Åbn</button></div>
      <div class="setrow"><div class="l"><div>Nyt i version ${VERSION}</div><div>Se hvad der er kommet til</div></div><button class="chip" id="sNews">Vis</button></div>
      <div class="setrow"><div class="l"><div>Nulstil fremskridt</div><div>Sletter stjerner, XP og streak</div></div><button class="chip" id="sReset" style="color:var(--bad)">Nulstil</button></div>
    </div>
    <p class="mut small" style="text-align:center;margin:22px 0 6px">Takt ${VERSION} · Melodierne er traditionelle/fri af ophavsret</p>`;
  $('#sIn').onclick = pickInstrument;
  v.querySelectorAll('#sGoal button').forEach(b => b.onclick = () => { S.goal = +b.dataset.g; save(); render(); });
  $('#sH').onclick = () => { S.useH = true; M.setH(true); save(); render(); };
  $('#sB').onclick = () => { S.useH = false; M.setH(false); save(); render(); };
  $('#sVh').onclick = () => { S.voiceLow = false; save(); render(); };
  $('#sVl').onclick = () => { S.voiceLow = true; save(); render(); };
  $('#sSens').onchange = e => { S.sens = +e.target.value; save(); };
  $('#sInp').onclick = pickInput;
  $('#sHum').onclick = ev => { S.hum = !humOn(); ev.currentTarget.classList.toggle('on', S.hum); save(); };
  const lat = d => { S.latency = Math.max(0, Math.min(400, S.latency + d)); S.latencyMeasured = false; save(); $('#sLatV').textContent = S.latency + ' ms'; };
  $('#sLm').onclick = () => lat(-10); $('#sLp').onclick = () => lat(10);
  $('#sLat').onclick = calibrate;
  $('#sMic').onclick = micTest;
  $('#sBk').onclick = backupSheet; $('#sNews').onclick = showNews;
  $('#sReset').onclick = () => {
    openSheet(`<div class="serif" style="font-size:22px;font-weight:600">Nulstil alt fremskridt?</div><p class="mut">Stjerner, XP, øvetid og streak slettes. Indstillinger bevares.</p>
      <div class="row"><button class="btn" style="flex:1" id="rN">Annullér</button><button class="btn" style="flex:1;background:var(--bad);color:#2a0d08;border:0" id="rY">Nulstil</button></div>`);
    $('#rN').onclick = closeSheet; $('#rY').onclick = () => { S.best = {}; S.xp = 0; S.days = {}; S.last = {}; S.daily = null; S.dailyN = 0; save(); closeSheet(); render(); toast('Fremskridt nulstillet'); };
  };
}

function micTest() {
  let alive = true, raf = 0;
  openSheet(`<div class="serif" style="font-size:22px;font-weight:600;margin-bottom:4px">Lydtest</div>
    <div class="mut small" id="mtSrc" style="margin-bottom:12px">&nbsp;</div>
    <div class="levelbar"><i id="lvl"></i></div>
    <div class="tuner-note" id="mtN" style="font-size:80px;margin-top:16px">–</div>
    <p class="mut small" style="text-align:center" id="mtI">Spil eller syng en tone</p>`, () => { alive = false; cancelAnimationFrame(raf); A.stopMic(); });
  (async () => {
    if (!(await needMic()) || !alive) return;
    $('#mtSrc').textContent = (isCable(A.input.label) ? 'Kabel: ' : 'Indgang: ') + (A.input.label || 'telefonens mikrofon') + (humOn() ? ' · brumfilter til' : '');
    const loop = () => { if (!alive) return; raf = requestAnimationFrame(loop);
      const r = A.analyze(analyzeOpts(S.instr, false)); if (!r) return;
      $('#lvl').style.width = Math.min(100, Math.sqrt(r.rms) * 260) + '%';
      $('#lvl').style.background = r.rms > r.gate ? 'var(--ok)' : 'var(--mut2)';
      if (r.pitch != null) { $('#mtN').textContent = M.name(Math.round(r.pitch)); $('#mtI').textContent = M.freq(r.pitch).toFixed(1) + ' Hz'; }
    }; loop();
  })();
}

// Mål rundturs-forsinkelse: højttaler → mikrofon
function calibrate() {
  let alive = true, raf = 0;
  openSheet(`<div class="serif" style="font-size:22px;font-weight:600">Mål forsinkelse</div>
    <p class="mut">Tag høretelefoner af, skru op for lyden og vær stille. Appen afspiller 8 klik og måler, hvor længe lyden er om at komme tilbage til mikrofonen. Spiller du via kabel, kan målingen ikke bruges – prøv 40–60 ms med − og + i stedet.</p>
    <div class="hand" style="font-size:44px;text-align:center" id="cbS">Klar</div>
    <div class="row" style="margin-top:10px"><button class="btn" style="flex:1" id="cbX">Luk</button><button class="btn pri" style="flex:1.4" id="cbGo">Start måling</button></div>`, () => { alive = false; cancelAnimationFrame(raf); A.stopMic(); });
  $('#cbX').onclick = closeSheet;
  $('#cbGo').onclick = async () => {
    if (!(await needMic()) || !alive) return;
    $('#cbGo').disabled = true; $('#cbS').textContent = 'Lytter…';
    const ctx = A.ensureCtx(); const t0 = ctx.currentTime + 0.6; const clicks = [];
    for (let i = 0; i < 8; i++) { const t = t0 + i * 0.6; clicks.push(t); A.click(t, true, 1); }
    const onsets = [];
    const loop = () => {
      if (!alive) return;
      const r = A.analyze({ minF: 70, maxF: 1500, sens: 1 }); if (r) onsets.push(...r.onsets);
      if (ctx.currentTime < t0 + 8 * 0.6 + 0.3) { raf = requestAnimationFrame(loop); return; }
      const lat = clicks.map(c => { const o = onsets.find(t => t > c + 0.005 && t < c + 0.5); return o != null ? o - c : null; }).filter(x => x != null).sort((a, b) => a - b);
      if (lat.length < 5) { $('#cbS').textContent = 'Hørte ikke klikkene'; $('#cbGo').disabled = false; return; }
      const med = lat[Math.floor(lat.length / 2)];
      const spread = lat[lat.length - 2] - lat[1];
      if (spread > 0.06) { $('#cbS').textContent = 'For meget støj – prøv igen'; $('#cbGo').disabled = false; return; }
      S.latency = Math.round(Math.max(0, Math.min(400, med * 1000))); S.latencyMeasured = true; save();
      $('#cbS').textContent = S.latency + ' ms ✓'; haptic(30);
      const lv = $('#sLatV'); if (lv) lv.textContent = S.latency + ' ms (målt)';
    };
    loop();
  };
}

// ---------------- Spilmotor ----------------
const cv = $('#cv'), g2 = cv.getContext('2d');
const EARLY = 0.22, LATE = 0.30;
const Game = {
  st: null,
  async start(def, opts) {
    const instr = S.instr;
    let built; try { built = M.build(def, instr, S.voiceLow ? -12 : 0); } catch (e) { toast(e.message); return; }
    const listen = !!opts.listen;
    A.ensureCtx();
    if (!listen && !(await needMic())) return;
    const speed = S.speed, spb = 60 / (built.bpm * speed);
    const st = this.st = {
      def, instr, built, listen, speed, spb, wait: !listen && S.wait, metro: S.metro && !listen, ts: built.ts,
      ev: built.events.map(e => Object.assign({ state: 'pending', mf: 0, tot: 0, good: 0, heard: null, run: 0 }, e)),
      origin: 0, beat: -built.ts, paused: false, done: false, score: 0, hits: 0, perfect: 0, good: 0, ok: 0, miss: 0, combo: 0, bestCombo: 0,
      onsets: [], trail: [], clickNext: 0, firstBeat: 0, lastRealT: 0, activeSec: 0, fbText: '', fbColor: '', fbT: 0, heard: null, rms: 0, gate: 0.01,
      chordPcs: {},
    };
    for (const e of st.ev) if (e.c) st.chordPcs[e.c] = [...new Set(M.shapeNotes(e.c, instr).map(m => ((m % 12) + 12) % 12))];
    const ctx = A.ctx;
    st.origin = ctx.currentTime + 0.5 + st.ts * spb; st.clickNext = -st.ts; st.firstBeat = 0;
    if (listen) this.scheduleListen(0);
    this.nextKey = null; $('#nextBox').innerHTML = '';
    $('#play').classList.add('show'); $('#pauseL').classList.remove('show');
    $('#pBtn').innerHTML = listen ? I.close : I.pause;
    $('#pBtn').onclick = () => listen ? this.stop() : this.pause();
    $('#fb').textContent = listen ? 'Lyt og se med' : ''; $('#heard').style.visibility = listen ? 'hidden' : 'visible'; $('#meter').style.visibility = listen ? 'hidden' : 'visible';
    keepAwake(true);
    this.resize(); st.lastRealT = ctx.currentTime;
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.frame());
  },
  scheduleListen(fromBeat) {
    const st = this.st, k = A.synthKind(st.instr);
    st.listenSrc = [];
    for (const e of st.ev) {
      if (e.b < fromBeat) continue;
      const t = st.origin + e.b * st.spb, d = e.d * st.spb * 0.95;
      if (e.c) A.strum(M.shapeNotes(e.c, st.instr), t, Math.min(d, 2.5), k);
      else st.listenSrc.push(A.play(e.m, t, Math.min(d, 2), k, 0.9));
    }
  },
  resize() { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); this.dpr = d; },
  pause() {
    const st = this.st; if (!st || st.done || st.paused || st.listen) return;
    st.paused = true; st.pausedBeat = st.beat;
    $('#pauseL').innerHTML = `<div class="hand" style="font-size:48px">Pause</div>
      <button class="btn pri block" style="max-width:320px" id="pz1">${I.play}Fortsæt</button>
      <button class="btn block" style="max-width:320px" id="pz2">${I.restart}Start forfra</button>
      <button class="btn block" style="max-width:320px" id="pz3">${I.close}Afslut</button>`;
    $('#pauseL').classList.add('show');
    $('#pz1').onclick = () => this.resume(); $('#pz2').onclick = () => { const d = st.def; this.stop(true); this.start(d, {}); }; $('#pz3').onclick = () => this.stop();
  },
  async resume() {
    const st = this.st; if (!st || !st.paused) return;
    if (!A.micOn() && !(await needMic())) return;
    if (this.st !== st) return;
    $('#pauseL').classList.remove('show');
    // genoptag én takt før med indtælling
    const rb = Math.max(-st.ts, Math.floor(st.pausedBeat) - st.ts);
    const fb = Math.ceil(st.pausedBeat);
    for (const e of st.ev) if (e.state === 'pending' && e.b < fb) { /* allerede passeret – bevares som pending og bedømmes normalt */ }
    st.origin = A.ctx.currentTime + 0.4 - rb * st.spb; st.clickNext = rb; st.firstBeat = rb + st.ts; st.beat = rb;
    st.paused = false; st.lastRealT = A.ctx.currentTime;
  },
  stop(silent) {
    const st = this.st; cancelAnimationFrame(this.raf);
    if (st && st.listenSrc) st.listenSrc.forEach(s => { try { s.stop(); } catch (e) {} });
    if (st && !st.listen) this.addTime(st);
    this.st = null; A.stopMic(); keepAwake(false);
    $('#play').classList.remove('show'); $('#pauseL').classList.remove('show');
    if (!silent) render();
  },
  addTime(st) { if (st.activeSec > 0) { const k = dayKey(); S.days[k] = (S.days[k] || 0) + Math.round(st.activeSec); st.activeSec = 0; save(); } },
  feedback(t, c) { const st = this.st; st.fbText = t; st.fbColor = c; st.fbT = performance.now(); },
  judge(e, rating, offset) {
    const st = this.st;
    e.state = 'hit'; e.rating = rating; e.hitT = performance.now();
    const pts = rating === 'perfekt' ? 100 : rating === 'god' ? 70 : 40;
    st.score += pts; st.hits++; st[rating === 'perfekt' ? 'perfect' : rating === 'god' ? 'good' : 'ok']++;
    st.combo++; st.bestCombo = Math.max(st.bestCombo, st.combo);
    const late = offset != null && Math.abs(offset) > 0.08 && rating !== 'perfekt' ? (offset > 0 ? ' · lidt sent' : ' · lidt tidligt') : '';
    this.feedback((rating === 'perfekt' ? 'Perfekt!' : rating === 'god' ? 'Godt' : 'OK') + late + (st.combo >= 5 ? '  ×' + st.combo : ''), rating === 'perfekt' ? '#8fd694' : rating === 'god' ? '#f3d867' : '#f3c08c');
  },
  missed(e) {
    const st = this.st; e.state = 'miss'; e.hitT = performance.now(); st.miss++; st.combo = 0;
    if (e.c) this.feedback('Missede ' + M.chordLabel(e.c), '#ff8a7a');
    else if (e.heard != null && Math.round(e.heard) !== e.m) this.feedback('Du spillede ' + M.name(Math.round(e.heard)), '#ff8a7a');
    else this.feedback('Missede ' + M.name(e.m), '#ff8a7a');
  },
  pitchOk(p, m) {
    const ins = M.INSTR[this.st.instr];
    if (ins.pcOnly) { let d = ((p - m) % 12 + 12) % 12; if (d > 6) d -= 12; return Math.abs(d) < 0.5; }
    const d = p - m; return Math.abs(d) < 0.6 || (ins.octaveOk && (Math.abs(d - 12) < 0.6 || Math.abs(d + 12) < 0.6));
  },
  frame() {
    const st = this.st; if (!st) return;
    this.raf = requestAnimationFrame(() => this.frame());
    const ctx = A.ctx, now = ctx.currentTime, spb = st.spb;
    if (st.paused) { this.draw(); return; }
    const realDt = Math.min(0.1, now - st.lastRealT); st.lastRealT = now;
    // taktslag
    let beat = (now - st.origin) / spb;
    if (st.wait && beat > st.firstBeat) {
      const blk = st.ev.find(e => e.state === 'pending');
      if (blk && beat > blk.b) { st.origin = now - blk.b * spb; beat = blk.b; st.waiting = true; } else st.waiting = false;
    }
    st.beat = beat;
    if (beat > 0) st.activeSec += realDt;
    // metronom / indtælling
    while (st.clickNext < beat + 0.35 / spb + 1 && (st.clickNext < st.firstBeat || (st.metro && !st.wait && st.clickNext <= st.built.beats))) {
      const k = st.clickNext, t = st.origin + k * spb;
      if (t > now - 0.02) A.click(t, ((k % st.ts) + st.ts) % st.ts === 0, k < st.firstBeat ? 0.6 : 0.35);
      st.clickNext++;
    }
    // analyse
    if (!st.listen) {
      const r = A.analyze(analyzeOpts(st.instr, st.built.kind === 'chords'));
      if (r) {
        st.rms = r.rms; st.gate = r.gate;
        const lat = S.latency / 1000;
        const tb = t => st.wait ? beat : (t - lat - st.origin) / spb;
        for (const o of r.onsets) st.onsets.push(tb(o)); if (st.onsets.length > 40) st.onsets.splice(0, st.onsets.length - 40);
        const db = tb(r.t);
        st.heard = r.pitch;
        if (r.pitch != null && st.built.kind === 'notes') { st.trail.push({ b: beat, p: r.pitch }); }
        if (st.trail.length > 400) st.trail.shift();
        this.evaluate(r, db, beat);
      }
    } else {
      for (const e of st.ev) if (e.state === 'pending' && beat >= e.b) { e.state = 'hit'; e.rating = 'listen'; e.hitT = performance.now(); }
    }
    // slut?
    if (beat > st.built.beats + 0.5 && st.ev.every(e => e.state !== 'pending')) { this.finish(); return; }
    this.draw();
  },
  evaluate(r, db, beat) {
    const st = this.st, spb = st.spb, eB = EARLY / spb, lB = LATE / spb, voice = M.INSTR[st.instr].pcOnly;
    for (let i = 0; i < st.ev.length; i++) {
      const e = st.ev[i]; if (e.state !== 'pending') continue;
      if (e.b - eB > db && !(st.wait && beat >= e.b)) break; // kommende toner
      const prev = st.ev[i - 1];
      if (voice) {
        const end = e.b + Math.max(0.5, e.d * 0.9);
        if (db >= e.b - 0.1 && db <= end) {
          e.tot++;
          const ok = r.pitch != null && this.pitchOk(r.pitch, e.m);
          if (ok) { e.good++; e.run++; } else e.run = 0;
          if (r.pitch != null) e.heard = r.pitch;
          if (st.wait && e.run * (1 / 60) > 0.35) { this.judge(e, 'god', null); continue; }
        }
        if (!st.wait && db > end) {
          const ratio = e.tot ? e.good / e.tot : 0;
          if (ratio >= 0.35) this.judge(e, ratio >= 0.7 ? 'perfekt' : ratio >= 0.5 ? 'god' : 'ok', null); else this.missed(e);
        }
        continue;
      }
      const inWin = (db >= e.b - eB && db <= e.b + lB) || (st.wait && beat >= e.b - eB);
      if (inWin) {
        let match;
        if (e.c) { match = A.chordMatch(r.chroma, e.c, st.instr).ok; }
        else { match = r.pitch != null && this.pitchOk(r.pitch, e.m); if (r.pitch != null) e.heard = r.pitch; }
        const same = prev && (e.c ? prev.c === e.c : prev.m === e.m) && (e.b - (prev.b + prev.d)) < 1.01;
        const ons = st.onsets.filter(o => o >= e.b - eB - 0.05 / spb && o <= db + 0.02);
        // ved gentaget tone tæller kun frames efter et nyt anslag, og de rigtige skal være i overtal
        if (same && ons.length && (e.c ? r.chroma : r.pitch != null)) { if (match) e.after = (e.after || 0) + 1; else e.other = (e.other || 0) + 1; }
        if (match) {
          e.mf++; if (e.first == null) e.first = db;
          const ok = e.mf >= 2 && (!same || (ons.length > 0 && (e.after || 0) >= 2 && (e.after || 0) > (e.other || 0)));
          if (ok) {
            const ob = ons.length ? ons.reduce((a, b) => Math.abs(b - e.b) < Math.abs(a - e.b) ? b : a) : e.first;
            const off = st.wait ? 0 : (ob - e.b) * spb;
            const rating = st.wait ? 'god' : Math.abs(off) < 0.09 ? 'perfekt' : Math.abs(off) < 0.17 ? 'god' : 'ok';
            this.judge(e, rating, off);
          }
        }
      }
      if (!st.wait && db > e.b + lB && e.state === 'pending') this.missed(e);
      if (st.wait) break; // kun den første ventende i vent-tilstand
    }
  },
  finish() {
    const st = this.st; cancelAnimationFrame(this.raf);
    if (st.listen) { this.stop(); return; }
    st.done = true;
    const total = st.ev.length, acc = total ? st.hits / total : 0;
    let stars = acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : acc >= 0.6 ? 1 : 0;
    const capped = (st.speed < 1 || st.wait) && stars > 2; if (capped) stars = 2;
    const key = st.instr + ':' + st.def.id, prev = S.best[key];
    const isBest = !prev || st.score > prev.score || stars > prev.stars;
    if (isBest) S.best[key] = { stars: Math.max(stars, prev ? prev.stars : 0), score: Math.max(st.score, prev ? prev.score : 0), acc: Math.max(acc, prev ? prev.acc : 0) };
    let xp = Math.round(st.score / 10) + stars * 10;
    const dBonus = stars >= 1 && dailyEx(st.instr).id === st.def.id && !dailyDone(st.instr);
    if (dBonus) { dailyState().done[st.instr] = 1; S.dailyN = (S.dailyN || 0) + 1; xp += DAILY_XP; }
    S.xp += xp; S.last[st.instr] = st.def.id;
    this.addTime(st);
    const def = st.def, instr = st.instr;
    this.stop(true);
    if (stars >= 1) haptic(40);
    const all = M.allExercises(instr), idx = all.findIndex(x => x.id === def.id), nxt = all[idx + 1];
    const msg = stars === 3 ? 'Fantastisk!' : stars === 2 ? 'Rigtig godt!' : stars === 1 ? 'Godt gået!' : 'Øvelse gør mester';
    openSheet(`<div style="text-align:center"><div class="hand" style="font-size:44px;line-height:1">${msg}</div>
      <div style="display:flex;justify-content:center;gap:6px;margin:12px 0 4px">${[0,1,2].map(i => `<span style="width:52px;height:52px;display:inline-block;transform:rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? -8 : 0}px)">${I.star(i < stars ? '#f3d867' : '#3a3630')}</span>`).join('')}</div>
      ${capped ? '<div class="mut small">Spil i 100 % tempo uden "Vent på mig" for 3 stjerner</div>' : ''}
      ${dBonus ? `<div id="dBonus" style="display:inline-block;margin-top:8px;padding:5px 12px;border-radius:999px;background:var(--pink);color:var(--pi);font-weight:700;font-size:14px">Dagens øvelse klaret · +${DAILY_XP} XP</div>` : ''}
      </div>
      <div class="grid2" style="margin:18px 0 6px">
        <div class="postit tilt-l" style="background:var(--yellow)"><div class="ps">Point</div><div class="pt" style="font-size:36px">${st.score}</div><div class="ps">${isBest && prev ? 'Ny rekord!' : '+' + xp + ' XP'}</div></div>
        <div class="postit tilt-r" style="background:var(--green)"><div class="ps">Ramt</div><div class="pt" style="font-size:36px">${Math.round(acc * 100)} %</div><div class="ps">${st.hits}/${total}</div></div>
      </div>
      <div class="row mut small" style="justify-content:center;gap:16px;margin:10px 0 16px"><span>Perfekt ${st.perfect}</span><span>Godt ${st.good}</span><span>OK ${st.ok}</span><span>Misset ${st.miss}</span><span>Bedste serie ${st.bestCombo}</span></div>
      <div class="row"><button class="btn" style="flex:1" id="rA">${I.restart}Igen</button>${nxt ? `<button class="btn pri" style="flex:1.4" id="rN">Næste ${I.play}</button>` : `<button class="btn pri" style="flex:1.4" id="rD">Færdig</button>`}</div>`, () => render());
    $('#rA').onclick = () => { sheetClose = null; closeSheet(); Game.start(def, {}); };
    if (nxt) $('#rN').onclick = () => { sheetClose = null; closeSheet(); render(); openPre(nxt); };
    if ($('#rD')) $('#rD').onclick = closeSheet;
  },

  // ---------- Tegning ----------
  draw() {
    const st = this.st; if (!st) return;
    const d = this.dpr, W = cv.width, H = cv.height, c = g2;
    c.clearRect(0, 0, W, H);
    const ins = M.INSTR[st.instr];
    const pxB = 92 * d * Math.max(0.8, Math.min(1.4, st.spb / 0.6)) ; // pixels pr. taktslag
    const nowX = W * 0.24, beat = st.beat;
    const X = b => nowX + (b - beat) * pxB;
    // takt-linjer
    c.lineWidth = 1 * d;
    for (let b = Math.floor(beat - nowX / pxB); b < beat + (W - nowX) / pxB + 1; b++) {
      if (b < 0 || b > st.built.beats) continue;
      const x = X(b); c.strokeStyle = b % st.ts === 0 ? 'rgba(239,234,224,.16)' : 'rgba(239,234,224,.05)';
      c.beginPath(); c.moveTo(x, 10 * d); c.lineTo(x, H - 10 * d); c.stroke();
    }
    if (ins.view === 'tab') this.drawTab(c, W, H, d, X, nowX, pxB);
    else this.drawRoll(c, W, H, d, X, nowX, pxB);
    this.updateNext();
    // nu-linje
    c.strokeStyle = 'rgba(243,216,103,.9)'; c.lineWidth = 3 * d; c.beginPath(); c.moveTo(nowX, 6 * d); c.lineTo(nowX, H - 6 * d); c.stroke();
    // indtælling
    if (beat < st.firstBeat) {
      const n = Math.ceil(st.firstBeat - beat);
      if (n >= 1 && n <= st.ts) { c.fillStyle = 'rgba(239,234,224,.92)'; c.font = `700 ${110 * d}px Caveat`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), W * 0.62, H / 2); }
    }
    if (st.waiting) { c.fillStyle = 'rgba(243,216,103,.95)'; c.font = `700 ${24 * d}px Caveat`; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('Venter på dig…', nowX + 10 * d, 10 * d); }
    // HUD
    $('#pProg').style.width = Math.max(0, Math.min(100, beat / st.built.beats * 100)) + '%';
    $('#pScore').textContent = st.score;
    if (!st.listen) {
      $('#heard').textContent = st.built.kind === 'chords' ? (st.rms > st.gate ? 'Hører lyd' : '–') : (st.heard != null ? M.name(Math.round(st.heard)) : '–');
      $('#meter i').style.height = Math.min(100, Math.sqrt(st.rms) * 260) + '%';
      $('#meter i').style.background = st.rms > st.gate ? 'var(--ok)' : 'var(--mut2)';
      const age = performance.now() - st.fbT;
      $('#fb').textContent = age < 1300 ? st.fbText : ''; $('#fb').style.color = st.fbColor; $('#fb').style.opacity = age < 1300 ? Math.min(1, (1300 - age) / 300) : 0;
    }
  },
  updateNext() {
    const st = this.st, box = $('#nextBox'); if (!st) return;
    const room = (this.areaTop || 0) / this.dpr;
    const i = st.ev.findIndex(e => e.state === 'pending' && e.b + e.d > st.beat - 0.01);
    const key = i + ':' + Math.round(room / 20);
    if (key === this.nextKey) return; this.nextKey = key;
    if (i < 0 || room < 90) { box.innerHTML = ''; return; }
    box.style.height = Math.max(0, room - 8) + 'px';
    const e = st.ev[i], ins = M.INSTR[st.instr];
    if (e.c) {
      const instr = st.instr === 'voice' ? 'piano' : st.instr;
      const upcoming = []; for (let j = i; j < st.ev.length && upcoming.length < 3; j++) if (!upcoming.includes(st.ev[j].c)) upcoming.push(st.ev[j].c);
      const sz = Math.min(150, room - 30);
      box.innerHTML = `<div class="nb-l">${st.beat < e.b ? 'Næste' : 'Nu'}</div><div style="display:flex;align-items:flex-end;gap:14px">` +
        upcoming.map((c, k) => `<div style="opacity:${k ? 0.45 : 1};color:var(--ink)">${chordSvg(c, instr, k ? sz * 0.62 : sz)}</div>`).join('') + '</div>';
    } else {
      const nxt = st.ev.slice(i, i + 4).filter(x => !x.c);
      const sName = si => (ins.strings.length === 6 && si === 5) ? 'e' : M.name(ins.strings[si]).replace(/-?\d+$/, '');
      const where = x => ins.view === 'tab' ? `${x.f === 0 ? 'løs' : x.f + '. bånd'} · ${sName(x.s)}-streng` : '';
      box.innerHTML = `<div class="nb-l">${st.beat < e.b ? 'Næste' : 'Nu'}</div>
        <div style="display:flex;align-items:baseline;gap:16px"><span class="hand" style="font-size:${Math.min(72, room * 0.45)}px;line-height:1">${M.name(e.m).replace(/-?\d+$/, '')}</span>
        <span class="mut" style="font-size:15px">${esc(where(e))}</span></div>
        <div class="mut small" style="margin-top:4px">${nxt.slice(1).map(x => M.name(x.m).replace(/-?\d+$/, '')).join(' · ')}</div>`;
    }
  },
  noteColor(e, base) {
    if (e.state === 'hit' && e.rating !== 'listen') return e.rating === 'perfekt' ? '#8fd694' : e.rating === 'god' ? '#c9e58f' : '#f3d867';
    if (e.state === 'miss') return '#5a544b';
    return base;
  },
  drawTab(c, W, H, d, X, nowX, pxB) {
    const st = this.st, ins = M.INSTR[st.instr], ns = ins.strings.length;
    const gap = Math.min(58 * d, (H - 60 * d) / (ns - 1)), bot = H - 30 * d, top = bot - gap * (ns - 1);
    this.areaTop = top - 40 * d;
    const laneY = s => bot - s * gap; // streng 0 (dybeste) nederst
    const cols = ns === 6 ? M.STRING_COLORS : ['#f3c08c','#b7e0a6','#accbef','#f1b3c4'];
    for (let s = 0; s < ns; s++) {
      const y = laneY(s);
      c.strokeStyle = 'rgba(239,234,224,.38)'; c.lineWidth = (1 + (ns - 1 - s) * 0.45) * d;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      c.fillStyle = cols[s]; c.font = `700 ${13 * d}px system-ui`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(M.name(ins.strings[s]).replace(/-?\d+$/, '').replace(/^E$/, s === ns - 1 && ns === 6 ? 'e' : 'E'), 6 * d, y - 11 * d);
    }
    const R = Math.min(17 * d, gap * 0.42);
    for (const e of st.ev) {
      const x = X(e.b), x2 = X(e.b + e.d); if (x2 < -40 * d || x > W + 40 * d) continue;
      const pop = e.hitT ? Math.max(0, 1 - (performance.now() - e.hitT) / 300) : 0;
      if (e.c) {
        const col = this.noteColor(e, '#efeae0');
        c.fillStyle = col; c.globalAlpha = 0.18; c.fillRect(x, top - 14 * d, Math.max(0, x2 - x - 6 * d), bot - top + 28 * d); c.globalAlpha = 1;
        c.fillStyle = col; this.rr(c, x - 9 * d, top - 14 * d, 18 * d, bot - top + 28 * d, 8 * d); c.fill();
        c.fillStyle = e.state === 'miss' ? '#a39d8f' : '#efeae0'; c.font = `700 ${28 * d * (1 + pop * 0.3)}px Caveat`; c.textAlign = 'left'; c.textBaseline = 'bottom';
        c.fillText(M.chordLabel(e.c), x + 14 * d, top - 2 * d);
        continue;
      }
      const y = laneY(e.s), col = this.noteColor(e, cols[e.s]);
      if (e.d > 1.05) { c.fillStyle = col; c.globalAlpha = 0.28; this.rr(c, x, y - R * 0.45, Math.max(0, x2 - x - 8 * d), R * 0.9, R * 0.45); c.fill(); c.globalAlpha = 1; }
      const rr = R * (1 + pop * 0.35);
      c.fillStyle = col; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill();
      if (e.state === 'pending') { c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2 * d; c.stroke(); }
      c.fillStyle = '#1d1b17'; c.font = `700 ${R * 1.05}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(e.f), x, y + 1 * d);
    }
  },
  drawRoll(c, W, H, d, X, nowX, pxB) {
    const st = this.st, ins = M.INSTR[st.instr];
    const ns = st.ev.filter(e => !e.c).map(e => e.m);
    const chordNotes = st.ev.filter(e => e.c).flatMap(e => M.pianoChordNotes(e.c));
    const all = ns.concat(chordNotes); const lo = Math.min(...all) - 2, hi = Math.max(...all) + 2;
    const rowH = Math.min(30 * d, (H - 40 * d) / (hi - lo + 1)), bot = H - 18 * d, top = bot - rowH * (hi - lo + 1);
    this.areaTop = top - 34 * d;
    const Y = m => bot - (m - lo + 0.5) * rowH;
    for (let m = lo; m <= hi; m++) {
      const blk = [1,3,6,8,10].includes(((m % 12) + 12) % 12);
      c.fillStyle = blk ? 'rgba(0,0,0,.28)' : 'rgba(239,234,224,.025)'; c.fillRect(0, Y(m) - rowH / 2, W, rowH);
      if (!blk && rowH > 9 * d) { c.fillStyle = 'rgba(239,234,224,.4)'; c.font = `600 ${Math.min(12 * d, rowH * 0.7)}px system-ui`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(M.name(m), 6 * d, Y(m)); }
    }
    const colOf = m => ['#f3d867','#f3c08c','#f1b3c4','#cbbaf0','#accbef','#b7e0a6'][((m % 12) + 12) % 12 % 6];
    for (const e of st.ev) {
      const x = X(e.b), x2 = X(e.b + e.d); if (x2 < 0 || x > W) continue;
      const notes = e.c ? M.pianoChordNotes(e.c) : [e.m];
      for (const m of notes) {
        const col = this.noteColor(e, colOf(m));
        c.fillStyle = col; this.rr(c, x, Y(m) - rowH * 0.42, Math.max(6 * d, x2 - x - 4 * d), rowH * 0.84, Math.min(8 * d, rowH * 0.4)); c.fill();
        if (rowH > 13 * d && !e.c) { c.fillStyle = '#1d1b17'; c.font = `700 ${Math.min(13 * d, rowH * 0.6)}px system-ui`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(M.name(m).replace(/-?\d+$/, ''), x + 5 * d, Y(m)); }
      }
      if (e.c) { c.fillStyle = '#efeae0'; c.font = `700 ${26 * d}px Caveat`; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText(M.chordLabel(e.c), x + 2 * d, Y(Math.max(...notes)) - rowH * 0.5); }
    }
    // spor af det man synger/spiller
    if (!st.listen && st.trail.length) {
      c.strokeStyle = '#efeae0'; c.lineWidth = 3 * d; c.lineJoin = 'round'; c.beginPath();
      let prev = null;
      for (const p of st.trail) {
        if (p.b < st.beat - (nowX / pxB)) continue;
        let m = p.p;
        if (ins.pcOnly || ins.octaveOk) { const tgt = (st.ev.find(e => !e.c && e.b + e.d >= p.b) || st.ev[st.ev.length - 1]); if (tgt && !tgt.c) { while (m - tgt.m > 6) m -= 12; while (tgt.m - m > 6) m += 12; } }
        const x = X(p.b), y = Y(m);
        if (prev && (p.b - prev.b > 0.25 || Math.abs(m - prev.m) > 3)) { c.stroke(); c.beginPath(); c.moveTo(x, y); } else if (!prev) c.moveTo(x, y); else c.lineTo(x, y);
        prev = { b: p.b, m };
      }
      c.stroke();
      if (st.heard != null && prev) { c.fillStyle = '#efeae0'; c.beginPath(); c.arc(nowX, Y(prev.m), 6 * d, 0, Math.PI * 2); c.fill(); }
    }
  },
  rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); },
};
window.addEventListener('resize', () => { if (Game.st) Game.resize(); });
// I baggrunden: pause spil og slip mikrofonen; genopret når appen kommer frem igen
let micWasOn = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (Game.st && !Game.st.listen) Game.pause(); else if (Game.st) Game.stop();
    if (A.micOn()) { micWasOn = true; A.stopMic(); }
    if (A.metro.on) { A.metroStop(); keepAwake(false); if (tab === 'tool') render(); }
  } else if (micWasOn) {
    micWasOn = false;
    if (Game.st) return; // genoptages via Fortsæt
    if ($('#sheetWrap').classList.contains('show')) closeSheet();
    render();
  }
});

function keepAwake(on) { try { NATIVE && NATIVE.keepAwake && NATIVE.keepAwake(!!on); } catch (e) {} }

// ---------------- Onboarding ----------------
function onboarding() {
  const ov = document.createElement('div'); ov.className = 'ob'; document.body.appendChild(ov);
  let step = 0, alive = true, raf = 0;
  const finish = () => { alive = false; cancelAnimationFrame(raf); A.stopMic(); S.onboarded = true; save(); ov.remove(); render(); };
  const show = () => {
    cancelAnimationFrame(raf);
    if (step === 0) {
      ov.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center">
        <div class="postit tape tilt-l" style="background:var(--orange);align-self:flex-start;padding:26px 26px 22px;margin-bottom:28px"><div class="hand" style="font-size:64px;line-height:.9">Takt.</div></div>
        <div class="serif" style="font-size:30px;font-weight:600;line-height:1.15">Lær at spille – appen lytter med</div>
        <p class="mut" style="font-size:16px">Spil på din rigtige guitar, elguitar, bas, ukulele, klaver eller stemme. Takt hører hver tone og akkord og giver dig feedback med det samme.</p></div>
        <button class="btn pri block" id="o1">Kom i gang</button>`;
      $('#o1').onclick = () => { step = 1; show(); };
    } else if (step === 1) {
      ov.innerHTML = `<div class="serif" style="font-size:28px;font-weight:600;margin-bottom:6px">Hvad vil du spille?</div><p class="mut" style="margin-top:0">Du kan altid skifte senere.</p>
        <div class="grid2" style="margin-top:8px">${Object.values(M.INSTR).map((x, i) => `<button class="postit ${i % 2 ? 'tilt-r' : 'tilt-l'}" data-i="${x.id}" style="background:var(--${['yellow','orange','pink','green','blue','lilac'][i]});text-align:left"><div style="width:44px;height:44px">${I.instr[x.id]}</div><div class="pt" style="margin-top:6px">${x.name}</div></button>`).join('')}</div>`;
      ov.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { S.instr = b.dataset.i; save(); step = 2; show(); });
    } else if (step === 2) {
      ov.innerHTML = `<div class="serif" style="font-size:28px;font-weight:600;margin-bottom:6px">Dagligt mål</div><p class="mut" style="margin-top:0">Lidt hver dag slår meget en gang imellem.</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">${[[5,'Afslappet'],[10,'Fast vane'],[15,'Seriøs'],[20,'Ambitiøs'],[30,'Fuld fart']].map(([m, l]) => `<button class="card" data-g="${m}" style="padding:16px;text-align:left;display:flex;align-items:center"><span class="serif" style="font-size:18px;font-weight:600;flex:1">${l}</span><span class="mut">${m} min/dag</span></button>`).join('')}</div>`;
      ov.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { S.goal = +b.dataset.g; save(); step = 3; show(); });
    } else {
      ov.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">
        <div style="width:64px;height:64px;margin:0 auto 12px;color:var(--yellow)">${I.mic}</div>
        <div class="serif" style="font-size:26px;font-weight:600">Lad Takt høre dig</div>
        <p class="mut">Giv adgang til mikrofonen og ${S.instr === 'voice' ? 'syng' : 'spil'} en tone. Lyden bliver på telefonen.${M.INSTR[S.instr].electric ? ' Har du et USB-lydkort eller en iRig, så sæt guitaren i nu – ellers læg telefonen ved forstærkeren.' : ''}</p>
        <div class="levelbar" style="margin:14px 0"><i id="oL"></i></div>
        <div class="hand" style="font-size:56px;min-height:64px" id="oN"></div></div>
        <button class="btn pri block" id="o3">Giv adgang til mikrofonen</button>
        <button class="btn block" id="o4" style="margin-top:10px;background:none;border:0;color:var(--mut)">Spring over</button>`;
      $('#o4').onclick = finish;
      $('#o3').onclick = async () => {
        if (!(await needMic())) return;
        $('#o3').textContent = 'Fortsæt'; $('#o3').onclick = finish;
        let heardOk = false;
        const loop = () => { if (!alive) return; raf = requestAnimationFrame(loop);
          const r = A.analyze(analyzeOpts(S.instr, false)); if (!r) return;
          $('#oL').style.width = Math.min(100, Math.sqrt(r.rms) * 260) + '%';
          if (r.pitch != null) { $('#oN').textContent = M.name(Math.round(r.pitch)) + ' ✓'; if (!heardOk) { heardOk = true; haptic(30); } }
        }; loop();
      };
    }
  };
  show();
}

// ---------------- Native bro ----------------
window.taktBack = () => {
  if ($('#pauseL').classList.contains('show')) { Game.resume(); return true; }
  if (Game.st) { Game.st.listen ? Game.stop() : Game.pause(); return true; }
  if ($('#sheetWrap').classList.contains('show')) { closeSheet(); return true; }
  if (document.querySelector('.ob')) return false;
  if (tab !== 'ov') { tab = 'ov'; render(); return true; }
  return false;
};
window.taktOpen = (action, arg) => {
  if (!S.onboarded) return;
  if (Game.st) Game.stop(true);
  closeSheet();
  if (action === 'tuner') { tab = 'tool'; toolSeg = 'tuner'; render(); }
  else if (action === 'daily') { tab = 'ov'; render(); openPre(dailyEx()); }
  else if (action === 'next') { tab = 'ov'; render(); const e = (arg && M.findEx(S.instr, arg)) || nextExercise(); openPre(e); }
  else { tab = 'ov'; render(); }
};

// ---------------- Start ----------------
(function boot() {
  // ny dag → widgets skal vide det
  const upgraded = S.onboarded && S.ver !== VERSION;
  if (!S.onboarded) { render(); onboarding(); }
  else render();
  if (S.ver !== VERSION) { S.ver = VERSION; save(); }
  if (upgraded) showNews();
  pushWidgets();
  try { const a = NATIVE && NATIVE.consumeLaunch ? NATIVE.consumeLaunch() : ''; if (a) { const [act, arg] = a.split(':'); setTimeout(() => window.taktOpen(act, arg), 50); } } catch (e) {}
})();
