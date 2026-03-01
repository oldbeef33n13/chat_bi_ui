package com.chatbi.exporter;

import com.chatbi.exporter.chart.ChartSpec;
import com.chatbi.exporter.core.ExportRequest;
import com.chatbi.exporter.core.ExportTarget;
import com.chatbi.exporter.core.ExporterOrchestrator;
import com.chatbi.exporter.core.VDocValidator;
import com.chatbi.exporter.docx.ReportDocxExporter;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;
import com.chatbi.exporter.pptx.DeckPptxExporter;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ExporterSmokeTest {

    @Test
    void exportReportDocxWithOrchestrator() throws Exception {
        VDoc doc = sampleReport();
        Path out = Files.createTempFile("report-export-", ".docx");
        ReportDocxExporter docxExporter = new ReportDocxExporter()
                .registerChartFlavorRenderer(new ReportDocxExporter.DocxChartFlavorRenderer() {
                    @Override
                    public boolean supports(String chartType) {
                        return "sankey".equalsIgnoreCase(chartType);
                    }

                    @Override
                    public void render(ReportDocxExporter.DocxChartFlavorContext context, ChartSpec spec) {
                        context.appendInfoRow("Sankey 测试扩展策略。");
                    }
                });
        ExporterOrchestrator orchestrator = new ExporterOrchestrator(
                List.of(docxExporter, new DeckPptxExporter()),
                new VDocValidator()
        );
        orchestrator.export(doc, ExportTarget.DOCX, out, new ExportRequest("enterprise-light", true));
        assertTrue(Files.exists(out));
        assertTrue(Files.size(out) > 0);
    }

    @Test
    void exportDeckPptxWithThemeOverride() throws Exception {
        VDoc doc = samplePpt();
        Path out = Files.createTempFile("ppt-export-", ".pptx");
        new DeckPptxExporter().export(doc, out, new ExportRequest("ocean-contrast", true));
        assertTrue(Files.exists(out));
        assertTrue(Files.size(out) > 0);
    }

    private VDoc sampleReport() {
        VNode text = new VNode();
        text.id = "text_1";
        text.kind = "text";
        text.props = Map.of("text", "这是测试报告正文。");

        VNode chart = new VNode();
        chart.id = "chart_1";
        chart.kind = "chart";
        chart.props = Map.of(
                "titleText", "告警趋势",
                "chartType", "sankey",
                "aggregate", "avg",
                "stacked", true,
                "secondAxisField", "error_rate",
                "computedFields", List.of(Map.of("name", "error_rate")),
                "filters", List.of(Map.of("field", "region", "op", "in", "value", List.of("cn", "us"))),
                "bindings", List.of(
                        Map.of("role", "x", "field", "day"),
                        Map.of("role", "y", "field", "alarm_count", "agg", "sum"),
                        Map.of("role", "y2", "field", "error_rate", "agg", "avg"),
                        Map.of("role", "series", "field", "service")
                ),
                "sampleRows", List.of(
                        Map.of("day", "2026-02-25", "alarm_count", 90, "error_rate", 0.08, "service", "api"),
                        Map.of("day", "2026-02-26", "alarm_count", 120, "error_rate", 0.11, "service", "api")
                )
        );

        VNode section = new VNode();
        section.id = "section_1";
        section.kind = "section";
        section.props = Map.of("title", "1. 总览");
        section.children = List.of(text, chart);

        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.props = Map.of(
                "reportTitle", "测试周报",
                "tocShow", true,
                "coverEnabled", true,
                "summaryEnabled", true,
                "headerShow", true,
                "footerShow", true,
                "showPageNumber", true,
                "theme", Map.of(
                        "primary", "#0ea5e9",
                        "primarySoft", "#e0f2fe",
                        "fontPrimary", "Source Sans 3"
                )
        );
        root.children = List.of(section);

        VDoc doc = new VDoc();
        doc.docId = "report_1";
        doc.docType = "report";
        doc.schemaVersion = "1.0.0";
        doc.title = "测试周报";
        doc.root = root;
        return doc;
    }

    private VDoc samplePpt() {
        VNode text = new VNode();
        text.id = "text_1";
        text.kind = "text";
        text.layout = Map.of("x", 40, "y", 40, "w", 360, "h", 80);
        text.props = Map.of("text", "季度运营汇报");
        text.style = Map.of("fontSize", 28, "bold", true);

        VNode chart = new VNode();
        chart.id = "chart_1";
        chart.kind = "chart";
        chart.layout = Map.of("x", 40, "y", 140, "w", 430, "h", 260);
        chart.props = Map.of(
                "titleText", "告警趋势",
                "chartType", "bar",
                "aggregate", "sum",
                "bindings", List.of(
                        Map.of("role", "x", "field", "service"),
                        Map.of("role", "y", "field", "alarm_count")
                ),
                "palette", List.of("#1d4ed8", "#0ea5e9", "#14b8a6"),
                "sampleRows", List.of(
                        Map.of("service", "api", "alarm_count", 120),
                        Map.of("service", "db", "alarm_count", 90),
                        Map.of("service", "cache", "alarm_count", 48)
                )
        );

        VNode slide = new VNode();
        slide.id = "slide_1";
        slide.kind = "slide";
        slide.props = Map.of("title", "总览");
        slide.children = List.of(text, chart);

        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.props = Map.of("size", "16:9", "defaultBg", "#ffffff");
        root.children = List.of(slide);

        VDoc doc = new VDoc();
        doc.docId = "deck_1";
        doc.docType = "ppt";
        doc.schemaVersion = "1.0.0";
        doc.title = "测试演示文稿";
        doc.root = root;
        return doc;
    }
}
