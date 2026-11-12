/* Gambit – brugerflade */
(function () {
  'use strict';
  const E = createEngine();
  const W = E.WHITE, B = E.BLACK;
  const $ = id => document.getElementById(id);
  const LEVELS = { 1: 'Begynder', 2: 'Let', 3: 'Mellem', 4: 'Svær', 5: 'Ekspert' };
  const STORE = 'gambit.v1';
  const CODE = ' pnbrqk';
  const VAL = [0, 1, 3, 3, 5, 9, 0];
  const VERSION = '1.1.0';
  const TC = { 5: [5, 0], 10: [10, 0], 15: [15, 10] };          // minutter, tillæg i sekunder
  const THEMES = { salvie: ['#EFE5CF', '#8FAB86'], blaa: ['#E8EDF2', '#7C9CBF'], trae: ['#F0D9B5', '#B58863'], graa: ['#E9E6DF', '#9A968C'] };
  const PZ = typeof PUZZLES !== 'undefined' ? PUZZLES : { m1: [], m2: [] };
  const colorKey = c => c === W ? 'w' : 'b';

  function defaults() {
    return { mode: 'cpu', level: 3, colorPref: 'w', human: W, flipped: false, moves: [], seed: rndSeed(),
      recorded: false, started: false, stats: {}, tc: 0, clock: null, timeout: '', resigned: '', sound: true, theme: 'salvie',
      puz: { m1: [], m2: [] }, review: null };
  }
  function rndSeed() { return (Math.random() * 0x7fffffff) | 0; }
  function load() { try { const s = JSON.parse(localStorage.getItem(STORE)); return s && Array.isArray(s.moves) ? Object.assign(defaults(), s) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* ingen lagring */ } }

  let S = load() || defaults();
  let pos, sans = [], legal = [], sel = -1, lastMove = 0, hint = 0, over = null, thinking = false;
  let worker = null, reqId = 0, promoResolve = null, drag = null;
  // visning: dp er stillingen på brættet (parti, gennemgang eller opgave)
  let dp, dLast = 0, view = -1, vpos = null, vlast = 0, puz = null, analysing = false;
  if (!S.puz || !S.puz.m1) S.puz = { m1: [], m2: [] };
  const ap = () => puz ? puz.pos : pos;              // stillingen der spilles i
  const flip = () => puz ? puz.side === B : S.flipped;

  // ---------- Motor i baggrunden ----------
  function makeWorker() {
    try {
      const src = createEngine.toString() + `
const E = createEngine();
onmessage = function (e) {
  const d = e.data, p = new E.Position();
  for (const u of d.moves) { const m = p.parseUci(u); if (!m) break; p.make(m); }
  const r = E.think(p, d);
  postMessage({ id: d.id, uci: r.move ? p.uci(r.move) : null, score: r.score, depth: r.depth });
};`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onerror = () => { worker = null; };
      return w;
    } catch (e) { return null; }
  }
  worker = makeWorker();

  function askEngine(opts, cb) {
    const id = ++reqId;
    const msg = Object.assign({ id, moves: S.moves.slice(), seed: S.seed }, opts);
    const started = Date.now();
    const done = (uci, score) => {
      if (id !== reqId) return;
      const wait = Math.max(0, (opts.minDelay || 0) - (Date.now() - started));
      setTimeout(() => { if (id === reqId) cb(uci, score || 0); }, wait);
    };
    if (worker) {
      worker.onmessage = e => { if (e.data.id === id) done(e.data.uci, e.data.score); };
      worker.postMessage(msg);
    } else {
      setTimeout(() => {
        const p = new E.Position();
        for (const u of msg.moves) p.make(p.parseUci(u));
        const r = E.think(p, msg);
        done(r.move ? p.uci(r.move) : null, r.score);
      }, 40);
    }
  }
  function cancelEngine() {
    reqId++;
    if ((thinking || analysing) && worker) { worker.terminate(); worker = makeWorker(); }
    thinking = false; analysing = false;
  }

  // ---------- Lyd ----------
  let actx = null;
  function sfx(kind) {
    if (!S.sound) return;
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime + 0.005;
      const knock = (at, f, vol, len) => {            // kort "klak" af træ
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.8, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.03);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g); g.connect(actx.destination); o.start(at); o.stop(at + len + 0.02);
      };
      const tone = (at, f, vol, len) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g); g.connect(actx.destination); o.start(at); o.stop(at + len + 0.02);
      };
      if (kind === 'move') knock(t, 240, 0.5, 0.09);
      else if (kind === 'capture') { knock(t, 180, 0.6, 0.1); knock(t + 0.055, 300, 0.45, 0.08); }
      else if (kind === 'check') { knock(t, 240, 0.5, 0.09); tone(t + 0.05, 880, 0.16, 0.22); }
      else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, f, 0.2, 0.4));
      else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(t + i * 0.16, f, 0.2, 0.45));
      else if (kind === 'draw') [440, 440].forEach((f, i) => tone(t + i * 0.2, f, 0.16, 0.3));
      else if (kind === 'bad') { tone(t, 196, 0.2, 0.16); tone(t + 0.1, 165, 0.2, 0.22); }
      else if (kind === 'low') tone(t, 660, 0.12, 0.12);
    } catch (e) { /* ingen lyd */ }
  }

  // ---------- Spiltilstand ----------
  function rebuild() {
    pos = new E.Position();
    sans = []; lastMove = 0;
    const ok = [];
    for (const u of S.moves) {
      const m = pos.parseUci(u);
      if (!m) break;
      const l = pos.legalMoves();
      sans.push(pos.san(m, l));
      pos.make(m); lastMove = m; ok.push(u);
    }
    S.moves = ok;
    legal = pos.legalMoves();
    over = calcOver();
    sel = -1; hint = 0;
  }
  function calcOver() {
    return pos.result()
      || (S.timeout ? { over: true, winner: S.timeout === 'w' ? B : W, reason: 'time' } : null)
      || (S.resigned ? { over: true, winner: S.resigned === 'w' ? B : W, reason: 'resign' } : null);
  }
  const humanTurn = () => puz ? !puz.busy && !puz.done
    : view < 0 && !over && !thinking && !analysing && (S.mode === 'pvp' || pos.side === S.human);

  // ---------- Bræt ----------
  const squaresEl = $('squares'), piecesEl = $('pieces'), arrowsEl = $('arrows'), boardEl = $('board');
  const cells = [];
  for (let i = 0; i < 64; i++) { const d = document.createElement('div'); d.className = 'sq'; squaresEl.appendChild(d); cells.push(d); }

  const toCell = sq => { const r = sq >> 4, f = sq & 7; return flip() ? (7 - r) * 8 + (7 - f) : r * 8 + f; };
  const fromCell = i => { const r = i >> 3, f = i & 7; return flip() ? (7 - r) * 16 + (7 - f) : r * 16 + f; };
  const cellXY = sq => { const c = toCell(sq); return [c & 7, c >> 3]; };
  const pieceClass = p => (p & 8 ? 'b' : 'w') + CODE[p & 7];

  function sqAtPoint(x, y) {
    const r = boardEl.getBoundingClientRect();
    const cx = Math.floor((x - r.left) / r.width * 8), cy = Math.floor((y - r.top) / r.height * 8);
    if (cx < 0 || cy < 0 || cx > 7 || cy > 7) return -1;
    return fromCell(cy * 8 + cx);
  }

  function renderSquares() {
    const targets = sel >= 0 ? legal.filter(m => (m & 127) === sel).map(m => (m >> 7) & 127) : [];
    const checkSq = dp.inCheck() ? dp.kings[dp.side >> 3] : -1;
    const lf = dLast ? dLast & 127 : -1, lt = dLast ? (dLast >> 7) & 127 : -1;
    for (let i = 0; i < 64; i++) {
      const sq = fromCell(i), r = sq >> 4, f = sq & 7, el = cells[i];
      let cls = 'sq' + ((r + f) & 1 ? ' d' : '');
      if (sq === lf || sq === lt) cls += ' last';
      if (sq === sel) cls += ' sel';
      if (sq === checkSq) cls += ' check';
      el.className = cls;
      let html = '';
      if ((i & 7) === 0) html += `<span class="coord r">${8 - r}</span>`;
      if ((i >> 3) === 7) html += `<span class="coord f">${'abcdefgh'[f]}</span>`;
      if (targets.includes(sq)) html += dp.b[sq] || (dp.ep === sq && (dp.b[sel] & 7) === 1) ? '<span class="ring"></span>' : '<span class="dot"></span>';
      el.innerHTML = html;
    }
  }

  function renderPieces(anim) {
    piecesEl.textContent = '';
    const moves = [];
    if (anim) {
      const from = anim & 127, to = (anim >> 7) & 127;
      moves.push([from, to]);
      if ((anim >> 17) === E.F_CASTLE) {
        const map = { 118: [119, 117], 114: [112, 115], 6: [7, 5], 2: [0, 3] };
        moves.push(map[to]);
      }
    }
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = dp.b[sq];
      if (!p) continue;
      const el = document.createElement('div');
      el.className = 'pc ' + pieceClass(p);
      el.dataset.sq = sq;
      const [x, y] = cellXY(sq);
      const mv = moves.find(m => m[1] === sq);
      if (mv) {
        const [fx, fy] = cellXY(mv[0]);
        el.style.transform = `translate(${fx * 100}%, ${fy * 100}%)`;
        piecesEl.appendChild(el);
        el.getBoundingClientRect();
        el.classList.add('anim');
        el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
      } else {
        el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
        piecesEl.appendChild(el);
      }
    }
  }

  function renderArrow() {
    if (!hint) { arrowsEl.innerHTML = ''; return; }
    const [x1, y1] = cellXY(hint & 127), [x2, y2] = cellXY((hint >> 7) & 127);
    const ax = x1 + .5, ay = y1 + .5, bx = x2 + .5, by = y2 + .5;
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    const ex = bx - ux * .32, ey = by - uy * .32, px = -uy, py = ux;
    arrowsEl.innerHTML =
      `<line x1="${ax + ux * .2}" y1="${ay + uy * .2}" x2="${ex}" y2="${ey}" stroke="#2B4BD8" stroke-opacity=".78" stroke-width=".17" stroke-linecap="round"/>` +
      `<polygon points="${bx},${by} ${ex + px * .26},${ey + py * .26} ${ex - px * .26},${ey - py * .26}" fill="#2B4BD8" fill-opacity=".78"/>`;
  }

  // ---------- Paneler ----------
  function capturedBy(color) {
    // brikker af modsat farve, som mangler på brættet
    const them = color ^ 8, have = [0, 0, 0, 0, 0, 0, 0], start = [0, 8, 2, 2, 2, 1, 1];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = dp.b[sq]; if (p && (p & 8) === them) have[p & 7]++;
    }
    const out = [];
    for (let t = 1; t <= 5; t++) for (let k = 0; k < Math.max(0, start[t] - have[t]); k++) out.push(t);
    return out;
  }
  function material(color) {
    let s = 0;
    for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const p = dp.b[sq]; if (p && (p & 8) === color) s += VAL[p & 7]; }
    return s;
  }
  const fmtClock = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function renderClocks() {
    const bottom = flip() ? B : W, show = !!S.clock && !puz;
    for (const [id, color] of [['pBot', bottom], ['pTop', bottom ^ 8]]) {
      const c = $(id).querySelector('.clock'); c.hidden = !show; if (!show) continue;
      const ms = S.clock[colorKey(color)];
      c.textContent = fmtClock(ms);
      c.classList.toggle('run', !over && S.moves.length > 0 && pos.side === color);
      c.classList.toggle('low', ms < 20000);
    }
  }
  function renderPlayers() {
    const bottom = flip() ? B : W;
    const adv = material(W) - material(B);
    for (const [id, color] of [['pBot', bottom], ['pTop', bottom ^ 8]]) {
      const el = $(id);
      let name;
      if (puz) name = color === puz.side ? 'Dig · ' + (color === W ? 'hvid' : 'sort') : 'Modstander';
      else if (S.mode === 'cpu') name = color === S.human ? 'Dig' : 'Computer · ' + LEVELS[S.level];
      else name = color === W ? 'Hvid' : 'Sort';
      el.querySelector('.pname').textContent = name;
      el.querySelector('.avatar .pc').className = 'pc ' + (color === W ? 'wk' : 'bk');
      const caps = capturedBy(color).map(t => `<span class="pc ${color === W ? 'b' : 'w'}${CODE[t]}"></span>`).join('');
      const a = color === W ? adv : -adv;
      el.querySelector('.caps').innerHTML = caps + (a > 0 ? `<span class="adv">+${a}</span>` : '');
      el.classList.toggle('turn', puz ? !puz.done && dp.side === color : view < 0 && !over && pos.side === color);
      el.classList.toggle('thinking', !puz && view < 0 && thinking && pos.side === color);
    }
    $('modeLabel').textContent = puz ? `Opgave ${puz.idx + 1} af ${PZ[puz.set].length} · mat i ${puz.n}`
      : S.mode === 'cpu' ? 'Mod computer · ' + LEVELS[S.level] : '2 spillere';
    renderClocks();
  }
  function statusText() {
    if (puz) {
      if (puz.done) return 'Løst! ✓';
      if (puz.msg) return puz.msg;
      return (puz.side === W ? 'Hvid' : 'Sort') + ' trækker – mat i ' + puz.left;
    }
    if (over) {
      const who = c => S.mode === 'cpu' ? (c === S.human ? 'du' : 'computeren') : (c === W ? 'hvid' : 'sort');
      if (over.reason === 'time') return 'Tiden er gået – ' + who(over.winner) + ' vinder';
      if (over.reason === 'resign') return 'Opgivet – ' + who(over.winner) + ' vinder';
      if (over.reason === 'mate') {
        if (S.mode === 'cpu') return over.winner === S.human ? 'Skakmat – du vandt!' : 'Skakmat – computeren vandt';
        return 'Skakmat – ' + (over.winner === W ? 'hvid' : 'sort') + ' vinder';
      }
      return { stalemate: 'Pat – uafgjort', fifty: 'Remis – 50-træksreglen', repetition: 'Remis – gentagelse', material: 'Remis – for lidt materiale', resign: 'Opgivet' }[over.reason];
    }
    const chk = pos.inCheck() ? 'Skak! ' : '';
    if (S.mode === 'cpu') return thinking ? 'Computeren tænker…' : chk + (pos.side === S.human ? 'Din tur' : '');
    return chk + (pos.side === W ? 'Hvid' : 'Sort') + ' i trækket';
  }
  function renderStatus() {
    const st = $('status');
    if (analysing) return;
    st.textContent = statusText();
    st.classList.toggle('alert', puz ? puz.msg.startsWith('Ikke') : !over && pos.inCheck());
    st.hidden = view >= 0; $('nav').hidden = view < 0;
    if (view >= 0) renderNav();
  }
  // ---------- Gennemgang: blad i trækkene ----------
  function marks() {            // 0 = unøjagtighed, 1 = fejl, 2 = brøler
    const R = S.review, out = [];
    if (!R || R.n !== S.moves.length) return out;
    for (let i = 0; i < R.n; i++) {
      const before = R.sc[i], after = -R.sc[i + 1], loss = before - after;
      let q = -1;
      if (S.moves[i] !== R.best[i] && before > -800 && !(before > 800 && after > 450)) q = loss >= 300 ? 2 : loss >= 150 ? 1 : loss >= 80 ? 0 : -1;
      out.push(q);
    }
    return out;
  }
  const MARK = ['?!', '?', '??'], MARKNAME = ['Unøjagtighed', 'Fejl', 'Brøler'];
  function setView(i) {
    if (puz || analysing) return;
    view = Math.max(0, Math.min(S.moves.length, i));
    vpos = new E.Position(); vlast = 0;
    for (let k = 0; k < view; k++) { const m = vpos.parseUci(S.moves[k]); if (!m) break; vpos.make(m); vlast = m; }
    sel = -1; hint = 0;
    render();
  }
  function closeView() { if (view < 0) return; view = -1; render(); }
  function renderNav() {
    const N = S.moves.length, mk = marks();
    $('navFirst').disabled = $('navPrev').disabled = view <= 0; $('navNext').disabled = view >= N;
    let h = view === 0 ? 'Startstillingen' : `${Math.ceil(view / 2)}${view % 2 ? '.' : '…'} ${sans[view - 1]}`;
    let sub = `Træk ${view} af ${N}`;
    const q = view > 0 ? mk[view - 1] : -1;
    if (q >= 0) {
      h += MARK[q];
      const p = new E.Position(); for (let k = 0; k < view - 1; k++) p.make(p.parseUci(S.moves[k]));
      const b = p.parseUci(S.review.best[view - 1]);
      sub = MARKNAME[q] + (b ? ' – bedre var ' + p.san(b, p.legalMoves()) : '');
    }
    $('navText').innerHTML = h + `<small>${sub}</small>`;
  }
  function renderMoves() {
    const el = $('moves');
    if (!sans.length) { el.innerHTML = '<span class="empty">Ingen træk endnu</span>'; return; }
    let h = '';
    const mk = marks(), cur = view >= 0 ? view - 1 : sans.length - 1;
    sans.forEach((s, i) => {
      if (i % 2 === 0) h += `<span class="no">${i / 2 + 1}.</span>`;
      h += `<span class="mv${i === cur ? ' cur' : ''}" data-i="${i}">${s}${mk[i] >= 0 ? `<i class="q${mk[i]}">${MARK[mk[i]]}</i>` : ''}</span>`;
    });
    el.innerHTML = h;
    const c = el.querySelector('.cur');
    if (view >= 0 && c) el.scrollLeft = Math.max(0, c.offsetLeft - el.clientWidth / 2); else el.scrollLeft = el.scrollWidth;
  }
  $('moves').addEventListener('click', e => { const m = e.target.closest('.mv'); if (m && !puz) setView(+m.dataset.i + 1); });
  $('navFirst').onclick = () => setView(0);
  $('navPrev').onclick = () => setView(view - 1);
  $('navNext').onclick = () => setView(view + 1);
  $('navClose').onclick = closeView;
  function renderButtons() {
    $('btnUndo').disabled = !!S.clock || analysing || !S.moves.length || (S.mode === 'cpu' && !S.moves.some((_, i) => (i % 2 === 0 ? W : B) === S.human));
    $('btnHint').disabled = !humanTurn();
    document.querySelector('.actions:not(#pacts)').hidden = !!puz; $('pacts').hidden = !puz;
    if (puz) { $('pzHint').disabled = puz.done || puz.busy; $('moves').style.visibility = 'hidden'; } else $('moves').style.visibility = '';
  }
  function render(anim) {
    dp = puz ? puz.pos : view >= 0 ? vpos : pos;
    dLast = puz ? puz.last : view >= 0 ? vlast : lastMove;
    renderSquares(); renderPieces(anim); renderArrow(); renderPlayers(); renderStatus(); renderMoves(); renderButtons();
  }

  // ---------- Træk ----------
  function doMove(m, anim) {
    if (puz) { puzMove(m, anim); return; }
    const san = pos.san(m, legal), mover = pos.side;
    const cap = pos.b[(m >> 7) & 127] || (m >> 17) === E.F_EP;
    S.moves.push(pos.uci(m));
    pos.make(m);
    if (S.clock && S.moves.length > 1) S.clock[colorKey(mover)] += (S.clock.inc || 0) * 1000;
    lastTick = Date.now();
    sans.push(san); lastMove = m; sel = -1; hint = 0;
    legal = pos.legalMoves();
    over = calcOver();
    S.started = true; S.review = null;
    save();
    render(anim ? m : 0);
    if (over) finish();
    else { sfx(pos.inCheck() ? 'check' : cap ? 'capture' : 'move'); maybeComputer(); }
  }
  function maybeComputer() {
    if (puz || S.mode !== 'cpu' || over || pos.side === S.human) return;
    thinking = true;
    renderPlayers(); renderStatus(); renderButtons();
    const hurry = S.clock && S.clock[colorKey(pos.side)] < 20000;
    askEngine(hurry ? { level: S.level, time: 200, minDelay: 150 } : { level: S.level, minDelay: 450 }, uci => {
      thinking = false;
      const m = uci && pos.parseUci(uci);
      if (m) doMove(m, true); else render();
    });
  }
  function tryMove(from, to, anim) {
    const cands = legal.filter(m => (m & 127) === from && ((m >> 7) & 127) === to);
    if (!cands.length) return false;
    if (cands.length > 1) {
      askPromotion(ap().side).then(t => {
        if (!t) { sel = -1; render(); return; }
        doMove(cands.find(m => ((m >> 14) & 7) === t), false);
      });
      return true;
    }
    doMove(cands[0], anim);
    return true;
  }
  function askPromotion(color) {
    const box = $('promos');
    box.innerHTML = '';
    for (const t of [5, 4, 3, 2]) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="pc ${color === W ? 'w' : 'b'}${CODE[t]}"></span>`;
      b.onclick = () => close(t);
      box.appendChild(b);
    }
    $('promoScrim').hidden = false;
    return new Promise(res => { promoResolve = res; });
    function close(t) { $('promoScrim').hidden = true; const r = promoResolve; promoResolve = null; r && r(t); }
  }
  $('promoScrim').addEventListener('click', e => { if (e.target.id === 'promoScrim') { $('promoScrim').hidden = true; const r = promoResolve; promoResolve = null; r && r(0); } });

  function finish() {
    let title, text;
    const youWin = S.mode === 'cpu' && over.winner === S.human;
    sfx(over.winner === -1 ? 'draw' : S.mode === 'cpu' && !youWin ? 'lose' : 'win');
    if (over.reason === 'time' || over.reason === 'resign') {
      title = over.reason === 'time' ? 'Tiden er gået' : 'Opgivet';
      if (S.mode === 'cpu') text = youWin ? (over.reason === 'time' ? 'Computeren løb tør for tid. Du vinder partiet!' : 'Du vinder partiet.') : (over.reason === 'time' ? 'Din tid løb ud. Computeren vinder partiet.' : 'Du gav op. Tryk Gennemgå for at se, hvor det gik galt.');
      else text = (over.winner === W ? 'Hvid' : 'Sort') + ' vinder partiet.';
    } else if (over.reason === 'mate') {
      title = 'Skakmat!';
      if (S.mode === 'cpu') text = over.winner === S.human ? `Du vandt over computeren på niveau ${LEVELS[S.level].toLowerCase()}. Flot spillet!` : 'Computeren vandt denne gang. Prøv igen – eller skru ned for niveauet.';
      else text = (over.winner === W ? 'Hvid' : 'Sort') + ' vinder partiet.';
    } else {
      title = over.reason === 'stalemate' ? 'Pat' : 'Remis';
      text = { stalemate: 'Spilleren i trækket har ingen lovlige træk, men står ikke i skak. Partiet er uafgjort.',
        fifty: '50 træk i træk uden slag eller bondetræk. Partiet er uafgjort.',
        repetition: 'Den samme stilling er opstået tre gange. Partiet er uafgjort.',
        material: 'Ingen af jer har materiale nok til at sætte mat. Partiet er uafgjort.' }[over.reason];
    }
    if (S.mode === 'cpu' && !S.recorded) {
      const st = S.stats[S.level] || (S.stats[S.level] = { w: 0, d: 0, l: 0 });
      if (over.winner === -1) st.d++; else if (over.winner === S.human) st.w++; else st.l++;
      S.recorded = true; save();
    }
    $('endRev').hidden = S.moves.length < 2;
    $('endTitle').textContent = title;
    $('endText').textContent = text;
    setTimeout(() => { if (over) $('endScrim').hidden = false; }, 650);
  }

  // ---------- Berøring ----------
  boardEl.addEventListener('pointerdown', e => {
    if (!humanTurn()) return;
    const sq = sqAtPoint(e.clientX, e.clientY);
    if (sq < 0) return;
    const p = ap().b[sq];
    if (sel >= 0 && sq !== sel && legal.some(m => (m & 127) === sel && ((m >> 7) & 127) === sq)) {
      tryMove(sel, sq, true);
      return;
    }
    if (p && (p & 8) === ap().side) {
      const wasSel = sel === sq;
      sel = sq; hint = 0;
      renderSquares(); renderArrow();
      const el = piecesEl.querySelector(`.pc[data-sq="${sq}"]`);
      const r = boardEl.getBoundingClientRect();
      drag = { sq, el, x0: e.clientX, y0: e.clientY, moving: false, wasSel, size: r.width / 8, rect: r, hover: -1 };
      boardEl.setPointerCapture(e.pointerId);
    } else {
      sel = -1; renderSquares();
    }
  });
  boardEl.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moving && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    drag.moving = true;
    const { el, rect, size } = drag;
    if (el) {
      el.classList.remove('anim');
      el.classList.add('drag');
      el.style.transform = `translate(${e.clientX - rect.left - size / 2}px, ${e.clientY - rect.top - size * .75}px) scale(1.12)`;
    }
    const sq = sqAtPoint(e.clientX, e.clientY - size * .25);
    if (sq !== drag.hover) {
      if (drag.hover >= 0) cells[toCell(drag.hover)].classList.remove('hover');
      drag.hover = sq;
      if (sq >= 0 && sq !== drag.sq) cells[toCell(sq)].classList.add('hover');
    }
  });
  function endDrag(e, cancel) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.hover >= 0) cells[toCell(d.hover)].classList.remove('hover');
    if (d.moving) {
      const sq = cancel ? -1 : sqAtPoint(e.clientX, e.clientY - d.size * .25);
      if (sq >= 0 && sq !== d.sq && tryMove(d.sq, sq, false)) return;
      renderPieces(0); renderSquares();
    } else if (d.wasSel) {
      sel = -1; renderSquares();
    }
  }
  boardEl.addEventListener('pointerup', e => endDrag(e, false));
  boardEl.addEventListener('pointercancel', e => endDrag(e, true));

  // ---------- Knapper ----------
  $('btnFlip').onclick = () => { S.flipped = !S.flipped; save(); render(); };
  $('btnUndo').onclick = () => {
    if (!S.moves.length) return;
    cancelEngine(); view = -1;
    S.resigned = ''; S.timeout = ''; S.review = null; S.recorded = false;
    $('endScrim').hidden = true;
    if (S.mode === 'cpu') {
      do S.moves.pop(); while (S.moves.length && (S.moves.length % 2 === 0 ? W : B) !== S.human);
    } else S.moves.pop();
    save(); rebuild(); render();
    maybeComputer();
  };
  $('btnHint').onclick = () => {
    if (!humanTurn()) return;
    toast('Tænker over et godt træk…');
    const btn = $('btnHint'); btn.disabled = true;
    const before = S.moves.length;
    askEngine({ level: 4, time: 1000, jitter: 0, seed: 1 }, uci => {
      btn.disabled = false;
      if (S.moves.length !== before || !uci || puz || view >= 0) return;
      hint = pos.parseUci(uci);
      toast('Tip: ' + pos.san(hint, legal));
      renderArrow();
    });
  };

  // Nyt spil-ark
  let draft;
  function openNew() {
    draft = { mode: S.mode, level: S.level, color: S.colorPref, tc: S.tc || 0 };
    syncSheet();
    $('newScrim').hidden = false;
  }
  function syncSheet() {
    document.querySelectorAll('#newScrim .seg').forEach(seg => {
      const key = seg.dataset.key;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(draft[key]) === b.dataset.v));
    });
    document.querySelectorAll('#newScrim .cpuonly').forEach(el => { el.style.display = draft.mode === 'cpu' ? '' : 'none'; });
    $('lvlName').textContent = '· ' + LEVELS[draft.level];
    const st = S.stats[draft.level];
    $('record').innerHTML = st && (st.w + st.d + st.l)
      ? `Dine resultater på ${LEVELS[draft.level].toLowerCase()}: <b>${st.w}</b> vundet · <b>${st.d}</b> remis · <b>${st.l}</b> tabt`
      : `Du har ikke spillet på ${LEVELS[draft.level].toLowerCase()} endnu.`;
  }
  document.querySelectorAll('#newScrim .seg button').forEach(b => {
    b.onclick = () => {
      const key = b.parentElement.dataset.key;
      draft[key] = key === 'level' || key === 'tc' ? +b.dataset.v : b.dataset.v;
      syncSheet();
    };
  });
  $('btnNew').onclick = openNew;
  $('newCancel').onclick = () => { $('newScrim').hidden = true; };
  $('newScrim').addEventListener('click', e => { if (e.target.id === 'newScrim') $('newScrim').hidden = true; });
  $('newStart').onclick = () => {
    cancelEngine(); view = -1;
    S.tc = draft.tc; S.clock = TC[S.tc] ? { w: TC[S.tc][0] * 60000, b: TC[S.tc][0] * 60000, inc: TC[S.tc][1] } : null;
    S.timeout = ''; S.resigned = ''; S.review = null;
    S.mode = draft.mode; S.level = draft.level; S.colorPref = draft.color;
    S.human = draft.color === 'b' ? B : draft.color === 'w' ? W : (Math.random() < .5 ? W : B);
    S.flipped = S.mode === 'cpu' && S.human === B;
    S.moves = []; S.seed = rndSeed(); S.recorded = false; S.started = true;
    save(); rebuild();
    $('newScrim').hidden = true; $('endScrim').hidden = true;
    render();
    maybeComputer();
  };
  $('endNew').onclick = () => { $('endScrim').hidden = true; openNew(); };
  $('endLook').onclick = () => { $('endScrim').hidden = true; };
  $('endRev').onclick = () => { $('endScrim').hidden = true; startReview(); };

  // ---------- Skakur ----------
  let lastTick = Date.now(), lowBeep = 0;
  setInterval(() => {
    const now = Date.now(), dt = now - lastTick; lastTick = now;
    if (!S.clock || over || puz || !S.moves.length || document.hidden || dt > 1500) return;   // dt > 1,5 s: appen har været i baggrunden
    const k = colorKey(pos.side);
    S.clock[k] = Math.max(0, S.clock[k] - dt);
    if (S.clock[k] <= 0) {
      S.timeout = k; cancelEngine(); view = -1; over = calcOver(); save(); render(); finish(); return;
    }
    if (S.clock[k] < 10000 && (S.mode === 'pvp' || pos.side === S.human)) { const s = Math.ceil(S.clock[k] / 1000); if (s !== lowBeep) { lowBeep = s; sfx('low'); } }
    renderClocks();
  }, 200);
  document.addEventListener('visibilitychange', () => { lastTick = Date.now(); if (document.hidden) save(); });

  // ---------- Opgaver ----------
  function forcesMate(p, n) {          // kan siden i trækket tvinge mat i højst n træk?
    for (const m of p.legalMoves()) {
      p.make(m);
      const r = p.legalMoves(); let ok;
      if (!r.length) ok = p.inCheck();
      else if (n > 1) { ok = true; for (const x of r) { p.make(x); const f = forcesMate(p, n - 1); p.unmake(); if (!f) { ok = false; break; } } }
      else ok = false;
      p.unmake();
      if (ok) return m;
    }
    return 0;
  }
  function openPuzzle(set, idx) {
    if (!PZ[set] || !PZ[set].length) { toast('Ingen opgaver fundet'); return; }
    cancelEngine(); view = -1;
    idx = ((idx % PZ[set].length) + PZ[set].length) % PZ[set].length;
    const p = new E.Position(PZ[set][idx][0]), n = set === 'm1' ? 1 : 2;
    puz = { set, idx, n, left: n, pos: p, side: p.side, last: 0, done: false, busy: false, fails: 0, msg: '' };
    legal = p.legalMoves(); sel = -1; hint = 0;
    $('pzNext').classList.remove('primary');
    render();
  }
  const nextUnsolved = (set, from) => { const L = PZ[set].length; for (let k = 0; k < L; k++) { const i = (from + k) % L; if (!S.puz[set].includes(i)) return i; } return from % L; };
  function closePuzzle() {
    if (!puz) return;
    puz = null; rebuild(); render(); maybeComputer();
  }
  function puzMove(m, anim) {
    const P = puz, p = P.pos;
    const cap = p.b[(m >> 7) & 127];
    p.make(m);
    const replies = p.legalMoves();
    let ok;
    if (!replies.length) ok = p.inCheck();
    else ok = P.left > 1 && replies.every(r => { p.make(r); const f = forcesMate(p, P.left - 1); p.unmake(); return !!f; });
    P.last = m; sel = -1; hint = 0;
    if (!ok) {
      P.busy = true; P.fails++; P.msg = replies.length ? 'Ikke det – prøv igen' : 'Pat! Prøv igen';
      render(anim ? m : 0); sfx('bad');
      setTimeout(() => { if (puz !== P) return; p.unmake(); P.last = 0; P.busy = false; P.msg = ''; legal = p.legalMoves(); render(); }, 850);
      return;
    }
    if (!replies.length) {
      P.done = true; P.msg = '';
      if (!S.puz[P.set].includes(P.idx)) { S.puz[P.set].push(P.idx); save(); }
      legal = [];
      $('pzNext').classList.add('primary');
      render(anim ? m : 0); sfx('win');
      return;
    }
    P.left--; P.busy = true; P.msg = 'Rigtigt! Nu sætter du mat …';
    render(anim ? m : 0); sfx(cap ? 'capture' : 'check');
    setTimeout(() => {
      if (puz !== P) return;
      const r = replies[Math.floor(Math.random() * replies.length)];
      p.make(r); P.last = r; P.busy = false; P.msg = ''; legal = p.legalMoves();
      render(r); sfx('move');
    }, 600);
  }
  $('pzClose').onclick = closePuzzle;
  $('pzRetry').onclick = () => puz && openPuzzle(puz.set, puz.idx);
  $('pzNext').onclick = () => puz && openPuzzle(puz.set, nextUnsolved(puz.set, puz.idx + 1));
  $('pzHint').onclick = () => {
    if (!puz || puz.done || puz.busy) return;
    const m = forcesMate(puz.pos, puz.left);
    if (!m) return;
    hint = m; puz.fails++; toast('Tip: ' + puz.pos.san(m, legal)); renderArrow();
  };
  function openPuzzles() {
    $('pz1').textContent = `${S.puz.m1.length} af ${PZ.m1.length} løst`;
    $('pz2').textContent = `${S.puz.m2.length} af ${PZ.m2.length} løst`;
    $('puzScrim').hidden = false;
  }
  document.querySelectorAll('#puzScrim [data-set]').forEach(b => { b.onclick = () => { $('puzScrim').hidden = true; openPuzzle(b.dataset.set, nextUnsolved(b.dataset.set, 0)); }; });
  $('puzCancel').onclick = () => { $('puzScrim').hidden = true; };
  $('puzScrim').addEventListener('click', e => { if (e.target.id === 'puzScrim') $('puzScrim').hidden = true; });

  // ---------- Gennemgang: motoren ser partiet igennem ----------
  const clampSc = v => Math.max(-1500, Math.min(1500, v | 0));
  function startReview() {
    if (!over) { toast('Spil partiet færdigt først – eller giv op'); return; }
    if (S.moves.length < 2) { toast('Der er ikke noget at gennemgå endnu'); return; }
    if (S.review && S.review.n === S.moves.length) { showReview(); return; }
    cancelEngine(); view = -1; render();
    analysing = true; renderButtons();
    const N = S.moves.length, sc = [], best = [], st = $('status');
    st.hidden = false; $('nav').hidden = true; st.classList.remove('alert');
    const step = i => {
      if (!analysing) return;
      st.textContent = `Gennemgår … ${Math.min(i, N)} af ${N}`;
      const fin = () => { analysing = false; S.review = { n: N, sc, best }; save(); render(); showReview(); };
      if (i === N) {
        const r = pos.result();
        if (r) { sc[N] = r.reason === 'mate' ? -1500 : 0; fin(); return; }
      }
      if (i > N) { fin(); return; }
      askEngine({ moves: S.moves.slice(0, i), level: 4, time: 220, jitter: 0, seed: 1 }, (uci, score) => {
        if (!analysing) return;
        sc[i] = clampSc(score); best[i] = uci || '';
        if (i === N) fin(); else step(i + 1);
      });
    };
    step(0);
  }
  function showReview() {
    const R = S.review, mk = marks(), N = R.n;
    const cnt = { w: [0, 0, 0], b: [0, 0, 0] };
    mk.forEach((q, i) => { if (q >= 0) cnt[i % 2 ? 'b' : 'w'][q]++; });
    // graf set fra hvid
    const pts = R.sc.map((v, i) => { const w = i % 2 ? -v : v; return `${(i / N * 300).toFixed(1)},${(38 - Math.max(-34, Math.min(34, w / 1000 * 34))).toFixed(1)}`; }).join(' ');
    const dots = mk.map((q, i) => { if (q < 1) return ''; const v = R.sc[i + 1], w = (i + 1) % 2 ? -v : v; return `<circle cx="${((i + 1) / N * 300).toFixed(1)}" cy="${(38 - Math.max(-34, Math.min(34, w / 1000 * 34))).toFixed(1)}" r="3.4" fill="${q === 2 ? '#C2352B' : '#D07A12'}"/>`; }).join('');
    $('revGraph').innerHTML = `<svg viewBox="0 0 300 76" preserveAspectRatio="none"><line x1="0" y1="38" x2="300" y2="38" stroke="rgba(29,27,23,.25)" stroke-width="1" stroke-dasharray="3 3"/><polyline points="${pts}" fill="none" stroke="#1D1B17" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${dots}</svg>`;
    const name = c => S.mode === 'cpu' ? (c === S.human ? 'Dig' : 'Computeren') : (c === W ? 'Hvid' : 'Sort');
    const line = (c, a) => `<b>${name(c)}:</b> ${a[2]} ${a[2] === 1 ? 'brøler' : 'brølere'} · ${a[1]} fejl · ${a[0]} ${a[0] === 1 ? 'unøjagtighed' : 'unøjagtigheder'}`;
    $('revText').innerHTML = line(W, cnt.w) + '<br>' + line(B, cnt.b) + '<br><span style="font-size:12.5px;opacity:.8">Grafen viser stillingen set fra hvid. Tryk på et træk i listen for at se det.</span>';
    $('revScrim').hidden = false;
  }
  $('revClose').onclick = () => { $('revScrim').hidden = true; };
  $('revGo').onclick = () => { $('revScrim').hidden = true; const mk = marks(); let i = mk.findIndex(q => q >= 1); if (i < 0) i = mk.findIndex(q => q >= 0); setView(i < 0 ? 0 : i + 1); };
  $('revScrim').addEventListener('click', e => { if (e.target.id === 'revScrim') $('revScrim').hidden = true; });

  // ---------- Mere ----------
  function applyTheme() {
    const t = THEMES[S.theme] || THEMES.salvie;
    document.documentElement.style.setProperty('--light', t[0]); document.documentElement.style.setProperty('--darksq', t[1]);
  }
  function syncMore() {
    document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === S.theme));
    document.querySelectorAll('#soundSeg button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === !!S.sound));
    $('mPuzSub').textContent = `Mat i 1 og 2 · ${S.puz.m1.length + S.puz.m2.length} af ${PZ.m1.length + PZ.m2.length} løst`;
    $('mRev').disabled = !over || S.moves.length < 2;
    $('mResign').disabled = !!over || !S.moves.length;
    $('about').textContent = 'Gambit ' + VERSION + ' · brikker: cburnett';
  }
  $('btnMore').onclick = () => { syncMore(); $('moreScrim').hidden = false; };
  $('moreClose').onclick = () => { $('moreScrim').hidden = true; };
  $('moreScrim').addEventListener('click', e => { if (e.target.id === 'moreScrim') $('moreScrim').hidden = true; });
  document.querySelectorAll('#themeSeg button').forEach(b => { b.onclick = () => { S.theme = b.dataset.v; save(); applyTheme(); syncMore(); }; });
  document.querySelectorAll('#soundSeg button').forEach(b => { b.onclick = () => { S.sound = b.dataset.v === '1'; save(); syncMore(); if (S.sound) sfx('move'); }; });
  $('mPuz').onclick = () => { $('moreScrim').hidden = true; openPuzzles(); };
  $('mRev').onclick = () => { $('moreScrim').hidden = true; startReview(); };
  $('mResign').onclick = () => {
    if (over || !S.moves.length) return;
    $('moreScrim').hidden = true;
    S.resigned = colorKey(S.mode === 'cpu' ? S.human : pos.side);
    cancelEngine(); view = -1; over = calcOver(); save(); render(); finish();
  };

  let toastT;
  function toast(t) {
    const el = $('toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- Android ----------
  window.androidBack = () => {
    if (!$('promoScrim').hidden) { $('promoScrim').click(); return; }
    for (const id of ['endScrim', 'newScrim', 'moreScrim', 'puzScrim', 'revScrim']) if (!$(id).hidden) { $(id).hidden = true; return; }
    if (analysing) { cancelEngine(); render(); return; }
    if (sel >= 0 || hint) { sel = -1; hint = 0; renderSquares(); renderArrow(); return; }
    if (view >= 0) { closeView(); return; }
    if (puz) { closePuzzle(); return; }
    if (window.Android && Android.exitApp) Android.exitApp();
  };
  window.onAppPause = save;
  // til de automatiske tests
  window.gambitDebug = () => ({ moves: S.moves.length, over: over && over.reason, winner: over ? over.winner : null, view, analysing, thinking, clock: S.clock, review: !!S.review, marks: marks(),
    puz: puz && { set: puz.set, idx: puz.idx, left: puz.left, done: puz.done, busy: puz.busy, fen: puz.pos.fen(), sol: (m => m ? puz.pos.uci(m) : '')(puz.done ? 0 : forcesMate(puz.pos, puz.left)) }, solved: S.puz, side: pos.side, human: S.human });

  // ---------- Layout ----------
  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    let bs;
    if (w > h && w >= 640) bs = Math.min(h - 150, w - 400);
    else bs = Math.min(w - 24, h - 324, 720);
    bs = Math.max(200, Math.floor(bs / 8) * 8);
    document.documentElement.style.setProperty('--bs', bs + 'px');
  }
  window.addEventListener('resize', () => { layout(); render(); });

  layout();
  applyTheme();
  rebuild();
  render();
  if (!S.started) openNew();
  else maybeComputer();
})();
