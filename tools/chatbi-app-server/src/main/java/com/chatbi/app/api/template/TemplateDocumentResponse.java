package com.chatbi.app.api.template;

public record TemplateDocumentResponse(
  TemplateMetaResponse meta,
  TemplateContentResponse content
) {
}
