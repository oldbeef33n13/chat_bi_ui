package com.chatbi.app.application.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

@Component
public class TemplateDslSupport {

  private final ObjectMapper objectMapper;

  public TemplateDslSupport(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public ObjectNode dashboardDoc(String templateId, String title, String themeId, String preset) {
    ObjectNode root = baseDoc(templateId, "dashboard", title);
    root.put("themeId", themeId);
    root.set("dataSources", sampleAlarmDataSources());
    root.set("queries", sampleAlarmQueries());
    root.set("filters", objectMapper.createArrayNode());
    root.set("root", dashboardRoot(title, preset));
    return root;
  }

  public ObjectNode reportDoc(String templateId, String title) {
    ObjectNode root = baseDoc(templateId, "report", title);
    root.put("themeId", "theme.business.light");
    root.set("dataSources", sampleAlarmDataSources());
    root.set("queries", sampleAlarmQueries());
    root.set("filters", objectMapper.createArrayNode());
    return root;
  }

  public ObjectNode pptDoc(String templateId, String title) {
    ObjectNode root = baseDoc(templateId, "ppt", title);
    root.put("themeId", "theme.tech.light");
    root.set("dataSources", sampleAlarmDataSources());
    root.set("queries", sampleAlarmQueries());
    root.set("filters", objectMapper.createArrayNode());
    return root;
  }

  public ObjectNode dashboardRoot(String title, String preset) {
    ObjectNode container = objectMapper.createObjectNode();
    container.put("id", "root");
    container.put("kind", "container");
    container.set("layout", objectMapper.createObjectNode().put("mode", "grid"));
    container.set("props", objectMapper.createObjectNode()
      .put("dashTitle", title)
      .put("displayMode", "workbench".equals(preset) ? "scroll_page" : "fit_screen")
      .put("designWidthPx", "workbench".equals(preset) ? 1440 : 1920)
      .put("designHeightPx", "workbench".equals(preset) ? 960 : 1080)
      .put("pageWidthPx", "workbench".equals(preset) ? 1440 : 1280)
      .put("pageMarginPx", "workbench".equals(preset) ? 24 : 28)
      .put("gridCols", 12)
      .put("rowH", "workbench".equals(preset) ? 44 : 56)
      .put("gap", 16)
      .put("headerShow", true)
      .put("headerText", title)
      .put("showFilterBar", true)
      .put("footerShow", false)
      .put("footerText", "Chat BI"));
    return container;
  }

  public ObjectNode reportRoot(String title) {
    ObjectNode container = objectMapper.createObjectNode();
    container.put("id", "root");
    container.put("kind", "container");
    container.set("layout", objectMapper.createObjectNode().put("mode", "flow"));
    container.set("props", objectMapper.createObjectNode()
      .put("reportTitle", title)
      .put("headerShow", true)
      .put("footerShow", true)
      .put("coverEnabled", true)
      .put("coverTitle", title)
      .put("summaryEnabled", true)
      .put("summaryTitle", "执行摘要")
      .put("summaryText", "模板默认支持动态接口，适合本地联调与演示。")
      .put("headerText", title)
      .put("footerText", "Chat BI")
      .put("bodyPaddingPx", 12)
      .put("sectionGapPx", 12)
      .put("blockGapPx", 8));
    return container;
  }

  public ObjectNode pptRoot(String title) {
    ObjectNode deck = objectMapper.createObjectNode();
    deck.put("id", "root");
    deck.put("kind", "container");
    deck.set("props", objectMapper.createObjectNode()
      .put("size", "16:9")
      .put("defaultBg", "#ffffff")
      .put("masterShowHeader", true)
      .put("masterHeaderText", title)
      .put("masterShowFooter", true)
      .put("masterFooterText", "Chat BI")
      .put("masterShowSlideNumber", true));
    return deck;
  }

  public ObjectNode slideNode(String id, String title) {
    ObjectNode slide = objectMapper.createObjectNode();
    slide.put("id", id);
    slide.put("kind", "slide");
    slide.set("props", objectMapper.createObjectNode().put("title", title));
    slide.set("layout", objectMapper.createObjectNode().put("mode", "absolute").put("x", 0).put("y", 0).put("w", 960).put("h", 540));
    return slide;
  }

  public ObjectNode reportSection(String id, String title) {
    ObjectNode section = objectMapper.createObjectNode();
    section.put("id", id);
    section.put("kind", "section");
    section.set("props", objectMapper.createObjectNode()
      .put("title", title)
      .put("editorMode", "canvas")
      .put("canvasCols", 12)
      .put("canvasPageHeightPx", 760)
      .put("canvasSnapPx", 8)
      .put("canvasGapPx", 12)
      .put("canvasPaddingPx", 12)
      .put("canvasOverflow", "grow"));
    return section;
  }

  public ObjectNode reportSectionWithChildren(String id, String title, ArrayNode children) {
    ObjectNode section = reportSection(id, title);
    section.set("children", children);
    return section;
  }

  public ObjectNode reportTextNode(String id, String text, int gx, int gy, int gw, int gh) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "text");
    node.set("layout", gridLayout(gx, gy, gw, gh));
    node.set("props", objectNode("text", text, "format", "plain"));
    return node;
  }

  public ObjectNode dynamicGridChartNode(String id, String title, int gx, int gy, int gw, int gh, String endpointId, ObjectNode paramBindings, ObjectNode props) {
    return chartNode(id, title, gridLayout(gx, gy, gw, gh), objectNode("endpointId", endpointId, "paramBindings", paramBindings), props);
  }

  public ObjectNode dynamicAbsoluteChartNode(String id, String title, int x, int y, int w, int h, String endpointId, ObjectNode paramBindings, ObjectNode props) {
    return chartNode(id, title, absoluteLayout(x, y, w, h), objectNode("endpointId", endpointId, "paramBindings", paramBindings), props);
  }

  public ObjectNode dynamicGridTableNode(String id, String title, int gx, int gy, int gw, int gh, String endpointId, ObjectNode paramBindings, ObjectNode props) {
    return tableNode(id, title, gridLayout(gx, gy, gw, gh), objectNode("endpointId", endpointId, "paramBindings", paramBindings), props);
  }

  public ObjectNode dynamicAbsoluteTableNode(String id, String title, int x, int y, int w, int h, String endpointId, ObjectNode paramBindings, ObjectNode props) {
    return tableNode(id, title, absoluteLayout(x, y, w, h), objectNode("endpointId", endpointId, "paramBindings", paramBindings), props);
  }

  public ObjectNode chartProps(String chartType, String title, ArrayNode bindings, boolean legendShow, boolean smooth, boolean area, boolean labelShow) {
    ObjectNode props = objectMapper.createObjectNode();
    props.put("chartType", chartType);
    props.put("titleText", title);
    props.set("bindings", bindings);
    props.put("legendShow", legendShow);
    props.put("tooltipShow", true);
    props.put("smooth", smooth);
    props.put("area", area);
    props.put("labelShow", labelShow);
    return props;
  }

  public ObjectNode tableProps(String title, int maxRows, ObjectNode... columns) {
    ObjectNode props = objectMapper.createObjectNode();
    props.put("titleText", title);
    props.put("maxRows", maxRows);
    ArrayNode columnArray = objectMapper.createArrayNode();
    for (ObjectNode column : columns) {
      columnArray.add(column);
    }
    props.set("columns", columnArray);
    return props;
  }

  public ObjectNode tableColumn(String key, String title) {
    return objectMapper.createObjectNode().put("key", key).put("title", title);
  }

  public ObjectNode fieldBinding(String role, String field) {
    return objectMapper.createObjectNode().put("role", role).put("field", field);
  }

  public ObjectNode templateVariable(String key, String label, String type, Object defaultValue, String description) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("key", key);
    node.put("label", label);
    node.put("type", type);
    node.set("defaultValue", objectMapper.valueToTree(defaultValue));
    node.put("description", description);
    return node;
  }

  public ArrayNode regionDateRangeVariables() {
    return array(
      templateVariable("region", "区域", "string", "all", "筛选区域"),
      templateVariable("from", "开始日期", "date", "2026-03-01", "统计起始日期"),
      templateVariable("to", "结束日期", "date", "2026-03-07", "统计结束日期")
    );
  }

  public ObjectNode constBinding(Object value) {
    return objectNode("from", "const", "value", value);
  }

  public ObjectNode templateVarBinding(String key) {
    return objectNode("from", "templateVar", "key", key);
  }

  public ObjectNode systemVarBinding(String key) {
    return objectNode("from", "systemVar", "key", key);
  }

  public ObjectNode regionFilter(String defaultValue) {
    return objectNode("filterId", "f_region", "type", "select", "title", "区域", "bindParam", "region", "scope", "global", "defaultValue", defaultValue);
  }

  public ObjectNode timeFilter() {
    return objectNode("filterId", "f_time", "type", "timeRange", "title", "时间范围", "bindParam", "timeRange", "scope", "global", "defaultValue", "last_7d");
  }

  public ObjectNode textNode(String id, String text, int x, int y, int w, int h) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "text");
    node.set("layout", absoluteLayout(x, y, w, h));
    node.set("props", objectNode("text", text, "format", "plain"));
    node.set("style", objectNode("fontSize", 28, "bold", true));
    return node;
  }

  public ObjectNode gridLayout(int gx, int gy, int gw, int gh) {
    return objectNode("mode", "grid", "gx", gx, "gy", gy, "gw", gw, "gh", gh);
  }

  public ObjectNode absoluteLayout(int x, int y, int w, int h) {
    return objectNode("mode", "absolute", "x", x, "y", y, "w", w, "h", h, "z", 1);
  }

  public ObjectNode objectNode(Object... keyValues) {
    ObjectNode node = objectMapper.createObjectNode();
    for (int index = 0; index < keyValues.length; index += 2) {
      String key = String.valueOf(keyValues[index]);
      Object value = keyValues[index + 1];
      if (value instanceof JsonNode jsonNode) {
        node.set(key, jsonNode);
      } else {
        node.set(key, objectMapper.valueToTree(value));
      }
    }
    return node;
  }

  public ArrayNode array(JsonNode... nodes) {
    ArrayNode array = objectMapper.createArrayNode();
    for (JsonNode node : nodes) {
      array.add(node);
    }
    return array;
  }

  private ArrayNode sampleAlarmDataSources() {
    return array(objectNode(
      "id", "ds_alarm",
      "type", "static",
      "staticData", array(
        objectNode("day", "Mon", "alarm_count", 34, "region", "East"),
        objectNode("day", "Tue", "alarm_count", 23, "region", "East"),
        objectNode("day", "Wed", "alarm_count", 27, "region", "West"),
        objectNode("day", "Thu", "alarm_count", 18, "region", "North"),
        objectNode("day", "Fri", "alarm_count", 30, "region", "South"),
        objectNode("day", "Sat", "alarm_count", 11, "region", "South"),
        objectNode("day", "Sun", "alarm_count", 19, "region", "East")
      )
    ));
  }

  private ArrayNode sampleAlarmQueries() {
    return array(objectNode(
      "queryId", "q_alarm_trend",
      "sourceId", "ds_alarm",
      "kind", "static"
    ));
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

  private ObjectNode chartNode(String id, String title, ObjectNode layout, ObjectNode data, ObjectNode props) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "chart");
    node.put("name", title);
    node.set("layout", layout);
    node.set("data", data);
    node.set("props", props);
    return node;
  }

  private ObjectNode tableNode(String id, String title, ObjectNode layout, ObjectNode data, ObjectNode props) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "table");
    node.put("name", title);
    node.set("layout", layout);
    node.set("data", data);
    node.set("props", props);
    return node;
  }
}
