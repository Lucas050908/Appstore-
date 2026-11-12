package dk.lucas.vagt;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;

import org.json.JSONObject;

import java.util.Map;

/** Påmindelser: gemmes i prefs, planlægges med AlarmManager og genplanlægges efter genstart. */
public class Notifier extends BroadcastReceiver {
    static final String ACTION = "dk.lucas.vagt.REMIND";

    private static SharedPreferences p(Context c) { return c.getSharedPreferences("reminders", Context.MODE_PRIVATE); }

    private static PendingIntent pi(Context c, String id) {
        Intent i = new Intent(c, Notifier.class).setAction(ACTION).setData(Uri.parse("remind://" + Uri.encode(id))).putExtra("id", id);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c, String id, long at, String title, String text, String hash) {
        try {
            JSONObject o = new JSONObject().put("at", at).put("title", title).put("text", text).put("hash", hash == null ? "" : hash);
            p(c).edit().putString(id, o.toString()).apply();
        } catch (Exception ignored) {}
        arm(c, id, at);
    }

    private static void arm(Context c, String id, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        long when = Math.max(at, System.currentTimeMillis() + 1000);
        try {
            if (android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi(c, id));
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi(c, id));
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi(c, id));
        }
    }

    static void cancel(Context c, String id) {
        c.getSystemService(AlarmManager.class).cancel(pi(c, id));
        p(c).edit().remove(id).apply();
    }

    static void rescheduleAll(Context c) {
        for (Map.Entry<String, ?> e : p(c).getAll().entrySet()) {
            try {
                JSONObject o = new JSONObject(String.valueOf(e.getValue()));
                if (o.optLong("at") < System.currentTimeMillis() - 6 * 3600 * 1000L) { p(c).edit().remove(e.getKey()).apply(); continue; }
                arm(c, e.getKey(), o.optLong("at"));
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onReceive(Context c, Intent in) {
        if (!ACTION.equals(in.getAction())) { rescheduleAll(c); Widgets.updateAll(c); return; }
        String id = in.getStringExtra("id");
        String raw = p(c).getString(id, null);
        if (raw == null) return;
        p(c).edit().remove(id).apply();
        try {
            JSONObject o = new JSONObject(raw);
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel("remind", "Påmindelser", NotificationManager.IMPORTANCE_HIGH));
            Intent open = new Intent(c, MainActivity.class).putExtra("hash", o.optString("hash"))
                    .setData(Uri.parse("open://" + Uri.encode(id))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent op = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification n = new Notification.Builder(c, "remind")
                    .setSmallIcon(R.drawable.ic_stat)
                    .setColor(Color.parseColor("#B5323A"))
                    .setContentTitle(o.optString("title"))
                    .setContentText(o.optString("text"))
                    .setStyle(new Notification.BigTextStyle().bigText(o.optString("text")))
                    .setContentIntent(op)
                    .setAutoCancel(true)
                    .build();
            nm.notify(id.hashCode(), n);
        } catch (Exception ignored) {}
    }
}
