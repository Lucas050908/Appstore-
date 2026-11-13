"""UI-test af Retning:  python3 shared/tests/retning.py"""
import asyncio, os, sys, subprocess, socket, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); WEB = os.path.join(ROOT, "apps/retning/app/src/main/assets"); OUT = "/tmp/tt"
fails = []
def check(name, cond, info=""):
    print(("OK  " if cond else "FEJL"), name, info if not cond else "", flush=True)
    if not cond: fails.append(name)
ORI = "(a) => { for (let k = 0; k < 40; k++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: a[0], beta: a[1], gamma: a[2], absolute: true })); }"
async def main():
    s = socket.socket(); s.bind(("", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=WEB, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.6)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
            # Rådhuspladsen i København
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="dark", geolocation={"latitude": 55.67594, "longitude": 12.56553}, permissions=["geolocation"])
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and "404" not in m.text and errs.append(m.text))
            n = [0]
            async def shot(tag): n[0] += 1; await pg.wait_for_timeout(400); await pg.screenshot(path=f"{OUT}/retning{n[0]}_{tag}.png")
            await pg.goto(f"http://localhost:{port}/index.html"); await pg.wait_for_timeout(500)
            check("venter-besked uden sensor", "Venter" in await pg.text_content("#cNote")); await shot("venter")
            await pg.evaluate(ORI, [270, 1, -2]); await pg.wait_for_timeout(200)
            t = await pg.text_content("#deg"); c = await pg.text_content("#card"); check("alpha 270 vises som 90° øst", t == "90°" and c.startswith("Øst"), (t, c)); await shot("oest")
            await pg.evaluate(ORI, [0, 0, 0]); await pg.wait_for_timeout(200); t = await pg.text_content("#deg"); check("nord vises som 0°", t == "0°", t)
            await pg.evaluate(ORI, [135, 0, 0]); await pg.wait_for_timeout(200); t = await pg.text_content("#deg"); c = await pg.text_content("#card"); check("alpha 135 er sydvest 225°", t == "225°" and c.startswith("Sydvest"), (t, c))
            # matematik: København → Aarhus ca. 157 km mod vestnordvest
            m = await pg.evaluate("[_t.dist({lat:55.67594,lon:12.56553},{lat:56.1629,lon:10.2039}), _t.bearing({lat:55.67594,lon:12.56553},{lat:56.1629,lon:10.2039}), _t.bearing({lat:0,lon:0},{lat:1,lon:0}), _t.bearing({lat:0,lon:0},{lat:0,lon:1})]")
            check("afstand og pejling regnes rigtigt", 154000 < m[0] < 160000 and 285 < m[1] < 295 and abs(m[2]) < 0.01 and abs(m[3] - 90) < 0.01, m)
            # vaterpas
            await pg.click("[data-tab=vater]"); await pg.evaluate(ORI, [0, 3.2, -1.5]); await pg.wait_for_timeout(200)
            lx = await pg.text_content("#lx"); ly = await pg.text_content("#ly"); check("vaterpas viser hældning", lx == "-1,5°" and ly == "3,2°", (lx, ly)); await shot("vater")
            await pg.click("#zSet"); await pg.evaluate(ORI, [0, 3.2, -1.5]); await pg.wait_for_timeout(200)
            check("nulstil her giver 0 og grøn boble", await pg.text_content("#lx") == "0°" and await pg.evaluate("document.querySelector('#lvl').classList.contains('ok')")); await shot("vater_nul")
            await pg.click("#zReset")
            # steder
            await pg.click("[data-tab=steder]"); await pg.wait_for_timeout(900); here = await pg.text_content(".here .v"); check("position vises", "55.67594° N" in here and "12.56553° Ø" in here, here); await shot("steder_tom")
            await pg.click("#pSave"); await pg.click("#sheet [data-n=Bilen]"); await pg.click("#pOk"); await pg.wait_for_timeout(300)
            pl = await pg.evaluate("_t.D.places"); check("sted gemmes", len(pl) == 1 and pl[0]["name"] == "Bilen" and abs(pl[0]["lat"] - 55.67594) < 1e-6, pl)
            # gå 300 m mod nord og find tilbage
            await ctx.set_geolocation({"latitude": 55.67864, "longitude": 12.56553}); await pg.wait_for_timeout(1500)
            d = await pg.text_content(".pl .d"); check("afstand til gemt sted opdateres", "300 m" in d or "299 m" in d or "301 m" in d, d); await shot("steder")
            await pg.click(".pl"); await shot("sted_ark"); await pg.click("#gGo"); await pg.wait_for_timeout(300)
            await pg.evaluate(ORI, [270, 0, 0]); await pg.wait_for_timeout(300)        # kigger mod øst; bilen ligger mod syd → pilen peger 90° til højre
            sub = await pg.text_content("#tSub"); tr = await pg.evaluate("document.querySelector('#tArrow').style.transform")
            import re; rot = float((re.search(r"rotate\(([-0-9.]+)deg", tr) or [0, "nan"])[1])
            check("kompasset viser vej til bilen", "Syd" in sub and "180°" in sub and abs(rot - 90) < 0.5, (sub, tr)); await shot("vej")
            await pg.reload(); await pg.wait_for_timeout(500); check("målet huskes efter genstart", await pg.evaluate("_t.D.target === _t.D.places[0].id"))
            await pg.click("#tOff"); await pg.click("[data-tab=steder]"); await pg.wait_for_timeout(600); await pg.click(".pl"); await pg.click("#gDel"); await pg.wait_for_timeout(200)
            check("slet sted", await pg.evaluate("_t.D.places.length") == 0); await pg.click("#toast button"); check("fortryd sletning", await pg.evaluate("_t.D.places.length") == 1)
            await pg.evaluate("openHash('save')"); await pg.wait_for_timeout(1200); check("widget-genvejen åbner Gem sted med Bilen", await pg.input_value("#pn") == "Bilen"); await shot("genvej")
            await pg.evaluate("Kit.closeSheet()"); await pg.click("#btnSet"); await pg.click("#sheet [data-d='5']"); await pg.click("#sheet [data-t=light]"); await pg.evaluate("Kit.closeSheet()")
            await pg.click("[data-tab=kompas]"); await pg.evaluate(ORI, [0, 0, 0]); await pg.wait_for_timeout(200); t = await pg.text_content("#deg"); check("geografisk nord lægger 5° til", t == "5°", t); await shot("lyst")
            # 1.1: sol, hold kurs, koordinater
            m = await pg.evaluate("(() => { const p = _t.sunPos(new Date('2026-06-21T11:11:00Z'), 55.676, 12.566), t = _t.sunTimes(new Date('2026-06-21T10:00:00Z'), 55.676, 12.566), w = _t.sunPos(new Date('2026-12-21T11:07:00Z'), 55.676, 12.566); return [p.az, p.alt, t.rise.toISOString(), t.set.toISOString(), w.alt]; })()")
            check("solen: middag i København ved sommersolhverv", abs(m[0] - 180) < 2 and abs(m[1] - 57.8) < 0.6 and m[2][11:16] in ("02:24", "02:25", "02:26", "02:27") and m[3][11:16] in ("19:56", "19:57", "19:58", "19:59") and abs(m[4] - 10.9) < 0.6, m)
            pc = await pg.evaluate("[_t.parseCoords('55.6759, 12.5655'), _t.parseCoords('55,6759 12,5655'), _t.parseCoords('55.67594° N, 12.56553° Ø'), _t.parseCoords('hej'), _t.parseCoords('95, 12')]")
            check("koordinater læses", pc[0] == {"lat": 55.6759, "lon": 12.5655} and pc[1] == pc[0] and abs(pc[2]["lon"] - 12.56553) < 1e-9 and pc[3] is None and pc[4] is None, pc)
            await pg.wait_for_timeout(1200); await pg.evaluate(ORI, [0, 0, 0]); await pg.wait_for_timeout(200); sn = await pg.text_content("#sunNote"); check("sol-linjen vises", "Sol" in sn, sn)
            await pg.click("#cLock"); await pg.evaluate(ORI, [340, 0, 0]); await pg.wait_for_timeout(250); cb = await pg.text_content("#courseBox"); check("hold kurs viser afvigelse", "Kurs 5°" in cb and "Drej 20° til venstre" in cb, cb); await shot("kurs")
            await pg.click("#cLock"); await pg.click("[data-tab=steder]"); await pg.click("#pCoord"); await pg.fill("#cn", "Hytten"); await pg.fill("#cc", "56.1629, 10.2039"); await pg.click("#cOk"); await pg.wait_for_timeout(1300)
            d = await pg.text_content(".pl .d"); check("sted fra koordinater gemmes med afstand", "157 km" in d or "156 km" in d or "158 km" in d, d); await shot("steder11")
            check("ingen JS-fejl", not errs, errs[:3]); await b.close()
    finally: srv.terminate()
    print("FEJL: " + ", ".join(fails) if fails else "ALT OK")
asyncio.run(main())
