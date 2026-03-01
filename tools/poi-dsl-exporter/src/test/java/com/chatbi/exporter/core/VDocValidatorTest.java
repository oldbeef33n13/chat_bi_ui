package com.chatbi.exporter.core;

import com.chatbi.exporter.chart.ChartTypeCatalog;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

class VDocValidatorTest {
    @Test
    void acceptAllWebChartTypes() {
        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.children = new ArrayList<>();

        int i = 0;
        for (String type : ChartTypeCatalog.webTypes()) {
            VNode chart = new VNode();
            chart.id = "chart_" + i;
            chart.kind = "chart";
            chart.props = Map.of("chartType", type);
            root.children.add(chart);
            i++;
        }

        VDoc doc = new VDoc();
        doc.docType = "report";
        doc.schemaVersion = "1.0.0";
        doc.root = root;

        List<String> issues = new VDocValidator().validate(doc);
        assertTrue(issues.isEmpty(), "expected no validation issues but got: " + issues);
    }

    @Test
    void rejectUnknownChartType() {
        VNode chart = new VNode();
        chart.id = "chart_unknown";
        chart.kind = "chart";
        chart.props = Map.of("chartType", "unknown-x");

        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.children = List.of(chart);

        VDoc doc = new VDoc();
        doc.docType = "report";
        doc.schemaVersion = "1.0.0";
        doc.root = root;

        List<String> issues = new VDocValidator().validate(doc);
        assertFalse(issues.isEmpty());
        assertTrue(issues.stream().anyMatch(item -> item.contains("Unsupported chartType")));
    }
}
