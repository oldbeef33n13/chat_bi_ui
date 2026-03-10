package com.chatbi.app.api.asset;

import com.chatbi.app.domain.asset.AssetPage;
import com.chatbi.app.domain.asset.AssetRecord;

public final class AssetResponseMapper {

  private AssetResponseMapper() {
  }

  public static AssetResponse toResponse(AssetRecord asset) {
    return new AssetResponse(
      asset.id(),
      asset.assetType().value(),
      asset.name(),
      asset.mimeType(),
      asset.originalFileName(),
      asset.fileExt(),
      asset.sizeBytes(),
      asset.widthPx(),
      asset.heightPx(),
      asset.sha256(),
      asset.createdAt(),
      "/files/assets/" + asset.id()
    );
  }

  public static AssetPageResponse toPageResponse(AssetPage page) {
    return new AssetPageResponse(
      page.items().stream().map(AssetResponseMapper::toResponse).toList(),
      page.total(),
      page.page(),
      page.pageSize()
    );
  }
}
