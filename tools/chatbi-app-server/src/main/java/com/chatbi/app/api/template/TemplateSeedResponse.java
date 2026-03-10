package com.chatbi.app.api.template;

import java.util.List;

public record TemplateSeedResponse(
  String id,
  String templateType,
  String name,
  String description,
  List<String> tags
) {
}
