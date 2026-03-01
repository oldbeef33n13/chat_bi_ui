package com.chatbi.exporter.chart;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

public final class ChartTypeCatalog {
    private static final Set<String> WEB_TYPES;

    static {
        LinkedHashSet<String> types = new LinkedHashSet<>();
        types.add("auto");
        types.add("line");
        types.add("bar");
        types.add("pie");
        types.add("scatter");
        types.add("radar");
        types.add("heatmap");
        types.add("kline");
        types.add("boxplot");
        types.add("sankey");
        types.add("graph");
        types.add("treemap");
        types.add("sunburst");
        types.add("parallel");
        types.add("funnel");
        types.add("gauge");
        types.add("calendar");
        types.add("custom");
        types.add("combo");
        WEB_TYPES = Collections.unmodifiableSet(types);
    }

    private ChartTypeCatalog() {
    }

    public static Set<String> webTypes() {
        return WEB_TYPES;
    }

    public static String normalize(String chartType) {
        if (chartType == null || chartType.isBlank()) {
            return "line";
        }
        String normalized = chartType.trim().toLowerCase(Locale.ROOT);
        if ("auto".equals(normalized)) {
            return "line";
        }
        return normalized;
    }

    public static boolean isWebChartType(String chartType) {
        return WEB_TYPES.contains(normalize(chartType)) || "auto".equalsIgnoreCase(chartType);
    }
}
