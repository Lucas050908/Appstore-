package dk.lucas.tik;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/** Tegner alle fire widgets ud fra den gemte tilstand. */
final class Widgets {
    private Widgets() {}

    static final String[][] CITIES = {
        {"København", "Europe/Copenhagen"}, {"Nuuk", "America/Nuuk"}, {"Tórshavn", "Atlantic/Faroe"}, {"London", "Europe/London"}, {"Dublin", "Europe/Dublin"},
        {"Lissabon", "Europe/Lisbon"}, {"Paris", "Europe/Paris"}, {"Berlin", "Europe/Berlin"}, {"Amsterdam", "Europe/Amsterdam"}, {"Stockholm", "Europe/Stockholm"},
        {"Oslo", "Europe/Oslo"}, {"Helsinki", "Europe/Helsinki"}, {"Reykjavík", "Atlantic/Reykjavik"}, {"Madrid", "Europe/Madrid"}, {"Rom", "Europe/Rome"},
        {"Athen", "Europe/Athens"}, {"Istanbul", "Europe/Istanbul"}, {"Kyiv", "Europe/Kiev"}, {"Moskva", "Europe/Moscow"}, {"Warszawa", "Europe/Warsaw"},
        {"Prag", "Europe/Prague"}, {"Wien", "Europe/Vienna"}, {"Zürich", "Europe/Zurich"}, {"Kairo", "Africa/Cairo"}, {"Lagos", "Africa/Lagos"},
        {"Nairobi", "Africa/Nairobi"}, {"Johannesburg", "Africa/Johannesburg"}, {"Casablanca", "Africa/Casablanca"}, {"Dubai", "Asia/Dubai"}, {"Doha", "Asia/Qatar"},
        {"Teheran", "Asia/Tehran"}, {"Karachi", "Asia/Karachi"}, {"Delhi", "Asia/Kolkata"}, {"Kathmandu", "Asia/Kathmandu"}, {"Dhaka", "Asia/Dhaka"},
        {"Bangkok", "Asia/Bangkok"}, {"Jakarta", "Asia/Jakarta"}, {"Singapore", "Asia/Singapore"}, {"Hongkong", "Asia/Hong_Kong"}, {"Beijing", "Asia/Shanghai"},
        {"Taipei", "Asia/Taipei"}, {"Manila", "Asia/Manila"}, {"Seoul", "Asia/Seoul"}, {"Tokyo", "Asia/Tokyo"}, {"Perth", "Australia/Perth"},
        {"Adelaide", "Australia/Adelaide"}, {"Brisbane", "Australia/Brisbane"}, {"Sydney", "Australia/Sydney"}, {"Melbourne", "Australia/Melbourne"}, {"Auckland", "Pacific/Auckland"},
        {"Honolulu", "Pacific/Honolulu"}, {"Anchorage", "America/Anchorage"}, {"Los Angeles", "America/Los_Angeles"}, {"San Francisco", "America/Los_Angeles"}, {"Vancouver", "America/Vancouver"},
        {"Denver", "America/Denver"}, {"Phoenix", "America/Phoenix"}, {"Chicago", "America/Chicago"}, {"Mexico City", "America/Mexico_City"}, {"Toronto", "America/Toronto"},
        {"New York", "America/New_York"}, {"Miami", "America/New_York"}, {"Bogotá", "America/Bogota"}, {"Lima", "America/Lima"}, {"Santiago", "America/Santiago"},
        {"São Paulo", "America/Sao_Paulo"}, {"Rio de Janeiro", "America/Sao_Paulo"}, {"Buenos Aires", "America/Argentina/Buenos_Aires"}
    };

    static String tz(String city) {
        for (String[] c : CITIES) if (c[0].equals(city)) return c[1];
        return city;
    }

    static String name(String id) {
        for (String[] c : CITIES) if (c[0].equals(id) || c[1].equals(id)) return c[0];
        int i = id.lastIndexOf('/');
        return (i >= 0 ? id.substring(i + 1) : id).replace('_', ' ');
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        update(c, m, WidgetClock.class);
        update(c, m, WidgetNext.class);
        update(c, m, WidgetTimer.class);
        update(c, m, WidgetWorld.class);
    }

    static void update(Context c, AppWidgetManager m, Class<?> cls) {
        int[] ids = m.getAppWidgetIds(new ComponentName(c, cls));
        if (ids == null || ids.length == 0) return;
        RemoteViews v;
        if (cls == WidgetClock.class) v = clock(c);
        else if (cls == WidgetNext.class) v = next(c);
        else if (cls == WidgetTimer.class) v = timer(c);
        else v = world(c);
        m.updateAppWidget(ids, v);
    }

