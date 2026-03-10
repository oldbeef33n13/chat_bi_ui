package com.chatbi.app.api.dataendpoint;

import java.util.Map;

public record TestDataEndpointRequest(
  Map<String, Object> params
) {
}
