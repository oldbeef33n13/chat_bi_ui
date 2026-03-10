package com.chatbi.app.domain.schedule;

import com.chatbi.app.domain.render.OutputType;
import java.time.Instant;
import java.util.Map;

public record ScheduleJobRecord(
  String id,
  String templateId,
  String name,
  boolean enabled,
  String cronExpr,
  String timezone,
  OutputType outputType,
  Map<String, Object> variables,
  int retentionDays,
  Instant lastTriggeredAt,
  Instant createdAt,
  Instant updatedAt
) {
}
