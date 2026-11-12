/* Gambit – skakmotor: regler, træk-generering, evaluering og søgning.
   Hele motoren ligger i én funktion, så den også kan køre i en Web Worker. */
function createEngine() {
  'use strict';
  const WHITE = 0, BLACK = 8;
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const N_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33];
  const B_DIRS = [-17, -15, 15, 17];
  const R_DIRS = [-16, -1, 1, 16];
  const K_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];
  const F_EP = 1, F_CASTLE = 2, F_DOUBLE = 4;
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const MATE = 30000, INF = 32000;
  const MAXPLY = 2400;

  // ---------- Zobrist ----------
  let rs = 0x2545F491;
  function rnd() { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return rs | 0; }
  const ZPL = new Int32Array(16 * 128), ZPH = new Int32Array(16 * 128);
  for (let i = 0; i < ZPL.length; i++) { ZPL[i] = rnd(); ZPH[i] = rnd(); }
  const ZCL = new Int32Array(16), ZCH = new Int32Array(16);
  for (let i = 0; i < 16; i++) { ZCL[i] = rnd(); ZCH[i] = rnd(); }
  const ZEL = new Int32Array(8), ZEH = new Int32Array(8);
  for (let i = 0; i < 8; i++) { ZEL[i] = rnd(); ZEH[i] = rnd(); }
  const ZSL = rnd(), ZSH = rnd();

  // Rokaderettigheder: masker der fjernes når en brik flytter fra/til feltet
  const CR = new Int8Array(128).fill(15);
  CR[112] = 15 & ~2; CR[119] = 15 & ~1; CR[116] = 15 & ~3;
  CR[0] = 15 & ~8; CR[7] = 15 & ~4; CR[4] = 15 & ~12;

  const sqName = sq => 'abcdefgh'[sq & 7] + (8 - (sq >> 4));
  const parseSq = s => (8 - parseInt(s[1], 10)) * 16 + (s.charCodeAt(0) - 97);

  class Position {
    constructor(fen) {
      this.b = new Int8Array(128);
      this.kings = [0, 0];
      const n = MAXPLY + 128;
      this.stM = new Int32Array(n); this.stCap = new Int8Array(n);
      this.stCastle = new Int8Array(n); this.stEp = new Int16Array(n);
      this.stHalf = new Int16Array(n);
      this.stHL = new Int32Array(n); this.stHH = new Int32Array(n);
      this.histL = new Int32Array(n); this.histH = new Int32Array(n);
      this.setFen(fen || START);
    }
    setFen(fen) {
      const f = fen.trim().split(/\s+/);
      this.b.fill(0);
      let r = 0, c = 0;
      for (const ch of f[0]) {
        if (ch === '/') { r++; c = 0; continue; }
        if (ch >= '1' && ch <= '8') { c += +ch; continue; }
        const lower = ch.toLowerCase();
        const t = ' pnbrqk'.indexOf(lower);
        const col = ch === lower ? BLACK : WHITE;
        const sq = r * 16 + c;
        this.b[sq] = t | col;
        if (t === KING) this.kings[col >> 3] = sq;
        c++;
      }
      this.side = f[1] === 'b' ? BLACK : WHITE;
      this.castle = 0;
      if (f[2] && f[2] !== '-') for (const ch of f[2]) this.castle |= { K: 1, Q: 2, k: 4, q: 8 }[ch] || 0;
      this.ep = f[3] && f[3] !== '-' ? parseSq(f[3]) : -1;
      this.half = f[4] ? parseInt(f[4], 10) : 0;
      this.full = f[5] ? parseInt(f[5], 10) : 1;
      this.ply = 0;
      this.computeHash();
      this.histL[0] = this.hl; this.histH[0] = this.hh;
    }
    computeHash() {
      let l = 0, h = 0;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = this.b[sq];
        if (p) { l ^= ZPL[p * 128 + sq]; h ^= ZPH[p * 128 + sq]; }
      }
      l ^= ZCL[this.castle]; h ^= ZCH[this.castle];
      if (this.ep >= 0) { l ^= ZEL[this.ep & 7]; h ^= ZEH[this.ep & 7]; }
      if (this.side === BLACK) { l ^= ZSL; h ^= ZSH; }
      this.hl = l; this.hh = h;
    }
    fen() {
      let s = '';
      for (let r = 0; r < 8; r++) {
        let e = 0;
        for (let c = 0; c < 8; c++) {
          const p = this.b[r * 16 + c];
          if (!p) { e++; continue; }
          if (e) { s += e; e = 0; }
          const ch = ' pnbrqk'[p & 7];
          s += p & 8 ? ch : ch.toUpperCase();
        }
        if (e) s += e;
        if (r < 7) s += '/';
      }
      let cs = '';
      if (this.castle & 1) cs += 'K'; if (this.castle & 2) cs += 'Q';
      if (this.castle & 4) cs += 'k'; if (this.castle & 8) cs += 'q';
      return s + ' ' + (this.side ? 'b' : 'w') + ' ' + (cs || '-') + ' ' +
        (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
    }

    attacked(sq, by) {
      const b = this.b;
      if (by === WHITE) {
        let s = sq + 15; if (!(s & 0x88) && b[s] === PAWN) return true;
        s = sq + 17; if (!(s & 0x88) && b[s] === PAWN) return true;
      } else {
        let s = sq - 15; if (!(s & 0x88) && b[s] === (PAWN | BLACK)) return true;
        s = sq - 17; if (!(s & 0x88) && b[s] === (PAWN | BLACK)) return true;
      }
      const kn = KNIGHT | by, ki = KING | by;
      for (let i = 0; i < 8; i++) {
        let s = sq + N_DIRS[i]; if (!(s & 0x88) && b[s] === kn) return true;
        s = sq + K_DIRS[i]; if (!(s & 0x88) && b[s] === ki) return true;
      }
      const bi = BISHOP | by, ro = ROOK | by, qu = QUEEN | by;
      for (let i = 0; i < 4; i++) {
        let d = B_DIRS[i], s = sq + d;
        while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === bi || p === qu) return true; break; } s += d; }
        d = R_DIRS[i]; s = sq + d;
        while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === ro || p === qu) return true; break; } s += d; }
      }
      return false;
    }
    inCheck() { return this.attacked(this.kings[this.side >> 3], this.side ^ 8); }

    // Pseudo-lovlige træk. capsOnly: kun slag og dronning-forvandlinger
    gen(capsOnly) {
      const m = [], b = this.b, us = this.side, them = us ^ 8;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq];
        if (!p || (p & 8) !== us) continue;
        const t = p & 7;
        if (t === PAWN) {
          const dir = us === WHITE ? -16 : 16;
          const startRow = us === WHITE ? 6 : 1, promoRow = us === WHITE ? 0 : 7;
          let to = sq + dir;
          if (!b[to]) {
            if ((to >> 4) === promoRow) {
              m.push(sq | to << 7 | QUEEN << 14);
              if (!capsOnly) { m.push(sq | to << 7 | KNIGHT << 14, sq | to << 7 | ROOK << 14, sq | to << 7 | BISHOP << 14); }
            } else if (!capsOnly) {
              m.push(sq | to << 7);
              const to2 = to + dir;
              if ((sq >> 4) === startRow && !b[to2]) m.push(sq | to2 << 7 | F_DOUBLE << 17);
            }
          }
          for (let k = -1; k <= 1; k += 2) {
            to = sq + dir + k;
            if (to & 0x88) continue;
            const c = b[to];
            if (c && (c & 8) === them) {
              if ((to >> 4) === promoRow) {
                m.push(sq | to << 7 | QUEEN << 14);
                if (!capsOnly) m.push(sq | to << 7 | KNIGHT << 14, sq | to << 7 | ROOK << 14, sq | to << 7 | BISHOP << 14);
              } else m.push(sq | to << 7);
            } else if (to === this.ep) m.push(sq | to << 7 | F_EP << 17);
          }
        } else if (t === KNIGHT || t === KING) {
          const dirs = t === KNIGHT ? N_DIRS : K_DIRS;
          for (let i = 0; i < 8; i++) {
            const to = sq + dirs[i];
            if (to & 0x88) continue;
            const c = b[to];
            if (c) { if ((c & 8) === them) m.push(sq | to << 7); }
            else if (!capsOnly) m.push(sq | to << 7);
          }
          if (t === KING && !capsOnly) {
            if (us === WHITE && sq === 116) {
              if ((this.castle & 1) && !b[117] && !b[118] && b[119] === ROOK &&
                !this.attacked(116, them) && !this.attacked(117, them) && !this.attacked(118, them))
                m.push(116 | 118 << 7 | F_CASTLE << 17);
              if ((this.castle & 2) && !b[115] && !b[114] && !b[113] && b[112] === ROOK &&
                !this.attacked(116, them) && !this.attacked(115, them) && !this.attacked(114, them))
                m.push(116 | 114 << 7 | F_CASTLE << 17);
            } else if (us === BLACK && sq === 4) {
              if ((this.castle & 4) && !b[5] && !b[6] && b[7] === (ROOK | BLACK) &&
                !this.attacked(4, them) && !this.attacked(5, them) && !this.attacked(6, them))
                m.push(4 | 6 << 7 | F_CASTLE << 17);
              if ((this.castle & 8) && !b[3] && !b[2] && !b[1] && b[0] === (ROOK | BLACK) &&
                !this.attacked(4, them) && !this.attacked(3, them) && !this.attacked(2, them))
                m.push(4 | 2 << 7 | F_CASTLE << 17);
            }
          }
        } else {
          const dirs = t === BISHOP ? B_DIRS : t === ROOK ? R_DIRS : K_DIRS;
          for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i];
            let to = sq + d;
            while (!(to & 0x88)) {
              const c = b[to];
              if (c) { if ((c & 8) === them) m.push(sq | to << 7); break; }
              if (!capsOnly) m.push(sq | to << 7);
              to += d;
            }
          }
        }
      }
      return m;
    }

    make(m) {
      const b = this.b, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17;
      const p = b[from], us = this.side;
      let cap = b[to];
      const i = this.ply;
      this.stM[i] = m; this.stCap[i] = cap; this.stCastle[i] = this.castle; this.stEp[i] = this.ep;
      this.stHalf[i] = this.half; this.stHL[i] = this.hl; this.stHH[i] = this.hh;
      let l = this.hl, h = this.hh;
      l ^= ZPL[p * 128 + from]; h ^= ZPH[p * 128 + from];
      if (cap) { l ^= ZPL[cap * 128 + to]; h ^= ZPH[cap * 128 + to]; }
      const np = promo ? (promo | us) : p;
      l ^= ZPL[np * 128 + to]; h ^= ZPH[np * 128 + to];
      b[to] = np; b[from] = 0;
      if (flag === F_EP) {
        const cs = to + (us === WHITE ? 16 : -16);
        cap = b[cs]; b[cs] = 0;
        l ^= ZPL[cap * 128 + cs]; h ^= ZPH[cap * 128 + cs];
      } else if (flag === F_CASTLE) {
        let rf, rt;
        if (to === 118) { rf = 119; rt = 117; } else if (to === 114) { rf = 112; rt = 115; }
        else if (to === 6) { rf = 7; rt = 5; } else { rf = 0; rt = 3; }
        const r = b[rf]; b[rt] = r; b[rf] = 0;
        l ^= ZPL[r * 128 + rf] ^ ZPL[r * 128 + rt]; h ^= ZPH[r * 128 + rf] ^ ZPH[r * 128 + rt];
      }
      if ((p & 7) === KING) this.kings[us >> 3] = to;
      l ^= ZCL[this.castle]; h ^= ZCH[this.castle];
      this.castle &= CR[from] & CR[to];
      l ^= ZCL[this.castle]; h ^= ZCH[this.castle];
      if (this.ep >= 0) { l ^= ZEL[this.ep & 7]; h ^= ZEH[this.ep & 7]; }
      this.ep = flag === F_DOUBLE ? (from + to) >> 1 : -1;
      if (this.ep >= 0) { l ^= ZEL[this.ep & 7]; h ^= ZEH[this.ep & 7]; }
      this.half = ((p & 7) === PAWN || cap) ? 0 : this.half + 1;
      if (us === BLACK) this.full++;
      this.side ^= 8; l ^= ZSL; h ^= ZSH;
      this.hl = l; this.hh = h;
      this.ply++;
      this.histL[this.ply] = l; this.histH[this.ply] = h;
    }
    unmake() {
      this.ply--;
      const i = this.ply, m = this.stM[i], b = this.b;
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17;
      this.side ^= 8;
      const us = this.side;
      const p = promo ? (PAWN | us) : b[to];
      b[from] = p;
      b[to] = flag === F_EP ? 0 : this.stCap[i];
      if (flag === F_EP) b[to + (us === WHITE ? 16 : -16)] = PAWN | (us ^ 8);
      else if (flag === F_CASTLE) {
        let rf, rt;
        if (to === 118) { rf = 119; rt = 117; } else if (to === 114) { rf = 112; rt = 115; }
        else if (to === 6) { rf = 7; rt = 5; } else { rf = 0; rt = 3; }
        b[rf] = b[rt]; b[rt] = 0;
      }
      if ((p & 7) === KING) this.kings[us >> 3] = from;
      if (us === BLACK) this.full--;
      this.castle = this.stCastle[i]; this.ep = this.stEp[i]; this.half = this.stHalf[i];
      this.hl = this.stHL[i]; this.hh = this.stHH[i];
    }
    makeNull() {
      const i = this.ply;
      this.stM[i] = 0; this.stEp[i] = this.ep; this.stHalf[i] = this.half;
      this.stHL[i] = this.hl; this.stHH[i] = this.hh; this.stCastle[i] = this.castle;
      if (this.ep >= 0) { this.hl ^= ZEL[this.ep & 7]; this.hh ^= ZEH[this.ep & 7]; }
      this.ep = -1; this.half++;
      this.side ^= 8; this.hl ^= ZSL; this.hh ^= ZSH;
      this.ply++;
      this.histL[this.ply] = this.hl; this.histH[this.ply] = this.hh;
    }
    unmakeNull() {
      this.ply--;
      const i = this.ply;
      this.side ^= 8; this.ep = this.stEp[i]; this.half = this.stHalf[i];
      this.hl = this.stHL[i]; this.hh = this.stHH[i];
    }

    legalMoves() {
      const out = [], ms = this.gen(false);
      for (const m of ms) {
        this.make(m);
        if (!this.attacked(this.kings[(this.side ^ 8) >> 3], this.side)) out.push(m);
        this.unmake();
      }
      return out;
    }
    // Antal gange den nuværende stilling har været set før (inden for halvtræks-vinduet)
    repetitions() {
      let n = 0;
      const lo = Math.max(0, this.ply - this.half);
      for (let i = this.ply - 2; i >= lo; i -= 2)
        if (this.histL[i] === this.hl && this.histH[i] === this.hh) n++;
      return n;
    }
    insufficient() {
      let minors = 0, bishopsColors = 0, knights = 0, bishops = 0;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const t = this.b[sq] & 7;
        if (!t || t === KING) continue;
        if (t === PAWN || t === ROOK || t === QUEEN) return false;
        minors++;
        if (t === KNIGHT) knights++;
        else { bishops++; bishopsColors |= 1 << (((sq >> 4) + (sq & 7)) & 1); }
      }
      if (minors <= 1) return true;
      if (knights === 0 && bishopsColors !== 3) return true; // kun løbere på samme farve
      return false;
    }
    // Spillets status: null hvis i gang
    result() {
      const legal = this.legalMoves();
      if (!legal.length) {
        if (this.inCheck()) return { over: true, winner: this.side ^ 8, reason: 'mate' };
        return { over: true, winner: -1, reason: 'stalemate' };
      }
      if (this.insufficient()) return { over: true, winner: -1, reason: 'material' };
      if (this.half >= 100) return { over: true, winner: -1, reason: 'fifty' };
      if (this.repetitions() >= 2) return { over: true, winner: -1, reason: 'repetition' };
      return null;
    }

    uci(m) {
      const promo = (m >> 14) & 7;
      return sqName(m & 127) + sqName((m >> 7) & 127) + (promo ? ' pnbrqk'[promo] : '');
    }
    parseUci(s) {
      const from = parseSq(s.slice(0, 2)), to = parseSq(s.slice(2, 4));
      const promo = s[4] ? ' pnbrqk'.indexOf(s[4]) : 0;
      for (const m of this.legalMoves())
        if ((m & 127) === from && ((m >> 7) & 127) === to && ((m >> 14) & 7) === promo) return m;
      return 0;
    }
    // Algebraisk notation med danske bogstaver (K D T L S)
    san(m, legal) {
      legal = legal || this.legalMoves();
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = m >> 17;
      const t = this.b[from] & 7;
      const L = ' .SLTDK';
      let s;
      if (flag === F_CASTLE) s = (to & 7) === 6 ? 'O-O' : 'O-O-O';
      else {
        const cap = this.b[to] || flag === F_EP;
        if (t === PAWN) {
          s = (cap ? 'abcdefgh'[from & 7] + 'x' : '') + sqName(to) + (promo ? '=' + L[promo] : '');
        } else {
          let amb = false, sameFile = false, sameRank = false;
          for (const o of legal) {
            const of = o & 127;
            if (o === m || ((o >> 7) & 127) !== to || of === from || (this.b[of] & 7) !== t) continue;
            amb = true;
            if ((of & 7) === (from & 7)) sameFile = true;
            if ((of >> 4) === (from >> 4)) sameRank = true;
          }
          let d = '';
          if (amb) {
            if (!sameFile) d = 'abcdefgh'[from & 7];
            else if (!sameRank) d = String(8 - (from >> 4));
            else d = sqName(from);
          }
          s = L[t] + d + (cap ? 'x' : '') + sqName(to);
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.legalMoves().length ? '+' : '#';
      this.unmake();
      return s;
    }
  }

  // ---------- Evaluering ----------
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const PST = [null,
    [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]];
  const KING_EG = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
  const PASSED = [0, 10, 15, 25, 40, 65, 100, 0]; // efter antal felter fremme
  const PHASE = [0, 0, 1, 1, 2, 4, 0];

  const pf = [new Int8Array(10), new Int8Array(10)];       // bønder pr. linje
  const pAdv = [new Int8Array(10), new Int8Array(10)];     // hvid: mindste række (længst fremme), sort: største
  const pBack = [new Int8Array(10), new Int8Array(10)];

  function evaluate(pos, jitterAmp, seed) {
    const b = pos.b;
    let mg = 0, kingMg = 0, kingEg = 0, phase = 0;
    const mat = [0, 0], bishops = [0, 0];
    pf[0].fill(0); pf[1].fill(0);
    pAdv[0].fill(9); pAdv[1].fill(-1); pBack[0].fill(-1); pBack[1].fill(9);
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p) continue;
      const t = p & 7, c = p >> 3, row = sq >> 4, file = sq & 7;
      const idx = c ? (7 - row) * 8 + file : row * 8 + file;
      const sign = c ? -1 : 1;
      phase += PHASE[t];
      if (t === KING) { kingMg += sign * PST[KING][idx]; kingEg += sign * KING_EG[idx]; continue; }
      mat[c] += VAL[t];
      mg += sign * (VAL[t] + PST[t][idx]);
      if (t === BISHOP) bishops[c]++;
      if (t === PAWN) {
        const f = file + 1;
        pf[c][f]++;
        if (c === 0) { if (row < pAdv[0][f]) pAdv[0][f] = row; if (row > pBack[0][f]) pBack[0][f] = row; }
        else { if (row > pAdv[1][f]) pAdv[1][f] = row; if (row < pBack[1][f]) pBack[1][f] = row; }
      }
    }
    if (phase > 24) phase = 24;
    let score = mg + ((kingMg * phase + kingEg * (24 - phase)) / 24 | 0);
    if (bishops[0] >= 2) score += 30;
    if (bishops[1] >= 2) score -= 30;
    // Bondestruktur
    const egW = (24 - phase) / 24;
    for (let f = 1; f <= 8; f++) {
      for (let c = 0; c < 2; c++) {
        const n = pf[c][f];
        if (!n) continue;
        const sign = c ? -1 : 1;
        if (n > 1) score -= sign * 12 * (n - 1);
        if (!pf[c][f - 1] && !pf[c][f + 1]) score -= sign * 10 * n;
        // fribonde: ingen modstanderbønder foran på samme eller nabolinjer
        const o = c ^ 1;
        if (c === 0) {
          const row = pAdv[0][f];
          let free = true;
          for (let g = f - 1; g <= f + 1 && free; g++) if (pf[1][g] && pBack[1][g] < row) free = false;
          if (free) score += (PASSED[7 - row] * (0.5 + egW)) | 0;
        } else {
          const row = pAdv[1][f];
          let free = true;
          for (let g = f - 1; g <= f + 1 && free; g++) if (pf[0][g] && pBack[0][g] > row) free = false;
          if (free) score -= (PASSED[row] * (0.5 + egW)) | 0;
        }
        void o;
      }
    }
    // Slutspil: driv den svage konge mod kanten
    const diff = mat[0] - mat[1];
    if (phase <= 8 && Math.abs(diff) >= 300) {
      const strong = diff > 0 ? 0 : 1;
      const wk = pos.kings[strong], lk = pos.kings[strong ^ 1];
      const lr = lk >> 4, lf = lk & 7;
      const center = Math.max(3 - lr, lr - 4) + Math.max(3 - lf, lf - 4);
      const dist = Math.abs((wk >> 4) - lr) + Math.abs((wk & 7) - lf);
      const bonus = center * 12 + (14 - dist) * 5;
      score += strong === 0 ? bonus : -bonus;
    }
    if (jitterAmp) {
      const r = Math.imul(pos.hl ^ seed, 0x9E3779B1) >>> 0;
      score += ((r % (2 * jitterAmp + 1)) - jitterAmp);
    }
    score += pos.side === WHITE ? 10 : -10; // tempo
    return pos.side === WHITE ? score : -score;
  }

  // ---------- Søgning ----------
  const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE);
  const ttScore = new Int16Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Uint8Array(TT_SIZE);
  const EXACT = 1, LOWER = 2, UPPER = 3;

  const LEVELS = {
    1: { depth: 1, time: 300, jitter: 140, qs: false },
    2: { depth: 2, time: 500, jitter: 70, qs: true },
    3: { depth: 4, time: 700, jitter: 25, qs: true },
    4: { depth: 64, time: 1500, jitter: 8, qs: true },
    5: { depth: 64, time: 3500, jitter: 2, qs: true },
  };

  function think(pos, opts) {
    const lv = LEVELS[opts.level] || LEVELS[3];
    const maxDepth = opts.depth || lv.depth;
    const timeMs = opts.time || lv.time;
    const jitter = opts.jitter !== undefined ? opts.jitter : lv.jitter;
    const useQs = lv.qs;
    const seed = opts.seed | 0;
    const t0 = Date.now(), deadline = t0 + timeMs;
    let nodes = 0, stop = false, rootBest = 0;
    const killers = new Int32Array(256);
    const hist = new Int32Array(16 * 128);
    ttKey.fill(0); ttFlag.fill(0);

    function scoreMoves(ms, ttm, ply) {
      const sc = new Int32Array(ms.length), b = pos.b;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (m === ttm) { sc[i] = 1e7; continue; }
        const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7;
        const vic = b[to] & 7;
        if (vic || (m >> 17) === F_EP) sc[i] = 1e6 + (vic || 1) * 10 - (b[from] & 7);
        else if (promo) sc[i] = 9e5 + promo;
        else if (m === killers[ply * 2]) sc[i] = 8e5;
        else if (m === killers[ply * 2 + 1]) sc[i] = 7e5;
        else sc[i] = hist[b[from] * 128 + to];
      }
      return sc;
    }
    function pick(ms, sc, i) {
      let bi = i;
      for (let j = i + 1; j < ms.length; j++) if (sc[j] > sc[bi]) bi = j;
      if (bi !== i) {
        const tm = ms[i]; ms[i] = ms[bi]; ms[bi] = tm;
        const ts = sc[i]; sc[i] = sc[bi]; sc[bi] = ts;
      }
      return ms[i];
    }
    function hasPieces(side) {
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = pos.b[sq];
        if (p && (p & 8) === side) { const t = p & 7; if (t !== PAWN && t !== KING) return true; }
      }
      return false;
    }

    function qs(alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const stand = evaluate(pos, jitter, seed);
      if (ply >= 60) return stand;
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      const ms = pos.gen(true);
      const sc = scoreMoves(ms, 0, Math.min(ply, 127));
      for (let i = 0; i < ms.length; i++) {
        const m = pick(ms, sc, i);
        pos.make(m);
        if (pos.attacked(pos.kings[(pos.side ^ 8) >> 3], pos.side)) { pos.unmake(); continue; }
        const s = -qs(-beta, -alpha, ply + 1);
        pos.unmake();
        if (stop) return 0;
        if (s >= beta) return s;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    function negamax(depth, alpha, beta, ply, allowNull) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      if (ply > 0) {
        if (pos.half >= 100 || pos.repetitions() > 0 || pos.insufficient()) return 0;
        // mate distance pruning
        const ma = -MATE + ply, mb = MATE - ply - 1;
        if (ma > alpha) alpha = ma;
        if (mb < beta) beta = mb;
        if (alpha >= beta) return alpha;
      }
      const inCheck = pos.inCheck();
      if (inCheck && ply < 60) depth++;
      if (depth <= 0) return useQs ? qs(alpha, beta, ply) : evaluate(pos, jitter, seed);
      if (ply >= 100) return evaluate(pos, jitter, seed);

      const ti = pos.hl & TT_MASK;
      let ttm = 0;
      if (ttFlag[ti] && ttKey[ti] === pos.hh) {
        ttm = ttMove[ti];
        if (ply > 0 && ttDepth[ti] >= depth) {
          let s = ttScore[ti];
          if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
          const f = ttFlag[ti];
          if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
        }
      }
      const pvNode = beta - alpha > 1;
      if (allowNull && !pvNode && !inCheck && depth >= 3 && hasPieces(pos.side) &&
        evaluate(pos, jitter, seed) >= beta) {
        pos.makeNull();
        const s = -negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
        pos.unmakeNull();
        if (stop) return 0;
        if (s >= beta) return beta;
      }

      const ms = pos.gen(false);
      const sc = scoreMoves(ms, ttm, Math.min(ply, 127));
      const alpha0 = alpha;
      let best = -INF, bestMove = 0, legal = 0;
      for (let i = 0; i < ms.length; i++) {
        const m = pick(ms, sc, i);
        const quiet = !pos.b[(m >> 7) & 127] && !((m >> 14) & 7) && (m >> 17) !== F_EP;
        pos.make(m);
        if (pos.attacked(pos.kings[(pos.side ^ 8) >> 3], pos.side)) { pos.unmake(); continue; }
        legal++;
        let s;
        if (legal === 1) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
        else {
          let r = 0;
          if (depth >= 3 && legal > 3 && quiet && !inCheck && !pos.inCheck()) r = legal > 8 ? 2 : 1;
          s = -negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha && r) s = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha && s < beta) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
        }
        pos.unmake();
        if (stop) return 0;
        if (s > best) {
          best = s; bestMove = m;
          if (ply === 0) rootBest = m;
          if (s > alpha) {
            alpha = s;
            if (alpha >= beta) {
              if (quiet) {
                const k = Math.min(ply, 127) * 2;
                if (killers[k] !== m) { killers[k + 1] = killers[k]; killers[k] = m; }
                hist[pos.b[m & 127] * 128 + ((m >> 7) & 127)] += depth * depth;
              }
              break;
            }
          }
        }
      }
      if (!legal) return inCheck ? -MATE + ply : 0;
      let st = best;
      if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
      ttKey[ti] = pos.hh; ttMove[ti] = bestMove; ttScore[ti] = st; ttDepth[ti] = depth;
      ttFlag[ti] = best >= beta ? LOWER : best > alpha0 ? EXACT : UPPER;
      return best;
    }

    const rootMoves = pos.legalMoves();
    if (!rootMoves.length) return { move: 0, score: 0, depth: 0, nodes: 0 };
    if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, depth: 0, nodes: 0 };
    let bestMove = rootMoves[0], bestScore = 0, done = 0;
    for (let d = 1; d <= maxDepth; d++) {
      rootBest = 0;
      const s = negamax(d, -INF, INF, 0, false);
      if (rootBest && (!stop || rootBest)) { bestMove = rootBest; if (!stop) { bestScore = s; done = d; } }
      if (stop) break;
      if (Math.abs(s) > MATE - 200) break;
      if (Date.now() - t0 > timeMs * 0.55) break;
    }
    return { move: bestMove, score: bestScore, depth: done, nodes };
  }

  function perft(pos, depth) {
    if (depth === 0) return 1;
    let n = 0;
    const ms = pos.gen(false);
    for (const m of ms) {
      pos.make(m);
      if (!pos.attacked(pos.kings[(pos.side ^ 8) >> 3], pos.side)) n += depth === 1 ? 1 : perft(pos, depth - 1);
      pos.unmake();
    }
    return n;
  }

  return { Position, think, perft, evaluate, START, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    F_EP, F_CASTLE, F_DOUBLE, sqName, parseSq, VAL };
}

if (typeof module !== 'undefined') module.exports = createEngine;
