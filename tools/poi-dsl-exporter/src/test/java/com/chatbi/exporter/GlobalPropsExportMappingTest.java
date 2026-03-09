package com.chatbi.exporter;

import com.chatbi.exporter.core.ExportRequest;
import com.chatbi.exporter.docx.ReportDocxExporter;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;
import com.chatbi.exporter.pptx.DeckPptxExporter;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.junit.jupiter.api.Test;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageMar;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSectPr;

import java.io.InputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.awt.geom.Rectangle2D;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 全局属性映射回归：
 * 1) Report 页边距/分页策略是否映射到 DOCX；
 * 2) PPT 母版属性是否映射到导出文本图层。
 */
class GlobalPropsExportMappingTest {

    @Test
    void reportGlobalPropsMapToDocxPageMarginsAndPagination() throws Exception {
        VDoc doc = sampleReportWithGlobalProps("continuous");
        Path out = Files.createTempFile("report-global-props-", ".docx");
        new ReportDocxExporter().export(doc, out, new ExportRequest(null, true));
        assertTrue(Files.exists(out));
        assertTrue(Files.size(out) > 0);

        try (InputStream in = Files.newInputStream(out); XWPFDocument xwpf = new XWPFDocument(in)) {
            CTSectPr sectPr = xwpf.getDocument().getBody().getSectPr();
            assertNotNull(sectPr, "sectPr missing");
            CTPageMar mar = sectPr.getPgMar();
            assertNotNull(mar, "page margin missing");

            assertEquals(mmToTwips(20), asTwips(mar.getTop()), "top margin twips mismatch");
            assertEquals(mmToTwips(20), asTwips(mar.getRight()), "right margin twips mismatch");
            assertEquals(mmToTwips(20), asTwips(mar.getBottom()), "bottom margin twips mismatch");
            assertEquals(mmToTwips(20), asTwips(mar.getLeft()), "left margin twips mismatch");

            long pageBreakCount = xwpf.getParagraphs().stream().filter(XWPFParagraph::isPageBreak).count();
            assertEquals(0, pageBreakCount, "continuous pagination should not force section page breaks");
        }
    }

    @Test
    void reportLayoutSpacingPropsMapToDocxParagraphSpacing() throws Exception {
        VDoc doc = sampleReportWithLayoutSpacingProps();
        Path out = Files.createTempFile("report-layout-spacing-", ".docx");
        new ReportDocxExporter().export(doc, out, new ExportRequest(null, true));
        assertTrue(Files.exists(out));
        assertTrue(Files.size(out) > 0);

        try (InputStream in = Files.newInputStream(out); XWPFDocument xwpf = new XWPFDocument(in)) {
            XWPFParagraph sectionHeading = xwpf.getParagraphs().stream()
                    .filter(paragraph -> paragraph.getText() != null && paragraph.getText().contains("1. 第一章"))
                    .findFirst()
                    .orElse(null);
            assertNotNull(sectionHeading, "section heading missing");
            assertEquals(360, sectionHeading.getSpacingAfter(), "sectionGapPx=24 should map to 360 twips");

            boolean hasBlockGap = xwpf.getParagraphs().stream()
                    .anyMatch(paragraph -> (paragraph.getText() == null || paragraph.getText().isBlank()) && paragraph.getSpacingAfter() == 240);
            assertTrue(hasBlockGap, "blockGapPx=16 should map to 240 twips gap paragraph");
        }
    }

    @Test
    void pptGlobalMasterPropsMapToSlides() throws Exception {
        VDoc doc = samplePptWithMasterProps();
        Path out = Files.createTempFile("ppt-global-props-", ".pptx");
        new DeckPptxExporter().export(doc, out, new ExportRequest(null, true));
        assertTrue(Files.exists(out));
        assertTrue(Files.size(out) > 0);

        try (InputStream in = Files.newInputStream(out); XMLSlideShow show = new XMLSlideShow(in)) {
            assertEquals(2, show.getSlides().size(), "slides count mismatch");
            assertTrue(slideText(show.getSlides().get(0)).contains("运营周会"), "master header text missing on slide1");
            assertTrue(slideText(show.getSlides().get(0)).contains("内部演示"), "master footer text missing on slide1");
            assertTrue(slideText(show.getSlides().get(0)).contains("#1/2"), "slide number missing on slide1");
            assertTrue(slideText(show.getSlides().get(1)).contains("#2/2"), "slide number missing on slide2");
        }
    }

    @Test
    void pptMasterFooterDefaultsToVisibleWhenDslOmitsFlag() throws Exception {
        VDoc doc = samplePptWithoutFooterFlag();
        Path out = Files.createTempFile("ppt-global-props-default-footer-", ".pptx");
        new DeckPptxExporter().export(doc, out, new ExportRequest(null, true));
        assertTrue(Files.exists(out));
        assertTrue(Files.size(out) > 0);

        try (InputStream in = Files.newInputStream(out); XMLSlideShow show = new XMLSlideShow(in)) {
            assertEquals(1, show.getSlides().size(), "slides count mismatch");
            String text = slideText(show.getSlides().get(0));
            assertTrue(text.contains("Visual Document OS"), "default master footer text missing");
            assertTrue(text.contains("#1/1"), "default slide number missing");
        }
    }

