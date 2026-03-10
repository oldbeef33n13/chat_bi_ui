package com.chatbi.app.api.dataendpoint;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
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

@SpringBootTest(properties = "app.storage.base-dir=${dataendpoint.test.storage-dir}")
@AutoConfigureMockMvc
class DataEndpointControllerIntegrationTest {

  private static final Path STORAGE_DIR = createStorageDir();

  static {
    System.setProperty("dataendpoint.test.storage-dir", STORAGE_DIR.toAbsolutePath().toString().replace('\\', '/'));
  }

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ObjectMapper objectMapper;

  @Test
  void listEndpointsReturnsSeededOpsEndpoints() throws Exception {
    MvcResult result = mockMvc.perform(get("/api/v1/data-endpoints"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.total").isNumber())
      .andReturn();

    JsonNode payload = objectMapper.readTree(result.getResponse().getContentAsString());
    List<String> ids = new ArrayList<>();
    payload.path("items").forEach(item -> ids.add(item.path("id").asText()));
    assertThat(payload.path("total").asInt()).isGreaterThanOrEqualTo(12);
    assertThat(ids).contains(
      "ops_alarm_trend",
      "ops_incident_list",
      "ops_capacity_topn",
      "ops_service_health",
      "ops_alarm_domain_mix",
      "ops_region_health",
      "ops_shift_load",
      "ops_link_quality_detail",
      "ops_resource_usage",
      "ops_kpi_overview"
    );
  }

  @Test
  void createUpdateAndTestManualEndpoint() throws Exception {
    MvcResult createResult = mockMvc.perform(post("/api/v1/data-endpoints")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {
            "name": "手工接口",
            "category": "custom",
            "providerType": "manual_rest",
            "origin": "manual",
            "method": "GET",
            "path": "/manual/demo",
            "description": "用于本地联调",
            "sampleResponse": [
              { "label": "A", "value": 11 }
            ],
            "resultSchema": [
              { "name": "label", "type": "string", "label": "名称" },
              { "name": "value", "type": "number", "label": "数值" }
            ]
          }
          """))
      .andExpect(status().isCreated())
      .andExpect(jsonPath("$.providerType").value("manual_rest"))
      .andReturn();

    String endpointId = objectMapper.readTree(createResult.getResponse().getContentAsString()).path("id").asText();

    mockMvc.perform(put("/api/v1/data-endpoints/{endpointId}", endpointId)
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {
            "name": "手工接口-更新",
            "category": "custom",
            "providerType": "manual_rest",
            "origin": "manual",
            "method": "POST",
            "path": "/manual/demo",
            "description": "更新后的描述",
            "sampleResponse": {
              "rows": [
                { "label": "B", "value": 22 }
              ]
            },
            "resultSchema": [
              { "name": "label", "type": "string", "label": "名称" },
              { "name": "value", "type": "number", "label": "数值" }
            ]
          }
          """))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.name").value("手工接口-更新"))
      .andExpect(jsonPath("$.method").value("POST"));

    mockMvc.perform(post("/api/v1/data-endpoints/{endpointId}/test", endpointId)
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {
            "params": {
              "region": "north"
            }
          }
          """))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.requestEcho.region").value("north"))
      .andExpect(jsonPath("$.rows[0].label").value("B"))
      .andExpect(jsonPath("$.rows[0].value").value(22));
  }

  @Test
  void testBuiltInMockEndpointReturnsRows() throws Exception {
    mockMvc.perform(post("/api/v1/data-endpoints/{endpointId}/test", "ops_alarm_trend")
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {
            "params": {
              "region": "north",
              "from": "2026-03-01",
              "to": "2026-03-03"
            }
          }
          """))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.rows.length()").value(3))
      .andExpect(jsonPath("$.rows[0].ts").value("2026-03-01"))
      .andExpect(jsonPath("$.resultSchema[0].name").value("ts"));
  }

  private static Path createStorageDir() {
    try {
      return Files.createTempDirectory("chatbi-app-server-dataendpoint");
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to create temp storage dir for tests", ex);
    }
  }
}
