package com.chatbi.app.application.dataendpoint;

import com.chatbi.app.common.error.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

@Component
public class MockOpsDataService {

  private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;
  private static final String[] REGIONS = {"north", "south", "east", "west"};
  private static final String[] OWNERS = {"张磊", "李明", "王婧", "周岩", "陈昊"};
  private static final String[] SERVICES = {"接入网", "骨干网", "DNS", "云专线", "鉴权", "工单流转"};

  private final ObjectMapper objectMapper;

  public MockOpsDataService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public JsonNode execute(String endpointId, Map<String, Object> params) {
    return switch (endpointId) {
      case "ops_alarm_trend" -> buildAlarmTrend(params);
      case "ops_incident_list" -> buildIncidentList(params);
      case "ops_capacity_topn" -> buildCapacityTopN(params);
      case "ops_ticket_summary" -> buildTicketSummary(params);
      case "ops_change_calendar" -> buildChangeCalendar(params);
      case "ops_service_health" -> buildServiceHealth(params);
      case "ops_service_dependency_flow" -> buildServiceDependencyFlow(params);
      case "ops_alarm_domain_mix" -> buildAlarmDomainMix(params);
      case "ops_region_health" -> buildRegionHealth(params);
      case "ops_shift_load" -> buildShiftLoad(params);
      case "ops_link_quality_detail" -> buildLinkQualityDetail(params);
      case "ops_resource_usage" -> buildResourceUsage(params);
      case "ops_kpi_overview" -> buildKpiOverview(params);
      default -> throw new BadRequestException("未注册的 mock 数据接口: " + endpointId);
    };
  }

