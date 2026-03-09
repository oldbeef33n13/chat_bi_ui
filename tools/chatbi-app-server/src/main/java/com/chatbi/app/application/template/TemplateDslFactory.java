package com.chatbi.app.application.template;

import com.chatbi.app.api.template.CreateTemplateRequest;
import com.chatbi.app.domain.template.TemplateType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class TemplateDslFactory {

  private final ObjectMapper objectMapper;

  public TemplateDslFactory(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public JsonNode createDefaultDsl(String templateId, CreateTemplateRequest request) {
    return switch (request.templateType()) {
      case DASHBOARD -> createDashboardDsl(
        templateId,
        request.name(),
        "workbench".equalsIgnoreCase(request.dashboardPreset()) ? "workbench" : "wallboard"
      );
      case REPORT -> createReportDsl(templateId, request.name());
      case PPT -> createPptDsl(templateId, request.name());
    };
  }

  public JsonNode createSeedDsl(String templateId, TemplateType templateType, String name) {
    return switch (templateType) {
      case DASHBOARD -> createDashboardDsl(templateId, name, "wallboard");
      case REPORT -> createReportDsl(templateId, name);
      case PPT -> createPptDsl(templateId, name);
    };
  }

  private JsonNode createDashboardDsl(String templateId, String name, String preset) {
    ObjectNode root = baseDoc(templateId, "dashboard", blankToDefault(name, "网络运维总览"));
    root.put("themeId", "workbench".equals(preset) ? "theme.tech.light" : "theme.tech.dark");
    root.set("dataSources", array(staticDataSource()));
    root.set("queries", array(staticQuery()));
    root.set("filters", array(timeFilter()));

    ObjectNode container = objectMapper.createObjectNode();
    container.put("id", "root");
    container.put("kind", "container");
    container.set("layout", objectMapper.createObjectNode().put("mode", "grid"));
    container.set("props", objectMapper.createObjectNode()
      .put("dashTitle", root.path("title").asText())
      .put("displayMode", "workbench".equals(preset) ? "scroll_page" : "fit_screen")
      .put("designWidthPx", "workbench".equals(preset) ? 1440 : 1920)
      .put("designHeightPx", "workbench".equals(preset) ? 960 : 1080)
      .put("pageWidthPx", 1280)
      .put("pageMarginPx", "workbench".equals(preset) ? 24 : 28)
      .put("gridCols", 12)
      .put("rowH", "workbench".equals(preset) ? 44 : 56)
      .put("gap", 16)
      .put("headerShow", true)
      .put("headerText", root.path("title").asText())
      .put("showFilterBar", true));

    ArrayNode children = objectMapper.createArrayNode();
    children.add(chartNode("chart-alarm", "告警趋势", 0, 0));
    children.add(chartNode("chart-capacity", "链路容量", 6, 0));
    container.set("children", children);
    root.set("root", container);
    return root;
  }

  private JsonNode createReportDsl(String templateId, String name) {
    ObjectNode root = baseDoc(templateId, "report", blankToDefault(name, "网络周报"));
    root.put("themeId", "theme.business.light");
    root.set("dataSources", array(staticDataSource()));

    ObjectNode container = objectMapper.createObjectNode();
    container.put("id", "root");
    container.put("kind", "container");
    container.set("layout", objectMapper.createObjectNode().put("mode", "flow"));
    container.set("props", objectMapper.createObjectNode()
      .put("reportTitle", root.path("title").asText())
      .put("headerShow", true)
      .put("footerShow", true)
      .put("coverEnabled", true)
      .put("coverTitle", root.path("title").asText())
      .put("summaryEnabled", true)
      .put("summaryTitle", "执行摘要")
      .put("summaryText", "本周核心链路整体稳定，重点区域容量压力可控。")
      .put("headerText", "网络周报")
      .put("footerText", "Chat BI")
      .put("bodyPaddingPx", 12)
      .put("sectionGapPx", 12)
      .put("blockGapPx", 8));

    ObjectNode section = objectMapper.createObjectNode();
    section.put("id", "section-1");
    section.put("kind", "section");
    section.set("props", objectMapper.createObjectNode().put("title", "1. 核心指标概览").put("editorMode", "canvas"));

    ArrayNode sectionChildren = objectMapper.createArrayNode();
    ObjectNode text = objectMapper.createObjectNode();
    text.put("id", "text-1");
    text.put("kind", "text");
    text.set("props", objectMapper.createObjectNode().put("text", "本周告警整体下降 12%，骨干网运行稳定。").put("format", "plain"));
    sectionChildren.add(text);

    ObjectNode chart = chartNode("report-chart-1", "本周告警趋势", 0, 0);
    chart.remove("layout");
    sectionChildren.add(chart);
    section.set("children", sectionChildren);

    container.set("children", array(section));
    root.set("root", container);
    return root;
  }

  private JsonNode createPptDsl(String templateId, String name) {
    ObjectNode root = baseDoc(templateId, "ppt", blankToDefault(name, "网络运营汇报"));
    root.put("themeId", "theme.tech.light");

    ObjectNode deck = objectMapper.createObjectNode();
    deck.put("id", "root");
    deck.put("kind", "container");
    deck.set("props", objectMapper.createObjectNode()
      .put("size", "16:9")
      .put("defaultBg", "#ffffff")
      .put("masterShowHeader", true)
      .put("masterHeaderText", root.path("title").asText())
      .put("masterShowFooter", true)
      .put("masterFooterText", "Chat BI")
      .put("masterShowSlideNumber", true));

    ObjectNode slide = objectMapper.createObjectNode();
    slide.put("id", "slide-1");
    slide.put("kind", "slide");
    slide.set("props", objectMapper.createObjectNode().put("title", "总览"));
    slide.set("layout", objectMapper.createObjectNode().put("mode", "absolute").put("x", 0).put("y", 0).put("w", 960).put("h", 540));

    ArrayNode slideChildren = objectMapper.createArrayNode();
    slideChildren.add(textNode("slide-text-1", "网络运营总览", 36, 26, 320, 48));
    slideChildren.add(absoluteChartNode("slide-chart-1", "告警趋势", 36, 94, 430, 260));
    slide.set("children", slideChildren);

    deck.set("children", array(slide));
    root.set("root", deck);
    return root;
  }

  private ObjectNode baseDoc(String templateId, String templateType, String title) {
    ObjectNode root = objectMapper.createObjectNode();
    root.put("docId", templateId);
    root.put("docType", templateType);
    root.put("schemaVersion", "1.0.0");
    root.put("title", title);
    root.put("locale", "zh-CN");
    return root;
  }

  private ObjectNode staticDataSource() {
    ObjectNode source = objectMapper.createObjectNode();
    source.put("id", "ds_alarm");
    source.put("type", "static");
    ArrayNode staticData = objectMapper.createArrayNode();
    staticData.add(row("Mon", 34, "East"));
    staticData.add(row("Tue", 23, "East"));
    staticData.add(row("Wed", 27, "West"));
    staticData.add(row("Thu", 18, "North"));
    staticData.add(row("Fri", 30, "South"));
    source.set("staticData", staticData);
    return source;
  }

  private ObjectNode staticQuery() {
    ObjectNode query = objectMapper.createObjectNode();
    query.put("queryId", "q_alarm_trend");
    query.put("sourceId", "ds_alarm");
    query.put("kind", "static");
    return query;
  }

  private ObjectNode timeFilter() {
    ObjectNode filter = objectMapper.createObjectNode();
    filter.put("filterId", "f_time");
    filter.put("type", "timeRange");
    filter.put("title", "时间范围");
    filter.put("bindParam", "timeRange");
    filter.put("scope", "global");
    filter.put("defaultValue", "last_7d");
    return filter;
  }

  private ObjectNode chartNode(String id, String title, int gx, int gy) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "chart");
    node.put("name", title);
    node.set("layout", objectMapper.createObjectNode()
      .put("mode", "grid")
      .put("gx", gx)
      .put("gy", gy)
      .put("gw", 6)
      .put("gh", 6));
    node.set("data", objectMapper.createObjectNode()
      .put("sourceId", "ds_alarm")
      .put("queryId", "q_alarm_trend")
      .set("filterRefs", array("f_time")));
    node.set("props", chartProps(title));
    return node;
  }

  private ObjectNode absoluteChartNode(String id, String title, int x, int y, int w, int h) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "chart");
    node.put("name", title);
    node.set("layout", objectMapper.createObjectNode()
      .put("mode", "absolute")
      .put("x", x)
      .put("y", y)
      .put("w", w)
      .put("h", h)
      .put("z", 1));
    node.set("props", chartProps(title));
    return node;
  }

  private ObjectNode chartProps(String title) {
    ObjectNode props = objectMapper.createObjectNode();
    props.put("chartType", "line");
    props.put("titleText", title);
    props.set("bindings", objectMapper.valueToTree(List.of(
      fieldBinding("x", "day"),
      fieldBinding("y", "alarm_count")
    )));
    props.put("smooth", true);
    props.put("legendShow", false);
    props.put("tooltipShow", true);
    return props;
  }

  private ObjectNode fieldBinding(String role, String field) {
    ObjectNode binding = objectMapper.createObjectNode();
    binding.put("role", role);
    binding.put("field", field);
    return binding;
  }

  private ObjectNode row(String day, int alarmCount, String region) {
    ObjectNode row = objectMapper.createObjectNode();
    row.put("day", day);
    row.put("alarm_count", alarmCount);
    row.put("region", region);
    return row;
  }

  private ObjectNode textNode(String id, String text, int x, int y, int w, int h) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "text");
    node.set("layout", objectMapper.createObjectNode()
      .put("mode", "absolute")
      .put("x", x)
      .put("y", y)
      .put("w", w)
      .put("h", h)
      .put("z", 1));
    node.set("props", objectMapper.createObjectNode().put("text", text).put("format", "plain"));
    node.set("style", objectMapper.createObjectNode().put("fontSize", 28).put("bold", true));
    return node;
  }

  private ArrayNode array(JsonNode... nodes) {
    ArrayNode array = objectMapper.createArrayNode();
    for (JsonNode node : nodes) {
      array.add(node);
    }
    return array;
  }

  private ArrayNode array(String... values) {
    ArrayNode array = objectMapper.createArrayNode();
    for (String value : values) {
      array.add(value);
    }
    return array;
  }

  private String blankToDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }
}
