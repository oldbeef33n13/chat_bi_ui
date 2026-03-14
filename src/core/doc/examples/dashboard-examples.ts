import { prefixedId } from "../../utils/id";
import { createDashboardDoc } from "../defaults";
import type { BuiltInDocExample } from "./shared";
import { makeGridChart } from "./shared";
export const dashboardExamples: BuiltInDocExample[] = [
  {
    id: "dashboard.noc",
    docType: "dashboard",
    name: "网络运维总览",
    description: "告警趋势 + 丢包趋势，适合功能联调与交互回归。",
    build: () => createDashboardDoc()
  },
  {
    id: "dashboard.capacity",
    docType: "dashboard",
    name: "容量与性能看板",
    description: "流量、时延、丢包与区域分布组合看板。",
    build: () => ({
      docId: prefixedId("dash"),
      docType: "dashboard",
      schemaVersion: "1.0.0",
      title: "容量与性能看板",
      locale: "zh-CN",
      themeId: "theme.tech.light",
      dataSources: [
        {
          id: "ds_capacity",
          type: "static",
          staticData: [
            { day: "Mon", region: "East", in_bps: 61, latency_ms: 22, loss_pct: 0.22 },
            { day: "Tue", region: "East", in_bps: 67, latency_ms: 24, loss_pct: 0.30 },
            { day: "Wed", region: "East", in_bps: 73, latency_ms: 27, loss_pct: 0.35 },
            { day: "Thu", region: "East", in_bps: 80, latency_ms: 30, loss_pct: 0.41 },
            { day: "Fri", region: "East", in_bps: 75, latency_ms: 28, loss_pct: 0.36 },
            { day: "Sat", region: "East", in_bps: 69, latency_ms: 25, loss_pct: 0.29 },
            { day: "Sun", region: "East", in_bps: 64, latency_ms: 23, loss_pct: 0.24 },
            { day: "Mon", region: "North", in_bps: 48, latency_ms: 20, loss_pct: 0.18 },
            { day: "Tue", region: "North", in_bps: 52, latency_ms: 23, loss_pct: 0.26 },
            { day: "Wed", region: "North", in_bps: 57, latency_ms: 24, loss_pct: 0.28 },
            { day: "Thu", region: "North", in_bps: 55, latency_ms: 25, loss_pct: 0.31 },
            { day: "Fri", region: "North", in_bps: 59, latency_ms: 26, loss_pct: 0.33 },
            { day: "Sat", region: "North", in_bps: 54, latency_ms: 24, loss_pct: 0.27 },
            { day: "Sun", region: "North", in_bps: 50, latency_ms: 22, loss_pct: 0.23 },
            { day: "Mon", region: "South", in_bps: 42, latency_ms: 18, loss_pct: 0.15 },
            { day: "Tue", region: "South", in_bps: 46, latency_ms: 19, loss_pct: 0.19 },
            { day: "Wed", region: "South", in_bps: 53, latency_ms: 20, loss_pct: 0.21 },
            { day: "Thu", region: "South", in_bps: 58, latency_ms: 22, loss_pct: 0.23 },
            { day: "Fri", region: "South", in_bps: 56, latency_ms: 21, loss_pct: 0.20 },
            { day: "Sat", region: "South", in_bps: 51, latency_ms: 20, loss_pct: 0.18 },
            { day: "Sun", region: "South", in_bps: 47, latency_ms: 19, loss_pct: 0.16 },
            { day: "Mon", region: "West", in_bps: 55, latency_ms: 21, loss_pct: 0.19 },
            { day: "Tue", region: "West", in_bps: 58, latency_ms: 22, loss_pct: 0.22 },
            { day: "Wed", region: "West", in_bps: 62, latency_ms: 24, loss_pct: 0.25 },
            { day: "Thu", region: "West", in_bps: 66, latency_ms: 26, loss_pct: 0.29 },
            { day: "Fri", region: "West", in_bps: 64, latency_ms: 25, loss_pct: 0.27 },
            { day: "Sat", region: "West", in_bps: 60, latency_ms: 23, loss_pct: 0.23 },
            { day: "Sun", region: "West", in_bps: 57, latency_ms: 22, loss_pct: 0.21 }
          ]
        }
      ],
      queries: [{ queryId: "q_capacity", sourceId: "ds_capacity", kind: "static" }],
      filters: [
        {
          filterId: "f_region",
          type: "select",
          title: "区域",
          bindField: "region",
          scope: "global",
          defaultValue: ""
        }
      ],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "grid" },
        props: {
          dashTitle: "容量与性能看板",
          displayMode: "fit_screen",
          designWidthPx: 1920,
          designHeightPx: 1080,
          pageWidthPx: 1280,
          pageMarginPx: 28,
          gridCols: 12,
          rowH: 56,
          gap: 16,
          showFilterBar: true,
          headerShow: true,
          headerText: "容量与性能看板",
          footerShow: false,
          footerText: "Visual Document OS"
        },
        children: [
          makeGridChart(
            "区域流量趋势",
            0,
            0,
            8,
            6,
            {
              chartType: "line",
              bindings: [
                { role: "x", field: "day" },
                { role: "y", field: "in_bps", agg: "sum", unit: "bps" },
                { role: "series", field: "region" }
              ],
              legendShow: true
            },
            { sourceId: "ds_capacity", queryId: "q_capacity" }
          ),
          makeGridChart(
            "区域时延",
            8,
            0,
            4,
            6,
            {
              chartType: "bar",
              bindings: [{ role: "x", field: "region" }, { role: "y", field: "latency_ms", agg: "avg", unit: "ms" }]
            },
            { sourceId: "ds_capacity", queryId: "q_capacity" }
          ),
          makeGridChart(
            "丢包率走势",
            0,
            6,
            6,
            6,
            {
              chartType: "line",
              bindings: [{ role: "x", field: "day" }, { role: "y", field: "loss_pct", agg: "avg", unit: "pct" }],
              area: true
            },
            { sourceId: "ds_capacity", queryId: "q_capacity" }
          ),
          makeGridChart(
            "区域流量占比",
            6,
            6,
            6,
            6,
            {
              chartType: "pie",
              bindings: [{ role: "category", field: "region" }, { role: "value", field: "in_bps", agg: "sum" }]
            },
            { sourceId: "ds_capacity", queryId: "q_capacity" }
          )
        ]
      }
    })
  },
  {
    id: "dashboard.security",
    docType: "dashboard",
    name: "安全告警态势",
    description: "严重级别分布 + 处置趋势 + 业务域热点。",
    build: () => ({
      docId: prefixedId("dash"),
      docType: "dashboard",
      schemaVersion: "1.0.0",
      title: "安全告警态势",
      locale: "zh-CN",
      themeId: "theme.tech.dark",
      dataSources: [
        {
          id: "ds_security",
          type: "static",
          staticData: [
            { day: "Mon", severity: "critical", domain: "core", count: 9 },
            { day: "Tue", severity: "critical", domain: "core", count: 7 },
            { day: "Wed", severity: "critical", domain: "edge", count: 6 },
            { day: "Thu", severity: "high", domain: "edge", count: 14 },
            { day: "Fri", severity: "high", domain: "access", count: 18 },
            { day: "Mon", severity: "medium", domain: "access", count: 21 },
            { day: "Tue", severity: "medium", domain: "core", count: 19 },
            { day: "Wed", severity: "low", domain: "access", count: 28 },
            { day: "Thu", severity: "low", domain: "edge", count: 24 },
            { day: "Fri", severity: "medium", domain: "edge", count: 17 }
          ]
        }
      ],
      queries: [{ queryId: "q_security", sourceId: "ds_security", kind: "static" }],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "grid" },
        props: {
          dashTitle: "安全告警态势",
          displayMode: "fit_screen",
          designWidthPx: 1920,
          designHeightPx: 1080,
          pageWidthPx: 1280,
          pageMarginPx: 28,
          gridCols: 12,
          rowH: 56,
          gap: 16,
          showFilterBar: false,
          headerShow: true,
          headerText: "安全告警态势",
          footerShow: false,
          footerText: "Visual Document OS"
        },
        children: [
          makeGridChart(
            "严重级别分布",
            0,
            0,
            4,
            6,
            {
              chartType: "pie",
              bindings: [{ role: "category", field: "severity" }, { role: "value", field: "count", agg: "sum" }]
            },
            { sourceId: "ds_security", queryId: "q_security" }
          ),
          makeGridChart(
            "告警趋势",
            4,
            0,
            8,
            6,
            {
              chartType: "line",
              bindings: [
                { role: "x", field: "day" },
                { role: "y", field: "count", agg: "sum", unit: "count" },
                { role: "series", field: "severity" }
              ],
              legendShow: true
            },
            { sourceId: "ds_security", queryId: "q_security" }
          ),
          makeGridChart(
            "业务域热点",
            0,
            6,
            12,
            6,
            {
              chartType: "bar",
              bindings: [{ role: "x", field: "domain" }, { role: "y", field: "count", agg: "sum", unit: "count" }],
              labelShow: true
            },
            { sourceId: "ds_security", queryId: "q_security" }
          )
        ]
      }
    })
  },
  {
    id: "dashboard.command.center",
    docType: "dashboard",
    name: "运维指挥中心（丰富场景）",
    description: "覆盖趋势、占比、散点、树图、日历和工单表格的综合看板。",
    build: () => ({
      docId: prefixedId("dash"),
      docType: "dashboard",
      schemaVersion: "1.0.0",
      title: "运维指挥中心",
      locale: "zh-CN",
      themeId: "theme.tech.dark",
      dataSources: [
        {
          id: "ds_ops_hour",
          type: "static",
          staticData: [
            { hour: "09:00", qps: 1820, err_qps: 62, latency_ms: 21, cpu_pct: 58 },
            { hour: "10:00", qps: 1950, err_qps: 71, latency_ms: 23, cpu_pct: 61 },
            { hour: "11:00", qps: 2080, err_qps: 86, latency_ms: 25, cpu_pct: 66 },
            { hour: "12:00", qps: 2140, err_qps: 91, latency_ms: 27, cpu_pct: 68 },
            { hour: "13:00", qps: 2065, err_qps: 78, latency_ms: 24, cpu_pct: 63 },
            { hour: "14:00", qps: 2210, err_qps: 96, latency_ms: 28, cpu_pct: 70 },
            { hour: "15:00", qps: 2335, err_qps: 104, latency_ms: 30, cpu_pct: 73 },
            { hour: "16:00", qps: 2410, err_qps: 112, latency_ms: 31, cpu_pct: 75 },
            { hour: "17:00", qps: 2290, err_qps: 97, latency_ms: 27, cpu_pct: 69 },
            { hour: "18:00", qps: 2165, err_qps: 84, latency_ms: 25, cpu_pct: 64 },
            { hour: "19:00", qps: 2030, err_qps: 76, latency_ms: 23, cpu_pct: 60 },
            { hour: "20:00", qps: 1940, err_qps: 69, latency_ms: 22, cpu_pct: 57 }
          ]
        },
        {
          id: "ds_region_perf",
          type: "static",
          staticData: [
            { region: "East", qps: 680, latency_ms: 22, packet_loss_pct: 0.21, sla_pct: 99.97 },
            { region: "North", qps: 590, latency_ms: 24, packet_loss_pct: 0.26, sla_pct: 99.95 },
            { region: "South", qps: 530, latency_ms: 20, packet_loss_pct: 0.18, sla_pct: 99.98 },
            { region: "West", qps: 610, latency_ms: 23, packet_loss_pct: 0.24, sla_pct: 99.96 }
          ]
        },
        {
          id: "ds_alarm_mix",
          type: "static",
          staticData: [
            { severity: "P1", count: 9 },
            { severity: "P2", count: 26 },
            { severity: "P3", count: 41 },
            { severity: "P4", count: 58 }
          ]
        },
        {
          id: "ds_calendar",
          type: "static",
          staticData: [
            { date: "2026-03-01", err_qps: 52 },
            { date: "2026-03-02", err_qps: 48 },
            { date: "2026-03-03", err_qps: 63 },
            { date: "2026-03-04", err_qps: 57 },
            { date: "2026-03-05", err_qps: 71 },
            { date: "2026-03-06", err_qps: 66 },
            { date: "2026-03-07", err_qps: 58 },
            { date: "2026-03-08", err_qps: 54 },
            { date: "2026-03-09", err_qps: 61 },
            { date: "2026-03-10", err_qps: 73 },
            { date: "2026-03-11", err_qps: 69 },
            { date: "2026-03-12", err_qps: 62 },
            { date: "2026-03-13", err_qps: 55 },
            { date: "2026-03-14", err_qps: 49 }
          ]
        },
        {
          id: "ds_ticket",
          type: "static",
          staticData: [
            { ticket_id: "INC-41021", region: "East", owner: "张雷", priority: "P1", status: "处理中", eta_min: 18 },
            { ticket_id: "INC-41034", region: "North", owner: "刘宁", priority: "P2", status: "已定位", eta_min: 36 },
            { ticket_id: "INC-41042", region: "West", owner: "陈博", priority: "P2", status: "处理中", eta_min: 28 },
            { ticket_id: "INC-41058", region: "South", owner: "王晨", priority: "P3", status: "观察中", eta_min: 55 },
            { ticket_id: "INC-41063", region: "East", owner: "赵冉", priority: "P1", status: "升级中", eta_min: 14 },
            { ticket_id: "INC-41079", region: "West", owner: "李越", priority: "P2", status: "待验证", eta_min: 32 }
          ]
        }
      ],
      queries: [
        { queryId: "q_ops_hour", sourceId: "ds_ops_hour", kind: "static" },
        { queryId: "q_region_perf", sourceId: "ds_region_perf", kind: "static" },
        { queryId: "q_alarm_mix", sourceId: "ds_alarm_mix", kind: "static" },
        { queryId: "q_calendar", sourceId: "ds_calendar", kind: "static" },
        { queryId: "q_ticket", sourceId: "ds_ticket", kind: "static" }
      ],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "grid" },
        props: {
          dashTitle: "运维指挥中心",
          displayMode: "fit_screen",
          designWidthPx: 1920,
          designHeightPx: 1080,
          pageWidthPx: 1280,
          pageMarginPx: 28,
          gridCols: 12,
          rowH: 56,
          gap: 16,
          showFilterBar: true,
          headerShow: true,
          headerText: "运维指挥中心",
          footerShow: false,
          footerText: "Visual Document OS"
        },
        children: [
          makeGridChart(
            "主链路流量与错误QPS",
            0,
            0,
            8,
            6,
            {
              chartType: "combo",
              bindings: [
                { role: "x", field: "hour" },
                { role: "y", field: "qps", agg: "avg", axis: "primary" },
                { role: "y2", field: "err_qps", agg: "avg", axis: "secondary" }
              ],
              legendShow: true
            },
            { sourceId: "ds_ops_hour", queryId: "q_ops_hour" }
          ),
          makeGridChart(
            "区域平均时延",
            8,
            0,
            4,
            6,
            {
              chartType: "bar",
              bindings: [{ role: "x", field: "region" }, { role: "y", field: "latency_ms", agg: "avg", unit: "ms" }],
              labelShow: true
            },
            { sourceId: "ds_region_perf", queryId: "q_region_perf" }
          ),
          makeGridChart(
            "告警等级占比",
            0,
            6,
            4,
            6,
            {
              chartType: "pie",
              bindings: [{ role: "category", field: "severity" }, { role: "value", field: "count", agg: "sum" }]
            },
            { sourceId: "ds_alarm_mix", queryId: "q_alarm_mix" }
          ),
          makeGridChart(
            "CPU vs 时延散点",
            4,
            6,
            4,
            6,
            {
              chartType: "scatter",
              bindings: [{ role: "x", field: "cpu_pct", agg: "avg" }, { role: "y", field: "latency_ms", agg: "avg" }]
            },
            { sourceId: "ds_ops_hour", queryId: "q_ops_hour" }
          ),
          makeGridChart(
            "全网 SLA 指针",
            8,
            6,
            4,
            3,
            {
              chartType: "gauge",
              bindings: [{ role: "value", field: "sla_pct", agg: "avg" }]
            },
            { sourceId: "ds_region_perf", queryId: "q_region_perf" }
          ),
          makeGridChart(
            "区域流量分层",
            8,
            9,
            4,
            3,
            {
              chartType: "treemap",
              bindings: [{ role: "category", field: "region" }, { role: "value", field: "qps", agg: "sum" }]
            },
            { sourceId: "ds_region_perf", queryId: "q_region_perf" }
          ),
          makeGridChart(
            "日历热力（错误QPS）",
            0,
            12,
            8,
            6,
            {
              chartType: "calendar",
              bindings: [{ role: "x", field: "date" }, { role: "y", field: "err_qps", agg: "avg" }]
            },
            { sourceId: "ds_calendar", queryId: "q_calendar" }
          ),
          {
            id: prefixedId("table"),
            kind: "table",
            name: "当班工单",
            layout: { mode: "grid", gx: 8, gy: 12, gw: 4, gh: 6 },
            data: { sourceId: "ds_ticket", queryId: "q_ticket" },
            props: {
              titleText: "当班工单列表",
              repeatHeader: true,
              zebra: true,
              columns: [
                { key: "ticket_id", title: "工单", width: 116 },
                { key: "region", title: "区域", width: 72 },
                { key: "owner", title: "负责人", width: 80 },
                { key: "priority", title: "等级", width: 56, align: "center" },
                { key: "status", title: "状态", width: 86 },
                { key: "eta_min", title: "ETA(min)", width: 76, align: "right", format: "int" }
              ],
              headerRows: [
                [
                  { text: "工单", rowSpan: 2, colSpan: 1, align: "center" },
                  { text: "归属", rowSpan: 1, colSpan: 2, align: "center" },
                  { text: "处理进度", rowSpan: 1, colSpan: 3, align: "center" }
                ],
                [
                  { text: "区域", rowSpan: 1, colSpan: 1, align: "center" },
                  { text: "负责人", rowSpan: 1, colSpan: 1, align: "center" },
                  { text: "等级", rowSpan: 1, colSpan: 1, align: "center" },
                  { text: "状态", rowSpan: 1, colSpan: 1, align: "center" },
                  { text: "ETA(min)", rowSpan: 1, colSpan: 1, align: "center" }
                ]
              ]
            }
          }
        ]
      }
    })
  }
];


