package com.chatbi.exporter.chart;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ChartSpec {
    private final String title;
    private final String chartType;
    private final boolean legendShow;
    private final String legendPos;
    private final String xAxisTitle;
    private final String yAxisTitle;
    private final String dimensionField;
    private final List<String> measureFields;
    private final String seriesField;
    private final String aggregate;
    private final String secondAxisField;
    private final boolean stacked;
    private final boolean smooth;
    private final int filtersCount;
    private final int computedFieldsCount;
    private final List<ChartBinding> bindings;
    private final List<Map<String, Object>> sampleRows;
    private final List<String> palette;
    private final Map<String, Object> optionPatch;

    public ChartSpec(
            String title,
            String chartType,
            String dimensionField,
            List<String> measureFields,
            String seriesField,
            String aggregate,
            String secondAxisField,
            boolean stacked,
            boolean smooth,
            int filtersCount,
            int computedFieldsCount,
            List<ChartBinding> bindings,
            List<Map<String, Object>> sampleRows,
            List<String> palette
    ) {
        this(
                title,
                chartType,
                true,
                "top",
                "",
                "",
                dimensionField,
                measureFields,
                seriesField,
                aggregate,
                secondAxisField,
                stacked,
                smooth,
                filtersCount,
                computedFieldsCount,
                bindings,
                sampleRows,
                palette,
                Collections.emptyMap()
        );
    }

    public ChartSpec(
            String title,
            String chartType,
            boolean legendShow,
            String legendPos,
            String xAxisTitle,
            String yAxisTitle,
            String dimensionField,
            List<String> measureFields,
            String seriesField,
            String aggregate,
            String secondAxisField,
            boolean stacked,
            boolean smooth,
            int filtersCount,
            int computedFieldsCount,
            List<ChartBinding> bindings,
            List<Map<String, Object>> sampleRows,
            List<String> palette,
            Map<String, Object> optionPatch
    ) {
        this.title = title;
        this.chartType = chartType;
        this.legendShow = legendShow;
        this.legendPos = legendPos == null ? "top" : legendPos;
        this.xAxisTitle = xAxisTitle == null ? "" : xAxisTitle;
        this.yAxisTitle = yAxisTitle == null ? "" : yAxisTitle;
        this.dimensionField = dimensionField;
        this.measureFields = measureFields == null ? Collections.emptyList() : List.copyOf(measureFields);
        this.seriesField = seriesField;
        this.aggregate = aggregate;
        this.secondAxisField = secondAxisField;
        this.stacked = stacked;
        this.smooth = smooth;
        this.filtersCount = filtersCount;
        this.computedFieldsCount = computedFieldsCount;
        this.bindings = bindings == null ? Collections.emptyList() : List.copyOf(bindings);
        this.sampleRows = sampleRows == null ? Collections.emptyList() : List.copyOf(sampleRows);
        this.palette = palette == null ? Collections.emptyList() : List.copyOf(palette);
        if (optionPatch == null || optionPatch.isEmpty()) {
            this.optionPatch = Collections.emptyMap();
        } else {
            this.optionPatch = Collections.unmodifiableMap(new LinkedHashMap<>(optionPatch));
        }
    }

    public String title() {
        return title;
    }

    public String chartType() {
        return chartType;
    }

    public boolean legendShow() {
        return legendShow;
    }

    public String legendPos() {
        return legendPos;
    }

    public String xAxisTitle() {
        return xAxisTitle;
    }

    public String yAxisTitle() {
        return yAxisTitle;
    }

    public String dimensionField() {
        return dimensionField;
    }

    public List<String> measureFields() {
        return measureFields;
    }

    public String seriesField() {
        return seriesField;
    }

    public String aggregate() {
        return aggregate;
    }

    public String secondAxisField() {
        return secondAxisField;
    }

    public boolean stacked() {
        return stacked;
    }

    public boolean smooth() {
        return smooth;
    }

    public int filtersCount() {
        return filtersCount;
    }

    public int computedFieldsCount() {
        return computedFieldsCount;
    }

    public List<ChartBinding> bindings() {
        return bindings;
    }

    public List<Map<String, Object>> sampleRows() {
        return sampleRows;
    }

    public List<String> palette() {
        return palette;
    }

    public Map<String, Object> optionPatch() {
        return optionPatch;
    }

    public boolean dualAxis() {
        return secondAxisField != null && !secondAxisField.isBlank();
    }

    public int complexityScore() {
        int score = 0;
        score += Math.max(0, measureFields.size() - 1);
        score += dualAxis() ? 2 : 0;
        score += seriesField != null && !seriesField.isBlank() ? 1 : 0;
        score += Math.min(3, filtersCount);
        score += Math.min(3, computedFieldsCount);
        score += stacked ? 1 : 0;
        return score;
    }

    public String complexityLevel() {
        int score = complexityScore();
        if (score >= 7) {
            return "enterprise";
        }
        if (score >= 4) {
            return "advanced";
        }
        if (score >= 2) {
            return "standard";
        }
        return "simple";
    }

    public String bindingHint() {
        if (bindings.isEmpty()) {
            return "字段绑定: -";
        }
        StringBuilder sb = new StringBuilder("字段绑定: ");
        for (int i = 0; i < bindings.size(); i++) {
            ChartBinding binding = bindings.get(i);
            if (i > 0) {
                sb.append(", ");
            }
            String aggPrefix = binding.agg() == null || binding.agg().isBlank()
                    ? ""
                    : binding.agg() + "(";
            String aggSuffix = binding.agg() == null || binding.agg().isBlank() ? "" : ")";
            sb.append(binding.role()).append(":").append(aggPrefix).append(binding.field()).append(aggSuffix);
        }
        return sb.toString();
    }
}
