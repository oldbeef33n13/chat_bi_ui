package com.chatbi.app.application.render;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;

public record SnapshotRenderResult(
  JsonNode snapshot,
  Map<String, Object> resolvedVariables
) {
}
