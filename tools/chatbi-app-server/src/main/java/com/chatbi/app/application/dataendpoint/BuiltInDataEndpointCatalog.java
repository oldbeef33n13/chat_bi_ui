package com.chatbi.app.application.dataendpoint;

import com.chatbi.app.domain.dataendpoint.EndpointHttpMethod;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class BuiltInDataEndpointCatalog {

  private final List<BuiltInDataEndpointDefinition> definitions;

  public BuiltInDataEndpointCatalog(ObjectMapper objectMapper) {
    this.definitions = List.of(
      definition(objectMapper, "ops_alarm_trend", "告警趋势", "/mock/ops/alarm-trend", "按时间维度返回告警趋势"),
      definition(objectMapper, "ops_incident_list", "事件列表", "/mock/ops/incidents", "返回事件详情分页列表"),
      definition(objectMapper, "ops_capacity_topn", "容量压力 TopN", "/mock/ops/capacity-topn", "返回链路容量占用 TopN"),
      definition(objectMapper, "ops_ticket_summary", "工单摘要", "/mock/ops/ticket-summary", "返回工单统计摘要"),
      definition(objectMapper, "ops_change_calendar", "变更日历", "/mock/ops/change-calendar", "返回月度变更日历"),
      definition(objectMapper, "ops_service_health", "服务健康度", "/mock/ops/service-health", "返回服务可用性和时延指标"),
      definition(objectMapper, "ops_service_dependency_flow", "服务依赖流向", "/mock/ops/service-dependency-flow", "返回服务间依赖流量，适合 Sankey"),
      definition(objectMapper, "ops_alarm_domain_mix", "业务域告警分布", "/mock/ops/alarm-domain-mix", "返回业务域和等级维度的告警分布"),
      definition(objectMapper, "ops_region_health", "区域健康概览", "/mock/ops/region-health", "返回区域级健康、时延和未闭环事件"),
      definition(objectMapper, "ops_shift_load", "班组工单负载", "/mock/ops/shift-load", "返回班组按小时的工单负载"),
      definition(objectMapper, "ops_link_quality_detail", "链路质量详情", "/mock/ops/link-quality-detail", "返回链路质量明细"),
      definition(objectMapper, "ops_resource_usage", "资源压力", "/mock/ops/resource-usage", "返回资源使用率明细"),
      definition(objectMapper, "ops_kpi_overview", "KPI 概览", "/mock/ops/kpi-overview", "返回适合工作台和汇报页的 KPI 概览")
    );
  }

  public List<BuiltInDataEndpointDefinition> definitions() {
    return definitions;
  }

  public Optional<BuiltInDataEndpointDefinition> findById(String endpointId) {
    return definitions.stream().filter(item -> item.id().equals(endpointId)).findFirst();
  }

  private BuiltInDataEndpointDefinition definition(
    ObjectMapper objectMapper,
    String id,
    String name,
    String path,
    String description
  ) {
    return switch (id) {
      case "ops_alarm_trend" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "from", "date", false, "2026-03-01", "开始日期"),
          param(objectMapper, "to", "date", false, "2026-03-07", "结束日期"),
          param(objectMapper, "granularity", "string", false, "day", "时间粒度", "day", "hour")
        ),
        array(objectMapper,
          result(objectMapper, "ts", "time", "时间", "采样时间", null, false),
          result(objectMapper, "critical", "number", "严重告警", "critical 告警数量", "count", true),
          result(objectMapper, "major", "number", "重要告警", "major 告警数量", "count", true),
          result(objectMapper, "minor", "number", "次要告警", "minor 告警数量", "count", true)
        ),
        object(objectMapper).put("region", "north").put("from", "2026-03-01").put("to", "2026-03-07").put("granularity", "day")
      );
      case "ops_incident_list" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "severity", "string", false, "all", "告警等级", "all", "critical", "major", "minor"),
          param(objectMapper, "status", "string", false, "open", "处理状态", "all", "open", "closed"),
          param(objectMapper, "from", "date", false, "2026-03-01", "开始日期"),
          param(objectMapper, "to", "date", false, "2026-03-07", "结束日期"),
          param(objectMapper, "pageNo", "number", false, 1, "页码"),
          param(objectMapper, "pageSize", "number", false, 10, "分页大小")
        ),
        array(objectMapper,
          result(objectMapper, "incidentId", "string", "事件 ID", "事件唯一标识", null, false),
          result(objectMapper, "title", "string", "事件标题", "事件说明", null, false),
          result(objectMapper, "region", "string", "区域", "区域编码", null, false),
          result(objectMapper, "severity", "string", "等级", "严重程度", null, false),
          result(objectMapper, "status", "string", "状态", "处理状态", null, false),
          result(objectMapper, "openedAt", "datetime", "发生时间", "首次发现时间", null, false),
          result(objectMapper, "owner", "string", "负责人", "当前处理人", null, false),
          result(objectMapper, "durationMin", "number", "持续时长", "当前持续分钟数", "min", true)
        ),
        object(objectMapper).put("region", "east").put("severity", "major").put("status", "open").put("pageNo", 1).put("pageSize", 10)
      );
      case "ops_capacity_topn" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "metric", "string", false, "bandwidth", "排序指标", "bandwidth", "latency"),
          param(objectMapper, "topN", "number", false, 8, "返回数量")
        ),
        array(objectMapper,
          result(objectMapper, "linkName", "string", "链路名称", "链路名称", null, false),
          result(objectMapper, "region", "string", "区域", "区域编码", null, false),
          result(objectMapper, "utilizationPct", "number", "利用率", "峰值利用率", "%", true),
          result(objectMapper, "peakBps", "number", "峰值带宽", "峰值带宽", "bps", true),
          result(objectMapper, "capacityBps", "number", "总带宽", "链路总带宽", "bps", true)
        ),
        object(objectMapper).put("region", "all").put("metric", "bandwidth").put("topN", 8)
      );
      case "ops_ticket_summary" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "team", "string", false, "noc", "运维班组"),
          param(objectMapper, "statDate", "date", false, "2026-03-07", "统计日期")
        ),
        array(objectMapper,
          result(objectMapper, "openCount", "number", "待处理工单", "当前未闭环工单数", "count", true),
          result(objectMapper, "closedCount", "number", "已关闭工单", "当日已关闭工单数", "count", true),
          result(objectMapper, "mttrMin", "number", "平均恢复时长", "平均恢复时长", "min", true),
          result(objectMapper, "overdueCount", "number", "超时工单", "超 SLA 工单数", "count", true)
        ),
        object(objectMapper).put("team", "noc").put("statDate", "2026-03-07")
      );
      case "ops_change_calendar" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "month", "string", false, "2026-03", "月份"),
          param(objectMapper, "region", "string", false, "all", "区域编码")
        ),
        array(objectMapper,
          result(objectMapper, "date", "date", "日期", "变更日期", null, false),
          result(objectMapper, "changeCount", "number", "变更数", "当日变更数", "count", true),
          result(objectMapper, "rollbackCount", "number", "回退数", "当日回退数", "count", true)
        ),
        object(objectMapper).put("month", "2026-03").put("region", "north")
      );
      case "ops_service_health" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "serviceGroup", "string", false, "core", "服务分组")
        ),
        array(objectMapper,
          result(objectMapper, "service", "string", "服务", "服务名称", null, false),
          result(objectMapper, "availabilityPct", "number", "可用率", "服务可用率", "%", true),
          result(objectMapper, "latencyMs", "number", "时延", "平均时延", "ms", true),
          result(objectMapper, "errorRatePct", "number", "错误率", "错误率", "%", true)
        ),
        object(objectMapper).put("region", "all").put("serviceGroup", "core")
      );
      case "ops_alarm_domain_mix" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "from", "date", false, "2026-03-01", "开始日期"),
          param(objectMapper, "to", "date", false, "2026-03-07", "结束日期")
        ),
        array(objectMapper,
          result(objectMapper, "domain", "string", "业务域", "业务域名称", null, false),
          result(objectMapper, "severity", "string", "等级", "告警等级", null, false),
          result(objectMapper, "count", "number", "告警数", "告警数量", "count", true)
        ),
        object(objectMapper).put("region", "all").put("from", "2026-03-01").put("to", "2026-03-07")
      );
      case "ops_service_dependency_flow" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "serviceGroup", "string", false, "core", "服务分组")
        ),
        array(objectMapper,
          result(objectMapper, "source", "string", "来源服务", "依赖来源服务", null, false),
          result(objectMapper, "target", "string", "目标服务", "依赖目标服务", null, false),
          result(objectMapper, "trafficPct", "number", "流量占比", "依赖流量占比", "%", true),
          result(objectMapper, "callCount", "number", "调用量", "依赖调用量", "count", true)
        ),
        object(objectMapper).put("region", "all").put("serviceGroup", "core")
      );
      case "ops_region_health" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "statDate", "date", false, "2026-03-07", "统计日期"),
          param(objectMapper, "regionScope", "string", false, "all", "区域范围")
        ),
        array(objectMapper,
          result(objectMapper, "region", "string", "区域", "区域编码", null, false),
          result(objectMapper, "availabilityPct", "number", "可用率", "服务可用率", "%", true),
          result(objectMapper, "latencyMs", "number", "时延", "平均时延", "ms", true),
          result(objectMapper, "errorRatePct", "number", "错误率", "错误率", "%", true),
          result(objectMapper, "openIncidentCount", "number", "未闭环事件", "当前未闭环事件数", "count", true),
          result(objectMapper, "status", "string", "状态", "健康状态", null, false)
        ),
        object(objectMapper).put("statDate", "2026-03-07").put("regionScope", "all")
      );
      case "ops_shift_load" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "shiftDate", "date", false, "2026-03-07", "排班日期"),
          param(objectMapper, "team", "string", false, "noc", "运维班组"),
          param(objectMapper, "granularity", "string", false, "hour", "时间粒度", "hour", "half_day")
        ),
        array(objectMapper,
          result(objectMapper, "slot", "string", "时间片", "小时或班次", null, false),
          result(objectMapper, "onDutyTickets", "number", "在岗工单", "在岗待处理工单", "count", true),
          result(objectMapper, "closedTickets", "number", "闭环工单", "已闭环工单", "count", true),
          result(objectMapper, "escalatedCount", "number", "升级工单", "升级工单数量", "count", true)
        ),
        object(objectMapper).put("shiftDate", "2026-03-07").put("team", "noc").put("granularity", "hour")
      );
      case "ops_link_quality_detail" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "topN", "number", false, 8, "返回数量")
        ),
        array(objectMapper,
          result(objectMapper, "linkName", "string", "链路名称", "链路名称", null, false),
          result(objectMapper, "latencyMs", "number", "时延", "平均时延", "ms", true),
          result(objectMapper, "jitterMs", "number", "抖动", "时延抖动", "ms", true),
          result(objectMapper, "lossPct", "number", "丢包率", "丢包率", "%", true),
          result(objectMapper, "availabilityPct", "number", "可用率", "链路可用率", "%", true)
        ),
        object(objectMapper).put("region", "all").put("topN", 8)
      );
      case "ops_resource_usage" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "resourceType", "string", false, "cluster", "资源类型", "cluster", "server", "device")
        ),
        array(objectMapper,
          result(objectMapper, "resourceName", "string", "资源名称", "资源名称", null, false),
          result(objectMapper, "region", "string", "区域", "区域编码", null, false),
          result(objectMapper, "cpuPct", "number", "CPU使用率", "CPU 使用率", "%", true),
          result(objectMapper, "memPct", "number", "内存使用率", "内存使用率", "%", true),
          result(objectMapper, "diskPct", "number", "磁盘使用率", "磁盘使用率", "%", true)
        ),
        object(objectMapper).put("region", "all").put("resourceType", "cluster")
      );
      case "ops_kpi_overview" -> new BuiltInDataEndpointDefinition(
        id,
        name,
        "ops",
        EndpointHttpMethod.GET,
        path,
        description,
        array(objectMapper,
          param(objectMapper, "region", "string", false, "all", "区域编码"),
          param(objectMapper, "bizDate", "date", false, "2026-03-07", "业务日期")
        ),
        array(objectMapper,
          result(objectMapper, "kpi", "string", "指标编码", "指标编码", null, false),
          result(objectMapper, "label", "string", "指标", "指标名称", null, false),
          result(objectMapper, "value", "number", "当前值", "当前值", null, true),
          result(objectMapper, "deltaPct", "number", "变化率", "日环比变化率", "%", true),
          result(objectMapper, "status", "string", "状态", "指标状态", null, false)
        ),
        object(objectMapper).put("region", "all").put("bizDate", "2026-03-07")
      );
      default -> throw new IllegalArgumentException("Unknown built-in endpoint: " + id);
    };
  }

  private static ArrayNode array(ObjectMapper objectMapper, JsonNode... items) {
    ArrayNode array = objectMapper.createArrayNode();
    for (JsonNode item : items) {
      array.add(item);
    }
    return array;
  }

  private static ObjectNode object(ObjectMapper objectMapper) {
    return objectMapper.createObjectNode();
  }

  private static ObjectNode param(
    ObjectMapper objectMapper,
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

  private static String paramLabel(String name, String description) {
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

  private static ObjectNode result(
    ObjectMapper objectMapper,
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
