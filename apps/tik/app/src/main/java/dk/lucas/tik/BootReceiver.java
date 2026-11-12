package dk.lucas.tik;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Planlægger alt igen efter genstart, opdatering af appen eller ændring af tid/tidszone. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent in) {
        Scheduler.channels(c);
        Scheduler.scheduleAll(c);
    }
}
