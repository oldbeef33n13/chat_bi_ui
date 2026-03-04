package com.chatbi.exporter.style;

import com.chatbi.exporter.core.ExportRequest;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * DefaultStyleResolver 单元测试。
 */
class DefaultStyleResolverTest {
    /**
     * 验证请求级主题覆盖 + DSL 局部主题覆盖均能生效。
     */
    @Test
    void resolveThemeWithOverrides() {
        VNode root = new VNode();
        root.kind = "container";
        root.props = Map.of(
                "theme", Map.of(
                        "primary", "#0ea5e9",
                        "fontPrimary", "Noto Sans SC"
                )
        );

        VDoc doc = new VDoc();
        doc.docType = "report";
        doc.themeId = "enterprise-light";
        doc.root = root;

        ThemeTokens tokens = new DefaultStyleResolver().resolve(doc, new ExportRequest("ocean-contrast", false));
        assertEquals("Noto Sans SC", tokens.fontPrimary());
        assertEquals("0EA5E9", VisualStyle.toHexNoHash(tokens.primary()));
    }
}
