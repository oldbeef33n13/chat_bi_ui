package com.chatbi.exporter;

import com.chatbi.exporter.core.ExportRequest;
import com.chatbi.exporter.core.ExportTarget;
import com.chatbi.exporter.core.ExporterOrchestrator;
import com.chatbi.exporter.core.VDocValidator;
import com.chatbi.exporter.docx.ReportDocxExporter;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.pptx.DeckPptxExporter;
import com.chatbi.exporter.util.DslReader;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExamplesExportRegressionTest {

    private static final Path MODULE_EXAMPLES_DIR = Path.of("examples");
    private static final Path REPO_EXAMPLES_DIR = Path.of("tools", "poi-dsl-exporter", "examples");
    private static final Path MODULE_TARGET_OUT_DIR = Path.of("target", "regression-out");
    private static final Path REPO_TARGET_OUT_DIR = Path.of("tools", "poi-dsl-exporter", "target", "regression-out");
    private static final Path MODULE_SHOWCASE_OUT_DIR = Path.of("showcase-out");
    private static final Path REPO_SHOWCASE_OUT_DIR = Path.of("tools", "poi-dsl-exporter", "showcase-out");
    private static final String TABLE_SEED = "ppt-table-showcase.json";
    private static final String PIVOT_SEED = "ppt-table-pivot-showcase.json";
    private static final List<String> REQUIRED_ALIAS_PPTS = List.of(
            "ppt-table-pivot-showcase-rerun2.pptx",
            "ppt-table-showcase-rerun2.pptx",
            "ppt-table-pivot-showcase-rerun3.pptx",
            "ppt-table-showcase-rerun3.pptx",
            "ppt-table-showcase-rerun.pptx",
            "ppt-table-pivot-showcase.pptx"
    );

    @Test
    void exportAllExamplesAndVerifyOpenability() throws Exception {
        Path examplesDir = resolveExistingPath(MODULE_EXAMPLES_DIR, REPO_EXAMPLES_DIR);
        Path targetOutDir = resolvePreferredPath(MODULE_TARGET_OUT_DIR, REPO_TARGET_OUT_DIR);

        assertTrue(Files.isDirectory(examplesDir), "examples dir not found: " + examplesDir);
        recreateDirectory(targetOutDir);

        List<Path> examples;
        try (var stream = Files.list(examplesDir)) {
            examples = stream
                    .filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList();
        }
        assertFalse(examples.isEmpty(), "no example json files under: " + examplesDir);

        ExporterOrchestrator orchestrator = newOrchestrator();
        int pptCount = 0;
        int docCount = 0;
        for (Path input : examples) {
            VDoc doc = DslReader.read(input);
            ExportTarget target = resolveTarget(doc);
            String baseName = stripJsonExt(input.getFileName().toString());
            String ext = target == ExportTarget.DOCX ? ".docx" : ".pptx";
            Path output = targetOutDir.resolve(baseName + ext);

            orchestrator.export(doc, target, output, new ExportRequest(null, true));
            assertTrue(Files.exists(output), "output missing: " + output);
            assertTrue(Files.size(output) > 0, "output empty: " + output);
            assertOpenable(output, target);

            if (target == ExportTarget.PPTX) {
                pptCount += 1;
            } else {
                docCount += 1;
            }
        }
        assertTrue(pptCount > 0, "no ppt examples exported");
        assertTrue(docCount > 0, "no doc examples exported");
    }

    @Test
    void generateRequiredAliasPptFilesForManualVerification() throws Exception {
        Path examplesDir = resolveExistingPath(MODULE_EXAMPLES_DIR, REPO_EXAMPLES_DIR);
        Path showcaseOutDir = resolvePreferredPath(MODULE_SHOWCASE_OUT_DIR, REPO_SHOWCASE_OUT_DIR);

        Path tableSeed = examplesDir.resolve(TABLE_SEED);
        Path pivotSeed = examplesDir.resolve(PIVOT_SEED);
        assertTrue(Files.exists(tableSeed), "table seed not found: " + tableSeed);
        assertTrue(Files.exists(pivotSeed), "pivot seed not found: " + pivotSeed);
        VDoc tableDoc = DslReader.read(tableSeed);
        VDoc pivotDoc = DslReader.read(pivotSeed);

        ExporterOrchestrator orchestrator = newOrchestrator();
        Files.createDirectories(showcaseOutDir);

        for (String fileName : REQUIRED_ALIAS_PPTS) {
            Path output = showcaseOutDir.resolve(fileName);
            VDoc seedDoc = fileName.contains("pivot") ? pivotDoc : tableDoc;
            orchestrator.export(seedDoc, ExportTarget.PPTX, output, new ExportRequest(null, true));
            assertTrue(Files.exists(output), "alias file missing: " + output);
            assertTrue(Files.size(output) > 0, "alias file empty: " + output);
            assertOpenable(output, ExportTarget.PPTX);
            assertPptContainsTable(output);
            assertPptNoEmptyTextBody(output);
        }
    }

    private ExporterOrchestrator newOrchestrator() {
        return new ExporterOrchestrator(
                List.of(new ReportDocxExporter(), new DeckPptxExporter()),
                new VDocValidator()
        );
    }

    private ExportTarget resolveTarget(VDoc doc) {
        if (doc != null && "report".equalsIgnoreCase(doc.docType)) {
            return ExportTarget.DOCX;
        }
        if (doc != null && "ppt".equalsIgnoreCase(doc.docType)) {
            return ExportTarget.PPTX;
        }
        throw new IllegalArgumentException("Unsupported docType: " + (doc == null ? "<null>" : doc.docType));
    }

    private String stripJsonExt(String fileName) {
        if (fileName == null || !fileName.endsWith(".json")) {
            return fileName == null ? "unknown" : fileName;
        }
        return fileName.substring(0, fileName.length() - 5);
    }

    private void assertOpenable(Path output, ExportTarget target) throws Exception {
        if (target == ExportTarget.DOCX) {
            try (InputStream in = Files.newInputStream(output); XWPFDocument ignored = new XWPFDocument(in)) {
                // open successfully means package structure is valid
            }
            return;
        }
        try (InputStream in = Files.newInputStream(output); XMLSlideShow show = new XMLSlideShow(in)) {
            assertTrue(show.getSlides().size() >= 1, "ppt has no slides: " + output);
        }
    }

    private void assertPptContainsTable(Path pptFile) throws IOException {
        boolean found = false;
        try (ZipFile zipFile = new ZipFile(pptFile.toFile())) {
            var entries = zipFile.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                if (!entry.getName().startsWith("ppt/slides/slide") || !entry.getName().endsWith(".xml")) {
                    continue;
                }
                String xml;
                try (InputStream in = zipFile.getInputStream(entry)) {
                    xml = new String(in.readAllBytes());
                } catch (IOException ex) {
                    throw new UncheckedIOException(ex);
                }
                if (xml.contains("<a:tbl")) {
                    found = true;
                    break;
                }
            }
        } catch (UncheckedIOException ex) {
            throw ex.getCause();
        }
        assertTrue(found, "ppt does not contain native table xml: " + pptFile);
    }

    private void assertPptNoEmptyTextBody(Path pptFile) throws IOException {
        int emptyCount = 0;
        try (ZipFile zipFile = new ZipFile(pptFile.toFile())) {
            var entries = zipFile.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                if (!entry.getName().startsWith("ppt/slides/slide") || !entry.getName().endsWith(".xml")) {
                    continue;
                }
                String xml;
                try (InputStream in = zipFile.getInputStream(entry)) {
                    xml = new String(in.readAllBytes());
                } catch (IOException ex) {
                    throw new UncheckedIOException(ex);
                }
                int index = 0;
                while ((index = xml.indexOf("<a:txBody/>", index)) >= 0) {
                    emptyCount++;
                    index += 10;
                }
            }
        } catch (UncheckedIOException ex) {
            throw ex.getCause();
        }
        assertEquals(0, emptyCount, "ppt contains invalid empty text body nodes: " + pptFile);
    }

    private void recreateDirectory(Path directory) throws IOException {
        if (Files.exists(directory)) {
            try (var stream = Files.walk(directory)) {
                stream.sorted(Comparator.reverseOrder())
                        .forEach(path -> {
                            try {
                                Files.deleteIfExists(path);
                            } catch (IOException ex) {
                                throw new RuntimeException("failed to clean path: " + path, ex);
                            }
                        });
            }
        }
        Files.createDirectories(directory);
    }

    private Path resolveExistingPath(Path preferred, Path fallback) {
        if (Files.exists(preferred)) {
            return preferred;
        }
        return fallback;
    }

    private Path resolvePreferredPath(Path preferred, Path fallback) {
        if (Files.exists(preferred.getParent() == null ? Path.of(".") : preferred.getParent())) {
            return preferred;
        }
        return fallback;
    }
}
