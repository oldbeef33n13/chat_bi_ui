package com.chatbi.app.application.schedule;

import com.chatbi.app.api.schedule.UpsertScheduleRequest;
import com.chatbi.app.common.error.BadRequestException;
import com.chatbi.app.common.error.NotFoundException;
import com.chatbi.app.application.render.ExportService;
import com.chatbi.app.application.template.TemplateService;
import com.chatbi.app.domain.render.ArtifactRecord;
import com.chatbi.app.domain.render.OutputType;
import com.chatbi.app.domain.render.RenderRunRecord;
import com.chatbi.app.domain.render.RunTriggerType;
import com.chatbi.app.domain.schedule.ScheduleJobRecord;
import com.chatbi.app.domain.template.TemplateMeta;
import com.chatbi.app.infra.db.render.RenderRunJdbcRepository;
import com.chatbi.app.infra.db.schedule.ScheduleJobJdbcRepository;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduleService {

  private final ScheduleJobJdbcRepository scheduleRepository;
  private final RenderRunJdbcRepository renderRunRepository;
  private final TemplateService templateService;
  private final ExportService exportService;

  public ScheduleService(
    ScheduleJobJdbcRepository scheduleRepository,
    RenderRunJdbcRepository renderRunRepository,
    TemplateService templateService,
    ExportService exportService
  ) {
    this.scheduleRepository = scheduleRepository;
    this.renderRunRepository = renderRunRepository;
    this.templateService = templateService;
    this.exportService = exportService;
  }

  public List<ScheduleJobRecord> listSchedules(String templateId) {
    requireTemplate(templateId);
    return scheduleRepository.listSchedules(templateId);
  }

  public ScheduleJobRecord getSchedule(String scheduleId) {
    return scheduleRepository.findSchedule(scheduleId)
      .orElseThrow(() -> new NotFoundException("定时任务不存在: " + scheduleId));
  }

  @Transactional
  public ScheduleJobRecord createSchedule(UpsertScheduleRequest request) {
    TemplateMeta template = requireTemplate(request.templateId());
    validateRequest(template, request);
    Instant now = Instant.now();
    ScheduleJobRecord schedule = new ScheduleJobRecord(
      "schedule-" + UUID.randomUUID().toString().substring(0, 8),
      request.templateId(),
      request.name().trim(),
      request.enabled(),
      request.cronExpr().trim(),
      normalizeTimezone(request.timezone()),
      request.outputType(),
      request.variables() == null ? Collections.emptyMap() : request.variables(),
      request.retentionDays() == null ? 30 : request.retentionDays(),
      null,
      now,
      now
    );
    scheduleRepository.insertSchedule(schedule);
    return schedule;
  }

  @Transactional
  public ScheduleJobRecord updateSchedule(String scheduleId, UpsertScheduleRequest request) {
    ScheduleJobRecord existing = getSchedule(scheduleId);
    TemplateMeta template = requireTemplate(existing.templateId());
    validateRequest(template, request);
    if (!existing.templateId().equals(request.templateId())) {
      throw new BadRequestException("当前版本不支持跨模板移动定时任务");
    }
    ScheduleJobRecord updated = new ScheduleJobRecord(
      existing.id(),
      existing.templateId(),
      request.name().trim(),
      request.enabled(),
      request.cronExpr().trim(),
      normalizeTimezone(request.timezone()),
      request.outputType(),
      request.variables() == null ? Collections.emptyMap() : request.variables(),
      request.retentionDays() == null ? existing.retentionDays() : request.retentionDays(),
      existing.lastTriggeredAt(),
      existing.createdAt(),
      Instant.now()
    );
    scheduleRepository.updateSchedule(updated);
    return updated;
  }

  @Transactional
  public RenderRunRecord runNow(String scheduleId) {
    ScheduleJobRecord schedule = getSchedule(scheduleId);
    return exportService.requestExport(
      schedule.templateId(),
      schedule.outputType(),
      schedule.variables(),
      RunTriggerType.SCHEDULE_RUN_NOW,
      schedule.id()
    );
  }

  public List<RenderRunRecord> listRuns(String scheduleId, int limit) {
    getSchedule(scheduleId);
    return renderRunRepository.listRunsByScheduleJob(scheduleId, limit);
  }

  public List<ArtifactRecord> listArtifacts(String runId) {
    return renderRunRepository.listArtifacts(runId);
  }

  @Transactional
  public int triggerDueSchedules(Instant now) {
    int triggered = 0;
    for (ScheduleJobRecord schedule : scheduleRepository.listEnabledSchedules()) {
      Instant nextTriggerAt = computeNextTriggeredAt(schedule);
      if (nextTriggerAt == null || nextTriggerAt.isAfter(now)) {
        continue;
      }
      boolean claimed = scheduleRepository.claimTriggered(schedule.id(), schedule.lastTriggeredAt(), nextTriggerAt, now);
      if (!claimed) {
        continue;
      }
      exportService.requestExport(
        schedule.templateId(),
        schedule.outputType(),
        schedule.variables(),
        RunTriggerType.SCHEDULED,
        schedule.id()
      );
      triggered += 1;
    }
    return triggered;
  }

  public Instant computeNextTriggeredAt(ScheduleJobRecord schedule) {
    try {
      CronExpression cron = CronExpression.parse(schedule.cronExpr());
      ZoneId zoneId = ZoneId.of(normalizeTimezone(schedule.timezone()));
      Instant base = schedule.lastTriggeredAt() == null ? schedule.createdAt() : schedule.lastTriggeredAt();
      ZonedDateTime baseTime = ZonedDateTime.ofInstant(base, zoneId);
      ZonedDateTime next = cron.next(baseTime);
      return next == null ? null : next.toInstant();
    } catch (IllegalArgumentException ex) {
      return null;
    }
  }

  private TemplateMeta requireTemplate(String templateId) {
    return templateService.getTemplateMeta(templateId);
  }

  private void validateRequest(TemplateMeta template, UpsertScheduleRequest request) {
    validateCronExpr(request.cronExpr());
    normalizeTimezone(request.timezone());
    if (request.outputType().templateType() != template.templateType()) {
      throw new BadRequestException("outputType 与模板类型不匹配");
    }
  }

  private void validateCronExpr(String cronExpr) {
    try {
      CronExpression.parse(cronExpr);
    } catch (IllegalArgumentException ex) {
      throw new BadRequestException("cronExpr 非法: " + cronExpr);
    }
  }

  private String normalizeTimezone(String timezone) {
    String value = timezone == null || timezone.isBlank() ? "Asia/Shanghai" : timezone.trim();
    try {
      ZoneId.of(value);
      return value;
    } catch (Exception ex) {
      throw new BadRequestException("timezone 非法: " + value);
    }
  }
}
