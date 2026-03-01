import { prefixedId } from "../utils/id";
import { createDashboardDoc, createPptDoc, createReportDoc, defaultChartSpec } from "./defaults";
import type { ChartSpec, DocType, VDoc, VNode } from "./types";

export interface BuiltInDocExample {
  id: string;
  docType: Extract<DocType, "dashboard" | "report" | "ppt">;
  name: string;
  description: string;
  build: () => VDoc;
}

const makeGridChart = (
  title: string,
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  spec: Partial<ChartSpec>,
  data: { sourceId: string; queryId?: string; filterRefs?: string[] }
): VNode<ChartSpec> => ({
  id: prefixedId("chart"),
  kind: "chart",
  name: title,
  layout: { mode: "grid", gx, gy, gw, gh },
  data,
  props: { ...defaultChartSpec(title), ...spec }
});

const makeTextNode = (text: string): VNode => ({
  id: prefixedId("text"),
  kind: "text",
  props: { text, format: "plain" }
});

const makeSection = (title: string, children: VNode[]): VNode => ({
  id: prefixedId("section"),
  kind: "section",
  props: { title },
  children
});

const makeSlide = (title: string, children: VNode[]): VNode => ({
  id: prefixedId("slide"),
  kind: "slide",
  props: { title, layoutTemplateId: "title-double-summary" },
  layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
  children
});

const dashboardExamples: BuiltInDocExample[] = [
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
            { day: "Mon", region: "North", in_bps: 48, latency_ms: 20, loss_pct: 0.18 },
            { day: "Tue", region: "North", in_bps: 52, latency_ms: 23, loss_pct: 0.26 },
            { day: "Wed", region: "North", in_bps: 57, latency_ms: 24, loss_pct: 0.28 },
            { day: "Thu", region: "North", in_bps: 55, latency_ms: 25, loss_pct: 0.31 },
            { day: "Fri", region: "North", in_bps: 59, latency_ms: 26, loss_pct: 0.33 },
            { day: "Mon", region: "South", in_bps: 42, latency_ms: 18, loss_pct: 0.15 },
            { day: "Tue", region: "South", in_bps: 46, latency_ms: 19, loss_pct: 0.19 },
            { day: "Wed", region: "South", in_bps: 53, latency_ms: 20, loss_pct: 0.21 },
            { day: "Thu", region: "South", in_bps: 58, latency_ms: 22, loss_pct: 0.23 },
            { day: "Fri", region: "South", in_bps: 56, latency_ms: 21, loss_pct: 0.20 }
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
          defaultValue: "East"
        }
      ],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "grid" },
        props: {
          dashTitle: "容量与性能看板",
          gridCols: 12,
          rowH: 40,
          gap: 12,
          showFilterBar: true
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
        props: { dashTitle: "安全告警态势", gridCols: 12, rowH: 40, gap: 12, showFilterBar: false },
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
  }
];

