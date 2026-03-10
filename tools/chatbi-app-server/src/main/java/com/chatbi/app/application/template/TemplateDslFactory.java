package com.chatbi.app.application.template;

import com.chatbi.app.api.template.CreateTemplateRequest;
import com.chatbi.app.domain.template.TemplateType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class TemplateDslFactory {

  private final ObjectMapper objectMapper;
  private final List<TemplateSeedDefinition> seedDefinitions;

  public TemplateDslFactory(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
    this.seedDefinitions = List.of(
      new TemplateSeedDefinition(
        "template-dashboard-overview",
        TemplateType.DASHBOARD,
        "网络运维总览",
        "覆盖告警趋势、容量压力和待处置事件的运维总览大屏",
        List.of("dashboard", "seed", "ops", "overview")
      ),
      new TemplateSeedDefinition(
        "template-dashboard-workbench",
        TemplateType.DASHBOARD,
        "网络运维工作台",
        "适合 PC 首页与值班场景的页面滚动工作台",
        List.of("dashboard", "seed", "ops", "workbench")
      ),
      new TemplateSeedDefinition(
        "template-dashboard-command-center",
        TemplateType.DASHBOARD,
        "运维指挥中心",
        "覆盖链路质量、资源压力与故障追踪的综合大屏",
        List.of("dashboard", "seed", "ops", "command")
      ),
      new TemplateSeedDefinition(
        "template-dashboard-chart-gallery",
        TemplateType.DASHBOARD,
        "图表能力样例",
        "覆盖 line、combo、pie、scatter、radar、treemap、gauge、heatmap、funnel、sankey 的图表画廊",
        List.of("dashboard", "seed", "chart", "gallery")
      ),
      new TemplateSeedDefinition(
        "template-report-weekly",
        TemplateType.REPORT,
        "网络周报",
        "包含趋势、容量和工单摘要的标准周报模板",
        List.of("report", "seed", "ops", "weekly")
      ),
      new TemplateSeedDefinition(
        "template-report-incident-review",
        TemplateType.REPORT,
        "重点事件复盘",
        "用于故障复盘与影响面分析的报告模板",
        List.of("report", "seed", "incident", "review")
      ),
      new TemplateSeedDefinition(
        "template-ppt-review",
        TemplateType.PPT,
        "网络运营汇报",
        "适合周会例会的双页汇报模板",
        List.of("ppt", "seed", "ops", "review")
      ),
      new TemplateSeedDefinition(
        "template-ppt-exec-briefing",
        TemplateType.PPT,
        "高层经营简报",
        "适合管理层查看的经营与健康汇报模板",
        List.of("ppt", "seed", "exec", "briefing")
      )
    );
  }

  public List<TemplateSeedDefinition> seedDefinitions() {
    return seedDefinitions;
  }

  public JsonNode createDefaultDsl(String templateId, CreateTemplateRequest request) {
    String seedTemplateId = blankOrNull(request.seedTemplateId());
    if (seedTemplateId != null && findSeedDefinition(seedTemplateId).isPresent()) {
      return createSeedDsl(templateId, seedTemplateId, request.name());
    }
    return switch (request.templateType()) {
      case DASHBOARD -> createDefaultDashboardDsl(
        templateId,
        request.name(),
        "workbench".equalsIgnoreCase(request.dashboardPreset()) ? "workbench" : "wallboard"
      );
      case REPORT -> createDefaultReportDsl(templateId, request.name());
      case PPT -> createDefaultPptDsl(templateId, request.name());
    };
  }

  public JsonNode createSeedDsl(String templateId, String seedTemplateId, String overrideName) {
    String displayName = blankToDefault(overrideName, findSeedDefinition(seedTemplateId).map(TemplateSeedDefinition::name).orElse("示例模板"));
    return switch (seedTemplateId) {
      case "template-dashboard-overview" -> createDashboardOverviewSeed(templateId, displayName);
      case "template-dashboard-workbench" -> createDashboardWorkbenchSeed(templateId, displayName);
      case "template-dashboard-command-center" -> createDashboardCommandCenterSeed(templateId, displayName);
      case "template-dashboard-chart-gallery" -> createDashboardChartGallerySeed(templateId, displayName);
      case "template-report-weekly" -> createReportWeeklySeed(templateId, displayName);
      case "template-report-incident-review" -> createReportIncidentReviewSeed(templateId, displayName);
      case "template-ppt-review" -> createPptReviewSeed(templateId, displayName);
      case "template-ppt-exec-briefing" -> createPptExecutiveSeed(templateId, displayName);
      default -> createDefaultDashboardDsl(templateId, displayName, "wallboard");
    };
  }

  private Optional<TemplateSeedDefinition> findSeedDefinition(String seedTemplateId) {
    return seedDefinitions.stream().filter(item -> item.id().equals(seedTemplateId)).findFirst();
  }

  private JsonNode createDefaultDashboardDsl(String templateId, String name, String preset) {
    ObjectNode root = dashboardDoc(templateId, blankToDefault(name, "新建大屏模板"), "workbench".equals(preset) ? "theme.tech.light" : "theme.tech.dark", preset);
    root.set("dataSources", array());
    root.set("queries", array());
    root.set("filters", array());
    ObjectNode container = dashboardRoot(root.path("title").asText(), preset);
    container.set("children", array());
    root.set("root", container);
    return root;
  }

  private JsonNode createDefaultReportDsl(String templateId, String name) {
    ObjectNode root = reportDoc(templateId, blankToDefault(name, "新建报告模板"));
    root.set("dataSources", array());
    root.set("queries", array());
    root.set("filters", array());
    ObjectNode container = reportRoot(root.path("title").asText());
    ObjectNode section = reportSection("section-1", "新建章节");
    section.set("children", array());
    container.set("children", array(section));
    root.set("root", container);
    return root;
  }

  private JsonNode createDefaultPptDsl(String templateId, String name) {
    ObjectNode root = pptDoc(templateId, blankToDefault(name, "新建汇报模板"));
    root.set("dataSources", array());
    root.set("queries", array());
    root.set("filters", array());
    ObjectNode deck = pptRoot(root.path("title").asText());
    ObjectNode slide = slideNode("slide-1", "新建页面");
    slide.set("children", array());
    deck.set("children", array(slide));
    root.set("root", deck);
    return root;
  }

  private JsonNode createDashboardOverviewSeed(String templateId, String name) {
    ObjectNode root = dashboardDoc(templateId, name, "theme.tech.dark", "wallboard");
    root.set("templateVariables", regionDateRangeVariables());
    root.set("filters", array(timeFilter(), regionFilter("all")));
    ObjectNode container = dashboardRoot(name, "wallboard");
    container.set("children", array(
      dynamicGridChartNode("dash-overview-alarm", "告警趋势", 0, 0, 7, 6, "ops_alarm_trend",
        objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
        chartProps("line", "告警趋势", array(
          fieldBinding("x", "ts"),
          fieldBinding("y", "critical").put("agg", "sum"),
          fieldBinding("series", "severity")
        ), true, true, false, false)
      ),
      dynamicGridChartNode("dash-overview-capacity", "容量压力 TopN", 7, 0, 5, 6, "ops_capacity_topn",
        objectNode("region", templateVarBinding("region"), "metric", constBinding("bandwidth"), "topN", constBinding(8)),
        chartProps("bar", "容量压力 TopN", array(
          fieldBinding("x", "linkName"),
          fieldBinding("y", "utilizationPct").put("agg", "avg")
        ), false, false, false, true)
      ),
      dynamicGridChartNode("dash-overview-health", "区域健康度", 0, 6, 6, 6, "ops_region_health",
        objectNode("statDate", systemVarBinding("bizDate"), "regionScope", templateVarBinding("region")),
        chartProps("bar", "区域健康度", array(
          fieldBinding("x", "region"),
          fieldBinding("y", "availabilityPct").put("agg", "avg")
        ), false, false, false, true)
      ),
      dynamicGridTableNode("dash-overview-incidents", "待处置事件", 6, 6, 6, 6, "ops_incident_list",
        objectNode(
          "region", templateVarBinding("region"),
          "severity", constBinding("all"),
          "status", constBinding("open"),
          "from", templateVarBinding("from"),
          "to", templateVarBinding("to"),
          "pageNo", constBinding(1),
          "pageSize", constBinding(8)
        ),
        tableProps("待处置事件", 8,
          tableColumn("incidentId", "事件ID"),
          tableColumn("title", "事件标题"),
          tableColumn("severity", "等级"),
          tableColumn("owner", "负责人"),
          tableColumn("durationMin", "持续(min)")
        )
      )
    ));
    root.set("root", container);
    return root;
  }

  private JsonNode createDashboardWorkbenchSeed(String templateId, String name) {
    ObjectNode root = dashboardDoc(templateId, name, "theme.tech.light", "workbench");
    root.set("templateVariables", array(
      templateVariable("region", "区域", "string", "all", "筛选区域"),
      templateVariable("bizDate", "业务日期", "date", "2026-03-07", "业务日期"),
      templateVariable("team", "班组", "string", "noc", "运维班组")
    ));
    ObjectNode container = dashboardRoot(name, "workbench");
    container.set("children", array(
      dynamicGridTableNode("dash-workbench-kpi", "当日KPI总览", 0, 0, 4, 5, "ops_kpi_overview",
        objectNode("region", templateVarBinding("region"), "bizDate", templateVarBinding("bizDate")),
        tableProps("当日KPI总览", 6,
          tableColumn("kpi", "指标"),
          tableColumn("label", "说明"),
          tableColumn("value", "当前值"),
          tableColumn("deltaPct", "变化率"),
          tableColumn("status", "状态")
        )
      ),
      dynamicGridChartNode("dash-workbench-health", "区域健康概览", 4, 0, 4, 5, "ops_region_health",
        objectNode("statDate", templateVarBinding("bizDate"), "regionScope", templateVarBinding("region")),
        chartProps("bar", "区域健康概览", array(
          fieldBinding("x", "region"),
          fieldBinding("y", "latencyMs").put("agg", "avg"),
          fieldBinding("series", "status")
        ), true, false, false, true)
      ),
      dynamicGridChartNode("dash-workbench-shift", "班组工单负载", 8, 0, 4, 5, "ops_shift_load",
        objectNode("shiftDate", templateVarBinding("bizDate"), "team", templateVarBinding("team"), "granularity", constBinding("hour")),
        chartProps("combo", "班组工单负载", array(
          fieldBinding("x", "slot"),
          fieldBinding("y", "onDutyTickets").put("agg", "avg"),
          fieldBinding("y2", "closedTickets").put("agg", "avg")
        ), true, false, false, false)
      ),
      dynamicGridTableNode("dash-workbench-incidents", "重点事件看板", 0, 5, 12, 7, "ops_incident_list",
        objectNode(
          "region", templateVarBinding("region"),
          "severity", constBinding("all"),
          "status", constBinding("all"),
          "from", constBinding("2026-03-01"),
          "to", templateVarBinding("bizDate"),
          "pageNo", constBinding(1),
          "pageSize", constBinding(12)
        ),
        tableProps("重点事件看板", 12,
          tableColumn("incidentId", "事件ID"),
          tableColumn("title", "标题"),
          tableColumn("region", "区域"),
          tableColumn("severity", "等级"),
          tableColumn("status", "状态"),
          tableColumn("owner", "负责人")
        )
      )
    ));
    root.set("root", container);
    return root;
  }

  private JsonNode createDashboardCommandCenterSeed(String templateId, String name) {
    ObjectNode root = dashboardDoc(templateId, name, "theme.tech.dark", "wallboard");
    root.set("templateVariables", regionDateRangeVariables());
    root.set("filters", array(timeFilter(), regionFilter("all")));
    ObjectNode container = dashboardRoot(name, "wallboard");
    container.set("children", array(
      dynamicGridChartNode("dash-command-domain", "业务域告警分布", 0, 0, 4, 6, "ops_alarm_domain_mix",
        objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
        chartProps("bar", "业务域告警分布", array(
          fieldBinding("x", "domain"),
          fieldBinding("y", "count").put("agg", "sum"),
          fieldBinding("series", "severity")
        ), true, false, false, true)
      ),
      dynamicGridChartNode("dash-command-link", "链路质量细节", 4, 0, 4, 6, "ops_link_quality_detail",
        objectNode("region", templateVarBinding("region"), "topN", constBinding(8)),
        chartProps("scatter", "链路质量细节", array(
          fieldBinding("x", "latencyMs"),
          fieldBinding("y", "lossPct").put("agg", "avg"),
          fieldBinding("size", "jitterMs"),
          fieldBinding("label", "linkName")
        ), false, false, false, false)
      ),
      dynamicGridChartNode("dash-command-resource", "资源压力", 8, 0, 4, 6, "ops_resource_usage",
        objectNode("region", templateVarBinding("region"), "resourceType", constBinding("cluster")),
        chartProps("bar", "资源压力", array(
          fieldBinding("x", "resourceName"),
          fieldBinding("y", "cpuPct").put("agg", "avg"),
          fieldBinding("series", "region")
        ), true, false, false, true)
      ),
      dynamicGridTableNode("dash-command-incident", "故障处置跟踪", 0, 6, 12, 6, "ops_incident_list",
        objectNode(
          "region", templateVarBinding("region"),
          "severity", constBinding("all"),
          "status", constBinding("open"),
          "from", templateVarBinding("from"),
          "to", templateVarBinding("to"),
          "pageNo", constBinding(1),
          "pageSize", constBinding(10)
        ),
        tableProps("故障处置跟踪", 10,
          tableColumn("incidentId", "事件ID"),
          tableColumn("title", "标题"),
          tableColumn("severity", "等级"),
          tableColumn("status", "状态"),
          tableColumn("owner", "负责人"),
          tableColumn("durationMin", "持续(min)")
        )
      )
    ));
    root.set("root", container);
    return root;
  }

  private JsonNode createDashboardChartGallerySeed(String templateId, String name) {
    ObjectNode root = dashboardDoc(templateId, name, "theme.tech.light", "workbench");
    root.set("templateVariables", regionDateRangeVariables());
    root.set("filters", array(timeFilter(), regionFilter("all")));
    ObjectNode container = dashboardRoot(name, "workbench");
    container.set("children", array(
      dynamicGridChartNode("gallery-line", "告警趋势", 0, 0, 4, 5, "ops_alarm_trend",
        objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
        chartProps("line", "告警趋势", array(
          fieldBinding("x", "ts"),
          fieldBinding("y", "critical").put("agg", "sum")
        ), false, true, true, false)
      ),
      dynamicGridChartNode("gallery-combo", "告警双轴趋势", 4, 0, 4, 5, "ops_alarm_trend",
        objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
        chartProps("combo", "告警双轴趋势", array(
          fieldBinding("x", "ts"),
          fieldBinding("y", "critical").put("agg", "sum"),
          fieldBinding("y2", "major").put("agg", "sum").put("axis", "secondary")
        ), true, false, false, false)
      ),
      dynamicGridChartNode("gallery-pie", "业务域告警占比", 8, 0, 4, 5, "ops_alarm_domain_mix",
        objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
        chartProps("pie", "业务域告警占比", array(
          fieldBinding("category", "domain"),
          fieldBinding("value", "count").put("agg", "sum")
        ), false, false, false, true)
      ),
      dynamicGridChartNode("gallery-scatter", "链路质量散点", 0, 5, 4, 5, "ops_link_quality_detail",
        objectNode("region", templateVarBinding("region"), "topN", constBinding(8)),
        chartProps("scatter", "链路质量散点", array(
          fieldBinding("x", "latencyMs"),
          fieldBinding("y", "lossPct").put("agg", "avg"),
          fieldBinding("size", "jitterMs"),
          fieldBinding("label", "linkName")
        ), false, false, false, false)
      ),
      dynamicGridChartNode("gallery-radar", "资源压力雷达", 4, 5, 4, 5, "ops_resource_usage",
        objectNode("region", templateVarBinding("region"), "resourceType", constBinding("cluster")),
        chartProps("radar", "资源压力雷达", array(
          fieldBinding("x", "resourceName"),
          fieldBinding("y", "cpuPct").put("agg", "avg"),
          fieldBinding("y1", "memPct").put("agg", "avg")
        ), true, false, true, false)
      ),
      dynamicGridChartNode("gallery-treemap", "业务域树图", 8, 5, 4, 5, "ops_alarm_domain_mix",
        objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
        chartProps("treemap", "业务域树图", array(
          fieldBinding("category", "domain"),
          fieldBinding("value", "count").put("agg", "sum")
        ), false, false, false, true)
      ),
      dynamicGridChartNode("gallery-gauge", "区域可用率仪表盘", 0, 10, 3, 5, "ops_region_health",
        objectNode("statDate", systemVarBinding("bizDate"), "regionScope", templateVarBinding("region")),
        chartProps("gauge", "区域可用率仪表盘", array(
          fieldBinding("value", "availabilityPct").put("agg", "avg")
        ), false, false, false, true)
      ),
      dynamicGridChartNode("gallery-heatmap", "变更热力日历", 3, 10, 5, 5, "ops_change_calendar",
        objectNode("month", constBinding("2026-03"), "region", templateVarBinding("region")),
        chartProps("heatmap", "变更热力日历", array(
          fieldBinding("x", "date"),
          fieldBinding("y", "changeCount").put("agg", "sum")
        ), false, false, false, false)
      ),
      dynamicGridChartNode("gallery-funnel", "班组工单漏斗", 8, 10, 4, 5, "ops_shift_load",
        objectNode("shiftDate", systemVarBinding("bizDate"), "team", constBinding("noc"), "granularity", constBinding("hour")),
        chartProps("funnel", "班组工单漏斗", array(
          fieldBinding("x", "slot"),
          fieldBinding("y", "onDutyTickets").put("agg", "sum")
        ), false, false, false, true)
      ),
      dynamicGridChartNode("gallery-sankey", "服务依赖流向", 0, 15, 6, 6, "ops_service_dependency_flow",
        objectNode("region", templateVarBinding("region"), "serviceGroup", constBinding("core")),
        chartProps("sankey", "服务依赖流向", array(
          fieldBinding("linkSource", "source"),
          fieldBinding("linkTarget", "target"),
          fieldBinding("linkValue", "trafficPct").put("agg", "sum")
        ), false, false, false, true)
      ),
      dynamicGridChartNode("gallery-bar", "服务时延对比", 6, 15, 6, 6, "ops_service_health",
        objectNode("region", templateVarBinding("region"), "serviceGroup", constBinding("core")),
        chartProps("bar", "服务时延对比", array(
          fieldBinding("x", "service"),
          fieldBinding("y", "latencyMs").put("agg", "avg")
        ), false, false, false, true)
      )
    ));
    root.set("root", container);
    return root;
  }

  private JsonNode createReportWeeklySeed(String templateId, String name) {
    ObjectNode root = reportDoc(templateId, name);
    root.set("templateVariables", regionDateRangeVariables());
    root.set("filters", array(regionFilter("all"), timeFilter()));
    ObjectNode container = reportRoot(name);
    container.set("children", array(
      reportSectionWithChildren("section-weekly-summary", "1. 一周核心趋势", array(
        reportTextNode("report-weekly-text", "本周整体告警与容量压力处于可控范围，局部区域仍需关注链路高峰时段的资源利用率。", 0, 0, 12, 2),
        dynamicGridChartNode("report-weekly-trend", "告警趋势", 0, 2, 7, 6, "ops_alarm_trend",
          objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
          chartProps("line", "告警趋势", array(
            fieldBinding("x", "ts"),
            fieldBinding("y", "critical").put("agg", "sum"),
            fieldBinding("series", "severity")
          ), true, true, false, false)
        ),
        dynamicGridChartNode("report-weekly-capacity", "容量压力 TopN", 7, 2, 5, 6, "ops_capacity_topn",
          objectNode("region", templateVarBinding("region"), "metric", constBinding("bandwidth"), "topN", constBinding(8)),
          chartProps("bar", "容量压力 TopN", array(
            fieldBinding("x", "linkName"),
            fieldBinding("y", "utilizationPct").put("agg", "avg")
          ), false, false, false, true)
        )
      )),
      reportSectionWithChildren("section-weekly-detail", "2. 重点事件明细", array(
        dynamicGridTableNode("report-weekly-table", "重点事件明细", 0, 0, 12, 7, "ops_incident_list",
          objectNode(
            "region", templateVarBinding("region"),
            "severity", constBinding("all"),
            "status", constBinding("all"),
            "from", templateVarBinding("from"),
            "to", templateVarBinding("to"),
            "pageNo", constBinding(1),
            "pageSize", constBinding(10)
          ),
          tableProps("重点事件明细", 10,
            tableColumn("incidentId", "事件ID"),
            tableColumn("title", "标题"),
            tableColumn("region", "区域"),
            tableColumn("severity", "等级"),
            tableColumn("status", "状态"),
            tableColumn("owner", "负责人"),
            tableColumn("openedAt", "发生时间")
          )
        )
      )),
      reportSectionWithChildren("section-weekly-health", "3. 服务健康评估", array(
        dynamicGridChartNode("report-weekly-health", "区域健康度", 0, 0, 6, 6, "ops_region_health",
          objectNode("statDate", systemVarBinding("bizDate"), "regionScope", templateVarBinding("region")),
          chartProps("bar", "区域健康度", array(
            fieldBinding("x", "region"),
            fieldBinding("y", "availabilityPct").put("agg", "avg")
          ), false, false, false, true)
        ),
        dynamicGridTableNode("report-weekly-summary", "工单摘要", 6, 0, 6, 6, "ops_ticket_summary",
          objectNode("team", constBinding("noc"), "statDate", systemVarBinding("bizDate")),
          tableProps("工单摘要", 4,
            tableColumn("openCount", "待处理"),
            tableColumn("closedCount", "已关闭"),
            tableColumn("mttrMin", "平均恢复(min)"),
            tableColumn("overdueCount", "超时工单")
          )
        )
      ))
    ));
    root.set("root", container);
    return root;
  }

  private JsonNode createReportIncidentReviewSeed(String templateId, String name) {
    ObjectNode root = reportDoc(templateId, name);
    root.set("templateVariables", regionDateRangeVariables());
    ObjectNode container = reportRoot(name);
    container.set("children", array(
      reportSectionWithChildren("section-incident-summary", "1. 事件摘要", array(
        reportTextNode("report-incident-text", "本报告聚焦关键故障、处置责任人与恢复时长，适用于故障复盘与运营例会。", 0, 0, 12, 2),
        dynamicGridTableNode("report-incident-table", "重点事件清单", 0, 2, 12, 7, "ops_incident_list",
          objectNode(
            "region", templateVarBinding("region"),
            "severity", constBinding("all"),
            "status", constBinding("all"),
            "from", templateVarBinding("from"),
            "to", templateVarBinding("to"),
            "pageNo", constBinding(1),
            "pageSize", constBinding(12)
          ),
          tableProps("重点事件清单", 12,
            tableColumn("incidentId", "事件ID"),
            tableColumn("title", "标题"),
            tableColumn("region", "区域"),
            tableColumn("severity", "等级"),
            tableColumn("status", "状态"),
            tableColumn("owner", "负责人"),
            tableColumn("durationMin", "持续(min)")
          )
        )
      )),
      reportSectionWithChildren("section-incident-health", "2. 影响面评估", array(
        dynamicGridChartNode("report-incident-domain", "业务域告警分布", 0, 0, 6, 6, "ops_alarm_domain_mix",
          objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
          chartProps("pie", "业务域告警分布", array(
            fieldBinding("category", "domain"),
            fieldBinding("value", "count").put("agg", "sum")
          ), false, false, false, true)
        ),
        dynamicGridChartNode("report-incident-health", "区域健康度", 6, 0, 6, 6, "ops_region_health",
          objectNode("statDate", systemVarBinding("bizDate"), "regionScope", templateVarBinding("region")),
          chartProps("bar", "区域健康度", array(
            fieldBinding("x", "region"),
            fieldBinding("y", "openIncidentCount").put("agg", "avg")
          ), false, false, false, true)
        )
      ))
    ));
    root.set("root", container);
    return root;
  }

  private JsonNode createPptReviewSeed(String templateId, String name) {
    ObjectNode root = pptDoc(templateId, name);
    root.set("templateVariables", regionDateRangeVariables());
    ObjectNode deck = pptRoot(name);
    ObjectNode overviewSlide = slideNode("slide-overview", "运营总览");
    overviewSlide.set("children", array(
      textNode("ppt-review-title", "一周运营总览", 36, 28, 320, 42),
      dynamicAbsoluteChartNode("ppt-review-trend", "告警趋势", 36, 92, 420, 250, "ops_alarm_trend",
        objectNode("region", templateVarBinding("region"), "from", templateVarBinding("from"), "to", templateVarBinding("to")),
        chartProps("line", "告警趋势", array(
          fieldBinding("x", "ts"),
          fieldBinding("y", "critical").put("agg", "sum"),
          fieldBinding("series", "severity")
        ), true, true, false, false)
      ),
      dynamicAbsoluteChartNode("ppt-review-health", "区域健康度", 492, 92, 390, 250, "ops_region_health",
        objectNode("statDate", systemVarBinding("bizDate"), "regionScope", templateVarBinding("region")),
        chartProps("bar", "区域健康度", array(
          fieldBinding("x", "region"),
          fieldBinding("y", "availabilityPct").put("agg", "avg")
        ), false, false, false, true)
      )
    ));
    ObjectNode detailSlide = slideNode("slide-detail", "事件与容量");
    detailSlide.set("children", array(
      dynamicAbsoluteChartNode("ppt-review-capacity", "容量压力 TopN", 36, 92, 430, 250, "ops_capacity_topn",
        objectNode("region", templateVarBinding("region"), "metric", constBinding("bandwidth"), "topN", constBinding(6)),
        chartProps("bar", "容量压力 TopN", array(
          fieldBinding("x", "linkName"),
          fieldBinding("y", "utilizationPct").put("agg", "avg")
        ), false, false, false, true)
      ),
      dynamicAbsoluteTableNode("ppt-review-incidents", "重点事件", 492, 92, 390, 250, "ops_incident_list",
        objectNode(
          "region", templateVarBinding("region"),
          "severity", constBinding("all"),
          "status", constBinding("open"),
          "from", templateVarBinding("from"),
          "to", templateVarBinding("to"),
          "pageNo", constBinding(1),
          "pageSize", constBinding(6)
        ),
        tableProps("重点事件", 6,
          tableColumn("incidentId", "事件ID"),
          tableColumn("title", "标题"),
          tableColumn("severity", "等级"),
          tableColumn("owner", "负责人")
        )
      )
    ));
    deck.set("children", array(overviewSlide, detailSlide));
    root.set("root", deck);
    return root;
  }

  private JsonNode createPptExecutiveSeed(String templateId, String name) {
    ObjectNode root = pptDoc(templateId, name);
    root.set("templateVariables", array(
      templateVariable("region", "区域", "string", "all", "筛选区域"),
      templateVariable("bizDate", "业务日期", "date", "2026-03-07", "业务日期")
    ));
    ObjectNode deck = pptRoot(name);
    ObjectNode slideOne = slideNode("slide-exec-one", "经营健康概览");
    slideOne.set("children", array(
      textNode("ppt-exec-title", "区域经营健康概览", 36, 28, 320, 42),
      dynamicAbsoluteChartNode("ppt-exec-kpi", "KPI 概览", 36, 92, 390, 250, "ops_kpi_overview",
        objectNode("region", templateVarBinding("region"), "bizDate", templateVarBinding("bizDate")),
        chartProps("bar", "KPI 概览", array(
          fieldBinding("x", "label"),
          fieldBinding("y", "value").put("agg", "avg")
        ), false, false, false, true)
      ),
      dynamicAbsoluteChartNode("ppt-exec-region", "区域健康度", 462, 92, 420, 250, "ops_region_health",
        objectNode("statDate", templateVarBinding("bizDate"), "regionScope", templateVarBinding("region")),
        chartProps("bar", "区域健康度", array(
          fieldBinding("x", "region"),
          fieldBinding("y", "latencyMs").put("agg", "avg")
        ), false, false, false, true)
      )
    ));
    deck.set("children", array(slideOne));
    root.set("root", deck);
    return root;
  }

  private ObjectNode dashboardDoc(String templateId, String title, String themeId, String preset) {
    ObjectNode root = baseDoc(templateId, "dashboard", title);
    root.put("themeId", themeId);
    root.set("dataSources", objectMapper.createArrayNode());
    root.set("queries", objectMapper.createArrayNode());
    root.set("filters", objectMapper.createArrayNode());
    root.set("root", dashboardRoot(title, preset));
    return root;
  }

  private ObjectNode reportDoc(String templateId, String title) {
    ObjectNode root = baseDoc(templateId, "report", title);
    root.put("themeId", "theme.business.light");
    root.set("dataSources", objectMapper.createArrayNode());
    root.set("queries", objectMapper.createArrayNode());
    root.set("filters", objectMapper.createArrayNode());
    return root;
  }

  private ObjectNode pptDoc(String templateId, String title) {
    ObjectNode root = baseDoc(templateId, "ppt", title);
    root.put("themeId", "theme.tech.light");
    root.set("dataSources", objectMapper.createArrayNode());
    root.set("queries", objectMapper.createArrayNode());
    root.set("filters", objectMapper.createArrayNode());
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

  private ObjectNode dashboardRoot(String title, String preset) {
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

  private ObjectNode reportRoot(String title) {
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

  private ObjectNode pptRoot(String title) {
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

  private ObjectNode slideNode(String id, String title) {
    ObjectNode slide = objectMapper.createObjectNode();
    slide.put("id", id);
    slide.put("kind", "slide");
    slide.set("props", objectMapper.createObjectNode().put("title", title));
    slide.set("layout", objectMapper.createObjectNode().put("mode", "absolute").put("x", 0).put("y", 0).put("w", 960).put("h", 540));
    return slide;
  }

  private ObjectNode reportSection(String id, String title) {
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

  private ObjectNode reportSectionWithChildren(String id, String title, ArrayNode children) {
    ObjectNode section = reportSection(id, title);
    section.set("children", children);
    return section;
  }

  private ObjectNode reportTextNode(String id, String text, int gx, int gy, int gw, int gh) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "text");
    node.set("layout", gridLayout(gx, gy, gw, gh));
    node.set("props", objectNode("text", text, "format", "plain"));
    return node;
  }

  private ObjectNode staticGridChartNode(String id, String title, int gx, int gy, int gw, int gh, ObjectNode props) {
    return chartNode(id, title, gridLayout(gx, gy, gw, gh), objectNode("sourceId", "ds_alarm", "queryId", "q_alarm_trend", "filterRefs", stringArray("f_time")), props);
  }

  private ObjectNode staticAbsoluteChartNode(String id, String title, int x, int y, int w, int h, ObjectNode props) {
    return chartNode(id, title, absoluteLayout(x, y, w, h), objectNode("sourceId", "ds_alarm", "queryId", "q_alarm_trend"), props);
  }

  private ObjectNode dynamicGridChartNode(String id, String title, int gx, int gy, int gw, int gh, String endpointId, ObjectNode paramBindings, ObjectNode props) {
    return chartNode(id, title, gridLayout(gx, gy, gw, gh), objectNode("endpointId", endpointId, "paramBindings", paramBindings), props);
  }

  private ObjectNode dynamicAbsoluteChartNode(String id, String title, int x, int y, int w, int h, String endpointId, ObjectNode paramBindings, ObjectNode props) {
    return chartNode(id, title, absoluteLayout(x, y, w, h), objectNode("endpointId", endpointId, "paramBindings", paramBindings), props);
  }

  private ObjectNode dynamicGridTableNode(String id, String title, int gx, int gy, int gw, int gh, String endpointId, ObjectNode paramBindings, ObjectNode props) {
    return tableNode(id, title, gridLayout(gx, gy, gw, gh), objectNode("endpointId", endpointId, "paramBindings", paramBindings), props);
  }

  private ObjectNode dynamicAbsoluteTableNode(String id, String title, int x, int y, int w, int h, String endpointId, ObjectNode paramBindings, ObjectNode props) {
    return tableNode(id, title, absoluteLayout(x, y, w, h), objectNode("endpointId", endpointId, "paramBindings", paramBindings), props);
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

  private ObjectNode chartProps(String chartType, String title, ArrayNode bindings, boolean legendShow, boolean smooth, boolean area, boolean labelShow) {
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

  private ObjectNode tableProps(String title, int maxRows, ObjectNode... columns) {
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

  private ObjectNode tableColumn(String key, String title) {
    return objectMapper.createObjectNode().put("key", key).put("title", title);
  }

  private ObjectNode fieldBinding(String role, String field) {
    return objectMapper.createObjectNode().put("role", role).put("field", field);
  }

  private ObjectNode templateVariable(String key, String label, String type, Object defaultValue, String description) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("key", key);
    node.put("label", label);
    node.put("type", type);
    node.set("defaultValue", objectMapper.valueToTree(defaultValue));
    node.put("description", description);
    return node;
  }

  private ArrayNode regionDateRangeVariables() {
    return array(
      templateVariable("region", "区域", "string", "all", "筛选区域"),
      templateVariable("from", "开始日期", "date", "2026-03-01", "统计起始日期"),
      templateVariable("to", "结束日期", "date", "2026-03-07", "统计结束日期")
    );
  }

  private ObjectNode constBinding(Object value) {
    return objectNode("from", "const", "value", value);
  }

  private ObjectNode templateVarBinding(String key) {
    return objectNode("from", "templateVar", "key", key);
  }

  private ObjectNode systemVarBinding(String key) {
    return objectNode("from", "systemVar", "key", key);
  }

  private ObjectNode regionFilter(String defaultValue) {
    return objectNode("filterId", "f_region", "type", "select", "title", "区域", "bindParam", "region", "scope", "global", "defaultValue", defaultValue);
  }

  private ObjectNode timeFilter() {
    return objectNode("filterId", "f_time", "type", "timeRange", "title", "时间范围", "bindParam", "timeRange", "scope", "global", "defaultValue", "last_7d");
  }

  private ObjectNode staticDataSource() {
    return objectNode("id", "ds_alarm", "type", "static", "staticData", array(
      row("Mon", 34, "East"),
      row("Tue", 23, "East"),
      row("Wed", 27, "West"),
      row("Thu", 18, "North"),
      row("Fri", 30, "South")
    ));
  }

  private ObjectNode staticQuery() {
    return objectNode("queryId", "q_alarm_trend", "sourceId", "ds_alarm", "kind", "static");
  }

  private ObjectNode row(String day, int alarmCount, String region) {
    return objectNode("day", day, "alarm_count", alarmCount, "region", region);
  }

  private ObjectNode textNode(String id, String text, int x, int y, int w, int h) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("id", id);
    node.put("kind", "text");
    node.set("layout", absoluteLayout(x, y, w, h));
    node.set("props", objectNode("text", text, "format", "plain"));
    node.set("style", objectNode("fontSize", 28, "bold", true));
    return node;
  }

  private ObjectNode gridLayout(int gx, int gy, int gw, int gh) {
    return objectNode("mode", "grid", "gx", gx, "gy", gy, "gw", gw, "gh", gh);
  }

  private ObjectNode absoluteLayout(int x, int y, int w, int h) {
    return objectNode("mode", "absolute", "x", x, "y", y, "w", w, "h", h, "z", 1);
  }

  private ObjectNode objectNode(Object... keyValues) {
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

  private ArrayNode array(JsonNode... nodes) {
    ArrayNode array = objectMapper.createArrayNode();
    for (JsonNode node : nodes) {
      array.add(node);
    }
    return array;
  }

  private ArrayNode stringArray(String... values) {
    ArrayNode array = objectMapper.createArrayNode();
    for (String value : values) {
      array.add(value);
    }
    return array;
  }

  private String blankOrNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

  private String blankToDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }
}
