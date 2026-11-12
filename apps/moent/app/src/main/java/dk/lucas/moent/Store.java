package dk.lucas.moent;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Calendar;
import java.util.Locale;

final class Store {
    private Store() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("moent", Context.MODE_PRIVATE);
    }

    static JSONObject snapshot(Context c) {
        try { return new JSONObject(prefs(c).getString("snapshot", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static String kr(long ore) {
        NumberFormat nf = NumberFormat.getIntegerInstance(new Locale("da", "DK"));
        return (ore < 0 ? "−" : "") + nf.format(Math.round(Math.abs(ore) / 100.0)) + " kr";
    }

    static String today() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static Calendar parse(String s) {
        Calendar c = Calendar.getInstance();
        c.clear();
        try {
            String[] p = s.split("-");
            c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
        } catch (Exception ignored) {}
        return c;
    }

    /** Antal dage fra i dag til dato (0 = i dag). */
    static long daysUntil(String date) {
        long a = parse(today()).getTimeInMillis(), b = parse(date).getTimeInMillis();
        return Math.round((b - a) / 86400000.0);
    }

    static String dayLabel(String date) {
        long d = daysUntil(date);
        if (d == 0) return "I dag";
        if (d == 1) return "I morgen";
        if (d == -1) return "I går";
        Calendar c = parse(date);
        String[] m = {"jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."};
        return c.get(Calendar.DAY_OF_MONTH) + ". " + m[c.get(Calendar.MONTH)];
    }
}
