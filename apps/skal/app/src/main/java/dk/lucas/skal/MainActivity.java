package dk.lucas.skal;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.system.Os;
import android.text.InputType;
import android.util.TypedValue;
import android.view.ContextMenu;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MenuItem;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;

import com.termux.terminal.KeyHandler;
import com.termux.terminal.TerminalSession;
import com.termux.view.TerminalView;
import com.termux.view.TerminalViewClient;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity implements TermService.Target, TerminalViewClient, ExtraKeysView.Listener {

    static final String ACTION_NEW_SESSION = "dk.lucas.skal.NEW_SESSION";
    private static final int REQ_STORAGE = 7;

    private TermService service;
    private TerminalView terminalView;
    private ExtraKeysView extraKeys;
    private LinearLayout root, tabBar, tabs;
    private HorizontalScrollView tabScroll;
    private TextView plusBtn, menuBtn;
    private TerminalSession current;
    private boolean volDown, volUp;
    private int fontPx, minFont, maxFont;
    private boolean pendingNewSession;

    // ---------------------------------------------------------------- livscyklus

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        float d = getResources().getDisplayMetrics().density;
        minFont = Math.round(5 * d);
        maxFont = Math.round(32 * d);
        fontPx = Prefs.fontSize(this);
        if (fontPx == 0) fontPx = Math.round(11 * d);

        Themes.apply(Prefs.theme(this));
        buildUi();
        applyLook();

        pendingNewSession = getIntent() != null && ACTION_NEW_SESSION.equals(getIntent().getAction());

        Intent svc = new Intent(this, TermService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc); else startService(svc);
        bindService(svc, conn, 0);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (ACTION_NEW_SESSION.equals(intent.getAction())) {
            if (service != null) newSession(); else pendingNewSession = true;
        }
    }

    @Override protected void onResume() {
        super.onResume();
        applyWindowFlags();
        if (current != null) terminalView.onScreenUpdated();
        terminalView.requestFocus();
    }

    @Override protected void onDestroy() {
        if (service != null && service.relay.target == this) service.relay.target = null;
        try { unbindService(conn); } catch (Exception ignored) { }
        super.onDestroy();
    }

    private final ServiceConnection conn = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName n, IBinder b) {
            service = ((TermService.LocalBinder) b).service();
            service.relay.target = MainActivity.this;
            if (service.sessions.isEmpty()) {
                current = service.createSession(null);
                pendingNewSession = false;
            } else {
                int i = Math.min(Prefs.currentSession(MainActivity.this), service.sessions.size() - 1);
                current = service.sessions.get(Math.max(0, i));
                if (pendingNewSession) { pendingNewSession = false; current = service.createSession(cwdOf(current)); }
            }
            attach(current);
        }

        @Override public void onServiceDisconnected(ComponentName n) { service = null; }
    };

    // ---------------------------------------------------------------- UI

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void buildUi() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        tabBar = new LinearLayout(this);
        tabBar.setOrientation(LinearLayout.HORIZONTAL);
        tabBar.setGravity(Gravity.CENTER_VERTICAL);
        tabBar.setPadding(dp(6), 0, 0, 0);

        tabScroll = new HorizontalScrollView(this);
        tabScroll.setHorizontalScrollBarEnabled(false);
        tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setGravity(Gravity.CENTER_VERTICAL);
        tabScroll.addView(tabs);
        tabBar.addView(tabScroll, new LinearLayout.LayoutParams(0, dp(44), 1f));

        plusBtn = barButton("+", 22);
        plusBtn.setOnClickListener(v -> newSession());
        tabBar.addView(plusBtn, new LinearLayout.LayoutParams(dp(44), dp(44)));
        menuBtn = barButton("⋮", 20);
        menuBtn.setOnClickListener(this::showMenu);
        tabBar.addView(menuBtn, new LinearLayout.LayoutParams(dp(44), dp(44)));
        root.addView(tabBar, new LinearLayout.LayoutParams(-1, dp(44)));

        terminalView = new TerminalView(this, null);
        terminalView.setTerminalViewClient(this);
        terminalView.setFocusable(true);
        terminalView.setFocusableInTouchMode(true);
        terminalView.setKeepScreenOn(false);
        registerForContextMenu(terminalView);
        root.addView(terminalView, new LinearLayout.LayoutParams(-1, 0, 1f));

        extraKeys = new ExtraKeysView(this);
        extraKeys.setListener(this);
        root.addView(extraKeys, new LinearLayout.LayoutParams(-1, -2));

        setContentView(root);

        terminalView.setTextSize(fontPx);
        applyTypeface();
    }

    private TextView barButton(String s, int sp) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setGravity(Gravity.CENTER);
        TypedValue tv = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true);
        t.setBackgroundResource(tv.resourceId);
        return t;
    }

    private int barColor() {
        int bg = Themes.background(Prefs.theme(this));
        boolean light = Themes.isLight(Prefs.theme(this));
        return blend(bg, light ? Color.BLACK : Color.WHITE, light ? 0.05f : 0.06f);
    }

    private static int blend(int a, int b, float t) {
        return Color.rgb(
            Math.round(Color.red(a) * (1 - t) + Color.red(b) * t),
            Math.round(Color.green(a) * (1 - t) + Color.green(b) * t),
            Math.round(Color.blue(a) * (1 - t) + Color.blue(b) * t));
    }

    private void applyLook() {
        int t = Prefs.theme(this);
        int bg = Themes.background(t), fg = Themes.foreground(t), bar = barColor();
        root.setBackgroundColor(bg);
        getWindow().getDecorView().setBackgroundColor(bg);
        tabBar.setBackgroundColor(bar);
        plusBtn.setTextColor(fg);
        menuBtn.setTextColor(fg);
        extraKeys.setColors(bar, fg);
        extraKeys.setVisibility(Prefs.extraKeys(this) ? View.VISIBLE : View.GONE);
        getWindow().setStatusBarColor(bar);
        getWindow().setNavigationBarColor(Prefs.extraKeys(this) ? bar : bg);
        if (Build.VERSION.SDK_INT >= 23) {
            int f = getWindow().getDecorView().getSystemUiVisibility();
            if (Themes.isLight(t)) f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR; else f &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            getWindow().getDecorView().setSystemUiVisibility(f);
        }
        refreshTabs();
    }

    private void applyTypeface() {
        Typeface tf = Typeface.MONOSPACE;
        if (Prefs.jetbrainsFont(this)) {
            try { tf = Typeface.createFromAsset(getAssets(), "fonts/JetBrainsMono-Regular.ttf"); } catch (Exception ignored) { }
        }
        terminalView.setTypeface(tf);
    }

    private void applyWindowFlags() {
        if (Prefs.keepScreenOn(this)) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void refreshTabs() {
        if (tabs == null) return;
        tabs.removeAllViews();
        if (service == null) return;
        int t = Prefs.theme(this);
        int fg = Themes.foreground(t), bg = Themes.background(t);
        List<TerminalSession> list = service.sessions;
        for (int i = 0; i < list.size(); i++) {
            final TerminalSession s = list.get(i);
            TextView tab = new TextView(this);
            String name = (i + 1) + "  " + service.displayName(s);
            if (!s.isRunning()) name += " ✕";
            tab.setText(name);
            tab.setSingleLine(true);
            tab.setMaxWidth(dp(170));
            tab.setEllipsize(android.text.TextUtils.TruncateAt.END);
            tab.setTextSize(13.5f);
            tab.setGravity(Gravity.CENTER_VERTICAL);
            tab.setPadding(dp(12), 0, dp(12), 0);
            boolean sel = s == current;
            tab.setTextColor(sel ? fg : Color.argb(150, Color.red(fg), Color.green(fg), Color.blue(fg)));
            tab.setTypeface(sel ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            if (sel) {
                GradientDrawable g = new GradientDrawable();
                g.setColor(bg);
                g.setCornerRadius(dp(9));
                tab.setBackground(g);
            }
            tab.setOnClickListener(v -> { if (s != current) attach(s); });
            tab.setOnLongClickListener(v -> { sessionDialog(s); return true; });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, dp(34));
            lp.setMargins(0, 0, dp(4), 0);
            tabs.addView(tab, lp);
            if (sel) {
                final View tv = tab;
                tabScroll.post(() -> tabScroll.requestChildRectangleOnScreen(tabs,
                    new android.graphics.Rect(tv.getLeft(), 0, tv.getRight(), tv.getHeight()), false));
            }
        }
    }

    // ---------------------------------------------------------------- sessioner

    private void attach(TerminalSession s) {
        current = s;
        terminalView.attachSession(s);
        terminalView.onScreenUpdated();
        if (service != null) Prefs.setCurrentSession(this, service.sessions.indexOf(s));
        refreshTabs();
        terminalView.requestFocus();
    }

    private void newSession() {
        if (service == null) return;
        attach(service.createSession(cwdOf(current)));
        showKeyboard();
    }

    /** Arbejdsmappe for en kørende session (via /proc), så nye faner starter samme sted. */
    private String cwdOf(TerminalSession s) {
        if (s == null || !s.isRunning()) return null;
        try { return new File("/proc/" + s.getPid() + "/cwd").getCanonicalPath(); } catch (Exception e) { return null; }
    }

    private void closeSession(TerminalSession s) {
        if (service == null) return;
        int idx = service.sessions.indexOf(s);
        service.removeSession(s);
        if (service.sessions.isEmpty()) {
            stopService(new Intent(this, TermService.class));
            finishAndRemoveTask();
            return;
        }
        if (s == current) attach(service.sessions.get(Math.max(0, Math.min(idx, service.sessions.size() - 1))));
        else refreshTabs();
    }

    private void sessionDialog(final TerminalSession s) {
        new AlertDialog.Builder(this, R.style.SkalDialog)
            .setTitle(service.displayName(s))
            .setItems(new String[]{"Omdøb", "Luk session"}, (d, w) -> {
                if (w == 0) renameDialog(s); else closeSession(s);
            }).show();
    }

    private void renameDialog(final TerminalSession s) {
        final EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_TEXT);
        String cur = service.names.get(s);
        in.setText(cur == null ? "" : cur);
        in.setHint(s.getTitle() == null ? "sh" : s.getTitle());
        LinearLayout box = new LinearLayout(this);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        box.addView(in, new LinearLayout.LayoutParams(-1, -2));
        new AlertDialog.Builder(this, R.style.SkalDialog)
            .setTitle("Navn på session")
            .setView(box)
            .setPositiveButton("OK", (d, w) -> { service.names.put(s, in.getText().toString().trim()); refreshTabs(); })
            .setNegativeButton("Annullér", null)
            .show();
    }

    // ---------------------------------------------------------------- menu

    private void showMenu(View anchor) {
        PopupMenu m = new PopupMenu(this, anchor);
        Menu menu = m.getMenu();
        menu.add(0, 1, 0, "Ny session");
        menu.add(0, 2, 0, "Indsæt");
        menu.add(0, 3, 0, "Kopiér al tekst");
        menu.add(0, 4, 0, "Del output…");
        menu.add(0, 5, 0, "Tema…");
        menu.add(0, 6, 0, "Skriftstørrelse…");
        menu.add(0, 7, 0, "Indstillinger…");
        menu.add(0, 8, 0, "Adgang til lager");
        menu.add(0, 9, 0, "Nulstil terminal");
        menu.add(0, 10, 0, "Om Skal");
        menu.add(0, 11, 0, "Afslut alt");
        m.setOnMenuItemClickListener(this::onMenu);
        m.show();
    }

    @Override public void onCreateContextMenu(ContextMenu menu, View v, ContextMenu.ContextMenuInfo info) {
        menu.add(0, 2, 0, "Indsæt");
        menu.add(0, 3, 0, "Kopiér al tekst");
        menu.add(0, 4, 0, "Del output…");
        menu.add(0, 9, 0, "Nulstil terminal");
        menu.add(0, 1, 0, "Ny session");
    }

    @Override public boolean onContextItemSelected(MenuItem item) { return onMenu(item); }

    private boolean onMenu(MenuItem item) {
        switch (item.getItemId()) {
            case 1: newSession(); return true;
            case 2: onPasteTextFromClipboard(current); return true;
            case 3: copyTranscript(); return true;
            case 4: shareTranscript(); return true;
            case 5: themeDialog(); return true;
            case 6: fontDialog(); return true;
            case 7: settingsDialog(); return true;
            case 8: setupStorage(); return true;
            case 9:
                if (current != null) { current.reset(); terminalView.onScreenUpdated(); toast("Terminal nulstillet"); }
                return true;
            case 10: aboutDialog(); return true;
            case 11:
                new AlertDialog.Builder(this, R.style.SkalDialog)
                    .setMessage("Luk alle sessioner og stop Skal?")
                    .setPositiveButton("Afslut", (d, w) -> {
                        if (service != null) service.killAll();
                        stopService(new Intent(this, TermService.class));
                        finishAndRemoveTask();
                    })
                    .setNegativeButton("Annullér", null).show();
                return true;
        }
        return false;
    }

    private String transcript() {
        if (current == null || current.getEmulator() == null) return "";
        return current.getEmulator().getScreen().getTranscriptTextWithoutJoinedLines().trim();
    }

    private void copyTranscript() {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("Skal", transcript()));
        toast("Kopieret");
    }

    private void shareTranscript() {
        String t = transcript();
        if (t.length() > 100_000) t = t.substring(t.length() - 100_000);
        Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, t);
        startActivity(Intent.createChooser(i, "Del output"));
    }

    private void themeDialog() {
        final int before = Prefs.theme(this);
        new AlertDialog.Builder(this, R.style.SkalDialog)
            .setTitle("Tema")
            .setSingleChoiceItems(Themes.NAMES, before, (d, w) -> applyThemeIndex(w))
            .setPositiveButton("OK", null)
            .setNegativeButton("Annullér", (d, w) -> applyThemeIndex(before))
            .show();
    }

    private void applyThemeIndex(int i) {
        Prefs.setTheme(this, i);
        Themes.apply(i);
        if (service != null) for (TerminalSession s : service.sessions)
            if (s.getEmulator() != null) s.getEmulator().mColors.reset();
        applyLook();
        terminalView.invalidate();
    }

    private void fontDialog() {
        final String[] opts = {"Større", "Mindre", "Standard"};
        new AlertDialog.Builder(this, R.style.SkalDialog)
            .setTitle("Skriftstørrelse  (knib også på skærmen)")
            .setItems(opts, (d, w) -> {
                if (w == 0) changeFont(dp(1.5f));
                else if (w == 1) changeFont(-dp(1.5f));
                else { fontPx = dp(11); terminalView.setTextSize(fontPx); Prefs.setFontSize(this, fontPx); }
            }).show();
    }

    private void changeFont(int delta) {
        int n = Math.max(minFont, Math.min(maxFont, fontPx + delta));
        if (n == fontPx) return;
        fontPx = n;
        terminalView.setTextSize(fontPx);
        Prefs.setFontSize(this, fontPx);
    }

    private void settingsDialog() {
        final String[] keys = {"extra_keys", "keep_screen_on", "bell_vibrate", "back_esc", "volume_keys", "jb_font"};
        final String[] labels = {"Vis ekstra-taster", "Hold skærmen tændt", "Vibrér ved klokke (\\a)",
            "Tilbage-knap sender Esc", "Lydstyrke-taster som Ctrl/Fn", "Skrifttype: JetBrains Mono"};
        final boolean[] defs = {true, false, true, false, true, true};
        final boolean[] vals = new boolean[keys.length];
        for (int i = 0; i < keys.length; i++) vals[i] = Prefs.bool(this, keys[i], defs[i]);
        new AlertDialog.Builder(this, R.style.SkalDialog)
            .setTitle("Indstillinger")
            .setMultiChoiceItems(labels, vals, (d, w, c) -> vals[w] = c)
            .setNeutralButton("Markør…", (d, w) -> cursorDialog())
            .setPositiveButton("Gem", (d, w) -> {
                for (int i = 0; i < keys.length; i++) Prefs.setBool(this, keys[i], vals[i]);
                applyLook();
                applyWindowFlags();
                applyTypeface();
            })
            .setNegativeButton("Annullér", null)
            .show();
    }

    private void cursorDialog() {
        new AlertDialog.Builder(this, R.style.SkalDialog)
            .setTitle("Markør")
            .setSingleChoiceItems(new String[]{"Blok █", "Understregning _", "Streg |"}, Prefs.cursorStyleIndex(this), (d, w) -> {
                Prefs.setCursorStyleIndex(this, w);
                if (service != null) for (TerminalSession s : service.sessions)
                    if (s.getEmulator() != null) s.getEmulator().setCursorStyle();
                terminalView.invalidate();
                d.dismiss();
            }).show();
    }

    private void aboutDialog() {
        String v = "?";
        try { v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception ignored) { }
        new AlertDialog.Builder(this, R.style.SkalDialog)
            .setTitle("Skal " + v)
            .setMessage("Terminal til Android.\n\n" +
                "Kører Androids indbyggede shell (mksh) med toybox-værktøjerne. Programmer og scripts i ~/bin kan køres direkte.\n\n" +
                "Skriv skal-info for tips.\n\n" +
                "Terminal-emulatoren er fra Termux-projektet (Apache 2.0). Skrifttype: JetBrains Mono (OFL).")
            .setPositiveButton("OK", null).show();
    }

    // ---------------------------------------------------------------- lager

    private void setupStorage() {
        if (Build.VERSION.SDK_INT >= 30 && !Environment.isExternalStorageManager()
            && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            // Prøv først den almindelige tilladelse; virker den ikke, åbner vi "Adgang til alle filer".
            requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
            return;
        }
        if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT < 30
            && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
            return;
        }
        makeStorageLinks();
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req != REQ_STORAGE) return;
        boolean ok = res.length > 0 && res[res.length - 1] == PackageManager.PERMISSION_GRANTED;
        if (ok && canWriteSdcard()) { makeStorageLinks(); return; }
        if (Build.VERSION.SDK_INT >= 30) {
            new AlertDialog.Builder(this, R.style.SkalDialog)
                .setTitle("Adgang til alle filer")
                .setMessage("Din Android-version kræver \"Adgang til alle filer\" for at Skal kan se /sdcard. Slå den til på næste skærm, og vælg så menuen igen.")
                .setPositiveButton("Åbn indstillinger", (d, w) -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) {
                        startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                    }
                })
                .setNegativeButton("Annullér", null).show();
        } else {
            toast("Ingen adgang til lager");
        }
    }

    private boolean canWriteSdcard() {
        File sd = Environment.getExternalStorageDirectory();
        return sd.canRead();
    }

    private void makeStorageLinks() {
        File storage = new File(new File(getFilesDir(), "home"), "storage");
        storage.mkdirs();
        File sd = Environment.getExternalStorageDirectory();
        String[][] links = {
            {"shared", sd.getAbsolutePath()},
            {"downloads", new File(sd, Environment.DIRECTORY_DOWNLOADS).getAbsolutePath()},
            {"dcim", new File(sd, Environment.DIRECTORY_DCIM).getAbsolutePath()},
            {"pictures", new File(sd, Environment.DIRECTORY_PICTURES).getAbsolutePath()},
            {"music", new File(sd, Environment.DIRECTORY_MUSIC).getAbsolutePath()},
            {"movies", new File(sd, Environment.DIRECTORY_MOVIES).getAbsolutePath()},
            {"documents", new File(sd, Environment.DIRECTORY_DOCUMENTS).getAbsolutePath()},
        };
        int made = 0;
        for (String[] l : links) {
            File link = new File(storage, l[0]);
            try {
                if (link.exists() || isSymlink(link)) link.delete();
                Os.symlink(l[1], link.getAbsolutePath());
                made++;
            } catch (Exception ignored) { }
        }
        toast(made > 0 ? "Klar: ~/storage → /sdcard" : "Kunne ikke oprette ~/storage");
    }

    private static boolean isSymlink(File f) {
        try { return !f.getCanonicalPath().equals(f.getAbsolutePath()); } catch (Exception e) { return false; }
    }

    // ---------------------------------------------------------------- tastatur

    private void showKeyboard() {
        terminalView.requestFocus();
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.showSoftInput(terminalView, InputMethodManager.SHOW_IMPLICIT);
    }

    private void toggleKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        terminalView.requestFocus();
        imm.toggleSoftInput(InputMethodManager.SHOW_IMPLICIT, 0);
    }

    @Override public void onExtraKey(String k) {
        if (current == null) return;
        if (k.equals("KBD")) { toggleKeyboard(); return; }
        int code;
        switch (k) {
            case "ESC": code = KeyEvent.KEYCODE_ESCAPE; break;
            case "TAB": code = KeyEvent.KEYCODE_TAB; break;
            case "HOME": code = KeyEvent.KEYCODE_MOVE_HOME; break;
            case "END": code = KeyEvent.KEYCODE_MOVE_END; break;
            case "PGUP": code = KeyEvent.KEYCODE_PAGE_UP; break;
            case "PGDN": code = KeyEvent.KEYCODE_PAGE_DOWN; break;
            case "UP": code = KeyEvent.KEYCODE_DPAD_UP; break;
            case "DOWN": code = KeyEvent.KEYCODE_DPAD_DOWN; break;
            case "LEFT": code = KeyEvent.KEYCODE_DPAD_LEFT; break;
            case "RIGHT": code = KeyEvent.KEYCODE_DPAD_RIGHT; break;
            default: code = -1;
        }
        if (code >= 0) {
            int mod = 0;
            if (extraKeys.readCtrl()) mod |= KeyHandler.KEYMOD_CTRL;
            if (extraKeys.readAlt()) mod |= KeyHandler.KEYMOD_ALT;
            terminalView.handleKeyCode(code, mod);
        } else {
            terminalView.inputCodePoint(k.codePointAt(0), extraKeys.readCtrl(), extraKeys.readAlt());
        }
    }

    // ---------------------------------------------------------------- TerminalViewClient

    @Override public float onScale(float scale) {
        if (scale < 0.9f || scale > 1.1f) {
            changeFont(scale > 1f ? dp(1) : -dp(1));
            return 1.0f;
        }
        return scale;
    }

    @Override public void onSingleTapUp(MotionEvent e) { showKeyboard(); }

    @Override public boolean shouldBackButtonBeMappedToEscape() { return Prefs.backIsEsc(this); }
    @Override public boolean shouldEnforceCharBasedInput() { return false; }
    @Override public boolean shouldUseCtrlSpaceWorkaround() { return false; }
    @Override public boolean isTerminalViewSelected() { return true; }
    @Override public void copyModeChanged(boolean copyMode) { }

    @Override public boolean onKeyDown(int keyCode, KeyEvent e, TerminalSession session) {
        if (Prefs.volumeKeys(this)) {
            if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) { volDown = true; return true; }
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) { volUp = true; return true; }
        }
        if (session != null && !session.isRunning()
            && (keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
            closeSession(session);
            return true;
        }
        if (e.isCtrlPressed() && e.isShiftPressed()) {
            // Genveje med fysisk tastatur
            switch (keyCode) {
                case KeyEvent.KEYCODE_T: newSession(); return true;
                case KeyEvent.KEYCODE_W: if (current != null) closeSession(current); return true;
                case KeyEvent.KEYCODE_V: onPasteTextFromClipboard(current); return true;
                case KeyEvent.KEYCODE_C: copyTranscript(); return true;
                case KeyEvent.KEYCODE_EQUALS: case KeyEvent.KEYCODE_PLUS: changeFont(dp(1)); return true;
                case KeyEvent.KEYCODE_MINUS: changeFont(-dp(1)); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: case KeyEvent.KEYCODE_TAB: switchSession(1); return true;
                case KeyEvent.KEYCODE_DPAD_LEFT: switchSession(-1); return true;
            }
        }
        return false;
    }

    private void switchSession(int dir) {
        if (service == null || service.sessions.size() < 2) return;
        int i = service.sessions.indexOf(current);
        int n = service.sessions.size();
        attach(service.sessions.get(((i + dir) % n + n) % n));
    }

    @Override public boolean onKeyUp(int keyCode, KeyEvent e) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN && volDown) { volDown = false; return true; }
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP && volUp) { volUp = false; return true; }
        return false;
    }

    @Override public boolean onLongPress(MotionEvent event) { return false; }

    @Override public boolean readControlKey() { return volDown || extraKeys.readCtrl(); }
    @Override public boolean readAltKey() { return extraKeys.readAlt(); }
    @Override public boolean readShiftKey() { return false; }
    @Override public boolean readFnKey() { return false; }

    @Override public boolean onCodePoint(int cp, boolean ctrlDown, TerminalSession session) {
        if (session != null && !session.isRunning() && (cp == '\n' || cp == '\r')) {
            closeSession(session);
            return true;
        }
        if (!volUp) return false;
        int code = -1;
        String text = null;
        switch (Character.toLowerCase(cp)) {
            case 'w': code = KeyEvent.KEYCODE_DPAD_UP; break;
            case 'a': code = KeyEvent.KEYCODE_DPAD_LEFT; break;
            case 's': code = KeyEvent.KEYCODE_DPAD_DOWN; break;
            case 'd': code = KeyEvent.KEYCODE_DPAD_RIGHT; break;
            case 'p': code = KeyEvent.KEYCODE_PAGE_UP; break;
            case 'n': code = KeyEvent.KEYCODE_PAGE_DOWN; break;
            case 't': code = KeyEvent.KEYCODE_TAB; break;
            case 'e': code = KeyEvent.KEYCODE_ESCAPE; break;
            case 'h': text = "~"; break;
            case 'u': text = "_"; break;
            case 'l': text = "|"; break;
            case 'k': toggleKeyboard(); return true;
            default:
                if (cp >= '1' && cp <= '9') code = KeyEvent.KEYCODE_F1 + (cp - '1');
                else if (cp == '0') code = KeyEvent.KEYCODE_F10;
        }
        if (code >= 0) { terminalView.handleKeyCode(code, ctrlDown ? KeyHandler.KEYMOD_CTRL : 0); return true; }
        if (text != null) { session.write(text); return true; }
        return false;
    }

    @Override public void onEmulatorSet() {
        if (current != null && current.getEmulator() != null) current.getEmulator().setCursorStyle();
    }

    // ---------------------------------------------------------------- TerminalSessionClient (via TermService)

    @Override public void onTextChanged(TerminalSession s) { if (s == current) terminalView.onScreenUpdated(); }

    @Override public void onTitleChanged(TerminalSession s) { refreshTabs(); }

    @Override public void onSessionFinished(TerminalSession s) {
        refreshTabs();
        if (service != null) service.updateNotification();
    }

    @Override public void onCopyTextToClipboard(TerminalSession s, String text) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("Skal", text));
        toast("Kopieret");
    }

    @Override public void onPasteTextFromClipboard(TerminalSession s) {
        if (s == null || s.getEmulator() == null) return;
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData c = cm.getPrimaryClip();
        if (c == null || c.getItemCount() == 0) return;
        CharSequence t = c.getItemAt(0).coerceToText(this);
        if (t != null && t.length() > 0) s.getEmulator().paste(t.toString());
    }

    @Override public void onBell(TerminalSession s) {
        if (!Prefs.vibrateBell(this)) return;
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE));
        else v.vibrate(40);
    }

    @Override public void onColorsChanged(TerminalSession s) { if (s == current) terminalView.invalidate(); }
    @Override public void onTerminalCursorStateChange(boolean state) { }
    @Override public Integer getTerminalCursorStyle() { return Prefs.cursorStyle(this); }

    @Override public void onServiceStopped() { runOnUiThread(this::finishAndRemoveTask); }

    @Override public void onBackPressed() {
        if (Prefs.backIsEsc(this)) return; // håndteres af TerminalView
        moveTaskToBack(true);
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    // log (TerminalViewClient + TerminalSessionClient)
    @Override public void logError(String tag, String m) { android.util.Log.e(tag, m); }
    @Override public void logWarn(String tag, String m) { android.util.Log.w(tag, m); }
    @Override public void logInfo(String tag, String m) { android.util.Log.i(tag, m); }
    @Override public void logDebug(String tag, String m) { android.util.Log.d(tag, m); }
    @Override public void logVerbose(String tag, String m) { android.util.Log.v(tag, m); }
    @Override public void logStackTraceWithMessage(String tag, String m, Exception e) { android.util.Log.e(tag, m, e); }
    @Override public void logStackTrace(String tag, Exception e) { android.util.Log.e(tag, "fejl", e); }
}
