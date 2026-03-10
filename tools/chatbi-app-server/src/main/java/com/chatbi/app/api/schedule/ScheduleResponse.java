package com.chatbi.app.api.schedule;

import java.time.Instant;
import java.util.Map;

public record ScheduleResponse(
  String id,
  String templateId,
  String name,
  boolean enabled,
  String cronExpr,
  String timezone,
  String outputType,
  Map<String, Object> variables,
  int retentionDays,
  Instant lastTriggeredAt,
  Instant nextTriggeredAt,
  Instant createdAt,
  Instant updatedAt
) {
}
