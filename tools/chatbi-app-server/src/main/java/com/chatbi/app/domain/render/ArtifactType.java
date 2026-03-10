package com.chatbi.app.domain.render;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ArtifactType {
  SNAPSHOT_VDOC_JSON("snapshot_vdoc_json"),
  REPORT_DOCX("report_docx"),
  PPT_PPTX("ppt_pptx"),
  DASHBOARD_SNAPSHOT_JSON("dashboard_snapshot_json");

  private final String value;

  ArtifactType(String value) {
    this.value = value;
  }

  @JsonValue
  public String value() {
    return value;
  }

  @JsonCreator
  public static ArtifactType fromValue(String raw) {
    for (ArtifactType type : values()) {
      if (type.value.equalsIgnoreCase(raw)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unsupported artifactType: " + raw);
  }
}
