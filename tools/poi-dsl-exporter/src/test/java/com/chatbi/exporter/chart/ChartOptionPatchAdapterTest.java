package com.chatbi.exporter.chart;

import org.apache.poi.xddf.usermodel.chart.LegendPosition;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * ChartOptionPatchAdapter 单元测试。
 */
class ChartOptionPatchAdapterTest {
    /**
     * 验证 optionPatch 的标题/图例/坐标轴/series.type 解析优先级。
     */
    @Test
    void readOptionPatchHints() {
        ChartSpec spec = new ChartSpec(
                "原始标题",
                "custom",
                true,
                "top",
                "默认X",
                "默认Y",
                "x",
                List.of("y"),
                "",
                "sum",
                "",
                false,
                false,
                0,
                0,
                List.of(),
                List.of(Map.of("x", "A", "y", 1)),
                List.of(),
                Map.of(
                        "title", Map.of("text", "Patch 标题"),
                        "legend", Map.of("show", false, "left", 0),
                        "xAxis", Map.of("name", "Patch X"),
                        "yAxis", List.of(Map.of("name", "Patch Y")),
                        "series", List.of(Map.of("type", "bar"))
                )
        );

        ChartOptionPatchAdapter adapter = new ChartOptionPatchAdapter();
        assertEquals("Patch 标题", adapter.resolveTitle(spec));
        assertFalse(adapter.resolveLegendShow(spec));
        assertEquals(LegendPosition.LEFT, adapter.resolveLegendPosition(spec));
        assertEquals("Patch X", adapter.resolveXAxisTitle(spec));
        assertEquals("Patch Y", adapter.resolveYAxisTitle(spec));
        assertEquals("bar", adapter.resolveSeriesTypeHint(spec));
    }
}
