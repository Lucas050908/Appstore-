package dk.lucas.vagt;

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

/** Generiske post-it-widgets. Web-delen skubber {title, value, sub, lines[], hash, quickHash} via App.widget(). */
final class Widgets {
    private Widgets() {}

    static PendingIntent open(Context c, String hash) {
        Intent i = new Intent(c, MainActivity.class).putExtra("hash", hash == null ? "" : hash)
                .setData(Uri.parse("open://w/" + Uri.encode(hash == null ? "" : hash)))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static JSONObject snap(Context c) {
        try { return new JSONObject(c.getSharedPreferences("app", Context.MODE_PRIVATE).getString("widget", "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        update(c, m, WidgetNote.class);
        update(c, m, WidgetQuick.class);
    }

    static void update(Context c, AppWidgetManager m, Class<?> cls) {
        int[] ids = m.getAppWidgetIds(new ComponentName(c, cls));
        if (ids == null || ids.length == 0) return;
        JSONObject s = snap(c);
        RemoteViews v;
        if (cls == WidgetQuick.class) {
            v = new RemoteViews(c.getPackageName(), R.layout.widget_quick);
            v.setOnClickPendingIntent(R.id.root, open(c, s.optString("quickHash", "start")));
        } else {
            v = new RemoteViews(c.getPackageName(), R.layout.widget_note);
            v.setTextViewText(R.id.title, s.optString("title", "Vagt"));
            v.setTextViewText(R.id.value, s.optString("value", "Åbn Vagt"));
            String sub = s.optString("sub", "");
            v.setTextViewText(R.id.sub, sub);
            v.setViewVisibility(R.id.sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
            JSONArray lines = s.optJSONArray("lines");
            int[] ids2 = {R.id.l1, R.id.l2, R.id.l3};
            for (int i = 0; i < 3; i++) {
                String t = lines != null && i < lines.length() ? lines.optString(i) : "";
                v.setTextViewText(ids2[i], t);
                v.setViewVisibility(ids2[i], t.isEmpty() ? View.GONE : View.VISIBLE);
            }
            v.setOnClickPendingIntent(R.id.root, open(c, s.optString("hash", "")));
            v.setOnClickPendingIntent(R.id.quick, open(c, s.optString("quickHash", "start")));
        }
        m.updateAppWidget(ids, v);
    }
}
