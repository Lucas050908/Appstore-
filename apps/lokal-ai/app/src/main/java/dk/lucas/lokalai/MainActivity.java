package dk.lucas.lokalai;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.provider.OpenableColumns;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int REQ_IMPORT = 41;

    // Motor-tilstand overlever at aktiviteten genskabes
    private static final ExecutorService ENGINE = Executors.newSingleThreadExecutor();
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static boolean nativeReady = false;
    private static volatile String loadedFile = null;
    private static volatile String loadedInfo = "";
    private static volatile boolean busy = false;
    private static volatile boolean importCancel = false;

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final StringBuilder pending = new StringBuilder();
    private boolean flushScheduled = false;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("lokalai", MODE_PRIVATE);
        getWindow().setStatusBarColor(Color.parseColor("#12110f"));
        getWindow().setNavigationBarColor(Color.parseColor("#12110f"));

        if (!nativeReady) {
            try {
                System.loadLibrary("lokalai");
                Llama.nativeInit(getApplicationInfo().nativeLibraryDir);
                nativeReady = true;
            } catch (Throwable t) {
                Toast.makeText(this, "AI-motoren kunne ikke starte: " + t.getMessage(), Toast.LENGTH_LONG).show();
            }
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#12110f"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack?onBack():false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onResume2&&onResume2()", null);
    }

    // ---------- hjælpere ----------

    private void js(String code) {
        ui.post(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    private static String q(String s) { return s == null ? "null" : JSONObject.quote(s); }

    private File modelDir() {
        File d = getExternalFilesDir("models");
        if (d == null) d = new File(getFilesDir(), "models");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String safeName(String n) {
        n = n == null ? "" : n.replaceAll("[^A-Za-z0-9._-]", "_");
        if (n.isEmpty()) n = "model";
        if (!n.toLowerCase().endsWith(".gguf")) n += ".gguf";
        return n;
    }

    private void addTokens(String t) {
        synchronized (pending) {
            pending.append(t);
            if (flushScheduled) return;
            flushScheduled = true;
        }
        ui.postDelayed(this::flush, 40);
    }

    private void flush() {
        String t;
        synchronized (pending) {
            t = pending.toString();
            pending.setLength(0);
            flushScheduled = false;
        }
        if (!t.isEmpty() && web != null) web.evaluateJavascript("onTok(" + q(t) + ")", null);
    }

    private void keepAwake(boolean on) {
        ui.post(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    // ---------- import fra fil ----------

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_IMPORT) return;
        if (res != RESULT_OK || data == null || data.getData() == null) { js("onImport({state:'cancel'})"); return; }
        Uri uri = data.getData();
        String name = "model.gguf";
        long size = -1;
        try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int si = c.getColumnIndex(OpenableColumns.SIZE);
                if (ni >= 0) name = c.getString(ni);
                if (si >= 0 && !c.isNull(si)) size = c.getLong(si);
            }
        } catch (Exception ignored) {}
        final String fname = safeName(name);
        final long total = size;
        importCancel = false;
        IO.execute(() -> {
            File out = new File(modelDir(), fname + ".part");
            try (InputStream in = getContentResolver().openInputStream(uri);
                 OutputStream os = new FileOutputStream(out)) {
                byte[] head = new byte[4];
                int hn = in.read(head);
                if (hn != 4 || head[0] != 'G' || head[1] != 'G' || head[2] != 'U' || head[3] != 'F')
                    throw new Exception("Filen er ikke en GGUF-model");
                os.write(head, 0, 4);
                byte[] buf = new byte[1 << 20];
                long done = 4, last = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (importCancel) throw new Exception("Annulleret");
                    os.write(buf, 0, n);
                    done += n;
                    long now = System.currentTimeMillis();
                    if (now - last > 300) {
                        last = now;
                        js("onImport({state:'progress',file:" + q(fname) + ",done:" + done + ",total:" + total + "})");
                    }
                }
            } catch (Exception e) {
                out.delete();
                js("onImport({state:'error',error:" + q(e.getMessage()) + "})");
                return;
            }
            File dst = new File(modelDir(), fname);
            dst.delete();
            if (!out.renameTo(dst)) { out.delete(); js("onImport({state:'error',error:'Kunne ikke gemme filen'})"); return; }
            js("onImport({state:'done',file:" + q(fname) + "})");
        });
    }

    // ---------- bro til JavaScript ----------

    class Bridge {
        @JavascriptInterface
        public String info() {
            try {
                JSONObject o = new JSONObject();
                ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                o.put("ramTotal", mi.totalMem);
                o.put("ramAvail", mi.availMem);
                StatFs st = new StatFs(modelDir().getAbsolutePath());
                o.put("free", st.getAvailableBytes());
                o.put("cores", Runtime.getRuntime().availableProcessors());
                o.put("ready", nativeReady);
                o.put("loaded", loadedFile == null ? JSONObject.NULL : loadedFile);
                o.put("loadedInfo", loadedInfo);
                o.put("busy", busy);
                return o.toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface
        public String models() {
            JSONArray a = new JSONArray();
            File[] fs = modelDir().listFiles();
            if (fs != null) for (File f : fs) {
                if (!f.isFile() || !f.getName().toLowerCase().endsWith(".gguf")) continue;
                try { a.put(new JSONObject().put("file", f.getName()).put("size", f.length())); } catch (Exception ignored) {}
            }
            return a.toString();
        }

        @JavascriptInterface
        public String download(String url, String file) {
            try {
                String fname = safeName(file);
                if (new File(modelDir(), fname).exists()) return "Modellen findes allerede";
                File part = new File(modelDir(), fname + ".download");
                part.delete();
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setTitle("Lokal AI: " + fname);
                r.setDescription("Henter AI-model");
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                r.setDestinationUri(Uri.fromFile(part));
                r.setAllowedOverMetered(true);
                r.setAllowedOverRoaming(false);
                long id = dm.enqueue(r);
                JSONObject map = new JSONObject(prefs.getString("dl", "{}"));
                map.put(String.valueOf(id), fname);
                prefs.edit().putString("dl", map.toString()).apply();
                return null;
            } catch (Exception e) { return "Kunne ikke starte download: " + e.getMessage(); }
        }

        @JavascriptInterface
        public String downloads() {
            JSONArray out = new JSONArray();
            try {
                JSONObject map = new JSONObject(prefs.getString("dl", "{}"));
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                JSONObject keep = new JSONObject();
                JSONArray names = map.names();
                if (names != null) for (int i = 0; i < names.length(); i++) {
                    String key = names.getString(i);
                    String fname = map.getString(key);
                    long id = Long.parseLong(key);
                    JSONObject o = new JSONObject().put("id", key).put("file", fname);
                    try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
                        if (c == null || !c.moveToFirst()) { o.put("state", "gone"); out.put(o); continue; }
                        int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        long done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        o.put("done", done).put("total", total).put("reason", reason);
                        File part = new File(modelDir(), fname + ".download");
                        if (st == DownloadManager.STATUS_SUCCESSFUL) {
                            File dst = new File(modelDir(), fname);
                            if (part.exists() && !looksLikeGguf(part)) {
                                part.delete();
                                o.put("state", "failed").put("error", "Filen er ikke en GGUF-model (forkert link eller kræver login)");
                            } else if (part.exists() && part.renameTo(dst)) {
                                o.put("state", "done");
                            } else if (dst.exists()) {
                                o.put("state", "done");
                            } else {
                                o.put("state", "failed").put("error", "Filen forsvandt");
                            }
                            dm.remove(id); // fjerner kun posten – filen er allerede flyttet
                        } else if (st == DownloadManager.STATUS_FAILED) {
                            o.put("state", "failed").put("error", reason == 404 ? "Filen findes ikke (404)" :
                                    reason == 401 || reason == 403 ? "Adgang nægtet – modellen kræver login" :
                                    reason == DownloadManager.ERROR_INSUFFICIENT_SPACE ? "Ikke nok plads" :
                                    "Download fejlede (" + reason + ")");
                            dm.remove(id);
                            part.delete();
                        } else {
                            o.put("state", st == DownloadManager.STATUS_PAUSED ? "paused" :
                                    st == DownloadManager.STATUS_PENDING ? "pending" : "running");
                            keep.put(key, fname);
                        }
                    }
                    out.put(o);
                }
                prefs.edit().putString("dl", keep.toString()).apply();
            } catch (Exception ignored) {}
            return out.toString();
        }

        private boolean looksLikeGguf(File f) {
            try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
                byte[] h = new byte[4];
                return in.read(h) == 4 && h[0] == 'G' && h[1] == 'G' && h[2] == 'U' && h[3] == 'F';
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void cancelDownload(String id) {
            try {
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                dm.remove(Long.parseLong(id));
                JSONObject map = new JSONObject(prefs.getString("dl", "{}"));
                String fname = map.optString(id, null);
                map.remove(id);
                prefs.edit().putString("dl", map.toString()).apply();
                if (fname != null) new File(modelDir(), fname + ".download").delete();
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void importModel() {
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(i, REQ_IMPORT); }
                catch (Exception e) { js("onImport({state:'error',error:'Ingen filvælger fundet'})"); }
            });
        }

        @JavascriptInterface
        public void cancelImport() { importCancel = true; }

        @JavascriptInterface
        public String deleteModel(String file) {
            if (busy) return "Vent til AI'en er færdig";
            String f = safeName(file);
            if (f.equals(loadedFile)) {
                ENGINE.execute(() -> { Llama.nativeUnload(); });
                loadedFile = null; loadedInfo = "";
            }
            ENGINE.execute(() -> new File(modelDir(), f).delete());
            return null;
        }

        @JavascriptInterface
        public void load(String file, int nCtx, int threads) {
            if (!nativeReady) { js("onLoad('AI-motoren er ikke startet',null)"); return; }
            final String f = safeName(file);
            busy = true;
            ENGINE.execute(() -> {
                File mf = new File(modelDir(), f);
                String err;
                if (!mf.exists()) err = "Modelfilen findes ikke";
                else {
                    try { err = Llama.nativeLoad(mf.getAbsolutePath(), nCtx, threads); }
                    catch (Throwable t) { err = "Fejl: " + t.getMessage(); }
                }
                if (err == null) {
                    loadedFile = f;
                    loadedInfo = Llama.nativeInfo();
                    prefs.edit().putString("last", f).apply();
                } else { loadedFile = null; loadedInfo = ""; }
                busy = false;
                js("onLoad(" + q(err) + "," + q(loadedFile) + ")");
            });
        }

        @JavascriptInterface
        public void unload() {
            ENGINE.execute(() -> { Llama.nativeUnload(); loadedFile = null; loadedInfo = ""; js("onLoad(null,null)"); });
        }

        @JavascriptInterface
        public void chat(String messagesJson, float temp, int maxTokens) {
            if (busy) { js("onDone('AI\\'en arbejder allerede')"); return; }
            busy = true;
            keepAwake(true);
            ENGINE.execute(() -> {
                String err;
                try {
                    JSONArray a = new JSONArray(messagesJson);
                    String[] roles = new String[a.length()], texts = new String[a.length()];
                    for (int i = 0; i < a.length(); i++) {
                        JSONObject m = a.getJSONObject(i);
                        roles[i] = m.getString("role");
                        texts[i] = m.getString("content");
                    }
                    long t0 = System.nanoTime();
                    final int[] count = {0};
                    err = Llama.nativeChat(roles, texts, temp, maxTokens, utf8 -> {
                        count[0]++;
                        addTokens(new String(utf8, StandardCharsets.UTF_8));
                    });
                    double secs = (System.nanoTime() - t0) / 1e9;
                    if (err == null) js("onStats(" + count[0] + "," + secs + ")");
                } catch (Throwable t) {
                    err = "Fejl: " + t.getMessage();
                }
                busy = false;
                keepAwake(false);
                final String e = err;
                ui.postDelayed(() -> { flush(); if (web != null) web.evaluateJavascript("onDone(" + q(e) + ")", null); }, 60);
            });
        }

        @JavascriptInterface
        public void stop() { Llama.nativeStop(); }

        @JavascriptInterface
        public String lastModel() { return prefs.getString("last", ""); }

        @JavascriptInterface
        public void copy(String text) {
            ui.post(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("Lokal AI", text));
                Toast.makeText(MainActivity.this, "Kopieret", Toast.LENGTH_SHORT).show();
            });
        }

        @JavascriptInterface
        public void share(String text) {
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Del"));
            });
        }
    }
}
