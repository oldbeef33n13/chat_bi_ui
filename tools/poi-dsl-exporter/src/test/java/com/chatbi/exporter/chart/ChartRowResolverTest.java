package com.chatbi.exporter.chart;

import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ChartRowResolverTest {
    @Test
    void preferSampleRows() {
        ChartSpec spec = new ChartSpec(
                "test",
                "line",
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
                List.of()
        );

        VDoc doc = new VDoc();
        VNode node = new VNode();
        List<Map<String, Object>> rows = new ChartRowResolver().resolve(doc, node, spec);
        assertEquals(1, rows.size());
        assertEquals("A", rows.get(0).get("x"));
    }

    @Test
    void resolveFromQueryResult() {
        VDoc doc = new VDoc();
        doc.dataSources = List.of(
                Map.of(
                        "id", "ds1",
                        "type", "static",
                        "staticData", List.of(Map.of("day", "fallback", "value", 1))
                )
        );
        doc.queries = List.of(
                Map.of(
                        "queryId", "q1",
                        "sourceId", "ds1",
                        "result", Map.of(
                                "rows", List.of(
                                        Map.of("day", "Mon", "value", 10),
                                        Map.of("day", "Tue", "value", 12)
                                )
                        )
                )
        );

        VNode node = new VNode();
        node.data = Map.of("sourceId", "ds1", "queryId", "q1");
        ChartSpec spec = new ChartSpec("test", "line", "day", List.of("value"), "", "sum", "", false, false, 0, 0, List.of(), List.of(), List.of());

        List<Map<String, Object>> rows = new ChartRowResolver().resolve(doc, node, spec);
        assertEquals(2, rows.size());
        assertEquals("Mon", rows.get(0).get("day"));
    }

    @Test
    void resolveFromStaticDataSource() {
        VDoc doc = new VDoc();
        doc.dataSources = List.of(
                Map.of(
                        "id", "ds1",
                        "type", "static",
                        "staticData", List.of(
                                Map.of("day", "Mon", "value", 10),
                                Map.of("day", "Tue", "value", 12)
                        )
                )
        );

        VNode node = new VNode();
        node.data = Map.of("sourceId", "ds1", "queryId", "q_missing");
        ChartSpec spec = new ChartSpec("test", "line", "day", List.of("value"), "", "sum", "", false, false, 0, 0, List.of(), List.of(), List.of());

        List<Map<String, Object>> rows = new ChartRowResolver().resolve(doc, node, spec);
        assertEquals(2, rows.size());
        assertEquals("Tue", rows.get(1).get("day"));
    }
}
