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
            res = await pg.evaluate("""(async () => { let bad = 0, steps = 0, stuck = 0; for (let k = 0; k < 400 && !_t.G.done; k++) { const h = _t.findHint(); if (!h) break; const before = _t.G.moves;
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
            await pg.click("#wNew"); await pg.wait_for_timeout(400); d = await pg.evaluate(INTEGRITY); check("ny kabale efter sejr", ok(d) and d["moves"] == 0 and not d["done"], d)
            await pg.click("#btnSet"); await pg.click("#sheet [data-d='3']"); await pg.evaluate("Kit.closeSheet()"); await pg.click("#bNew"); await pg.wait_for_timeout(300)
            box = await pg.evaluate("(() => { const G = _t.G, el = _t.els.get(G.stock[G.stock.length - 1]).getBoundingClientRect(); return [el.x + el.width / 2, el.y + el.height / 2]; })()")
            await pg.mouse.click(box[0], box[1]); await pg.wait_for_timeout(300); d = await pg.evaluate(INTEGRITY); check("træk 3 trækker tre kort", d["waste"] == 3, d); await shot("traek3")
            await pg.click("[data-tab=stats]"); await shot("stats")
            await pg.click("[data-tab=spil]"); await pg.click("#btnSet"); await pg.click("#sheet [data-t=light]"); await pg.evaluate("Kit.closeSheet()"); await shot("lyst")
            check("ingen JS-fejl", not errs, errs[:3]); await b.close()
    finally: srv.terminate()
    print("FEJL: " + ", ".join(fails) if fails else "ALT OK")
asyncio.run(main())
