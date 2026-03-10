package com.chatbi.app.domain.dataendpoint;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum EndpointHttpMethod {
  GET("GET"),
  POST("POST");

  private final String value;

  EndpointHttpMethod(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  @JsonCreator
  public static EndpointHttpMethod fromValue(String raw) {
    for (EndpointHttpMethod method : values()) {
      if (method.value.equalsIgnoreCase(raw)) {
        return method;
      }
    }
    throw new IllegalArgumentException("Unsupported method: " + raw);
  }
}
