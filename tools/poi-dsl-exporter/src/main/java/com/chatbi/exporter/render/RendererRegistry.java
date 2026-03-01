package com.chatbi.exporter.render;

import com.chatbi.exporter.model.VNode;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public final class RendererRegistry<C> {
    private final Map<String, NodeRenderer<C>> renderers = new HashMap<>();
    private final NodeRenderer<C> fallback;

    public RendererRegistry(NodeRenderer<C> fallback) {
        this.fallback = Objects.requireNonNull(fallback, "fallback");
    }

    public RendererRegistry<C> register(NodeRenderer<C> renderer) {
        renderers.put(normalize(renderer.kind()), renderer);
        return this;
    }

    public void render(C context, VNode node) throws IOException {
        String kind = node == null ? "" : normalize(node.kind);
        NodeRenderer<C> renderer = renderers.getOrDefault(kind, fallback);
        renderer.render(context, node);
    }

    private String normalize(String kind) {
        return kind == null ? "" : kind.trim().toLowerCase();
    }
}
