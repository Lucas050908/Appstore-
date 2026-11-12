package dk.lucas.moent;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.webkit.JavascriptInterface;
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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#12110F"));
        getWindow().setNavigationBarColor(Color.parseColor("#12110F"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#12110F"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Moent");
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
                return !HOST.equals(r.getUrl().getHost());
            }
        });
        setContentView(web);
        String tab = getIntent().getStringExtra("tab");
        web.loadUrl("https://" + HOST + "/index.html" + (tab != null ? "#" + tab : ""));
        Reminders.schedule(this);
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String tab = intent.getStringExtra("tab");
        if (tab != null && web != null) web.evaluateJavascript("window.openTab&&openTab(" + JSONObject.quote(tab) + ")", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onNativeResume&&onNativeResume()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onNativeBack?onNativeBack():false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != 9 || res != RESULT_OK || data == null || data.getData() == null) return;
        try (InputStream in = getContentResolver().openInputStream(data.getData())) {
            String txt = new String(readAll(in), StandardCharsets.UTF_8);
            web.evaluateJavascript("window.onFilePicked&&onFilePicked(" + JSONObject.quote(txt) + ")", null);
        } catch (Exception e) {
            Toast.makeText(this, "Kunne ikke læse filen", Toast.LENGTH_SHORT).show();
        }
    }

    static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        return o.toByteArray();
    }

    /** Skriv atomisk (tmp-fil + rename), så data aldrig bliver halvt skrevet. */
    static void writeAtomic(File f, String text) throws java.io.IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (OutputStream o = new FileOutputStream(tmp)) {
            o.write(text.getBytes(StandardCharsets.UTF_8));
            ((FileOutputStream) o).getFD().sync();
        }
        if (!tmp.renameTo(f)) throw new java.io.IOException("rename");
    }

    class Bridge {
        @JavascriptInterface public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }

        @JavascriptInterface public String load() {
            File f = new File(getFilesDir(), "data.json");
            for (File c : new File[]{f, new File(getFilesDir(), "data.json.bak")}) {
                if (!c.exists()) continue;
                try (InputStream in = new FileInputStream(c)) {
                    String s = new String(readAll(in), StandardCharsets.UTF_8);
                    new JSONObject(s);   // gyldig?
                    return s;
                } catch (Exception ignored) {}
            }
            return null;
        }

        @JavascriptInterface public void save(String json) {
            try {
                File f = new File(getFilesDir(), "data.json");
                if (f.exists()) {
                    File bak = new File(getFilesDir(), "data.json.bak");
                    if (bak.exists()) bak.delete();
                    f.renameTo(bak);
                }
                writeAtomic(f, json);
                dailyBackup(json);
            } catch (Exception e) {
                ui.post(() -> Toast.makeText(MainActivity.this, "Kunne ikke gemme", Toast.LENGTH_LONG).show());
            }
        }

        /** Én automatisk backup pr. dag – de 7 nyeste beholdes. */
        private void dailyBackup(String json) throws java.io.IOException {
            File dir = new File(getFilesDir(), "backups");
            dir.mkdirs();
            String day = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
            writeAtomic(new File(dir, "moent-" + day + ".json"), json);
            File[] all = dir.listFiles((d, n) -> n.startsWith("moent-") && n.endsWith(".json"));
            if (all != null && all.length > 7) {
                Arrays.sort(all);
                for (int i = 0; i < all.length - 7; i++) all[i].delete();
            }
        }

        @JavascriptInterface public void widgets(String json) {
            Store.prefs(MainActivity.this).edit().putString("snapshot", json).apply();
            MoentWidgets.updateAll(MainActivity.this);
            Reminders.schedule(MainActivity.this);
            maybeAskNotifications(json);
        }

        @JavascriptInterface public void share(String name, String mime, String text) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File o : old) o.delete();
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                File f = new File(dir, safe);
                writeAtomic(f, text);
                Uri u = Uri.parse("content://" + ShareProvider.AUTH + "/" + Uri.encode(safe));
                Intent send = new Intent(Intent.ACTION_SEND).setType(mime)
                        .putExtra(Intent.EXTRA_STREAM, u)
                        .putExtra(Intent.EXTRA_SUBJECT, safe)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                ui.post(() -> startActivity(Intent.createChooser(send, "Del " + safe)));
            } catch (Exception e) {
                ui.post(() -> Toast.makeText(MainActivity.this, "Kunne ikke dele filen", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface public void pickFile() {
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                try { startActivityForResult(i, 9); } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface public void haptic() {
            ui.post(() -> web.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK));
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
    }

    private void maybeAskNotifications(String json) {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences p = Store.prefs(this);
        if (p.getBoolean("askedNotif", false)) return;
        try {
            JSONArray up = new JSONObject(json).optJSONArray("upcoming");
            boolean any = false;
            for (int i = 0; up != null && i < up.length(); i++) if (up.optJSONObject(i).optBoolean("remind")) any = true;
            if (!any) return;
        } catch (Exception e) { return; }
        p.edit().putBoolean("askedNotif", true).apply();
        ui.post(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1));
    }
}
