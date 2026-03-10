package com.chatbi.app.application.dataendpoint;

import com.chatbi.app.domain.dataendpoint.EndpointHttpMethod;
import com.fasterxml.jackson.databind.JsonNode;

public record BuiltInDataEndpointDefinition(
  String id,
  String name,
  String category,
  EndpointHttpMethod method,
  String path,
  String description,
  JsonNode paramSchema,
  JsonNode resultSchema,
  JsonNode sampleRequest
) {
}
