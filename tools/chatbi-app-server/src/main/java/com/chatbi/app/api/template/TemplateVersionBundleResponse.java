package com.chatbi.app.api.template;

public record TemplateVersionBundleResponse(
  TemplateMetaResponse meta,
  TemplateContentResponse draft,
  TemplateContentResponse published
) {
}
