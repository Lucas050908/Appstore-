package dk.lucas.moent;

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

/** Tegner Mønts widgets ud fra det snapshot web-delen gemmer. */
final class MoentWidgets {
    private MoentWidgets() {}

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        update(c, m, WidgetMonth.class);
        update(c, m, WidgetAdd.class);
        update(c, m, WidgetCats.class);
        update(c, m, WidgetUpcoming.class);
    }

    static PendingIntent open(Context c, String tab) {
        Intent i = new Intent(c, MainActivity.class).putExtra("tab", tab).setData(Uri.parse("moent://open/" + tab))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void update(Context c, AppWidgetManager m, Class<?> cls) {
        int[] ids = m.getAppWidgetIds(new ComponentName(c, cls));
        if (ids == null || ids.length == 0) return;
        JSONObject s = Store.snapshot(c);
        RemoteViews v;
        if (cls == WidgetMonth.class) v = month(c, s);
        else if (cls == WidgetAdd.class) {
            v = new RemoteViews(c.getPackageName(), R.layout.widget_add);
            v.setOnClickPendingIntent(R.id.root, open(c, "add"));
        } else if (cls == WidgetCats.class) v = cats(c, s);
        else v = upcoming(c, s);
        m.updateAppWidget(ids, v);
    }

    private static RemoteViews month(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_month);
        long spent = s.optLong("spent"), budget = s.optLong("budget");
        String to = s.optString("to", "");
        boolean stale = to.isEmpty() || Store.daysUntil(to) < 0;
        if (stale) {
            v.setTextViewText(R.id.k, "Ny måned");
            v.setTextViewText(R.id.v, "Åbn Mønt");
            v.setTextViewText(R.id.w, "for at se den nye periode");
            v.setViewVisibility(R.id.bar, View.GONE);
        } else if (budget > 0) {
            long left = budget - spent;
            long days = Math.max(1, Store.daysUntil(to) + 1);
            v.setTextViewText(R.id.k, "Tilbage · " + s.optString("label"));
            v.setTextViewText(R.id.v, Store.kr(left));
            v.setTextViewText(R.id.w, left > 0 ? Store.kr(left / days) + " om dagen i " + days + (days == 1 ? " dag" : " dage") : "Brugt " + Store.kr(spent) + " af " + Store.kr(budget));
            v.setViewVisibility(R.id.bar, View.VISIBLE);
            v.setProgressBar(R.id.bar, 1000, (int) Math.min(1000, spent * 1000 / budget), false);
        } else {
            v.setTextViewText(R.id.k, "Brugt · " + s.optString("label"));
            v.setTextViewText(R.id.v, Store.kr(spent));
            v.setTextViewText(R.id.w, "Indtægter " + Store.kr(s.optLong("income")));
            v.setViewVisibility(R.id.bar, View.GONE);
        }
        v.setOnClickPendingIntent(R.id.root, open(c, "home"));
        v.setOnClickPendingIntent(R.id.add, open(c, "add"));
        return v;
    }

    private static RemoteViews cats(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_cats);
        JSONArray top = s.optJSONArray("top");
        int[] rows = {R.id.r1, R.id.r2, R.id.r3}, names = {R.id.n1, R.id.n2, R.id.n3}, amts = {R.id.a1, R.id.a2, R.id.a3}, bars = {R.id.p1, R.id.p2, R.id.p3};
        int n = top == null ? 0 : top.length();
        for (int i = 0; i < 3; i++) {
            if (i >= n) { v.setViewVisibility(rows[i], View.GONE); continue; }
            JSONObject t = top.optJSONObject(i);
            v.setViewVisibility(rows[i], View.VISIBLE);
            v.setTextViewText(names[i], t.optString("icon") + "  " + t.optString("name"));
            long sp = t.optLong("spent"), b = t.optLong("budget");
            v.setTextViewText(amts[i], b > 0 ? Store.kr(sp) + " / " + Store.kr(b) : Store.kr(sp));
            v.setViewVisibility(bars[i], b > 0 ? View.VISIBLE : View.GONE);
            if (b > 0) v.setProgressBar(bars[i], 1000, (int) Math.min(1000, sp * 1000 / b), false);
        }
        v.setViewVisibility(R.id.empty, n == 0 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.root, open(c, "budget"));
        return v;
    }

    private static RemoteViews upcoming(Context c, JSONObject s) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_upcoming);
        JSONArray up = s.optJSONArray("upcoming");
        int[] rows = {R.id.r1, R.id.r2, R.id.r3}, names = {R.id.n1, R.id.n2, R.id.n3}, dates = {R.id.d1, R.id.d2, R.id.d3}, amts = {R.id.a1, R.id.a2, R.id.a3};
        int shown = 0;
        for (int i = 0; up != null && i < up.length() && shown < 3; i++) {
            JSONObject r = up.optJSONObject(i);
            if (r == null || Store.daysUntil(r.optString("date")) < 0) continue;
            v.setViewVisibility(rows[shown], View.VISIBLE);
            v.setTextViewText(names[shown], r.optString("name"));
            v.setTextViewText(dates[shown], Store.dayLabel(r.optString("date")));
            v.setTextViewText(amts[shown], ("in".equals(r.optString("type")) ? "+" : "") + Store.kr(r.optLong("amount")));
            shown++;
        }
        for (int i = shown; i < 3; i++) v.setViewVisibility(rows[i], View.GONE);
        v.setViewVisibility(R.id.empty, shown == 0 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.root, open(c, "fixed"));
        return v;
    }
}
