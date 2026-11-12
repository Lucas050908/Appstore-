#!/usr/bin/env python3
"""Opret en ny app i Appstore- repoet ud fra den fælles skal.

Brug: python3 shared/newapp.py <config.json>
config: {id, name, pkg, postit: "#hex", accent: "#hex", grad: ["#a","#b"], glyph: ["svg path d", ...],
         fills: ["svg path d" ...] (valgfri, udfyldte), perms: ["CAMERA", ...], minSdk: 26,
         quickLabel: "+", quickSub: "Ny", quickHash: "add", widgetDesc: "...", quickDesc: "..."}
Skriver: apps/<id>/ (Gradle-projekt), .github/workflows/build-<id>.yml, store/icons/<id>.png.
Web-UI'et (apps/<id>/app/src/main/assets/index.html) skrives separat; base.css og fonts kopieres hertil.
"""
import json, os, re, shutil, sys
import cairosvg
from PIL import Image, ImageDraw
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(ROOT, "shared", "android-template")
cfg = json.load(open(sys.argv[1]))
aid, name, pkg = cfg["id"], cfg["name"], cfg["pkg"]
APP = os.path.join(ROOT, "apps", aid)
MAIN = os.path.join(APP, "app", "src", "main")
RES = os.path.join(MAIN, "res")
os.makedirs(RES, exist_ok=True)

def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(text)

def sub(text):
    return (text.replace("{{PKG}}", pkg).replace("{{NAME}}", name).replace("{{ACCENT}}", cfg.get("accent", "#F3D867"))
            .replace("{{QUICK_HASH}}", cfg.get("quickHash", "")))

# ---------- Java ----------
jdir = os.path.join(MAIN, "java", *pkg.split("."))
for f in os.listdir(os.path.join(TPL, "java")):
    w(os.path.join(jdir, f), sub(open(os.path.join(TPL, "java", f)).read()))

# ---------- Gradle ----------
w(os.path.join(APP, "settings.gradle"), f'''pluginManagement {{
    repositories {{ google(); mavenCentral(); gradlePluginPortal() }}
}}
dependencyResolutionManagement {{
    repositories {{ google(); mavenCentral() }}
}}
rootProject.name = "{re.sub(r'[^A-Za-z0-9]', '', name) or aid}"
include ":app"
''')
w(os.path.join(APP, "build.gradle"), 'plugins {\n    id "com.android.application" version "8.7.3" apply false\n}\n')
w(os.path.join(APP, "gradle.properties"), "org.gradle.jvmargs=-Xmx2g\nandroid.useAndroidX=false\n")
appg = os.path.join(APP, "app", "build.gradle")
vc, vn = 1, "1.0.0"
if os.path.exists(appg):  # behold version ved gen-generering
    g = open(appg).read()
    vc = int(re.search(r"versionCode (\d+)", g).group(1)); vn = re.search(r'versionName "([^"]+)"', g).group(1)
w(appg, f'''plugins {{ id "com.android.application" }}

android {{
    namespace "{pkg}"
    compileSdk 34

    defaultConfig {{
        applicationId "{pkg}"
        minSdk {cfg.get("minSdk", 26)}
        targetSdk 34
        versionCode {vc}
        versionName "{vn}"
    }}

    signingConfigs {{
        release {{
            def ks = System.getenv("KEYSTORE_FILE")
            if (ks) {{
                storeFile file(ks)
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEYSTORE_PASSWORD")
            }}
        }}
    }}

    buildTypes {{
        release {{
            minifyEnabled false
            signingConfig System.getenv("KEYSTORE_FILE") ? signingConfigs.release : signingConfigs.debug
        }}
    }}

    compileOptions {{
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }}

    lint {{ abortOnError false; checkReleaseBuilds false }}
}}
''')

# ---------- Manifest ----------
perms = ["POST_NOTIFICATIONS", "RECEIVE_BOOT_COMPLETED", "VIBRATE"] + cfg.get("perms", [])
features = ""
if "CAMERA" in perms:
    features += '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n'
w(os.path.join(MAIN, "AndroidManifest.xml"), f'''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
{"".join(f'    <uses-permission android:name="android.permission.{p}" />' + chr(10) for p in dict.fromkeys(perms))}{features}
    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher"
        android:theme="@style/AppTheme"
        android:allowBackup="true"
        android:supportsRtl="true">

        <activity android:name=".MainActivity" android:exported="true" android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|uiMode|smallestScreenSize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <provider android:name=".ShareProvider" android:authorities="{pkg}.share"
            android:exported="false" android:grantUriPermissions="true" />

        <receiver android:name=".Notifier" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.DATE_CHANGED" />
            </intent-filter>
        </receiver>

        <receiver android:name=".WidgetNote" android:exported="true" android:label="@string/w_note">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/winfo_note" />
        </receiver>
        <receiver android:name=".WidgetQuick" android:exported="true" android:label="@string/w_quick">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/winfo_quick" />
        </receiver>
    </application>
</manifest>
''')

