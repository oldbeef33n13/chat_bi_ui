package com.chatbi.app.infra.exporter;

import com.chatbi.exporter.core.ExportRequest;
import com.chatbi.exporter.core.ExportTarget;
import com.chatbi.exporter.core.ExporterOrchestrator;
import com.chatbi.exporter.core.VDocValidator;
import com.chatbi.exporter.docx.ReportDocxExporter;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.pptx.DeckPptxExporter;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ExporterAdapter {

  private final ObjectMapper exporterMapper;
  private final ExporterOrchestrator orchestrator;

  public ExporterAdapter() {
    this.exporterMapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    this.orchestrator = new ExporterOrchestrator(
      List.of(new ReportDocxExporter(), new DeckPptxExporter()),
      new VDocValidator()
    );
  }

  public void exportReport(JsonNode snapshotDsl, Path outputPath) throws IOException {
    orchestrator.export(toExporterDoc(snapshotDsl), ExportTarget.DOCX, outputPath, ExportRequest.defaults());
  }

  public void exportPpt(JsonNode snapshotDsl, Path outputPath) throws IOException {
    orchestrator.export(toExporterDoc(snapshotDsl), ExportTarget.PPTX, outputPath, ExportRequest.defaults());
  }

  private VDoc toExporterDoc(JsonNode snapshotDsl) throws IOException {
    return exporterMapper.treeToValue(snapshotDsl, VDoc.class);
  }
}
