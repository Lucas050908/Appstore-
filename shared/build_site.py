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
        a["web"] = "apps/%s/%s" % (aid, entry)
        print("web:", aid)
    json.dump(data, open(os.path.join(OUT, "apps.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
