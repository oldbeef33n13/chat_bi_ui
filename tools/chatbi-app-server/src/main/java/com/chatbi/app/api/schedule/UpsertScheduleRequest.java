package com.chatbi.app.api.schedule;

import com.chatbi.app.domain.render.OutputType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record UpsertScheduleRequest(
  @NotBlank String templateId,
  @NotBlank String name,
  boolean enabled,
  @NotBlank String cronExpr,
  String timezone,
  @NotNull OutputType outputType,
  Map<String, Object> variables,
  @Min(1) Integer retentionDays
) {
}
