package com.chatbi.app.application.dataendpoint;

import com.chatbi.app.domain.dataendpoint.EndpointHttpMethod;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

@Component
public class BuiltInDataEndpointDefinitionFactory {

  private final ObjectMapper objectMapper;

  public BuiltInDataEndpointDefinitionFactory(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public BuiltInDataEndpointDefinition opsAlarmTrend() {
    return new BuiltInDataEndpointDefinition(
      "ops_alarm_trend",
      "告警趋势",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/alarm-trend",
      "按时间维度返回告警趋势",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("from", "date", false, "2026-03-01", "开始日期"),
        param("to", "date", false, "2026-03-07", "结束日期"),
        param("granularity", "string", false, "day", "时间粒度", "day", "hour")
      ),
      array(
        result("ts", "time", "时间", "采样时间", null, false),
        result("critical", "number", "严重告警", "critical 告警数量", "count", true),
        result("major", "number", "重要告警", "major 告警数量", "count", true),
        result("minor", "number", "次要告警", "minor 告警数量", "count", true)
      ),
      object().put("region", "north").put("from", "2026-03-01").put("to", "2026-03-07").put("granularity", "day")
    );
  }

  public BuiltInDataEndpointDefinition opsIncidentList() {
    return new BuiltInDataEndpointDefinition(
      "ops_incident_list",
      "事件列表",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/incidents",
      "返回事件详情分页列表",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("severity", "string", false, "all", "告警等级", "all", "critical", "major", "minor"),
        param("status", "string", false, "open", "处理状态", "all", "open", "closed"),
        param("from", "date", false, "2026-03-01", "开始日期"),
        param("to", "date", false, "2026-03-07", "结束日期"),
        param("pageNo", "number", false, 1, "页码"),
        param("pageSize", "number", false, 10, "分页大小")
      ),
      array(
        result("incidentId", "string", "事件 ID", "事件唯一标识", null, false),
        result("title", "string", "事件标题", "事件说明", null, false),
        result("region", "string", "区域", "区域编码", null, false),
        result("severity", "string", "等级", "严重程度", null, false),
        result("status", "string", "状态", "处理状态", null, false),
        result("openedAt", "datetime", "发生时间", "首次发现时间", null, false),
        result("owner", "string", "负责人", "当前处理人", null, false),
        result("durationMin", "number", "持续时长", "当前持续分钟数", "min", true)
      ),
      object().put("region", "east").put("severity", "major").put("status", "open").put("pageNo", 1).put("pageSize", 10)
    );
  }

  public BuiltInDataEndpointDefinition opsCapacityTopN() {
    return new BuiltInDataEndpointDefinition(
      "ops_capacity_topn",
      "容量压力 TopN",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/capacity-topn",
      "返回链路容量占用 TopN",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("metric", "string", false, "bandwidth", "排序指标", "bandwidth", "latency"),
        param("topN", "number", false, 8, "返回数量")
      ),
      array(
        result("linkName", "string", "链路名称", "链路名称", null, false),
        result("region", "string", "区域", "区域编码", null, false),
        result("utilizationPct", "number", "利用率", "峰值利用率", "%", true),
        result("peakBps", "number", "峰值带宽", "峰值带宽", "bps", true),
        result("capacityBps", "number", "总带宽", "链路总带宽", "bps", true)
      ),
      object().put("region", "all").put("metric", "bandwidth").put("topN", 8)
    );
  }

  public BuiltInDataEndpointDefinition opsTicketSummary() {
    return new BuiltInDataEndpointDefinition(
      "ops_ticket_summary",
      "工单摘要",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/ticket-summary",
      "返回工单统计摘要",
      array(
        param("team", "string", false, "noc", "运维班组"),
        param("statDate", "date", false, "2026-03-07", "统计日期")
      ),
      array(
        result("openCount", "number", "待处理工单", "当前未闭环工单数", "count", true),
        result("closedCount", "number", "已关闭工单", "当日已关闭工单数", "count", true),
        result("mttrMin", "number", "平均恢复时长", "平均恢复时长", "min", true),
        result("overdueCount", "number", "超时工单", "超 SLA 工单数", "count", true)
      ),
      object().put("team", "noc").put("statDate", "2026-03-07")
    );
  }

  public BuiltInDataEndpointDefinition opsChangeCalendar() {
    return new BuiltInDataEndpointDefinition(
      "ops_change_calendar",
      "变更日历",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/change-calendar",
      "返回月度变更日历",
      array(
        param("month", "string", false, "2026-03", "月份"),
        param("region", "string", false, "all", "区域编码")
      ),
      array(
        result("date", "date", "日期", "变更日期", null, false),
        result("changeCount", "number", "变更数", "当日变更数", "count", true),
        result("rollbackCount", "number", "回退数", "当日回退数", "count", true)
      ),
      object().put("month", "2026-03").put("region", "north")
    );
  }

  public BuiltInDataEndpointDefinition opsServiceHealth() {
    return new BuiltInDataEndpointDefinition(
      "ops_service_health",
      "服务健康度",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/service-health",
      "返回服务可用性和时延指标",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("serviceGroup", "string", false, "core", "服务分组")
      ),
      array(
        result("service", "string", "服务", "服务名称", null, false),
        result("availabilityPct", "number", "可用率", "服务可用率", "%", true),
        result("latencyMs", "number", "时延", "平均时延", "ms", true),
        result("errorRatePct", "number", "错误率", "错误率", "%", true)
      ),
      object().put("region", "all").put("serviceGroup", "core")
    );
  }

  public BuiltInDataEndpointDefinition opsServiceDependencyFlow() {
    return new BuiltInDataEndpointDefinition(
      "ops_service_dependency_flow",
      "服务依赖流向",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/service-dependency-flow",
      "返回服务间依赖流量，适合 Sankey",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("serviceGroup", "string", false, "core", "服务分组")
      ),
      array(
        result("source", "string", "来源服务", "依赖来源服务", null, false),
        result("target", "string", "目标服务", "依赖目标服务", null, false),
        result("trafficPct", "number", "流量占比", "依赖流量占比", "%", true),
        result("callCount", "number", "调用量", "依赖调用量", "count", true)
      ),
      object().put("region", "all").put("serviceGroup", "core")
    );
  }

  public BuiltInDataEndpointDefinition opsAlarmDomainMix() {
    return new BuiltInDataEndpointDefinition(
      "ops_alarm_domain_mix",
      "业务域告警分布",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/alarm-domain-mix",
      "返回业务域和等级维度的告警分布",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("from", "date", false, "2026-03-01", "开始日期"),
        param("to", "date", false, "2026-03-07", "结束日期")
      ),
      array(
        result("domain", "string", "业务域", "业务域名称", null, false),
        result("severity", "string", "等级", "告警等级", null, false),
        result("count", "number", "告警数", "告警数量", "count", true)
      ),
      object().put("region", "all").put("from", "2026-03-01").put("to", "2026-03-07")
    );
  }

  public BuiltInDataEndpointDefinition opsRegionHealth() {
    return new BuiltInDataEndpointDefinition(
      "ops_region_health",
      "区域健康概览",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/region-health",
      "返回区域级健康、时延和未闭环事件",
      array(
        param("statDate", "date", false, "2026-03-07", "统计日期"),
        param("regionScope", "string", false, "all", "区域范围")
      ),
      array(
        result("region", "string", "区域", "区域编码", null, false),
        result("availabilityPct", "number", "可用率", "服务可用率", "%", true),
        result("latencyMs", "number", "时延", "平均时延", "ms", true),
        result("errorRatePct", "number", "错误率", "错误率", "%", true),
        result("openIncidentCount", "number", "未闭环事件", "当前未闭环事件数", "count", true),
        result("status", "string", "状态", "健康状态", null, false)
      ),
      object().put("statDate", "2026-03-07").put("regionScope", "all")
    );
  }

  public BuiltInDataEndpointDefinition opsShiftLoad() {
    return new BuiltInDataEndpointDefinition(
      "ops_shift_load",
      "班组工单负载",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/shift-load",
      "返回班组按小时的工单负载",
      array(
        param("shiftDate", "date", false, "2026-03-07", "排班日期"),
        param("team", "string", false, "noc", "运维班组"),
        param("granularity", "string", false, "hour", "时间粒度", "hour", "half_day")
      ),
      array(
        result("slot", "string", "时间片", "小时或班次", null, false),
        result("onDutyTickets", "number", "在岗工单", "在岗待处理工单", "count", true),
        result("closedTickets", "number", "闭环工单", "已闭环工单", "count", true),
        result("escalatedCount", "number", "升级工单", "升级工单数量", "count", true)
      ),
      object().put("shiftDate", "2026-03-07").put("team", "noc").put("granularity", "hour")
    );
  }

  public BuiltInDataEndpointDefinition opsLinkQualityDetail() {
    return new BuiltInDataEndpointDefinition(
      "ops_link_quality_detail",
      "链路质量详情",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/link-quality-detail",
      "返回链路质量明细",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("topN", "number", false, 8, "返回数量")
      ),
      array(
        result("linkName", "string", "链路名称", "链路名称", null, false),
        result("latencyMs", "number", "时延", "平均时延", "ms", true),
        result("jitterMs", "number", "抖动", "时延抖动", "ms", true),
        result("lossPct", "number", "丢包率", "丢包率", "%", true),
        result("availabilityPct", "number", "可用率", "链路可用率", "%", true)
      ),
      object().put("region", "all").put("topN", 8)
    );
  }

  public BuiltInDataEndpointDefinition opsResourceUsage() {
    return new BuiltInDataEndpointDefinition(
      "ops_resource_usage",
      "资源压力",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/resource-usage",
      "返回资源使用率明细",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("resourceType", "string", false, "cluster", "资源类型", "cluster", "server", "device")
      ),
      array(
        result("resourceName", "string", "资源名称", "资源名称", null, false),
        result("region", "string", "区域", "区域编码", null, false),
        result("cpuPct", "number", "CPU使用率", "CPU 使用率", "%", true),
        result("memPct", "number", "内存使用率", "内存使用率", "%", true),
        result("diskPct", "number", "磁盘使用率", "磁盘使用率", "%", true)
      ),
      object().put("region", "all").put("resourceType", "cluster")
    );
  }

  public BuiltInDataEndpointDefinition opsKpiOverview() {
    return new BuiltInDataEndpointDefinition(
      "ops_kpi_overview",
      "KPI 概览",
      "ops",
      EndpointHttpMethod.GET,
      "/mock/ops/kpi-overview",
      "返回适合工作台和汇报页的 KPI 概览",
      array(
        param("region", "string", false, "all", "区域编码"),
        param("bizDate", "date", false, "2026-03-07", "业务日期")
      ),
      array(
        result("kpi", "string", "指标编码", "指标编码", null, false),
        result("label", "string", "指标", "指标名称", null, false),
        result("value", "number", "当前值", "当前值", null, true),
        result("deltaPct", "number", "变化率", "日环比变化率", "%", true),
        result("status", "string", "状态", "指标状态", null, false)
      ),
      object().put("region", "all").put("bizDate", "2026-03-07")
    );
  }

  private ArrayNode array(JsonNode... items) {
    ArrayNode array = objectMapper.createArrayNode();
    for (JsonNode item : items) {
      array.add(item);
    }
    return array;
  }

  private ObjectNode object() {
    return objectMapper.createObjectNode();
  }

  private ObjectNode param(
    String name,
    String type,
    boolean required,
    Object defaultValue,
    String description,
    String... enumValues
  ) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("name", name);
    node.put("type", type);
    node.put("label", paramLabel(name, description));
    node.put("required", required);
    node.set("defaultValue", objectMapper.valueToTree(defaultValue));
    node.put("description", description);
    ArrayNode values = objectMapper.createArrayNode();
    for (String value : enumValues) {
      values.add(value);
    }
    node.set("enumValues", values);
    return node;
  }

  private String paramLabel(String name, String description) {
    return switch (name) {
      case "region", "regionScope" -> "区域";
      case "from" -> "开始日期";
      case "to" -> "结束日期";
      case "granularity" -> "时间粒度";
      case "severity" -> "等级";
      case "status" -> "状态";
      case "pageNo" -> "页码";
      case "pageSize" -> "分页大小";
      case "metric" -> "排序指标";
      case "topN" -> "返回数量";
      case "team" -> "班组";
      case "statDate" -> "统计日期";
      case "month" -> "月份";
      case "serviceGroup" -> "服务分组";
      case "shiftDate" -> "排班日期";
      case "resourceType" -> "资源类型";
      case "bizDate" -> "业务日期";
      default -> description == null || description.isBlank() ? name : description;
    };
  }

  private ObjectNode result(
    String name,
    String type,
    String label,
    String description,
    String unit,
    boolean aggAble
  ) {
    ObjectNode node = objectMapper.createObjectNode();
    node.put("name", name);
    node.put("type", type);
    node.put("label", label);
    node.put("description", description);
    if (unit == null) {
      node.putNull("unit");
    } else {
      node.put("unit", unit);
    }
    node.put("aggAble", aggAble);
    return node;
  }
}
