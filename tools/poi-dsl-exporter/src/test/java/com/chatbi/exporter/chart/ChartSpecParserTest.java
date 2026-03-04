package com.chatbi.exporter.chart;

import com.chatbi.exporter.model.VNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ChartSpecParser 单元测试。
 */
class ChartSpecParserTest {
    /**
     * 验证复杂图表配置可被完整解析并计算复杂度等级。
     */
    @Test
    void parseComplexChartSpec() {
        VNode chart = new VNode();
        chart.kind = "chart";
        chart.name = "复杂图";
        chart.props = Map.of(
                "chartType", "combo",
                "aggregate", "avg",
                "secondAxisField", "profit_rate",
                "stacked", true,
                "smooth", true,
                "filters", List.of(Map.of("field", "region"), Map.of("field", "service")),
                "computedFields", List.of(Map.of("name", "profit_rate")),
                "bindings", List.of(
                        Map.of("role", "x", "field", "month"),
                        Map.of("role", "y", "field", "revenue", "agg", "sum"),
                        Map.of("role", "y2", "field", "profit_rate", "agg", "avg"),
                        Map.of("role", "series", "field", "product")
                )
        );

        ChartSpec spec = new ChartSpecParser().parse(chart);
        assertEquals("复杂图", spec.title());
        assertEquals("combo", spec.chartType());
        assertEquals("month", spec.dimensionField());
        assertEquals("product", spec.seriesField());
        assertEquals("profit_rate", spec.secondAxisField());
        assertTrue(spec.measureFields().contains("revenue"));
        assertTrue(spec.measureFields().contains("profit_rate"));
        assertEquals("enterprise", spec.complexityLevel());
    }
}