const reportExamples: BuiltInDocExample[] = [
  {
    id: "report.weekly.ops",
    docType: "report",
    name: "网络周报（标准）",
    description: "总览、异常处置与下周计划，包含图表与结论段落。",
    build: () => {
      const doc = createReportDoc();
      doc.docId = prefixedId("report");
      doc.title = "网络周报（标准）";
      doc.root.props = {
        ...(doc.root.props ?? {}),
        reportTitle: "网络周报（标准）",
        tocShow: true,
        coverEnabled: true,
        coverTitle: "网络周报（标准）",
        coverSubtitle: "Network Weekly Operations Report",
        coverNote: "适用于周会复盘",
        summaryEnabled: true,
        summaryTitle: "本周执行摘要",
        summaryText: "告警总量下降，异常处置效率提升，需持续跟踪南区拥塞窗口。",
        headerShow: true,
        headerText: "网络周报 · 标准样例",
        footerShow: true,
        footerText: "Visual Document OS",
        showPageNumber: true,
        pageSize: "A4"
      };
      doc.dataSources = [
        {
          id: "ds_alarm",
          type: "static",
          staticData: [
            { day: "Mon", alarm_count: 34, packet_loss: 0.23, region: "East" },
            { day: "Tue", alarm_count: 23, packet_loss: 0.18, region: "East" },
            { day: "Wed", alarm_count: 27, packet_loss: 0.22, region: "West" },
            { day: "Thu", alarm_count: 18, packet_loss: 0.15, region: "North" },
            { day: "Fri", alarm_count: 30, packet_loss: 0.29, region: "South" }
          ]
        }
      ];
      doc.queries = [{ queryId: "q_alarm_trend", sourceId: "ds_alarm", kind: "static" }];
      doc.root.children = [
        makeSection("1. 本周总览", [
          makeTextNode("本周核心指标整体改善，告警总量下降，骨干链路稳定性提升。"),
          {
            id: prefixedId("chart"),
            kind: "chart",
            data: { sourceId: "ds_alarm", queryId: "q_alarm_trend" },
            props: {
              ...defaultChartSpec("告警趋势"),
              bindings: [{ role: "x", field: "day" }, { role: "y", field: "alarm_count", agg: "sum", unit: "count" }]
            }
          }
        ]),
        makeSection("2. 异常处置", [
          makeTextNode("周三西区出现抖动峰值，已完成链路扩容并验证。"),
          {
            id: prefixedId("chart"),
            kind: "chart",
            data: { sourceId: "ds_alarm", queryId: "q_alarm_trend" },
            props: {
              ...defaultChartSpec("丢包率变化"),
              chartType: "bar",
              bindings: [{ role: "x", field: "day" }, { role: "y", field: "packet_loss", agg: "avg", unit: "pct" }]
            }
          }
        ]),
        makeSection("3. 下周动作", [makeTextNode("重点关注南区拥塞窗口，建立分钟级异常回溯机制。")])
      ];
      return doc;
    }
  },
  {
    id: "report.rca",
    docType: "report",
    name: "故障复盘报告",
    description: "事件背景、时间线和根因分析模板。",
    build: () => ({
      docId: prefixedId("report"),
      docType: "report",
      schemaVersion: "1.0.0",
      title: "故障复盘报告",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_incident",
          type: "static",
          staticData: [
            { minute: "10:00", err_qps: 45, stage: "detect" },
            { minute: "10:05", err_qps: 90, stage: "impact" },
            { minute: "10:10", err_qps: 130, stage: "impact" },
            { minute: "10:15", err_qps: 82, stage: "mitigate" },
            { minute: "10:20", err_qps: 36, stage: "recover" }
          ]
        }
      ],
      queries: [{ queryId: "q_incident", sourceId: "ds_incident", kind: "static" }],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "flow" },
        props: {
          reportTitle: "故障复盘报告",
          tocShow: true,
          coverEnabled: true,
          coverTitle: "故障复盘报告",
          coverSubtitle: "RCA Report",
          coverNote: "事件编号：INC-2026-0218",
          summaryEnabled: true,
          summaryTitle: "RCA 摘要",
          summaryText: "故障由灰度路由规则冲突触发，已完成回滚与规则校验加固。",
          headerShow: true,
          headerText: "故障复盘 · 内部资料",
          footerShow: true,
          footerText: "Visual Document OS",
          showPageNumber: true,
          pageSize: "A4"
        },
        children: [
          makeSection("1. 事件背景", [makeTextNode("2026-02-18 10:00 起核心接口错误率快速上升，影响华北用户。")]),
          makeSection("2. 影响与处置时间线", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_incident", queryId: "q_incident" },
              props: {
                ...defaultChartSpec("错误QPS变化"),
                bindings: [{ role: "x", field: "minute" }, { role: "y", field: "err_qps", agg: "sum", unit: "count" }]
              }
            },
            makeTextNode("10:12 启动限流，10:18 完成回滚，10:22 服务恢复。")
          ]),
          makeSection("3. 根因与改进", [
            makeTextNode("根因是灰度路由规则冲突导致流量放大；已增加发布前规则一致性检查。")
          ])
        ]
      }
    })
  },
  {
    id: "report.exec",
    docType: "report",
    name: "经营分析简报",
    description: "管理层阅读版：结论先行 + 关键图表。",
    build: () => ({
      docId: prefixedId("report"),
      docType: "report",
      schemaVersion: "1.0.0",
      title: "经营分析简报",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_biz",
          type: "static",
          staticData: [
            { week: "W1", channel: "APP", revenue: 132 },
            { week: "W1", channel: "Web", revenue: 98 },
            { week: "W2", channel: "APP", revenue: 140 },
            { week: "W2", channel: "Web", revenue: 106 },
            { week: "W3", channel: "APP", revenue: 156 },
            { week: "W3", channel: "Web", revenue: 112 }
          ]
        }
      ],
      queries: [{ queryId: "q_biz", sourceId: "ds_biz", kind: "static" }],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "flow" },
        props: {
          reportTitle: "经营分析简报",
          tocShow: true,
          coverEnabled: true,
          coverTitle: "经营分析简报",
          coverSubtitle: "Executive Business Brief",
          coverNote: "季度管理层版本",
          summaryEnabled: true,
          summaryTitle: "经营摘要",
          summaryText: "近三周收入稳定提升，APP 渠道贡献持续扩大。",
          headerShow: true,
          headerText: "经营简报 · 管理层",
          footerShow: true,
          footerText: "Visual Document OS",
          showPageNumber: true,
          pageSize: "A4"
        },
        children: [
          makeSection("核心结论", [makeTextNode("近三周收入稳定上升，APP 渠道贡献持续扩大。")]),
          makeSection("关键指标", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_biz", queryId: "q_biz" },
              props: {
                ...defaultChartSpec("周收入趋势"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "week" },
                  { role: "y", field: "revenue", agg: "sum" },
                  { role: "series", field: "channel" }
                ],
                legendShow: true
              }
            }
          ])
        ]
      }
    })
  },
  {
    id: "report.monthly.enterprise",
    docType: "report",
    name: "月度运营报告（真实样例）",
    description: "管理层口径：经营、质量、故障、风险与计划全链路。",
    build: () => ({
      docId: prefixedId("report"),
      docType: "report",
      schemaVersion: "1.0.0",
      title: "网络与经营月度运营报告（2026-02）",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_finance_week",
          type: "static",
          staticData: [
            { week: "W1", revenue_m: 1820, gross_margin_pct: 31.2, active_users_k: 420, renewal_pct: 87.1 },
            { week: "W2", revenue_m: 1885, gross_margin_pct: 31.9, active_users_k: 427, renewal_pct: 87.8 },
            { week: "W3", revenue_m: 1948, gross_margin_pct: 32.5, active_users_k: 435, renewal_pct: 88.3 },
            { week: "W4", revenue_m: 2012, gross_margin_pct: 33.1, active_users_k: 442, renewal_pct: 88.9 }
          ]
        },
        {
          id: "ds_network_day",
          type: "static",
          staticData: [
            { day: "02-01", availability_pct: 99.95, latency_ms: 21, packet_loss_pct: 0.23, err_qps: 52 },
            { day: "02-02", availability_pct: 99.96, latency_ms: 20, packet_loss_pct: 0.21, err_qps: 49 },
            { day: "02-03", availability_pct: 99.97, latency_ms: 19, packet_loss_pct: 0.19, err_qps: 44 },
            { day: "02-04", availability_pct: 99.96, latency_ms: 22, packet_loss_pct: 0.24, err_qps: 58 },
            { day: "02-05", availability_pct: 99.98, latency_ms: 18, packet_loss_pct: 0.17, err_qps: 40 },
            { day: "02-06", availability_pct: 99.97, latency_ms: 19, packet_loss_pct: 0.18, err_qps: 43 },
            { day: "02-07", availability_pct: 99.98, latency_ms: 18, packet_loss_pct: 0.16, err_qps: 38 }
          ]
        },
        {
          id: "ds_region_perf",
          type: "static",
          staticData: [
            { region: "华东", latency_ms: 18, availability_pct: 99.97, nps: 58 },
            { region: "华北", latency_ms: 20, availability_pct: 99.96, nps: 55 },
            { region: "华南", latency_ms: 22, availability_pct: 99.95, nps: 52 },
            { region: "西南", latency_ms: 24, availability_pct: 99.94, nps: 49 }
          ]
        },
        {
          id: "ds_incident",
          type: "static",
          staticData: [
            { week: "W1", severity: "P1", count: 2, mttr_min: 43 },
            { week: "W1", severity: "P2", count: 6, mttr_min: 52 },
            { week: "W2", severity: "P1", count: 1, mttr_min: 37 },
            { week: "W2", severity: "P2", count: 5, mttr_min: 48 },
            { week: "W3", severity: "P1", count: 1, mttr_min: 34 },
            { week: "W3", severity: "P2", count: 4, mttr_min: 45 },
            { week: "W4", severity: "P1", count: 0, mttr_min: 0 },
            { week: "W4", severity: "P2", count: 3, mttr_min: 39 }
          ]
        },
        {
          id: "ds_voice",
          type: "static",
          staticData: [
            { category: "时延抖动", value: 36 },
            { category: "偶发丢包", value: 24 },
            { category: "访问慢", value: 18 },
            { category: "连接中断", value: 12 },
            { category: "其他", value: 10 }
          ]
        },
        {
          id: "ds_plan",
          type: "static",
          staticData: [
            { stage: "链路治理", progress: 100 },
            { stage: "容量扩容", progress: 88 },
            { stage: "告警收敛", progress: 76 },
            { stage: "灰度校验", progress: 63 },
            { stage: "演练闭环", progress: 52 }
          ]
        },
        {
          id: "ds_issue_flow",
          type: "static",
          staticData: [
            { source: "跨区流量波动", target: "时延抖动", value: 22 },
            { source: "告警噪声积压", target: "处置延迟", value: 18 },
            { source: "发布窗口冲突", target: "连接中断", value: 15 },
            { source: "容量冗余不足", target: "访问慢", value: 12 }
          ]
        },
        {
          id: "ds_cost",
          type: "static",
          staticData: [
            { domain: "基础设施", budget_m: 420, actual_m: 398, saving_m: 22 },
            { domain: "链路与网络", budget_m: 300, actual_m: 287, saving_m: 13 },
            { domain: "可观测性", budget_m: 180, actual_m: 175, saving_m: 5 },
            { domain: "发布与自动化", budget_m: 150, actual_m: 162, saving_m: -12 }
          ]
        },
        {
          id: "ds_segment",
          type: "static",
          staticData: [
            { segment: "KA", arr_m: 820, churn_pct: 1.8, nrr_pct: 118 },
            { segment: "中型客户", arr_m: 640, churn_pct: 2.4, nrr_pct: 111 },
            { segment: "SMB", arr_m: 460, churn_pct: 3.9, nrr_pct: 103 }
          ]
        }
      ],
      queries: [
        { queryId: "q_finance_week", sourceId: "ds_finance_week", kind: "static" },
        { queryId: "q_network_day", sourceId: "ds_network_day", kind: "static" },
        { queryId: "q_region_perf", sourceId: "ds_region_perf", kind: "static" },
        { queryId: "q_incident", sourceId: "ds_incident", kind: "static" },
        { queryId: "q_voice", sourceId: "ds_voice", kind: "static" },
        { queryId: "q_plan", sourceId: "ds_plan", kind: "static" },
        { queryId: "q_issue_flow", sourceId: "ds_issue_flow", kind: "static" },
        { queryId: "q_cost", sourceId: "ds_cost", kind: "static" },
        { queryId: "q_segment", sourceId: "ds_segment", kind: "static" }
      ],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "flow" },
        props: {
          reportTitle: "网络与经营月度运营报告（2026-02）",
          tocShow: true,
          coverEnabled: true,
          coverTitle: "网络与经营月度运营报告",
          coverSubtitle: "Monthly Operations & Business Review",
          coverNote: "数据截止：2026-02-28  |  适用场景：经营例会/周会复盘",
          summaryEnabled: true,
          summaryTitle: "执行摘要",
          summaryText: "本月收入与毛利率同步提升，网络可用性稳定在 99.95% 以上，P1 故障显著下降。下一阶段需优先推进告警收敛与跨区域容量均衡。",
          headerShow: true,
          headerText: "月度运营报告 · 管理版",
          footerShow: true,
          footerText: "Visual Document OS · Internal",
          showPageNumber: true,
          pageSize: "A4",
          nativeChartEnabled: true
        },
        children: [
          makeSection("1. 管理层摘要", [
            makeTextNode(
              "经营侧：收入连续四周环比增长，W4 达到 2012 万；毛利率提升至 33.1%。\n运行侧：核心网络可用性维持高位，错误QPS与丢包率持续下降。\n决策建议：把资源向高增长区域倾斜，同时压缩低效告警并强化发布前校验。"
            ),
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_finance_week", queryId: "q_finance_week" },
              props: {
                ...defaultChartSpec("收入与毛利率周趋势"),
                chartType: "combo",
                bindings: [
                  { role: "x", field: "week" },
                  { role: "y", field: "revenue_m", agg: "sum" },
                  { role: "y2", field: "gross_margin_pct", agg: "avg" }
                ],
                legendShow: true
              }
            }
          ]),
          makeSection("2. 网络质量与SLA", [
            makeTextNode("本月核心网络可用性均值 99.96%，SLA 达标率 100%。02-04 出现短时时延波动，主要由跨区流量突增触发，已通过路由调优恢复。"),
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_network_day", queryId: "q_network_day" },
              props: {
                ...defaultChartSpec("可用性与丢包率（日）"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "day" },
                  { role: "y", field: "availability_pct", agg: "avg" },
                  { role: "y2", field: "packet_loss_pct", agg: "avg" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_region_perf", queryId: "q_region_perf" },
              props: {
                ...defaultChartSpec("各区域平均时延"),
                chartType: "bar",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "latency_ms", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_region_perf", queryId: "q_region_perf" },
              props: {
                ...defaultChartSpec("区域时延与 NPS 关系"),
                chartType: "scatter",
                bindings: [
                  { role: "x", field: "latency_ms", agg: "avg" },
                  { role: "y", field: "nps", agg: "avg" }
                ]
              }
            }
          ]),
          makeSection("3. 告警与故障处置效率", [
            makeTextNode("P1 故障由 W1 的 2 起下降到 W4 的 0 起；P2 故障连续下降。平均修复时长（MTTR）随周次稳定缩短，说明应急流程与自动化处置策略有效。"),
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_incident", queryId: "q_incident" },
              props: {
                ...defaultChartSpec("故障数量（按级别）"),
                chartType: "bar",
                bindings: [{ role: "x", field: "severity" }, { role: "y", field: "count", agg: "sum" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_incident", queryId: "q_incident" },
              props: {
                ...defaultChartSpec("MTTR 周趋势"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "week" },
                  { role: "y", field: "mttr_min", agg: "avg" },
                  { role: "series", field: "severity" }
                ],
                legendShow: true
              }
            }
          ]),
          makeSection("4. 客户体验与业务影响", [
            makeTextNode("NPS 在华东/华北维持较高水平，华南与西南仍有改善空间。客户反馈中“时延抖动”和“偶发丢包”占比最高，应作为下月专项优化重点。"),
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_region_perf", queryId: "q_region_perf" },
              props: {
                ...defaultChartSpec("区域 NPS 对比"),
                chartType: "bar",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "nps", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_voice", queryId: "q_voice" },
              props: {
                ...defaultChartSpec("客户问题类型占比"),
                chartType: "pie",
                bindings: [{ role: "category", field: "category" }, { role: "value", field: "value", agg: "sum" }],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_voice", queryId: "q_voice" },
              props: {
                ...defaultChartSpec("客户问题结构树图"),
                chartType: "treemap",
                bindings: [{ role: "category", field: "category" }, { role: "value", field: "value", agg: "sum" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_segment", queryId: "q_segment" },
              props: {
                ...defaultChartSpec("客户分层 NRR 对比"),
                chartType: "bar",
                bindings: [{ role: "x", field: "segment" }, { role: "y", field: "nrr_pct", agg: "avg" }]
              }
            }
          ]),
          makeSection("5. 成本与资源配置", [
            makeTextNode("本月预算执行整体受控，基础设施与网络域均实现节省；发布与自动化域阶段性投入超预算，主要用于灰度流程与回滚链路改造，预计下季度释放收益。"),
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_cost", queryId: "q_cost" },
              props: {
                ...defaultChartSpec("预算投入结构"),
                chartType: "bar",
                bindings: [{ role: "x", field: "domain" }, { role: "y", field: "budget_m", agg: "sum" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_cost", queryId: "q_cost" },
              props: {
                ...defaultChartSpec("节省金额分布"),
                chartType: "line",
                bindings: [{ role: "x", field: "domain" }, { role: "y", field: "saving_m", agg: "sum" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_network_day", queryId: "q_network_day" },
              props: {
                ...defaultChartSpec("SLA 达成率指针"),
                chartType: "gauge",
                bindings: [{ role: "value", field: "availability_pct", agg: "avg" }]
              }
            }
          ]),
          makeSection("6. 风险与下月计划", [
            makeTextNode(
              "主要风险：\n1) 高峰时段跨区流量回灌仍存在不确定性；\n2) 低优先级告警冗余导致值班负荷偏高；\n3) 发布窗口叠加业务活动，变更风险上升。"
            ),
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_plan", queryId: "q_plan" },
              props: {
                ...defaultChartSpec("重点治理项推进度"),
                chartType: "funnel",
                bindings: [{ role: "category", field: "stage" }, { role: "value", field: "progress", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_issue_flow", queryId: "q_issue_flow" },
              props: {
                ...defaultChartSpec("风险到客户影响路径"),
                chartType: "sankey",
                bindings: [
                  { role: "linkSource", field: "source" },
                  { role: "linkTarget", field: "target" },
                  { role: "linkValue", field: "value", agg: "sum" }
                ]
              }
            },
            makeTextNode(
              "下月动作清单：\n- 完成华南与西南链路策略重算并灰度验证；\n- 将噪声告警压缩 30%，同步改造值班SOP；\n- 建立“发布前一致性检查 + 回滚演练”双保险机制。"
            )
          ]),
          makeSection("7. 附录：多图表类型视角", [
            makeTextNode("附录用于展示多图表类型在业务语境下的表达方式，便于方案评审与客户演示。"),
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_region_perf", queryId: "q_region_perf" },
              props: {
                ...defaultChartSpec("区域质量雷达"),
                chartType: "radar",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "availability_pct", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_region_perf", queryId: "q_region_perf" },
              props: {
                ...defaultChartSpec("区域多指标并行视图"),
                chartType: "parallel",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "latency_ms", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_network_day", queryId: "q_network_day" },
              props: {
                ...defaultChartSpec("日历热力（错误QPS）"),
                chartType: "calendar",
                bindings: [{ role: "x", field: "day" }, { role: "y", field: "err_qps", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_voice", queryId: "q_voice" },
              props: {
                ...defaultChartSpec("自定义渲染（问题类型）"),
                chartType: "custom",
                bindings: [{ role: "x", field: "category" }, { role: "y", field: "value", agg: "sum" }],
                optionPatch: { series: [{ type: "bar" }], title: { text: "custom(optionPatch->bar)" } }
              }
            }
          ])
        ]
      }
    })
  }
];

const pptExamples: BuiltInDocExample[] = [
  {
    id: "ppt.ops.review",
    docType: "ppt",
    name: "运维复盘汇报",
    description: "1 页总览 + 1 页行动项，适合周会演示。",
    build: () => {
      const doc = createPptDoc();
      doc.docId = prefixedId("deck");
      doc.title = "运维复盘汇报";
      doc.dataSources = [
        {
          id: "ds_ops",
          type: "static",
          staticData: [
            { day: "Mon", alarm_count: 34, latency_ms: 22 },
            { day: "Tue", alarm_count: 23, latency_ms: 24 },
            { day: "Wed", alarm_count: 27, latency_ms: 27 },
            { day: "Thu", alarm_count: 18, latency_ms: 23 },
            { day: "Fri", alarm_count: 30, latency_ms: 29 }
          ]
        }
      ];
      doc.queries = [{ queryId: "q_ops", sourceId: "ds_ops", kind: "static" }];
      const firstSlide = doc.root.children?.[0];
      if (firstSlide && firstSlide.kind === "slide") {
        const chartNode = firstSlide.children?.find((node) => node.kind === "chart");
        if (chartNode) {
          chartNode.data = { sourceId: "ds_ops", queryId: "q_ops" };
        }
      }
      doc.root.children = [
        ...(doc.root.children ?? []),
        makeSlide("行动项", [
          {
            id: prefixedId("text"),
            kind: "text",
            layout: { mode: "absolute", x: 40, y: 26, w: 320, h: 48, z: 2 },
            props: { text: "下周行动项", format: "plain" },
            style: { fontSize: 26, bold: true }
          },
          {
            id: prefixedId("chart"),
            kind: "chart",
            layout: { mode: "absolute", x: 40, y: 96, w: 430, h: 250, z: 1 },
            data: { sourceId: "ds_ops", queryId: "q_ops" },
            props: {
              ...defaultChartSpec("时延趋势"),
              bindings: [{ role: "x", field: "day" }, { role: "y", field: "latency_ms", agg: "avg", unit: "ms" }]
            }
          },
          {
            id: prefixedId("text"),
            kind: "text",
            layout: { mode: "absolute", x: 500, y: 96, w: 420, h: 250, z: 1 },
            props: { text: "1) 关键链路补容\n2) 统一告警降噪策略\n3) 增加回滚演练", format: "plain" },
            style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
          }
        ])
      ];
      return doc;
    }
  },
  {
    id: "ppt.incident",
    docType: "ppt",
    name: "故障通报（管理版）",
    description: "事件概览、影响范围和修复状态单页模板。",
    build: () => ({
      docId: prefixedId("deck"),
      docType: "ppt",
      schemaVersion: "1.0.0",
      title: "故障通报（管理版）",
      locale: "zh-CN",
      themeId: "theme.tech.light",
      dataSources: [
        {
          id: "ds_incident",
          type: "static",
          staticData: [
            { minute: "10:00", err_qps: 45 },
            { minute: "10:05", err_qps: 90 },
            { minute: "10:10", err_qps: 130 },
            { minute: "10:15", err_qps: 82 },
            { minute: "10:20", err_qps: 36 }
          ]
        }
      ],
      queries: [{ queryId: "q_incident", sourceId: "ds_incident", kind: "static" }],
      root: {
        id: "root",
        kind: "container",
        props: { size: "16:9", defaultBg: "#ffffff" },
        children: [
          makeSlide("故障通报", [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 36, y: 26, w: 360, h: 48, z: 2 },
              props: { text: "华北区域故障通报", format: "plain" },
              style: { fontSize: 28, bold: true }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 36, y: 96, w: 430, h: 250, z: 1 },
              data: { sourceId: "ds_incident", queryId: "q_incident" },
              props: {
                ...defaultChartSpec("错误QPS"),
                bindings: [{ role: "x", field: "minute" }, { role: "y", field: "err_qps", agg: "sum", unit: "count" }]
              }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 500, y: 96, w: 420, h: 250, z: 1 },
              props: { text: "影响：支付成功率下降\n处置：10:12 限流 + 10:18 回滚\n状态：已恢复", format: "plain" },
              style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
            }
          ])
        ]
      }
    })
  },
  {
    id: "ppt.cover.layouts",
    docType: "ppt",
    name: "封页与布局组合",
    description: "封页 + 图表总结左右布局 + 图表总结上下布局。",
    build: () => ({
      docId: prefixedId("deck"),
      docType: "ppt",
      schemaVersion: "1.0.0",
      title: "经营复盘汇报（封页与布局示例）",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_review",
          type: "static",
          staticData: [
            { month: "Jan", channel: "APP", gmv: 120, profit: 32 },
            { month: "Jan", channel: "Web", gmv: 82, profit: 19 },
            { month: "Feb", channel: "APP", gmv: 132, profit: 36 },
            { month: "Feb", channel: "Web", gmv: 90, profit: 22 },
            { month: "Mar", channel: "APP", gmv: 146, profit: 41 },
            { month: "Mar", channel: "Web", gmv: 98, profit: 24 }
          ]
        }
      ],
      queries: [{ queryId: "q_review", sourceId: "ds_review", kind: "static" }],
      root: {
        id: "root",
        kind: "container",
        props: { size: "16:9", defaultBg: "#ffffff", nativeChartEnabled: true },
        children: [
          makeSlide("封面", [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 80, y: 130, w: 800, h: 90, z: 2 },
              props: { text: "经营复盘汇报", format: "plain" },
              style: { fontSize: 44, bold: true }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 80, y: 225, w: 800, h: 60, z: 2 },
              props: { text: "Q1 Growth Review · Board Version", format: "plain" },
              style: { fontSize: 22 }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 80, y: 360, w: 800, h: 60, z: 2 },
              props: { text: "日期：2026-03-02  |  汇报人：运营分析组", format: "plain" },
              style: { fontSize: 16 }
            }
          ]),
          makeSlide("图表 + 总结（左右布局）", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 36, y: 92, w: 430, h: 260, z: 1 },
              data: { sourceId: "ds_review", queryId: "q_review" },
              props: {
                ...defaultChartSpec("渠道 GMV 趋势"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "month" },
                  { role: "y", field: "gmv", agg: "sum" },
                  { role: "series", field: "channel" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 492, y: 92, w: 430, h: 260, z: 1 },
              props: {
                text: "结论：\n1) Q1 收入连续增长，3 月达到峰值。\n2) APP 渠道增长更稳健，贡献占比持续提升。\n3) 下一阶段建议重点优化 Web 转化链路。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
            }
          ]),
          makeSlide("图表 + 总结（上下布局）", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 80, y: 92, w: 800, h: 220, z: 1 },
              data: { sourceId: "ds_review", queryId: "q_review" },
              props: {
                ...defaultChartSpec("季度利润对比"),
                chartType: "bar",
                bindings: [
                  { role: "x", field: "month" },
                  { role: "y", field: "profit", agg: "sum" },
                  { role: "series", field: "channel" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 80, y: 330, w: 800, h: 160, z: 1 },
              props: {
                text: "总结：\n- 利润结构较健康，APP 渠道利润贡献高于 Web。\n- 2 月与 3 月增长趋势明确，适合持续加大高 ROI 投放。\n- 建议补充按区域拆分，以支持下一轮预算决策。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
            }
          ])
        ]
      }
    })
  },
  {
    id: "ppt.business",
    docType: "ppt",
    name: "经营汇报（季度）",
    description: "增长趋势 + 渠道对比页面。",
    build: () => ({
      docId: prefixedId("deck"),
      docType: "ppt",
      schemaVersion: "1.0.0",
      title: "经营汇报（季度）",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_growth",
          type: "static",
          staticData: [
            { month: "Jan", channel: "APP", gmv: 120 },
            { month: "Jan", channel: "Web", gmv: 82 },
            { month: "Feb", channel: "APP", gmv: 132 },
            { month: "Feb", channel: "Web", gmv: 90 },
            { month: "Mar", channel: "APP", gmv: 146 },
            { month: "Mar", channel: "Web", gmv: 98 }
          ]
        }
      ],
      queries: [{ queryId: "q_growth", sourceId: "ds_growth", kind: "static" }],
      root: {
        id: "root",
        kind: "container",
        props: { size: "16:9", defaultBg: "#ffffff" },
        children: [
          makeSlide("季度经营增长", [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 36, y: 24, w: 360, h: 48, z: 2 },
              props: { text: "季度经营增长", format: "plain" },
              style: { fontSize: 28, bold: true }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 36, y: 92, w: 430, h: 260, z: 1 },
              data: { sourceId: "ds_growth", queryId: "q_growth" },
              props: {
                ...defaultChartSpec("GMV 趋势"),
                bindings: [
                  { role: "x", field: "month" },
                  { role: "y", field: "gmv", agg: "sum" },
                  { role: "series", field: "channel" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 492, y: 92, w: 430, h: 260, z: 1 },
              data: { sourceId: "ds_growth", queryId: "q_growth" },
              props: {
                ...defaultChartSpec("渠道占比"),
                chartType: "pie",
                bindings: [{ role: "category", field: "channel" }, { role: "value", field: "gmv", agg: "sum" }]
              }
            }
          ])
        ]
      }
    })
  },
  {
    id: "ppt.quarterly.board",
    docType: "ppt",
    name: "季度复盘（董事会）",
    description: "多页叙事：封面、议程、摘要、增长、稳定性、风险、结语。",
    build: () => ({
      docId: prefixedId("deck"),
      docType: "ppt",
      schemaVersion: "1.0.0",
      title: "季度经营与网络稳定性复盘（董事会版）",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_board",
          type: "static",
          staticData: [
            { month: "Jan", channel: "APP", gmv: 120, profit: 32, orders_k: 86, retention_pct: 72.2 },
            { month: "Jan", channel: "Web", gmv: 82, profit: 19, orders_k: 53, retention_pct: 68.4 },
            { month: "Feb", channel: "APP", gmv: 132, profit: 36, orders_k: 91, retention_pct: 73.1 },
            { month: "Feb", channel: "Web", gmv: 90, profit: 22, orders_k: 57, retention_pct: 69.0 },
            { month: "Mar", channel: "APP", gmv: 146, profit: 41, orders_k: 97, retention_pct: 74.2 },
            { month: "Mar", channel: "Web", gmv: 98, profit: 24, orders_k: 61, retention_pct: 69.7 }
          ]
        },
        {
          id: "ds_quality",
          type: "static",
          staticData: [
            { week: "W1", sla_pct: 99.95, latency_ms: 22, err_qps: 56 },
            { week: "W2", sla_pct: 99.96, latency_ms: 21, err_qps: 49 },
            { week: "W3", sla_pct: 99.97, latency_ms: 20, err_qps: 43 },
            { week: "W4", sla_pct: 99.98, latency_ms: 19, err_qps: 38 }
          ]
        },
        {
          id: "ds_risk",
          type: "static",
          staticData: [
            { risk: "跨区流量波动", score: 78 },
            { risk: "告警噪声积压", score: 66 },
            { risk: "变更窗口冲突", score: 63 },
            { risk: "容量冗余不足", score: 58 }
          ]
        },
        {
          id: "ds_risk_flow",
          type: "static",
          staticData: [
            { source: "跨区流量波动", target: "时延抖动", value: 22 },
            { source: "告警噪声积压", target: "处置延迟", value: 18 },
            { source: "变更窗口冲突", target: "连接中断", value: 15 },
            { source: "容量冗余不足", target: "访问慢", value: 12 }
          ]
        }
      ],
      queries: [
        { queryId: "q_board", sourceId: "ds_board", kind: "static" },
        { queryId: "q_quality", sourceId: "ds_quality", kind: "static" },
        { queryId: "q_risk", sourceId: "ds_risk", kind: "static" },
        { queryId: "q_risk_flow", sourceId: "ds_risk_flow", kind: "static" }
      ],
      root: {
        id: "root",
        kind: "container",
        props: { size: "16:9", defaultBg: "#ffffff", nativeChartEnabled: true },
        children: [
          makeSlide("封面", [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 70, y: 145, w: 820, h: 90, z: 2 },
              props: { text: "季度经营与网络稳定性复盘", format: "plain" },
              style: { fontSize: 42, bold: true }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 70, y: 240, w: 820, h: 60, z: 2 },
              props: { text: "Q1 Board Review · Internal", format: "plain" },
              style: { fontSize: 20 }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 70, y: 370, w: 820, h: 55, z: 2 },
              props: { text: "汇报人：运营与平台联合团队  |  日期：2026-03-02", format: "plain" },
              style: { fontSize: 16 }
            }
          ]),
          makeSlide("议程", [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 90, y: 90, w: 780, h: 350, z: 1 },
              props: {
                text: "1) 核心经营结果与趋势\n2) 网络稳定性与客户体验\n3) 关键风险与治理进展\n4) 下季度投入与里程碑",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 16, borderW: 1, borderC: "#dbeafe", radius: 10, fontSize: 24 }
            }
          ]),
          makeSlide("管理层摘要", [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 70, y: 92, w: 820, h: 360, z: 1 },
              props: {
                text: "结论：\n- Q1 收入与利润双增长，APP 渠道持续拉动整体增长。\n- SLA 稳定在 99.95% 以上，错误QPS连续下降。\n- 风险主要集中在跨区流量与告警噪声，已进入专项治理阶段。\n\n建议：\n- 将预算优先配置到高ROI渠道与链路治理。\n- 强化发布前校验与回滚演练，降低变更风险。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 16, borderW: 1, borderC: "#dbeafe", radius: 10 }
            }
          ]),
          makeSlide("经营增长（图表 + 总结左右布局）", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 36, y: 92, w: 430, h: 265, z: 1 },
              data: { sourceId: "ds_board", queryId: "q_board" },
              props: {
                ...defaultChartSpec("GMV 趋势（分渠道）"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "month" },
                  { role: "y", field: "gmv", agg: "sum" },
                  { role: "series", field: "channel" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 492, y: 92, w: 430, h: 265, z: 1 },
              props: {
                text: "经营洞察：\n1) APP 渠道增长斜率高于 Web。\n2) 订单规模与留存同步改善。\n3) 当前增长具备可持续性，建议加速高价值用户运营。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 36, y: 372, w: 430, h: 130, z: 1 },
              data: { sourceId: "ds_board", queryId: "q_board" },
              props: {
                ...defaultChartSpec("渠道利润结构"),
                chartType: "bar",
                bindings: [
                  { role: "x", field: "month" },
                  { role: "y", field: "profit", agg: "sum" },
                  { role: "series", field: "channel" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 492, y: 372, w: 430, h: 130, z: 1 },
              props: {
                text: "补充判断：APP 单位利润持续走高，Web 稳态增长，渠道结构健康。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 10, borderW: 1, borderC: "#dbeafe", radius: 8 }
            }
          ]),
          makeSlide("稳定性（图表 + 总结上下布局）", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 80, y: 92, w: 800, h: 220, z: 1 },
              data: { sourceId: "ds_quality", queryId: "q_quality" },
              props: {
                ...defaultChartSpec("SLA 与错误QPS周趋势"),
                chartType: "combo",
                bindings: [
                  { role: "x", field: "week" },
                  { role: "y", field: "sla_pct", agg: "avg" },
                  { role: "y2", field: "err_qps", agg: "avg" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 80, y: 320, w: 390, h: 165, z: 1 },
              data: { sourceId: "ds_quality", queryId: "q_quality" },
              props: {
                ...defaultChartSpec("周时延"),
                chartType: "line",
                bindings: [{ role: "x", field: "week" }, { role: "y", field: "latency_ms", agg: "avg" }]
              }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 490, y: 320, w: 390, h: 165, z: 1 },
              props: {
                text: "稳定性结论：\n- SLA 在 99.95%~99.98% 区间内稳定。\n- 错误QPS下降 32%，故障处置效率明显提升。\n- 下阶段聚焦低峰时段链路抖动与跨区流量均衡。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
            }
          ]),
          makeSlide("风险与行动计划", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 36, y: 92, w: 430, h: 265, z: 1 },
              data: { sourceId: "ds_risk", queryId: "q_risk" },
              props: {
                ...defaultChartSpec("风险暴露评分"),
                chartType: "bar",
                bindings: [{ role: "x", field: "risk" }, { role: "y", field: "score", agg: "avg" }]
              }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 492, y: 92, w: 430, h: 320, z: 1 },
              props: {
                text: "行动计划：\n- 跨区流量：完成策略重算与灰度演练。\n- 告警治理：压缩噪声告警 30%，优化值班效率。\n- 变更风险：建立发布前一致性校验门禁。\n\n目标：下季度将关键风险评分整体下调 10~15 分。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
            }
          ]),
          makeSlide("多图表类型视角", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 20, y: 92, w: 300, h: 190, z: 1 },
              data: { sourceId: "ds_quality", queryId: "q_quality" },
              props: {
                ...defaultChartSpec("时延 vs 错误QPS"),
                chartType: "scatter",
                bindings: [{ role: "x", field: "latency_ms", agg: "avg" }, { role: "y", field: "err_qps", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 330, y: 92, w: 300, h: 190, z: 1 },
              data: { sourceId: "ds_risk", queryId: "q_risk" },
              props: {
                ...defaultChartSpec("风险雷达"),
                chartType: "radar",
                bindings: [{ role: "x", field: "risk" }, { role: "y", field: "score", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 640, y: 92, w: 300, h: 190, z: 1 },
              data: { sourceId: "ds_risk", queryId: "q_risk" },
              props: {
                ...defaultChartSpec("风险树图"),
                chartType: "treemap",
                bindings: [{ role: "category", field: "risk" }, { role: "value", field: "score", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 20, y: 302, w: 300, h: 190, z: 1 },
              data: { sourceId: "ds_quality", queryId: "q_quality" },
              props: {
                ...defaultChartSpec("SLA 指针"),
                chartType: "gauge",
                bindings: [{ role: "value", field: "sla_pct", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 330, y: 302, w: 610, h: 190, z: 1 },
              data: { sourceId: "ds_risk_flow", queryId: "q_risk_flow" },
              props: {
                ...defaultChartSpec("风险到客户影响路径"),
                chartType: "sankey",
                bindings: [
                  { role: "linkSource", field: "source" },
                  { role: "linkTarget", field: "target" },
                  { role: "linkValue", field: "value", agg: "sum" }
                ]
              }
            }
          ]),
          makeSlide("结语与决策请求", [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 80, y: 120, w: 800, h: 280, z: 1 },
              props: {
                text: "决策请求：\n1) 批准链路治理与告警收敛专项预算。\n2) 同意建立跨团队发布风险联审机制。\n3) 确认下季度里程碑与周度追踪节奏。\n\n谢谢。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 16, borderW: 1, borderC: "#dbeafe", radius: 10, fontSize: 22 }
            }
          ]),
          makeSlide("附录：经营结构", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 40, y: 92, w: 420, h: 280, z: 1 },
              data: { sourceId: "ds_board", queryId: "q_board" },
              props: {
                ...defaultChartSpec("订单规模趋势"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "month" },
                  { role: "y", field: "orders_k", agg: "sum" },
                  { role: "series", field: "channel" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 500, y: 92, w: 420, h: 280, z: 1 },
              data: { sourceId: "ds_board", queryId: "q_board" },
              props: {
                ...defaultChartSpec("留存率走势"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "month" },
                  { role: "y", field: "retention_pct", agg: "avg" },
                  { role: "series", field: "channel" }
                ],
                legendShow: true
              }
            }
          ])
        ]
      }
    })
  }
];

