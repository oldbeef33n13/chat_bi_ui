package com.chatbi.app.api.schedule;

import com.chatbi.app.application.schedule.ScheduleService;
import com.chatbi.app.api.render.RenderRunResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/schedules")
public class ScheduleController {

  private final ScheduleService scheduleService;

  public ScheduleController(ScheduleService scheduleService) {
    this.scheduleService = scheduleService;
  }

  @GetMapping
  public List<ScheduleResponse> listSchedules(@RequestParam String templateId) {
    return scheduleService.listSchedules(templateId).stream()
      .map(schedule -> ScheduleResponseMapper.toResponse(schedule, scheduleService.computeNextTriggeredAt(schedule)))
      .toList();
  }

  @PostMapping
  public ScheduleResponse createSchedule(@Valid @RequestBody UpsertScheduleRequest request) {
    var schedule = scheduleService.createSchedule(request);
    return ScheduleResponseMapper.toResponse(schedule, scheduleService.computeNextTriggeredAt(schedule));
  }

  @GetMapping("/{scheduleId}")
  public ScheduleResponse getSchedule(@PathVariable String scheduleId) {
    var schedule = scheduleService.getSchedule(scheduleId);
    return ScheduleResponseMapper.toResponse(schedule, scheduleService.computeNextTriggeredAt(schedule));
  }

  @PutMapping("/{scheduleId}")
  public ScheduleResponse updateSchedule(@PathVariable String scheduleId, @Valid @RequestBody UpsertScheduleRequest request) {
    var schedule = scheduleService.updateSchedule(scheduleId, request);
    return ScheduleResponseMapper.toResponse(schedule, scheduleService.computeNextTriggeredAt(schedule));
  }

  @PostMapping("/{scheduleId}/run-now")
  public ScheduleRunNowResponse runNow(@PathVariable String scheduleId) {
    return ScheduleResponseMapper.toRunNowResponse(scheduleService.runNow(scheduleId));
  }

  @GetMapping("/{scheduleId}/runs")
  public List<RenderRunResponse> listRuns(
    @PathVariable String scheduleId,
    @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit
  ) {
    return scheduleService.listRuns(scheduleId, limit).stream()
      .map(run -> ScheduleResponseMapper.toRunResponse(run, scheduleService.listArtifacts(run.id())))
      .toList();
  }
}
