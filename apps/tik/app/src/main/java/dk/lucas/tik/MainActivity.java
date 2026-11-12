package dk.lucas.tik;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.InputStream;
import java.lang.ref.WeakReference;

public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    private static WeakReference<MainActivity> ref = new WeakReference<>(null);

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private String pickFor;

    /** Send ny tilstand til web-UI'et, hvis appen er åben. */
    static void pushState() {
        MainActivity a = ref.get();
        if (a == null || a.web == null) return;
        String s = a.state();
        a.ui.post(() -> a.web.evaluateJavascript("window.onState&&onState(" + JSONObject.quote(s) + ")", null));
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        ref = new WeakReference<>(this);
        Scheduler.channels(this);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#12110F"));
        w.setNavigationBarColor(Color.parseColor("#12110F"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#12110F"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Tik");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath() == null || u.getPath().equals("/") ? "index.html" : u.getPath().substring(1);
                try {
                    InputStream in = getAssets().open(path);
                    return new WebResourceResponse(mime(path), "utf-8", in);
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

        Scheduler.scheduleAll(this);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
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
        ref = new WeakReference<>(this);
        if (web != null) web.evaluateJavascript("window.onNativeResume&&onNativeResume()", null);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        pushState();
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
        if (req != 7 || res != RESULT_OK || data == null || pickFor == null) return;
        Uri u = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
        String uri = "", title = "Standard alarmlyd";
        if (u == null) {
            title = "Ingen lyd (kun vibration)";
            uri = "silent";
        } else if (!RingtoneManager.isDefault(u)) {
            uri = u.toString();
            try {
                Ringtone r = RingtoneManager.getRingtone(this, u);
                if (r != null) title = r.getTitle(this);
            } catch (Exception ignored) {}
        }
        String js = "window.onSoundPicked&&onSoundPicked(" + JSONObject.quote(pickFor) + "," + JSONObject.quote(uri) + "," + JSONObject.quote(title) + ")";
        web.evaluateJavascript(js, null);
    }

    String state() {
        try {
            JSONObject o = new JSONObject();
            o.put("alarms", Store.arr(this, "alarms"));
            o.put("timers", Store.arr(this, "timers"));
            o.put("cities", Store.cities(this));
            o.put("settings", Store.settings(this));
            o.put("snooze", Store.snooze(this) == null ? JSONObject.NULL : Store.snooze(this));
            JSONObject p = new JSONObject();
            NotificationManager nm = getSystemService(NotificationManager.class);
            p.put("notifications", nm.areNotificationsEnabled());
            p.put("exact", Scheduler.canExact(this));
            p.put("fullscreen", Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent());
            o.put("perms", p);
            return o.toString();
        } catch (JSONException e) {
            return "{\"alarms\":[],\"timers\":[],\"cities\":[],\"settings\":{},\"perms\":{}}";
        }
    }

    class Bridge {
        @JavascriptInterface public String getState() { return state(); }

        @JavascriptInterface public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }

        @JavascriptInterface public String saveAlarm(String json) {
            try {
                JSONObject a = new JSONObject(json);
                Store.upsert(MainActivity.this, "alarms", a);
                // en ændret alarm annullerer en udsættelse af samme alarm
                JSONObject sn = Store.snooze(MainActivity.this);
                if (sn != null && a.optString("id").equals(sn.optString("alarmId")) && !a.optBoolean("enabled")) Store.setSnooze(MainActivity.this, null);
            } catch (JSONException ignored) {}
            Scheduler.scheduleAll(MainActivity.this);
            return state();
        }

        @JavascriptInterface public String deleteAlarm(String id) {
            Scheduler.cancel(MainActivity.this, "alarm", id);
            Store.putArr(MainActivity.this, "alarms", Store.without(Store.arr(MainActivity.this, "alarms"), id));
            Scheduler.scheduleAll(MainActivity.this);
            return state();
        }

        @JavascriptInterface public String timerAction(String id, String action, String json) {
            if ("delete".equals(action) && AlarmService.current != null && id.equals(AlarmService.current.getStringExtra("id"))) {
                AlarmService.stop(MainActivity.this, false);
                return state();
            }
            Store.timerAction(MainActivity.this, id, action, json);
            if (!"start".equals(action)) Scheduler.cancel(MainActivity.this, "timer", id);
            Scheduler.scheduleAll(MainActivity.this);
            return state();
        }

        @JavascriptInterface public String setCities(String json) {
            try { Store.putArr(MainActivity.this, "cities", new JSONArray(json)); } catch (JSONException ignored) {}
            Widgets.updateAll(MainActivity.this);
            return state();
        }

        @JavascriptInterface public String setSettings(String json) {
            Store.prefs(MainActivity.this).edit().putString("settings", json).apply();
            Widgets.updateAll(MainActivity.this);
            return state();
        }

        @JavascriptInterface public String cancelSnooze() {
            Store.setSnooze(MainActivity.this, null);
            Scheduler.scheduleAll(MainActivity.this);
            return state();
        }

        @JavascriptInterface public void pickSound(String id, String current) {
            pickFor = id;
            ui.post(() -> {
                Intent i = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
                        .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM | RingtoneManager.TYPE_RINGTONE)
                        .putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Vælg alarmlyd")
                        .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
                        .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, true)
                        .putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));
                Uri existing = current == null || current.isEmpty() ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                        : "silent".equals(current) ? null : Uri.parse(current);
                i.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, existing);
                try { startActivityForResult(i, 7); } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface public void previewSound(String uri) {}
        @JavascriptInterface public void stopPreview() {}

        @JavascriptInterface public void openSettings(String which) {
            ui.post(() -> {
                Intent i;
                String pkg = getPackageName();
                if ("notifications".equals(which)) {
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                            && shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
                        return;
                    }
                    i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                } else if ("exact".equals(which) && Build.VERSION.SDK_INT >= 31) {
                    i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg));
                } else if ("fullscreen".equals(which) && Build.VERSION.SDK_INT >= 34) {
                    i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg));
                } else {
                    i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                }
                try { startActivity(i); } catch (Exception e) {
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
                }
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
                if (Build.VERSION.SDK_INT >= 26) {
                    int f = dark ? 0 : (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                    getWindow().getDecorView().setSystemUiVisibility(f);
                }
            });
        }
    }

    @SuppressWarnings("unused")
    private AlarmManager am() { return getSystemService(AlarmManager.class); }
}
