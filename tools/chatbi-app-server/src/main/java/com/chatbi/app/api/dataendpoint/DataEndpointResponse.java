package com.chatbi.app.api.dataendpoint;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

public record DataEndpointResponse(
  String id,
  String name,
  String category,
  String providerType,
  String origin,
  String method,
  String path,
  String description,
  JsonNode paramSchema,
  JsonNode resultSchema,
  JsonNode sampleRequest,
  JsonNode sampleResponse,
  boolean enabled,
  Instant createdAt,
  Instant updatedAt
) {
}
