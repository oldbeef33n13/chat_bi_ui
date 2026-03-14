import { prefixedId } from "../../utils/id";
import { createPptDoc, defaultChartSpec } from "../defaults";
import type { BuiltInDocExample } from "./shared";
import { makeSlide } from "./shared";
export const pptExamples: BuiltInDocExample[] = [
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
  },
  {
    id: "ppt.ops.table.story",
    docType: "ppt",
    name: "运维汇报（图表+表格）",
    description: "覆盖封面、趋势、工单明细、班次矩阵与行动页的综合演示模板。",
    build: () => ({
      docId: prefixedId("deck"),
      docType: "ppt",
      schemaVersion: "1.0.0",
      title: "运维汇报（图表+表格）",
      locale: "zh-CN",
      themeId: "theme.tech.light",
      dataSources: [
        {
          id: "ds_kpi",
          type: "static",
          staticData: [
            { week: "W1", qps: 1880, err_qps: 63 },
            { week: "W2", qps: 1975, err_qps: 56 },
            { week: "W3", qps: 2050, err_qps: 50 },
            { week: "W4", qps: 2140, err_qps: 45 }
          ]
        },
        {
          id: "ds_region_table",
          type: "static",
          staticData: [
            { region: "East", owner: "张雷", p1: 2, p2: 9, mttr_min: 34, sla_pct: 99.97 },
            { region: "North", owner: "刘宁", p1: 3, p2: 12, mttr_min: 41, sla_pct: 99.95 },
            { region: "South", owner: "王晨", p1: 1, p2: 7, mttr_min: 29, sla_pct: 99.98 },
            { region: "West", owner: "陈博", p1: 2, p2: 10, mttr_min: 37, sla_pct: 99.96 }
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
          id: "ds_alarm_type",
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
        { queryId: "q_kpi", sourceId: "ds_kpi", kind: "static" },
        { queryId: "q_region_table", sourceId: "ds_region_table", kind: "static" },
        { queryId: "q_shift", sourceId: "ds_shift", kind: "static" },
        { queryId: "q_alarm_type", sourceId: "ds_alarm_type", kind: "static" }
      ],
      root: {
        id: "root",
        kind: "container",
        props: { size: "16:9", defaultBg: "#ffffff" },
        children: [
          makeSlide("封面", [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 78, y: 160, w: 800, h: 88, z: 2 },
              props: { text: "运维运营汇报（图表+表格）", format: "plain" },
              style: { fontSize: 40, bold: true }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 78, y: 255, w: 800, h: 52, z: 2 },
              props: { text: "Operations Weekly Review · Internal", format: "plain" },
              style: { fontSize: 20 }
            }
          ]),
          makeSlide("趋势与结论", [
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 36, y: 92, w: 430, h: 270, z: 1 },
              data: { sourceId: "ds_kpi", queryId: "q_kpi" },
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
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 492, y: 92, w: 430, h: 270, z: 1 },
              props: {
                text: "结论：\n- QPS 连续四周增长，业务负载可控。\n- 错误QPS下降明显，说明治理策略生效。\n- 建议继续优化晚高峰链路冗余与值班策略。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
            }
          ]),
          makeSlide("区域工单明细（表格 + 图表）", [
            {
              id: prefixedId("table"),
              kind: "table",
              layout: { mode: "absolute", x: 30, y: 86, w: 620, h: 390, z: 1 },
              data: { sourceId: "ds_region_table", queryId: "q_region_table" },
              props: {
                titleText: "区域工单质量明细",
                repeatHeader: true,
                zebra: true,
                columns: [
                  { key: "region", title: "区域", width: 80 },
                  { key: "owner", title: "负责人", width: 92 },
                  { key: "p1", title: "P1", width: 60, align: "right", format: "int" },
                  { key: "p2", title: "P2", width: 60, align: "right", format: "int" },
                  { key: "mttr_min", title: "MTTR(min)", width: 100, align: "right", format: "int" },
                  { key: "sla_pct", title: "SLA(%)", width: 80, align: "right", format: "pct" }
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
              layout: { mode: "absolute", x: 664, y: 86, w: 260, h: 390, z: 1 },
              data: { sourceId: "ds_region_table", queryId: "q_region_table" },
              props: {
                ...defaultChartSpec("区域 MTTR"),
                chartType: "bar",
                bindings: [{ role: "x", field: "region" }, { role: "y", field: "mttr_min", agg: "avg" }],
                labelShow: true
              }
            }
          ]),
          makeSlide("班次矩阵与行动", [
            {
              id: prefixedId("table"),
              kind: "table",
              layout: { mode: "absolute", x: 36, y: 92, w: 560, h: 360, z: 1 },
              data: { sourceId: "ds_shift", queryId: "q_shift" },
              props: {
                titleText: "班次关闭工单矩阵",
                repeatHeader: true,
                zebra: true,
                columns: [{ key: "team", title: "团队", width: 120 }],
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
            {
              id: prefixedId("chart"),
              kind: "chart",
              layout: { mode: "absolute", x: 612, y: 92, w: 312, h: 220, z: 1 },
              data: { sourceId: "ds_alarm_type", queryId: "q_alarm_type" },
              props: {
                ...defaultChartSpec("告警类型占比"),
                chartType: "pie",
                bindings: [{ role: "category", field: "category" }, { role: "value", field: "count", agg: "sum" }]
              }
            },
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 612, y: 324, w: 312, h: 128, z: 1 },
              props: {
                text: "行动建议：\n1) 晚班补强 SRE 值守。\n2) 提前 1 小时做变更风控检查。\n3) 对“链路抖动”建立专项巡检计划。",
                format: "plain"
              },
              style: { bg: "#f8fbff", pad: 10, borderW: 1, borderC: "#dbeafe", radius: 8 }
            }
          ])
        ]
      }
    })
  }
];


