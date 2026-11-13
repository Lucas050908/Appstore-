#!/usr/bin/env python3
"""Udgiv nye versioner:  python3 -I shared/release.py <fil.json>
Filen: {"<id>": {"v": "1.1.0", "new": "Nyt i denne version …", "add": ["ny funktion øverst", …], "tagline": "…", "desc": "…"}}
Hæver versionen (shared/bump.py) og opdaterer butikkens tekst. CI retter selv version og størrelse efter build."""
import json, os, subprocess, sys, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = json.load(open(sys.argv[1])); p = os.path.join(ROOT, "store", "apps.json"); d = json.load(open(p))
for aid, r in R.items():
    print(subprocess.run([sys.executable, "-I", os.path.join(ROOT, "shared", "bump.py"), aid, r["v"]], capture_output=True, text=True).stdout.strip())
    e = next(a for a in d["apps"] if a["id"] == aid)
    e["whatsNew"] = r["new"]; e["updated"] = datetime.date.today().isoformat()
    if r.get("add"): e["features"] = (r["add"] + [f for f in e.get("features", []) if f not in r["add"]])[:9]
    for k in ("tagline", "desc"):
        if r.get(k): e[k] = r[k]
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
