#!/usr/bin/env python3
"""Byg hjemmesiden til GitHub Pages i _site/.

- Butikken (store/) ligger i roden.
- Hver app, der er bygget som web-side, kopieres til apps/<id>/ så den kan åbnes i en browser
  (og i PC-udgaven af App Store). Apps uden kildekode her hentes ud af deres APK.
- _site/apps.json får feltet "web" med stien til appen.
"""
import json, os, re, shutil, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "_site")
CANDIDATES = ["index.html", "public/index.html", "www/index.html"]
# Apps der kræver telefonen (sensorer, musikbibliotek, AI-model på telefonen, baggrunde) – vises som "Kun Android" på computeren.
PHONE_ONLY = {"klang", "retning", "facette"}
# Apps der kun virker i PC-programmet (ikke i en almindelig browser).
DESKTOP_ONLY = {"lokal-ai"}
# Hvad der er anderledes, når appen bruges på en computer.
PC_NOTE = {
    "sky": "Automatisk placering virker ikke altid på computeren – tilføj din by i stedet.",
    "tik": "Alarmer og timere ringer kun, mens appen er åben.",
    "kode": "Scanning bruger computerens webkamera. Du kan altid lave koder og se historikken.",
    "stem": "Bruger computerens mikrofon.",
    "notabene": "Diktering (tale til tekst) virker måske ikke på computeren.",
    "lokal-ai": "Virker i PC-programmet til Windows og Linux – ikke i browseren. AI'en kører på computerens processor; jo større model, jo mere RAM skal du bruge.",
}
BARCODE_POLYFILL = '<script src="https://cdn.jsdelivr.net/npm/barcode-detector@3/dist/iife/polyfill.js"></script>'



def copy_tree(src, dst):
    shutil.copytree(src, dst, dirs_exist_ok=True)


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    copy_tree(os.path.join(ROOT, "store"), OUT)
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    data = json.load(open(os.path.join(ROOT, "store", "apps.json"), encoding="utf-8"))
    for a in data["apps"]:
        aid = a["id"]
        dst = os.path.join(OUT, "apps", aid)
        if a.get("pkg") == "dk.lucas.appstore":
            continue
        if aid in PC_NOTE:
            a["pcNote"] = PC_NOTE[aid]
        if str(a.get("web", "")).startswith("https://"):   # app der ligger på nettet (fx claude.ai) – åbnes direkte
            print("ekstern web:", aid)
            continue
        if aid in PHONE_ONLY:
            a.pop("web", None)
            print("kun telefon:", aid)
            continue
        src = os.path.join(ROOT, "apps", aid, "app", "src", "main", "assets")
        entry = None
        if os.path.exists(os.path.join(src, "index.html")):
            copy_tree(src, dst)
            entry = "index.html"
        else:
            apk = os.path.join(ROOT, "apks", (a.get("download") or "").rsplit("/", 1)[-1])
            if a.get("download") and os.path.isfile(apk):
                with zipfile.ZipFile(apk) as z:
                    names = z.namelist()
                    for c in CANDIDATES:
                        if "assets/" + c in names:
                            base = "assets/" + c.rsplit("/", 1)[0] + "/" if "/" in c else "assets/"
                            for n in names:
                                if n.startswith(base) and not n.endswith("/"):
                                    p = os.path.join(dst, n[len(base):])
                                    os.makedirs(os.path.dirname(p), exist_ok=True)
                                    with open(p, "wb") as f:
                                        f.write(z.read(n))
                            entry = "index.html"
                            break
        if not entry:
            a.pop("web", None)
            print("ingen web-udgave:", aid)
            continue
        # Alle apps deler domæne på GitHub Pages – giv deres lokale lagring hvert sit navn.
        kit = os.path.join(dst, "kit.js")
        if os.path.exists(kit):
            s = open(kit, encoding="utf-8").read()
            s = s.replace('"kit." + key', '"kit.%s." + key' % aid)
            open(kit, "w", encoding="utf-8").write(s)
        if aid == "lokal-ai":   # PC-udgaven kører på computeren, ikke telefonen
            idx = os.path.join(dst, entry)
            h = open(idx, encoding="utf-8").read()
            for a_, b_ in [("lokalt på din telefon", "lokalt på din computer"), ("direkte på din telefon", "direkte på din computer"),
                           ("RAM i telefonen", "RAM i computeren"), ("på denne telefon", "på denne computer")]:
                h = h.replace(a_, b_)
            open(idx, "w", encoding="utf-8").write(h)
        if aid == "kode":   # Windows/Linux har ikke BarcodeDetector indbygget
            idx = os.path.join(dst, entry)
            h = open(idx, encoding="utf-8").read()
            if BARCODE_POLYFILL not in h:
                h = h.replace("</head>", BARCODE_POLYFILL + "\n</head>", 1)
                open(idx, "w", encoding="utf-8").write(h)
        a["web"] = "apps/%s/%s" % (aid, entry)
        if aid in DESKTOP_ONLY:
            a["desktopOnly"] = True
        print("web:", aid)
    json.dump(data, open(os.path.join(OUT, "apps.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return data


def desktop_bundle(data, dest):
    """Læg web-udgaverne ind i PC-programmet, så apps virker uden hjemmesiden (og uden internet)."""
    if os.path.exists(dest):
        shutil.rmtree(dest)
    copy_tree(os.path.join(OUT, "apps"), os.path.join(dest, "apps"))
    index = {}
    for a in data["apps"]:
        if a.get("web") and not a["web"].startswith("https://"):
            index[a["id"]] = {"entry": a["web"].split("/", 2)[2], "version": a.get("version", ""),
                              "desktopOnly": bool(a.get("desktopOnly")), "pcNote": a.get("pcNote", "")}
    json.dump(index, open(os.path.join(dest, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("PC-pakke:", len(index), "apps ->", dest)


if __name__ == "__main__":
    d = main()
    if "--desktop" in sys.argv:
        desktop_bundle(d, sys.argv[sys.argv.index("--desktop") + 1])
