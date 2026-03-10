package com.chatbi.app.api.template;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;

public record CreatePreviewRequest(
  JsonNode dsl,
  Map<String, Object> variables
) {
}
