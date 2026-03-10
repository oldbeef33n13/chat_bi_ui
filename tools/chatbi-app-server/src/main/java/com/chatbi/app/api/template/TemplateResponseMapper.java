package com.chatbi.app.api.template;

import com.chatbi.app.application.template.TemplateSeedDefinition;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateDocument;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.domain.template.TemplatePage;
import com.chatbi.app.domain.template.TemplateRevisionEntry;

public final class TemplateResponseMapper {

  private TemplateResponseMapper() {
  }

  public static TemplateMetaResponse toMetaResponse(TemplateMeta meta) {
    return new TemplateMetaResponse(
      meta.id(),
      meta.templateType().value(),
      meta.name(),
      meta.description(),
      meta.tags(),
      meta.updatedAt(),
      meta.currentRevision(),
      meta.canEdit(),
      meta.canPublish()
    );
  }

  public static TemplateContentResponse toContentResponse(TemplateContent content) {
    return new TemplateContentResponse(content.dsl(), content.revision());
  }

  public static TemplateDocumentResponse toDocumentResponse(TemplateDocument document) {
    return new TemplateDocumentResponse(
      toMetaResponse(document.meta()),
      toContentResponse(document.content())
    );
  }

  public static TemplateRevisionResponse toRevisionResponse(TemplateRevisionEntry entry) {
    return new TemplateRevisionResponse(entry.revision(), entry.createdAt(), entry.createdBy(), entry.current());
  }

  public static TemplatePageResponse toPageResponse(TemplatePage page) {
    return new TemplatePageResponse(
      page.items().stream().map(TemplateResponseMapper::toMetaResponse).toList(),
      page.total(),
      page.page(),
      page.pageSize()
    );
  }

  public static TemplateSeedResponse toSeedResponse(TemplateSeedDefinition seed) {
    return new TemplateSeedResponse(
      seed.id(),
      seed.templateType().value(),
      seed.name(),
      seed.description(),
      seed.tags()
    );
  }

  public static TemplateSeedListResponse toSeedListResponse(Iterable<TemplateSeedDefinition> seeds) {
    return new TemplateSeedListResponse(
      java.util.stream.StreamSupport.stream(seeds.spliterator(), false)
        .map(TemplateResponseMapper::toSeedResponse)
        .toList()
    );
  }
}
