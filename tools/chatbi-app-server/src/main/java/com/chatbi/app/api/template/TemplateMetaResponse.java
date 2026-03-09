package com.chatbi.app.api.template;

import java.time.Instant;
import java.util.List;

public record TemplateMetaResponse(
  String id,
  String templateType,
  String name,
  String description,
  List<String> tags,
  Instant updatedAt,
  String status,
  boolean canEdit,
  boolean canPublish,
  TemplateRevisionsResponse revisions
) {
}
