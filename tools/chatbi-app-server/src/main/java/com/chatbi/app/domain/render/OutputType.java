package com.chatbi.app.domain.render;

import com.chatbi.app.domain.template.TemplateType;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum OutputType {
  REPORT_DOCX("report_docx", TemplateType.REPORT),
  PPT_PPTX("ppt_pptx", TemplateType.PPT),
  DASHBOARD_SNAPSHOT_JSON("dashboard_snapshot_json", TemplateType.DASHBOARD);

  private final String value;
  private final TemplateType templateType;

  OutputType(String value, TemplateType templateType) {
    this.value = value;
    this.templateType = templateType;
  }

  @JsonValue
  public String value() {
    return value;
  }

  public TemplateType templateType() {
    return templateType;
  }

  @JsonCreator
  public static OutputType fromValue(String raw) {
    for (OutputType type : values()) {
      if (type.value.equalsIgnoreCase(raw)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unsupported outputType: " + raw);
  }
}
