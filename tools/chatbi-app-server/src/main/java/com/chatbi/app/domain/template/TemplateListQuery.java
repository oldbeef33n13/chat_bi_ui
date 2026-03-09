package com.chatbi.app.domain.template;

public record TemplateListQuery(
  String type,
  String status,
  String q,
  int page,
  int pageSize
) {
}
