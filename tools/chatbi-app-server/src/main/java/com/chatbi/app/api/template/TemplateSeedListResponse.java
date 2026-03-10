package com.chatbi.app.api.template;

import java.util.List;

public record TemplateSeedListResponse(
  List<TemplateSeedResponse> items
) {
}
