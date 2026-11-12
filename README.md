# Lucas' App Store

Alle de apps, jeg laver med Claude – samlet ét sted.

**Hent butik-appen:** [LucasAppStore.apk](https://github.com/Lucas050908/Appstore-/releases/latest/download/LucasAppStore.apk)

## Indhold

| Mappe | Hvad |
|---|---|
| `store/apps.json` | App-listen. Appen henter den herfra, så nye apps dukker op uden ny version af butikken. |
| `store/icons/` | Ikoner (192×192). |
| `store/index.html` | Butikssiden – bruges både i appen og som hjemmeside. |
| `android/` | Android-appen (WebView + installation af APK'er). |
| `add_app.py` | Læser en APK og tilføjer/opdaterer den i `apps.json`. |

APK-filerne til de enkelte apps ligger i releasen **`apps`**.

## Tilføj en app

```bash
pip install androguard pillow
python3 add_app.py Min-App-1.0.apk store --download https://github.com/Lucas050908/Appstore-/releases/download/apps/Min-App-1.0.apk
gh release upload apps Min-App-1.0.apk
```
Udfyld derefter `tagline`, `category`, `desc` og `features` i `store/apps.json` og push.

## Ny version af butik-appen

Hæv `versionCode`/`versionName` i `android/app/build.gradle`, opdater app-store-linjen i `apps.json`, og push et tag `store-vX.Y.Z`. GitHub Actions bygger og udgiver APK'en.
Signeringsnøglen ligger i repo-secrets (`KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`).
