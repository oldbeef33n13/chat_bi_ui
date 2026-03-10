package com.chatbi.app.api.render;

import com.chatbi.app.application.render.ExportService;
import com.chatbi.app.domain.render.ArtifactRecord;
import com.chatbi.app.domain.render.RenderRunRecord;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ExportController {

  private final ExportService exportService;

  public ExportController(ExportService exportService) {
    this.exportService = exportService;
  }

  @PostMapping("/templates/{templateId}/exports")
  public CreateExportRunResponse exportTemplate(
    @PathVariable String templateId,
    @Valid @RequestBody CreateExportRunRequest request
  ) {
    return RenderResponseMapper.toAcceptedResponse(exportService.requestExport(templateId, request));
  }

  @GetMapping("/runs/{runId}")
  public RenderRunResponse getRun(@PathVariable String runId) {
    RenderRunRecord run = exportService.getRun(runId);
    List<ArtifactRecord> artifacts = exportService.listArtifacts(runId);
    return RenderResponseMapper.toRunResponse(run, artifacts);
  }

  @GetMapping("/runs/{runId}/artifacts")
  public List<ArtifactResponse> listArtifacts(@PathVariable String runId) {
    return exportService.listArtifacts(runId).stream().map(RenderResponseMapper::toArtifactResponse).toList();
  }
}
