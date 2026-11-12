package dk.lucas.skal;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.HashSet;
import java.util.Set;

/** To rækker ekstra-taster over tastaturet, som i Termux. */
public class ExtraKeysView extends LinearLayout {

    public interface Listener { void onExtraKey(String key); }

    static final String[][] KEYS = {
        {"ESC", "/", "-", "HOME", "UP", "END", "PGUP", "KBD"},
        {"TAB", "CTRL", "ALT", "LEFT", "DOWN", "RIGHT", "PGDN", "|"},
    };

    private static final Set<String> REPEAT = new HashSet<>();
    static { for (String k : new String[]{"UP", "DOWN", "LEFT", "RIGHT", "PGUP", "PGDN", "/", "-", "|"}) REPEAT.add(k); }

    private enum Mod { OFF, ONCE, LOCKED }

    private Mod ctrl = Mod.OFF, alt = Mod.OFF;
    private TextView ctrlView, altView;
    private Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int fg = 0xFFD8DEE9, accent = 0xFF5EE6A0;

    public ExtraKeysView(Context c) {
        super(c);
        setOrientation(VERTICAL);
        build();
    }

    void setListener(Listener l) { listener = l; }

    void setColors(int background, int foreground) {
        fg = foreground;
        setBackgroundColor(background);
        removeAllViews();
        build();
    }

    private static String label(String k) {
        switch (k) {
            case "UP": return "↑";
            case "DOWN": return "↓";
            case "LEFT": return "←";
            case "RIGHT": return "→";
            case "KBD": return "⌨";
            default: return k;
        }
    }

    private void build() {
        float d = getResources().getDisplayMetrics().density;
        for (String[] row : KEYS) {
            LinearLayout r = new LinearLayout(getContext());
            r.setOrientation(HORIZONTAL);
            for (final String k : row) {
                TextView b = new TextView(getContext());
                b.setText(label(k));
                b.setGravity(Gravity.CENTER);
                b.setTextColor(fg);
                b.setTextSize(k.length() > 2 ? 12.5f : 15f);
                b.setTypeface(Typeface.DEFAULT_BOLD);
                b.setSingleLine(true);
                LayoutParams lp = new LayoutParams(0, (int) (38 * d), 1f);
                r.addView(b, lp);
                if (k.equals("CTRL")) ctrlView = b;
                if (k.equals("ALT")) altView = b;
                attachTouch(b, k);
            }
            addView(r, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        }
        refreshMods();
    }

    private void attachTouch(final TextView b, final String k) {
        final int longPress = ViewConfiguration.getLongPressTimeout();
        b.setOnTouchListener(new OnTouchListener() {
            Runnable repeater, locker;
            boolean longDone;

            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        longDone = false;
                        v.setBackground(pressedBg());
                        v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                        if (REPEAT.contains(k)) {
                            repeater = new Runnable() {
                                @Override public void run() {
                                    longDone = true;
                                    send(k);
                                    handler.postDelayed(this, 60);
                                }
                            };
                            handler.postDelayed(repeater, longPress);
                        } else if (k.equals("CTRL") || k.equals("ALT")) {
                            locker = new Runnable() {
                                @Override public void run() {
                                    longDone = true;
                                    v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                                    if (k.equals("CTRL")) ctrl = ctrl == Mod.LOCKED ? Mod.OFF : Mod.LOCKED;
                                    else alt = alt == Mod.LOCKED ? Mod.OFF : Mod.LOCKED;
                                    refreshMods();
                                }
                            };
                            handler.postDelayed(locker, longPress);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (repeater != null) handler.removeCallbacks(repeater);
                        if (locker != null) handler.removeCallbacks(locker);
                        v.setBackground(null);
                        refreshMods();
                        if (e.getActionMasked() == MotionEvent.ACTION_UP && !longDone) {
                            if (k.equals("CTRL")) { ctrl = ctrl == Mod.OFF ? Mod.ONCE : Mod.OFF; refreshMods(); }
                            else if (k.equals("ALT")) { alt = alt == Mod.OFF ? Mod.ONCE : Mod.OFF; refreshMods(); }
                            else send(k);
                        }
                        return true;
                }
                return true;
            }
        });
    }

    private void send(String k) { if (listener != null) listener.onExtraKey(k); }

    private GradientDrawable pressedBg() {
        GradientDrawable g = new GradientDrawable();
        g.setColor(Color.argb(60, Color.red(fg), Color.green(fg), Color.blue(fg)));
        g.setCornerRadius(8 * getResources().getDisplayMetrics().density);
        return g;
    }

    private void styleMod(TextView v, Mod m) {
        if (v == null) return;
        if (m == Mod.OFF) { v.setTextColor(fg); v.setBackground(null); v.setPaintFlags(v.getPaintFlags() & ~android.graphics.Paint.UNDERLINE_TEXT_FLAG); return; }
        v.setTextColor(accent);
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(8 * getResources().getDisplayMetrics().density);
        g.setColor(Color.argb(m == Mod.LOCKED ? 90 : 40, Color.red(accent), Color.green(accent), Color.blue(accent)));
        v.setBackground(g);
        if (m == Mod.LOCKED) v.setPaintFlags(v.getPaintFlags() | android.graphics.Paint.UNDERLINE_TEXT_FLAG);
    }

    private void refreshMods() { styleMod(ctrlView, ctrl); styleMod(altView, alt); }

    /** Læser Ctrl; et engangs-tryk nulstilles efter brug. */
    boolean readCtrl() {
        boolean on = ctrl != Mod.OFF;
        if (ctrl == Mod.ONCE) { ctrl = Mod.OFF; post(this::refreshMods); }
        return on;
    }

    boolean readAlt() {
        boolean on = alt != Mod.OFF;
        if (alt == Mod.ONCE) { alt = Mod.OFF; post(this::refreshMods); }
        return on;
    }
}