    private static String nextText(Context c, boolean withLabel) {
        JSONObject n = Store.nextAlarm(c);
        if (n == null) return null;
        long at = n.optLong("at");
        String day = dayLabel(at);
        String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(at));
        String label = n.optString("label");
        return day + " " + time + (withLabel && !label.isEmpty() ? " · " + label : "");
    }

    static String dayLabel(long at) {
        Calendar now = Calendar.getInstance(), t = Calendar.getInstance();
        t.setTimeInMillis(at);
        Calendar a = (Calendar) now.clone(); a.set(Calendar.HOUR_OF_DAY, 0); a.set(Calendar.MINUTE, 0); a.set(Calendar.SECOND, 0); a.set(Calendar.MILLISECOND, 0);
        Calendar b = (Calendar) t.clone(); b.set(Calendar.HOUR_OF_DAY, 0); b.set(Calendar.MINUTE, 0); b.set(Calendar.SECOND, 0); b.set(Calendar.MILLISECOND, 0);
        long d = Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 86400000.0);
        if (d == 0) return "I dag";
        if (d == 1) return "I morgen";
        String[] n = {"Søn.", "Man.", "Tir.", "Ons.", "Tor.", "Fre.", "Lør."};
        return n[t.get(Calendar.DAY_OF_WEEK) - 1];
    }

    private static RemoteViews clock(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_clock);
        String n = nextText(c, true);
        v.setTextViewText(R.id.next, n == null ? "Ingen alarmer" : "⏰  " + n);
        v.setOnClickPendingIntent(R.id.root, Scheduler.openPI(c, "alarm"));
        return v;
    }

    private static RemoteViews next(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_next);
        JSONObject n = Store.nextAlarm(c);
        if (n == null) {
            v.setTextViewText(R.id.time, "–");
            v.setTextViewText(R.id.day, "Ingen aktive alarmer");
            v.setViewVisibility(R.id.label, View.GONE);
        } else {
            long at = n.optLong("at");
            v.setTextViewText(R.id.time, new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(at)));
            v.setTextViewText(R.id.day, dayLabel(at));
            String l = n.optString("label");
            v.setTextViewText(R.id.label, l);
            v.setViewVisibility(R.id.label, l.isEmpty() ? View.GONE : View.VISIBLE);
        }
        v.setOnClickPendingIntent(R.id.root, Scheduler.openPI(c, "alarm"));
        return v;
    }

    private static RemoteViews timer(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_timer);
        JSONArray presets = Store.settings(c).optJSONArray("presets");
        long[] def = {60, 300, 600, 1500};
        int[] btn = {R.id.b1, R.id.b2, R.id.b3, R.id.b4};
        for (int i = 0; i < 4; i++) {
            long secs = presets != null && i < presets.length() ? presets.optLong(i, def[i]) : def[i];
            String t = secs >= 3600 ? (secs / 3600) + " t" : secs >= 60 ? (secs / 60) + "m" : secs + "s";
            v.setTextViewText(btn[i], t);
            Intent in = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_QUICK_TIMER)
                    .setData(Uri.parse("tik://quick/" + i + "/" + secs)).putExtra("secs", secs);
            v.setOnClickPendingIntent(btn[i], PendingIntent.getBroadcast(c, 0, in, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        JSONArray ts = Store.arr(c, "timers");
        long soon = 0; int running = 0;
        for (int i = 0; i < ts.length(); i++) {
            JSONObject t = ts.optJSONObject(i);
            if (t != null && "running".equals(t.optString("state"))) {
                running++;
                if (soon == 0 || t.optLong("endAt") < soon) soon = t.optLong("endAt");
            }
        }
        v.setTextViewText(R.id.status, running == 0 ? "Tryk for at starte"
                : (running == 1 ? "Færdig " : running + " kører · næste ") + new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(soon)));
        v.setOnClickPendingIntent(R.id.title, Scheduler.openPI(c, "timer"));
        return v;
    }

    private static RemoteViews world(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_world);
        JSONArray cities = Store.cities(c);
        int[] cols = {R.id.c1, R.id.c2, R.id.c3};
        int[] names = {R.id.n1, R.id.n2, R.id.n3};
        int[] clocks = {R.id.t1, R.id.t2, R.id.t3};
        for (int i = 0; i < 3; i++) {
            if (i < cities.length()) {
                String id = cities.optString(i);
                v.setViewVisibility(cols[i], View.VISIBLE);
                v.setTextViewText(names[i], name(id));
                v.setString(clocks[i], "setTimeZone", tz(id));
            } else {
                v.setViewVisibility(cols[i], View.GONE);
            }
        }
        v.setViewVisibility(R.id.empty, cities.length() == 0 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.root, Scheduler.openPI(c, "world"));
        return v;
    }
}
