package com.chatbi.exporter.core;

public final class ExportRequest {
    private final String themeOverride;
    private final boolean strictValidation;

    public ExportRequest(String themeOverride, boolean strictValidation) {
        this.themeOverride = themeOverride;
        this.strictValidation = strictValidation;
    }

    public String themeOverride() {
        return themeOverride;
    }

    public boolean strictValidation() {
        return strictValidation;
    }

    public static ExportRequest defaults() {
        return new ExportRequest(null, false);
    }
}
