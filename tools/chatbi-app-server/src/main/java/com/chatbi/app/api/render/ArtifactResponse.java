package com.chatbi.app.api.render;

import java.time.Instant;

public record ArtifactResponse(
  String id,
  String artifactType,
  String fileName,
  String contentType,
  long sizeBytes,
  Instant createdAt,
  String downloadUrl
) {
}
