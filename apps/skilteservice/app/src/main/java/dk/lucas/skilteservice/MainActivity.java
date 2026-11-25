package dk.lucas.skilteservice;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Skilteproduktion Service som Android-app.
 * Appen er et vindue til artifactet på claude.ai, så kunder, ture, noter, Claude og Eventa
 * virker præcis som i browseren og altid er den nyeste version. Intet data gemmes i appen
 * ud over claude.ai's login-cookie.
 */
public class MainActivity extends Activity {
    static final String START = "https://claude.ai/artifact/WrrS1Mfp8sNJF1CrpSgpWv";
    static final String[] OURS = {"claude.ai", "claude.com", "anthropic.com", "claudeusercontent.com",
            "claude.site", "claudemcpcontent.com", "cloudflare.com", "intercom.io", "intercomcdn.com"};
    static final String[] LOGIN_3P = {"accounts.google.com", "accounts.youtube.com", "appleid.apple.com"};

    private final Handler ui = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private FrameLayout root;
    private WebView web;
    private ProgressBar bar;
    private LinearLayout errorBox;
    private ValueCallback<Uri[]> fileCb;
    private WebView printView;
    private boolean failed;
    private ConnectivityManager.NetworkCallback netCb;
    private volatile String sharedJson;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("app", MODE_PRIVATE);
        String act = action(getIntent());
        if ("app".equals(act)) {
            prefs.edit().putBoolean("chrome", false).apply();
            toast("Appen åbner nu her igen.");
        }
        boolean sharing = handleShare(getIntent());
        if (!sharing && ("chrome".equals(act) || prefs.getBoolean("chrome", false))) {
            openInChrome(START);
            finish();
            return;
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(color(R.color.bg));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setIndeterminate(false);
        bar.setProgressTintList(ColorStateList.valueOf(color(R.color.accent)));
        bar.setProgressBackgroundTintList(ColorStateList.valueOf(0x00000000));
        errorBox = buildError();
        errorBox.setVisibility(View.GONE);
        setContentView(root);
        createWeb();
        if (state == null || web.restoreState(state) == null) web.loadUrl(START);
        watchNetwork();
    }

    private static String action(Intent i) {
        return i == null ? null : i.getStringExtra("do");
    }

    /** Tekst delt fra en anden app (mail, sms, notater): appen henter den og lægger den i en ny note. */
    private boolean handleShare(Intent i) {
        if (i == null || !Intent.ACTION_SEND.equals(i.getAction())) return false;
        String t = i.getStringExtra(Intent.EXTRA_TEXT), sub = i.getStringExtra(Intent.EXTRA_SUBJECT);
        if ((t == null || t.trim().isEmpty()) && (sub == null || sub.trim().isEmpty())) return false;
        try {
            JSONObject o = new JSONObject();
            o.put("text", t == null ? "" : t);
            o.put("subject", sub == null ? "" : sub);
            sharedJson = o.toString();
            toast("Teksten lægges i en ny note …");
        } catch (Exception ignored) {}
        return true;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShare(intent);
        String act = action(intent);
        if ("reload".equals(act) && web != null) web.loadUrl(START);
        else if ("chrome".equals(act)) openInChrome(START);
        else if ("app".equals(act)) prefs.edit().putBoolean("chrome", false).apply();
    }

    // ---------------- WebView ----------------

