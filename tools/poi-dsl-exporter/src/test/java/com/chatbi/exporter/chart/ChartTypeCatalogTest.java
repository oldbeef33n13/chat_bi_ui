package com.chatbi.exporter.chart;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ChartTypeCatalog 单元测试。
 */
class ChartTypeCatalogTest {
    /**
     * 保证类型目录覆盖前端 DSL 支持的全部图表类型。
     */
    @Test
    void containAllFrontendChartTypes() {
        assertTrue(ChartTypeCatalog.webTypes().contains("line"));
        assertTrue(ChartTypeCatalog.webTypes().contains("bar"));
        assertTrue(ChartTypeCatalog.webTypes().contains("pie"));
        assertTrue(ChartTypeCatalog.webTypes().contains("scatter"));
        assertTrue(ChartTypeCatalog.webTypes().contains("radar"));
        assertTrue(ChartTypeCatalog.webTypes().contains("heatmap"));
        assertTrue(ChartTypeCatalog.webTypes().contains("kline"));
        assertTrue(ChartTypeCatalog.webTypes().contains("boxplot"));
        assertTrue(ChartTypeCatalog.webTypes().contains("sankey"));
        assertTrue(ChartTypeCatalog.webTypes().contains("graph"));
        assertTrue(ChartTypeCatalog.webTypes().contains("treemap"));
        assertTrue(ChartTypeCatalog.webTypes().contains("sunburst"));
        assertTrue(ChartTypeCatalog.webTypes().contains("parallel"));
        assertTrue(ChartTypeCatalog.webTypes().contains("funnel"));
        assertTrue(ChartTypeCatalog.webTypes().contains("gauge"));
        assertTrue(ChartTypeCatalog.webTypes().contains("calendar"));
        assertTrue(ChartTypeCatalog.webTypes().contains("custom"));
    }
}
