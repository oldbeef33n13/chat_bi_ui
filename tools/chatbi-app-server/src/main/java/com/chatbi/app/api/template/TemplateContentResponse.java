package com.chatbi.app.api.template;

import com.fasterxml.jackson.databind.JsonNode;

public record TemplateContentResponse(
  JsonNode dsl,
  int revision
) {
}
