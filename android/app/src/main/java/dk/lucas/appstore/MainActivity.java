package dk.lucas.appstore;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    static final String CATALOG_URL = "https://raw.githubusercontent.com/Lucas050908/Appstore-/main/store/apps.json";
    static final String ASSET_BASE = "https://raw.githubusercontent.com/Lucas050908/Appstore-/main/store/";

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private File pendingApk;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#0c0c10"));
        w.setNavigationBarColor(Color.parseColor("#0c0c10"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0c0c10"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pendingApk != null && canInstall()) {
            File f = pendingApk; pendingApk = null;
            launchInstaller(f);
        }
        if (web != null) web.evaluateJavascript("window.onNativeResume&&onNativeResume()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onNativeBack?onNativeBack():false", v -> {
            if (!"true".equals(v)) MainActivity.super.onBackPressed();
        });
    }

    private void js(String fn, Object... args) {
        StringBuilder sb = new StringBuilder("window.").append(fn).append("&&").append(fn).append("(");
        for (int i = 0; i < args.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(JSONObject.quote(String.valueOf(args[i])));
        }
        sb.append(")");
        ui.post(() -> web.evaluateJavascript(sb.toString(), null));
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
    }

    private void launchInstaller(File apk) {
        Uri uri = ApkProvider.uriFor(this, apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        return o.toByteArray();
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Cache-Control", "no-cache");
        // Follow cross-host redirects (GitHub release -> objects.githubusercontent.com)
        for (int i = 0; i < 5; i++) {
            int code = c.getResponseCode();
            if (code / 100 == 3) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                c = (HttpURLConnection) new URL(new URL(url), loc).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                url = c.getURL().toString();
            } else break;
        }
        return c;
    }

    class Bridge {
        @JavascriptInterface
        public String assetBase() { return ASSET_BASE; }

        @JavascriptInterface
        public String appVersion() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return ""; }
        }

        /** Installed versionName for a package, or "" if not installed. */
        @JavascriptInterface
        public String installedVersion(String pkg) {
            try {
                PackageInfo p = getPackageManager().getPackageInfo(pkg, 0);
                return p.versionName == null ? "?" : p.versionName;
            } catch (PackageManager.NameNotFoundException e) { return ""; }
        }

        @JavascriptInterface
        public boolean openApp(String pkg) {
            Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            startActivity(i);
            return true;
        }

        /** Fetch the catalog; calls onCatalog(json, fromCache) and falls back to the last saved copy. */
        @JavascriptInterface
        public void loadCatalog() {
            new Thread(() -> {
                File cache = new File(getFilesDir(), "apps.json");
                try {
                    HttpURLConnection c = open(CATALOG_URL + "?t=" + System.currentTimeMillis());
                    if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                    byte[] data = readAll(c.getInputStream());
                    new JSONObject(new String(data, StandardCharsets.UTF_8)); // validate
                    try (OutputStream o = new FileOutputStream(cache)) { o.write(data); }
                    js("onCatalog", new String(data, StandardCharsets.UTF_8), "0");
                } catch (Exception e) {
                    try (InputStream in = cache.exists() ? new FileInputStream(cache) : getAssets().open("apps.json")) {
                        js("onCatalog", new String(readAll(in), StandardCharsets.UTF_8), "1");
                    } catch (Exception e2) {
                        js("onCatalogError", String.valueOf(e.getMessage()));
                    }
                }
            }).start();
        }

        /** Download an APK and hand it to the system installer. Reports onProgress(id, pct) / onDownloadDone(id, ok, msg). */
        @JavascriptInterface
        public void install(String id, String url) {
            new Thread(() -> {
                File dir = new File(getCacheDir(), "apks");
                dir.mkdirs();
                for (File old : dir.listFiles()) old.delete();
                File out = new File(dir, id.replaceAll("[^a-zA-Z0-9_-]", "") + ".apk");
                try {
                    HttpURLConnection c = open(url);
                    if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                    long total = c.getContentLengthLong();
                    try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(out)) {
                        byte[] buf = new byte[65536]; long done = 0; int n, last = -1;
                        while ((n = in.read(buf)) > 0) {
                            o.write(buf, 0, n); done += n;
                            if (total > 0) {
                                int pct = (int) (done * 100 / total);
                                if (pct != last) { last = pct; js("onProgress", id, pct); }
                            }
                        }
                    }
                    js("onDownloadDone", id, "1", "");
                    ui.post(() -> {
                        if (canInstall()) launchInstaller(out);
                        else {
                            pendingApk = out;
                            Toast.makeText(MainActivity.this, "Tillad installation fra App Store, og gå tilbage", Toast.LENGTH_LONG).show();
                            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                        }
                    });
                } catch (Exception e) {
                    out.delete();
                    js("onDownloadDone", id, "0", String.valueOf(e.getMessage()));
                }
            }).start();
        }
    }
}
