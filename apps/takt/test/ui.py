"""UI-test af Takt 1.2 (dagens øvelse, favoritter, sikkerhedskopi, metronom):  python3 apps/takt/test/ui.py"""
import asyncio, os, sys, json, subprocess, socket, time
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); WEB = os.path.join(HERE, "..", "web"); OUT = "/tmp/tt"
SIM = open(os.path.join(HERE, "sim.js")).read()
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
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and "404" not in m.text and errs.append(m.text))
            await pg.add_init_script("if (!localStorage.getItem('takt.v1')) localStorage.setItem('takt.v1', JSON.stringify({onboarded:true, latency:0, ver:'1.1.0'}))")
            n = [0]
            async def shot(tag): n[0] += 1; await pg.wait_for_timeout(300); await pg.screenshot(path=f"{OUT}/takt{n[0]:02d}_{tag}.png")
            await pg.goto(f"http://localhost:{port}/index.html"); await pg.wait_for_timeout(500)
            check("nyt-ark efter opdatering", await pg.is_visible("#nOk")); await shot("nyt"); await pg.click("#nOk")
            t = await pg.text_content("#dailyBtn"); d = await pg.evaluate("[dailyEx().id, M.allExercises('guitar')[0].id, dailyDone()]")
            check("dagens øvelse på forsiden", "Dagens øvelse" in t and "+50 XP" in t, t); check("ny bruger får første øvelse", d[0] == d[1] and not d[2], d); await shot("forside")
            await pg.click("#dailyBtn"); check("dagens øvelse åbner start-arket", await pg.is_visible("#bStart")); await pg.evaluate("closeSheet()")
            await pg.add_script_tag(content=SIM)
            r = await pg.evaluate("o => simRun(o)", {"instr": "guitar", "ex": d[0]})
            await pg.wait_for_timeout(300)
            s = await pg.evaluate("({ xp: S.xp, n: S.dailyN, done: dailyDone(), bonus: !!document.querySelector('#dBonus'), stars: (bestOf('guitar', dailyEx().id) || {}).stars, score: (bestOf('guitar', dailyEx().id) || {}).score })")
            check("øvelsen gennemført med stjerner", r.get("hits", 0) / max(1, r.get("total", 1)) >= .6 and s["stars"] >= 1, [r, s])
            check("bonus givet og vist", s["done"] and s["n"] == 1 and s["bonus"] and s["xp"] == round(s["score"] / 10) + s["stars"] * 10 + 50, s); await shot("resultat")
            await pg.evaluate("closeSheet()"); await pg.wait_for_timeout(200)
            t = await pg.text_content("#dailyBtn"); check("forsiden viser klaret", "Klaret i dag" in t, t); await shot("forside_klaret")
            xp0 = s["xp"]; await pg.evaluate("o => simRun(o)", {"instr": "guitar", "ex": d[0]}); await pg.wait_for_timeout(300)
            s2 = await pg.evaluate("({ xp: S.xp, n: S.dailyN, bonus: !!document.querySelector('#dBonus') })"); check("bonus kun én gang om dagen", s2["n"] == 1 and not s2["bonus"] and s2["xp"] - xp0 == xp0 - 50, [xp0, s2])
            await pg.evaluate("closeSheet()")
            same = await pg.evaluate("(() => { const a = dailyEx().id; S.best['guitar:' + M.allExercises('guitar')[1].id] = {stars:1, score:10, acc:.7}; return a === dailyEx().id; })()"); check("dagens øvelse skifter ikke i løbet af dagen", same)
            nxt = await pg.evaluate("(() => { S.daily.day = '2020-01-01'; const e = dailyEx(); return [e.id, dailyDone(), S.daily.day === dayKey()]; })()"); check("ny dag → ny, uløst øvelse", not nxt[1] and nxt[2], nxt)
            # akkorder
            await pg.click("#tabs [data-tab=chords]"); await pg.wait_for_timeout(200)
            c0 = await pg.locator("#view [data-c]").count(); await pg.click("#cFil [data-f=mol]"); c1 = await pg.evaluate("[...document.querySelectorAll('#view [data-c]')].map(b => b.dataset.c)")
            check("mol-filter", c0 == 26 and c1 == ["Am", "Em", "Dm", "Bm"], [c0, c1]); await shot("akkorder_mol")
            await pg.click("#cFil [data-f=fav]"); check("tom favoritliste forklarer sig", "Ingen favoritter" in await pg.text_content("#view"))
            await pg.click("#cFil [data-f=alle]"); await pg.click("#view [data-c=Am]"); await pg.click("#cFav"); await shot("akkord_fav")
            check("favorit gemt", await pg.evaluate("favs('guitar').join()") == "Am"); await pg.evaluate("closeSheet()")
            await pg.click("#cFil [data-f=fav]"); c2 = await pg.evaluate("[...document.querySelectorAll('#view [data-c]')].map(b => b.dataset.c)"); check("favoritfilter viser Am", c2 == ["Am"], c2)
            await pg.click("#view [data-c=Am]"); await pg.click("#cFav"); await pg.evaluate("closeSheet()"); check("favorit kan fjernes", await pg.evaluate("favs('guitar').length") == 0)
            # metronom
            await pg.click("#tabs [data-tab=tool]"); await pg.wait_for_timeout(200)
            await pg.evaluate("[...document.querySelectorAll('#view button')].find(b => /Metronom/.test(b.textContent)).click()"); await pg.wait_for_timeout(200)
            check("metronom har betoning og tempotræner", await pg.is_visible("#mAcc") and await pg.is_visible("#mTr"))
            await pg.click("#mAcc"); check("betoning kan slås fra", await pg.evaluate("S.accent === false && A.metro.accent === false"))
            await pg.click("#mAcc"); await pg.evaluate("document.querySelector('#mR').value = 200; document.querySelector('#mR').dispatchEvent(new Event('input'))")
            await pg.click("#mTr"); await pg.click("#mGo"); await shot("metronom"); await pg.wait_for_timeout(5600)      # 200 BPM, 4/4 → 4 takter ≈ 4,8 s
            bpm = await pg.evaluate("A.metro.bpm"); check("tempotræner skruer op efter 4 takter", bpm == 205, bpm); await pg.click("#mGo")
            # mig: sikkerhedskopi
            await pg.click("#tabs [data-tab=me]"); await pg.wait_for_timeout(200); await pg.click("#sBk"); await shot("kopi")
            raw = await pg.input_value("#bkT"); o = json.loads(raw); check("kopi indeholder fremskridt", o["_app"] == "takt" and o["data"]["xp"] == s2["xp"], raw[:120])
            await pg.click("#bkIn"); check("samme tekst indlæses ikke", await pg.is_visible("#bkT"))
            await pg.fill("#bkT", "hej"); await pg.click("#bkIn"); check("vrøvl afvises", await pg.is_visible("#bkT"))
            o["data"]["xp"] = 4321; o["data"]["instr"] = "piano"; await pg.fill("#bkT", json.dumps(o)); await pg.click("#bkIn"); await pg.wait_for_timeout(200)
            check("kopi indlæst", await pg.evaluate("S.xp === 4321 && S.instr === 'piano' && JSON.parse(localStorage.getItem('takt.v1')).xp === 4321")); await shot("mig")
            await pg.click("#sNews"); check("nyt kan åbnes igen", await pg.is_visible("#nOk")); await pg.click("#nOk")
            await pg.reload(); await pg.wait_for_timeout(400); check("nyt-ark vises kun én gang", not await pg.is_visible("#nOk"))
            await pg.set_viewport_size({"width": 360, "height": 640}); await pg.click("#tabs [data-tab=chords]"); await shot("akkorder_lille")
            ov = await pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1"); check("ingen vandret overløb", not ov)
            check("ingen JS-fejl", not errs, errs[:3])
            await b.close()
    finally: srv.terminate()
    print("FEJL: " + ", ".join(fails) if fails else "ALT OK")
asyncio.run(main())
