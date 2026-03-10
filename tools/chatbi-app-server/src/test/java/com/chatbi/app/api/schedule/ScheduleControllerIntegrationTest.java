package com.chatbi.app.api.schedule;

import com.chatbi.app.application.schedule.ScheduleService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.Executor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(
  properties = {
    "app.storage.base-dir=${schedule.test.storage-dir}",
    "app.schedule.poll-interval-ms=600000",
    "spring.main.allow-bean-definition-overriding=true"
  },
  classes = {com.chatbi.app.ChatBiAppServerApplication.class, ScheduleControllerIntegrationTest.SyncExecutorConfig.class}
)
@AutoConfigureMockMvc
class ScheduleControllerIntegrationTest {

  private static final Path STORAGE_DIR = createStorageDir();

  static {
    System.setProperty("schedule.test.storage-dir", STORAGE_DIR.toAbsolutePath().toString().replace('\\', '/'));
  }

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ObjectMapper objectMapper;

  @Autowired
  private ScheduleService scheduleService;

  @Test
  void createUpdateRunNowAndListRuns() throws Exception {
    MvcResult createResult = mockMvc.perform(post("/api/v1/schedules")
        .contentType("application/json")
        .content("""
          {
            "templateId": "template-dashboard-overview",
            "name": "晨会大屏快照",
            "enabled": true,
            "cronExpr": "0 0 9 * * *",
            "timezone": "Asia/Shanghai",
            "outputType": "dashboard_snapshot_json",
            "variables": {
              "region": "north"
            },
            "retentionDays": 7
          }
          """))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.templateId").value("template-dashboard-overview"))
      .andExpect(jsonPath("$.outputType").value("dashboard_snapshot_json"))
      .andReturn();

    String scheduleId = objectMapper.readTree(createResult.getResponse().getContentAsString()).path("id").asText();

    mockMvc.perform(get("/api/v1/schedules")
        .param("templateId", "template-dashboard-overview"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$[0].id").value(scheduleId));

    mockMvc.perform(put("/api/v1/schedules/{scheduleId}", scheduleId)
        .contentType("application/json")
        .content("""
          {
            "templateId": "template-dashboard-overview",
            "name": "晨会大屏快照-更新",
            "enabled": true,
            "cronExpr": "0 */30 * * * *",
            "timezone": "Asia/Shanghai",
            "outputType": "dashboard_snapshot_json",
            "variables": {
              "region": "south"
            },
            "retentionDays": 14
          }
          """))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.name").value("晨会大屏快照-更新"))
      .andExpect(jsonPath("$.retentionDays").value(14));

    mockMvc.perform(post("/api/v1/schedules/{scheduleId}/run-now", scheduleId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.runId").exists());

    mockMvc.perform(get("/api/v1/schedules/{scheduleId}/runs", scheduleId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$[0].triggerType").value("schedule_run_now"))
      .andExpect(jsonPath("$[0].status").value("succeeded"))
      .andExpect(jsonPath("$[0].artifacts[0].artifactType").value("dashboard_snapshot_json"));
  }

  @Test
  void triggerDueSchedulesCreatesScheduledRun() throws Exception {
    MvcResult createResult = mockMvc.perform(post("/api/v1/schedules")
        .contentType("application/json")
        .content("""
          {
            "templateId": "template-dashboard-overview",
            "name": "每秒快照",
            "enabled": true,
            "cronExpr": "* * * * * *",
            "timezone": "Asia/Shanghai",
            "outputType": "dashboard_snapshot_json",
            "variables": {},
            "retentionDays": 7
          }
          """))
      .andExpect(status().isOk())
      .andReturn();

    String scheduleId = objectMapper.readTree(createResult.getResponse().getContentAsString()).path("id").asText();

    int triggered = scheduleService.triggerDueSchedules(Instant.now().plusSeconds(2));
    assertThat(triggered).isGreaterThanOrEqualTo(1);

    MvcResult runsResult = mockMvc.perform(get("/api/v1/schedules/{scheduleId}/runs", scheduleId))
      .andExpect(status().isOk())
      .andReturn();

    JsonNode payload = objectMapper.readTree(runsResult.getResponse().getContentAsString());
    assertThat(payload.isArray()).isTrue();
    assertThat(payload.get(0).path("triggerType").asText()).isEqualTo("scheduled");
    assertThat(payload.get(0).path("scheduleJobId").asText()).isEqualTo(scheduleId);
  }

  @TestConfiguration
  static class SyncExecutorConfig {

    @Bean(name = "exportTaskExecutor")
    @Primary
    Executor exportTaskExecutor() {
      return Runnable::run;
    }
  }

  private static Path createStorageDir() {
    try {
      return Files.createTempDirectory("chatbi-app-server-schedule");
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to create temp schedule storage dir for tests", ex);
    }
  }
}
