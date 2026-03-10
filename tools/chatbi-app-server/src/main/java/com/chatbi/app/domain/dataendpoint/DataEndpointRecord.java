package com.chatbi.app.domain.dataendpoint;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

public record DataEndpointRecord(
  String id,
  String name,
  String category,
  DataEndpointProviderType providerType,
  DataEndpointOrigin origin,
  EndpointHttpMethod method,
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
