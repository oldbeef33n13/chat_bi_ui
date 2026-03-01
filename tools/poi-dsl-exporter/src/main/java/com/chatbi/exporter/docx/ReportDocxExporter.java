package com.chatbi.exporter.docx;

import com.chatbi.exporter.chart.ChartSpec;
import com.chatbi.exporter.chart.ChartSpecParser;
import com.chatbi.exporter.chart.PoiChartRenderer;
import com.chatbi.exporter.chart.ChartRowResolver;
import com.chatbi.exporter.chart.ChartTypeCatalog;
import com.chatbi.exporter.core.DocumentExporter;
import com.chatbi.exporter.core.ExportRequest;
import com.chatbi.exporter.core.ExportTarget;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;
import com.chatbi.exporter.render.NodeRenderer;
import com.chatbi.exporter.render.RendererRegistry;
import com.chatbi.exporter.style.DefaultStyleResolver;
import com.chatbi.exporter.style.StyleResolver;
import com.chatbi.exporter.style.ThemeTokens;
import com.chatbi.exporter.style.VisualStyle;
import org.apache.poi.xwpf.model.XWPFHeaderFooterPolicy;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFFooter;
import org.apache.poi.xwpf.usermodel.XWPFHeader;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.apache.poi.xwpf.usermodel.XWPFChart;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageMar;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPageSz;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSectPr;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSimpleField;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STHdrFtr;

