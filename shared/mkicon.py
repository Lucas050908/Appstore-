"""Lav app-ikon (legacy + adaptivt + monokromt) med gradient og hvidt symbol. Brug: mkicon.py <res-dir> <store-png> <glyph> <c1> <c2>"""
import sys, os, math
from PIL import Image, ImageDraw
S = 4
res, store_png, glyph, c1, c2 = sys.argv[1:6]
hx = lambda h: tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
C1, C2 = hx(c1), hx(c2)

def grad(n):
    im = Image.new("RGB", (n, n)); px = im.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * n)
            px[x, y] = tuple(int(a + (b - a) * t) for a, b in zip(C1, C2))
    return im

def draw_glyph(d, c, s, col):
    w = max(2, int(s * 0.085))
    if glyph == "tik":
        r = s * 0.36; cy = c + s * 0.04
        d.ellipse([c - r, cy - r, c + r, cy + r], outline=col, width=w)
        # klokker
        br = s * 0.13
        for sx in (-1, 1):
            bx, by = c + sx * s * 0.265, cy - s * 0.315
            st = 135 if sx < 0 else 225
            d.pieslice([bx - br, by - br, bx + br, by + br], st, st + 180, fill=col)
        # ben
        for sx in (-1, 1):
            d.line([c + sx * r * 0.62, cy + r * 0.80, c + sx * r * 0.95, cy + r * 1.18], fill=col, width=w)
        # visere
        d.line([c, cy, c, cy - r * 0.58], fill=col, width=w)
        d.line([c, cy, c + r * 0.42, cy + r * 0.26], fill=col, width=w)
        d.ellipse([c - w * .8, cy - w * .8, c + w * .8, cy + w * .8], fill=col)
    elif glyph == "moent":
        r = s * 0.40
        d.ellipse([c - r, c - r, c + r, c + r], outline=col, width=w)
        r2 = r * 0.74
        d.ellipse([c - r2, c - r2, c + r2, c + r2], outline=col, width=max(1, w // 2))
        from PIL import ImageFont
        font = ImageFont.truetype("/home/claude/shared/fonts/caveat.ttf", int(s * 0.46))
        try: font.set_variation_by_axes([700])
        except Exception: pass
        d.text((c, c + s * 0.01), "kr", font=font, fill=col, anchor="mm")

def glyph_img(n, scale, col=(255, 255, 255, 255)):
    W = n * S; im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    draw_glyph(d, W / 2, W * scale, col)
    return im.resize((n, n), Image.LANCZOS)

def full(n):
    base = grad(n * S).convert("RGBA")
    m = Image.new("L", base.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, base.width - 1, base.height - 1], radius=base.width * 0.23, fill=255)
    base.putalpha(m); base = base.resize((n, n), Image.LANCZOS)
    base.alpha_composite(glyph_img(n, 0.66)); return base

for k, f in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
    dd = os.path.join(res, "mipmap-" + k); os.makedirs(dd, exist_ok=True)
    full(int(48 * f)).save(os.path.join(dd, "ic_launcher.png"))
    m = int(108 * f)
    glyph_img(m, 0.42).save(os.path.join(dd, "ic_launcher_foreground.png"))
    grad(m).save(os.path.join(dd, "ic_launcher_background.png"))
    glyph_img(m, 0.42).save(os.path.join(dd, "ic_launcher_monochrome.png"))
a = os.path.join(res, "mipmap-anydpi-v26"); os.makedirs(a, exist_ok=True)
open(os.path.join(a, "ic_launcher.xml"), "w").write('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@mipmap/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>\n')
full(192).save(store_png)
