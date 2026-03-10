package com.chatbi.app.api.template;

import java.time.Instant;

public record TemplateRevisionResponse(
  int revision,
  Instant createdAt,
  String createdBy,
  boolean current
) {
}
