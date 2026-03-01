package com.chatbi.exporter.chart;

import org.apache.poi.xddf.usermodel.chart.LegendPosition;

import java.util.List;
import java.util.Map;

public final class ChartOptionPatchAdapter {
    public String resolveTitle(ChartSpec spec) {
        String fromPatch = string(path(spec.optionPatch(), "title", "text"));
        if (!fromPatch.isBlank()) {
            return fromPatch;
        }
        return safe(spec.title(), "图表");
    }

    public boolean resolveLegendShow(ChartSpec spec) {
        Boolean fromPatch = bool(path(spec.optionPatch(), "legend", "show"));
        if (fromPatch != null) {
            return fromPatch;
        }
        return spec.legendShow();
    }

    public LegendPosition resolveLegendPosition(ChartSpec spec) {
        String pos = spec.legendPos();
        Object legendObj = spec.optionPatch().get("legend");
        if (legendObj instanceof Map<?, ?> legend) {
            if (legend.containsKey("left")) {
                pos = "left";
            } else if (legend.containsKey("right")) {
                pos = "right";
            } else if (legend.containsKey("bottom")) {
                pos = "bottom";
            } else if (legend.containsKey("top")) {
                pos = "top";
            }
        }
        String normalized = pos == null ? "top" : pos.trim().toLowerCase();
        return switch (normalized) {
            case "left" -> LegendPosition.LEFT;
            case "right" -> LegendPosition.RIGHT;
            case "bottom" -> LegendPosition.BOTTOM;
            default -> LegendPosition.TOP;
        };
    }

    public String resolveXAxisTitle(ChartSpec spec) {
        String fromPatch = string(path(spec.optionPatch(), "xAxis", "name"));
        if (fromPatch.isBlank()) {
            fromPatch = string(pathFromArray(spec.optionPatch(), "xAxis", 0, "name"));
        }
        if (!fromPatch.isBlank()) {
            return fromPatch;
        }
        if (!spec.xAxisTitle().isBlank()) {
            return spec.xAxisTitle();
        }
        return safe(spec.dimensionField(), "x");
    }

    public String resolveYAxisTitle(ChartSpec spec) {
        String fromPatch = string(path(spec.optionPatch(), "yAxis", "name"));
        if (fromPatch.isBlank()) {
            fromPatch = string(pathFromArray(spec.optionPatch(), "yAxis", 0, "name"));
        }
        if (!fromPatch.isBlank()) {
            return fromPatch;
        }
        if (!spec.yAxisTitle().isBlank()) {
            return spec.yAxisTitle();
        }
        if (!spec.measureFields().isEmpty()) {
            return String.join(", ", spec.measureFields());
        }
        return "value";
    }

    public String resolveSeriesTypeHint(ChartSpec spec) {
        String direct = string(path(spec.optionPatch(), "series", "type"));
        if (!direct.isBlank()) {
            return direct;
        }
        String fromArray = string(pathFromArray(spec.optionPatch(), "series", 0, "type"));
        if (!fromArray.isBlank()) {
            return fromArray;
        }
        return "";
    }

    @SuppressWarnings("unchecked")
    private Object path(Map<String, Object> root, String key1, String key2) {
        Object level1 = root.get(key1);
        if (level1 instanceof Map<?, ?> map) {
            return ((Map<String, Object>) map).get(key2);
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Object pathFromArray(Map<String, Object> root, String key, int index, String childKey) {
        Object level1 = root.get(key);
        if (!(level1 instanceof List<?> list) || list.size() <= index) {
            return null;
        }
        Object item = list.get(index);
        if (item instanceof Map<?, ?> map) {
            return ((Map<String, Object>) map).get(childKey);
        }
        return null;
    }

    private String string(Object value) {
        if (value == null) {
            return "";
        }
        String text = String.valueOf(value);
        return text == null ? "" : text;
    }

    private Boolean bool(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value instanceof String s) {
            if ("true".equalsIgnoreCase(s)) {
                return true;
            }
            if ("false".equalsIgnoreCase(s)) {
                return false;
            }
        }
        return null;
    }

    private String safe(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
