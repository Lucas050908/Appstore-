package dk.lucas.skal;

import android.content.Context;
import android.content.SharedPreferences;

import com.termux.terminal.TerminalEmulator;

final class Prefs {
    static SharedPreferences p(Context c) { return c.getSharedPreferences("skal", Context.MODE_PRIVATE); }

    static int theme(Context c) { return p(c).getInt("theme", 0); }
    static void setTheme(Context c, int v) { p(c).edit().putInt("theme", v).apply(); }

    /** Skriftstørrelse i px; 0 = ikke sat endnu. */
    static int fontSize(Context c) { return p(c).getInt("font_px", 0); }
    static void setFontSize(Context c, int v) { p(c).edit().putInt("font_px", v).apply(); }

    static boolean bool(Context c, String k, boolean def) { return p(c).getBoolean(k, def); }
    static void setBool(Context c, String k, boolean v) { p(c).edit().putBoolean(k, v).apply(); }

    static boolean extraKeys(Context c) { return bool(c, "extra_keys", true); }
    static boolean keepScreenOn(Context c) { return bool(c, "keep_screen_on", false); }
    static boolean vibrateBell(Context c) { return bool(c, "bell_vibrate", true); }
    static boolean backIsEsc(Context c) { return bool(c, "back_esc", false); }
    static boolean jetbrainsFont(Context c) { return bool(c, "jb_font", true); }
    static boolean volumeKeys(Context c) { return bool(c, "volume_keys", true); }

    static int cursorStyleIndex(Context c) { return p(c).getInt("cursor", 0); }
    static void setCursorStyleIndex(Context c, int v) { p(c).edit().putInt("cursor", v).apply(); }
    static Integer cursorStyle(Context c) {
        switch (cursorStyleIndex(c)) {
            case 1: return TerminalEmulator.TERMINAL_CURSOR_STYLE_UNDERLINE;
            case 2: return TerminalEmulator.TERMINAL_CURSOR_STYLE_BAR;
            default: return TerminalEmulator.TERMINAL_CURSOR_STYLE_BLOCK;
        }
    }

    static int scrollback(Context c) { return p(c).getInt("scrollback", 5000); }

    static int currentSession(Context c) { return p(c).getInt("current", 0); }
    static void setCurrentSession(Context c, int v) { p(c).edit().putInt("current", v).apply(); }
}
