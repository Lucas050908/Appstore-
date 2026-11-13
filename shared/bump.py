#!/usr/bin/env python3
"""Hæv versionen på en app:  python3 -I shared/bump.py <id> <version>   (versionCode +1)"""
import re, sys, os, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aid, ver = sys.argv[1], sys.argv[2]
g = os.path.join(ROOT, "apps", aid, "app", "build.gradle"); r = os.path.join(ROOT, "apps", aid, "repack.json")
if os.path.exists(r):
    c = json.load(open(r))
    if c["version"] != ver: c["version"] = ver; c["code"] += 1; open(r, "w").write(json.dumps(c) + "\n")
    print(aid, c["version"], c["code"])
else:
    s = open(g).read(); old = re.search(r'versionName "([^"]+)"', s).group(1)
    if old != ver:
        s = re.sub(r"versionCode (\d+)", lambda m: "versionCode %d" % (int(m.group(1)) + 1), s, 1); s = re.sub(r'versionName "[^"]+"', 'versionName "%s"' % ver, s, 1); open(g, "w").write(s)
    print(aid, re.search(r'versionName "([^"]+)"', s).group(1), re.search(r"versionCode (\d+)", s).group(1))
