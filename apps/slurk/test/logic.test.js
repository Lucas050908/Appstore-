// Kør: node --test apps/slurk/test/logic.test.js
const test = require("node:test"), assert = require("node:assert/strict");
const S = require("../app/src/main/assets/games.js");

// Lille deterministisk rng
const rng = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

test("slurke: skala og ental/flertal", () => {
  assert.equal(S.sips(1), "1 slurk"); assert.equal(S.sips(2), "2 slurke");
  assert.deepEqual([1, 2, 3, 4].map(n => S.scale(n, 0)), [1, 1, 2, 2]);
  assert.deepEqual([1, 2, 3, 4].map(n => S.scale(n, 1)), [1, 2, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map(n => S.scale(n, 2)), [2, 3, 5, 6]);
  assert.equal(S.scale(2, 7), 2, "ukendt niveau = normal"); assert.equal(S.scale(2, undefined), 2);
});

test("draw: ingen gentagelser før alle er brugt, og aldrig samme to gange i træk", () => {
  const r = rng(7), bag = {};
  for (const n of [1, 2, 5, 73]) {
    const b = {}; let prev = -1;
    for (let round = 0; round < 30; round++) {
      const seen = new Set();
      for (let i = 0; i < n; i++) { const x = S.draw(b, n, r); assert.ok(x >= 0 && x < n); assert.ok(!seen.has(x)); seen.add(x); if (n > 1) assert.notEqual(x, prev); prev = x; }
      assert.equal(seen.size, n);
    }
  }
  // ødelagt eller forældet pose (fx efter en opdatering med flere kort) blandes forfra
  for (const bad of [{ o: [0, 0, 1], i: 0 }, { o: "x", i: 0 }, { o: [0, 1, 2], i: -1 }, { o: [0, 1, 9], i: 1 }, { o: [0, 1], i: 0 }, { o: [0, 1, 2], i: 1.5 }]) {
    const x = S.draw(bad, 3, r); assert.ok(x >= 0 && x < 3); assert.equal(bad.o.length, 3); assert.equal(new Set(bad.o).size, 3); assert.equal(bad.i, 1);
  }
  S.draw(bag, 4, r); assert.equal(JSON.parse(JSON.stringify(bag)).o.length, 4, "kan gemmes som JSON");
});

test("fill og need", () => {
  assert.equal(S.need("{a} og {b}"), 2); assert.equal(S.need("Alle tager {1}."), 0); assert.equal(S.need("{a} {a}"), 1);
  assert.equal(S.fill("{a}, giv {2} til {b}.", ["Ida", "Bo"], 1), "Ida, giv 2 slurke til Bo.");
  assert.equal(S.fill("{a} tager {1}.", ["Ida"], 0, n => `<b>${n}</b>`), "<b>Ida</b> tager 1 slurk.");
  assert.equal(S.fill("{a} tager {3}.", ["Ida"], 2), "Ida tager 5 slurke.");
  assert.equal(S.fill("{a} {a}", ["$&"], 1), "$& $&", "navne med specialtegn sættes råt ind");
});

test("indhold: nok kort, ingen dubletter, gyldige pladsholdere", () => {
  assert.ok(S.FEST.length >= 60); assert.ok(S.ALDRIG.length >= 55); assert.ok(S.MEST.length >= 50); assert.ok(S.BOMBE.length >= 40); assert.ok(S.FLASKE.length >= 8);
  for (const [name, list] of [["FEST", S.FEST.map(p => p.t)], ["ALDRIG", S.ALDRIG], ["MEST", S.MEST], ["BOMBE", S.BOMBE], ["FLASKE", S.FLASKE]]) {
    assert.equal(new Set(list.map(x => x.toLowerCase())).size, list.length, name + " har dubletter");
    for (const t of list) { assert.ok(t.trim() === t && t.length > 2, name + ": " + t); assert.ok(!/[<>&]/.test(t), name + " må ikke indeholde HTML-tegn: " + t); }
  }
  for (const p of S.FEST) {
    assert.ok(["", "alle", "duel", "regel", undefined].includes(p.k), p.t);
    assert.ok(/[.!?]$/.test(p.t), "slutter med tegn: " + p.t);
    const left = S.fill(p.t, ["A", "B", "C"], 1); assert.ok(!/[{}]/.test(left), "ukendt pladsholder: " + p.t);
    assert.ok(!p.t.includes("{c}"), "højst to navne pr. kort");
    if (p.t.includes("{b}")) assert.ok(p.t.includes("{a}"));
    if (p.k === "duel") assert.equal(S.need(p.t), 2);
    if (p.k === "regel") { assert.ok(p.r >= 3 && p.r <= 10 && p.e, p.t); assert.ok(!/[{}]/.test(S.fill(p.e, ["A", "B"], 1))); assert.ok(S.need(p.e) <= S.need(p.t)); }
    else assert.ok(!p.r && !p.e);
  }
  for (const t of S.FLASKE) { assert.equal(S.need(t), 1); assert.ok(!/[{}]/.test(S.fill(t, ["A"], 1))); }
  for (const t of [...S.ALDRIG, ...S.MEST]) assert.ok(!/[.!?{}]$/.test(t) && t[0] === t[0].toLowerCase(), t);
  assert.equal(S.KINGS.length, 13);
  for (const [n, t] of [...S.KINGS, S.KING_LAST]) { assert.ok(n && t); assert.ok(!/[{}]/.test(S.fill(t, [], 1))); }
  assert.equal(Object.keys(S.KIND).length, 5);
});

test("pick: retfærdig fordeling og forskellige spillere", () => {
  const r = rng(3), players = ["A", "B", "C", "D", "E"], counts = {};
  for (let i = 0; i < 100; i++) { const [a, b] = S.pick(players, counts, 2, r); assert.notEqual(a, b); assert.ok(players.includes(a) && players.includes(b)); }
  const v = players.map(p => counts[p]); assert.equal(Math.max(...v) - Math.min(...v), 0, "100 ture / 5 spillere = 20 hver");
  assert.deepEqual(S.pick(["X"], {}, 1, r), ["X"]);
  assert.equal(S.pick(["X", "Y"], {}, 5, r).length, 2, "aldrig flere end der er");
});

test("Fest: 2 spillere, regler starter og slutter, alle kort kan fyldes ud", () => {
  for (const players of [["Ida", "Bo"], ["A", "B", "C", "D", "E", "F"]]) {
    const r = rng(11), st = {}, bag = {}; let rules = 0, ends = 0; const seen = new Set();
    for (let i = 0; i < 600; i++) {
      const c = S.festNext(st, players, bag, r); assert.ok(c);
      const txt = S.fill(c.p.t, c.names, 1); assert.ok(!/[{}]/.test(txt), txt); assert.ok(S.KIND[c.kind] !== undefined);
      assert.equal(new Set(c.names).size, c.names.length);
      if (c.kind === "regel") { rules++; assert.ok(st.rules.some(x => x.p === c.p)); }
      if (c.kind === "slut") ends++; else seen.add(c.p.t);
      assert.ok(st.rules.length <= 4, "højst få aktive regler ad gangen");
      for (const x of st.rules) assert.ok(x.left >= 0);
    }
    assert.equal(seen.size, S.FEST.length, "alle kort kommer i spil");
    assert.ok(rules > 10 && ends >= rules - 4 && ends <= rules);
  }
  // en regel på r kort slutter præcis r kort senere
  const st = {}, bag = {}, r = rng(5); let since = -1, len = 0;
  for (let i = 0; i < 300; i++) {
    const c = S.festNext(st, ["A", "B", "C"], bag, r);
    if (since >= 0 && c.kind !== "slut") since++;
    if (c.kind === "slut" && since >= 0) { assert.equal(since, len); since = -1; }
    else if (c.kind === "regel" && since < 0 && !st.rules.some(x => x.p !== c.p)) { since = 0; len = c.p.r; }
  }
  assert.equal(S.festNext({}, [], {}, rng(1)).names.length, 0, "uden spillere trækkes kun kort uden navne");
});

test("kort: 52 unikke, 4 farver, 13 værdier", () => {
  const d = S.newDeck(rng(2)); assert.ok(S.validDeck(d));
  const cs = d.map(S.card); assert.equal(cs.filter(c => c.red).length, 26); assert.equal(cs.filter(c => c.rank === 12).length, 4);
  assert.ok(!S.validDeck([1, 2, 3])); assert.ok(!S.validDeck(null)); assert.ok(!S.validDeck([...d.slice(1), d[1]]));
  assert.equal(S.card(0).label, "A"); assert.equal(S.card(12).label, "K"); assert.equal(S.card(51).label, "K");
});

test("Kongekort: slutter ved fjerde konge, aldrig før", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = S.kingsNew(rng(seed)); assert.ok(S.kingsValid(s)); let n = 0, kings = 0, last = null;
    while (!S.kingsOver(s)) { const d = S.kingsDraw(s); n++; if (d.card.rank === 12) kings++; assert.equal(d.last, d.card.rank === 12 && kings === 4); assert.equal(d.over, kings === 4); last = d; assert.ok(S.kingsValid(s)); }
    assert.equal(kings, 4); assert.ok(n >= 4 && n <= 52); assert.equal(last.name, "Fjerde konge"); assert.equal(S.kingsDraw(s), null); assert.equal(s.turn, n);
  }
  assert.ok(!S.kingsValid({ deck: [1], i: 0, kings: 0, turn: 0 })); assert.ok(!S.kingsValid(null)); assert.ok(!S.kingsValid({ ...S.kingsNew(), kings: 5 }));
});

