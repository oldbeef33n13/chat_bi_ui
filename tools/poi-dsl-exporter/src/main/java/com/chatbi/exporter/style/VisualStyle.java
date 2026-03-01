package com.chatbi.exporter.style;

import java.awt.Color;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class VisualStyle {
    private VisualStyle() {
    }

    public static final String FONT_PRIMARY = "Source Sans 3";
    public static final String FONT_MONO = "Consolas";

    public static final Color BG_PANEL = color("#ffffff");
    public static final Color BG_PANEL_ALT = color("#f8fbff");
    public static final Color BORDER = color("#d9e2f2");
    public static final Color PRIMARY = color("#1d4ed8");
    public static final Color PRIMARY_SOFT = color("#dbeafe");
    public static final Color TEXT = color("#1f2937");
    public static final Color MUTED = color("#6b7280");

    public static Color color(String hex) {
        if (hex == null) {
            throw new IllegalArgumentException("Color is null.");
        }
        String clean = hex.replace("#", "").trim();
        if (clean.length() == 3) {
            clean = "" + clean.charAt(0) + clean.charAt(0)
                    + clean.charAt(1) + clean.charAt(1)
                    + clean.charAt(2) + clean.charAt(2);
        }
        if (clean.length() == 8) {
            clean = clean.substring(2);
        }
        if (clean.length() != 6) {
            throw new IllegalArgumentException("Invalid color: " + hex);
        }
        int r = Integer.parseInt(clean.substring(0, 2), 16);
        int g = Integer.parseInt(clean.substring(2, 4), 16);
        int b = Integer.parseInt(clean.substring(4, 6), 16);
        return new Color(r, g, b);
    }

    public static String toHexNoHash(Color color) {
        return String.format("%02X%02X%02X", color.getRed(), color.getGreen(), color.getBlue());
    }

    public static List<Color> palette(String... colors) {
        if (colors == null || colors.length == 0) {
            return Collections.emptyList();
        }
        List<Color> result = new ArrayList<>(colors.length);
        for (String color : colors) {
            result.add(VisualStyle.color(color));
        }
        return Collections.unmodifiableList(result);
    }
}
