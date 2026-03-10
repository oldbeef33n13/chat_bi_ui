package com.chatbi.app.api.template;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;

public record TemplatePreviewResponse(
  String templateId,
  int revision,
  JsonNode snapshot,
  Map<String, Object> resolvedVariables
) {
}
