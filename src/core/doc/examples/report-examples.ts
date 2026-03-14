import { prefixedId } from "../../utils/id";
import { createReportDoc, defaultChartSpec } from "../defaults";
import type { BuiltInDocExample } from "./shared";
import { makeSection, makeTextNode } from "./shared";
export const reportExamples: BuiltInDocExample[] = [
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
  },
  {
    id: "report.ops.table.playbook",
    docType: "report",
    name: "运维运营报告（图表+表格）",
    description: "强调工单表格、班次矩阵与图表联动的实战样例。",
    build: () => ({
      docId: prefixedId("report"),
      docType: "report",
      schemaVersion: "1.0.0",
      title: "运维运营报告（图表+表格）",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_weekly_kpi",
          type: "static",
          staticData: [
            { week: "W1", qps: 1890, err_qps: 63, availability_pct: 99.95 },
            { week: "W2", qps: 1960, err_qps: 58, availability_pct: 99.96 },
            { week: "W3", qps: 2040, err_qps: 51, availability_pct: 99.97 },
            { week: "W4", qps: 2120, err_qps: 47, availability_pct: 99.98 }
          ]
        },
        {
          id: "ds_region_ticket",
          type: "static",
          staticData: [
            { region: "East", owner: "张雷", open_p1: 2, open_p2: 9, mttr_min: 34, sla_pct: 99.97 },
            { region: "North", owner: "刘宁", open_p1: 3, open_p2: 12, mttr_min: 41, sla_pct: 99.95 },
            { region: "South", owner: "王晨", open_p1: 1, open_p2: 7, mttr_min: 29, sla_pct: 99.98 },
            { region: "West", owner: "陈博", open_p1: 2, open_p2: 10, mttr_min: 37, sla_pct: 99.96 }
          ]
        },
        {
          id: "ds_shift",
          type: "static",
          staticData: [
            { team: "NOC-A", shift: "早班", closed_cnt: 42 },
            { team: "NOC-A", shift: "中班", closed_cnt: 38 },
            { team: "NOC-A", shift: "晚班", closed_cnt: 31 },
            { team: "NOC-B", shift: "早班", closed_cnt: 36 },
            { team: "NOC-B", shift: "中班", closed_cnt: 40 },
            { team: "NOC-B", shift: "晚班", closed_cnt: 34 },
            { team: "SRE-平台", shift: "早班", closed_cnt: 28 },
            { team: "SRE-平台", shift: "中班", closed_cnt: 33 },
            { team: "SRE-平台", shift: "晚班", closed_cnt: 26 }
          ]
        },
        {
          id: "ds_alarm_cate",
          type: "static",
          staticData: [
            { category: "链路抖动", count: 38 },
            { category: "设备过载", count: 29 },
            { category: "配置冲突", count: 21 },
            { category: "外部依赖", count: 16 }
          ]
        }
      ],
      queries: [
        { queryId: "q_weekly_kpi", sourceId: "ds_weekly_kpi", kind: "static" },
        { queryId: "q_region_ticket", sourceId: "ds_region_ticket", kind: "static" },
        { queryId: "q_shift", sourceId: "ds_shift", kind: "static" },
        { queryId: "q_alarm_cate", sourceId: "ds_alarm_cate", kind: "static" }
      ],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "flow" },
        props: {
          reportTitle: "运维运营报告（图表+表格）",
          tocShow: true,
          coverEnabled: true,
          coverTitle: "运维运营报告",
          coverSubtitle: "Operations Playbook",
          coverNote: "图表 + 表格混合样例",
          summaryEnabled: true,
          summaryTitle: "执行摘要",
          summaryText: "本月处理效率提升，区域 SLA 稳定，班次工单关闭能力趋于均衡。",
          headerShow: true,
          headerText: "运维运营报告 · 内部资料",
          footerShow: true,
          footerText: "Visual Document OS",
          showPageNumber: true,
          pageSize: "A4"
        },
        children: [
          makeSection("1. 核心指标走势", [
            makeTextNode("QPS 持续增长，错误QPS稳步下降，可用性提升至 99.98%。"),
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_weekly_kpi", queryId: "q_weekly_kpi" },
              props: {
                ...defaultChartSpec("流量与错误QPS周趋势"),
                chartType: "combo",
                bindings: [
                  { role: "x", field: "week" },
                  { role: "y", field: "qps", agg: "avg", axis: "primary" },
                  { role: "y2", field: "err_qps", agg: "avg", axis: "secondary" }
                ],
                legendShow: true
              }
            }
          ]),
          makeSection("2. 区域质量与工单明细", [
            {
              id: prefixedId("table"),
              kind: "table",
              data: { sourceId: "ds_region_ticket", queryId: "q_region_ticket" },
              props: {
                titleText: "区域工单与质量明细",
                repeatHeader: true,
                zebra: true,
                columns: [
                  { key: "region", title: "区域", width: 90 },
                  { key: "owner", title: "负责人", width: 100 },
                  { key: "open_p1", title: "P1", width: 70, align: "right", format: "int" },
                  { key: "open_p2", title: "P2", width: 70, align: "right", format: "int" },
                  { key: "mttr_min", title: "MTTR(min)", width: 110, align: "right", format: "int" },
                  { key: "sla_pct", title: "SLA(%)", width: 90, align: "right", format: "pct" }
                ],
                headerRows: [
                  [
                    { text: "区域", rowSpan: 2, colSpan: 1, align: "center" },
                    { text: "值守", rowSpan: 2, colSpan: 1, align: "center" },
                    { text: "未闭环工单", rowSpan: 1, colSpan: 2, align: "center" },
                    { text: "恢复效率", rowSpan: 1, colSpan: 2, align: "center" }
                  ],
                  [
                    { text: "P1", rowSpan: 1, colSpan: 1, align: "center" },
                    { text: "P2", rowSpan: 1, colSpan: 1, align: "center" },
                    { text: "MTTR(min)", rowSpan: 1, colSpan: 1, align: "center" },
                    { text: "SLA(%)", rowSpan: 1, colSpan: 1, align: "center" }
                  ]
                ]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_region_ticket", queryId: "q_region_ticket" },
              props: {
                ...defaultChartSpec("区域 MTTR 对比"),
                chartType: "bar",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "mttr_min", agg: "avg" }],
                labelShow: true
              }
            }
          ]),
          makeSection("3. 班次处理能力矩阵", [
            {
              id: prefixedId("table"),
              kind: "table",
              data: { sourceId: "ds_shift", queryId: "q_shift" },
              props: {
                titleText: "班次关闭工单矩阵（Pivot）",
                repeatHeader: true,
                zebra: true,
                columns: [{ key: "team", title: "团队", width: 130 }],
                pivot: {
                  enabled: true,
                  rowFields: ["team"],
                  columnField: "shift",
                  valueField: "closed_cnt",
                  agg: "sum",
                  fill: 0,
                  valueTitle: "已关闭工单"
                }
              }
            },
            makeTextNode("矩阵显示 NOC 与 SRE 团队在不同班次的处置吞吐差异，可用于排班优化。")
          ]),
          makeSection("4. 告警结构与行动计划", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              data: { sourceId: "ds_alarm_cate", queryId: "q_alarm_cate" },
              props: {
                ...defaultChartSpec("告警类型占比"),
                chartType: "pie",
                bindings: [{ role: "category", field: "category" }, { role: "value", field: "count", agg: "sum" }]
              }
            },
            makeTextNode("下阶段重点：链路抖动专项治理、配置审计收敛、外部依赖健康度看板化。")
          ])
        ]
      }
    })
  },
  {
    id: "report.ops.multi.chapter",
    docType: "report",
    name: "运维专题报告（章节内多图）",
    description: "单章节内放置多张图表，适用于专题分析与评审演示。",
    build: () => ({
      docId: prefixedId("report"),
      docType: "report",
      schemaVersion: "1.0.0",
      title: "运维专题报告（章节内多图）",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_kpi_detail",
          type: "static",
          staticData: [
            { week: "W1", service: "网关", qps: 860, err_qps: 28, latency_ms: 22 },
            { week: "W2", service: "网关", qps: 910, err_qps: 26, latency_ms: 21 },
            { week: "W3", service: "网关", qps: 955, err_qps: 23, latency_ms: 20 },
            { week: "W4", service: "网关", qps: 1005, err_qps: 21, latency_ms: 19 },
            { week: "W1", service: "订单", qps: 640, err_qps: 24, latency_ms: 29 },
            { week: "W2", service: "订单", qps: 685, err_qps: 21, latency_ms: 27 },
            { week: "W3", service: "订单", qps: 720, err_qps: 18, latency_ms: 25 },
            { week: "W4", service: "订单", qps: 765, err_qps: 16, latency_ms: 24 },
            { week: "W1", service: "搜索", qps: 520, err_qps: 31, latency_ms: 33 },
            { week: "W2", service: "搜索", qps: 550, err_qps: 28, latency_ms: 31 },
            { week: "W3", service: "搜索", qps: 590, err_qps: 24, latency_ms: 28 },
            { week: "W4", service: "搜索", qps: 630, err_qps: 22, latency_ms: 27 }
          ]
        },
        {
          id: "ds_quality_region",
          type: "static",
          staticData: [
            { region: "East", latency_ms: 22, packet_loss_pct: 0.22, nps: 52, alarm_cnt: 36, throughput_mbps: 1480 },
            { region: "North", latency_ms: 25, packet_loss_pct: 0.28, nps: 49, alarm_cnt: 44, throughput_mbps: 1360 },
            { region: "South", latency_ms: 20, packet_loss_pct: 0.18, nps: 55, alarm_cnt: 31, throughput_mbps: 1260 },
            { region: "West", latency_ms: 24, packet_loss_pct: 0.25, nps: 50, alarm_cnt: 39, throughput_mbps: 1410 }
          ]
        },
        {
          id: "ds_release",
          type: "static",
          staticData: [
            { week: "W1", changes: 24, rollback: 4, success_pct: 96.4 },
            { week: "W2", changes: 28, rollback: 3, success_pct: 97.2 },
            { week: "W3", changes: 31, rollback: 2, success_pct: 98.1 },
            { week: "W4", changes: 35, rollback: 2, success_pct: 98.4 }
          ]
        }
      ],
      queries: [
        { queryId: "q_kpi_detail", sourceId: "ds_kpi_detail", kind: "static" },
        { queryId: "q_quality_region", sourceId: "ds_quality_region", kind: "static" },
        { queryId: "q_release", sourceId: "ds_release", kind: "static" }
      ],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "flow" },
        props: {
          reportTitle: "运维专题报告（章节内多图）",
          tocShow: true,
          coverEnabled: true,
          coverTitle: "章节多图分析样例",
          coverSubtitle: "Chapter Multi-Chart Demo",
          summaryEnabled: true,
          summaryTitle: "摘要",
          summaryText: "每个章节内放置多图，支持从总览到诊断再到行动闭环。",
          headerShow: true,
          headerText: "专题分析报告 · 内部",
          footerShow: true,
          footerText: "Visual Document OS",
          showPageNumber: true,
          pageSize: "A4"
        },
        children: [
          makeSection("1. 总览（同章节多图）", [
            makeTextNode("同一章节中组合趋势图、双轴图与占比图，快速形成“规模-质量-结构”三联视角。"),
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 1, gw: 6, h: 300 },
              data: { sourceId: "ds_kpi_detail", queryId: "q_kpi_detail" },
              props: {
                ...defaultChartSpec("服务 QPS 周趋势"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "week" },
                  { role: "y", field: "qps", agg: "sum" },
                  { role: "series", field: "service" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 6, gy: 1, gw: 6, h: 300 },
              data: { sourceId: "ds_release", queryId: "q_release" },
              props: {
                ...defaultChartSpec("发布成功率 vs 回滚次数"),
                chartType: "combo",
                bindings: [
                  { role: "x", field: "week" },
                  { role: "y", field: "success_pct", agg: "avg", axis: "primary" },
                  { role: "y2", field: "rollback", agg: "sum", axis: "secondary" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 2, gw: 12, h: 280 },
              data: { sourceId: "ds_kpi_detail", queryId: "q_kpi_detail" },
              props: {
                ...defaultChartSpec("服务流量占比"),
                chartType: "pie",
                bindings: [{ role: "category", field: "service" }, { role: "value", field: "qps", agg: "sum" }]
              }
            }
          ]),
          makeSection("2. 质量诊断（同章节四图）", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 0, gw: 6, h: 280 },
              data: { sourceId: "ds_quality_region", queryId: "q_quality_region" },
              props: {
                ...defaultChartSpec("各区域平均时延"),
                chartType: "bar",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "latency_ms", agg: "avg" }],
                labelShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 6, gy: 0, gw: 6, h: 280 },
              data: { sourceId: "ds_quality_region", queryId: "q_quality_region" },
              props: {
                ...defaultChartSpec("吞吐-时延散点"),
                chartType: "scatter",
                bindings: [
                  { role: "x", field: "throughput_mbps", agg: "avg" },
                  { role: "y", field: "latency_ms", agg: "avg" }
                ]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 1, gw: 6, h: 280 },
              data: { sourceId: "ds_quality_region", queryId: "q_quality_region" },
              props: {
                ...defaultChartSpec("区域 NPS 雷达"),
                chartType: "radar",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "nps", agg: "avg" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 6, gy: 1, gw: 6, h: 280 },
              data: { sourceId: "ds_quality_region", queryId: "q_quality_region" },
              props: {
                ...defaultChartSpec("告警规模树图"),
                chartType: "treemap",
                bindings: [{ role: "category", field: "region" }, { role: "value", field: "alarm_cnt", agg: "sum" }]
              }
            },
            makeTextNode("该章节通过四图联动输出“热点区域 + 成因维度 + 结构分布”。")
          ]),
          makeSection("3. 变更风险与行动", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 0, gw: 8, h: 280 },
              data: { sourceId: "ds_release", queryId: "q_release" },
              props: {
                ...defaultChartSpec("变更量与回滚趋势"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "week" },
                  { role: "y", field: "changes", agg: "sum" },
                  { role: "y2", field: "rollback", agg: "sum" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 8, gy: 0, gw: 4, h: 280 },
              data: { sourceId: "ds_release", queryId: "q_release" },
              props: {
                ...defaultChartSpec("发布成功率指针"),
                chartType: "gauge",
                bindings: [{ role: "value", field: "success_pct", agg: "avg" }]
              }
            },
            makeTextNode("行动项：对低稳定服务设置灰度阈值；发布前增加链路压测与自动回滚演练。")
          ])
        ]
      }
    })
  },
  {
    id: "report.ops.subchapter.multichart",
    docType: "report",
    name: "运维深度分析（子章节多图）",
    description: "通过 2.1/2.2/2.3 子章节组织多图表内容，适合结构化评审文档。",
    build: () => ({
      docId: prefixedId("report"),
      docType: "report",
      schemaVersion: "1.0.0",
      title: "运维深度分析（子章节多图）",
      locale: "zh-CN",
      themeId: "theme.business.light",
      dataSources: [
        {
          id: "ds_region_daily",
          type: "static",
          staticData: [
            { date: "2026-03-01", region: "East", availability_pct: 99.97, latency_ms: 22 },
            { date: "2026-03-02", region: "East", availability_pct: 99.96, latency_ms: 23 },
            { date: "2026-03-03", region: "East", availability_pct: 99.98, latency_ms: 21 },
            { date: "2026-03-04", region: "East", availability_pct: 99.97, latency_ms: 22 },
            { date: "2026-03-05", region: "East", availability_pct: 99.99, latency_ms: 20 },
            { date: "2026-03-01", region: "North", availability_pct: 99.95, latency_ms: 26 },
            { date: "2026-03-02", region: "North", availability_pct: 99.94, latency_ms: 27 },
            { date: "2026-03-03", region: "North", availability_pct: 99.95, latency_ms: 26 },
            { date: "2026-03-04", region: "North", availability_pct: 99.96, latency_ms: 25 },
            { date: "2026-03-05", region: "North", availability_pct: 99.95, latency_ms: 26 },
            { date: "2026-03-01", region: "South", availability_pct: 99.98, latency_ms: 20 },
            { date: "2026-03-02", region: "South", availability_pct: 99.97, latency_ms: 21 },
            { date: "2026-03-03", region: "South", availability_pct: 99.98, latency_ms: 20 },
            { date: "2026-03-04", region: "South", availability_pct: 99.99, latency_ms: 19 },
            { date: "2026-03-05", region: "South", availability_pct: 99.98, latency_ms: 20 }
          ]
        },
        {
          id: "ds_alarm_mix",
          type: "static",
          staticData: [
            { category: "链路抖动", count: 34 },
            { category: "设备过载", count: 26 },
            { category: "配置冲突", count: 19 },
            { category: "外部依赖", count: 14 }
          ]
        },
        {
          id: "ds_alarm_daily",
          type: "static",
          staticData: [
            { date: "2026-03-01", alarm_count: 61 },
            { date: "2026-03-02", alarm_count: 58 },
            { date: "2026-03-03", alarm_count: 54 },
            { date: "2026-03-04", alarm_count: 49 },
            { date: "2026-03-05", alarm_count: 44 },
            { date: "2026-03-06", alarm_count: 46 },
            { date: "2026-03-07", alarm_count: 41 }
          ]
        },
        {
          id: "ds_resolution_daily",
          type: "static",
          staticData: [
            { date: "2026-03-01", closed_cnt: 52, mttr_min: 44, sla_pct: 99.94, auto_fix_pct: 31 },
            { date: "2026-03-02", closed_cnt: 56, mttr_min: 41, sla_pct: 99.95, auto_fix_pct: 34 },
            { date: "2026-03-03", closed_cnt: 59, mttr_min: 38, sla_pct: 99.96, auto_fix_pct: 37 },
            { date: "2026-03-04", closed_cnt: 63, mttr_min: 35, sla_pct: 99.96, auto_fix_pct: 40 },
            { date: "2026-03-05", closed_cnt: 67, mttr_min: 33, sla_pct: 99.97, auto_fix_pct: 43 },
            { date: "2026-03-06", closed_cnt: 64, mttr_min: 34, sla_pct: 99.97, auto_fix_pct: 42 },
            { date: "2026-03-07", closed_cnt: 69, mttr_min: 31, sla_pct: 99.98, auto_fix_pct: 46 }
          ]
        }
      ],
      queries: [
        { queryId: "q_region_daily", sourceId: "ds_region_daily", kind: "static" },
        { queryId: "q_alarm_mix", sourceId: "ds_alarm_mix", kind: "static" },
        { queryId: "q_alarm_daily", sourceId: "ds_alarm_daily", kind: "static" },
        { queryId: "q_resolution_daily", sourceId: "ds_resolution_daily", kind: "static" }
      ],
      root: {
        id: "root",
        kind: "container",
        layout: { mode: "flow" },
        props: {
          reportTitle: "运维深度分析（子章节多图）",
          tocShow: true,
          coverEnabled: true,
          coverTitle: "子章节多图样例",
          coverSubtitle: "Subchapter Multi-Chart Demo",
          summaryEnabled: true,
          summaryTitle: "摘要",
          summaryText: "通过 2.1/2.2/2.3 编排多图内容，适配“问题拆解-验证-决策”阅读路径。",
          headerShow: true,
          headerText: "深度分析报告 · 内部",
          footerShow: true,
          footerText: "Visual Document OS",
          showPageNumber: true,
          pageSize: "A4"
        },
        children: [
          makeSection("2.1 区域健康分解", [
            makeTextNode("该子章节聚焦可用性与时延，先看趋势，再看区域均值。"),
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 1, gw: 7, h: 280 },
              data: { sourceId: "ds_region_daily", queryId: "q_region_daily" },
              props: {
                ...defaultChartSpec("区域时延趋势"),
                chartType: "line",
                bindings: [
                  { role: "x", field: "date" },
                  { role: "y", field: "latency_ms", agg: "avg" },
                  { role: "series", field: "region" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 7, gy: 1, gw: 5, h: 280 },
              data: { sourceId: "ds_region_daily", queryId: "q_region_daily" },
              props: {
                ...defaultChartSpec("区域可用性均值"),
                chartType: "bar",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "availability_pct", agg: "avg" }],
                labelShow: true
              }
            }
          ]),
          makeSection("2.2 告警结构与收敛", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 0, gw: 4, h: 250 },
              data: { sourceId: "ds_alarm_mix", queryId: "q_alarm_mix" },
              props: {
                ...defaultChartSpec("告警类型占比"),
                chartType: "pie",
                bindings: [{ role: "category", field: "category" }, { role: "value", field: "count", agg: "sum" }],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 4, gy: 0, gw: 8, h: 250 },
              data: { sourceId: "ds_alarm_daily", queryId: "q_alarm_daily" },
              props: {
                ...defaultChartSpec("告警量日趋势"),
                chartType: "line",
                bindings: [{ role: "x", field: "date" }, { role: "y", field: "alarm_count", agg: "sum" }]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 1, gw: 12, h: 260 },
              data: { sourceId: "ds_alarm_daily", queryId: "q_alarm_daily" },
              props: {
                ...defaultChartSpec("告警日历热力"),
                chartType: "calendar",
                bindings: [{ role: "x", field: "date" }, { role: "y", field: "alarm_count", agg: "sum" }]
              }
            }
          ]),
          makeSection("2.3 处置效率与SLA", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 0, gw: 8, h: 280 },
              data: { sourceId: "ds_resolution_daily", queryId: "q_resolution_daily" },
              props: {
                ...defaultChartSpec("关闭量与 MTTR"),
                chartType: "combo",
                bindings: [
                  { role: "x", field: "date" },
                  { role: "y", field: "closed_cnt", agg: "sum", axis: "primary" },
                  { role: "y2", field: "mttr_min", agg: "avg", axis: "secondary" }
                ],
                legendShow: true
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 8, gy: 0, gw: 4, h: 280 },
              data: { sourceId: "ds_resolution_daily", queryId: "q_resolution_daily" },
              props: {
                ...defaultChartSpec("自动化率 vs MTTR"),
                chartType: "scatter",
                bindings: [
                  { role: "x", field: "auto_fix_pct", agg: "avg" },
                  { role: "y", field: "mttr_min", agg: "avg" }
                ]
              }
            },
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "grid", gx: 0, gy: 1, gw: 6, h: 260 },
              data: { sourceId: "ds_resolution_daily", queryId: "q_resolution_daily" },
              props: {
                ...defaultChartSpec("SLA 指针"),
                chartType: "gauge",
                bindings: [{ role: "value", field: "sla_pct", agg: "avg" }]
              }
            },
            makeTextNode("结论：处置效率持续改善，建议继续提升自动化处置比例以压降 MTTR。")
          ])
        ]
      }
    })
  }
];