const allExamples: BuiltInDocExample[] = [...dashboardExamples, ...reportExamples, ...pptExamples];

const normalizeDocType = (docType: DocType): Extract<DocType, "dashboard" | "report" | "ppt"> =>
  docType === "chart" ? "dashboard" : docType;

const preferredExampleByDocType: Record<Extract<DocType, "dashboard" | "report" | "ppt">, string> = {
  dashboard: "dashboard.noc",
  report: "report.monthly.enterprise",
  ppt: "ppt.quarterly.board"
};

export const listBuiltInDocExamples = (docType: DocType): BuiltInDocExample[] => {
  const normalized = normalizeDocType(docType);
  return allExamples.filter((item) => item.docType === normalized);
};

export const resolveDocExampleId = (docType: DocType, exampleId?: string): string => {
  const list = listBuiltInDocExamples(docType);
  if (list.length === 0) {
    return "";
  }
  if (exampleId && list.some((item) => item.id === exampleId)) {
    return exampleId;
  }
  const preferred = preferredExampleByDocType[normalizeDocType(docType)];
  if (preferred && list.some((item) => item.id === preferred)) {
    return preferred;
  }
  return list[0]!.id;
};

export const createBuiltInDoc = (docType: DocType, exampleId?: string): VDoc => {
  const resolvedId = resolveDocExampleId(docType, exampleId);
  const found = listBuiltInDocExamples(docType).find((item) => item.id === resolvedId);
  if (found) {
    return found.build();
  }
  return createDashboardDoc();
};
