package dk.lucas.tik;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Planlægger alarmer, timere og udsættelser hos AlarmManager og holder timer-notifikationer opdateret. */
final class Scheduler {
    private Scheduler() {}

    static final String CH_ALARM = "alarm2";
    static final String CH_TIMER = "timer";
    static final String CH_INFO = "info";

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel a = new NotificationChannel(CH_ALARM, "Alarmer der ringer", NotificationManager.IMPORTANCE_HIGH);
        a.setDescription("Vises når en alarm eller timer ringer");
        a.setSound(null, null);          // lyden afspilles af AlarmService
        a.enableVibration(false);
        a.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        a.setBypassDnd(true);
        nm.createNotificationChannel(a);
        NotificationChannel t = new NotificationChannel(CH_TIMER, "Timere der kører", NotificationManager.IMPORTANCE_LOW);
        t.setShowBadge(false);
        nm.createNotificationChannel(t);
        NotificationChannel i = new NotificationChannel(CH_INFO, "Mistede alarmer", NotificationManager.IMPORTANCE_DEFAULT);
        nm.createNotificationChannel(i);
    }

    static PendingIntent firePI(Context c, String kind, String id) {
        Intent i = new Intent(c, AlarmReceiver.class)
                .setAction(AlarmReceiver.ACTION_FIRE)
                .setData(Uri.parse("tik://" + kind + "/" + Uri.encode(id)))
                .putExtra("kind", kind).putExtra("id", id);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent actionPI(Context c, String action, String id) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(action)
                .setData(Uri.parse("tik://act/" + action + "/" + Uri.encode(id))).putExtra("id", id);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openPI(Context c, String tab) {
        Intent i = new Intent(c, MainActivity.class).putExtra("tab", tab)
                .setData(Uri.parse("tik://open/" + tab))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        return c.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    private static void setClock(Context c, long at, PendingIntent pi) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        try {
            if (canExact(c)) am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, openPI(c, "alarm")), pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static void setExact(Context c, long at, PendingIntent pi) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        try {
            if (canExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    static void cancel(Context c, String kind, String id) {
        c.getSystemService(AlarmManager.class).cancel(firePI(c, kind, id));
    }

    /** Planlæg alt forfra ud fra den gemte tilstand. Kaldes efter hver ændring, ved opstart og ved tidsændringer. */
    static void scheduleAll(Context c) {
        long now = System.currentTimeMillis();
        JSONArray alarms = Store.arr(c, "alarms");
        for (int i = 0; i < alarms.length(); i++) {
            JSONObject a = alarms.optJSONObject(i);
            if (a == null) continue;
            String id = a.optString("id");
            long t = a.optBoolean("enabled") ? Store.nextFire(a, now) : 0;
            if (t > 0) setClock(c, t, firePI(c, "alarm", id));
            else cancel(c, "alarm", id);
        }
        JSONObject sn = Store.snooze(c);
        if (sn != null && sn.optLong("at") > now) setClock(c, sn.optLong("at"), firePI(c, "snooze", "s"));
        else cancel(c, "snooze", "s");

        JSONArray timers = Store.arr(c, "timers");
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        Set<Integer> live = new HashSet<>();
        for (int i = 0; i < timers.length(); i++) {
            JSONObject t = timers.optJSONObject(i);
            if (t == null) continue;
            String id = t.optString("id");
            String st = t.optString("state");
            if ("running".equals(st)) {
                long end = t.optLong("endAt");
                if (end <= now) end = now + 500;
                setExact(c, end, firePI(c, "timer", id));
            } else cancel(c, "timer", id);
            if ("running".equals(st) || "paused".equals(st)) {
                int nid = notifId(id);
                live.add(nid);
                try { nm.notify(nid, timerNotification(c, t)); } catch (SecurityException ignored) {}
            }
        }
        // ryd notifikationer for timere der ikke længere kører
        java.util.Set<String> known = Store.prefs(c).getStringSet("timerNotifs", new HashSet<>());
        Set<String> keep = new HashSet<>();
        for (String s : known) {
            int nid = Integer.parseInt(s);
            if (!live.contains(nid)) nm.cancel(nid); else keep.add(s);
        }
        for (int nid : live) keep.add(String.valueOf(nid));
        Store.prefs(c).edit().putStringSet("timerNotifs", keep).apply();

        Widgets.updateAll(c);
        MainActivity.pushState();
    }

    static int notifId(String id) {
        return 2000 + (id.hashCode() & 0x7fff);
    }

    static String fmt(long ms) {
        long s = Math.max(0, (ms + 999) / 1000);
        long h = s / 3600, m = s % 3600 / 60, sec = s % 60;
        return h > 0 ? String.format(Locale.ROOT, "%d:%02d:%02d", h, m, sec) : String.format(Locale.ROOT, "%02d:%02d", m, sec);
    }

    private static Notification timerNotification(Context c, JSONObject t) {
        String id = t.optString("id");
        boolean running = "running".equals(t.optString("state"));
        String label = t.optString("label");
        if (label.isEmpty()) label = "Timer · " + fmt(t.optLong("duration"));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH_TIMER) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle(label)
                .setColor(Color.parseColor("#F3C08C"))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setContentIntent(openPI(c, "timer"));
        if (running) {
            b.setWhen(t.optLong("endAt")).setUsesChronometer(true);
            if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
            b.setContentText("Tid tilbage");
            b.addAction(new Notification.Action.Builder(null, "Pause", actionPI(c, AlarmReceiver.ACTION_TIMER_PAUSE, id)).build());
        } else {
            b.setUsesChronometer(false).setShowWhen(false);
            b.setContentText("På pause · " + fmt(t.optLong("remaining")) + " tilbage");
            b.addAction(new Notification.Action.Builder(null, "Fortsæt", actionPI(c, AlarmReceiver.ACTION_TIMER_RESUME, id)).build());
        }
        b.addAction(new Notification.Action.Builder(null, "+1 min", actionPI(c, AlarmReceiver.ACTION_TIMER_ADD, id)).build());
        b.addAction(new Notification.Action.Builder(null, "Fjern", actionPI(c, AlarmReceiver.ACTION_TIMER_DELETE, id)).build());
        return b.build();
    }
}
