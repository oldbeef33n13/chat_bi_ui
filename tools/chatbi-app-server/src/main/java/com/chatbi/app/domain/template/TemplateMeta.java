package com.chatbi.app.domain.template;

import java.time.Instant;
import java.util.List;

public record TemplateMeta(
  String id,
  TemplateType templateType,
  String name,
  String description,
  List<String> tags,
  Instant updatedAt,
  WorkspaceStatus status,
  boolean canEdit,
  boolean canPublish,
  TemplateRevisions revisions
) {
}
