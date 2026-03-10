package com.chatbi.app.application.render;

import com.chatbi.app.api.render.CreateExportRunRequest;
import com.chatbi.app.common.error.BadRequestException;
import com.chatbi.app.common.error.NotFoundException;
import com.chatbi.app.domain.render.ArtifactRecord;
import com.chatbi.app.domain.render.ArtifactType;
import com.chatbi.app.domain.render.OutputType;
import com.chatbi.app.domain.render.RenderRunRecord;
import com.chatbi.app.domain.render.RunStatus;
import com.chatbi.app.domain.render.RunTriggerType;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.infra.db.render.RenderRunJdbcRepository;
import com.chatbi.app.infra.exporter.ExporterAdapter;
import com.chatbi.app.infra.files.StorageDirectories;
import com.chatbi.app.application.template.TemplateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class ExportService {
  private static final DateTimeFormatter FILE_TIME_FORMAT =
    DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.systemDefault());

  private final TemplateService templateService;
  private final RenderRunJdbcRepository renderRunRepository;
  private final StorageDirectories storageDirectories;
  private final ObjectMapper objectMapper;
  private final ExporterAdapter exporterAdapter;
  private final Executor exportTaskExecutor;
  private final TemplateSnapshotService templateSnapshotService;

  public ExportService(
    TemplateService templateService,
    RenderRunJdbcRepository renderRunRepository,
    StorageDirectories storageDirectories,
    ObjectMapper objectMapper,
    ExporterAdapter exporterAdapter,
    TemplateSnapshotService templateSnapshotService,
    @Qualifier("exportTaskExecutor") Executor exportTaskExecutor
  ) {
    this.templateService = templateService;
    this.renderRunRepository = renderRunRepository;
    this.storageDirectories = storageDirectories;
    this.objectMapper = objectMapper;
    this.exporterAdapter = exporterAdapter;
    this.templateSnapshotService = templateSnapshotService;
    this.exportTaskExecutor = exportTaskExecutor;
  }

  public RenderRunRecord requestExport(String templateId, CreateExportRunRequest request) {
    return requestExport(
      templateId,
      request.outputType(),
      request.variables(),
      RunTriggerType.MANUAL_EXPORT,
      null
    );
  }

  public RenderRunRecord requestExport(
    String templateId,
    OutputType outputType,
    Map<String, Object> variables,
    RunTriggerType triggerType,
    String scheduleJobId
  ) {
    TemplateMeta meta = templateService.getTemplateMeta(templateId);
    if (outputType.templateType() != meta.templateType()) {
      throw new BadRequestException("outputType 与模板类型不匹配");
    }

    TemplateContent content = templateService.getCurrent(templateId);
    Instant now = Instant.now();
    RenderRunRecord run = new RenderRunRecord(
      "run-" + UUID.randomUUID().toString().substring(0, 8),
      triggerType,
      templateId,
      scheduleJobId,
      content.revision(),
      outputType,
      RunStatus.QUEUED,
      variables == null ? Collections.emptyMap() : variables,
      null,
      null,
      null,
      now
    );
    renderRunRepository.insertRun(run);
    exportTaskExecutor.execute(() -> executeRun(run, meta, content));
    return run;
  }

  public RenderRunRecord getRun(String runId) {
    return renderRunRepository.findRun(runId)
      .orElseThrow(() -> new NotFoundException("执行记录不存在: " + runId));
  }

  public List<ArtifactRecord> listArtifacts(String runId) {
    getRun(runId);
    return renderRunRepository.listArtifacts(runId);
  }

  public ArtifactRecord getArtifact(String artifactId) {
    return renderRunRepository.findArtifact(artifactId)
      .orElseThrow(() -> new NotFoundException("产物不存在: " + artifactId));
  }

  public Path getArtifactFile(String artifactId) {
    return storageDirectories.requireExistingFile(Path.of(getArtifact(artifactId).filePath()));
  }

  private void executeRun(RenderRunRecord run, TemplateMeta meta, TemplateContent content) {
    Instant startedAt = Instant.now();
    renderRunRepository.markRunning(run.id(), startedAt);
    try {
      JsonNode snapshotDsl = templateSnapshotService.renderSnapshot(content.dsl(), run.variables()).snapshot();
      if (run.outputType() == OutputType.DASHBOARD_SNAPSHOT_JSON) {
        ArtifactRecord snapshotArtifact = writeSnapshotArtifact(
          run.id(),
          snapshotDsl,
          ArtifactType.DASHBOARD_SNAPSHOT_JSON,
          buildFileName(meta.name(), startedAt, "snapshot", "json"),
          "application/json"
        );
        renderRunRepository.insertArtifact(snapshotArtifact);
      } else if (run.outputType() == OutputType.REPORT_DOCX) {
        ArtifactRecord snapshotArtifact = writeSnapshotArtifact(
          run.id(),
          snapshotDsl,
          ArtifactType.SNAPSHOT_VDOC_JSON,
          buildFileName(meta.name(), startedAt, "snapshot", "json"),
          "application/json"
        );
        renderRunRepository.insertArtifact(snapshotArtifact);

        ArtifactRecord docxArtifact = writeBinaryArtifact(
          run.id(),
          ArtifactType.REPORT_DOCX,
          buildFileName(meta.name(), startedAt, "report", "docx"),
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          path -> exporterAdapter.exportReport(snapshotDsl, path)
        );
        renderRunRepository.insertArtifact(docxArtifact);
      } else if (run.outputType() == OutputType.PPT_PPTX) {
        ArtifactRecord snapshotArtifact = writeSnapshotArtifact(
          run.id(),
          snapshotDsl,
          ArtifactType.SNAPSHOT_VDOC_JSON,
          buildFileName(meta.name(), startedAt, "snapshot", "json"),
          "application/json"
        );
        renderRunRepository.insertArtifact(snapshotArtifact);

        ArtifactRecord pptxArtifact = writeBinaryArtifact(
          run.id(),
          ArtifactType.PPT_PPTX,
          buildFileName(meta.name(), startedAt, "deck", "pptx"),
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          path -> exporterAdapter.exportPpt(snapshotDsl, path)
        );
        renderRunRepository.insertArtifact(pptxArtifact);
      }
      renderRunRepository.markSucceeded(run.id(), Instant.now());
    } catch (Exception ex) {
      renderRunRepository.markFailed(run.id(), Instant.now(), trimError(ex.getMessage()));
    }
  }

  private ArtifactRecord writeSnapshotArtifact(
    String runId,
    JsonNode snapshotDsl,
    ArtifactType artifactType,
    String fileName,
    String contentType
  ) throws IOException {
    String artifactId = "artifact-" + UUID.randomUUID().toString().substring(0, 8);
    Path path = storageDirectories.resolveArtifactPath(runId, artifactId, fileExtension(fileName));
    objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), snapshotDsl);
    return new ArtifactRecord(
      artifactId,
      runId,
      artifactType,
      fileName,
      path.toString(),
      contentType,
      Files.size(path),
      Instant.now()
    );
  }

  private ArtifactRecord writeBinaryArtifact(
    String runId,
    ArtifactType artifactType,
    String fileName,
    String contentType,
    BinaryArtifactWriter writer
  ) throws IOException {
    String artifactId = "artifact-" + UUID.randomUUID().toString().substring(0, 8);
    Path path = storageDirectories.resolveArtifactPath(runId, artifactId, fileExtension(fileName));
    writer.write(path);
    return new ArtifactRecord(
      artifactId,
      runId,
      artifactType,
      fileName,
      path.toString(),
      contentType,
      Files.size(path),
      Instant.now()
    );
  }

  private String buildFileName(String templateName, Instant startedAt, String suffix, String ext) {
    return sanitizeFileName(templateName) + "-" + FILE_TIME_FORMAT.format(startedAt) + "-" + suffix + "." + ext;
  }

  private String sanitizeFileName(String raw) {
    String safe = raw == null || raw.isBlank() ? "template" : raw.trim();
    return safe.replaceAll("[\\\\/:*?\"<>|\\s]+", "-").replaceAll("-{2,}", "-").replaceAll("^-|-$", "");
  }

  private String fileExtension(String fileName) {
    int dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 && dotIndex < fileName.length() - 1 ? fileName.substring(dotIndex + 1).toLowerCase(Locale.ROOT) : "bin";
  }

  private String trimError(String raw) {
    if (raw == null || raw.isBlank()) {
      return "Unknown export error";
    }
    return raw.length() > 500 ? raw.substring(0, 500) : raw;
  }

  @FunctionalInterface
  private interface BinaryArtifactWriter {
    void write(Path outputPath) throws IOException;
  }
}
