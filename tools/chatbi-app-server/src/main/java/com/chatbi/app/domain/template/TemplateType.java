package com.chatbi.app.domain.template;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum TemplateType {
  DASHBOARD("dashboard"),
  REPORT("report"),
  PPT("ppt");

  private final String value;

  TemplateType(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  @JsonCreator
  public static TemplateType fromValue(String raw) {
    for (TemplateType type : values()) {
      if (type.value.equalsIgnoreCase(raw)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unsupported templateType: " + raw);
  }
}
