package com.chatbi.exporter.core;

import com.chatbi.exporter.model.VDoc;

import java.io.IOException;
import java.nio.file.Path;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public final class ExporterOrchestrator {
    private final Map<ExportTarget, DocumentExporter> exporters;
    private final VDocValidator validator;

    public ExporterOrchestrator(List<DocumentExporter> exporterList, VDocValidator validator) {
        EnumMap<ExportTarget, DocumentExporter> map = new EnumMap<>(ExportTarget.class);
        for (DocumentExporter exporter : exporterList) {
            map.put(exporter.target(), exporter);
        }
        this.exporters = map;
        this.validator = validator;
    }

    public void export(VDoc doc, ExportTarget target, Path output, ExportRequest request) throws IOException {
        ExportRequest safeRequest = request == null ? ExportRequest.defaults() : request;
        validator.ensureValid(doc, safeRequest.strictValidation());
        DocumentExporter exporter = exporters.get(target);
        if (exporter == null) {
            throw new IllegalArgumentException("No exporter registered for target: " + target);
        }
        if (!exporter.supports(doc)) {
            throw new IllegalArgumentException("Target " + target + " does not support docType: " + doc.docType);
        }
        exporter.export(doc, output, safeRequest);
    }
}
