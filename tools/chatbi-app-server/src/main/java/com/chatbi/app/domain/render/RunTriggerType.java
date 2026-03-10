package com.chatbi.app.domain.render;

public enum RunTriggerType {
  MANUAL_EXPORT("manual_export"),
  SCHEDULED("scheduled"),
  SCHEDULE_RUN_NOW("schedule_run_now");

  private final String value;

  RunTriggerType(String value) {
    this.value = value;
  }

  public String value() {
    return value;
  }

  public static RunTriggerType fromValue(String raw) {
    for (RunTriggerType type : values()) {
      if (type.value.equalsIgnoreCase(raw)) {
        return type;
      }
    }
    throw new IllegalArgumentException("Unsupported triggerType: " + raw);
  }
}
