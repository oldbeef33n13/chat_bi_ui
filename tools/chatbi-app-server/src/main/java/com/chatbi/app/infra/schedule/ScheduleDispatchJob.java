package com.chatbi.app.infra.schedule;

import com.chatbi.app.application.schedule.ScheduleService;
import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScheduleDispatchJob {

  private final ScheduleService scheduleService;

  public ScheduleDispatchJob(ScheduleService scheduleService) {
    this.scheduleService = scheduleService;
  }

  @Scheduled(fixedDelayString = "${app.schedule.poll-interval-ms:30000}")
  public void dispatchDueSchedules() {
    scheduleService.triggerDueSchedules(Instant.now());
  }
}
