package com.chatbi.app.api.template;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;

public record PublishTemplateRequest(
  @NotNull JsonNode dsl,
  Integer baseRevision
) {
}
