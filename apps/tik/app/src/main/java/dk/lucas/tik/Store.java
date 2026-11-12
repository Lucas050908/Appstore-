package dk.lucas.tik;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;

/** Al tilstand ligger her (SharedPreferences + JSON). Web-UI'et og de native dele læser/skriver samme data. */
final class Store {
    private Store() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("tik", Context.MODE_PRIVATE);
    }

    static JSONArray arr(Context c, String key) {
        try { return new JSONArray(prefs(c).getString(key, "[]")); } catch (JSONException e) { return new JSONArray(); }
    }

    static void putArr(Context c, String key, JSONArray a) {
        prefs(c).edit().putString(key, a.toString()).apply();
    }

    static JSONObject settings(Context c) {
        try {
            JSONObject s = new JSONObject(prefs(c).getString("settings", "{}"));
            if (!s.has("theme")) s.put("theme", "dark");
            if (!s.has("snooze")) s.put("snooze", 9);
            if (!s.has("presets")) s.put("presets", new JSONArray("[60,180,300,600,900,1500,2700,3600]"));
            return s;
        } catch (JSONException e) { return new JSONObject(); }
    }

    static JSONArray cities(Context c) {
        if (!prefs(c).contains("cities")) {
            try { return new JSONArray("[\"London\",\"New York\",\"Tokyo\"]"); } catch (JSONException e) { return new JSONArray(); }
        }
        return arr(c, "cities");
    }

    static JSONObject snooze(Context c) {
        try {
            String s = prefs(c).getString("snooze", "");
            if (s.isEmpty()) return null;
            JSONObject o = new JSONObject(s);
            return o.optLong("at") > System.currentTimeMillis() - 60000 ? o : null;
        } catch (JSONException e) { return null; }
    }

    static void setSnooze(Context c, JSONObject o) {
        prefs(c).edit().putString("snooze", o == null ? "" : o.toString()).apply();
    }

    static JSONObject find(JSONArray a, String id) {
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    static JSONArray without(JSONArray a, String id) {
        JSONArray out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !id.equals(o.optString("id"))) out.put(o);
        }
        return out;
    }

    static void upsert(Context c, String key, JSONObject item) {
        JSONArray a = without(arr(c, key), item.optString("id"));
        a.put(item);
        putArr(c, key, a);
    }

    /** Næste gang en alarm ringer (0 = aldrig). Mandag = 0 i "days". Samme logik som nextFire() i JS. */
    static long nextFire(JSONObject a, long now) {
        int h = a.optInt("h"), m = a.optInt("m");
        JSONArray days = a.optJSONArray("days");
        long skip = a.optLong("skipUntil", 0);
        Calendar base = Calendar.getInstance();
        base.setTimeInMillis(now);
        for (int i = 0; i <= 8; i++) {
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(base.get(Calendar.YEAR), base.get(Calendar.MONTH), base.get(Calendar.DAY_OF_MONTH), h, m, 0);
            c.add(Calendar.DAY_OF_MONTH, i);
            long t = c.getTimeInMillis();
            if (t <= now) continue;
            if (days != null && days.length() > 0) {
                int wd = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7;
                boolean ok = false;
                for (int j = 0; j < days.length(); j++) if (days.optInt(j, -1) == wd) { ok = true; break; }
                if (!ok) continue;
            }
            if (skip > 0 && t <= skip) continue;
            return t;
        }
        return 0;
    }

    /** Tidligste aktive alarm (inkl. udsættelse). Returnerer {at, label} eller null. */
    static JSONObject nextAlarm(Context c) {
        long now = System.currentTimeMillis(), best = 0;
        String label = "";
        JSONArray a = arr(c, "alarms");
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null || !o.optBoolean("enabled")) continue;
            long t = nextFire(o, now);
            if (t > 0 && (best == 0 || t < best)) { best = t; label = o.optString("label"); }
        }
        JSONObject sn = snooze(c);
        if (sn != null && sn.optLong("at") > now && (best == 0 || sn.optLong("at") < best)) {
            best = sn.optLong("at");
            label = sn.optString("label");
        }
        if (best == 0) return null;
        try { return new JSONObject().put("at", best).put("label", label); } catch (JSONException e) { return null; }
    }

    /** Timer-handlinger (start/pause/resume/add/reset/delete/done). */
    static void timerAction(Context c, String id, String action, String json) {
        JSONArray ts = arr(c, "timers");
        long now = System.currentTimeMillis();
        try {
            if ("start".equals(action)) {
                JSONObject t = new JSONObject(json);
                long d = Math.max(1000, t.optLong("duration"));
                t.put("duration", d).put("state", "running").put("endAt", now + d).put("remaining", d);
                ts.put(t);
                putArr(c, "timers", ts);
                return;
            }
            JSONObject t = find(ts, id);
            if (t == null) return;
            String st = t.optString("state");
            switch (action) {
                case "pause":
                    if ("running".equals(st)) t.put("remaining", Math.max(0, t.optLong("endAt") - now)).put("state", "paused");
                    break;
                case "resume":
                    if ("paused".equals(st)) t.put("endAt", now + t.optLong("remaining")).put("state", "running");
                    break;
                case "add":
                    t.put("duration", t.optLong("duration") + 60000);
                    if ("running".equals(st)) t.put("endAt", t.optLong("endAt") + 60000);
                    else if ("done".equals(st)) t.put("state", "running").put("endAt", now + 60000);
                    else t.put("remaining", t.optLong("remaining") + 60000);
                    break;
                case "reset":
                    t.put("state", "paused").put("remaining", t.optLong("duration"));
                    break;
                case "done":
                    t.put("state", "done").put("remaining", 0);
                    break;
                case "delete":
                    ts = without(ts, id);
                    putArr(c, "timers", ts);
                    return;
            }
            putArr(c, "timers", ts);
        } catch (JSONException ignored) {}
    }
}
