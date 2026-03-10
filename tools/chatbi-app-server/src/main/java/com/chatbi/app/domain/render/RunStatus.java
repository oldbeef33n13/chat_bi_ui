package com.chatbi.app.domain.render;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum RunStatus {
  QUEUED("queued"),
  RUNNING("running"),
  SUCCEEDED("succeeded"),
  FAILED("failed");

  private final String value;

  RunStatus(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  @JsonCreator
  public static RunStatus fromValue(String raw) {
    for (RunStatus status : values()) {
      if (status.value.equalsIgnoreCase(raw)) {
        return status;
      }
    }
    throw new IllegalArgumentException("Unsupported runStatus: " + raw);
  }
}
