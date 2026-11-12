#!/usr/bin/env python3
"""Opret/ret en apps.json-linje: store_entry.py <id> '<json med felter>'"""
import json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, "store", "apps.json"); d = json.load(open(p))
aid, fields = sys.argv[1], json.loads(sys.argv[2])
cfg = json.load(open(os.path.join(ROOT, "shared", "apps", aid + ".json")))
fname = cfg.get("file") or "".join(ch for ch in cfg["name"] if ch.isascii() and ch.isalnum())
base = {"id": aid, "name": cfg["name"], "icon": f"icons/{aid}.png", "color": cfg["grad"][0], "platform": "Android",
        "download": f"https://raw.githubusercontent.com/Lucas050908/Appstore-/main/apks/{fname}-1.0.0.apk",
        "added": "2026-11-12", "updated": "2026-11-12", "whatsNew": "", "version": "1.0.0", "build": "1", "size": 0,
        "minAndroid": "8.0", "pkg": cfg["pkg"], "perms": sorted(set(["POST_NOTIFICATIONS", "RECEIVE_BOOT_COMPLETED", "VIBRATE"] + cfg.get("perms", [])))}
e = next((a for a in d["apps"] if a.get("pkg") == cfg["pkg"]), None)
if e is None: e = dict(base); d["apps"].append(e)
e.update({k: v for k, v in base.items() if k not in e})
e.update(fields)
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
print("entry", aid, e["download"])