import java.awt.Color;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class ReportDocxExporter implements DocumentExporter {
    private final StyleResolver styleResolver;
    private final ChartSpecParser chartSpecParser;
    private final ChartRowResolver chartRowResolver;
    private final PoiChartRenderer poiChartRenderer;
    private final List<DocxChartFlavorRenderer> chartFlavorRenderers;
    private final RendererRegistry<DocxRenderContext> nodeRenderers;

    public ReportDocxExporter() {
        this(new DefaultStyleResolver(), new ChartSpecParser());
    }

    public ReportDocxExporter(StyleResolver styleResolver, ChartSpecParser chartSpecParser) {
        this.styleResolver = styleResolver;
        this.chartSpecParser = chartSpecParser;
        this.chartRowResolver = new ChartRowResolver();
        this.poiChartRenderer = new PoiChartRenderer();
        this.chartFlavorRenderers = new ArrayList<>();
        registerChartFlavorRenderer(new TrendFlavorRenderer());
        registerChartFlavorRenderer(new ComparisonFlavorRenderer());
        registerChartFlavorRenderer(new CompositionFlavorRenderer());
        registerChartFlavorRenderer(new RelationFlavorRenderer());
        registerChartFlavorRenderer(new MatrixFlavorRenderer());
        registerChartFlavorRenderer(new TimeWindowFlavorRenderer());
        registerChartFlavorRenderer(new CustomFlavorRenderer());
        registerChartFlavorRenderer(new TableFlavorRenderer());
        registerChartFlavorRenderer(new GenericFlavorRenderer());
        this.nodeRenderers = new RendererRegistry<>(new UnsupportedNodeRenderer())
                .register(new TextNodeRenderer())
                .register(new ChartNodeRenderer());
    }

    public ReportDocxExporter registerChartFlavorRenderer(DocxChartFlavorRenderer renderer) {
        DocxChartFlavorRenderer safe = Objects.requireNonNull(renderer, "renderer");
        int fallbackIndex = findFallbackIndex();
        if (fallbackIndex >= 0) {
            chartFlavorRenderers.add(fallbackIndex, safe);
        } else {
            chartFlavorRenderers.add(safe);
        }
        return this;
    }

    private int findFallbackIndex() {
        for (int i = 0; i < chartFlavorRenderers.size(); i++) {
            if (chartFlavorRenderers.get(i) instanceof GenericFlavorRenderer) {
                return i;
            }
        }
        return -1;
    }

    @Override
    public ExportTarget target() {
        return ExportTarget.DOCX;
    }

    @Override
    public boolean supports(VDoc doc) {
        return doc != null && "report".equalsIgnoreCase(doc.docType);
    }

    public void export(VDoc doc, Path output) throws IOException {
        export(doc, output, ExportRequest.defaults());
    }

    @Override
    public void export(VDoc doc, Path output, ExportRequest request) throws IOException {
        if (!supports(doc)) {
            throw new IllegalArgumentException("ReportDocxExporter only accepts report docType.");
        }
        if (output.getParent() != null) {
            Files.createDirectories(output.getParent());
        }

        try (XWPFDocument document = new XWPFDocument()) {
            Map<String, Object> props = doc.root == null ? Collections.emptyMap() : doc.root.propsOrEmpty();
            ThemeTokens theme = styleResolver.resolve(doc, request);
            DocxRenderContext context = new DocxRenderContext(document, theme, chartSpecParser, props, doc);

            configurePage(document, props);
            setupHeaderFooter(document, props, str(props.get("reportTitle"), defaultReportTitle(doc)), theme);

            boolean coverEnabled = bool(props.get("coverEnabled"), true);
            boolean tocShow = bool(props.get("tocShow"), true);
            boolean summaryEnabled = bool(props.get("summaryEnabled"), true);
            List<VNode> sections = sectionNodes(doc.root);

            if (coverEnabled) {
                addCoverPage(context, props, doc);
            }
            if (tocShow) {
                addTocPage(context, sections);
            }
            addContentPages(context, sections);
            if (summaryEnabled) {
                addSummaryPage(context, props, sections);
            }

            try (OutputStream out = Files.newOutputStream(output)) {
                document.write(out);
            }
        }
    }

    private void configurePage(XWPFDocument document, Map<String, Object> props) {
        String pageSize = str(props.get("pageSize"), "A4");
        CTSectPr sectPr = document.getDocument().getBody().isSetSectPr()
                ? document.getDocument().getBody().getSectPr()
                : document.getDocument().getBody().addNewSectPr();
        CTPageSz sz = sectPr.isSetPgSz() ? sectPr.getPgSz() : sectPr.addNewPgSz();
        CTPageMar mar = sectPr.isSetPgMar() ? sectPr.getPgMar() : sectPr.addNewPgMar();

        if ("Letter".equalsIgnoreCase(pageSize)) {
            sz.setW(BigInteger.valueOf(12240));
            sz.setH(BigInteger.valueOf(15840));
        } else {
            sz.setW(BigInteger.valueOf(11906));
            sz.setH(BigInteger.valueOf(16838));
        }

        mar.setTop(BigInteger.valueOf((long) VNode.asDouble(props.get("marginTopTwips"), 1080)));
        mar.setBottom(BigInteger.valueOf((long) VNode.asDouble(props.get("marginBottomTwips"), 1080)));
        mar.setLeft(BigInteger.valueOf((long) VNode.asDouble(props.get("marginLeftTwips"), 1080)));
        mar.setRight(BigInteger.valueOf((long) VNode.asDouble(props.get("marginRightTwips"), 1080)));
    }

    private void setupHeaderFooter(XWPFDocument document, Map<String, Object> props, String reportTitle, ThemeTokens theme) {
        boolean headerShow = bool(props.get("headerShow"), true);
        boolean footerShow = bool(props.get("footerShow"), true);
        boolean showPageNumber = bool(props.get("showPageNumber"), true);
        String headerText = str(props.get("headerText"), reportTitle);
        String footerText = str(props.get("footerText"), "Visual Document OS");

        XWPFHeaderFooterPolicy policy = document.createHeaderFooterPolicy();
        if (headerShow) {
            XWPFHeader header = policy.createHeader(STHdrFtr.DEFAULT);
            XWPFParagraph p = header.createParagraph();
            p.setAlignment(ParagraphAlignment.LEFT);
            XWPFRun run = p.createRun();
            run.setText(headerText);
            run.setFontFamily(theme.fontPrimary());
            run.setFontSize(10);
            run.setColor(VisualStyle.toHexNoHash(theme.muted()));
        }

        if (footerShow) {
            XWPFFooter footer = policy.createFooter(STHdrFtr.DEFAULT);
            XWPFParagraph p = footer.createParagraph();
            p.setAlignment(ParagraphAlignment.LEFT);
            XWPFRun run = p.createRun();
            run.setText(footerText);
            run.setFontFamily(theme.fontPrimary());
            run.setFontSize(10);
            run.setColor(VisualStyle.toHexNoHash(theme.muted()));

            if (showPageNumber) {
                XWPFRun sep = p.createRun();
                sep.setText(" | Page ");
                sep.setFontFamily(theme.fontPrimary());
                sep.setFontSize(10);
                sep.setColor(VisualStyle.toHexNoHash(theme.muted()));
                CTSimpleField field = p.getCTP().addNewFldSimple();
                field.setInstr("PAGE");
            }
        }
    }

    private void addCoverPage(DocxRenderContext context, Map<String, Object> props, VDoc doc) {
        String reportTitle = str(props.get("reportTitle"), defaultReportTitle(doc));
        String coverTitle = str(props.get("coverTitle"), reportTitle);
        String coverSubtitle = str(props.get("coverSubtitle"), "Report");
        String coverNote = str(props.get("coverNote"), "");

        XWPFParagraph title = context.document.createParagraph();
        title.setAlignment(ParagraphAlignment.CENTER);
        title.setSpacingBefore(2400);
        XWPFRun t = title.createRun();
        t.setText(coverTitle);
        t.setBold(true);
        t.setFontFamily(context.theme.fontPrimary());
        t.setColor(VisualStyle.toHexNoHash(context.theme.text()));
        t.setFontSize(30);

        XWPFParagraph sub = context.document.createParagraph();
        sub.setAlignment(ParagraphAlignment.CENTER);
        XWPFRun s = sub.createRun();
        s.setText(coverSubtitle);
        s.setFontFamily(context.theme.fontPrimary());
        s.setColor(VisualStyle.toHexNoHash(context.theme.muted()));
        s.setFontSize(14);

        if (!coverNote.isBlank()) {
            XWPFParagraph note = context.document.createParagraph();
            note.setAlignment(ParagraphAlignment.CENTER);
            note.setSpacingBefore(480);
            XWPFRun n = note.createRun();
            n.setText(coverNote);
            n.setFontFamily(context.theme.fontPrimary());
            n.setColor(VisualStyle.toHexNoHash(context.theme.muted()));
            n.setFontSize(11);
        }
        pageBreak(context.document);
    }

    private void addTocPage(DocxRenderContext context, List<VNode> sections) {
        addHeading(context, "目录", 1);
        for (int i = 0; i < sections.size(); i++) {
            VNode section = sections.get(i);
            String title = section.propString("title", "章节 " + (i + 1));
            XWPFParagraph p = context.document.createParagraph();
            XWPFRun run = p.createRun();
            run.setText(tocLabel(i + 1, title));
            run.setFontFamily(context.theme.fontPrimary());
            run.setFontSize(11);
            run.setColor(VisualStyle.toHexNoHash(context.theme.text()));
        }
        pageBreak(context.document);
    }

    private void addContentPages(DocxRenderContext context, List<VNode> sections) throws IOException {
        for (int i = 0; i < sections.size(); i++) {
            VNode section = sections.get(i);
            String title = section.propString("title", "章节 " + (i + 1));
            addHeading(context, title, 1);
            for (VNode block : section.childrenOrEmpty()) {
                nodeRenderers.render(context, block);
            }
            if (i < sections.size() - 1) {
                pageBreak(context.document);
            }
        }
    }

    private void addSummaryPage(DocxRenderContext context, Map<String, Object> props, List<VNode> sections) {
        pageBreak(context.document);
        String summaryTitle = str(props.get("summaryTitle"), "执行摘要");
        String summaryText = str(props.get("summaryText"), buildDefaultSummary(sections));
        addHeading(context, summaryTitle, 1);
        addCalloutParagraph(context, summaryText);
    }

    private void addHeading(DocxRenderContext context, String text, int level) {
        XWPFParagraph p = context.document.createParagraph();
        p.setAlignment(ParagraphAlignment.LEFT);
        p.setSpacingBefore(level <= 1 ? 100 : 60);
        p.setSpacingAfter(120);
        XWPFRun run = p.createRun();
        run.setText(text);
        run.setBold(true);
        run.setFontFamily(context.theme.fontPrimary());
        run.setColor(VisualStyle.toHexNoHash(context.theme.text()));
        run.setFontSize(level <= 1 ? 18 : 14);
    }

    private void addCalloutParagraph(DocxRenderContext context, String text) {
        XWPFTable table = context.document.createTable(1, 1);
        table.setWidth("100%");
        XWPFTableCell cell = table.getRow(0).getCell(0);
        cell.setColor(VisualStyle.toHexNoHash(context.theme.panelAlt()));
        XWPFParagraph p = cell.getParagraphArray(0);
        p.setSpacingAfter(0);
        XWPFRun run = p.createRun();
        run.setText(text);
        run.setFontFamily(context.theme.fontPrimary());
        run.setColor(VisualStyle.toHexNoHash(context.theme.text()));
        run.setFontSize(11);
    }

    private void addChartCard(DocxRenderContext context, ChartSpec spec, List<Map<String, Object>> rows) {
        boolean nativeRendered = renderNativeChartIfNeeded(context, spec, rows);
        if (nativeRendered) {
            XWPFParagraph gap = context.document.createParagraph();
            gap.setSpacingAfter(80);
            return;
        }

        XWPFTable table = context.document.createTable(2, 1);
        table.setWidth("100%");
        styleCell(table.getRow(0).getCell(0), context.theme.primarySoft());
        styleCell(table.getRow(1).getCell(0), context.theme.panelAlt());
        writeCellText(table.getRow(0).getCell(0), "图表: " + spec.title(), context.theme, true, 11, context.theme.text());
        if (rows == null || rows.isEmpty()) {
            writeCellText(table.getRow(1).getCell(0), "暂无可用数据，未生成原生图表。", context.theme, false, 10, context.theme.muted());
        } else {
            writeCellText(table.getRow(1).getCell(0), "当前图表未生成原生图表，已输出占位信息。", context.theme, false, 10, context.theme.muted());
        }
        addSampleRowPreview(context, rows);

        XWPFParagraph gap = context.document.createParagraph();
        gap.setSpacingAfter(80);
    }

    private void addSampleRowPreview(DocxRenderContext context, List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        List<String> columns = collectColumns(rows);
        if (columns.isEmpty()) {
            return;
        }
        int columnCount = Math.min(columns.size(), 6);
        XWPFTable table = context.document.createTable(1, columnCount);
        table.setWidth("100%");
        XWPFTableRow head = table.getRow(0);
        for (int i = 0; i < columnCount; i++) {
            XWPFTableCell cell = head.getCell(i);
            styleCell(cell, context.theme.primarySoft());
            writeCellText(cell, columns.get(i), context.theme, true, 10, context.theme.text());
        }

        int maxRows = Math.min(rows.size(), 8);
        for (int rowIdx = 0; rowIdx < maxRows; rowIdx++) {
            XWPFTableRow row = table.createRow();
            Map<String, Object> rowData = rows.get(rowIdx);
            for (int col = 0; col < columnCount; col++) {
                XWPFTableCell cell = row.getCell(col);
                if (cell == null) {
                    cell = row.addNewTableCell();
                }
                styleCell(cell, context.theme.panel());
                String value = str(rowData.get(columns.get(col)), "-");
                writeCellText(cell, value, context.theme, false, 10, context.theme.text());
            }
        }
    }

    private boolean renderNativeChartIfNeeded(DocxRenderContext context, ChartSpec spec, List<Map<String, Object>> rows) {
        boolean nativeChartEnabled = VNode.asBoolean(context.rootProps().get("nativeChartEnabled"), true);
        if (!nativeChartEnabled || rows == null || rows.isEmpty()) {
            return false;
        }
        try {
            XWPFParagraph paragraph = context.document.createParagraph();
            paragraph.setSpacingBefore(120);
            paragraph.setSpacingAfter(120);
            XWPFRun run = paragraph.createRun();

            int width = (int) VNode.asDouble(context.rootProps().get("nativeChartWidthEmu"), 6_000_000);
            int height = (int) VNode.asDouble(context.rootProps().get("nativeChartHeightEmu"), 3_200_000);
            XWPFChart chart = context.document.createChart(run, width, height);
            return poiChartRenderer.render(chart, spec, rows);
        } catch (Exception ignored) {
            return false;
        }
    }

    private List<String> collectColumns(List<Map<String, Object>> rows) {
        List<String> columns = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            for (String key : row.keySet()) {
                if (!columns.contains(key)) {
                    columns.add(key);
                }
            }
            if (columns.size() >= 6) {
                return columns;
            }
        }
        return columns;
    }

    private DocxChartFlavorRenderer resolveFlavor(String chartType) {
        for (DocxChartFlavorRenderer renderer : chartFlavorRenderers) {
            if (renderer.supports(chartType)) {
                return renderer;
            }
        }
        return chartFlavorRenderers.get(chartFlavorRenderers.size() - 1);
    }

    private void styleCell(XWPFTableCell cell, Color background) {
        cell.setColor(VisualStyle.toHexNoHash(background));
    }

    private void writeCellText(
            XWPFTableCell cell,
            String text,
            ThemeTokens theme,
            boolean bold,
            int fontSize,
            Color color
    ) {
        XWPFParagraph p = cell.getParagraphArray(0);
        p.setSpacingAfter(0);
        XWPFRun run = p.createRun();
        run.setText(text);
        run.setBold(bold);
        run.setFontFamily(theme.fontPrimary());
        run.setFontSize(fontSize);
        run.setColor(VisualStyle.toHexNoHash(color));
    }

    private static void appendFlavorRow(XWPFTable table, ThemeTokens theme, String text, Color bg, Color fg) {
        XWPFTableRow row = table.createRow();
        XWPFTableCell cell = row.getCell(0);
        cell.setColor(VisualStyle.toHexNoHash(bg));
        XWPFParagraph p = cell.getParagraphArray(0);
        p.setSpacingAfter(0);
        XWPFRun run = p.createRun();
        run.setText(text);
        run.setBold(false);
        run.setFontFamily(theme.fontPrimary());
        run.setFontSize(10);
        run.setColor(VisualStyle.toHexNoHash(fg));
    }

    private String defaultReportTitle(VDoc doc) {
        return doc.title == null || doc.title.isBlank() ? "报告" : doc.title;
    }

    private String buildDefaultSummary(List<VNode> sections) {
        int chartCount = 0;
        int textCount = 0;
        int advancedCharts = 0;
        for (VNode section : sections) {
            for (VNode block : section.childrenOrEmpty()) {
                if ("chart".equalsIgnoreCase(block.kind)) {
                    chartCount++;
                    ChartSpec spec = chartSpecParser.parse(block);
                    if ("advanced".equals(spec.complexityLevel()) || "enterprise".equals(spec.complexityLevel())) {
                        advancedCharts++;
                    }
                } else if ("text".equalsIgnoreCase(block.kind)) {
                    textCount++;
                }
            }
        }
        return "本报告共 " + sections.size() + " 个章节，包含 " + chartCount + " 张图表与 " + textCount
                + " 段文本。复杂图表数量: " + advancedCharts + "。";
    }

    private List<VNode> sectionNodes(VNode root) {
        if (root == null) {
            return Collections.emptyList();
        }
        List<VNode> sections = new ArrayList<>();
        for (VNode child : root.childrenOrEmpty()) {
            if ("section".equalsIgnoreCase(child.kind)) {
                sections.add(child);
            }
        }
        return sections;
    }

    private boolean bool(Object value, boolean fallback) {
        return VNode.asBoolean(value, fallback);
    }

    private String str(Object value, String fallback) {
        String s = VNode.asString(value, fallback);
        return s == null ? fallback : s;
    }

    private static void pageBreak(XWPFDocument document) {
        XWPFParagraph p = document.createParagraph();
        p.setPageBreak(true);
    }

    private String tocLabel(int index, String title) {
        if (title == null) {
            return index + ". 章节 " + index;
        }
        String trimmed = title.trim();
        if (trimmed.matches("^\\d+[\\.、]\\s*.*")) {
            return trimmed;
        }
        return index + ". " + trimmed;
    }

    public static final class DocxRenderContext {
        private final XWPFDocument document;
        private final ThemeTokens theme;
        private final ChartSpecParser chartSpecParser;
        private final Map<String, Object> rootProps;
        private final VDoc doc;

        private DocxRenderContext(
                XWPFDocument document,
                ThemeTokens theme,
                ChartSpecParser chartSpecParser,
                Map<String, Object> rootProps,
                VDoc doc
        ) {
            this.document = document;
            this.theme = theme;
            this.chartSpecParser = chartSpecParser;
            this.rootProps = rootProps;
            this.doc = doc;
        }

        public XWPFDocument document() {
            return document;
        }

        public ThemeTokens theme() {
            return theme;
        }

        public ChartSpecParser chartSpecParser() {
            return chartSpecParser;
        }

        public Map<String, Object> rootProps() {
            return rootProps;
        }

        public VDoc doc() {
            return doc;
        }
    }

    public static final class DocxChartFlavorContext {
        private final XWPFTable table;
        private final ThemeTokens theme;

        private DocxChartFlavorContext(XWPFTable table, ThemeTokens theme) {
            this.table = table;
            this.theme = theme;
        }

        public ThemeTokens theme() {
            return theme;
        }

        public void appendInfoRow(String text) {
            appendFlavorRow(table, theme, text, theme.panelAlt(), theme.text());
        }

        public void appendRow(String text, Color bg, Color fg) {
            appendFlavorRow(table, theme, text, bg, fg);
        }
    }

    private final class TextNodeRenderer implements NodeRenderer<DocxRenderContext> {
        @Override
        public String kind() {
            return "text";
        }

        @Override
        public void render(DocxRenderContext context, VNode node) {
            addCalloutParagraph(context, node.propString("text", ""));
        }
    }

    private final class ChartNodeRenderer implements NodeRenderer<DocxRenderContext> {
        @Override
        public String kind() {
            return "chart";
        }

        @Override
        public void render(DocxRenderContext context, VNode node) {
            ChartSpec spec = context.chartSpecParser.parse(node);
            List<Map<String, Object>> rows = chartRowResolver.resolve(context.doc(), node, spec);
            addChartCard(context, spec, rows);
        }
    }

    private final class UnsupportedNodeRenderer implements NodeRenderer<DocxRenderContext> {
        @Override
        public String kind() {
            return "__fallback__";
        }

        @Override
        public void render(DocxRenderContext context, VNode node) {
            XWPFParagraph p = context.document.createParagraph();
            XWPFRun run = p.createRun();
            run.setText("未支持块类型: " + (node == null ? "-" : str(node.kind, "-")));
            run.setFontFamily(context.theme.fontPrimary());
            run.setColor(VisualStyle.toHexNoHash(context.theme.muted()));
            run.setFontSize(10);
        }
    }

    public interface DocxChartFlavorRenderer {
        boolean supports(String chartType);

        void render(DocxChartFlavorContext context, ChartSpec spec);
    }

    private final class TrendFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            String normalized = normalize(chartType);
            return normalized.equals("line")
                    || normalized.equals("scatter")
                    || normalized.equals("combo")
                    || normalized.equals("parallel");
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("趋势策略: 适合时间序列与连续变化，建议维度字段使用日期/时间，保持指标不超过 8 个。");
        }
    }

    private final class ComparisonFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            String normalized = normalize(chartType);
            return normalized.equals("bar")
                    || normalized.equals("radar")
                    || normalized.equals("boxplot");
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("对比策略: 适合分类对比，支持分组/堆叠；若类目超过 20，建议先做 TopN 或分页筛选。");
        }
    }

    private final class CompositionFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            String normalized = normalize(chartType);
            return normalized.equals("pie");
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("构成策略: 适合份额分布，建议维度类别不超过 10，其他项可归并为“其他”。");
        }
    }

    private final class TableFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            String normalized = normalize(chartType);
            return normalized.equals("heatmap");
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("明细策略: 适合高复杂度明细分析，支持样本预览。建议配合过滤器和计算字段控制输出规模。");
        }
    }

    private final class RelationFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            String normalized = normalize(chartType);
            return normalized.equals("sankey") || normalized.equals("graph");
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("关系策略: 支持链路/关系表达，建议补充 node/link 绑定并控制节点规模。");
        }
    }

    private final class MatrixFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            String normalized = normalize(chartType);
            return normalized.equals("treemap")
                    || normalized.equals("sunburst")
                    || normalized.equals("funnel")
                    || normalized.equals("gauge");
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("层次策略: 适合结构化占比表达，可按层级分组输出核心路径。");
        }
    }

    private final class TimeWindowFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            String normalized = normalize(chartType);
            return normalized.equals("calendar")
                    || normalized.equals("kline");
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("时窗策略: 适合日期/交易序列，建议使用 day/week/month 粒度字段。");
        }
    }

    private final class CustomFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            return normalize(chartType).equals("custom");
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("自定义策略: 已输出可商用基础渲染，可通过 optionPatch/插件策略扩展。");
        }
    }

    private final class GenericFlavorRenderer implements DocxChartFlavorRenderer {
        @Override
        public boolean supports(String chartType) {
            return true;
        }

        @Override
        public void render(DocxChartFlavorContext context, ChartSpec spec) {
            context.appendInfoRow("通用策略: 当前图表类型未命中专用渲染器，已走通用图卡渲染，可按 chartType 扩展专用策略。");
        }
    }

    private String normalize(String chartType) {
        return ChartTypeCatalog.normalize(chartType);
    }
}
