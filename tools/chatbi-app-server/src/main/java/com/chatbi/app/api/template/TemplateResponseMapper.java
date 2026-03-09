package com.chatbi.app.api.template;

import com.chatbi.app.domain.template.TemplateBundle;
import com.chatbi.app.domain.template.TemplateContent;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.domain.template.TemplatePage;

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
      meta.status().value(),
      meta.canEdit(),
      meta.canPublish(),
      new TemplateRevisionsResponse(meta.revisions().published(), meta.revisions().draft())
    );
  }

  public static TemplateContentResponse toContentResponse(TemplateContent content) {
    return new TemplateContentResponse(content.dsl(), content.revision());
  }

  public static TemplateSaveDraftResponse toSaveDraftResponse(TemplateMeta meta, TemplateContent draft) {
    return new TemplateSaveDraftResponse(toMetaResponse(meta), toContentResponse(draft));
  }

  public static TemplateVersionBundleResponse toBundleResponse(TemplateBundle bundle) {
    return new TemplateVersionBundleResponse(
      toMetaResponse(bundle.meta()),
      toContentResponse(bundle.draft()),
      toContentResponse(bundle.published())
    );
  }

  public static TemplatePageResponse toPageResponse(TemplatePage page) {
    return new TemplatePageResponse(
      page.items().stream().map(TemplateResponseMapper::toMetaResponse).toList(),
      page.total(),
      page.page(),
      page.pageSize()
    );
  }
}
