package com.chatbi.exporter.style;

import com.chatbi.exporter.core.ExportRequest;
import com.chatbi.exporter.model.VDoc;

public interface StyleResolver {
    ThemeTokens resolve(VDoc doc, ExportRequest request);
}