    @Test
    void pptMasterLayoutPropsMapToHeaderFooterAnchors() throws Exception {
        VDoc doc = samplePptWithMasterLayoutProps();
        Path out = Files.createTempFile("ppt-master-layout-props-", ".pptx");
        new DeckPptxExporter().export(doc, out, new ExportRequest(null, true));
        assertTrue(Files.exists(out));
        assertTrue(Files.size(out) > 0);

        try (InputStream in = Files.newInputStream(out); XMLSlideShow show = new XMLSlideShow(in)) {
            XSLFSlide slide = show.getSlides().get(0);
            XSLFTextShape header = findTextShapeContaining(slide, "运营周会");
            XSLFTextShape footer = findTextShapeContaining(slide, "内部演示");
            assertNotNull(header, "header text shape missing");
            assertNotNull(footer, "footer text shape missing");

            Rectangle2D headerAnchor = header.getAnchor();
            Rectangle2D footerAnchor = footer.getAnchor();
            assertEquals(40, Math.round(headerAnchor.getX()), "header x should follow masterPaddingXPx");
            assertEquals(20, Math.round(headerAnchor.getY()), "header y should follow masterHeaderTopPx");
            assertEquals(32, Math.round(headerAnchor.getHeight()), "header height should follow masterHeaderHeightPx");

            assertEquals(40, Math.round(footerAnchor.getX()), "footer x should follow masterPaddingXPx");
            assertEquals(28, Math.round(footerAnchor.getHeight()), "footer height should follow masterFooterHeightPx");
            long expectedFooterY = show.getPageSize().height - 28 - 14;
            assertEquals(expectedFooterY, Math.round(footerAnchor.getY()), "footer y should follow masterFooterBottomPx");
        }
    }

    private long mmToTwips(double mm) {
        return Math.round(mm * 56.6929133858);
    }