test("Højere eller lavere: resultat, række og slurke", () => {
  assert.equal(S.hiVal(0), 14); assert.equal(S.hiVal(1), 2); assert.equal(S.hiVal(12), 13); assert.equal(S.hiVal(13), 14);
  const mk = (cur, nxt, streak = 0) => ({ deck: [cur, nxt], i: 1, cur, streak, turn: 0 });
  let s = mk(4, 9); assert.deepEqual(S.hiGuess(s, "op"), { res: "ret", card: 9, sips: 0 }); assert.equal(s.streak, 1); assert.equal(s.cur, 9); assert.equal(s.turn, 0);
  s = mk(4, 9, 2); assert.deepEqual(S.hiGuess(s, "ned"), { res: "fejl", card: 9, sips: 3 }); assert.equal(s.streak, 0); assert.equal(s.turn, 1);
  s = mk(4, 17, 1); assert.deepEqual(S.hiGuess(s, "op"), { res: "ens", card: 17, sips: 4 }, "samme værdi koster dobbelt");
  s = mk(0, 12); assert.equal(S.hiGuess(s, "ned").res, "ret", "es er højest");
  s = mk(4, 9, 40); assert.equal(S.hiGuess(s, "ned").sips, 6, "loft på 6");
  // et helt spil: bunken blandes igen uden fejl og uden at det aktuelle kort går igen med det samme
  const r = rng(9); s = S.hiNew(r);
  for (let i = 0; i < 500; i++) { const cur = s.cur, g = S.hiGuess(s, r() < .5 ? "op" : "ned", r); assert.notEqual(g.card, cur); assert.ok(g.card >= 0 && g.card < 52); assert.ok(g.sips >= 0 && g.sips <= 12); }
});

