package com.chatbi.app.api.template;

import com.chatbi.app.domain.template.TemplateType;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateTemplateRequest(
  @NotNull TemplateType templateType,
  String name,
  String description,
  List<String> tags,
  String seedTemplateId,
  String dashboardPreset
) {
}
