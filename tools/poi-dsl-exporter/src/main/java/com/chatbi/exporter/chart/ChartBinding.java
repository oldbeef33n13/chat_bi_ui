package com.chatbi.exporter.chart;

public final class ChartBinding {
    private final String role;
    private final String field;
    private final String agg;

    public ChartBinding(String role, String field, String agg) {
        this.role = role;
        this.field = field;
        this.agg = agg;
    }

    public String role() {
        return role;
    }

    public String field() {
        return field;
    }

    public String agg() {
        return agg;
    }
}
