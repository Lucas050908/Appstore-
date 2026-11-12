#!/usr/bin/env python3
"""Ompak en WebView-app: behold den native skal fra en eksisterende APK, skift web-indholdet og versionen.

Brug:  python3 -I shared/repack.py apps/<id>/repack.json <ud.apk>
repack.json: {"name","base","web","prefix","version","code"}

Resultatet er usigneret og skal bagefter gennem zipalign + apksigner (se .github/workflows/build-<id>.yml).
Bruges til apps, hvor den native kildekode kun findes som APK (Takt, Gambit).
"""
import json, os, struct, sys, zipfile

RES_VERSION_CODE, RES_VERSION_NAME = 0x0101021B, 0x0101021C


def _pool(buf, off):
    """Læs string pool → (strings, utf8, chunk_size, header)"""
    typ, hs, size, n, styles, flags, sstart, ststart = struct.unpack_from("<HHIIIIII", buf, off)
    assert typ == 0x0001 and styles == 0, "uventet string pool"
    utf8 = bool(flags & 0x100)
    offs = struct.unpack_from("<%dI" % n, buf, off + hs)
    out = []
    for o in offs:
        p = off + sstart + o
        if utf8:
            def ln(p):
                v = buf[p]
                return ((v & 0x7F) << 8 | buf[p + 1], p + 2) if v & 0x80 else (v, p + 1)
            _, p = ln(p); bl, p = ln(p)
            out.append(buf[p:p + bl].decode("utf-8", "replace"))
        else:
            l = struct.unpack_from("<H", buf, p)[0]; p += 2
            if l & 0x8000: l = (l & 0x7FFF) << 16 | struct.unpack_from("<H", buf, p)[0]; p += 2
            out.append(buf[p:p + 2 * l].decode("utf-16-le"))
    return out, utf8, size, (hs, flags)


def _build_pool(strings, utf8, hs, flags):
    data, offs = b"", []
    for s in strings:
        offs.append(len(data))
        if utf8:
            b = s.encode("utf-8")
            def ln(v): return bytes([0x80 | v >> 8, v & 0xFF]) if v > 0x7F else bytes([v])
            data += ln(len(s)) + ln(len(b)) + b + b"\0"
        else:
            b = s.encode("utf-16-le")
            data += struct.pack("<H", len(s)) + b + b"\0\0"
    data += b"\0" * (-len(data) % 4)
    sstart = hs + 4 * len(strings)
    return struct.pack("<HHIIIIII", 1, hs, sstart + len(data), len(strings), 0, flags, sstart, 0) + b"\0" * (hs - 28) + struct.pack("<%dI" % len(offs), *offs) + data


def patch_manifest(buf, version, code):
    typ, hs, _ = struct.unpack_from("<HHI", buf, 0)
    assert typ == 0x0003, "ikke binær AndroidManifest"
    strings, utf8, psize, (phs, pflags) = _pool(buf, hs)
    rest = bytearray(buf[hs + psize:])
    # resource map
    typ, mhs, msize = struct.unpack_from("<HHI", rest, 0)
    assert typ == 0x0180, "mangler resource map"
    resmap = struct.unpack_from("<%dI" % ((msize - mhs) // 4), rest, mhs)
    done = set(); p = msize
    while p < len(rest):
        typ, chs, csize = struct.unpack_from("<HHI", rest, p)
        if typ == 0x0102:  # START_TAG
            name = struct.unpack_from("<I", rest, p + 20)[0]
            astart, asize, acount = struct.unpack_from("<HHH", rest, p + 24)
            if strings[name] == "manifest":
                for i in range(acount):
                    a = p + 16 + astart + i * asize
                    nm = struct.unpack_from("<I", rest, a + 4)[0]
                    rid = resmap[nm] if nm < len(resmap) else 0
                    if rid == RES_VERSION_CODE:
                        struct.pack_into("<I", rest, a + 16, int(code)); done.add("code")
                    elif rid == RES_VERSION_NAME:
                        strings.append(str(version)); idx = len(strings) - 1
                        struct.pack_into("<I", rest, a + 8, idx); struct.pack_into("<I", rest, a + 16, idx); done.add("name")
                break
        p += csize
    assert done == {"code", "name"}, "fandt ikke versionCode/versionName: %s" % done
    pool = _build_pool(strings, utf8, phs, pflags)
    return struct.pack("<HHI", 0x0003, hs, hs + len(pool) + len(rest)) + b"\0" * (hs - 8) + pool + bytes(rest)


def main():
    cfg_path, out = sys.argv[1], sys.argv[2]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = json.load(open(cfg_path))
    base, web, prefix = os.path.join(root, cfg["base"]), os.path.join(root, cfg["web"]), cfg["prefix"]
    zin = zipfile.ZipFile(base)
    with zipfile.ZipFile(out, "w") as z:
        for it in zin.infolist():
            n = it.filename
            if n.startswith("META-INF/") and (n.endswith((".SF", ".RSA", ".DSA", ".EC")) or n == "META-INF/MANIFEST.MF"): continue
            if n.startswith(prefix) or n.endswith("/"): continue
            data = zin.read(n)
            if n == "AndroidManifest.xml": data = patch_manifest(data, cfg["version"], cfg["code"])
            zi = zipfile.ZipInfo(n, (1981, 1, 1, 1, 1, 2)); zi.compress_type = it.compress_type; zi.external_attr = it.external_attr
            z.writestr(zi, data)
        n = 0
        for d, _, fs in sorted(os.walk(web)):
            for f in sorted(fs):
                full = os.path.join(d, f); rel = os.path.relpath(full, web).replace(os.sep, "/")
                zi = zipfile.ZipInfo(prefix + rel, (1981, 1, 1, 1, 1, 2))
                zi.compress_type = zipfile.ZIP_STORED if f.endswith((".woff2", ".png", ".jpg", ".webp")) else zipfile.ZIP_DEFLATED
                z.writestr(zi, open(full, "rb").read()); n += 1
    print("ompakket", cfg["name"], cfg["version"], "(%s)" % cfg["code"], "·", n, "web-filer →", out)


if __name__ == "__main__":
    main()