    private void createWeb() {
        web = new WebView(this);
        web.setBackgroundColor(color(R.color.bg));
        root.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (bar.getParent() == null) root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP));
        if (errorBox.getParent() == null) root.addView(errorBox, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " SkilteServiceApp/" + versionName());

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "SPApp");
        web.setDownloadListener((url, ua, cd, mime, len) -> {
            if (url != null && url.startsWith("http")) openExternal(Uri.parse(url));
            else toast("Filen kan ikke hentes i appen. Brug Kopiér eller Del i stedet.");
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return route(r.getUrl());
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap fav) {
                failed = false;
                bar.setProgress(5);
                bar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                bar.setVisibility(View.GONE);
                if (!failed) errorBox.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
                if (url != null && url.contains("claude.ai/login") && !prefs.getBoolean("helpShown", false)) {
                    prefs.edit().putBoolean("helpShown", true).apply();
                    loginHelp(false);
                }
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) {
                    failed = true;
                    errorBox.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                // WebView'ens proces er lukket (fx pga. lav hukommelse): byg en ny og åbn appen igen.
                root.removeView(v);
                v.destroy();
                if (v == web) {
                    web = null;
                    createWeb();
                    web.loadUrl(START);
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) {
                bar.setProgress(Math.max(5, p));
                if (p >= 100) bar.setVisibility(View.GONE);
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    startActivityForResult(p.createIntent(), 41);
                } catch (Exception e) {
                    fileCb = null;
                    toast("Ingen app kan vælge filer");
                    return false;
                }
                return true;
            }

            /** Links med target="_blank" og window.open: åbnes udenfor appen (kort, Eventa, hjemmesider). */
            @Override
            public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, Message msg) {
                final WebView tmp = new WebView(MainActivity.this);
                tmp.setWebViewClient(new WebViewClient() {
                    boolean done;

                    void take(Uri u) {
                        if (done || u == null) return;
                        String sc = u.getScheme() == null ? "" : u.getScheme();
                        if (sc.equals("about") || sc.equals("javascript") || sc.equals("blob") || sc.equals("data")) return;
                        done = true;
                        if (isLogin3p(host(u))) loginHelp(true);
                        else openExternal(u);
                        ui.post(tmp::destroy);
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) {
                        take(r.getUrl());
                        return true;
                    }

                    @Override
                    public void onPageStarted(WebView w, String url, Bitmap fav) {
                        if (url != null) take(Uri.parse(url));
                    }
                });
                ((WebView.WebViewTransport) msg.obj).setWebView(tmp);
                msg.sendToTarget();
                return true;
            }
        });
    }

    /** true = vi har selv taget os af linket; false = WebView'en åbner det. */
    boolean route(Uri u) {
        String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        String h = host(u);
        if (sc.equals("http") || sc.equals("https")) {
            if (isLogin3p(h)) { loginHelp(true); return true; }
            if (isOurs(h)) return false;
            openExternal(u);
            return true;
        }
        if (sc.equals("about") || sc.equals("data") || sc.equals("blob") || sc.equals("javascript")) return false;
        if (sc.equals("intent")) {
            try {
                Intent i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                startActivity(i);
            } catch (Exception e) {
                toast("Ingen app kan åbne linket");
            }
            return true;
        }
        openExternal(u); // tel:, sms:, mailto:, geo: …
        return true;
    }

    static String host(Uri u) {
        return u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
    }

    static boolean isOurs(String h) {
        for (String d : OURS) if (h.equals(d) || h.endsWith("." + d)) return true;
        return false;
    }

    static boolean isLogin3p(String h) {
        for (String d : LOGIN_3P) if (h.equals(d)) return true;
        return false;
    }

    void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast("Ingen app kan åbne linket");
        }
    }

    /** Åbner i Chrome som "Custom Tab", så Chrome's login til claude.ai bruges. */
    void openInChrome(String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        Bundle ex = new Bundle();
        ex.putBinder("android.support.customtabs.extra.SESSION", null);
        i.putExtras(ex);
        i.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", color(R.color.bg));
        i.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
        i.putExtra("android.support.customtabs.extra.ENABLE_URLBAR_HIDING", true);
        i.setPackage("com.android.chrome");
        try {
            startActivity(i);
        } catch (Exception e) {
            i.setPackage(null);
            try { startActivity(i); } catch (Exception e2) { toast("Ingen browser fundet"); }
        }
    }

    // ---------------- Login-hjælp ----------------

    void loginHelp(boolean fromGoogle) {
        String msg = (fromGoogle ? "Google tillader ikke login inde i apps.\n\n" : "")
                + "Sådan logger du ind her i appen:\n"
                + "1. Tryk på “Fortsæt med e-mail” og skriv din mail.\n"
                + "2. Åbn mailen fra Anthropic og tryk på linket.\n"
                + "3. Så får du en kode på 6 cifre. Skriv den her i appen.\n\n"
                + "Du skal kun gøre det én gang. Eller brug Chrome, hvor du måske allerede er logget ind.";
        new AlertDialog.Builder(this)
                .setTitle("Log ind på Claude")
                .setMessage(msg)
                .setPositiveButton("OK, brug e-mail", null)
                .setNegativeButton("Åbn i Chrome", (d, w) -> openInChrome(START))
                .setNeutralButton("Altid Chrome", (d, w) -> {
                    prefs.edit().putBoolean("chrome", true).apply();
                    toast("Tryk længe på app-ikonet og vælg “Åbn i appen” for at skifte tilbage.");
                    openInChrome(START);
                    finish();
                })
                .show();
    }

    // ---------------- Fejlskærm ----------------

    private LinearLayout buildError() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(32), dp(32), dp(32), dp(32));
        box.setBackgroundColor(color(R.color.bg));
        box.setClickable(true);

        TextView dot = new TextView(this);
        dot.setText("● ● ●\n● ● ○\n● ○ ●");
        dot.setTextColor(color(R.color.ink));
        dot.setTextSize(18);
        dot.setGravity(Gravity.CENTER);
        dot.setLineSpacing(0, 0.9f);
        box.addView(dot);

        TextView t = new TextView(this);
        t.setText("Ingen forbindelse");
        t.setTextColor(color(R.color.ink));
        t.setTextSize(24);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(20), 0, dp(8));
        box.addView(t);

        TextView s = new TextView(this);
        s.setText("Appen henter kunder, ture og Claude fra nettet. Tjek wifi eller mobildata. Den prøver selv igen, når der er net.");
        s.setTextColor(color(R.color.muted));
        s.setTextSize(15);
        s.setGravity(Gravity.CENTER);
        s.setPadding(0, 0, 0, dp(24));
        box.addView(s);

        box.addView(button("Prøv igen", true, v -> retry()));
        box.addView(button("Åbn i Chrome", false, v -> openInChrome(START)));
        return box;
    }

    private Button button(String text, boolean primary, View.OnClickListener on) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setTextColor(primary ? 0xFF0B0B0B : color(R.color.ink));
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(999));
        if (primary) g.setColor(color(R.color.accent));
        else { g.setColor(0x00000000); g.setStroke(dp(1), color(R.color.ink)); }
        b.setBackground(g);
        b.setOnClickListener(on);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(240), dp(50));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private void retry() {
        if (web == null) return;
        String u = web.getUrl();
        web.loadUrl(u == null || !u.startsWith("https://") ? START : u);
    }

    private void watchNetwork() {
        try {
            ConnectivityManager cm = getSystemService(ConnectivityManager.class);
            netCb = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network n) {
                    ui.postDelayed(() -> { if (errorBox.getVisibility() == View.VISIBLE) retry(); }, 800);
                }
            };
            cm.registerDefaultNetworkCallback(netCb);
        } catch (Exception ignored) {}
    }

    // ---------------- Bro til appen: SPApp ----------------

    class Bridge {
        @JavascriptInterface public String version() { return versionName(); }

        @JavascriptInterface public void copy(String text) {
            ui.post(() -> {
                ClipboardManager cm = getSystemService(ClipboardManager.class);
                cm.setPrimaryClip(ClipData.newPlainText("tekst", text == null ? "" : text));
            });
        }

        @JavascriptInterface public void share(String title, String text) {
            ui.post(() -> {
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, title == null ? "" : title)
                        .putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
                try { startActivity(Intent.createChooser(send, title == null || title.isEmpty() ? "Del" : title)); } catch (Exception ignored) {}
            });
        }

        /** Udskriv eller gem som PDF: html er en færdig side uden scripts. */
        @JavascriptInterface public void print(String title, String html) {
            ui.post(() -> printHtml(title, html));
        }

        @JavascriptInterface public void openChrome() { ui.post(() -> openInChrome(START)); }

        /** Delt tekst som JSON {text, subject} – kun én gang; ellers null. */
        @JavascriptInterface public synchronized String takeShared() {
            String s = sharedJson;
            sharedJson = null;
            return s;
        }

        @JavascriptInterface public void toast(String text) { ui.post(() -> MainActivity.this.toast(text)); }
    }

    private void printHtml(String title, String html) {
        final String name = title == null || title.trim().isEmpty() ? "Skilteproduktion Service" : title.trim();
        WebView pv = new WebView(this);
        pv.getSettings().setJavaScriptEnabled(false);
        pv.setWebViewClient(new WebViewClient() {
            boolean done;

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (done) return;
                done = true;
                try {
                    PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    pm.print(name, v.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
                } catch (Exception e) {
                    toast("Kunne ikke åbne udskrift");
                }
            }
        });
        printView = pv; // holdes i live, til udskriften er sendt
        pv.loadDataWithBaseURL("https://print.invalid/", html == null ? "" : html, "text/html", "utf-8", null);
    }

    // ---------------- Livscyklus ----------------

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == 41 && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && errorBox.getVisibility() != View.VISIBLE && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        try {
            if (netCb != null) getSystemService(ConnectivityManager.class).unregisterNetworkCallback(netCb);
        } catch (Exception ignored) {}
        if (web != null) { web.destroy(); web = null; }
        if (printView != null) { printView.destroy(); printView = null; }
        super.onDestroy();
    }

    // ---------------- Små hjælpere ----------------

    String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    int color(int id) { return getResources().getColor(id, getTheme()); }

    int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    void toast(String t) { Toast.makeText(this, t, Toast.LENGTH_LONG).show(); }
}
