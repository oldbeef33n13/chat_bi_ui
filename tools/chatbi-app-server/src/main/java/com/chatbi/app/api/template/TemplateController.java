package com.chatbi.app.api.template;

import com.chatbi.app.application.render.TemplateSnapshotService;
import com.chatbi.app.application.template.TemplateService;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateDocument;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.domain.template.TemplatePage;
import com.chatbi.app.domain.template.TemplateRevisionEntry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/templates")
public class TemplateController {

  private final TemplateService templateService;
  private final TemplateSnapshotService templateSnapshotService;

  public TemplateController(TemplateService templateService, TemplateSnapshotService templateSnapshotService) {
    this.templateService = templateService;
    this.templateSnapshotService = templateSnapshotService;
  }

  @GetMapping
  public TemplatePageResponse listTemplates(
    @RequestParam(defaultValue = "all") String type,
    @RequestParam(defaultValue = "") String q,
    @RequestParam(defaultValue = "1") @Min(1) int page,
    @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize
  ) {
    TemplatePage result = templateService.listTemplates(type, q, page, pageSize);
    return TemplateResponseMapper.toPageResponse(result);
  }

  @GetMapping("/seeds")
  public TemplateSeedListResponse listSeedTemplates() {
    return TemplateResponseMapper.toSeedListResponse(templateService.listSeedDefinitions());
  }

  @PostMapping
  public ResponseEntity<TemplateDocumentResponse> createTemplate(@Valid @RequestBody CreateTemplateRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(
      TemplateResponseMapper.toDocumentResponse(templateService.createTemplate(request))
    );
  }

  @GetMapping("/{templateId}")
  public TemplateMetaResponse getTemplateMeta(@PathVariable String templateId) {
    TemplateMeta meta = templateService.getTemplateMeta(templateId);
    return TemplateResponseMapper.toMetaResponse(meta);
  }

  @GetMapping("/{templateId}/content")
  public TemplateContentResponse getContent(@PathVariable String templateId) {
    TemplateContent content = templateService.getCurrent(templateId);
    return TemplateResponseMapper.toContentResponse(content);
  }

  @GetMapping("/{templateId}/revisions")
  public List<TemplateRevisionResponse> listRevisions(@PathVariable String templateId) {
    List<TemplateRevisionEntry> revisions = templateService.listRevisions(templateId);
    return revisions.stream().map(TemplateResponseMapper::toRevisionResponse).toList();
  }

  @PostMapping("/{templateId}/publish")
  public TemplateDocumentResponse publish(
    @PathVariable String templateId,
    @Valid @RequestBody PublishTemplateRequest request
  ) {
    return TemplateResponseMapper.toDocumentResponse(
      templateService.publish(templateId, request.dsl(), request.baseRevision())
    );
  }

  @PostMapping("/{templateId}/restore/{revision}")
  public TemplateDocumentResponse restoreRevision(@PathVariable String templateId, @PathVariable int revision) {
    TemplateDocument document = templateService.restoreRevision(templateId, revision);
    return TemplateResponseMapper.toDocumentResponse(document);
  }

  @PostMapping("/{templateId}/preview")
  public TemplatePreviewResponse previewTemplate(
    @PathVariable String templateId,
    @RequestBody(required = false) CreatePreviewRequest request
  ) {
    return TemplatePreviewResponseMapper.toResponse(
      templateSnapshotService.previewTemplate(
        templateId,
        request == null ? null : request.dsl(),
        request == null ? null : request.variables()
      )
    );
  }
}
