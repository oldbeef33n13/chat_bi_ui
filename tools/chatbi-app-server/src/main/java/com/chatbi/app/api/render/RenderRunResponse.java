package com.chatbi.app.api.render;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record RenderRunResponse(
  String id,
  String triggerType,
  String templateId,
  String scheduleJobId,
  int templateRevisionNo,
  String outputType,
  String status,
  Map<String, Object> variables,
  Instant startedAt,
  Instant finishedAt,
  String errorMessage,
  Instant createdAt,
  List<ArtifactResponse> artifacts
) {
}
