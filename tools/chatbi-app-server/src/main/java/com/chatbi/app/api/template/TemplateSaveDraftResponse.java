package com.chatbi.app.api.template;

public record TemplateSaveDraftResponse(
  TemplateMetaResponse meta,
  TemplateContentResponse draft
) {
}
