"""UI-test af Sudoku:  python3 shared/tests/sudoku.py"""
import asyncio, os, sys, subprocess, socket, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); WEB = os.path.join(ROOT, "apps/sudoku/app/src/main/assets"); OUT = "/tmp/tt"
fails = []
def check(name, cond, info=""):
    print(("OK  " if cond else "FEJL"), name, info if not cond else "", flush=True)
    if not cond: fails.append(name)
async def main():
    s = socket.socket(); s.bind(("", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=WEB, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.6)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="dark")
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and "404" not in m.text and errs.append(m.text))
            n = [0]
            async def shot(tag): n[0] += 1; await pg.wait_for_timeout(350); await pg.screenshot(path=f"{OUT}/sudoku{n[0]}_{tag}.png")
            g = lambda: pg.evaluate("(() => { const G = _t.G; return G && { v: G.v.join(''), sol: G.sol, puzzle: G.puzzle, n: G.n, time: G.time, mistakes: G.mistakes, hints: G.hints, done: G.done, level: G.level, daily: G.daily }; })()")
            async def put(i, d): await pg.click(f"#grid .c >> nth={i}"); await pg.click(f".pad [data-d='{d}']")
            await pg.goto(f"http://localhost:{port}/index.html"); await pg.wait_for_timeout(500); await shot("tom")
            await pg.click("#start"); await shot("niveau"); await pg.click("#sheet [data-l=let]"); await pg.wait_for_timeout(300)
            G = await g(); check("let har 40 givne tal", G["puzzle"].count("0") == 41, G["puzzle"])
            empty = [i for i in range(81) if G["puzzle"][i] == "0"]
            # noter
            await pg.click(f"#grid .c >> nth={empty[0]}"); await pg.click("#tNotes"); await pg.click(".pad [data-d='3']"); await pg.click(".pad [data-d='7']")
            G2 = await g(); check("noter sættes", G2["n"][empty[0]] == (1 << 3 | 1 << 7), G2["n"][empty[0]]); await shot("noter")
            await pg.click("#tNotes")
            # forkert tal → fejl
            wrong = next(d for d in "123456789" if d != G["sol"][empty[1]])
            await put(empty[1], wrong); G2 = await g(); check("forkert tal tæller som fejl", G2["mistakes"] == 1 and G2["v"][empty[1]] == wrong, G2["mistakes"])
            check("feltet markeres rødt", await pg.evaluate(f"document.querySelectorAll('#grid .c')[{empty[1]}].classList.contains('bad')")); await shot("fejl")
            await pg.click("#tUndo"); G2 = await g(); check("fortryd fjerner tallet", G2["v"][empty[1]] == "0", G2["v"])
            # tip
            await pg.click(f"#grid .c >> nth={empty[2]}"); await pg.click("#tHint"); G2 = await g(); check("tip udfylder feltet", G2["v"][empty[2]] == G["sol"][empty[2]] and G2["hints"] == 2, G2["hints"])
            # pause
            await pg.click("#pz"); check("pause skjuler brættet", await pg.evaluate("!!document.querySelector('.board.paused')")); await shot("pause"); await pg.click("#pz")
            # genstart husker
            await pg.reload(); await pg.wait_for_timeout(400); G3 = await g(); check("spillet huskes efter genstart", G3 and G3["v"] == G2["v"] and G3["n"][empty[0]] == G2["n"][empty[0]], G3)
            # løs resten
            for i in empty:
                cur = (await g())["v"][i]
                if cur != G["sol"][i]: await put(i, G["sol"][i])
            await pg.wait_for_timeout(800); G4 = await g(); check("opgaven løses", G4["done"], G4); await shot("loest")
            st = await pg.evaluate("_t.D.stats"); check("statistik opdateret", st["let"]["won"] == 1 and st["let"]["played"] == 1, st)
            await pg.click("#wClose"); await pg.click("[data-tab=stats]"); await shot("stats")
            # dagens sudoku er den samme hver gang
            await pg.click("[data-tab=spil]"); await pg.click("#again"); await pg.click("#sheet [data-daily]"); await pg.wait_for_timeout(300); d1 = await g()
            check("dagens sudoku starter", d1["daily"] and d1["level"] == "mellem" and d1["puzzle"].count("0") == 48, d1)
            p2 = await pg.evaluate("(() => { const today = _t.G.daily; let h = 2166136261; const s = 'sudoku' + today; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return _t.generate('mellem', _t.mulberry(h >>> 0)).puzzle; })()")
            check("dagens sudoku er ens for alle", p2 == d1["puzzle"])
            for i in range(81):
                if d1["puzzle"][i] == "0": await put(i, d1["sol"][i])
            await pg.wait_for_timeout(700); dd = await pg.evaluate("_t.D.daily"); check("dagens gemmes", len(dd) == 1, dd); await shot("dagens_loest")
            await pg.click("#wClose"); await pg.click("#btnSet"); await shot("indstillinger")
            await pg.click("#sheet [data-t=light]"); await pg.evaluate("Kit.closeSheet()"); await shot("lyst")
            # 1.1: tal først, udfyld noter, kalender, backup-række
            await pg.click("[data-tab=spil]"); await pg.click("#again"); await pg.click("#sheet [data-l=let]"); await pg.wait_for_timeout(300); G = await g()
            empty = [i for i in range(81) if G["puzzle"][i] == "0"]
            await pg.click("#tNotes"); await pg.click("#fillN"); G2 = await g()
            ok = all(G2["n"][i] & (1 << int(G["sol"][i])) for i in empty) and all(G2["n"][i] == 0 for i in range(81) if G["puzzle"][i] != "0")
            check("udfyld noter indeholder altid løsningen", ok); await shot("noter_alle"); await pg.click("#tNotes")
            await pg.click("#btnSet"); await pg.evaluate("document.querySelector('#oNum').click()"); check("backup-række i indstillinger", await pg.locator("#kBk").count() == 1); await shot("indst11"); await pg.evaluate("Kit.closeSheet()")
            d = G["sol"][empty[0]]; cells = [i for i in empty if G["sol"][i] == d][:3]
            await pg.click(f".pad [data-d='{d}']"); check("tal først låser tallet", await pg.evaluate("_t.lockD") == int(d))
            for i in cells: await pg.click(f"#grid .c >> nth={i}")
            G2 = await g(); check("tal først sætter tallet i flere felter", all(G2["v"][i] == d for i in cells) and G2["mistakes"] == 0, [G2["v"][i] for i in cells]); await shot("talfoerst")
            await pg.click("[data-tab=stats]"); await shot("kalender"); n = await pg.locator(".cal button").count(); check("kalender har 35 dage", n == 35, n)
            await pg.evaluate("openHash('new')"); await pg.wait_for_timeout(300); check("genvej 'new' åbner niveauvalg", await pg.locator("#sheet [data-l=let]").count() == 1); await pg.evaluate("Kit.closeSheet()")
            check("ingen JS-fejl", not errs, errs[:3]); await b.close()
    finally: srv.terminate()
    print("FEJL: " + ", ".join(fails) if fails else "ALT OK")
asyncio.run(main())
