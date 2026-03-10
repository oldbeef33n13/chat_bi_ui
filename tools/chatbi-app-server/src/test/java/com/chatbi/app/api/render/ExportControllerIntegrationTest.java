package com.chatbi.app.api.render;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(
  properties = {
    "app.storage.base-dir=${export.test.storage-dir}",
    "spring.main.allow-bean-definition-overriding=true"
  },
  classes = {com.chatbi.app.ChatBiAppServerApplication.class, ExportControllerIntegrationTest.SyncExecutorConfig.class}
)
@AutoConfigureMockMvc
class ExportControllerIntegrationTest {

  private static final Path STORAGE_DIR = createStorageDir();

  static {
    System.setProperty("export.test.storage-dir", STORAGE_DIR.toAbsolutePath().toString().replace('\\', '/'));
  }

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ObjectMapper objectMapper;

  @Test
  void exportDashboardSnapshotCreatesArtifact() throws Exception {
    MvcResult createRun = mockMvc.perform(post("/api/v1/templates/{templateId}/exports", "template-dashboard-overview")
        .contentType("application/json")
        .content("""
          {
            "outputType": "dashboard_snapshot_json",
            "variables": {}
          }
          """))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.runId").exists())
      .andReturn();

    String runId = readJson(createRun).path("runId").asText();
    mockMvc.perform(get("/api/v1/runs/{runId}", runId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.status").value("succeeded"))
      .andExpect(jsonPath("$.artifacts[0].artifactType").value("dashboard_snapshot_json"));
  }

  @Test
  void exportReportCreatesSnapshotAndDocx() throws Exception {
    MvcResult createRun = mockMvc.perform(post("/api/v1/templates/{templateId}/exports", "template-report-weekly")
        .contentType("application/json")
        .content("""
          {
            "outputType": "report_docx",
            "variables": {}
          }
          """))
      .andExpect(status().isOk())
      .andReturn();

    String runId = readJson(createRun).path("runId").asText();
    MvcResult runResult = mockMvc.perform(get("/api/v1/runs/{runId}", runId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.status").value("succeeded"))
      .andExpect(jsonPath("$.artifacts.length()").value(2))
      .andReturn();

    JsonNode payload = readJson(runResult);
    JsonNode docxArtifact = payload.path("artifacts").get(1);
    assertThat(docxArtifact.path("artifactType").asText()).isEqualTo("report_docx");
    assertThat(docxArtifact.path("fileName").asText()).matches("^网络周报-\\d{8}-\\d{6}-report\\.docx$");

    mockMvc.perform(get("/files/artifacts/{artifactId}", docxArtifact.path("id").asText()))
      .andExpect(status().isOk())
      .andExpect(resultMatcher ->
        assertThat(resultMatcher.getResponse().getContentType())
          .isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
      .andExpect(resultMatcher -> assertThat(resultMatcher.getResponse().getContentLength()).isGreaterThan(0));
  }

  @Test
  void exportReportResolvesDynamicEndpointBindings() throws Exception {
    MvcResult createTemplate = mockMvc.perform(post("/api/v1/templates")
        .contentType("application/json")
        .content("""
          {
            "templateType": "report",
            "name": "动态导出周报",
            "seedTemplateId": "template-report-weekly"
          }
          """))
      .andExpect(status().isCreated())
      .andReturn();

    JsonNode templatePayload = readJson(createTemplate);
    String templateId = templatePayload.path("meta").path("id").asText();

    ObjectNode dsl = (ObjectNode) templatePayload.path("content").path("dsl").deepCopy();
    ObjectNode chartNode = (ObjectNode) dsl.at("/root/children/0/children/1");
    ObjectNode dataBinding = objectMapper.createObjectNode();
    dataBinding.put("endpointId", "ops_alarm_trend");
    ObjectNode paramBindings = objectMapper.createObjectNode();
    paramBindings.set("region", binding("templateVar", "region", null));
    paramBindings.set("from", binding("const", null, "2026-03-01"));
    paramBindings.set("to", binding("const", null, "2026-03-03"));
    dataBinding.set("paramBindings", paramBindings);
    chartNode.set("data", dataBinding);

    ObjectNode publishRequest = objectMapper.createObjectNode();
    publishRequest.set("dsl", dsl);
    publishRequest.put("baseRevision", 1);
    mockMvc.perform(post("/api/v1/templates/{templateId}/publish", templateId)
        .contentType("application/json")
        .content(objectMapper.writeValueAsString(publishRequest)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.meta.currentRevision").value(2));

    MvcResult createRun = mockMvc.perform(post("/api/v1/templates/{templateId}/exports", templateId)
        .contentType("application/json")
        .content("""
          {
            "outputType": "report_docx",
            "variables": {
              "region": "north"
            }
          }
          """))
      .andExpect(status().isOk())
      .andReturn();

    String runId = readJson(createRun).path("runId").asText();
    MvcResult runResult = mockMvc.perform(get("/api/v1/runs/{runId}", runId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.status").value("succeeded"))
      .andExpect(jsonPath("$.artifacts.length()").value(2))
      .andReturn();

    JsonNode runPayload = readJson(runResult);
    String snapshotArtifactId = runPayload.path("artifacts").get(0).path("id").asText();
    assertThat(runPayload.path("artifacts").get(1).path("fileName").asText()).matches("^动态导出周报-\\d{8}-\\d{6}-report\\.docx$");
    MvcResult snapshotFile = mockMvc.perform(get("/files/artifacts/{artifactId}", snapshotArtifactId))
      .andExpect(status().isOk())
      .andReturn();

    JsonNode snapshot = readJson(snapshotFile);
    JsonNode snapshotChart = snapshot.at("/root/children/0/children/1");
    assertThat(snapshot.path("queries").size()).isGreaterThanOrEqualTo(1);
    assertThat(snapshotChart.path("data").path("sourceId").asText()).startsWith("ds_dyn_report-weekly-trend");
    assertThat(snapshotChart.path("data").has("endpointId")).isFalse();
  }

  private ObjectNode binding(String from, String key, String value) {
    ObjectNode binding = objectMapper.createObjectNode();
    binding.put("from", from);
    if (key != null) {
      binding.put("key", key);
    }
    if (value != null) {
      binding.put("value", value);
    }
    return binding;
  }

  private JsonNode readJson(MvcResult result) throws Exception {
    return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
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
      return Files.createTempDirectory("chatbi-app-server-export");
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to create temp export storage dir for tests", ex);
    }
  }
}
