package com.chatbi.app.api.render;

import com.chatbi.app.domain.render.OutputType;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record CreateExportRunRequest(
  @NotNull OutputType outputType,
  Map<String, Object> variables
) {
}
