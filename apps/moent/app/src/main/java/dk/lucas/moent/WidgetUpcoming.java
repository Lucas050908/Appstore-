package dk.lucas.moent;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class WidgetUpcoming extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        MoentWidgets.update(c, m, WidgetUpcoming.class);
    }
}
