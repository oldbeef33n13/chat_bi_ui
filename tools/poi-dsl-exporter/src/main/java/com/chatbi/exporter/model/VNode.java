package com.chatbi.exporter.model;

import java.util.Collections;
import java.util.List;
import java.util.Map;

public class VNode {
    public String id;
    public String kind;
    public String name;
    public Map<String, Object> layout;
    public Map<String, Object> style;
    public Map<String, Object> data;
    public Map<String, Object> props;
    public List<VNode> children;

    public List<VNode> childrenOrEmpty() {
        return children == null ? Collections.emptyList() : children;
    }

    public Map<String, Object> propsOrEmpty() {
        return props == null ? Collections.emptyMap() : props;
    }

    public Map<String, Object> layoutOrEmpty() {
        return layout == null ? Collections.emptyMap() : layout;
    }

    public Map<String, Object> styleOrEmpty() {
        return style == null ? Collections.emptyMap() : style;
    }

    public String propString(String key, String fallback) {
        Object value = propsOrEmpty().get(key);
        return value == null ? fallback : String.valueOf(value);
    }

    public boolean propBoolean(String key, boolean fallback) {
        Object value = propsOrEmpty().get(key);
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
        return fallback;
    }

    public double layoutDouble(String key, double fallback) {
        return asDouble(layoutOrEmpty().get(key), fallback);
    }

    public double styleDouble(String key, double fallback) {
        return asDouble(styleOrEmpty().get(key), fallback);
    }

    public static String asString(Object value, String fallback) {
        return value == null ? fallback : String.valueOf(value);
    }

    public static boolean asBoolean(Object value, boolean fallback) {
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
        return fallback;
    }

    public static double asDouble(Object value, double fallback) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        if (value instanceof String s) {
            try {
                return Double.parseDouble(s);
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }
}
