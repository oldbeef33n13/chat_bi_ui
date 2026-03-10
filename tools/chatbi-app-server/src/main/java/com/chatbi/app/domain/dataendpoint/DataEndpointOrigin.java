package com.chatbi.app.domain.dataendpoint;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum DataEndpointOrigin {
  SYSTEM("system"),
  MANUAL("manual"),
  AI_GENERATED("ai_generated");

  private final String value;

  DataEndpointOrigin(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  @JsonCreator
  public static DataEndpointOrigin fromValue(String raw) {
    for (DataEndpointOrigin origin : values()) {
      if (origin.value.equalsIgnoreCase(raw)) {
        return origin;
      }
    }
    throw new IllegalArgumentException("Unsupported origin: " + raw);
  }
}
