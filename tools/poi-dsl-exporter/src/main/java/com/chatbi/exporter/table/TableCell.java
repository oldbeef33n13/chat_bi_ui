package com.chatbi.exporter.table;

public record TableCell(
        String text,
        int rowSpan,
        int colSpan,
        String align,
        boolean header,
        boolean hidden
) {
    public TableCell {
        text = text == null ? "" : text;
        rowSpan = Math.max(1, rowSpan);
        colSpan = Math.max(1, colSpan);
        align = normalizeAlign(align);
    }

    public static TableCell anchor(String text, String align, boolean header) {
        return new TableCell(text, 1, 1, align, header, false);
    }

    public static TableCell hidden(String align, boolean header) {
        return new TableCell("", 1, 1, align, header, true);
    }

    public TableCell withSpan(int rowSpan, int colSpan) {
        return new TableCell(text, rowSpan, colSpan, align, header, false);
    }

    private static String normalizeAlign(String raw) {
        if (raw == null) {
            return "left";
        }
        return switch (raw.toLowerCase()) {
            case "left", "center", "right" -> raw.toLowerCase();
            default -> "left";
        };
    }
}

