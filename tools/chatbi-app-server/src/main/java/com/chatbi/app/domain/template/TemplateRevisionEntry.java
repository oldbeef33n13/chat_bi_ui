package com.chatbi.app.domain.template;

import java.time.Instant;

public record TemplateRevisionEntry(
  int revision,
  Instant createdAt,
  String createdBy,
  boolean current
) {
}
