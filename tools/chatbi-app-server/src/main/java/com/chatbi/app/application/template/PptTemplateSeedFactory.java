package com.chatbi.app.application.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

@Component
public class PptTemplateSeedFactory {

  private final TemplateDslSupport dsl;

  public PptTemplateSeedFactory(TemplateDslSupport dsl) {
    this.dsl = dsl;
  }

  public JsonNode createDefaultDsl(String templateId, String name) {
    ObjectNode root = dsl.pptDoc(templateId, blankToDefault(name, "新建汇报模板"));
    root.set("filters", dsl.array());
    ObjectNode deck = dsl.pptRoot(root.path("title").asText());
    ObjectNode slide = dsl.slideNode("slide-1", "新建页面");
    slide.set("children", dsl.array());
    deck.set("children", dsl.array(slide));
    root.set("root", deck);
    return root;
  }

  public JsonNode createReviewSeed(String templateId, String name) {
    ObjectNode root = dsl.pptDoc(templateId, name);
    root.set("templateVariables", dsl.regionDateRangeVariables());
    ObjectNode deck = dsl.pptRoot(name);
    ObjectNode overviewSlide = dsl.slideNode("slide-overview", "运营总览");
    overviewSlide.set("children", dsl.array(
      dsl.textNode("ppt-review-title", "一周运营总览", 36, 28, 320, 42),
      dsl.dynamicAbsoluteChartNode("ppt-review-trend", "告警趋势", 36, 92, 420, 250, "ops_alarm_trend",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
        dsl.chartProps("line", "告警趋势", dsl.array(
          dsl.fieldBinding("x", "ts"),
          dsl.fieldBinding("y", "critical").put("agg", "sum"),
          dsl.fieldBinding("series", "severity")
        ), true, true, false, false)
      ),
      dsl.dynamicAbsoluteChartNode("ppt-review-health", "区域健康度", 492, 92, 390, 250, "ops_region_health",
        dsl.objectNode("statDate", dsl.systemVarBinding("bizDate"), "regionScope", dsl.templateVarBinding("region")),
        dsl.chartProps("bar", "区域健康度", dsl.array(
          dsl.fieldBinding("x", "region"),
          dsl.fieldBinding("y", "availabilityPct").put("agg", "avg")
        ), false, false, false, true)
      )
    ));
    ObjectNode detailSlide = dsl.slideNode("slide-detail", "事件与容量");
    detailSlide.set("children", dsl.array(
      dsl.dynamicAbsoluteChartNode("ppt-review-capacity", "容量压力 TopN", 36, 92, 430, 250, "ops_capacity_topn",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "metric", dsl.constBinding("bandwidth"), "topN", dsl.constBinding(6)),
        dsl.chartProps("bar", "容量压力 TopN", dsl.array(
          dsl.fieldBinding("x", "linkName"),
          dsl.fieldBinding("y", "utilizationPct").put("agg", "avg")
        ), false, false, false, true)
      ),
      dsl.dynamicAbsoluteTableNode("ppt-review-incidents", "重点事件", 492, 92, 390, 250, "ops_incident_list",
        dsl.objectNode(
          "region", dsl.templateVarBinding("region"),
          "severity", dsl.constBinding("all"),
          "status", dsl.constBinding("open"),
          "from", dsl.templateVarBinding("from"),
          "to", dsl.templateVarBinding("to"),
          "pageNo", dsl.constBinding(1),
          "pageSize", dsl.constBinding(6)
        ),
        dsl.tableProps("重点事件", 6,
          dsl.tableColumn("incidentId", "事件ID"),
          dsl.tableColumn("title", "标题"),
          dsl.tableColumn("severity", "等级"),
          dsl.tableColumn("owner", "负责人")
        )
      )
    ));
    deck.set("children", dsl.array(overviewSlide, detailSlide));
    root.set("root", deck);
    return root;
  }

  public JsonNode createExecutiveSeed(String templateId, String name) {
    ObjectNode root = dsl.pptDoc(templateId, name);
    root.set("templateVariables", dsl.array(
      dsl.templateVariable("region", "区域", "string", "all", "筛选区域"),
      dsl.templateVariable("bizDate", "业务日期", "date", "2026-03-07", "业务日期")
    ));
    ObjectNode deck = dsl.pptRoot(name);
    ObjectNode slideOne = dsl.slideNode("slide-exec-one", "经营健康概览");
    slideOne.set("children", dsl.array(
      dsl.textNode("ppt-exec-title", "区域经营健康概览", 36, 28, 320, 42),
      dsl.dynamicAbsoluteChartNode("ppt-exec-kpi", "KPI 概览", 36, 92, 390, 250, "ops_kpi_overview",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "bizDate", dsl.templateVarBinding("bizDate")),
        dsl.chartProps("bar", "KPI 概览", dsl.array(
          dsl.fieldBinding("x", "label"),
          dsl.fieldBinding("y", "value").put("agg", "avg")
        ), false, false, false, true)
      ),
      dsl.dynamicAbsoluteChartNode("ppt-exec-region", "区域健康度", 462, 92, 420, 250, "ops_region_health",
        dsl.objectNode("statDate", dsl.templateVarBinding("bizDate"), "regionScope", dsl.templateVarBinding("region")),
        dsl.chartProps("bar", "区域健康度", dsl.array(
          dsl.fieldBinding("x", "region"),
          dsl.fieldBinding("y", "latencyMs").put("agg", "avg")
        ), false, false, false, true)
      )
    ));
    deck.set("children", dsl.array(slideOne));
    root.set("root", deck);
    return root;
  }

  private String blankToDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }
}
