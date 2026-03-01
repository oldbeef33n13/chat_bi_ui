package com.chatbi.exporter.core;

public enum ExportTarget {
    DOCX,
    PPTX;

    public static ExportTarget fromCli(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Target is blank.");
        }
        String normalized = value.trim().toLowerCase();
        return switch (normalized) {
            case "docx" -> DOCX;
            case "pptx" -> PPTX;
            default -> throw new IllegalArgumentException("Unsupported target: " + value);
        };
    }
}
