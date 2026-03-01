package com.chatbi.exporter.style;

import java.awt.Color;
import java.util.Collections;
import java.util.List;

public final class ThemeTokens {
    private final String id;
    private final String fontPrimary;
    private final String fontMono;
    private final Color canvas;
    private final Color panel;
    private final Color panelAlt;
    private final Color border;
    private final Color text;
    private final Color muted;
    private final Color primary;
    private final Color primarySoft;
    private final List<Color> palette;

    public ThemeTokens(
            String id,
            String fontPrimary,
            String fontMono,
            Color canvas,
            Color panel,
            Color panelAlt,
            Color border,
            Color text,
            Color muted,
            Color primary,
            Color primarySoft,
            List<Color> palette
    ) {
        this.id = id;
        this.fontPrimary = fontPrimary;
        this.fontMono = fontMono;
        this.canvas = canvas;
        this.panel = panel;
        this.panelAlt = panelAlt;
        this.border = border;
        this.text = text;
        this.muted = muted;
        this.primary = primary;
        this.primarySoft = primarySoft;
        this.palette = palette == null ? Collections.emptyList() : List.copyOf(palette);
    }

    public String id() {
        return id;
    }

    public String fontPrimary() {
        return fontPrimary;
    }

    public String fontMono() {
        return fontMono;
    }

    public Color canvas() {
        return canvas;
    }

    public Color panel() {
        return panel;
    }

    public Color panelAlt() {
        return panelAlt;
    }

    public Color border() {
        return border;
    }

    public Color text() {
        return text;
    }

    public Color muted() {
        return muted;
    }

    public Color primary() {
        return primary;
    }

    public Color primarySoft() {
        return primarySoft;
    }

    public List<Color> palette() {
        return palette;
    }
}
