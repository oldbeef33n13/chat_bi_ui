package com.chatbi.app.domain.asset;

import java.time.Instant;

public record AssetRecord(
  String id,
  AssetType assetType,
  String name,
  String mimeType,
  String originalFileName,
  String fileExt,
  String filePath,
  long sizeBytes,
  Integer widthPx,
  Integer heightPx,
  String sha256,
  Instant createdAt
) {
}
