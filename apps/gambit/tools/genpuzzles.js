// Finder mat-opgaver ved at lade motoren spille mod sig selv:  node tools/genpuzzles.js [antal spil] > web/puzzles.js
const E = require('../web/engine.js')();
const VAL = [0, 1, 3, 3, 5, 9, 0];
function mat(pos, color) { let s = 0, n = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const p = pos.b[sq]; if (p) { n++; if ((p & 8) === color) s += VAL[p & 7]; } } return [s, n]; }
function isMate(pos) { return !pos.legalMoves().length && pos.inCheck(); }
// antal førstetræk der tvinger mat i højst n
function solutions(pos, n, limit) {
  const out = [];
  for (const m of pos.legalMoves()) {
    pos.make(m);
    const r = pos.legalMoves(); let ok;
    if (!r.length) ok = pos.inCheck();
    else if (n > 1) { ok = true; for (const x of r) { pos.make(x); const s = solutions(pos, n - 1, 1).length > 0; pos.unmake(); if (!s) { ok = false; break; } } }
    else ok = false;
    pos.unmake();
    if (ok) { out.push(m); if (out.length >= limit) break; }
  }
  return out;
}
const MAX = +process.env.MAX || 40;              // MAX=80 node tools/genpuzzles.js 900 4242 – flere opgaver
const games = +process.argv[2] || 300, found = { 1: [], 2: [] }, seen = new Set();
let seed = +process.argv[3] || 12345;
for (let g = 0; g < games && (found[1].length < MAX || found[2].length < MAX); g++) {
  const pos = new E.Position(); const got = {};
  const off = (+process.argv[3] || 0) % 7, lw = 1 + ((g + off) % 3), lb = 1 + (((g + off) >> 1) % 3);
  for (let ply = 0; ply < 160; ply++) {
    if (pos.result()) break;
    if (ply >= 16) {
      const side = pos.side, [me, n] = mat(pos, side), [op] = mat(pos, side ^ 8);
      if (n >= 9 && me - op <= 7 && me - op >= -9) {
        const s1 = solutions(pos, 1, 3);
        if (s1.length === 1 && !got[1]) { const f = pos.fen(); if (!seen.has(f.split(' ')[0])) { seen.add(f.split(' ')[0]); found[1].push([f, pos.uci(s1[0])]); got[1] = 1; } }
        else if (!s1.length && !got[2]) {
          const s2 = solutions(pos, 2, 3);
          if (s2.length === 1) { const f = pos.fen(); if (!seen.has(f.split(' ')[0])) { seen.add(f.split(' ')[0]); found[2].push([f, pos.uci(s2[0])]); got[2] = 1; } }
        }
      }
    }
    const r = E.think(pos, { level: pos.side === E.WHITE ? lw : lb, time: 60, seed: seed++ });
    if (!r.move) break; pos.make(r.move);
  }
  if (g % 20 === 19) console.error(g + 1, 'spil:', found[1].length, found[2].length);
}
console.log('// Genereret af tools/genpuzzles.js – hver opgave er [FEN, løsningens første træk]; løsningen er entydig og tjekket af motoren.');
console.log('const PUZZLES = ' + JSON.stringify({ m1: found[1].slice(0, MAX), m2: found[2].slice(0, MAX) }) + ';');
