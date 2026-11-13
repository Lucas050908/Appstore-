"""Trin-for-trin-test af en app med falske API-svar:  python3 shared/tests/feat.py <id> [flere id'er]
Trinene ligger i shared/tests/steps/<id>.json:  ["click", sel] · ["fill", sel, tekst] · ["eval", js] · ["wait", ms] · ["shot", navn] · ["reload"]
· ["expect", navn, js]  (js skal give sand; ellers vises værdien af js)"""
import asyncio, os, sys, json, subprocess, socket, time, datetime, math, random, glob
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); OUT = "/tmp/tt"
random.seed(4)
now = datetime.datetime.now().replace(minute=0, second=0, microsecond=0)
H = [(now + datetime.timedelta(hours=i - 2)) for i in range(240)]
def weather():
    return {"current": {"time": now.strftime("%Y-%m-%dT%H:%M"), "temperature_2m": 8.4, "apparent_temperature": 5.1, "relative_humidity_2m": 81, "is_day": 1, "precipitation": 0.2, "weather_code": 61, "wind_speed_10m": 6.2, "wind_direction_10m": 250, "wind_gusts_10m": 11.5, "surface_pressure": 1008},
      "minutely_15": {"time": [(now + datetime.timedelta(minutes=15*i)).strftime("%Y-%m-%dT%H:%M") for i in range(8)], "precipitation": [0.4,0.6,0.3,0.1,0,0,0,0]},
      "hourly": {"time": [h.strftime("%Y-%m-%dT%H:%M") for h in H], "temperature_2m": [6+4*math.sin(i/24*6.28) for i in range(240)], "precipitation_probability": [random.choice([0,10,30,60,80]) for _ in H], "precipitation": [0]*240, "weather_code": [random.choice([0,2,3,61,80]) for _ in H], "is_day": [1 if 7<=h.hour<17 else 0 for h in H]},
      "daily": {"time": [(now + datetime.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(10)], "weather_code": [61,3,0,2,80,71,95,45,1,63], "temperature_2m_max": [10,9,7,8,11,3,12,6,5,9], "temperature_2m_min": [4,3,-1,2,5,-3,6,1,0,3], "precipitation_sum": [3.2,0,0,0.1,5,2,8,0,0,4],
                "precipitation_probability_max": [80,10,0,20,70,60,90,10,0,75], "sunrise": [(now.strftime("%Y-%m-%d")+"T07:41")]*10, "sunset": [(now.strftime("%Y-%m-%d")+"T16:12")]*10, "uv_index_max": [1.2]*10, "wind_speed_10m_max": [8]*10}}
def air():
    return {"current": {"time": now.strftime("%Y-%m-%dT%H:%M"), "european_aqi": 34, "pm2_5": 7.2, "pm10": 12.1, "nitrogen_dioxide": 14.0, "ozone": 55.0, "birch_pollen": 0, "grass_pollen": 12.5, "alder_pollen": 0, "mugwort_pollen": 1.2}}
RATES = {"DKK":7.46,"USD":1.08,"GBP":0.85,"SEK":11.2,"NOK":11.6,"CHF":0.95,"JPY":162.3,"PLN":4.3,"THB":38.1,"HUF":395.0,"TRY":36.2,"CZK":25.1,"ISK":150.2,"CNY":7.8,"CAD":1.47,"AUD":1.63}
def series(url):
    days = {}; d = datetime.date.today() - datetime.timedelta(days=91); to = url.split("to=")[1].split("&")[0]; i = 0
    while d <= datetime.date.today():
        if d.weekday() < 5: days[d.isoformat()] = {to: 7.44 + 0.03 * math.sin(i / 9) + i * 0.0002}
        d += datetime.timedelta(days=1); i += 1
    return {"rates": days}
def webdir(a):
    for p in (f"apps/{a}/web", f"apps/{a}/app/src/main/assets"):
        if os.path.exists(os.path.join(ROOT, p, "index.html")): return os.path.join(ROOT, p)
async def api(route):
    u = route.request.url; J = lambda o: route.fulfill(status=200, content_type="application/json", body=json.dumps(o), headers={"access-control-allow-origin": "*"})
    if "localhost" in u: return await route.continue_()
    if "air-quality-api.open-meteo.com" in u: return await J(air())
    if "geocoding-api.open-meteo.com" in u: return await J({"results": [{"id": 1, "name": "Aarhus", "latitude": 56.15, "longitude": 10.2, "country": "Danmark", "admin1": "Midtjylland", "country_code": "DK"}]})
    if "api.open-meteo.com" in u: return await J(weather())
    if "bigdatacloud" in u: return await J({"city": "København"})
    if "frankfurter" in u: return await J({"date": "2026-11-12", "rates": RATES} if "latest" in u else series(u))
    await route.abort()
async def run(b, app):
    steps = json.load(open(os.path.join(HERE, "steps", app + ".json"))); fails = 0
    s = socket.socket(); s.bind(("", 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=webdir(app), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.5)
    try:
        ctx = await b.new_context(viewport={"width": int(os.environ.get("VW", "390")), "height": int(os.environ.get("VH", "844"))}, device_scale_factor=2, color_scheme="light", has_touch=True, geolocation={"latitude": 55.676, "longitude": 12.566}, permissions=["geolocation"])
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200])); pg.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "404" not in m.text and errs.append(m.text[:200]))
        await pg.route("**/*", api)
        await pg.goto(f"http://localhost:{port}/index.html"); await pg.wait_for_timeout(900)
        for st in steps:
            op = st[0]
            try:
                if op == "click": await pg.click(st[1], timeout=4000); await pg.wait_for_timeout(180)
                elif op == "fill": await pg.fill(st[1], st[2], timeout=4000); await pg.wait_for_timeout(80)
                elif op == "eval": await pg.evaluate(st[1]); await pg.wait_for_timeout(120)
                elif op == "wait": await pg.wait_for_timeout(st[1])
                elif op == "reload": await pg.reload(); await pg.wait_for_timeout(900)
                elif op == "shot": await pg.wait_for_timeout(350); await pg.screenshot(path=f"{OUT}/{app}_{st[1]}.png")
                elif op == "expect":
                    v = await pg.evaluate(st[2]); ok = v is True
                    if not ok: fails += 1
                    print(("OK  " if ok else "FEJL"), app + ":", st[1], "" if ok else "→ " + json.dumps(v, ensure_ascii=False)[:260], flush=True)
            except Exception as e:
                fails += 1; print("FEJL", app + ":", op, st[1] if len(st) > 1 else "", "→", str(e).split("\n")[0][:160], flush=True)
        if errs: fails += 1; print("FEJL", app + ": JS-fejl", errs[:3])
        await ctx.close()
    finally: srv.terminate()
    return fails
async def main():
    apps = sys.argv[1:] or [os.path.basename(f)[:-5] for f in sorted(glob.glob(os.path.join(HERE, "steps", "*.json")))]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        tot = 0
        for a in apps: tot += await run(b, a)
        await b.close(); print("ALT OK" if not tot else f"{tot} FEJL")
asyncio.run(main())