test("Meyer: rangorden, meldinger og løft", () => {
  assert.equal(S.MEYER.length, 21); assert.equal(new Set(S.MEYER).size, 21);
  const all = new Set(); for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) { const v = S.meyerVal(a, b); assert.ok(S.meyerRank(v) >= 0, String(v)); all.add(v); assert.equal(v, S.meyerVal(b, a)); }
  assert.equal(all.size, 21);
  const R = S.meyerRank;
  assert.ok(R(21) > R(31) && R(31) > R(66) && R(66) > R(11) && R(11) > R(65) && R(65) > R(64) && R(41) > R(32)); assert.equal(R(32), 0); assert.equal(R(21), 20);
  assert.equal(S.meyerName(21), "Meyer"); assert.equal(S.meyerName(31), "Lille Meyer"); assert.equal(S.meyerName(44), "Par 4"); assert.equal(S.meyerName(64), "64");
  assert.equal(S.meyerClaims(null).length, 21); assert.deepEqual(S.meyerClaims(21), [21]); assert.deepEqual(S.meyerClaims(66), [66, 31, 21]); assert.ok(S.meyerClaims(54).includes(54));
  assert.deepEqual(S.meyerLift(64, 64), { liar: false, sips: 2 }); assert.deepEqual(S.meyerLift(64, 65), { liar: true, sips: 2 });
  assert.deepEqual(S.meyerLift(66, 54), { liar: false, sips: 2 }, "man må gerne melde lavere, end man slog");
  assert.deepEqual(S.meyerLift(21, 21), { liar: false, sips: 4 }); assert.deepEqual(S.meyerLift(32, 21), { liar: true, sips: 4 });
  const r = rng(4); for (let i = 0; i < 500; i++) { const [a, b] = S.roll(r); assert.ok(a >= 1 && a <= 6 && b >= 1 && b <= 6); }
});

