package com.chatbi.app.api.template;

import com.chatbi.app.application.render.TemplatePreviewResult;

public final class TemplatePreviewResponseMapper {

  private TemplatePreviewResponseMapper() {
  }

  public static TemplatePreviewResponse toResponse(TemplatePreviewResult result) {
    return new TemplatePreviewResponse(
      result.templateId(),
      result.templateRevision(),
      result.snapshot(),
      result.resolvedVariables()
    );
  }
}
