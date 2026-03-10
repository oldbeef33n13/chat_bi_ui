package com.chatbi.app.application.template;

import com.chatbi.app.api.template.CreateTemplateRequest;
import com.chatbi.app.common.error.BadRequestException;
import com.chatbi.app.common.error.ConflictException;
import com.chatbi.app.common.error.NotFoundException;
import com.chatbi.app.domain.template.StoredTemplateState;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateDocument;
import com.chatbi.app.domain.template.TemplateListQuery;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.domain.template.TemplatePage;
import com.chatbi.app.domain.template.TemplateRevisionEntry;
import com.chatbi.app.domain.template.TemplateType;
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

  public TemplatePage listTemplates(String type, String q, int page, int pageSize) {
    return templateRepository.listTemplates(new TemplateListQuery(type, q, page, pageSize));
  }

  public List<TemplateSeedDefinition> listSeedDefinitions() {
    return templateDslFactory.seedDefinitions();
  }

  public TemplateMeta getTemplateMeta(String templateId) {
    return toMeta(requireState(templateId));
  }

  public TemplateContent getCurrent(String templateId) {
    StoredTemplateState state = requireState(templateId);
    return templateRepository.findContent(templateId, state.currentRevision())
      .orElseThrow(() -> new NotFoundException("模板版本不存在: " + templateId));
  }

  public List<TemplateRevisionEntry> listRevisions(String templateId) {
    StoredTemplateState state = requireState(templateId);
    return templateRepository.listRevisions(templateId, state.currentRevision());
  }

  @Transactional
  public TemplateDocument createTemplate(CreateTemplateRequest request) {
    Instant now = Instant.now();
    String templateId = generateTemplateId(request.templateType());
    JsonNode dsl = templateDslFactory.createDefaultDsl(templateId, request);
    String name = pickDisplayName(request.templateType(), request.name(), dsl);
    String description = blankToDefault(request.description(), "新建模板");
    List<String> tags = sanitizeTags(request.tags(), request.templateType());

    templateRepository.insertTemplate(templateId, request.templateType(), name, description, tags, 1, now);
    templateRepository.insertRevision(templateId, 1, dsl, now, "system");
    return getDocument(templateId);
  }

  @Transactional
  public TemplateDocument publish(String templateId, JsonNode dsl, Integer baseRevision) {
    StoredTemplateState state = requireState(templateId);
    JsonNode validDsl = validateDsl(dsl);
    if (baseRevision != null && baseRevision != state.currentRevision()) {
      throw new ConflictException("模板已被更新，请刷新后重试");
    }

    TemplateContent current = getCurrent(templateId);
    if (current.dsl().equals(validDsl)) {
      return getDocument(templateId);
    }

    int nextRevision = templateRepository.findMaxRevisionNumber(templateId) + 1;
    Instant now = Instant.now();
    templateRepository.insertRevision(templateId, nextRevision, validDsl, now, "system");
    templateRepository.updateCurrentPointer(
      templateId,
      nextRevision,
      pickDisplayName(state.templateType(), null, validDsl),
      state.description(),
      state.tags(),
      now
    );
    return getDocument(templateId);
  }

  @Transactional
  public TemplateDocument restoreRevision(String templateId, int revision) {
    StoredTemplateState state = requireState(templateId);
    TemplateContent restored = templateRepository.findContent(templateId, revision)
      .orElseThrow(() -> new NotFoundException("模板版本不存在: " + revision));
    Instant now = Instant.now();
    templateRepository.updateCurrentPointer(
      templateId,
      revision,
      pickDisplayName(state.templateType(), null, restored.dsl()),
      state.description(),
      state.tags(),
      now
    );
    return getDocument(templateId);
  }

  @Transactional
  public void seedDefaultsIfEmpty() {
    for (TemplateSeedDefinition seed : templateDslFactory.seedDefinitions()) {
      if (templateRepository.findTemplateState(seed.id()).isEmpty()) {
        seedTemplate(seed);
      }
    }
  }

  private void seedTemplate(TemplateSeedDefinition seed) {
    Instant now = Instant.now();
    JsonNode dsl = templateDslFactory.createSeedDsl(seed.id(), seed.id(), seed.name());
    templateRepository.insertTemplate(seed.id(), seed.templateType(), seed.name(), seed.description(), seed.tags(), 1, now);
    templateRepository.insertRevision(seed.id(), 1, dsl, now, "system");
  }

  private TemplateDocument getDocument(String templateId) {
    return new TemplateDocument(getTemplateMeta(templateId), getCurrent(templateId));
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
      state.currentRevision(),
      true,
      true
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
