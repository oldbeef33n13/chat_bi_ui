package com.chatbi.app.application.dataendpoint;

import com.chatbi.app.domain.dataendpoint.DataEndpointRecord;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;

public record DataEndpointTestResult(
  DataEndpointRecord endpoint,
  Map<String, Object> requestEcho,
  JsonNode rows
) {
}
