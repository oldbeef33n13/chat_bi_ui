package com.chatbi.app.application.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

@Component
public class ReportTemplateSeedFactory {

  private final TemplateDslSupport dsl;

  public ReportTemplateSeedFactory(TemplateDslSupport dsl) {
    this.dsl = dsl;
  }

  public JsonNode createDefaultDsl(String templateId, String name) {
    ObjectNode root = dsl.reportDoc(templateId, blankToDefault(name, "新建报告模板"));
    root.set("filters", dsl.array());
    ObjectNode container = dsl.reportRoot(root.path("title").asText());
    ObjectNode section = dsl.reportSection("section-1", "新建章节");
    section.set("children", dsl.array());
    container.set("children", dsl.array(section));
    root.set("root", container);
    return root;
  }

  public JsonNode createWeeklySeed(String templateId, String name) {
    ObjectNode root = dsl.reportDoc(templateId, name);
    root.set("templateVariables", dsl.regionDateRangeVariables());
    root.set("filters", dsl.array(dsl.regionFilter("all"), dsl.timeFilter()));
    ObjectNode container = dsl.reportRoot(name);
    container.set("children", dsl.array(
      dsl.reportSectionWithChildren("section-weekly-summary", "1. 一周核心趋势", dsl.array(
        dsl.reportTextNode("report-weekly-text", "本周整体告警与容量压力处于可控范围，局部区域仍需关注链路高峰时段的资源利用率。", 0, 0, 12, 2),
        dsl.dynamicGridChartNode("report-weekly-trend", "告警趋势", 0, 2, 7, 6, "ops_alarm_trend",
          dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
          dsl.chartProps("line", "告警趋势", dsl.array(
            dsl.fieldBinding("x", "ts"),
            dsl.fieldBinding("y", "critical").put("agg", "sum"),
            dsl.fieldBinding("series", "severity")
          ), true, true, false, false)
        ),
        dsl.dynamicGridChartNode("report-weekly-capacity", "容量压力 TopN", 7, 2, 5, 6, "ops_capacity_topn",
          dsl.objectNode("region", dsl.templateVarBinding("region"), "metric", dsl.constBinding("bandwidth"), "topN", dsl.constBinding(8)),
          dsl.chartProps("bar", "容量压力 TopN", dsl.array(
            dsl.fieldBinding("x", "linkName"),
            dsl.fieldBinding("y", "utilizationPct").put("agg", "avg")
          ), false, false, false, true)
        )
      )),
      dsl.reportSectionWithChildren("section-weekly-detail", "2. 重点事件明细", dsl.array(
        dsl.dynamicGridTableNode("report-weekly-table", "重点事件明细", 0, 0, 12, 7, "ops_incident_list",
          dsl.objectNode(
            "region", dsl.templateVarBinding("region"),
            "severity", dsl.constBinding("all"),
            "status", dsl.constBinding("all"),
            "from", dsl.templateVarBinding("from"),
            "to", dsl.templateVarBinding("to"),
            "pageNo", dsl.constBinding(1),
            "pageSize", dsl.constBinding(10)
          ),
          dsl.tableProps("重点事件明细", 10,
            dsl.tableColumn("incidentId", "事件ID"),
            dsl.tableColumn("title", "标题"),
            dsl.tableColumn("region", "区域"),
            dsl.tableColumn("severity", "等级"),
            dsl.tableColumn("status", "状态"),
            dsl.tableColumn("owner", "负责人"),
            dsl.tableColumn("openedAt", "发生时间")
          )
        )
      )),
      dsl.reportSectionWithChildren("section-weekly-health", "3. 服务健康评估", dsl.array(
        dsl.dynamicGridChartNode("report-weekly-health", "区域健康度", 0, 0, 6, 6, "ops_region_health",
          dsl.objectNode("statDate", dsl.systemVarBinding("bizDate"), "regionScope", dsl.templateVarBinding("region")),
          dsl.chartProps("bar", "区域健康度", dsl.array(
            dsl.fieldBinding("x", "region"),
            dsl.fieldBinding("y", "availabilityPct").put("agg", "avg")
          ), false, false, false, true)
        ),
        dsl.dynamicGridTableNode("report-weekly-summary", "工单摘要", 6, 0, 6, 6, "ops_ticket_summary",
          dsl.objectNode("team", dsl.constBinding("noc"), "statDate", dsl.systemVarBinding("bizDate")),
          dsl.tableProps("工单摘要", 4,
            dsl.tableColumn("openCount", "待处理"),
            dsl.tableColumn("closedCount", "已关闭"),
            dsl.tableColumn("mttrMin", "平均恢复(min)"),
            dsl.tableColumn("overdueCount", "超时工单")
          )
        )
      ))
    ));
    root.set("root", container);
    return root;
  }

  public JsonNode createIncidentReviewSeed(String templateId, String name) {
    ObjectNode root = dsl.reportDoc(templateId, name);
    root.set("templateVariables", dsl.regionDateRangeVariables());
    ObjectNode container = dsl.reportRoot(name);
    container.set("children", dsl.array(
      dsl.reportSectionWithChildren("section-incident-summary", "1. 事件摘要", dsl.array(
        dsl.reportTextNode("report-incident-text", "本报告聚焦关键故障、处置责任人与恢复时长，适用于故障复盘与运营例会。", 0, 0, 12, 2),
        dsl.dynamicGridTableNode("report-incident-table", "重点事件清单", 0, 2, 12, 7, "ops_incident_list",
          dsl.objectNode(
            "region", dsl.templateVarBinding("region"),
            "severity", dsl.constBinding("all"),
            "status", dsl.constBinding("all"),
            "from", dsl.templateVarBinding("from"),
            "to", dsl.templateVarBinding("to"),
            "pageNo", dsl.constBinding(1),
            "pageSize", dsl.constBinding(12)
          ),
          dsl.tableProps("重点事件清单", 12,
            dsl.tableColumn("incidentId", "事件ID"),
            dsl.tableColumn("title", "标题"),
            dsl.tableColumn("region", "区域"),
            dsl.tableColumn("severity", "等级"),
            dsl.tableColumn("status", "状态"),
            dsl.tableColumn("owner", "负责人"),
            dsl.tableColumn("durationMin", "持续(min)")
          )
        )
      )),
      dsl.reportSectionWithChildren("section-incident-health", "2. 影响面评估", dsl.array(
        dsl.dynamicGridChartNode("report-incident-domain", "业务域告警分布", 0, 0, 6, 6, "ops_alarm_domain_mix",
          dsl.objectNode("region", dsl.templateVarBinding("region"), "from", dsl.templateVarBinding("from"), "to", dsl.templateVarBinding("to")),
          dsl.chartProps("pie", "业务域告警分布", dsl.array(
            dsl.fieldBinding("category", "domain"),
            dsl.fieldBinding("value", "count").put("agg", "sum")
          ), false, false, false, true)
        ),
        dsl.dynamicGridChartNode("report-incident-health", "区域健康度", 6, 0, 6, 6, "ops_region_health",
          dsl.objectNode("statDate", dsl.systemVarBinding("bizDate"), "regionScope", dsl.templateVarBinding("region")),
          dsl.chartProps("bar", "区域健康度", dsl.array(
            dsl.fieldBinding("x", "region"),
            dsl.fieldBinding("y", "openIncidentCount").put("agg", "avg")
          ), false, false, false, true)
        )
      ))
    ));
    root.set("root", container);
    return root;
  }

  private String blankToDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }
}
