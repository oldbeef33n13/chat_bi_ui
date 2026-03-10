package com.chatbi.app.application.render;

import com.chatbi.app.application.dataendpoint.DataEndpointService;
import com.chatbi.app.application.template.TemplateService;
import com.chatbi.app.common.error.BadRequestException;
import com.chatbi.app.domain.template.TemplateContent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class TemplateSnapshotService {

  private final TemplateService templateService;
  private final DataEndpointService dataEndpointService;
  private final ObjectMapper objectMapper;

  public TemplateSnapshotService(
    TemplateService templateService,
    DataEndpointService dataEndpointService,
    ObjectMapper objectMapper
  ) {
    this.templateService = templateService;
    this.dataEndpointService = dataEndpointService;
    this.objectMapper = objectMapper;
  }

  public TemplatePreviewResult previewTemplate(String templateId, JsonNode overrideDsl, Map<String, Object> variables) {
    TemplateContent content = templateService.getCurrent(templateId);
    JsonNode templateDsl = overrideDsl == null ? content.dsl() : validateTemplateDsl(overrideDsl);
    SnapshotRenderResult renderResult = renderSnapshot(templateDsl, variables);
    return new TemplatePreviewResult(
      templateId,
      content.revision(),
      renderResult.snapshot(),
      renderResult.resolvedVariables()
    );
  }

  public SnapshotRenderResult renderSnapshot(JsonNode templateDsl, Map<String, Object> variables) {
    ObjectNode templateObject = validateTemplateDsl(templateDsl);
    ObjectNode snapshot = templateObject.deepCopy();
    Map<String, Object> resolvedVariables = resolveTemplateVariables(snapshot, variables);
    ArrayNode dataSources = ensureArray(snapshot, "dataSources");
    ArrayNode queries = ensureArray(snapshot, "queries");
    Set<String> usedSourceIds = collectIds(dataSources, "id");
    Set<String> usedQueryIds = collectIds(queries, "queryId");
    JsonNode rootNode = snapshot.path("root");
    if (rootNode instanceof ObjectNode objectNode) {
      renderNode(objectNode, dataSources, queries, usedSourceIds, usedQueryIds, resolvedVariables);
    }
    return new SnapshotRenderResult(snapshot, resolvedVariables);
  }

  private ObjectNode validateTemplateDsl(JsonNode templateDsl) {
    if (!(templateDsl instanceof ObjectNode templateObject)) {
      throw new BadRequestException("template dsl 必须是对象");
    }
    return templateObject;
  }

  private void renderNode(
    ObjectNode node,
    ArrayNode dataSources,
    ArrayNode queries,
    Set<String> usedSourceIds,
    Set<String> usedQueryIds,
    Map<String, Object> resolvedVariables
  ) {
    if (node.path("data").isObject()) {
      applyDynamicBinding((ObjectNode) node.path("data"), node.path("id").asText("node"), dataSources, queries, usedSourceIds, usedQueryIds, resolvedVariables);
    }
    JsonNode children = node.path("children");
    if (children.isArray()) {
      for (JsonNode child : children) {
        if (child instanceof ObjectNode childNode) {
          renderNode(childNode, dataSources, queries, usedSourceIds, usedQueryIds, resolvedVariables);
        }
      }
    }
  }

  private void applyDynamicBinding(
    ObjectNode dataNode,
    String nodeId,
    ArrayNode dataSources,
    ArrayNode queries,
    Set<String> usedSourceIds,
    Set<String> usedQueryIds,
    Map<String, Object> resolvedVariables
  ) {
    String endpointId = textValue(dataNode.path("endpointId"));
    if (endpointId == null) {
      return;
    }
    Map<String, Object> params = resolveEndpointParams(dataNode, resolvedVariables);
    JsonNode rows = dataEndpointService.executeEndpoint(endpointId, params);
    String sourceId = uniqueId("ds_dyn_" + sanitizeId(nodeId), usedSourceIds);
    String queryId = uniqueId("q_dyn_" + sanitizeId(nodeId), usedQueryIds);

    ObjectNode dataSource = objectMapper.createObjectNode();
    dataSource.put("id", sourceId);
    dataSource.put("type", "static");
    dataSource.set("staticData", rows.deepCopy());
    dataSources.add(dataSource);

    ObjectNode query = objectMapper.createObjectNode();
    query.put("queryId", queryId);
    query.put("sourceId", sourceId);
    query.put("kind", "static");
    queries.add(query);

    dataNode.remove("endpointId");
    dataNode.remove("paramBindings");
    dataNode.remove("params");
    dataNode.put("sourceId", sourceId);
    dataNode.put("queryId", queryId);
  }

  private Map<String, Object> resolveTemplateVariables(ObjectNode snapshot, Map<String, Object> requestVariables) {
    Map<String, Object> resolved = new LinkedHashMap<>();
    JsonNode defs = snapshot.path("templateVariables");
    if (defs.isArray()) {
      for (JsonNode item : defs) {
        String key = item.path("key").asText(null);
        if (key != null && !key.isBlank() && item.has("defaultValue")) {
          resolved.put(key, objectMapper.convertValue(item.get("defaultValue"), Object.class));
        }
      }
    }
    if (requestVariables != null) {
      resolved.putAll(requestVariables);
    }
    return Collections.unmodifiableMap(resolved);
  }

  private Map<String, Object> resolveEndpointParams(ObjectNode dataNode, Map<String, Object> resolvedVariables) {
    Map<String, Object> params = new LinkedHashMap<>();
    JsonNode rawParams = dataNode.path("params");
    if (rawParams.isObject()) {
      rawParams.fields().forEachRemaining(entry -> params.put(entry.getKey(), objectMapper.convertValue(entry.getValue(), Object.class)));
    }
    JsonNode paramBindings = dataNode.path("paramBindings");
    if (paramBindings.isObject()) {
      paramBindings.fields().forEachRemaining(entry -> {
        Object value = resolveParamBinding(entry.getKey(), entry.getValue(), resolvedVariables);
        if (value != null) {
          params.put(entry.getKey(), value);
        }
      });
    }
    return params;
  }

  private Object resolveParamBinding(String paramName, JsonNode bindingNode, Map<String, Object> resolvedVariables) {
    String from = bindingNode.path("from").asText("const");
    String key = bindingNode.path("key").asText(paramName);
    return switch (from) {
      case "const" -> bindingNode.has("value") ? objectMapper.convertValue(bindingNode.get("value"), Object.class) : null;
      case "templateVar", "filter" -> resolvedVariables.containsKey(key)
        ? resolvedVariables.get(key)
        : (bindingNode.has("value") ? objectMapper.convertValue(bindingNode.get("value"), Object.class) : null);
      case "systemVar" -> resolveSystemVariable(key);
      default -> bindingNode.has("value") ? objectMapper.convertValue(bindingNode.get("value"), Object.class) : null;
    };
  }

  private Object resolveSystemVariable(String key) {
    return switch (key) {
      case "today", "currentDate", "bizDate" -> LocalDate.now(ZoneOffset.UTC).toString();
      case "now", "currentDateTime" -> Instant.now().toString();
      case "currentTimestamp" -> Instant.now().toEpochMilli();
      default -> null;
    };
  }

  private ArrayNode ensureArray(ObjectNode parent, String fieldName) {
    JsonNode current = parent.get(fieldName);
    if (current instanceof ArrayNode arrayNode) {
      return arrayNode;
    }
    ArrayNode arrayNode = objectMapper.createArrayNode();
    parent.set(fieldName, arrayNode);
    return arrayNode;
  }

  private Set<String> collectIds(ArrayNode array, String fieldName) {
    Set<String> ids = new LinkedHashSet<>();
    for (JsonNode item : array) {
      String value = item.path(fieldName).asText(null);
      if (value != null && !value.isBlank()) {
        ids.add(value);
      }
    }
    return ids;
  }

  private String uniqueId(String base, Set<String> usedIds) {
    String candidate = base;
    int suffix = 2;
    while (usedIds.contains(candidate)) {
      candidate = base + "_" + suffix++;
    }
    usedIds.add(candidate);
    return candidate;
  }

  private String sanitizeId(String raw) {
    if (raw == null || raw.isBlank()) {
      return "node";
    }
    return raw.replaceAll("[^A-Za-z0-9_-]+", "_");
  }

  private String textValue(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    String value = node.asText("");
    return value.isBlank() ? null : value;
  }
}