# ---------- Ressourcer ----------
pc = cfg["postit"].lstrip("#").upper()
esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace("'", "\\'")
w(os.path.join(RES, "values", "strings.xml"), f'''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">{esc(name)}</string>
    <string name="w_note">{esc(cfg.get("widgetDesc", name))}</string>
    <string name="w_quick">{esc(cfg.get("quickDesc", name + ": genvej"))}</string>
</resources>
''')
w(os.path.join(RES, "values", "styles.xml"), '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="android:Theme.Material.NoActionBar">
        <item name="android:windowBackground">@color/bg</item>
        <item name="android:statusBarColor">@color/bg</item>
        <item name="android:navigationBarColor">@color/bg</item>
        <item name="android:colorAccent">#F3D867</item>
    </style>
    <color name="bg">#12110F</color>
</resources>
''')
w(os.path.join(RES, "drawable", "wbg.xml"), f'''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:top="3dp" android:left="1dp" android:right="1dp">
        <shape><solid android:color="#33000000"/>
            <corners android:topLeftRadius="4dp" android:topRightRadius="4dp" android:bottomLeftRadius="4dp" android:bottomRightRadius="20dp"/></shape>
    </item>
    <item android:bottom="3dp">
        <shape><solid android:color="#{pc}"/>
            <corners android:topLeftRadius="3dp" android:topRightRadius="3dp" android:bottomLeftRadius="3dp" android:bottomRightRadius="18dp"/></shape>
    </item>
    <item android:bottom="3dp" android:gravity="bottom|end" android:width="18dp" android:height="18dp" android:drawable="@drawable/fold"/>
    <item android:gravity="top|center_horizontal" android:width="56dp" android:height="12dp">
        <shape><solid android:color="#7FFFFFFF"/></shape>
    </item>
</layer-list>
''')
w(os.path.join(RES, "drawable", "fold.xml"), '''<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="18dp" android:height="18dp" android:viewportWidth="18" android:viewportHeight="18">
    <path android:fillColor="#17000000" android:pathData="M18,0 A18,18 0 0,1 0,18 Z"/>
</vector>
''')
w(os.path.join(RES, "drawable", "wbtn_dark.xml"), '''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#1D1B17"/>
    <corners android:topLeftRadius="4dp" android:topRightRadius="4dp" android:bottomLeftRadius="4dp" android:bottomRightRadius="14dp"/>
</shape>
''')
glyph = cfg["glyph"]; fills = cfg.get("fills", [])
w(os.path.join(RES, "drawable", "ic_stat.xml"), '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n' +
  "".join(f'    <path android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000" android:pathData="{d}"/>\n' for d in glyph) +
  "".join(f'    <path android:fillColor="#FFFFFFFF" android:pathData="{d}"/>\n' for d in fills) + "</vector>\n")
os.makedirs(os.path.join(RES, "font"), exist_ok=True)
shutil.copy(os.path.join(ROOT, "shared", "fonts", "caveat.ttf"), os.path.join(RES, "font", "caveat.ttf"))
w(os.path.join(RES, "layout", "widget_note.xml"), '''<?xml version="1.0" encoding="utf-8"?>
<RelativeLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/root" android:layout_width="match_parent" android:layout_height="match_parent"
    android:background="@drawable/wbg" android:paddingStart="18dp" android:paddingEnd="14dp" android:paddingTop="14dp" android:paddingBottom="16dp">
    <TextView android:id="@+id/quick" android:layout_width="40dp" android:layout_height="40dp" android:layout_alignParentEnd="true" android:layout_alignParentTop="true"
        android:background="@drawable/wbtn_dark" android:gravity="center" android:text="''' + esc(cfg.get("quickLabel", "+")) + '''" android:textColor="#F3D867" android:textSize="22sp" android:textStyle="bold"/>
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:layout_centerVertical="true" android:layout_toStartOf="@id/quick" android:layout_marginEnd="6dp">
        <TextView android:id="@+id/title" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="''' + esc(name) + '''"
            android:fontFamily="@font/caveat" android:textSize="21sp" android:textColor="#5A5446" android:singleLine="true" android:ellipsize="end" android:includeFontPadding="false"/>
        <TextView android:id="@+id/value" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="Åbn"
            android:fontFamily="serif" android:textStyle="bold" android:textSize="30sp" android:textColor="#1D1B17" android:singleLine="true" android:ellipsize="end" android:includeFontPadding="false"/>
        <TextView android:id="@+id/sub" android:layout_width="match_parent" android:layout_height="wrap_content"
            android:textSize="13sp" android:textColor="#5A5446" android:singleLine="true" android:ellipsize="end" android:layout_marginTop="2dp"/>
        <TextView android:id="@+id/l1" style="@style/WLine"/>
        <TextView android:id="@+id/l2" style="@style/WLine"/>
        <TextView android:id="@+id/l3" style="@style/WLine"/>
    </LinearLayout>
</RelativeLayout>
''')
st = open(os.path.join(RES, "values", "styles.xml")).read().replace("</resources>", '''    <style name="WLine">
        <item name="android:layout_width">match_parent</item>
        <item name="android:layout_height">wrap_content</item>
        <item name="android:textSize">13sp</item>
        <item name="android:textColor">#1D1B17</item>
        <item name="android:singleLine">true</item>
        <item name="android:ellipsize">end</item>
        <item name="android:layout_marginTop">3dp</item>
    </style>
</resources>''')
w(os.path.join(RES, "values", "styles.xml"), st)
w(os.path.join(RES, "layout", "widget_quick.xml"), '''<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/root" android:layout_width="match_parent" android:layout_height="match_parent"
    android:orientation="vertical" android:gravity="center" android:background="@drawable/wbtn_dark" android:padding="6dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="''' + esc(cfg.get("quickLabel", "+")) + '''"
        android:textColor="#F3D867" android:textSize="30sp" android:textStyle="bold" android:includeFontPadding="false"/>
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="''' + esc(cfg.get("quickSub", name)) + '''"
        android:fontFamily="@font/caveat" android:textColor="#F3D867" android:textSize="17sp" android:includeFontPadding="false" android:singleLine="true"/>
</LinearLayout>
''')
for n, wdt, h, cw, ch in [("note", 250, 110, 4, 2), ("quick", 40, 40, 1, 1)]:
    w(os.path.join(RES, "xml", f"winfo_{n}.xml"), f'''<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="{wdt}dp" android:minHeight="{h}dp" android:targetCellWidth="{cw}" android:targetCellHeight="{ch}"
    android:resizeMode="horizontal|vertical" android:widgetCategory="home_screen" android:updatePeriodMillis="3600000"
    android:initialLayout="@layout/widget_{n}" android:previewLayout="@layout/widget_{n}" android:description="@string/w_{n}"/>
''')

# ---------- Ikon ----------
def svg(size, scale, color="#fff", bg=None, rounded=False):
    g1, g2 = cfg["grad"]
    s = 24 * scale
    off = (size - s) / 2
    paths = "".join(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' for d in glyph)
    paths += "".join(f'<path d="{d}" fill="{color}"/>' for d in fills)
    back = ""
    if bg:
        rx = size * 0.23 if rounded else 0
        back = f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{g1}"/><stop offset="1" stop-color="{g2}"/></linearGradient></defs><rect width="{size}" height="{size}" rx="{rx}" fill="url(#g)"/>'
    doc = f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{back}<g transform="translate({off},{off}) scale({scale})">{paths}</g></svg>'
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=doc.encode()))).convert("RGBA")

for k, f in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
    d = os.path.join(RES, "mipmap-" + k); os.makedirs(d, exist_ok=True)
    n = int(48 * f); m = int(108 * f)
    svg(n, n * 0.6 / 24, bg=True, rounded=True).save(os.path.join(d, "ic_launcher.png"))
    svg(m, m * 0.40 / 24).save(os.path.join(d, "ic_launcher_foreground.png"))
    svg(m, m * 0.40 / 24).save(os.path.join(d, "ic_launcher_monochrome.png"))
    bgimg = svg(m, 0.01, color="none", bg=True); bgimg.save(os.path.join(d, "ic_launcher_background.png"))
w(os.path.join(RES, "mipmap-anydpi-v26", "ic_launcher.xml"), '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@mipmap/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
''')
svg(192, 192 * 0.6 / 24, bg=True, rounded=True).save(os.path.join(ROOT, "store", "icons", aid + ".png"))

# ---------- Assets ----------
A = os.path.join(MAIN, "assets"); os.makedirs(os.path.join(A, "fonts"), exist_ok=True)
shutil.copy(os.path.join(ROOT, "shared", "postit-base.css"), os.path.join(A, "base.css"))
shutil.copy(os.path.join(ROOT, "shared", "kit.js"), os.path.join(A, "kit.js"))
for fn in ("caveat-700.woff2", "newsreader-400.woff2", "newsreader-600.woff2", "OFL-Caveat.txt"):
    shutil.copy(os.path.join(ROOT, "shared", "fonts", fn), os.path.join(A, "fonts", fn))

# ---------- Workflow ----------
wf = open(os.path.join(ROOT, ".github", "workflows", "build-tik.yml")).read()
wf = wf.replace("Byg Tik APK", f"Byg {name} APK").replace("apps/tik", f"apps/{aid}").replace("build-tik", f"build-{aid}") \
       .replace("tik.log", f"{aid}.log").replace("Tik-$VER", re.sub(r'[^A-Za-z0-9]', '', name) + "-$VER").replace("Byg Tik ", f"Byg {name} ")
w(os.path.join(ROOT, ".github", "workflows", f"build-{aid}.yml"), wf)
print("ok", aid, "->", APP)
