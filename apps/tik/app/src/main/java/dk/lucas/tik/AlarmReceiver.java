package dk.lucas.tik;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Modtager: alarm/timer/udsæt der ringer, knapper i notifikationer og widgets, genstart og tidsændringer. */
public class AlarmReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "dk.lucas.tik.FIRE";
    static final String ACTION_STOP = "dk.lucas.tik.STOP";
    static final String ACTION_SNOOZE = "dk.lucas.tik.SNOOZE";
    static final String ACTION_RING_ADD = "dk.lucas.tik.RING_ADD";
    static final String ACTION_TIMER_PAUSE = "dk.lucas.tik.TIMER_PAUSE";
    static final String ACTION_TIMER_RESUME = "dk.lucas.tik.TIMER_RESUME";
    static final String ACTION_TIMER_ADD = "dk.lucas.tik.TIMER_ADD";
    static final String ACTION_TIMER_DELETE = "dk.lucas.tik.TIMER_DELETE";
    static final String ACTION_QUICK_TIMER = "dk.lucas.tik.QUICK_TIMER";

    @Override
    public void onReceive(Context c, Intent in) {
        String act = in.getAction();
        if (act == null) return;
        String id = in.getStringExtra("id");
        switch (act) {
            case ACTION_FIRE:
                fire(c, in.getStringExtra("kind"), id);
                break;
            case ACTION_STOP:
                AlarmService.stop(c, false);
                break;
            case ACTION_SNOOZE:
                AlarmService.stop(c, true);
                break;
            case ACTION_RING_ADD:
                AlarmService.addMinute(c);
                break;
            case ACTION_TIMER_PAUSE: Store.timerAction(c, id, "pause", null); Scheduler.scheduleAll(c); break;
            case ACTION_TIMER_RESUME: Store.timerAction(c, id, "resume", null); Scheduler.scheduleAll(c); break;
            case ACTION_TIMER_ADD: Store.timerAction(c, id, "add", null); Scheduler.scheduleAll(c); break;
            case ACTION_TIMER_DELETE: Store.timerAction(c, id, "delete", null); Scheduler.scheduleAll(c); break;
            case ACTION_QUICK_TIMER: {
                long secs = in.getLongExtra("secs", 300);
                try {
                    JSONObject t = new JSONObject().put("id", "w" + Long.toString(System.currentTimeMillis(), 36))
                            .put("label", "").put("duration", secs * 1000).put("color", "orange");
                    Store.timerAction(c, null, "start", t.toString());
                } catch (JSONException ignored) {}
                Scheduler.scheduleAll(c);
                break;
            }
            default:
                // BOOT_COMPLETED, TIME_SET, TIMEZONE_CHANGED, MY_PACKAGE_REPLACED, LOCKED_BOOT_COMPLETED
                Scheduler.channels(c);
                Scheduler.scheduleAll(c);
        }
    }

    private static void fire(Context c, String kind, String id) {
        if (kind == null) return;
        Intent ring = new Intent(c, AlarmService.class).putExtra("kind", kind).putExtra("id", id);
        try {
            if ("alarm".equals(kind)) {
                JSONArray alarms = Store.arr(c, "alarms");
                JSONObject a = Store.find(alarms, id);
                if (a == null || !a.optBoolean("enabled")) { Scheduler.scheduleAll(c); return; }
                JSONArray days = a.optJSONArray("days");
                if (days == null || days.length() == 0) a.put("enabled", false);   // engangsalarm
                if (a.optLong("skipUntil") <= System.currentTimeMillis()) a.put("skipUntil", 0);
                Store.putArr(c, "alarms", alarms);
                putAlarm(ring, a);
            } else if ("snooze".equals(kind)) {
                JSONObject sn = Store.snooze(c);
                Store.setSnooze(c, null);
                JSONObject a = sn == null ? null : Store.find(Store.arr(c, "alarms"), sn.optString("alarmId"));
                if (a != null) putAlarm(ring, a);
                else ring.putExtra("label", sn == null ? "" : sn.optString("label")).putExtra("snoozeMin", sn == null ? 9 : sn.optInt("snooze", 9));
                ring.putExtra("kind", "alarm").putExtra("id", sn == null ? "" : sn.optString("alarmId"));
            } else if ("timer".equals(kind)) {
                JSONObject t = Store.find(Store.arr(c, "timers"), id);
                if (t == null || !"running".equals(t.optString("state"))) { Scheduler.scheduleAll(c); return; }
                Store.timerAction(c, id, "done", null);
                String label = t.optString("label");
                ring.putExtra("label", label.isEmpty() ? "Timer · " + Scheduler.fmt(t.optLong("duration")) : label)
                        .putExtra("vibrate", true).putExtra("gradual", false);
            }
        } catch (JSONException ignored) {}
        Scheduler.scheduleAll(c);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ring); else c.startService(ring);
    }

    private static void putAlarm(Intent ring, JSONObject a) {
        ring.putExtra("label", a.optString("label"))
                .putExtra("sound", a.optString("sound"))
                .putExtra("vibrate", a.optBoolean("vibrate", true))
                .putExtra("gradual", a.optBoolean("gradual", true))
                .putExtra("snoozeMin", a.optInt("snooze", 9));
    }
}
