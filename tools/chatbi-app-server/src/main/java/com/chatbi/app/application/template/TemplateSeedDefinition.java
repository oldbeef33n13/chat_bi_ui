package com.chatbi.app.application.template;

import com.chatbi.app.domain.template.TemplateType;
import java.util.List;

public record TemplateSeedDefinition(
  String id,
  TemplateType templateType,
  String name,
  String description,
  List<String> tags
) {
}
