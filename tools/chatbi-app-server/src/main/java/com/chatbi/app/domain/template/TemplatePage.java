package com.chatbi.app.domain.template;

import java.util.List;

public record TemplatePage(
  List<TemplateMeta> items,
  long total,
  int page,
  int pageSize
) {
}
