package com.chatbi.app.domain.asset;

import java.util.List;

public record AssetPage(
  List<AssetRecord> items,
  long total,
  int page,
  int pageSize
) {
}
