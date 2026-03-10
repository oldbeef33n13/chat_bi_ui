package com.chatbi.app.domain.template;

import java.time.Instant;
import java.util.List;

public record StoredTemplateState(
  String id,
  TemplateType templateType,
  String name,
  String description,
  List<String> tags,
  int currentRevision,
  Instant createdAt,
  Instant updatedAt
) {
}