    private long asTwips(Object value) {
        if (value instanceof BigInteger bi) {
            return bi.longValue();
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        return Long.parseLong(String.valueOf(value));
    }

    private String slideText(XSLFSlide slide) {
        StringBuilder sb = new StringBuilder();
        for (XSLFShape shape : slide.getShapes()) {
            if (shape instanceof XSLFTextShape textShape) {
                sb.append(textShape.getText()).append("\n");
            }
        }
        return sb.toString();
    }

    private XSLFTextShape findTextShapeContaining(XSLFSlide slide, String contains) {
        for (XSLFShape shape : slide.getShapes()) {
            if (shape instanceof XSLFTextShape textShape) {
                String text = textShape.getText();
                if (text != null && text.contains(contains)) {
                    return textShape;
                }
            }
        }
        return null;
    }

    private VDoc sampleReportWithGlobalProps(String paginationStrategy) {
        VNode section1Text = new VNode();
        section1Text.id = "txt_1";
        section1Text.kind = "text";
        section1Text.props = Map.of("text", "第一章节内容。");

        VNode section2Text = new VNode();
        section2Text.id = "txt_2";
        section2Text.kind = "text";
        section2Text.props = Map.of("text", "第二章节内容。");

        VNode section1 = new VNode();
        section1.id = "section_1";
        section1.kind = "section";
        section1.props = Map.of("title", "1. 第一章");
        section1.children = List.of(section1Text);

        VNode section2 = new VNode();
        section2.id = "section_2";
        section2.kind = "section";
        section2.props = Map.of("title", "2. 第二章");
        section2.children = List.of(section2Text);

        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.props = Map.ofEntries(
                Map.entry("reportTitle", "全局属性映射测试"),
                Map.entry("coverEnabled", false),
                Map.entry("tocShow", false),
                Map.entry("summaryEnabled", false),
                Map.entry("headerShow", true),
                Map.entry("footerShow", true),
                Map.entry("showPageNumber", true),
                Map.entry("marginPreset", "wide"),
                Map.entry("marginTopMm", 20),
                Map.entry("marginRightMm", 20),
                Map.entry("marginBottomMm", 20),
                Map.entry("marginLeftMm", 20),
                Map.entry("paginationStrategy", paginationStrategy)
        );
        root.children = List.of(section1, section2);

        VDoc doc = new VDoc();
        doc.docId = "report_global_props";
        doc.docType = "report";
        doc.schemaVersion = "1.0.0";
        doc.title = "全局属性映射测试";
        doc.root = root;
        return doc;
    }

    private VDoc samplePptWithMasterProps() {
        VNode slide1Text = new VNode();
        slide1Text.id = "txt_1";
        slide1Text.kind = "text";
        slide1Text.layout = Map.of("x", 48, "y", 90, "w", 420, "h", 80);
        slide1Text.props = Map.of("text", "第一页内容");

        VNode slide2Text = new VNode();
        slide2Text.id = "txt_2";
        slide2Text.kind = "text";
        slide2Text.layout = Map.of("x", 48, "y", 90, "w", 420, "h", 80);
        slide2Text.props = Map.of("text", "第二页内容");

        VNode slide1 = new VNode();
        slide1.id = "slide_1";
        slide1.kind = "slide";
        slide1.props = Map.of("title", "总览");
        slide1.children = List.of(slide1Text);

        VNode slide2 = new VNode();
        slide2.id = "slide_2";
        slide2.kind = "slide";
        slide2.props = Map.of("title", "明细");
        slide2.children = List.of(slide2Text);

        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.props = Map.of(
                "size", "16:9",
                "defaultBg", "#ffffff",
                "masterShowHeader", true,
                "masterHeaderText", "运营周会",
                "masterShowFooter", true,
                "masterFooterText", "内部演示",
                "masterShowSlideNumber", true,
                "masterAccentColor", "#1d4ed8"
        );
        root.children = List.of(slide1, slide2);

        VDoc doc = new VDoc();
        doc.docId = "ppt_global_props";
        doc.docType = "ppt";
        doc.schemaVersion = "1.0.0";
        doc.title = "PPT 母版映射测试";
        doc.root = root;
        return doc;
    }

    private VDoc samplePptWithoutFooterFlag() {
        VNode slideText = new VNode();
        slideText.id = "txt_default_footer";
        slideText.kind = "text";
        slideText.layout = Map.of("x", 48, "y", 90, "w", 420, "h", 80);
        slideText.props = Map.of("text", "仅验证默认母版页脚");

        VNode slide = new VNode();
        slide.id = "slide_default_footer";
        slide.kind = "slide";
        slide.props = Map.of("title", "默认页脚");
        slide.children = List.of(slideText);

        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.props = Map.of(
                "size", "16:9",
                "defaultBg", "#ffffff",
                "masterShowHeader", true,
                "masterHeaderText", "默认映射"
        );
        root.children = List.of(slide);

        VDoc doc = new VDoc();
        doc.docId = "ppt_default_footer";
        doc.docType = "ppt";
        doc.schemaVersion = "1.0.0";
        doc.title = "PPT 默认母版测试";
        doc.root = root;
        return doc;
    }

    private VDoc sampleReportWithLayoutSpacingProps() {
        VNode text1 = new VNode();
        text1.id = "txt_spacing_1";
        text1.kind = "text";
        text1.props = Map.of("text", "第一段文本");

        VNode text2 = new VNode();
        text2.id = "txt_spacing_2";
        text2.kind = "text";
        text2.props = Map.of("text", "第二段文本");

        VNode section = new VNode();
        section.id = "section_spacing_1";
        section.kind = "section";
        section.props = Map.of("title", "1. 第一章");
        section.children = List.of(text1, text2);

        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.props = Map.of(
                "reportTitle", "布局间距映射测试",
                "coverEnabled", false,
                "tocShow", false,
                "summaryEnabled", false,
                "sectionGapPx", 24,
                "blockGapPx", 16
        );
        root.children = List.of(section);

        VDoc doc = new VDoc();
        doc.docId = "report_layout_spacing_props";
        doc.docType = "report";
        doc.schemaVersion = "1.0.0";
        doc.title = "布局间距映射测试";
        doc.root = root;
        return doc;
    }

    private VDoc samplePptWithMasterLayoutProps() {
        VNode slideText = new VNode();
        slideText.id = "txt_layout";
        slideText.kind = "text";
        slideText.layout = Map.of("x", 48, "y", 90, "w", 420, "h", 80);
        slideText.props = Map.of("text", "布局参数验证页");

        VNode slide = new VNode();
        slide.id = "slide_layout";
        slide.kind = "slide";
        slide.props = Map.of("title", "总览");
        slide.children = List.of(slideText);

        VNode root = new VNode();
        root.id = "root";
        root.kind = "container";
        root.props = Map.ofEntries(
                Map.entry("size", "16:9"),
                Map.entry("defaultBg", "#ffffff"),
                Map.entry("masterShowHeader", true),
                Map.entry("masterHeaderText", "运营周会"),
                Map.entry("masterShowFooter", true),
                Map.entry("masterFooterText", "内部演示"),
                Map.entry("masterShowSlideNumber", true),
                Map.entry("masterAccentColor", "#1d4ed8"),
                Map.entry("masterPaddingXPx", 40),
                Map.entry("masterHeaderTopPx", 20),
                Map.entry("masterHeaderHeightPx", 32),
                Map.entry("masterFooterBottomPx", 14),
                Map.entry("masterFooterHeightPx", 28)
        );
        root.children = List.of(slide);

        VDoc doc = new VDoc();
        doc.docId = "ppt_master_layout_props";
        doc.docType = "ppt";
        doc.schemaVersion = "1.0.0";
        doc.title = "PPT 母版布局参数测试";
        doc.root = root;
        return doc;
    }
}
