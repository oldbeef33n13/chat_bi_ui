package com.chatbi.exporter.chart;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ChartDatasetBuilder 单元测试。
 */
class ChartDatasetBuilderTest {
    /**
     * 验证按 measure 拆分系列的构建逻辑。
     */
    @Test
    void buildSeriesByMeasure() {
        ChartSpec spec = new ChartSpec(
                "趋势",
                "line",
                "day",
                List.of("count", "cost"),
                "",
                "sum",
                "",
                false,
                true,
                0,
                0,
                List.of(),
                List.of(
                        Map.of("day", "2026-02-25", "count", 10, "cost", 2.5),
                        Map.of("day", "2026-02-26", "count", 12, "cost", 3.1)
                ),
                List.of()
        );

        ChartDataset dataset = new ChartDatasetBuilder().build(spec);
        assertEquals(2, dataset.categories().size());
        assertEquals(2, dataset.series().size());
        assertTrue(dataset.isRenderable());
    }

    /**
     * 验证按 seriesField 透视拆分系列的构建逻辑。
     */
    @Test
    void buildPivotSeries() {
        ChartSpec spec = new ChartSpec(
                "分组趋势",
                "line",
                "day",
                List.of("count"),
                "service",
                "sum",
                "",
                false,
                false,
                0,
                0,
                List.of(),
                List.of(
                        Map.of("day", "2026-02-25", "service", "api", "count", 10),
                        Map.of("day", "2026-02-25", "service", "db", "count", 8),
                        Map.of("day", "2026-02-26", "service", "api", "count", 12),
                        Map.of("day", "2026-02-26", "service", "db", "count", 9)
                ),
                List.of()
        );

        ChartDataset dataset = new ChartDatasetBuilder().build(spec);
        assertEquals(2, dataset.categories().size());
        assertEquals(2, dataset.series().size());
        assertTrue(dataset.series().containsKey("api"));
        assertTrue(dataset.series().containsKey("db"));
    }
}
