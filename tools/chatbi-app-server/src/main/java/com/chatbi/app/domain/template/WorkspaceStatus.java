package com.chatbi.app.domain.template;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum WorkspaceStatus {
  PUBLISHED("published"),
  DRAFT("draft");

  private final String value;

  WorkspaceStatus(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  @JsonCreator
  public static WorkspaceStatus fromValue(String raw) {
    for (WorkspaceStatus status : values()) {
      if (status.value.equalsIgnoreCase(raw)) {
        return status;
      }
    }
    throw new IllegalArgumentException("Unsupported status: " + raw);
  }
}
