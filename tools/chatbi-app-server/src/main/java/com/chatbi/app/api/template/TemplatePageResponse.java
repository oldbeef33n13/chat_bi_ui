package com.chatbi.app.api.template;

import java.util.List;

public record TemplatePageResponse(
  List<TemplateMetaResponse> items,
  long total,
  int page,
  int pageSize
) {
}
