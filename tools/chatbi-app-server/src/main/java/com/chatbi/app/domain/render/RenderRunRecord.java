package com.chatbi.app.domain.render;

import java.time.Instant;
import java.util.Map;

public record RenderRunRecord(
  String id,
  RunTriggerType triggerType,
  String templateId,
  String scheduleJobId,
  int templateRevisionNo,
  OutputType outputType,
  RunStatus status,
  Map<String, Object> variables,
  Instant startedAt,
  Instant finishedAt,
  String errorMessage,
  Instant createdAt
) {
}
