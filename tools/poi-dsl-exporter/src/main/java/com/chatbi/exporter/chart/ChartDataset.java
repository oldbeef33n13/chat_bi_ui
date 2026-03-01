package com.chatbi.exporter.chart;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ChartDataset {
    private final String categoryLabel;
    private final List<String> categories;
    private final LinkedHashMap<String, List<Double>> series;

    public ChartDataset(String categoryLabel, List<String> categories, LinkedHashMap<String, List<Double>> series) {
        this.categoryLabel = categoryLabel;
        this.categories = categories == null ? Collections.emptyList() : List.copyOf(categories);
        this.series = series == null ? new LinkedHashMap<>() : new LinkedHashMap<>(series);
    }

    public String categoryLabel() {
        return categoryLabel;
    }

    public List<String> categories() {
        return categories;
    }

    public LinkedHashMap<String, List<Double>> series() {
        return new LinkedHashMap<>(series);
    }

    public boolean hasCategories() {
        return !categories.isEmpty();
    }

    public boolean hasSeries() {
        return !series.isEmpty();
    }

    public boolean isRenderable() {
        if (!hasCategories() || !hasSeries()) {
            return false;
        }
        for (List<Double> values : series.values()) {
            if (values == null || values.isEmpty()) {
                continue;
            }
            for (Double value : values) {
                if (value != null) {
                    return true;
                }
            }
        }
        return false;
    }

    public String[] categoryArray() {
        return categories.toArray(String[]::new);
    }

    public List<Map.Entry<String, Double[]>> seriesArrays() {
        List<Map.Entry<String, Double[]>> entries = new ArrayList<>();
        for (Map.Entry<String, List<Double>> entry : series.entrySet()) {
            Double[] values = new Double[categories.size()];
            for (int i = 0; i < categories.size(); i++) {
                Double value = i < entry.getValue().size() ? entry.getValue().get(i) : null;
                values[i] = value == null ? 0.0 : value;
            }
            entries.add(Map.entry(entry.getKey(), values));
        }
        return entries;
    }
}
