package com.chatbi.app.domain.dataendpoint;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum DataEndpointProviderType {
  MOCK_REST("mock_rest"),
  MANUAL_REST("manual_rest"),
  NL2SQL_REST("nl2sql_rest");

  private final String value;

  DataEndpointProviderType(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  @JsonCreator
  public static DataEndpointProviderType fromValue(String raw) {
    for (DataEndpointProviderType providerType : values()) {
      if (providerType.value.equalsIgnoreCase(raw)) {
        return providerType;
      }
    }
    throw new IllegalArgumentException("Unsupported providerType: " + raw);
  }
}
