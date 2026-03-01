package com.chatbi.exporter.core;

import com.chatbi.exporter.model.VDoc;

import java.io.IOException;
import java.nio.file.Path;

public interface DocumentExporter {
    ExportTarget target();

    boolean supports(VDoc doc);

    void export(VDoc doc, Path output, ExportRequest request) throws IOException;
}
