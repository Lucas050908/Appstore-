"""UI-test af Kabale:  python3 shared/tests/kabale.py"""
import asyncio, os, sys, subprocess, socket, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); WEB = os.path.join(ROOT, "apps/kabale/app/src/main/assets"); OUT = "/tmp/tt"
fails = []
def check(name, cond, info=""):
    print(("OK  " if cond else "FEJL"), name, info if not cond else "", flush=True)
    if not cond: fails.append(name)
INTEGRITY = """(() => { const G = _t.G; const all = [...G.stock, ...G.waste, ...G.found.flat(), ...G.tab.flat().map(x => x.c)]; const okF = G.found.every(p => p.every((c, i) => c % 13 === i && ((c / 13) | 0) === ((p[0] / 13) | 0)));
  const okT = G.tab.every(p => p.every((x, i) => { if (!i || !x.up || !p[i-1].up) return true; const a = p[i-1].c, b = x.c, red = c => { const s = (c / 13) | 0; return s === 1 || s === 2; }; return red(a) !== red(b) && a % 13 === b % 13 + 1; }));
  const okUp = G.tab.every(p => !p.length || p[p.length - 1].up);
  return { n: all.length, uniq: new Set(all).size, okF, okT, okUp, found: G.found.map(p => p.length), moves: G.moves, done: G.done, stock: G.stock.length, waste: G.waste.length }; })()"""
