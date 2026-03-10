package com.chatbi.app.api.asset;

import java.time.Instant;

public record AssetResponse(
  String id,
  String assetType,
  String name,
  String mimeType,
  String originalFileName,
  String fileExt,
  long sizeBytes,
  Integer widthPx,
  Integer heightPx,
  String sha256,
  Instant createdAt,
  String fileUrl
) {
}
