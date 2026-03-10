package com.chatbi.app.domain.render;

import java.time.Instant;

public record ArtifactRecord(
  String id,
  String runId,
  ArtifactType artifactType,
  String fileName,
  String filePath,
  String contentType,
  long sizeBytes,
  Instant createdAt
) {
}
