package dk.lucas.tik;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextClock;
import android.widget.TextView;

import java.lang.ref.WeakReference;

/** Fuldskærm der vises når en alarm/timer ringer – også oven på låseskærmen. */
public class AlarmActivity extends Activity {
    private static WeakReference<AlarmActivity> ref = new WeakReference<>(null);

    private TextView kindView, labelView, leftBtn;

    static void close() {
        AlarmActivity a = ref.get();
        if (a != null) a.runOnUiThread(a::finish);
    }

    static void refresh() {
        AlarmActivity a = ref.get();
        if (a != null) a.runOnUiThread(a::bind);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#12110F"));
        getWindow().setNavigationBarColor(Color.parseColor("#12110F"));
        ref = new WeakReference<>(this);

        Typeface hand = Build.VERSION.SDK_INT >= 26 ? getResources().getFont(R.font.caveat) : Typeface.DEFAULT_BOLD;
        Typeface serif = Typeface.create(Typeface.SERIF, Typeface.BOLD);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(Color.parseColor("#12110F"));
        root.setPadding(dp(28), dp(90), dp(28), dp(56));

        // post-it med tid
        LinearLayout note = new LinearLayout(this);
        note.setOrientation(LinearLayout.VERTICAL);
        note.setGravity(Gravity.CENTER_HORIZONTAL);
        note.setPadding(dp(20), dp(26), dp(20), dp(26));
        note.setBackground(postit("#F3D867"));
        note.setRotation(-1.2f);
        note.setElevation(dp(10));

        kindView = text(hand, 30, "#5A5446");
        note.addView(kindView);
        TextClock clock = new TextClock(this);
        clock.setFormat24Hour("HH:mm");
        clock.setFormat12Hour("h:mm");
        clock.setTypeface(serif);
        clock.setTextColor(Color.parseColor("#1D1B17"));
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 88);
        clock.setIncludeFontPadding(false);
        note.addView(clock);
        labelView = text(hand, 34, "#1D1B17");
        note.addView(labelView);
        root.addView(note, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        View spacer = new View(this);
        root.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        leftBtn = button("Udsæt", "#F3C08C", "#1D1B17", serif);
        TextView stop = button("Stop", "#1D1B17", "#F3D867", serif);
        stop.setBackground(postit("#F3D867"));
        stop.setTextColor(Color.parseColor("#1D1B17"));
        leftBtn.setBackground(postit("#2F2C26"));
        leftBtn.setTextColor(Color.parseColor("#EFEAE0"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(76));
        lp.bottomMargin = dp(16);
        root.addView(leftBtn, lp);
        root.addView(stop, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(76)));

        leftBtn.setOnClickListener(v -> {
            Intent in = AlarmService.current;
            if (in != null && "timer".equals(in.getStringExtra("kind"))) AlarmService.addMinute(this);
            else AlarmService.stop(this, true);
            finish();
        });
        stop.setOnClickListener(v -> {
            AlarmService.stop(this, false);
            if (Build.VERSION.SDK_INT >= 26) {
                KeyguardManager km = getSystemService(KeyguardManager.class);
                if (km != null && km.isKeyguardLocked()) { finish(); return; }
            }
            finish();
        });
        setContentView(root);
        bind();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (AlarmService.current == null) finish();
    }

    @Override
    public void onBackPressed() {
        // Tilbage-knappen må ikke slukke alarmen ved et uheld – appen går bare i baggrunden.
        moveTaskToBack(true);
    }

    private void bind() {
        Intent in = AlarmService.current;
        if (in == null) return;
        boolean timer = "timer".equals(in.getStringExtra("kind"));
        String label = in.getStringExtra("label");
        kindView.setText(timer ? "Tiden er gået" : "Alarm");
        labelView.setText(label == null ? "" : label);
        labelView.setVisibility(label == null || label.isEmpty() ? View.GONE : View.VISIBLE);
        leftBtn.setText(timer ? "+1 min" : "Udsæt " + in.getIntExtra("snoozeMin", 9) + " min");
    }

    private TextView text(Typeface tf, int sp, String color) {
        TextView t = new TextView(this);
        t.setTypeface(tf);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(Color.parseColor(color));
        t.setGravity(Gravity.CENTER);
        return t;
    }

    private TextView button(String label, String bg, String fg, Typeface tf) {
        TextView t = text(tf, 24, fg);
        t.setText(label);
        t.setBackground(postit(bg));
        t.setElevation(dp(6));
        t.setClickable(true);
        t.setFocusable(true);
        return t;
    }

    private GradientDrawable postit(String color) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(Color.parseColor(color));
        float r = dp(4), big = dp(22);
        d.setCornerRadii(new float[]{r, r, r, r, big, big, r, r});
        return d;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
