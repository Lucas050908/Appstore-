package dk.lucas.skal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import com.termux.terminal.TerminalSession;
import com.termux.terminal.TerminalSessionClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Holder sessionerne i live, også når appen er i baggrunden. */
public class TermService extends Service {
    static final String ACTION_STOP = "dk.lucas.skal.STOP";
    static final String ACTION_WAKELOCK = "dk.lucas.skal.WAKELOCK";
    private static final String CHANNEL = "sessions";
    private static final int NOTIF_ID = 1;

    final List<TerminalSession> sessions = new ArrayList<>();
    final Map<TerminalSession, String> names = new HashMap<>();
    private PowerManager.WakeLock wakeLock;
    private ShellEnv shellEnv;

    /** Videresender til aktiviteten, når den er åben. */
    final Relay relay = new Relay();

    public class LocalBinder extends Binder {
        TermService service() { return TermService.this; }
    }

    private final IBinder binder = new LocalBinder();

    @Override public void onCreate() {
        super.onCreate();
        shellEnv = new ShellEnv(this);
        shellEnv.setup();
        startForegroundCompat();
    }

    @Override public IBinder onBind(Intent intent) { return binder; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(a)) {
            killAll();
            if (relay.target != null) relay.target.onServiceStopped();
            stopSelf();
            return START_NOT_STICKY;
        } else if (ACTION_WAKELOCK.equals(a)) {
            toggleWakeLock();
        }
        updateNotification();
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        killAll();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    TerminalSession createSession(String cwd) {
        if (cwd == null || !new java.io.File(cwd).isDirectory()) cwd = shellEnv.home.getAbsolutePath();
        TerminalSession s = new TerminalSession(ShellEnv.SHELL, cwd, new String[]{"-sh"},
            shellEnv.env(80), Prefs.scrollback(this), relay);
        sessions.add(s);
        updateNotification();
        return s;
    }

    void removeSession(TerminalSession s) {
        s.finishIfRunning();
        sessions.remove(s);
        names.remove(s);
        updateNotification();
    }

    void killAll() {
        for (TerminalSession s : new ArrayList<>(sessions)) s.finishIfRunning();
        sessions.clear();
        names.clear();
    }

    String displayName(TerminalSession s) {
        String n = names.get(s);
        if (n != null && !n.isEmpty()) return n;
        String t = s.getTitle();
        if (t != null && !t.isEmpty()) return t;
        return "sh";
    }

    boolean isWakeLocked() { return wakeLock != null && wakeLock.isHeld(); }

    void toggleWakeLock() {
        if (isWakeLocked()) {
            wakeLock.release();
        } else {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "skal:sessions");
            wakeLock.acquire();
        }
        updateNotification();
    }

    // ---- notifikation ----

    private void startForegroundCompat() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Kørende sessioner", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        startForeground(NOTIF_ID, buildNotification());
    }

    void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(NOTIF_ID, buildNotification());
    }

    private Notification buildNotification() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent piOpen = PendingIntent.getActivity(this, 0, open, flags);
        PendingIntent piStop = PendingIntent.getService(this, 1, new Intent(this, TermService.class).setAction(ACTION_STOP), flags);
        PendingIntent piWake = PendingIntent.getService(this, 2, new Intent(this, TermService.class).setAction(ACTION_WAKELOCK), flags);

        int n = sessions.size();
        String text = n == 1 ? "1 session kører" : n + " sessioner kører";
        if (isWakeLocked()) text += " · holdes vågen";

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Skal")
            .setContentText(text)
            .setContentIntent(piOpen)
            .setOngoing(true)
            .setShowWhen(false)
            .setColor(0xFF5EE6A0)
            .addAction(new Notification.Action.Builder(null, "Afslut", piStop).build())
            .addAction(new Notification.Action.Builder(null, isWakeLocked() ? "Slip vågen" : "Hold vågen", piWake).build());
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        return b.build();
    }

    // ---- klient-relæ ----

    interface Target extends TerminalSessionClient {
        void onServiceStopped();
    }

    final class Relay implements TerminalSessionClient {
        Target target;

        @Override public void onTextChanged(TerminalSession s) { if (target != null) target.onTextChanged(s); }
        @Override public void onTitleChanged(TerminalSession s) { if (target != null) target.onTitleChanged(s); }
        @Override public void onSessionFinished(TerminalSession s) { if (target != null) target.onSessionFinished(s); }
        @Override public void onCopyTextToClipboard(TerminalSession s, String t) { if (target != null) target.onCopyTextToClipboard(s, t); }
        @Override public void onPasteTextFromClipboard(TerminalSession s) { if (target != null) target.onPasteTextFromClipboard(s); }
        @Override public void onBell(TerminalSession s) { if (target != null) target.onBell(s); }
        @Override public void onColorsChanged(TerminalSession s) { if (target != null) target.onColorsChanged(s); }
        @Override public void onTerminalCursorStateChange(boolean state) { if (target != null) target.onTerminalCursorStateChange(state); }
        @Override public Integer getTerminalCursorStyle() { return Prefs.cursorStyle(TermService.this); }
        @Override public void logError(String tag, String m) { Log.e(tag, m); }
        @Override public void logWarn(String tag, String m) { Log.w(tag, m); }
        @Override public void logInfo(String tag, String m) { Log.i(tag, m); }
        @Override public void logDebug(String tag, String m) { Log.d(tag, m); }
        @Override public void logVerbose(String tag, String m) { Log.v(tag, m); }
        @Override public void logStackTraceWithMessage(String tag, String m, Exception e) { Log.e(tag, m, e); }
        @Override public void logStackTrace(String tag, Exception e) { Log.e(tag, "fejl", e); }
    }
}
