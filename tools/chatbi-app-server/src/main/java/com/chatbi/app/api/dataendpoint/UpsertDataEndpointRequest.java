package com.chatbi.app.api.dataendpoint;

import com.chatbi.app.domain.dataendpoint.DataEndpointOrigin;
import com.chatbi.app.domain.dataendpoint.DataEndpointProviderType;
import com.chatbi.app.domain.dataendpoint.EndpointHttpMethod;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UpsertDataEndpointRequest(
  String id,
  @NotBlank String name,
  String category,
  @NotNull DataEndpointProviderType providerType,
  @NotNull DataEndpointOrigin origin,
  @NotNull EndpointHttpMethod method,
  @NotBlank String path,
  String description,
  JsonNode paramSchema,
  JsonNode resultSchema,
  JsonNode sampleRequest,
  JsonNode sampleResponse,
  Boolean enabled
) {
}
