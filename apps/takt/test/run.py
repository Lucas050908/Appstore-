"""Ende-til-ende-test af Takts spilmotor med syntetisk lyd.  python3 apps/takt/test/run.py [filter]"""
import asyncio, sys, json, os, subprocess, socket, time
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); WEB = os.path.join(HERE, "..", "web")
SIM = open(os.path.join(HERE, "sim.js")).read()
CASES = json.load(open(os.path.join(HERE, "cases.json")))
flt = sys.argv[1] if len(sys.argv) > 1 else ""
def free_port():
    s = socket.socket(); s.bind(("", 0)); p = s.getsockname()[1]; s.close(); return p
async def one(ctx, port, case, sem, out):
    async with sem:
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.add_init_script("localStorage.setItem('takt.v1', JSON.stringify({onboarded:true, latency:0}))")
        await pg.goto(f"http://localhost:{port}/index.html"); await pg.wait_for_timeout(400)
        await pg.add_script_tag(content=SIM)
        try: r = await pg.evaluate("o => simRun(o)", case["o"])
        except Exception as e: r = {"error": str(e)[:200]}
        acc = r.get("hits", -1) / max(1, r.get("total", 1))
        lo, hi = case.get("min", 0), case.get("max", 1)
        ok = not errs and "hits" in r and lo <= acc <= hi
        out.append(ok); print(("OK  " if ok else "FEJL"), case["n"].ljust(46), f"{r.get('hits')}/{r.get('total')}", f"P{r.get('perfect')} G{r.get('good')} O{r.get('ok')}", r.get("states", "") if not ok else "", errs[:1] or "", r.get("error", ""), flush=True)
        await pg.close()
async def main():
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=WEB, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.6)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
            ctx = await b.new_context(viewport={"width": 390, "height": 844})
            sem, out = asyncio.Semaphore(int(os.environ.get("PAR", "6"))), []
            await asyncio.gather(*[one(ctx, port, c, sem, out) for c in CASES if __import__("re").search(flt, c["n"])])
            print(f"{sum(out)}/{len(out)} bestået"); await b.close()
    finally: srv.terminate()
asyncio.run(main())
