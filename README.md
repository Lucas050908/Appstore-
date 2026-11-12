# Lucas' App Store

Alle de apps, jeg laver med Claude – samlet ét sted.

**Hent butik-appen:** [LucasAppStore.apk](https://github.com/Lucas050908/Appstore-/raw/main/apks/LucasAppStore.apk)

## Indhold

| Mappe | Hvad |
|---|---|
| `store/apps.json` | App-listen. Appen henter den herfra, så nye apps dukker op uden ny version af butikken. |
| `store/icons/` | Ikoner (192×192). |
| `store/index.html` | Butikssiden – bruges både i appen og som hjemmeside. |
| `android/` | Android-appen (WebView + installation af APK'er). |
| `add_app.py` | Læser en APK og tilføjer/opdaterer den i `apps.json`. |

APK-filerne ligger i `apks/` og hentes via raw.githubusercontent.com.

## Tilføj en app

```bash
pip install androguard pillow
python3 add_app.py Min-App-1.0.apk store --download https://raw.githubusercontent.com/Lucas050908/Appstore-/main/apks/Min-App-1.0.apk
cp Min-App-1.0.apk apks/
```
Udfyld derefter `tagline`, `category`, `desc` og `features` i `store/apps.json` og push.

## Ny version af butik-appen

Hæv `versionCode`/`versionName` i `android/app/build.gradle`, opdater app-store-linjen i `apps.json`, og push. GitHub Actions bygger, signerer og lægger APK'en i `apks/`.
Signeringsnøglen ligger i `android/signing/release.jks` (adgangskode i workflowet). Brug altid den samme nøgle – ellers kan opdateringer ikke installeres.
