package {{PKG}};

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Fælles skal for Lucas' apps: WebView med web-UI fra assets + broen "App".
 * Genereret fra shared/android-template – ret skabelonen, ikke kopien.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> fileCb;
    private PermissionRequest pendingWebPerm;
    private GeolocationPermissions.Callback geoCb;
    private String geoOrigin;
    private String pendingPermName;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        int bg = Color.parseColor("#12110F");
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        web = new WebView(this);
        web.setBackgroundColor(bg);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "App");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath() == null || u.getPath().equals("/") ? "index.html" : u.getPath().substring(1);
                try {
                    return new WebResourceResponse(mime(path), "utf-8", getAssets().open(path));
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (HOST.equals(r.getUrl().getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception ignored) {}
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest req) {
                ui.post(() -> handleWebPermission(req));
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (hasLocation()) { cb.invoke(origin, true, false); return; }
                geoCb = cb; geoOrigin = origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, 31);
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(p.createIntent(), 41); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        setContentView(web);
        String hash = hashFrom(getIntent());
        web.loadUrl("https://" + HOST + "/index.html" + (hash != null ? "#" + hash : ""));
        Notifier.rescheduleAll(this);
    }

    private static String hashFrom(Intent i) {
        if (i == null) return null;
        String h = i.getStringExtra("hash");
        return h == null || h.isEmpty() ? null : h;
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        return "application/octet-stream";
    }

    // ---------- tilladelser fra web (kamera/mikrofon) ----------
    private void handleWebPermission(PermissionRequest req) {
        List<String> need = new ArrayList<>();
        for (String r : req.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.CAMERA);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.RECORD_AUDIO);
        }
        if (need.isEmpty()) { req.grant(req.getResources()); return; }
        pendingWebPerm = req;
        requestPermissions(need.toArray(new String[0]), 30);
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        boolean ok = res.length > 0;
        for (int r : res) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
        if (code == 30 && pendingWebPerm != null) {
            if (ok) pendingWebPerm.grant(pendingWebPerm.getResources()); else pendingWebPerm.deny();
            pendingWebPerm = null;
        } else if (code == 31 && geoCb != null) {
            geoCb.invoke(geoOrigin, hasLocation(), false);
            geoCb = null;
        } else if (code == 32) {
            if (pendingPermName != null && pendingPermName.equals("location")) ok = hasLocation();
            js("onPerm", pendingPermName, ok ? "1" : "0");
            if ("location".equals(pendingPermName) && ok) new Bridge().location();
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == 41 && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
        } else if (req == 42 && res == RESULT_OK && data != null && data.getData() != null) {
            try (InputStream in = getContentResolver().openInputStream(data.getData())) {
                js("onFilePicked", new String(readAll(in), StandardCharsets.UTF_8));
            } catch (Exception e) {
                Toast.makeText(this, "Kunne ikke læse filen", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String h = hashFrom(intent);
        if (h != null) js("openHash", h);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onNativeResume&&onNativeResume()", null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.evaluateJavascript("window.onNativePause&&onNativePause()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onNativeBack?onNativeBack():false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    void js(String fn, String... args) {
        StringBuilder sb = new StringBuilder("window.").append(fn).append("&&").append(fn).append("(");
        for (int i = 0; i < args.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(JSONObject.quote(args[i] == null ? "" : args[i]));
        }
        sb.append(")");
        ui.post(() -> { if (web != null) web.evaluateJavascript(sb.toString(), null); });
    }

    static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        return o.toByteArray();
    }

    static void writeAtomic(File f, String text) throws java.io.IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) {
            o.write(text.getBytes(StandardCharsets.UTF_8));
            o.getFD().sync();
        }
        if (!tmp.renameTo(f)) throw new java.io.IOException("rename");
    }

    private static String safeKey(String k) {
        return k == null ? "data" : k.replaceAll("[^A-Za-z0-9_-]", "_");
    }

    class Bridge {
        @JavascriptInterface public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }

        /** Læs gemt JSON (eller null). Falder tilbage til forrige version, hvis filen er ødelagt. */
        @JavascriptInterface public String load(String key) {
            String k = safeKey(key);
            for (File f : new File[]{new File(getFilesDir(), k + ".json"), new File(getFilesDir(), k + ".json.bak")}) {
                if (!f.exists()) continue;
                try (InputStream in = new FileInputStream(f)) {
                    String s = new String(readAll(in), StandardCharsets.UTF_8);
                    if (s.startsWith("{")) new JSONObject(s); else if (s.startsWith("[")) new JSONArray(s);
                    return s;
                } catch (Exception ignored) {}
            }
            return null;
        }

        /** Gem atomisk + én automatisk backup pr. dag (7 beholdes). */
        @JavascriptInterface public boolean save(String key, String data) {
            String k = safeKey(key);
            try {
                File f = new File(getFilesDir(), k + ".json");
                if (f.exists()) {
                    File bak = new File(getFilesDir(), k + ".json.bak");
                    if (bak.exists()) bak.delete();
                    f.renameTo(bak);
                }
                writeAtomic(f, data);
                File dir = new File(getFilesDir(), "backups");
                dir.mkdirs();
                String day = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
                writeAtomic(new File(dir, k + "-" + day + ".json"), data);
                File[] all = dir.listFiles((d, n) -> n.startsWith(k + "-") && n.endsWith(".json"));
                if (all != null && all.length > 7) {
                    Arrays.sort(all);
                    for (int i = 0; i < all.length - 7; i++) all[i].delete();
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface public void share(String name, String mime, String text) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File o : old) o.delete();
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                writeAtomic(new File(dir, safe), text);
                Uri u = Uri.parse("content://" + getPackageName() + ".share/" + Uri.encode(safe));
                Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, u)
                        .putExtra(Intent.EXTRA_SUBJECT, safe).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                ui.post(() -> startActivity(Intent.createChooser(send, "Del " + safe)));
            } catch (Exception e) {
                ui.post(() -> Toast.makeText(MainActivity.this, "Kunne ikke dele", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface public void shareText(String text) {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            ui.post(() -> startActivity(Intent.createChooser(send, "Del")));
        }

        @JavascriptInterface public void copy(String text) {
            ui.post(() -> {
                ClipboardManager cm = getSystemService(ClipboardManager.class);
                cm.setPrimaryClip(ClipData.newPlainText("tekst", text));
            });
        }

        @JavascriptInterface public void openUrl(String url) {
            ui.post(() -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {} });
        }

        @JavascriptInterface public void pickFile() {
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try { startActivityForResult(i, 42); } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface public void haptic(String kind) {
            ui.post(() -> web.performHapticFeedback("heavy".equals(kind) ? HapticFeedbackConstants.LONG_PRESS : HapticFeedbackConstants.CLOCK_TICK));
        }

        @JavascriptInterface public void toast(String text) {
            ui.post(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface public void keepAwake(boolean on) {
            ui.post(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface public void setSystemBars(boolean dark) {
            ui.post(() -> {
                int c = Color.parseColor(dark ? "#12110F" : "#F2EDE3");
                getWindow().setStatusBarColor(c);
                getWindow().setNavigationBarColor(c);
                int f = dark ? 0 : (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                getWindow().getDecorView().setSystemUiVisibility(f);
                web.setBackgroundColor(c);
            });
        }

        /** Widget-snapshot: {title, value, sub, lines:[...], hash} – tegnes af WidgetNote/WidgetQuick. */
        @JavascriptInterface public void widget(String json) {
            getSharedPreferences("app", MODE_PRIVATE).edit().putString("widget", json).apply();
            Widgets.updateAll(MainActivity.this);
        }

        /** Planlæg en påmindelse (notifikation) – overlever genstart. */
        @JavascriptInterface public void schedule(String id, double at, String title, String text, String hash) {
            Notifier.schedule(MainActivity.this, id, (long) at, title, text, hash);
            askNotifications();
        }

        @JavascriptInterface public void cancel(String id) {
            Notifier.cancel(MainActivity.this, id);
        }

        @JavascriptInterface public boolean hasPerm(String name) {
            switch (name) {
                case "camera": return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
                case "mic": return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
                case "location": return hasLocation();
                case "notifications": return Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
                default: return false;
            }
        }

        @JavascriptInterface public void requestPerm(String name) {
            pendingPermName = name;
            String[] p;
            switch (name) {
                case "camera": p = new String[]{Manifest.permission.CAMERA}; break;
                case "mic": p = new String[]{Manifest.permission.RECORD_AUDIO}; break;
                case "location": p = new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}; break;
                case "notifications":
                    if (Build.VERSION.SDK_INT < 33) { js("onPerm", name, "1"); return; }
                    p = new String[]{Manifest.permission.POST_NOTIFICATIONS}; break;
                default: js("onPerm", name, "0"); return;
            }
            String[] fp = p;
            ui.post(() -> requestPermissions(fp, 32));
        }

        @JavascriptInterface public void openSettings() {
            ui.post(() -> startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
        }

        /** Hent placering: onLocation(lat, lon, nøjagtighed) eller onLocationError(grund). */
        @JavascriptInterface public void location() {
            if (!hasLocation()) { js("onLocationError", "perm"); return; }
            ui.post(() -> {
                LocationManager lm = getSystemService(LocationManager.class);
                Location best = null;
                try {
                    for (String p : lm.getProviders(true)) {
                        Location l = lm.getLastKnownLocation(p);
                        if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
                    }
                } catch (SecurityException ignored) {}
                if (best != null && System.currentTimeMillis() - best.getTime() < 30 * 60 * 1000L) { sendLoc(best); return; }
                String prov = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER
                        : lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : null;
                if (prov == null) { if (best != null) sendLoc(best); else js("onLocationError", "off"); return; }
                final Location fallback = best;
                try {
                    if (Build.VERSION.SDK_INT >= 30) {
                        lm.getCurrentLocation(prov, new CancellationSignal(), getMainExecutor(), l -> {
                            if (l != null) sendLoc(l); else if (fallback != null) sendLoc(fallback); else js("onLocationError", "none");
                        });
                    } else {
                        lm.requestSingleUpdate(prov, new android.location.LocationListener() {
                            @Override public void onLocationChanged(Location l) { sendLoc(l); }
                            @Override public void onStatusChanged(String s, int i, Bundle b) {}
                            @Override public void onProviderEnabled(String s) {}
                            @Override public void onProviderDisabled(String s) {}
                        }, Looper.getMainLooper());
                    }
                } catch (SecurityException e) { js("onLocationError", "perm"); }
            });
        }

        private void sendLoc(Location l) {
            js("onLocation", String.valueOf(l.getLatitude()), String.valueOf(l.getLongitude()), String.valueOf(l.getAccuracy()));
        }
    }

    private void askNotifications() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        if (getSharedPreferences("app", MODE_PRIVATE).getBoolean("askedNotif", false)) return;
        getSharedPreferences("app", MODE_PRIVATE).edit().putBoolean("askedNotif", true).apply();
        ui.post(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 33));
    }

}
