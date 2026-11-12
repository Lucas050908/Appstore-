package dk.lucas.moent;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** Daglig kontrol kl. 9: påmind om faste betalinger der trækkes i morgen. Opdaterer også widgets (ny dag). */
public class Reminders extends BroadcastReceiver {
    static final String CH = "remind";

    static void schedule(Context c) {
        Calendar t = Calendar.getInstance();
        t.set(Calendar.HOUR_OF_DAY, 9);
        t.set(Calendar.MINUTE, 0);
        t.set(Calendar.SECOND, 0);
        if (t.getTimeInMillis() <= System.currentTimeMillis()) t.add(Calendar.DAY_OF_MONTH, 1);
        Intent i = new Intent(c, Reminders.class).setAction("dk.lucas.moent.DAILY");
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        c.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t.getTimeInMillis(), pi);
    }

    @Override
    public void onReceive(Context c, Intent in) {
        String act = in.getAction();
        if ("dk.lucas.moent.DAILY".equals(act)) notifyDue(c);
        MoentWidgets.updateAll(c);
        schedule(c);
    }

    private static void notifyDue(Context c) {
        String today = Store.today();
        if (today.equals(Store.prefs(c).getString("lastRemind", ""))) return;
        Store.prefs(c).edit().putString("lastRemind", today).apply();
        JSONArray up = Store.snapshot(c).optJSONArray("upcoming");
        if (up == null) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CH, "Påmindelser om faste betalinger", NotificationManager.IMPORTANCE_DEFAULT);
        nm.createNotificationChannel(ch);
        Intent open = new Intent(c, MainActivity.class).putExtra("tab", "fixed").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        for (int i = 0; i < up.length(); i++) {
            JSONObject r = up.optJSONObject(i);
            if (r == null || !r.optBoolean("remind")) continue;
            if (Store.daysUntil(r.optString("date")) != 1) continue;
            boolean income = "in".equals(r.optString("type"));
            Notification n = new Notification.Builder(c, CH)
                    .setSmallIcon(R.drawable.ic_stat_coin)
                    .setColor(Color.parseColor("#7FD6B9"))
                    .setContentTitle((income ? "I morgen kommer: " : "I morgen trækkes: ") + r.optString("name"))
                    .setContentText(Store.kr(r.optLong("amount")))
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .build();
            try { nm.notify(100 + i, n); } catch (SecurityException ignored) {}
        }
    }
}
