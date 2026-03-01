package com.chatbi.exporter.render;

import com.chatbi.exporter.model.VNode;

import java.io.IOException;

public interface NodeRenderer<C> {
    String kind();

    void render(C context, VNode node) throws IOException;
}
