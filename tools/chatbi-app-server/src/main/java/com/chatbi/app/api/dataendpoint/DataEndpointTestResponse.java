package com.chatbi.app.api.dataendpoint;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;

public record DataEndpointTestResponse(
  String id,
  Map<String, Object> requestEcho,
  JsonNode resultSchema,
  JsonNode rows
) {
}
