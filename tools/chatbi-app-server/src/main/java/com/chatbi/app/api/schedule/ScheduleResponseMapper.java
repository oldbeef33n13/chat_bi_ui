package com.chatbi.app.api.schedule;

import com.chatbi.app.api.render.CreateExportRunResponse;
import com.chatbi.app.api.render.RenderResponseMapper;
import com.chatbi.app.api.render.RenderRunResponse;
import com.chatbi.app.domain.render.ArtifactRecord;
import com.chatbi.app.domain.render.RenderRunRecord;
import com.chatbi.app.domain.schedule.ScheduleJobRecord;
import java.time.Instant;
import java.util.List;

public final class ScheduleResponseMapper {

  private ScheduleResponseMapper() {
  }

  public static ScheduleResponse toResponse(ScheduleJobRecord schedule, Instant nextTriggeredAt) {
    return new ScheduleResponse(
      schedule.id(),
      schedule.templateId(),
      schedule.name(),
      schedule.enabled(),
      schedule.cronExpr(),
      schedule.timezone(),
      schedule.outputType().value(),
      schedule.variables(),
      schedule.retentionDays(),
      schedule.lastTriggeredAt(),
      nextTriggeredAt,
      schedule.createdAt(),
      schedule.updatedAt()
    );
  }

  public static ScheduleRunNowResponse toRunNowResponse(RenderRunRecord run) {
    CreateExportRunResponse accepted = RenderResponseMapper.toAcceptedResponse(run);
    return new ScheduleRunNowResponse(accepted.runId(), accepted.status());
  }

  public static RenderRunResponse toRunResponse(RenderRunRecord run, List<ArtifactRecord> artifacts) {
    return RenderResponseMapper.toRunResponse(run, artifacts);
  }
}
