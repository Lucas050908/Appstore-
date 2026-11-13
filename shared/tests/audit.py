"""Fælles gennemgang af alle web-apps:  python3 shared/tests/audit.py [id ...]
Åbner hver app på en lille og en almindelig telefon i lyst og mørkt, går alle faner og indstillinger igennem
og melder JS-fejl, vandret overløb, elementer uden for skærmen og for små trykflader."""
import asyncio, os, sys, json, subprocess, socket, time, glob
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = "/tmp/tt/audit"
def webdir(a):
    for p in (f"apps/{a}/web", f"apps/{a}/app/src/main/assets"):
        if os.path.exists(os.path.join(ROOT, p, "index.html")): return os.path.join(ROOT, p)
    for p in glob.glob(os.path.join(ROOT, f"apps/{a}/**/index.html"), recursive=True):
        if "/build/" not in p: return os.path.dirname(p)
APPS = [a for a in sorted(os.listdir(os.path.join(ROOT, "apps"))) if webdir(a)]
CHECK = """() => { const W = innerWidth, out = { over: document.documentElement.scrollWidth - W, off: [], small: [], clip: [] };
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.bottom > 0 && r.top < innerHeight; };
  const name = el => (el.id ? '#' + el.id : el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) + ':' + (el.textContent || '').trim().slice(0, 18);
  const inScrollX = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 2) return true; } return false; };
  for (const el of document.querySelectorAll('body *')) { if (!vis(el)) continue; const r = el.getBoundingClientRect();
    if ((r.right > W + 2 || r.left < -2) && !inScrollX(el) && !el.closest('svg') && getComputedStyle(el).position !== 'fixed' && r.width < W * 3) out.off.push(name(el));
    if (el.matches('button, a, [role=button], input[type=checkbox]') && (r.width < 30 || r.height < 30) && !el.closest('svg')) out.small.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(getComputedStyle(el).overflowX) && getComputedStyle(el).textOverflow !== 'ellipsis' && el.textContent.trim()) out.clip.push(name(el)); }
  out.off = [...new Set(out.off)].slice(0, 6); out.small = [...new Set(out.small)].slice(0, 6); out.clip = [...new Set(out.clip)].slice(0, 6); return out; }"""
async def run(b, app, port, vp, scheme, shots):
    ctx = await b.new_context(viewport=vp, device_scale_factor=2, color_scheme=scheme, has_touch=True, geolocation={"latitude": 55.676, "longitude": 12.566}, permissions=["geolocation"])
    pg = await ctx.new_page(); errs = []; rep = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160])); pg.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "404" not in m.text and "Failed to load" not in m.text and errs.append(m.text[:160]))
    await pg.route("**/*", lambda r: r.continue_() if "localhost" in r.request.url else r.abort())
    await pg.goto(f"http://localhost:{port}/index.html"); await pg.wait_for_timeout(900)
    async def chk(tag):
        r = await pg.evaluate(CHECK); bad = []
        if r["over"] > 2: bad.append(f"overløb {r['over']}px")
        for k, lbl in (("off", "udenfor"), ("small", "lille"), ("clip", "klippet")):
            if r[k]: bad.append(lbl + ": " + " | ".join(r[k]))
        if bad: rep.append(f"  [{tag}] " + " ; ".join(bad))
        if shots: await pg.screenshot(path=f"{OUT}/{app}_{scheme}_{vp['width']}_{tag}.png")
    await chk("start")
    tabs = await pg.evaluate("[...document.querySelectorAll('.tabbar [data-tab], nav [data-tab], .tabs [data-tab]')].map(e => e.dataset.tab)")
    for t in tabs[1:]:
        try: await pg.click(f"[data-tab='{t}']", timeout=1500); await pg.wait_for_timeout(450); await chk(t)
        except Exception as e: rep.append(f"  [{t}] kunne ikke åbnes: {str(e)[:80]}")
    if tabs:
        try: await pg.click(f"[data-tab='{tabs[0]}']", timeout=1500)
        except Exception: pass
    for sel in ("#btnSet", "#setBtn", "#btnMore", "[aria-label='Indstillinger']"):
        if await pg.locator(sel).count() and await pg.locator(sel).first.is_visible():
            try: await pg.click(sel, timeout=1500); await pg.wait_for_timeout(450); await chk("indst")
            except Exception as e: rep.append(f"  [indst] {str(e)[:80]}")
            break
    if errs: rep.append("  JS: " + " || ".join(sorted(set(errs))[:4]))
    await ctx.close(); return rep
async def main():
    apps = [a for a in sys.argv[1:] if not a.startswith("-")] or APPS; shots = "--shots" in sys.argv
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        for app in apps:
            s = socket.socket(); s.bind(("", 0)); port = s.getsockname()[1]; s.close()
            srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=webdir(app), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.4)
            try:
                rep = []
                for vp, scheme in (({"width": 360, "height": 640}, "dark"), ({"width": 412, "height": 892}, "light")):
                    r = await run(b, app, port, vp, scheme, shots)
                    if r: rep.append(f" {vp['width']} {scheme}:"); rep += r
                print(("FEJL " if rep else "OK   ") + app, flush=True)
                for l in rep: print(l, flush=True)
            finally: srv.terminate()
        await b.close()
asyncio.run(main())