  private JsonNode buildAlarmTrend(Map<String, Object> params) {
    LocalDate from = parseDate(params.get("from"), LocalDate.now().minusDays(6));
    LocalDate to = parseDate(params.get("to"), from.plusDays(6));
    if (to.isBefore(from)) {
      to = from;
    }
    if (ChronoUnit.DAYS.between(from, to) > 30) {
      to = from.plusDays(30);
    }
    String region = stringParam(params, "region", "all");
    ArrayNode rows = objectMapper.createArrayNode();
    for (LocalDate cursor = from; !cursor.isAfter(to); cursor = cursor.plusDays(1)) {
      int seed = seed("ops_alarm_trend", region, cursor.toString());
      ObjectNode row = objectMapper.createObjectNode();
      row.put("ts", cursor.format(DATE_FORMAT));
      row.put("critical", 1 + seed % 5);
      row.put("major", 4 + seed % 7);
      row.put("minor", 8 + seed % 11);
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildIncidentList(Map<String, Object> params) {
    String region = stringParam(params, "region", "all");
    String severity = stringParam(params, "severity", "all");
    String status = stringParam(params, "status", "open");
    LocalDate from = parseDate(params.get("from"), LocalDate.now().minusDays(6));
    int pageNo = intParam(params, "pageNo", 1);
    int pageSize = Math.max(1, Math.min(50, intParam(params, "pageSize", 10)));
    ArrayNode rows = objectMapper.createArrayNode();
    int start = Math.max(0, (pageNo - 1) * pageSize);
    for (int index = start; index < start + pageSize; index++) {
      String resolvedSeverity = "all".equalsIgnoreCase(severity) ? switch (index % 3) {
        case 0 -> "critical";
        case 1 -> "major";
        default -> "minor";
      } : severity.toLowerCase(Locale.ROOT);
      String resolvedStatus = "all".equalsIgnoreCase(status) ? (index % 2 == 0 ? "open" : "closed") : status.toLowerCase(Locale.ROOT);
      String resolvedRegion = "all".equalsIgnoreCase(region) ? REGIONS[index % REGIONS.length] : region.toLowerCase(Locale.ROOT);
      LocalDate openedAt = from.plusDays(index % 7);
      ObjectNode row = objectMapper.createObjectNode();
      row.put("incidentId", "INC-" + openedAt.format(DateTimeFormatter.BASIC_ISO_DATE) + "-" + String.format(Locale.ROOT, "%03d", index + 1));
      row.put("title", "%s 区域链路抖动告警".formatted(resolvedRegion.toUpperCase(Locale.ROOT)));
      row.put("region", resolvedRegion);
      row.put("severity", resolvedSeverity);
      row.put("status", resolvedStatus);
      row.put("openedAt", openedAt.atTime(8 + index % 10, (index * 7) % 60).toString());
      row.put("owner", OWNERS[index % OWNERS.length]);
      row.put("durationMin", 20 + (index * 17) % 240);
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildCapacityTopN(Map<String, Object> params) {
    String region = stringParam(params, "region", "all");
    int topN = Math.max(1, Math.min(20, intParam(params, "topN", 8)));
    ArrayNode rows = objectMapper.createArrayNode();
    for (int index = 0; index < topN; index++) {
      String resolvedRegion = "all".equalsIgnoreCase(region) ? REGIONS[index % REGIONS.length] : region.toLowerCase(Locale.ROOT);
      double utilization = round(92.5 - index * 3.1 + (seed("ops_capacity_topn", resolvedRegion, Integer.toString(index)) % 8) * 0.2);
      long capacityBps = 100_000_000_000L;
      long peakBps = Math.round(capacityBps * (utilization / 100.0));
      ObjectNode row = objectMapper.createObjectNode();
      row.put("linkName", "%s-CORE-%02d".formatted(resolvedRegion.toUpperCase(Locale.ROOT), index + 1));
      row.put("region", resolvedRegion);
      row.put("utilizationPct", utilization);
      row.put("peakBps", peakBps);
      row.put("capacityBps", capacityBps);
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildTicketSummary(Map<String, Object> params) {
    String team = stringParam(params, "team", "noc");
    LocalDate statDate = parseDate(params.get("statDate"), LocalDate.now());
    int seed = seed("ops_ticket_summary", team, statDate.toString());
    ArrayNode rows = objectMapper.createArrayNode();
    ObjectNode row = objectMapper.createObjectNode();
    row.put("openCount", 8 + seed % 11);
    row.put("closedCount", 18 + seed % 17);
    row.put("mttrMin", 34 + seed % 20);
    row.put("overdueCount", 1 + seed % 5);
    rows.add(row);
    return rows;
  }

  private JsonNode buildChangeCalendar(Map<String, Object> params) {
    YearMonth month = parseMonth(stringParam(params, "month", LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"))));
    String region = stringParam(params, "region", "all");
    ArrayNode rows = objectMapper.createArrayNode();
    for (int day = 1; day <= month.lengthOfMonth(); day++) {
      LocalDate date = month.atDay(day);
      int seed = seed("ops_change_calendar", region, date.toString());
      ObjectNode row = objectMapper.createObjectNode();
      row.put("date", date.format(DATE_FORMAT));
      row.put("changeCount", seed % 4 == 0 ? 0 : 1 + seed % 6);
      row.put("rollbackCount", seed % 9 == 0 ? 1 : 0);
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildServiceHealth(Map<String, Object> params) {
    String region = stringParam(params, "region", "all");
    String serviceGroup = stringParam(params, "serviceGroup", "core");
    ArrayNode rows = objectMapper.createArrayNode();
    for (int index = 0; index < SERVICES.length; index++) {
      int seed = seed("ops_service_health", region, serviceGroup, Integer.toString(index));
      ObjectNode row = objectMapper.createObjectNode();
      row.put("service", SERVICES[index]);
      row.put("availabilityPct", round(99.15 + (seed % 70) / 100.0));
      row.put("latencyMs", 18 + seed % 40);
      row.put("errorRatePct", round((seed % 25) / 100.0));
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildServiceDependencyFlow(Map<String, Object> params) {
    String region = stringParam(params, "region", "all");
    String[][] links = {
      {"接入网", "骨干网"},
      {"骨干网", "DNS"},
      {"骨干网", "云专线"},
      {"鉴权", "接入网"},
      {"DNS", "鉴权"},
      {"工单流转", "鉴权"}
    };
    ArrayNode rows = objectMapper.createArrayNode();
    for (int index = 0; index < links.length; index++) {
      int seed = seed("ops_service_dependency_flow", region, links[index][0], links[index][1], Integer.toString(index));
      ObjectNode row = objectMapper.createObjectNode();
      row.put("source", links[index][0]);
      row.put("target", links[index][1]);
      row.put("trafficPct", round(18 + (seed % 60)));
      row.put("callCount", 200 + seed % 900);
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildAlarmDomainMix(Map<String, Object> params) {
    String region = stringParam(params, "region", "all");
    String[] domains = {"核心网", "接入网", "云专线", "鉴权", "DNS"};
    String[] severities = {"critical", "major", "minor"};
    ArrayNode rows = objectMapper.createArrayNode();
    for (int domainIndex = 0; domainIndex < domains.length; domainIndex++) {
      for (int severityIndex = 0; severityIndex < severities.length; severityIndex++) {
        int seed = seed("ops_alarm_domain_mix", region, domains[domainIndex], severities[severityIndex]);
        ObjectNode row = objectMapper.createObjectNode();
        row.put("domain", domains[domainIndex]);
        row.put("severity", severities[severityIndex]);
        row.put("count", 4 + seed % 23);
        rows.add(row);
      }
    }
    return rows;
  }

  private JsonNode buildRegionHealth(Map<String, Object> params) {
    String regionScope = stringParam(params, "regionScope", "all");
    ArrayNode rows = objectMapper.createArrayNode();
    for (int index = 0; index < REGIONS.length; index++) {
      String region = REGIONS[index];
      if (!"all".equalsIgnoreCase(regionScope) && !region.equalsIgnoreCase(regionScope)) {
        continue;
      }
      int seed = seed("ops_region_health", region, stringParam(params, "statDate", LocalDate.now().toString()));
      double availability = round(99.2 + (seed % 60) / 100.0);
      double errorRate = round((seed % 25) / 100.0);
      int openIncidents = 2 + seed % 8;
      ObjectNode row = objectMapper.createObjectNode();
      row.put("region", region);
      row.put("availabilityPct", availability);
      row.put("latencyMs", 18 + seed % 24);
      row.put("errorRatePct", errorRate);
      row.put("openIncidentCount", openIncidents);
      row.put("status", availability >= 99.6 && openIncidents <= 3 ? "healthy" : availability >= 99.3 ? "watch" : "risk");
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildShiftLoad(Map<String, Object> params) {
    String team = stringParam(params, "team", "noc");
    String granularity = stringParam(params, "granularity", "hour");
    String[] slots = "half_day".equalsIgnoreCase(granularity)
      ? new String[] {"00:00-12:00", "12:00-24:00"}
      : new String[] {"08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"};
    ArrayNode rows = objectMapper.createArrayNode();
    for (int index = 0; index < slots.length; index++) {
      int seed = seed("ops_shift_load", team, slots[index]);
      ObjectNode row = objectMapper.createObjectNode();
      row.put("slot", slots[index]);
      row.put("onDutyTickets", 6 + seed % 14);
      row.put("closedTickets", 3 + seed % 11);
      row.put("escalatedCount", seed % 4);
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildLinkQualityDetail(Map<String, Object> params) {
    String region = stringParam(params, "region", "all");
    int topN = Math.max(1, Math.min(20, intParam(params, "topN", 8)));
    ArrayNode rows = objectMapper.createArrayNode();
    for (int index = 0; index < topN; index++) {
      String resolvedRegion = "all".equalsIgnoreCase(region) ? REGIONS[index % REGIONS.length] : region.toLowerCase(Locale.ROOT);
      int seed = seed("ops_link_quality_detail", resolvedRegion, Integer.toString(index));
      ObjectNode row = objectMapper.createObjectNode();
      row.put("linkName", "%s-LINK-%02d".formatted(resolvedRegion.toUpperCase(Locale.ROOT), index + 1));
      row.put("latencyMs", 15 + seed % 45);
      row.put("jitterMs", 2 + seed % 12);
      row.put("lossPct", round(0.10 + (seed % 28) / 100.0));
      row.put("availabilityPct", round(99.10 + (seed % 70) / 100.0));
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildResourceUsage(Map<String, Object> params) {
    String region = stringParam(params, "region", "all");
    String resourceType = stringParam(params, "resourceType", "cluster");
    ArrayNode rows = objectMapper.createArrayNode();
    for (int index = 0; index < 6; index++) {
      String resolvedRegion = "all".equalsIgnoreCase(region) ? REGIONS[index % REGIONS.length] : region.toLowerCase(Locale.ROOT);
      int seed = seed("ops_resource_usage", resourceType, resolvedRegion, Integer.toString(index));
      ObjectNode row = objectMapper.createObjectNode();
      row.put("resourceName", "%s-%s-%02d".formatted(resourceType.toUpperCase(Locale.ROOT), resolvedRegion.toUpperCase(Locale.ROOT), index + 1));
      row.put("region", resolvedRegion);
      row.put("cpuPct", round(48 + seed % 45));
      row.put("memPct", round(42 + seed % 42));
      row.put("diskPct", round(31 + seed % 50));
      rows.add(row);
    }
    return rows;
  }

  private JsonNode buildKpiOverview(Map<String, Object> params) {
    String region = stringParam(params, "region", "all");
    String[][] items = {
      {"availability", "可用率"},
      {"latency", "时延"},
      {"open_incidents", "未闭环事件"},
      {"cpu_peak", "CPU峰值"}
    };
    ArrayNode rows = objectMapper.createArrayNode();
    for (int index = 0; index < items.length; index++) {
      int seed = seed("ops_kpi_overview", region, items[index][0]);
      ObjectNode row = objectMapper.createObjectNode();
      row.put("kpi", items[index][0]);
      row.put("label", items[index][1]);
      row.put("value", switch (items[index][0]) {
        case "availability" -> round(99.1 + (seed % 70) / 100.0);
        case "latency" -> 18 + seed % 26;
        case "open_incidents" -> 4 + seed % 9;
        default -> round(62 + seed % 28);
      });
      row.put("deltaPct", round(-3.5 + (seed % 70) / 10.0));
      row.put("status", seed % 5 == 0 ? "risk" : seed % 3 == 0 ? "watch" : "stable");
      rows.add(row);
    }
    return rows;
  }

  private int seed(String... values) {
    return Math.abs(Objects.hash((Object[]) values));
  }

  private String stringParam(Map<String, Object> params, String key, String fallback) {
    Object raw = params.get(key);
    if (raw == null) {
      return fallback;
    }
    String value = raw.toString().trim();
    return value.isBlank() ? fallback : value;
  }

  private int intParam(Map<String, Object> params, String key, int fallback) {
    Object raw = params.get(key);
    if (raw == null) {
      return fallback;
    }
    if (raw instanceof Number number) {
      return number.intValue();
    }
    try {
      return Integer.parseInt(raw.toString().trim());
    } catch (NumberFormatException ex) {
      return fallback;
    }
  }

  private LocalDate parseDate(Object raw, LocalDate fallback) {
    if (raw == null) {
      return fallback;
    }
    try {
      return LocalDate.parse(raw.toString().trim(), DATE_FORMAT);
    } catch (Exception ex) {
      return fallback;
    }
  }

  private YearMonth parseMonth(String raw) {
    try {
      return YearMonth.parse(raw);
    } catch (Exception ex) {
      throw new BadRequestException("month 参数格式错误，应为 yyyy-MM");
    }
  }

  private double round(double value) {
    return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
  }
}
