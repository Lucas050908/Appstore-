# Takt

Web-delen ligger i `web/` og testene i `test/`. Den native skal (WebView, tre widgets) findes kun som APK:
`base.apk` er Takt 1.0.0, og `shared/repack.py` lægger nyt web-indhold og ny version i den. CI signerer med butikkens nøgle.

- Ny version: ret `repack.json` (`version` + `code`) og `VERSION` i `web/app.js`.
- Test: `PAR=3 python3 apps/takt/test/run.py [regex]` – syntetisk lyd gennem samme vej som mikrofonen (48 cases).
