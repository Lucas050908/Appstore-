# Gambit

Web-delen ligger i `web/`. Den native skal findes kun som APK: `base.apk` er Gambit 1.0.0, og `shared/repack.py`
lægger nyt web-indhold og ny version i den. CI signerer med butikkens nøgle.

- Ny version: ret `repack.json` (`version` + `code`) og `VERSION` i `web/app.js`.
- UI-test: `python3 apps/gambit/test/ui.py` (headless Chrome).
- Nye opgaver: `node tools/genpuzzles.js 400 > /tmp/p.js` – motoren spiller mod sig selv og gemmer stillinger med entydig mat.