async def main():
    s = socket.socket(); s.bind(("", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=WEB, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.6)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="dark", has_touch=True)
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and "404" not in m.text and errs.append(m.text))
            n = [0]
            async def shot(tag): n[0] += 1; await pg.wait_for_timeout(400); await pg.screenshot(path=f"{OUT}/kabale{n[0]}_{tag}.png")
            ok = lambda d: d["n"] == 52 and d["uniq"] == 52 and d["okF"] and d["okT"] and d["okUp"]
            await pg.goto(f"http://localhost:{port}/index.html"); await pg.wait_for_timeout(600); await shot("start")
            d = await pg.evaluate(INTEGRITY); check("52 kort delt ud", ok(d) and d["stock"] == 24, d)
            # træk fra bunken med et rigtigt tryk
            await pg.click("#stockSlot", force=True) if False else None
            box = await pg.evaluate("(() => { const G = _t.G, el = _t.els.get(G.stock[G.stock.length - 1]).getBoundingClientRect(); return [el.x + el.width / 2, el.y + el.height / 2]; })()")
            await pg.mouse.click(box[0], box[1]); await pg.wait_for_timeout(300); d = await pg.evaluate(INTEGRITY); check("tryk på bunken trækker et kort", d["waste"] == 1 and d["stock"] == 23, d)
            # træk-og-slip: find et lovligt træk mellem kolonner
            mv = await pg.evaluate("""(() => { const G = _t.G; for (let t = 0; t < 7; t++) { const p = G.tab[t]; for (let i = 0; i < p.length; i++) { if (!p[i].up) continue; for (let u = 0; u < 7; u++) if (u !== t && G.tab[u].length && _t.canTab(p[i].c, u)) {
                const a = _t.els.get(p[i].c).getBoundingClientRect(), q = G.tab[u][G.tab[u].length - 1], bb = _t.els.get(q.c).getBoundingClientRect(); return { c: p[i].c, t, u, from: [a.x + a.width / 2, a.y + 12], to: [bb.x + bb.width / 2, bb.y + 30] }; } } } return null; })()""")
            if mv:
                await pg.mouse.move(*mv["from"]); await pg.mouse.down(); await pg.mouse.move(mv["from"][0] + 20, mv["from"][1] + 20, steps=3); await pg.mouse.move(*mv["to"], steps=6); await shot("traek"); await pg.mouse.up(); await pg.wait_for_timeout(300)
                where = await pg.evaluate(f"_t.G.tab.findIndex(p => p.some(x => x.c === {mv['c']}))"); check("træk-og-slip flytter kortet", where == mv["u"], (mv, where))
                await pg.click("#bUndo"); await pg.wait_for_timeout(250); where = await pg.evaluate(f"_t.G.tab.findIndex(p => p.some(x => x.c === {mv['c']}))"); check("fortryd lægger kortet tilbage", where == mv["t"], where)
            else: print("     (ingen kolonnetræk i denne kabale – springer træk-testen over)")
            # spil 400 træk med tip-motoren og tjek at bordet altid er lovligt
            res = await pg.evaluate("""(async () => { let bad = 0, steps = 0, stuck = 0; for (let k = 0; k < 400 && !_t.G.done && _t.G.found.flat().length < 40; k++) { const h = _t.findHint(); if (!h) break; const before = _t.G.moves;
                if (h.from === 'stock') _t.drawStock(); else if (!_t.autoMove(h)) { _t.drawStock(); }
                steps++; if (_t.G.moves === before) { stuck++; if (stuck > 3) break; }
                const G = _t.G, all = [...G.stock, ...G.waste, ...G.found.flat(), ...G.tab.flat().map(x => x.c)]; if (all.length !== 52 || new Set(all).size !== 52) bad++; }
                return { bad, steps }; })()""")
            d = await pg.evaluate(INTEGRITY); check("400 automatiske træk holder bordet lovligt", res["bad"] == 0 and ok(d), (res, d)); await shot("midt")
            await pg.click("#bHint"); await pg.wait_for_timeout(200)
            # genstart husker
            m0 = d["moves"]; await pg.reload(); await pg.wait_for_timeout(500); d2 = await pg.evaluate(INTEGRITY); check("spillet huskes efter genstart", ok(d2) and d2["moves"] == m0 and d2["found"] == d["found"], d2)
            # næsten færdig kabale → Læg op → vundet
            await pg.evaluate("""(() => { const G = _t.G; G.found = [0,1,2,3].map(s => [...Array(11).keys()].map(r => s * 13 + r)); G.stock = []; G.waste = []; G.tab = [[{c:12,up:true},{c:37,up:true}],[{c:25,up:true},{c:50,up:true}],[{c:38,up:true},{c:11,up:true}],[{c:51,up:true},{c:24,up:true}],[],[],[]]; G.done = false; G.counted = true; _t.D.stats.played = Math.max(1, _t.D.stats.played); })()""")
            await pg.click("[data-tab=stats]"); await pg.click("[data-tab=spil]"); await pg.wait_for_timeout(300); await shot("naesten")
            check("Læg op er fremhævet når alt er vendt", await pg.evaluate("document.querySelector('#bAuto').classList.contains('go')"))
            await pg.click("#bAuto"); await pg.wait_for_timeout(2200); d = await pg.evaluate(INTEGRITY); check("Læg op vinder kabalen", d["done"] and d["found"] == [13, 13, 13, 13], d); await shot("vundet")
            st = await pg.evaluate("_t.D.stats"); check("statistik tæller sejren", st["won"] == 1 and st["streak"] == 1, st)
            await pg.click("#wNew"); await pg.click("#sheet [data-k=new]"); await pg.wait_for_timeout(900); d = await pg.evaluate(INTEGRITY); check("ny kabale efter sejr", ok(d) and d["moves"] == 0 and not d["done"], d)
            await pg.click("#btnSet"); await pg.click("#sheet [data-d='3']"); await pg.evaluate("Kit.closeSheet()"); await pg.click("#bNew"); await pg.click("#sheet [data-k=new]"); await pg.wait_for_timeout(1500)
            box = await pg.evaluate("(() => { const G = _t.G, el = _t.els.get(G.stock[G.stock.length - 1]).getBoundingClientRect(); return [el.x + el.width / 2, el.y + el.height / 2]; })()")
            await pg.mouse.click(box[0], box[1]); await pg.wait_for_timeout(300); d = await pg.evaluate(INTEGRITY); check("træk 3 trækker tre kort", d["waste"] == 3, d); await shot("traek3")
            await pg.click("[data-tab=stats]"); await shot("stats")
            await pg.click("[data-tab=spil]"); await pg.click("#btnSet"); await pg.click("#sheet [data-t=light]"); await pg.evaluate("Kit.closeSheet()"); await shot("lyst")
            # 1.1: løsbare kabaler, dagens kabale, auto-læg-op, venstrehåndet
            r = await pg.evaluate("""(() => { const out = {}; for (const draw of [1, 3]) { const t0 = performance.now(); let sure = 0, wins = 0; const N = 12; for (let k = 0; k < N; k++) { const st = _t.makeDeal(_t.mulberry(100 + k), draw, true); if (st.sure) { sure++; let w = false; for (let j = 0; j < 40 && !w; j++) w = _t.playout(st, _t.mulberry(900 + j)); if (w) wins++; } } out[draw] = { sure, wins, ms: Math.round((performance.now() - t0) / N) }; }
              let raw = 0; for (let k = 0; k < 40; k++) { const st = _t.setup(_t.mulberry(5000 + k), 1); for (let j = 0; j < 20; j++) if (_t.playout(st, _t.mulberry(j + 1))) { raw++; break; } } out.raw = raw; return out; })()""")
            print("     løsbare:", r)
            check("løsbare kabaler findes (træk 1)", r["1"]["sure"] == 12 and r["1"]["wins"] >= 11, r)
            check("løsbare kabaler findes (træk 3)", r["3"]["sure"] >= 10, r)
            d0 = await pg.evaluate(INTEGRITY); check("simulering rører ikke det rigtige spil", ok(d0) and d0["moves"] == d["moves"], d0)
            await pg.evaluate("openHash('daily')"); await pg.wait_for_timeout(1200); g1 = await pg.evaluate("JSON.stringify([_t.G.daily, _t.G.tab, _t.G.stock])")
            await pg.evaluate("_t.deal(_t.G.daily)"); g2 = await pg.evaluate("JSON.stringify([_t.G.daily, _t.G.tab, _t.G.stock])"); check("dagens kabale er den samme hver gang", g1 == g2 and '"20' in g1, g1[:40])
            await pg.click("#btnSet"); await pg.evaluate("document.querySelector('#oUp').click(); document.querySelector('#oLeft').click()"); await shot("indst11"); await pg.evaluate("Kit.closeSheet()")
            sx = await pg.evaluate("document.querySelector('#stockSlot').getBoundingClientRect().x"); check("venstrehåndet flytter bunken", sx < 60, sx)
            await pg.evaluate("""(() => { const G = _t.G; G.found = [[0], [13], [26], [39]]; G.stock = []; G.waste = []; G.tab = [[{c:1,up:true}],[{c:14,up:true}],[{c:40,up:true},{c:27,up:true}],[],[],[],[]]; for (let c = 0; c < 52; c++) if (![0,13,26,39,1,14,40,27].includes(c)) G.tab[3 + c % 4].push({ c, up: true }); })()""")
            await pg.evaluate("_t.drawStock ? _t.move({from:'tab',t:0,i:0},{to:'found',f:0}) : 0"); await pg.wait_for_timeout(300); f = await pg.evaluate("_t.G.found.map(p => p.length)"); check("sikre kort lægges op automatisk", f[0] == 2 and f[1] == 2 and f[2] == 2 and f[3] == 2, f); await shot("venstre")
            check("ingen JS-fejl", not errs, errs[:3]); await b.close()
    finally: srv.terminate()
    print("FEJL: " + ", ".join(fails) if fails else "ALT OK")
asyncio.run(main())
