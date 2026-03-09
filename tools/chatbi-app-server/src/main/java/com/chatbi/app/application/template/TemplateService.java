package com.chatbi.app.application.template;

import com.chatbi.app.api.template.CreateTemplateRequest;
import com.chatbi.app.api.template.SaveDraftRequest;
import com.chatbi.app.common.error.BadRequestException;
import com.chatbi.app.common.error.ConflictException;
import com.chatbi.app.common.error.NotFoundException;
import com.chatbi.app.domain.template.RevisionChannel;
import com.chatbi.app.domain.template.StoredTemplateState;
import com.chatbi.app.domain.template.TemplateBundle;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateListQuery;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.domain.template.TemplatePage;
import com.chatbi.app.domain.template.TemplateRevisions;
import com.chatbi.app.domain.template.TemplateType;
import com.chatbi.app.domain.template.WorkspaceStatus;
import com.chatbi.app.infra.db.template.TemplateJdbcRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TemplateService {

  private final TemplateJdbcRepository templateRepository;
  private final TemplateDslFactory templateDslFactory;

  public TemplateService(TemplateJdbcRepository templateRepository, TemplateDslFactory templateDslFactory) {
    this.templateRepository = templateRepository;
    this.templateDslFactory = templateDslFactory;
  }

  public TemplatePage listTemplates(String type, String status, String q, int page, int pageSize) {
    return templateRepository.listTemplates(new TemplateListQuery(type, status, q, page, pageSize));
  }

  public TemplateMeta getTemplateMeta(String templateId) {
    return toMeta(requireState(templateId));
  }

  public TemplateContent getDraft(String templateId) {
    StoredTemplateState state = requireState(templateId);
    return templateRepository.findContent(templateId, RevisionChannel.DRAFT, state.draftRevision())
      .orElseThrow(() -> new NotFoundException("草稿版本不存在: " + templateId));
  }

  public TemplateContent getPublished(String templateId) {
    StoredTemplateState state = requireState(templateId);
    return templateRepository.findContent(templateId, RevisionChannel.PUBLISHED, state.publishedRevision())
      .orElseThrow(() -> new NotFoundException("发布版本不存在: " + templateId));
  }

  @Transactional
  public TemplateBundle createTemplate(CreateTemplateRequest request) {
    Instant now = Instant.now();
    String templateId = generateTemplateId(request.templateType());
    JsonNode dsl = templateDslFactory.createDefaultDsl(templateId, request);
    String name = pickDisplayName(request.templateType(), request.name(), dsl);
    String description = blankToDefault(request.description(), "新建模板");
    List<String> tags = sanitizeTags(request.tags(), request.templateType());

    templateRepository.insertTemplate(
      templateId,
      request.templateType(),
      name,
      description,
      WorkspaceStatus.DRAFT,
      tags,
      1,
      1,
      now
    );
    templateRepository.insertRevision(templateId, 1, RevisionChannel.PUBLISHED, dsl, now, "system");
    templateRepository.insertRevision(templateId, 1, RevisionChannel.DRAFT, dsl, now, "system");
    return getBundle(templateId);
  }

  @Transactional
  public TemplateMeta saveDraft(String templateId, SaveDraftRequest request) {
    StoredTemplateState state = requireState(templateId);
    JsonNode dsl = validateDsl(request.dsl());
    if (request.baseRevision() != null && request.baseRevision() != state.draftRevision()) {
      throw new ConflictException("草稿已被更新，请刷新后重试");
    }
    int nextRevision = Math.max(state.draftRevision(), state.publishedRevision()) + 1;
    Instant now = Instant.now();

    templateRepository.insertRevision(templateId, nextRevision, RevisionChannel.DRAFT, dsl, now, "system");
    templateRepository.updateDraftPointer(
      templateId,
      nextRevision,
      WorkspaceStatus.DRAFT,
      pickDisplayName(state.templateType(), null, dsl),
      state.description(),
      state.tags(),
      now
    );
    return getTemplateMeta(templateId);
  }

  @Transactional
  public TemplateBundle publishDraft(String templateId, Integer fromDraftRevision) {
    StoredTemplateState state = requireState(templateId);
    if (fromDraftRevision != null && fromDraftRevision != state.draftRevision()) {
      throw new ConflictException("发布失败，草稿版本已变化");
    }
    TemplateContent draft = getDraft(templateId);
    Instant now = Instant.now();
    if (!templateRepository.existsRevision(templateId, RevisionChannel.PUBLISHED, state.draftRevision())) {
      templateRepository.insertRevision(templateId, state.draftRevision(), RevisionChannel.PUBLISHED, draft.dsl(), now, "system");
    }
    templateRepository.updatePublishedPointer(
      templateId,
      state.draftRevision(),
      WorkspaceStatus.PUBLISHED,
      pickDisplayName(state.templateType(), null, draft.dsl()),
      state.description(),
      state.tags(),
      now
    );
    return getBundle(templateId);
  }

  @Transactional
  public TemplateMeta discardDraft(String templateId) {
    StoredTemplateState state = requireState(templateId);
    if (state.draftRevision() == state.publishedRevision() && state.status() == WorkspaceStatus.PUBLISHED) {
      return toMeta(state);
    }
    TemplateContent published = getPublished(templateId);
    Instant now = Instant.now();
    templateRepository.updateDraftAndPublishedPointers(
      templateId,
      state.publishedRevision(),
      state.publishedRevision(),
      WorkspaceStatus.PUBLISHED,
      pickDisplayName(state.templateType(), null, published.dsl()),
      state.description(),
      state.tags(),
      now
    );
    return getTemplateMeta(templateId);
  }

  @Transactional
  public void seedDefaultsIfEmpty() {
    if (templateRepository.countTemplates() > 0) {
      return;
    }
    seedTemplate("template-dashboard-overview", TemplateType.DASHBOARD, "网络运维总览", "默认监控大屏模板", List.of("dashboard", "seed"));
    seedTemplate("template-report-weekly", TemplateType.REPORT, "网络周报", "默认报告模板", List.of("report", "seed"));
    seedTemplate("template-ppt-review", TemplateType.PPT, "网络运营汇报", "默认汇报 PPT 模板", List.of("ppt", "seed"));
  }

  private void seedTemplate(String id, TemplateType type, String name, String description, List<String> tags) {
    Instant now = Instant.now();
    JsonNode dsl = templateDslFactory.createSeedDsl(id, type, name);
    templateRepository.insertTemplate(id, type, name, description, WorkspaceStatus.PUBLISHED, tags, 1, 1, now);
    templateRepository.insertRevision(id, 1, RevisionChannel.PUBLISHED, dsl, now, "system");
    templateRepository.insertRevision(id, 1, RevisionChannel.DRAFT, dsl, now, "system");
  }

  private TemplateBundle getBundle(String templateId) {
    return new TemplateBundle(getTemplateMeta(templateId), getDraft(templateId), getPublished(templateId));
  }

  private StoredTemplateState requireState(String templateId) {
    return templateRepository.findTemplateState(templateId)
      .orElseThrow(() -> new NotFoundException("模板不存在: " + templateId));
  }

  private TemplateMeta toMeta(StoredTemplateState state) {
    return new TemplateMeta(
      state.id(),
      state.templateType(),
      state.name(),
      state.description(),
      state.tags(),
      state.updatedAt(),
      state.status(),
      true,
      true,
      new TemplateRevisions(state.publishedRevision(), state.draftRevision())
    );
  }

  private JsonNode validateDsl(JsonNode dsl) {
    if (dsl == null || !dsl.isObject()) {
      throw new BadRequestException("dsl 必须是对象");
    }
    return dsl;
  }

  private String generateTemplateId(TemplateType templateType) {
    return "template-" + templateType.value() + "-" + UUID.randomUUID().toString().substring(0, 8);
  }

  private String pickDisplayName(TemplateType type, String explicitName, JsonNode dsl) {
    if (explicitName != null && !explicitName.isBlank()) {
      return explicitName.trim();
    }
    String dslTitle = dsl.path("title").asText("");
    if (!dslTitle.isBlank()) {
      return dslTitle;
    }
    return switch (type) {
      case DASHBOARD -> "新建大屏模板";
      case REPORT -> "新建报告模板";
      case PPT -> "新建汇报模板";
    };
  }

  private String blankToDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }

  private List<String> sanitizeTags(List<String> tags, TemplateType templateType) {
    List<String> normalized = new ArrayList<>();
    if (tags != null) {
      for (String tag : tags) {
        if (tag != null && !tag.isBlank()) {
          normalized.add(tag.trim());
        }
      }
    }
    if (normalized.stream().noneMatch(tag -> tag.equalsIgnoreCase(templateType.value()))) {
      normalized.add(templateType.value());
    }
    if (normalized.isEmpty()) {
      normalized.add(templateType.value());
      normalized.add("template");
    }
    return normalized;
  }
}
