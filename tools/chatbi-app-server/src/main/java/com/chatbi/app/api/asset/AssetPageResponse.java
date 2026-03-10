package com.chatbi.app.api.asset;

import java.util.List;

public record AssetPageResponse(
  List<AssetResponse> items,
  long total,
  int page,
  int pageSize
) {
}