test("Bomben og Flasken", () => {
  const r = rng(8);
  for (let i = 0; i < 300; i++) { const ms = S.bombMs(r); assert.ok(ms >= 14000 && ms <= 40000); }
  assert.equal(S.tickGap(100000), 1000); assert.equal(S.tickGap(0), 130); assert.equal(S.tickGap(6000), 500);
  for (const n of [1, 2, 3, 5, 8, 12]) {
    let cur = 0; const hits = new Set();
    for (let i = 0; i < 400; i++) {
      const sp = S.spin(n, cur, r); assert.ok(sp.idx >= 0 && sp.idx < n);
      assert.ok(sp.angle - cur >= 360 * 2.5, "drejer mindst et par omgange"); assert.ok(sp.angle - cur <= 360 * 7);
      assert.equal(S.pointed(sp.angle, n), sp.idx, `n=${n} vinkel=${sp.angle}`); cur = sp.angle; hits.add(sp.idx);
    }
    assert.equal(hits.size, n, "alle spillere kan rammes");
  }
  assert.equal(S.pointed(-10, 4), 0); assert.equal(S.pointed(350, 4), 0); assert.equal(S.pointed(100, 4), 1);
});

test("spillere: trim, loft og dubletter", () => {
  const l = [];
  assert.equal(S.addPlayer(l, "  Ida   Marie "), ""); assert.deepEqual(l, ["Ida Marie"]);
  assert.equal(S.addPlayer(l, "ida marie"), "findes"); assert.equal(S.addPlayer(l, "   "), "tom"); assert.equal(S.addPlayer(l, null), "tom");
  assert.equal(S.addPlayer(l, "x".repeat(40)), ""); assert.equal(l[1].length, S.MAXNAME);
  for (let i = 0; i < 20; i++) S.addPlayer(l, "P" + i);
  assert.equal(l.length, S.MAXP); assert.equal(S.addPlayer(l, "Ny"), "fuld");
  assert.deepEqual(S.cleanPlayers(["A", "a", 5, "", " B ", null]), ["A", "B"]); assert.deepEqual(S.cleanPlayers("x"), []); assert.deepEqual(S.cleanPlayers(undefined), []);
});
