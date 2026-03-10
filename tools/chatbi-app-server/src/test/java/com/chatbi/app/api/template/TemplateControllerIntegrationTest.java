package com.chatbi.app.api.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.storage.base-dir=${template.test.storage-dir}")
@AutoConfigureMockMvc
class TemplateControllerIntegrationTest {

  private static final Path STORAGE_DIR = createStorageDir();

  static {
    System.setProperty("template.test.storage-dir", STORAGE_DIR.toAbsolutePath().toString().replace('\\', '/'));
  }

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ObjectMapper objectMapper;

  @Test
  void listTemplatesReturnsSeededTemplates() throws Exception {
    MvcResult result = mockMvc.perform(get("/api/v1/templates"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.total").isNumber())
      .andReturn();

    JsonNode payload = readJson(result);
    List<String> ids = new ArrayList<>();
    payload.path("items").forEach(item -> ids.add(item.path("id").asText()));
    assertThat(payload.path("total").asInt()).isGreaterThanOrEqualTo(7);
    assertThat(ids)
      .contains(
        "template-dashboard-overview",
        "template-dashboard-workbench",
        "template-dashboard-command-center",
        "template-report-weekly",
        "template-report-incident-review",
        "template-ppt-review",
        "template-ppt-exec-briefing"
      );
  }

  @Test
  void listSeedTemplatesReturnsCatalog() throws Exception {
    MvcResult result = mockMvc.perform(get("/api/v1/templates/seeds"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.items.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(7)))
      .andReturn();

    JsonNode payload = readJson(result);
    List<String> ids = new ArrayList<>();
    payload.path("items").forEach(item -> ids.add(item.path("id").asText()));
    assertThat(ids)
      .contains(
        "template-dashboard-overview",
        "template-dashboard-workbench",
        "template-dashboard-command-center",
        "template-report-weekly",
        "template-report-incident-review",
        "template-ppt-review",
        "template-ppt-exec-briefing"
      );
  }

  @Test
  void createTemplateAndReadContent() throws Exception {
    String name = "监控大屏-" + UUID.randomUUID().toString().substring(0, 6);
    MvcResult createResult = mockMvc.perform(post("/api/v1/templates")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {
            "templateType": "dashboard",
            "name": "%s",
            "tags": ["ops", "demo"],
            "dashboardPreset": "wallboard"
          }
          """.formatted(name)))
      .andExpect(status().isCreated())
      .andExpect(jsonPath("$.meta.templateType").value("dashboard"))
      .andExpect(jsonPath("$.meta.currentRevision").value(1))
      .andExpect(jsonPath("$.content.revision").value(1))
      .andReturn();

    JsonNode createPayload = readJson(createResult);
    String templateId = createPayload.path("meta").path("id").asText();

    mockMvc.perform(get("/api/v1/templates/{templateId}/content", templateId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.revision").value(1))
      .andExpect(jsonPath("$.dsl.title").value(name))
      .andExpect(jsonPath("$.dsl.root.children.length()").value(0))
      .andExpect(jsonPath("$.dsl.dataSources.length()").value(0))
      .andExpect(jsonPath("$.dsl.queries.length()").value(0));
  }

  @Test
  void createTemplateSupportsSeedTemplateId() throws Exception {
    String name = "演示工作台-" + UUID.randomUUID().toString().substring(0, 6);
    MvcResult createResult = mockMvc.perform(post("/api/v1/templates")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {
            "templateType": "dashboard",
            "name": "%s",
            "seedTemplateId": "template-dashboard-workbench"
          }
          """.formatted(name)))
      .andExpect(status().isCreated())
      .andExpect(jsonPath("$.content.dsl.title").value(name))
      .andExpect(jsonPath("$.content.dsl.root.props.displayMode").value("scroll_page"))
      .andReturn();

    JsonNode payload = readJson(createResult);
    assertThat(payload.at("/content/dsl/templateVariables").isArray()).isTrue();
  }

  @Test
  void publishHonorsRevisionGuard() throws Exception {
    JsonNode created = createTemplate("report", "周报-" + UUID.randomUUID().toString().substring(0, 6));
    String templateId = created.path("meta").path("id").asText();

    JsonNode dsl = created.path("content").path("dsl").deepCopy();
    ((ObjectNode) dsl).put("title", "更新后的周报");
    ObjectNode staleRequest = objectMapper.createObjectNode();
    staleRequest.set("dsl", dsl);
    staleRequest.put("baseRevision", 99);

    mockMvc.perform(post("/api/v1/templates/{templateId}/publish", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(staleRequest)))
      .andExpect(status().isConflict());

    ObjectNode publishRequest = objectMapper.createObjectNode();
    publishRequest.set("dsl", dsl);
    publishRequest.put("baseRevision", 1);
    mockMvc.perform(post("/api/v1/templates/{templateId}/publish", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(publishRequest)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.meta.currentRevision").value(2))
      .andExpect(jsonPath("$.content.dsl.title").value("更新后的周报"));
  }

  @Test
  void listRevisionsAndRestoreRevision() throws Exception {
    JsonNode created = createTemplate("ppt", "运营汇报-" + UUID.randomUUID().toString().substring(0, 6));
    String templateId = created.path("meta").path("id").asText();
    JsonNode baseDsl = created.path("content").path("dsl");

    ObjectNode revision2 = (ObjectNode) baseDsl.deepCopy();
    revision2.put("title", "运营汇报-版本二");
    publish(templateId, revision2, 1);

    ObjectNode revision3 = (ObjectNode) revision2.deepCopy();
    revision3.put("title", "运营汇报-版本三");
    publish(templateId, revision3, 2);

    mockMvc.perform(get("/api/v1/templates/{templateId}/revisions", templateId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$[0].revision").value(3))
      .andExpect(jsonPath("$[0].current").value(true))
      .andExpect(jsonPath("$[1].revision").value(2))
      .andExpect(jsonPath("$[1].current").value(false));

    mockMvc.perform(post("/api/v1/templates/{templateId}/restore/{revision}", templateId, 2))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.meta.currentRevision").value(2))
      .andExpect(jsonPath("$.content.dsl.title").value("运营汇报-版本二"));
  }

  @Test
  void previewTemplateResolvesEndpointBindings() throws Exception {
    JsonNode created = createTemplate("report", "动态周报-" + UUID.randomUUID().toString().substring(0, 6), "template-report-weekly");
    String templateId = created.path("meta").path("id").asText();

    ObjectNode dsl = (ObjectNode) created.path("content").path("dsl").deepCopy();
    dsl.set("templateVariables", objectMapper.createArrayNode()
      .add(objectMapper.createObjectNode()
        .put("key", "region")
        .put("type", "string")
        .put("defaultValue", "all")));

    ObjectNode chartNode = (ObjectNode) dsl.at("/root/children/0/children/1");
    ObjectNode dataBinding = objectMapper.createObjectNode();
    dataBinding.put("endpointId", "ops_alarm_trend");
    ObjectNode paramBindings = objectMapper.createObjectNode();
    paramBindings.set("region", binding("templateVar", "region", null));
    paramBindings.set("from", binding("const", null, "2026-03-01"));
    paramBindings.set("to", binding("const", null, "2026-03-03"));
    dataBinding.set("paramBindings", paramBindings);
    chartNode.set("data", dataBinding);

    ObjectNode previewRequest = objectMapper.createObjectNode();
    previewRequest.set("dsl", dsl);
    previewRequest.set("variables", objectMapper.createObjectNode().put("region", "north"));
    MvcResult previewResult = mockMvc.perform(post("/api/v1/templates/{templateId}/preview", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(previewRequest)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.revision").value(1))
      .andExpect(jsonPath("$.resolvedVariables.region").value("north"))
      .andReturn();

    JsonNode previewPayload = readJson(previewResult);
    JsonNode snapshot = previewPayload.path("snapshot");
    JsonNode snapshotChart = snapshot.at("/root/children/0/children/1");
    assertThat(snapshot.path("queries").size()).isGreaterThanOrEqualTo(1);
    assertThat(snapshot.path("dataSources").size()).isGreaterThanOrEqualTo(1);
    assertThat(snapshotChart.path("data").path("sourceId").asText()).startsWith("ds_dyn_report-weekly-trend");
    assertThat(snapshotChart.path("data").path("queryId").asText()).startsWith("q_dyn_report-weekly-trend");
    assertThat(snapshotChart.path("data").has("endpointId")).isFalse();
  }

  private JsonNode publish(String templateId, JsonNode dsl, int baseRevision) throws Exception {
    ObjectNode publishRequest = objectMapper.createObjectNode();
    publishRequest.set("dsl", dsl);
    publishRequest.put("baseRevision", baseRevision);
    MvcResult result = mockMvc.perform(post("/api/v1/templates/{templateId}/publish", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(publishRequest)))
      .andExpect(status().isOk())
      .andReturn();
    return readJson(result);
  }

  private JsonNode createTemplate(String templateType, String name) throws Exception {
    return createTemplate(templateType, name, null);
  }

  private JsonNode createTemplate(String templateType, String name, String seedTemplateId) throws Exception {
    String seedFragment = seedTemplateId == null
      ? ""
      : """
            ,
            "seedTemplateId": "%s"
          """.formatted(seedTemplateId);
    MvcResult result = mockMvc.perform(post("/api/v1/templates")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {
            "templateType": "%s",
            "name": "%s"
            %s
          }
          """.formatted(templateType, name, seedFragment)))
      .andExpect(status().isCreated())
      .andReturn();
    return readJson(result);
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

  private static Path createStorageDir() {
    try {
      return Files.createTempDirectory("chatbi-app-server-tests");
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to create temp storage dir for tests", ex);
    }
  }
}
