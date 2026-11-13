"""UI-test af Gambit i headless Chrome:  python3 apps/gambit/test/ui.py"""
import asyncio, os, sys, json, subprocess, socket, time
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); WEB = os.path.join(HERE, "..", "web"); OUT = "/tmp/tt"
def free_port():
    s = socket.socket(); s.bind(("", 0)); p = s.getsockname()[1]; s.close(); return p
fails = []
def check(name, cond, info=""):
    print(("OK  " if cond else "FEJL"), name, info if not cond else "", flush=True)
    if not cond: fails.append(name)
async def main():
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=WEB, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.6)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
            pg = await ctx.new_page(); errs = []
            await pg.add_init_script("if (localStorage.getItem('__next')) { localStorage.setItem('gambit.v1', localStorage.getItem('__next')); localStorage.removeItem('__next'); }")
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and "404" not in m.text and errs.append(m.text))
            n = [0]
            async def shot(tag): n[0] += 1; await pg.wait_for_timeout(300); await pg.screenshot(path=f"{OUT}/gambit{n[0]:02d}_{tag}.png")
            dbg = lambda: pg.evaluate("gambitDebug()")
            async def sq(name):            # tryk på et felt (brættet set fra den side, der er nederst)
                flipped = await pg.evaluate("document.querySelector('#squares .sq .coord.r').textContent === '1'")
                f, r = "abcdefgh".index(name[0]), int(name[1])
                col, row = (7 - f, r - 1) if flipped else (f, 8 - r)
                box = await pg.locator("#board").bounding_box()
                await pg.mouse.click(box["x"] + (col + .5) * box["width"] / 8, box["y"] + (row + .5) * box["height"] / 8)
            async def move(uci): await sq(uci[:2]); await pg.wait_for_timeout(80); await sq(uci[2:4]); await pg.wait_for_timeout(120)
            async def wait_turn(ms=8000):
                t = time.time()
                while time.time() - t < ms / 1000:
                    d = await dbg()
                    if d["over"] or (not d["thinking"] and d["side"] == d["human"]): return d
                    await pg.wait_for_timeout(100)
                return await dbg()
            await pg.goto(f"http://localhost:{port}/index.html"); await pg.wait_for_timeout(500)
            check("nyt spil-ark vises ved første start", await pg.is_visible("#newScrim"))
            await pg.click("#newScrim [data-key=level] [data-v='1']"); await pg.click("#newScrim [data-key=tc] [data-v='5']"); await shot("nyt")
            await pg.click("#newStart"); await pg.wait_for_timeout(200)
            d = await dbg(); check("ur sat til 5 min", d["clock"] and d["clock"]["w"] == 300000, d)
            await move("e2e4"); d = await wait_turn(); check("computeren svarer", d["moves"] == 2, d)
            await pg.wait_for_timeout(1200); d2 = await dbg(); check("hvids ur tæller ned", d2["clock"]["w"] < 300000 - 800, d2["clock"])
            check("fortryd er slået fra med ur", await pg.is_disabled("#btnUndo"))
            await move("d2d4"); await wait_turn(); await move("g1f3"); d = await wait_turn(); check("tre træk spillet", d["moves"] == 6, d); await shot("spil")
            # blad i trækkene
            await pg.click("#moves .mv >> nth=1"); await pg.wait_for_timeout(150); d = await dbg(); check("gennemgang af træk åbner", d["view"] == 2, d)
            await pg.click("#navPrev"); await pg.click("#navPrev"); d = await dbg(); check("tilbage til start", d["view"] == 0, d)
            check("forrige er slået fra ved start", await pg.is_disabled("#navPrev"))
            await pg.click("#navNext"); await shot("blad")
            await sq("e7"); d = await dbg(); check("ingen træk mens man bladrer", d["moves"] == 6)
            await pg.click("#navClose"); d = await dbg(); check("luk gennemgang", d["view"] == -1)
            # mere: tema, lyd
            await pg.click("#btnMore"); await pg.click("#themeSeg [data-v=blaa]"); await shot("mere")
            col = await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--darksq').trim()"); check("tema skifter", col.upper() == "#7C9CBF", col)
            check("gennemgå er slået fra midt i partiet", await pg.is_disabled("#mRev"))
            # opgaver
            await pg.click("#mPuz"); await shot("opgaver_valg"); await pg.click("#puzScrim [data-set=m1]"); await pg.wait_for_timeout(200)
            d = await dbg(); check("opgave åbner", d["puz"] and d["puz"]["left"] == 1, d); await shot("opgave")
            sol = d["puz"]["sol"]
            # et forkert træk først: find et lovligt, der ikke er løsningen
            wrong = await pg.evaluate("""(sol) => { const E = createEngine(), p = new E.Position(gambitDebug().puz.fen); for (const m of p.legalMoves()) { const u = p.uci(m); if (u.slice(0,4) !== sol.slice(0,4) && u.length === 4) { p.make(m); const mate = !p.legalMoves().length && p.inCheck(); p.unmake(); if (!mate) return u; } } return ''; }""", sol)
            await move(wrong); await pg.wait_for_timeout(200); st = await pg.text_content("#status"); check("forkert træk afvises", "prøv igen" in st.lower(), st)
            await pg.wait_for_timeout(1000); d = await dbg(); check("stillingen sættes tilbage", not d["puz"]["done"] and d["puz"]["sol"] == sol, d)
            await pg.click("#pzHint"); await shot("opgave_tip")
            await move(sol); await pg.wait_for_timeout(300); d = await dbg(); check("mat i 1 løses", d["puz"]["done"] and d["solved"]["m1"] == [0], d); await shot("opgave_loest")
            await pg.click("#pzNext"); d = await dbg(); check("næste opgave", d["puz"]["idx"] == 1, d)
            await pg.click("#pzClose"); d = await dbg(); check("tilbage til partiet", d["puz"] is None and d["moves"] == 6, d)
            # mat i 2 – tre opgaver
            for k in range(3):
                await pg.click("#btnMore"); await pg.click("#mPuz"); await pg.click("#puzScrim [data-set=m2]"); await pg.wait_for_timeout(200)
                d = await dbg(); await move(d["puz"]["sol"])
                if len(d["puz"]["sol"]) > 4: await pg.click("#promos button >> nth=0")
                await pg.wait_for_timeout(1000); d = await dbg()
                if not d["puz"]["done"]:
                    check(f"mat i 2 nr. {k+1}: første træk godkendt", d["puz"]["left"] == 1 and not d["puz"]["busy"], d)
                    if k == 0: await shot("mat2_midt")
                    await move(d["puz"]["sol"])
                    if len(d["puz"]["sol"]) > 4: await pg.click("#promos button >> nth=0")
                    await pg.wait_for_timeout(300); d = await dbg()
                check(f"mat i 2 nr. {k+1} løses", d["puz"]["done"], d)
                await pg.click("#pzClose")
            d = await dbg(); check("tre mat i 2 gemt", len(d["solved"]["m2"]) == 3, d["solved"])
            # giv op + gennemgang
            await pg.click("#btnMore"); await pg.click("#mResign"); await pg.wait_for_timeout(900)
            d = await dbg(); check("giv op afslutter partiet", d["over"] == "resign", d); await shot("opgivet")
            await pg.click("#endLook"); await pg.click("#btnMore"); await pg.click("#mRev")
            for _ in range(80):
                await pg.wait_for_timeout(250)
                if await pg.is_visible("#revScrim"): break
            d = await dbg(); check("gennemgang færdig", d["review"] and len(d["marks"]) == 6, d); await shot("gennemgang")
            await pg.click("#revGo"); d = await dbg(); check("se trækkene åbner bladring", d["view"] >= 0, d); await shot("gennemgang_blad")
            # genindlæs: alt huskes
            await pg.reload(); await pg.wait_for_timeout(500); d = await dbg()
            check("husker efter genstart", d["over"] == "resign" and d["review"] and d["solved"]["m1"] == [0], d)
            # tid løber ud
            await pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('gambit.v1')); s.resigned = ''; s.review = null; s.recorded = false; s.clock = { w: 1200, b: 300000, inc: 0 }; s.moves = s.moves.slice(0, 6); localStorage.setItem('__next', JSON.stringify(s)); }""")
            await pg.reload(); await pg.wait_for_timeout(2600); d = await dbg(); check("tiden løber ud → tabt på tid", d["over"] == "time", d); await shot("tid")
            # 2 spillere, skolemat, lyd uden fejl
            await pg.click("#endNew"); await pg.click("#newScrim [data-key=mode] [data-v=pvp]"); await pg.click("#newScrim [data-key=tc] [data-v='0']"); await pg.click("#newStart")
            for u in ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]: await move(u)
            await pg.wait_for_timeout(900); d = await dbg(); check("skolemat i 2 spillere", d["over"] == "mate", d); await shot("mat")
            check("fortryd virker uden ur", not await pg.is_disabled("#btnUndo"))
            # 1.2: åbning og PGN
            check("åbning genkendes", d["opening"] == "Løberspil", d["opening"])
            check("PGN med engelske brikbogstaver og resultat", "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0" in d["pgn"] and '[Opening "Løberspil"]' in d["pgn"] and '[Result "1-0"]' in d["pgn"], d["pgn"])
            await pg.click("#endPgn"); await pg.wait_for_timeout(150); check("del-arket viser partiet", await pg.is_visible("#pgnScrim") and "Qxf7#" in await pg.input_value("#pgnText")); await shot("pgn")
            await pg.click("#pgnCopy"); await pg.wait_for_timeout(150); await pg.click("#pgnClose")
            await pg.click("#btnUndo"); d = await dbg(); check("fortryd efter mat", d["moves"] == 6 and d["over"] is None, d)
            check("PGN for uafsluttet parti ender på *", d["pgn"].strip().endswith("*") and '[Result "*"]' in d["pgn"], d["pgn"])
            await pg.click("#moves .mv >> nth=2"); t = await pg.text_content("#navText"); check("åbning vises ved bladring", "Løberspil" in t, t); await pg.click("#navClose")
            # 1.2: dagens opgave
            await pg.click("#btnMore"); t = await pg.text_content("#mPuzSub"); check("mere viser at dagens opgave venter", "Dagens opgave venter" in t, t)
            await pg.click("#mPuz"); await shot("opgaver_dagens"); await pg.click("#pzDaily"); await pg.wait_for_timeout(200)
            d = await dbg(); check("dagens opgave åbner", d["puz"] and d["puz"]["daily"] and d["puz"]["set"] == d["daily"]["set"] and d["puz"]["idx"] == d["daily"]["idx"], d)
            t = await pg.text_content("#modeLabel"); check("etiket: dagens opgave", t.startswith("Dagens opgave"), t)
            for _ in range(2):
                d = await dbg()
                if d["puz"]["done"]: break
                await move(d["puz"]["sol"])
                if len(d["puz"]["sol"]) > 4: await pg.click("#promos button >> nth=0")
                await pg.wait_for_timeout(1000)
            d = await dbg(); check("dagens opgave løst, 1 dag i træk", d["puz"]["done"] and d["daily"]["done"] and d["daily"]["streak"] == 1, d)
            t = await pg.text_content("#status"); check("status viser dage i træk", "1 dag i træk" in t, t); await shot("dagens_loest")
            await pg.click("#pzClose"); await pg.click("#btnMore"); await pg.click("#mPuz"); t = await pg.text_content("#pzD"); check("opgavearket: løst i dag", "Løst i dag" in t and "1 dag i træk" in t, t)
            await pg.click("#puzCancel")
            # i går løst → 2 i træk; i forgårs → forfra
            r = await pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('gambit.v1')); const t = s.daily.last; s.daily = { last: t - 1, streak: 4, best: 6 }; s.ver = '1.1.0'; localStorage.setItem('__next', JSON.stringify(s)); return t; }""")
            await pg.reload(); await pg.wait_for_timeout(500)
            check("nyt-ark efter opdatering", await pg.is_visible("#newsScrim")); await shot("nyt_i"); await pg.click("#newsClose")
            d = await dbg(); check("streak holder fra i går", (not d["daily"]["done"]) and d["daily"]["streak"] == 4 and d["daily"]["best"] == 6, d["daily"])
            await pg.reload(); await pg.wait_for_timeout(400); check("nyt-ark vises kun én gang", not await pg.is_visible("#newsScrim"))
            await pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('gambit.v1')); s.daily.last -= 1; localStorage.setItem('__next', JSON.stringify(s)); }""")
            await pg.reload(); await pg.wait_for_timeout(400); d = await dbg(); check("streak nulstilles efter en sprunget dag", d["daily"]["streak"] == 0, d["daily"])
            # alle opgaver har stadig præcis én løsning (også de nye)
            bad = await pg.evaluate("""() => { const E = createEngine(), out = []; const fm = (p, n) => { let c = 0; for (const m of p.legalMoves()) { p.make(m); const r = p.legalMoves(); let ok; if (!r.length) ok = p.inCheck(); else if (n > 1) { ok = true; for (const x of r) { p.make(x); const f = fm(p, n - 1); p.unmake(); if (!f) { ok = false; break; } } } else ok = false; p.unmake(); if (ok) c++; } return c; };
              for (const set of ['m1', 'm2']) PUZZLES[set].forEach((z, i) => { const p = new E.Position(z[0]); if (fm(p, set === 'm1' ? 1 : 2) !== 1 || (set === 'm2' && fm(p, 1) !== 0)) out.push(set + i); }); return [out, PUZZLES.m1.length, PUZZLES.m2.length, new Set(PUZZLES.m1.concat(PUZZLES.m2).map(z => z[0].split(' ')[0])).size]; }""")
            check("alle opgaver entydige og uden dubletter", not bad[0] and bad[3] == bad[1] + bad[2], bad)
            # liggende
            await pg.set_viewport_size({"width": 900, "height": 420}); await shot("liggende")
            check("ingen JS-fejl", not errs, errs[:3])
            await b.close()
    finally: srv.terminate()
    print("FEJL: " + ", ".join(fails) if fails else "ALT OK")
asyncio.run(main())
