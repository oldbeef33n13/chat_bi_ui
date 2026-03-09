package com.chatbi.app.api.template;

import com.chatbi.app.application.template.TemplateService;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.domain.template.TemplatePage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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

  public TemplateController(TemplateService templateService) {
    this.templateService = templateService;
  }

  @GetMapping
  public TemplatePageResponse listTemplates(
    @RequestParam(defaultValue = "all") String type,
    @RequestParam(defaultValue = "all") String status,
    @RequestParam(defaultValue = "") String q,
    @RequestParam(defaultValue = "1") @Min(1) int page,
    @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize
  ) {
    TemplatePage result = templateService.listTemplates(type, status, q, page, pageSize);
    return TemplateResponseMapper.toPageResponse(result);
  }

  @PostMapping
  public ResponseEntity<TemplateVersionBundleResponse> createTemplate(@Valid @RequestBody CreateTemplateRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(
      TemplateResponseMapper.toBundleResponse(templateService.createTemplate(request))
    );
  }

  @GetMapping("/{templateId}")
  public TemplateMetaResponse getTemplateMeta(@PathVariable String templateId) {
    TemplateMeta meta = templateService.getTemplateMeta(templateId);
    return TemplateResponseMapper.toMetaResponse(meta);
  }

  @GetMapping("/{templateId}/draft")
  public TemplateContentResponse getDraft(@PathVariable String templateId) {
    TemplateContent content = templateService.getDraft(templateId);
    return TemplateResponseMapper.toContentResponse(content);
  }

  @GetMapping("/{templateId}/published")
  public TemplateContentResponse getPublished(@PathVariable String templateId) {
    TemplateContent content = templateService.getPublished(templateId);
    return TemplateResponseMapper.toContentResponse(content);
  }

  @PutMapping("/{templateId}/draft")
  public TemplateSaveDraftResponse saveDraft(
    @PathVariable String templateId,
    @Valid @RequestBody SaveDraftRequest request
  ) {
    return TemplateResponseMapper.toSaveDraftResponse(
      templateService.saveDraft(templateId, request),
      templateService.getDraft(templateId)
    );
  }

  @PostMapping("/{templateId}/publish")
  public TemplateVersionBundleResponse publishDraft(
    @PathVariable String templateId,
    @RequestBody(required = false) PublishTemplateRequest request
  ) {
    return TemplateResponseMapper.toBundleResponse(
      templateService.publishDraft(templateId, request == null ? null : request.fromDraftRevision())
    );
  }

  @PostMapping("/{templateId}/discard-draft")
  public TemplateSaveDraftResponse discardDraft(@PathVariable String templateId) {
    TemplateMeta meta = templateService.discardDraft(templateId);
    return TemplateResponseMapper.toSaveDraftResponse(meta, templateService.getDraft(templateId));
  }
}
