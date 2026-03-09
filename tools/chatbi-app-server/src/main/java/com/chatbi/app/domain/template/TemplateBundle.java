package com.chatbi.app.domain.template;

public record TemplateBundle(
  TemplateMeta meta,
  TemplateContent draft,
  TemplateContent published
) {
}
