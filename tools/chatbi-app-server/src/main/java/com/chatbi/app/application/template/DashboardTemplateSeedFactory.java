package com.chatbi.app.application.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

@Component
public class DashboardTemplateSeedFactory {

  private final TemplateDslSupport dsl;

  public DashboardTemplateSeedFactory(TemplateDslSupport dsl) {
    this.dsl = dsl;
  }

  public JsonNode createDefaultDsl(String templateId, String name, String preset) {
    ObjectNode root = dsl.dashboardDoc(
      templateId,
      blankToDefault(name, "新建大屏模板"),
      "workbench".equals(preset) ? "theme.tech.light" : "theme.tech.dark",
      preset
    );
    root.set("filters", dsl.array());
    ObjectNode container = dsl.dashboardRoot(root.path("title").asText(), preset);
    container.set("children", dsl.array());
    root.set("root", container);
    return root;
  }

  public JsonNode createOverviewSeed(String templateId, String name) {
    ObjectNode root = dsl.dashboardDoc(templateId, name, "theme.tech.dark", "wallboard");
    root.set("templateVariables", dsl.regionDateRangeVariables());
    root.set("filters", dsl.array(dsl.timeFilter(), dsl.regionFilter("all")));
    ObjectNode container = dsl.dashboardRoot(name, "wallboard");
    container.set("children", dsl.array(
      dsl.dynamicGridChartNode("dash-overview-alarm", "告警趋势", 0, 0, 7, 6, "ops_alarm_trend",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
        dsl.chartProps("line", "告警趋势", dsl.array(
          dsl.fieldBinding("x", "ts"),
          dsl.fieldBinding("y", "critical").put("agg", "sum"),
          dsl.fieldBinding("series", "severity")
        ), true, true, false, false)
      ),
      dsl.dynamicGridChartNode("dash-overview-capacity", "容量压力 TopN", 7, 0, 5, 6, "ops_capacity_topn",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "metric", dsl.constBinding("bandwidth"), "topN", dsl.constBinding(8)),
        dsl.chartProps("bar", "容量压力 TopN", dsl.array(
          dsl.fieldBinding("x", "linkName"),
          dsl.fieldBinding("y", "utilizationPct").put("agg", "avg")
        ), false, false, false, true)
      ),
      dsl.dynamicGridChartNode("dash-overview-health", "区域健康度", 0, 6, 6, 6, "ops_region_health",
        dsl.objectNode("statDate", dsl.systemVarBinding("bizDate"), "regionScope", dsl.templateVarBinding("region")),
        dsl.chartProps("bar", "区域健康度", dsl.array(
          dsl.fieldBinding("x", "region"),
          dsl.fieldBinding("y", "availabilityPct").put("agg", "avg")
        ), false, false, false, true)
      ),
      dsl.dynamicGridTableNode("dash-overview-incidents", "待处置事件", 6, 6, 6, 6, "ops_incident_list",
        dsl.objectNode(
          "region", dsl.templateVarBinding("region"),
          "severity", dsl.constBinding("all"),
          "status", dsl.constBinding("open"),
          "from", dsl.templateVarBinding("from"),
          "to", dsl.templateVarBinding("to"),
          "pageNo", dsl.constBinding(1),
          "pageSize", dsl.constBinding(8)
        ),
        dsl.tableProps("待处置事件", 8,
          dsl.tableColumn("incidentId", "事件ID"),
          dsl.tableColumn("title", "事件标题"),
          dsl.tableColumn("severity", "等级"),
          dsl.tableColumn("owner", "负责人"),
          dsl.tableColumn("durationMin", "持续(min)")
        )
      )
    ));
    root.set("root", container);
    return root;
  }

  public JsonNode createWorkbenchSeed(String templateId, String name) {
    ObjectNode root = dsl.dashboardDoc(templateId, name, "theme.tech.light", "workbench");
    root.set("templateVariables", dsl.array(
      dsl.templateVariable("region", "区域", "string", "all", "筛选区域"),
      dsl.templateVariable("bizDate", "业务日期", "date", "2026-03-07", "业务日期"),
      dsl.templateVariable("team", "班组", "string", "noc", "运维班组")
    ));
    ObjectNode container = dsl.dashboardRoot(name, "workbench");
    container.set("children", dsl.array(
      dsl.dynamicGridTableNode("dash-workbench-kpi", "当日KPI总览", 0, 0, 4, 5, "ops_kpi_overview",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "bizDate", dsl.templateVarBinding("bizDate")),
        dsl.tableProps("当日KPI总览", 6,
          dsl.tableColumn("kpi", "指标"),
          dsl.tableColumn("label", "说明"),
          dsl.tableColumn("value", "当前值"),
          dsl.tableColumn("deltaPct", "变化率"),
          dsl.tableColumn("status", "状态")
        )
      ),
      dsl.dynamicGridChartNode("dash-workbench-health", "区域健康概览", 4, 0, 4, 5, "ops_region_health",
        dsl.objectNode("statDate", dsl.templateVarBinding("bizDate"), "regionScope", dsl.templateVarBinding("region")),
        dsl.chartProps("bar", "区域健康概览", dsl.array(
          dsl.fieldBinding("x", "region"),
          dsl.fieldBinding("y", "latencyMs").put("agg", "avg"),
          dsl.fieldBinding("series", "status")
        ), true, false, false, true)
      ),
      dsl.dynamicGridChartNode("dash-workbench-shift", "班组工单负载", 8, 0, 4, 5, "ops_shift_load",
        dsl.objectNode("shiftDate", dsl.templateVarBinding("bizDate"), "team", dsl.templateVarBinding("team"), "granularity", dsl.constBinding("hour")),
        dsl.chartProps("combo", "班组工单负载", dsl.array(
          dsl.fieldBinding("x", "slot"),
          dsl.fieldBinding("y", "onDutyTickets").put("agg", "avg"),
          dsl.fieldBinding("y2", "closedTickets").put("agg", "avg")
        ), true, false, false, false)
      ),
      dsl.dynamicGridTableNode("dash-workbench-incidents", "重点事件看板", 0, 5, 12, 7, "ops_incident_list",
        dsl.objectNode(
          "region", dsl.templateVarBinding("region"),
          "severity", dsl.constBinding("all"),
          "status", dsl.constBinding("all"),
          "from", dsl.constBinding("2026-03-01"),
          "to", dsl.templateVarBinding("bizDate"),
          "pageNo", dsl.constBinding(1),
          "pageSize", dsl.constBinding(12)
        ),
        dsl.tableProps("重点事件看板", 12,
          dsl.tableColumn("incidentId", "事件ID"),
          dsl.tableColumn("title", "标题"),
          dsl.tableColumn("region", "区域"),
          dsl.tableColumn("severity", "等级"),
          dsl.tableColumn("status", "状态"),
          dsl.tableColumn("owner", "负责人")
        )
      )
    ));
    root.set("root", container);
    return root;
  }

  public JsonNode createCommandCenterSeed(String templateId, String name) {
    ObjectNode root = dsl.dashboardDoc(templateId, name, "theme.tech.dark", "wallboard");
    root.set("templateVariables", dsl.regionDateRangeVariables());
    root.set("filters", dsl.array(dsl.timeFilter(), dsl.regionFilter("all")));
    ObjectNode container = dsl.dashboardRoot(name, "wallboard");
    container.set("children", dsl.array(
      dsl.dynamicGridChartNode("dash-command-domain", "业务域告警分布", 0, 0, 4, 6, "ops_alarm_domain_mix",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
        dsl.chartProps("bar", "业务域告警分布", dsl.array(
          dsl.fieldBinding("x", "domain"),
          dsl.fieldBinding("y", "count").put("agg", "sum"),
          dsl.fieldBinding("series", "severity")
        ), true, false, false, true)
      ),
      dsl.dynamicGridChartNode("dash-command-link", "链路质量细节", 4, 0, 4, 6, "ops_link_quality_detail",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "topN", dsl.constBinding(8)),
        dsl.chartProps("scatter", "链路质量细节", dsl.array(
          dsl.fieldBinding("x", "latencyMs"),
          dsl.fieldBinding("y", "lossPct").put("agg", "avg"),
          dsl.fieldBinding("size", "jitterMs"),
          dsl.fieldBinding("label", "linkName")
        ), false, false, false, false)
      ),
      dsl.dynamicGridChartNode("dash-command-resource", "资源压力", 8, 0, 4, 6, "ops_resource_usage",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "resourceType", dsl.constBinding("cluster")),
        dsl.chartProps("bar", "资源压力", dsl.array(
          dsl.fieldBinding("x", "resourceName"),
          dsl.fieldBinding("y", "cpuPct").put("agg", "avg"),
          dsl.fieldBinding("series", "region")
        ), true, false, false, true)
      ),
      dsl.dynamicGridTableNode("dash-command-incident", "故障处置跟踪", 0, 6, 12, 6, "ops_incident_list",
        dsl.objectNode(
          "region", dsl.templateVarBinding("region"),
          "severity", dsl.constBinding("all"),
          "status", dsl.constBinding("open"),
          "from", dsl.templateVarBinding("from"),
          "to", dsl.templateVarBinding("to"),
          "pageNo", dsl.constBinding(1),
          "pageSize", dsl.constBinding(10)
        ),
        dsl.tableProps("故障处置跟踪", 10,
          dsl.tableColumn("incidentId", "事件ID"),
          dsl.tableColumn("title", "标题"),
          dsl.tableColumn("severity", "等级"),
          dsl.tableColumn("status", "状态"),
          dsl.tableColumn("owner", "负责人"),
          dsl.tableColumn("durationMin", "持续(min)")
        )
      )
    ));
    root.set("root", container);
    return root;
  }

  public JsonNode createChartGallerySeed(String templateId, String name) {
    ObjectNode root = dsl.dashboardDoc(templateId, name, "theme.tech.light", "workbench");
    root.set("templateVariables", dsl.regionDateRangeVariables());
    root.set("filters", dsl.array(dsl.timeFilter(), dsl.regionFilter("all")));
    ObjectNode container = dsl.dashboardRoot(name, "workbench");
    container.set("children", dsl.array(
      dsl.dynamicGridChartNode("gallery-line", "告警趋势", 0, 0, 4, 5, "ops_alarm_trend",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
        dsl.chartProps("line", "告警趋势", dsl.array(
          dsl.fieldBinding("x", "ts"),
          dsl.fieldBinding("y", "critical").put("agg", "sum")
        ), false, true, true, false)
      ),
      dsl.dynamicGridChartNode("gallery-combo", "告警双轴趋势", 4, 0, 4, 5, "ops_alarm_trend",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
        dsl.chartProps("combo", "告警双轴趋势", dsl.array(
          dsl.fieldBinding("x", "ts"),
          dsl.fieldBinding("y", "critical").put("agg", "sum"),
          dsl.fieldBinding("y2", "major").put("agg", "sum").put("axis", "secondary")
        ), true, false, false, false)
      ),
      dsl.dynamicGridChartNode("gallery-pie", "业务域告警占比", 8, 0, 4, 5, "ops_alarm_domain_mix",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
        dsl.chartProps("pie", "业务域告警占比", dsl.array(
          dsl.fieldBinding("category", "domain"),
          dsl.fieldBinding("value", "count").put("agg", "sum")
        ), false, false, false, true)
      ),
      dsl.dynamicGridChartNode("gallery-scatter", "链路质量散点", 0, 5, 4, 5, "ops_link_quality_detail",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "topN", dsl.constBinding(8)),
        dsl.chartProps("scatter", "链路质量散点", dsl.array(
          dsl.fieldBinding("x", "latencyMs"),
          dsl.fieldBinding("y", "lossPct").put("agg", "avg"),
          dsl.fieldBinding("size", "jitterMs"),
          dsl.fieldBinding("label", "linkName")
        ), false, false, false, false)
      ),
      dsl.dynamicGridChartNode("gallery-radar", "资源压力雷达", 4, 5, 4, 5, "ops_resource_usage",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "resourceType", dsl.constBinding("cluster")),
        dsl.chartProps("radar", "资源压力雷达", dsl.array(
          dsl.fieldBinding("x", "resourceName"),
          dsl.fieldBinding("y", "cpuPct").put("agg", "avg"),
          dsl.fieldBinding("y1", "memPct").put("agg", "avg")
        ), true, false, true, false)
      ),
      dsl.dynamicGridChartNode("gallery-treemap", "业务域树图", 8, 5, 4, 5, "ops_alarm_domain_mix",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
        dsl.chartProps("treemap", "业务域树图", dsl.array(
          dsl.fieldBinding("category", "domain"),
          dsl.fieldBinding("value", "count").put("agg", "sum")
        ), false, false, false, true)
      ),
      dsl.dynamicGridChartNode("gallery-gauge", "区域可用率仪表盘", 0, 10, 3, 5, "ops_region_health",
        dsl.objectNode("statDate", dsl.systemVarBinding("bizDate"), "regionScope", dsl.templateVarBinding("region")),
        dsl.chartProps("gauge", "区域可用率仪表盘", dsl.array(
          dsl.fieldBinding("value", "availabilityPct").put("agg", "avg")
        ), false, false, false, true)
      ),
      dsl.dynamicGridChartNode("gallery-heatmap", "变更热力日历", 3, 10, 5, 5, "ops_change_calendar",
        dsl.objectNode("month", dsl.constBinding("2026-03"), "region", dsl.templateVarBinding("region")),
        dsl.chartProps("heatmap", "变更热力日历", dsl.array(
          dsl.fieldBinding("x", "date"),
          dsl.fieldBinding("y", "changeCount").put("agg", "sum")
        ), false, false, false, false)
      ),
      dsl.dynamicGridChartNode("gallery-funnel", "班组工单漏斗", 8, 10, 4, 5, "ops_shift_load",
        dsl.objectNode("shiftDate", dsl.systemVarBinding("bizDate"), "team", dsl.constBinding("noc"), "granularity", dsl.constBinding("hour")),
        dsl.chartProps("funnel", "班组工单漏斗", dsl.array(
          dsl.fieldBinding("x", "slot"),
          dsl.fieldBinding("y", "onDutyTickets").put("agg", "sum")
        ), false, false, false, true)
      ),
      dsl.dynamicGridChartNode("gallery-sankey", "服务依赖流向", 0, 15, 6, 6, "ops_service_dependency_flow",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "serviceGroup", dsl.constBinding("core")),
        dsl.chartProps("sankey", "服务依赖流向", dsl.array(
          dsl.fieldBinding("linkSource", "source"),
          dsl.fieldBinding("linkTarget", "target"),
          dsl.fieldBinding("linkValue", "trafficPct").put("agg", "sum")
        ), false, false, false, true)
      ),
      dsl.dynamicGridChartNode("gallery-bar", "服务时延对比", 6, 15, 6, 6, "ops_service_health",
        dsl.objectNode("region", dsl.templateVarBinding("region"), "serviceGroup", dsl.constBinding("core")),
        dsl.chartProps("bar", "服务时延对比", dsl.array(
          dsl.fieldBinding("x", "service"),
          dsl.fieldBinding("y", "latencyMs").put("agg", "avg")
        ), false, false, false, true)
      )
    ));
    root.set("root", container);
    return root;
  }

  private String blankToDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }
}
