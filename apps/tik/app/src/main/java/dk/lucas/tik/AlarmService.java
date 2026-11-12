package dk.lucas.tik;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Forgrundstjeneste der ringer: lyd (alarmkanal), vibration, fuldskærmsnotifikation og automatisk stop efter 10 min. */
public class AlarmService extends Service {
    static final int NOTIF_ID = 1;
    static final long TIMEOUT = 10 * 60 * 1000L;

    static AlarmService instance;
    static Intent current;

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wake;
    private final Handler h = new Handler(Looper.getMainLooper());
    private float vol = 1f;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent in, int flags, int startId) {
        if (in == null) { stopSelf(); return START_NOT_STICKY; }
        instance = this;
        stopRinging();
        current = in;
        Scheduler.channels(this);
        Notification n = buildNotification(in);
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED);
        else if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTIF_ID, n);

        PowerManager pm = getSystemService(PowerManager.class);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tik:ring");
        wake.acquire(TIMEOUT + 5000);

        startSound(in.getStringExtra("sound"), in.getBooleanExtra("gradual", false));
        if (in.getBooleanExtra("vibrate", true)) startVibration();
        h.postDelayed(this::timeout, TIMEOUT);
        AlarmActivity.refresh();
        return START_NOT_STICKY;
    }

    private Notification buildNotification(Intent in) {
        boolean timer = "timer".equals(in.getStringExtra("kind"));
        String label = in.getStringExtra("label");
        String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());
        String title = timer ? "Tiden er gået" : (label == null || label.isEmpty() ? "Alarm" : label);
        String text = timer ? (label == null ? "" : label) : time;

        Intent full = new Intent(this, AlarmActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fullPI = PendingIntent.getActivity(this, 1, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, Scheduler.CH_ALARM) : new Notification.Builder(this);
        b.setSmallIcon(timer ? R.drawable.ic_stat_timer : R.drawable.ic_stat_alarm)
                .setContentTitle(title)
                .setContentText(text)
                .setColor(Color.parseColor("#F3D867"))
                .setCategory(Notification.CATEGORY_ALARM)
                .setOngoing(true)
                .setAutoCancel(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(fullPI)
                .setFullScreenIntent(fullPI, true);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MAX);
        if (timer) {
            b.addAction(new Notification.Action.Builder(null, "+1 min", Scheduler.actionPI(this, AlarmReceiver.ACTION_RING_ADD, "r")).build());
        } else {
            int sn = in.getIntExtra("snoozeMin", 9);
            b.addAction(new Notification.Action.Builder(null, "Udsæt " + sn + " min", Scheduler.actionPI(this, AlarmReceiver.ACTION_SNOOZE, "r")).build());
        }
        b.addAction(new Notification.Action.Builder(null, "Stop", Scheduler.actionPI(this, AlarmReceiver.ACTION_STOP, "r")).build());
        return b.build();
    }

    private void startSound(String sound, boolean gradual) {
        if ("silent".equals(sound)) return;
        Uri[] tries = new Uri[]{
                sound == null || sound.isEmpty() ? null : Uri.parse(sound),
                RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        };
        for (Uri u : tries) {
            if (u == null) continue;
            try {
                MediaPlayer p = new MediaPlayer();
                p.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                p.setDataSource(this, u);
                p.setLooping(true);
                p.prepare();
                vol = gradual ? 0.08f : 1f;
                p.setVolume(vol, vol);
                p.start();
                player = p;
                if (gradual) h.postDelayed(ramp, 1000);
                return;
            } catch (Exception ignored) {}
        }
    }

    private final Runnable ramp = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            vol = Math.min(1f, vol + 0.025f);   // fuld styrke efter ca. 40 sek.
            try { player.setVolume(vol, vol); } catch (Exception ignored) {}
            if (vol < 1f) h.postDelayed(this, 1000);
        }
    };

    private void startVibration() {
        vibrator = getSystemService(Vibrator.class);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 700, 500, 700, 1200};
        AudioAttributes aa = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0), aa);
        else vibrator.vibrate(pattern, 0, aa);
    }

    private void stopRinging() {
        h.removeCallbacksAndMessages(null);
        if (player != null) { try { player.stop(); } catch (Exception ignored) {} player.release(); player = null; }
        if (vibrator != null) { vibrator.cancel(); vibrator = null; }
        if (wake != null && wake.isHeld()) wake.release();
        wake = null;
    }

    private void timeout() {
        Intent in = current;
        if (in != null && !"timer".equals(in.getStringExtra("kind"))) {
            String label = in.getStringExtra("label");
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, Scheduler.CH_INFO) : new Notification.Builder(this);
            b.setSmallIcon(R.drawable.ic_stat_alarm)
                    .setContentTitle("Mistet alarm")
                    .setContentText((label == null || label.isEmpty() ? "Alarm" : label) + " · " + new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(System.currentTimeMillis() - TIMEOUT)))
                    .setColor(Color.parseColor("#F3D867"))
                    .setAutoCancel(true)
                    .setContentIntent(Scheduler.openPI(this, "alarm"));
            try { getSystemService(NotificationManager.class).notify(3, b.build()); } catch (SecurityException ignored) {}
        }
        stop(this, false);
    }

    @Override
    public void onDestroy() {
        stopRinging();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    /** Stop det der ringer. snooze=true udsætter alarmen. Timere fjernes, når de stoppes. */
    static void stop(Context c, boolean snooze) {
        Intent in = current;
        current = null;
        if (in != null) {
            String kind = in.getStringExtra("kind");
            String id = in.getStringExtra("id");
            if ("timer".equals(kind)) {
                Store.timerAction(c, id, "delete", null);
            } else if (snooze) {
                int min = in.getIntExtra("snoozeMin", 9);
                try {
                    Store.setSnooze(c, new JSONObject()
                            .put("at", System.currentTimeMillis() + min * 60000L)
                            .put("label", in.getStringExtra("label") == null ? "" : in.getStringExtra("label"))
                            .put("alarmId", id == null ? "" : id)
                            .put("snooze", min));
                } catch (JSONException ignored) {}
            }
        }
        AlarmService s = instance;
        if (s != null) {
            s.stopRinging();
            if (Build.VERSION.SDK_INT >= 24) s.stopForeground(Service.STOP_FOREGROUND_REMOVE); else s.stopForeground(true);
            s.stopSelf();
        }
        c.getSystemService(NotificationManager.class).cancel(NOTIF_ID);
        Scheduler.scheduleAll(c);
        AlarmActivity.close();
    }

    /** +1 min på en timer der ringer. */
    static void addMinute(Context c) {
        Intent in = current;
        if (in != null && "timer".equals(in.getStringExtra("kind"))) {
            Store.timerAction(c, in.getStringExtra("id"), "add", null);
            current = null;
        }
        AlarmService s = instance;
        if (s != null) {
            s.stopRinging();
            if (Build.VERSION.SDK_INT >= 24) s.stopForeground(Service.STOP_FOREGROUND_REMOVE); else s.stopForeground(true);
            s.stopSelf();
        }
        c.getSystemService(NotificationManager.class).cancel(NOTIF_ID);
        Scheduler.scheduleAll(c);
        AlarmActivity.close();
    }
}
