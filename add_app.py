#!/usr/bin/env python3
"""Tilføj eller opdater en app i app storen ud fra en APK.

Brug:  python3 -I add_app.py <sti/til/app.apk> <sti/til/appstore-mappe> [--download URL]

- Kendt pakkenavn  -> opdaterer version, build, størrelse, tilladelser, ikon og 'updated'.
                      Beskrivelse, features, kategori m.m. bevares.
- Nyt pakkenavn    -> tilføjer en ny app med TODO-felter (desc, tagline, category, features).
Udskriver id og hvilke felter der skal skrives færdigt.
Kræver: pip install androguard pillow
"""
import sys, os, json, re, io, zipfile, datetime
from loguru import logger; logger.remove()
from androguard.core.apk import APK
from PIL import Image

SDK = {21:"5.0",22:"5.1",23:"6.0",24:"7.0",25:"7.1",26:"8.0",27:"8.1",28:"9",29:"10",30:"11",31:"12",32:"12L",33:"13",34:"14",35:"15",36:"16"}
DENS = ["xxxhdpi","xxhdpi","xhdpi","hdpi","mdpi"]

def slug(s):
    s = s.lower().translate(str.maketrans("æøå","aoa"))
    return re.sub(r"[^a-z0-9]+","-",s).strip("-") or "app"

def pick_icon(apk_path, a):
    z = zipfile.ZipFile(apk_path)
    names = z.namelist()
    res = a.get_app_icon() or ""
    cands = []
    if res.endswith(".png"):
        cands.append(res)
    base = os.path.splitext(os.path.basename(res))[0] or "ic_launcher"
    for d in DENS:
        for n in names:
            if f"-{d}" in n and n.endswith(f"/{base}.png"):
                cands.append(n)
    for d in DENS:
        for n in names:
            if f"-{d}" in n and n.endswith("/ic_launcher.png"):
                cands.append(n)
    for n in cands:
        try:
            im = Image.open(io.BytesIO(z.read(n))).convert("RGBA")
            if im.width >= 96:
                return im, n
        except Exception:
            pass
    return None, None

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    apk_path, store = sys.argv[1], sys.argv[2]
    dl = sys.argv[sys.argv.index("--download")+1] if "--download" in sys.argv else None
    a = APK(apk_path)
    today = datetime.date.today().isoformat()
    jpath = os.path.join(store, "apps.json")
    data = json.load(open(jpath, encoding="utf-8"))
    apps = data["apps"]
    pkg = a.get_package()
    entry = next((x for x in apps if x.get("pkg") == pkg), None)
    new = entry is None
    if new:
        name = a.get_app_name() or pkg.split(".")[-1].title()
        aid = slug(name)
        while any(x["id"] == aid for x in apps):
            aid += "-2"
        entry = {"id":aid,"name":name,"tagline":"TODO","category":"TODO","icon":"","color":"#7c6cff",
                 "platform":"Android","download":"","added":today,"desc":"TODO","features":[],"whatsNew":""}
        apps.append(entry)
    old_version = entry.get("version")
    minsdk = int(a.get_min_sdk_version() or 0)
    perms = sorted({p.split(".")[-1] for p in a.get_permissions() if p.startswith("android.permission.")})
    entry.update({"version":a.get_androidversion_name(),"build":str(a.get_androidversion_code() or ""),
                  "size":os.path.getsize(apk_path),"minAndroid":SDK.get(minsdk, str(minsdk) if minsdk else ""),
                  "pkg":pkg,"perms":perms,"updated":today})
    if dl:
        entry["download"] = dl
    im, src = pick_icon(apk_path, a)
    os.makedirs(os.path.join(store,"icons"), exist_ok=True)
    if im:
        im = im.resize((192,192), Image.LANCZOS)
        im.save(os.path.join(store,"icons",entry["id"]+".png"))
        entry["icon"] = "icons/"+entry["id"]+".png"
        px = im.convert("RGB").resize((1,1), Image.LANCZOS).getpixel((0,0))
        if new: entry["color"] = "#%02x%02x%02x" % px
    data.setdefault("store",{})["updated"] = today
    json.dump(data, open(jpath,"w",encoding="utf-8"), ensure_ascii=False, indent=2)
    todo = [k for k,v in entry.items() if v in ("TODO",[],"")] if new else []
    print(json.dumps({"action":"added" if new else "updated","id":entry["id"],"name":entry["name"],
        "version":entry["version"],"previous_version":old_version,"icon_from":src,
        "needs_icon": not entry.get("icon"), "todo_fields":todo}, ensure_ascii=False))

if __name__ == "__main__":
    main()
