package com.chatbi.app.api.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

    JsonNode payload = objectMapper.readTree(result.getResponse().getContentAsString());
    List<String> ids = new ArrayList<>();
    payload.path("items").forEach(item -> ids.add(item.path("id").asText()));
    assertThat(payload.path("total").asInt()).isGreaterThanOrEqualTo(3);
    assertThat(ids)
      .contains("template-dashboard-overview", "template-report-weekly", "template-ppt-review");
  }

  @Test
  void createTemplateAndReadDraft() throws Exception {
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
      .andExpect(jsonPath("$.meta.status").value("draft"))
      .andExpect(jsonPath("$.draft.revision").value(1))
      .andReturn();

    JsonNode createPayload = objectMapper.readTree(createResult.getResponse().getContentAsString());
    String templateId = createPayload.path("meta").path("id").asText();

    mockMvc.perform(get("/api/v1/templates/{templateId}/draft", templateId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.revision").value(1))
      .andExpect(jsonPath("$.dsl.title").value(name));
  }

  @Test
  void saveDraftHonorsRevisionGuard() throws Exception {
    JsonNode created = createTemplate("report", "周报-" + UUID.randomUUID().toString().substring(0, 6));
    String templateId = created.path("meta").path("id").asText();

    JsonNode dsl = created.path("draft").path("dsl").deepCopy();
    ((com.fasterxml.jackson.databind.node.ObjectNode) dsl).put("title", "更新后的周报");
    ObjectNode staleRequest = objectMapper.createObjectNode();
    staleRequest.set("dsl", dsl);
    staleRequest.put("baseRevision", 99);

    mockMvc.perform(put("/api/v1/templates/{templateId}/draft", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(staleRequest)))
      .andExpect(status().isConflict());

    ObjectNode saveRequest = objectMapper.createObjectNode();
    saveRequest.set("dsl", dsl);
    saveRequest.put("baseRevision", 1);
    mockMvc.perform(put("/api/v1/templates/{templateId}/draft", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(saveRequest)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.meta.status").value("draft"))
      .andExpect(jsonPath("$.meta.revisions.draft").value(2))
      .andExpect(jsonPath("$.draft.dsl.title").value("更新后的周报"));
  }

  @Test
  void publishAndDiscardDraft() throws Exception {
    JsonNode created = createTemplate("ppt", "运营汇报-" + UUID.randomUUID().toString().substring(0, 6));
    String templateId = created.path("meta").path("id").asText();

    JsonNode initialDsl = created.path("draft").path("dsl").deepCopy();
    ((com.fasterxml.jackson.databind.node.ObjectNode) initialDsl).put("title", "运营汇报-已发布");
    ObjectNode publishPrepRequest = objectMapper.createObjectNode();
    publishPrepRequest.set("dsl", initialDsl);
    publishPrepRequest.put("baseRevision", 1);
    mockMvc.perform(put("/api/v1/templates/{templateId}/draft", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(publishPrepRequest)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.meta.revisions.draft").value(2));

    mockMvc.perform(post("/api/v1/templates/{templateId}/publish", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          { "fromDraftRevision": 2 }
          """))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.meta.status").value("published"))
      .andExpect(jsonPath("$.meta.revisions.published").value(2))
      .andExpect(jsonPath("$.published.dsl.title").value("运营汇报-已发布"));

    JsonNode dirtyDsl = initialDsl.deepCopy();
    ((com.fasterxml.jackson.databind.node.ObjectNode) dirtyDsl).put("title", "运营汇报-临时草稿");
    ObjectNode dirtyRequest = objectMapper.createObjectNode();
    dirtyRequest.set("dsl", dirtyDsl);
    dirtyRequest.put("baseRevision", 2);
    mockMvc.perform(put("/api/v1/templates/{templateId}/draft", templateId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(dirtyRequest)))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.meta.revisions.draft").value(3));

    mockMvc.perform(post("/api/v1/templates/{templateId}/discard-draft", templateId))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.meta.status").value("published"))
      .andExpect(jsonPath("$.meta.revisions.draft").value(2))
      .andExpect(jsonPath("$.draft.dsl.title").value("运营汇报-已发布"));
  }

  private JsonNode createTemplate(String templateType, String name) throws Exception {
    MvcResult result = mockMvc.perform(post("/api/v1/templates")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {
            "templateType": "%s",
            "name": "%s"
          }
          """.formatted(templateType, name)))
      .andExpect(status().isCreated())
      .andReturn();
    return objectMapper.readTree(result.getResponse().getContentAsString());
  }

  private static Path createStorageDir() {
    try {
      return Files.createTempDirectory("chatbi-app-server-tests");
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to create temp storage dir for tests", ex);
    }
  }
}
