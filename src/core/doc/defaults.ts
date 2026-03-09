import { prefixedId } from "../utils/id";
import type { ChartSpec, DashboardPreset, DocType, VDoc, VNode } from "./types";

const makeId = (prefix: string): string => prefixedId(prefix);

export const defaultChartSpec = (title: string): ChartSpec => ({
  chartType: "line",
  titleText: title,
  bindings: [
    { role: "x", field: "day", timeGrain: "day" },
    { role: "y", field: "alarm_count", agg: "sum", unit: "count" }
  ],
  smooth: true,
  legendShow: false,
  tooltipShow: true
});

const mkChartNode = (title: string, gx: number, gy: number): VNode<ChartSpec> => ({
  id: makeId("chart"),
  kind: "chart",
  name: title,
  layout: { mode: "grid", gx, gy, gw: 6, gh: 6 },
  data: {
    sourceId: "ds_alarm",
    queryId: "q_alarm_trend",
    filterRefs: ["f_time"]
  },
  props: defaultChartSpec(title)
});

const buildDashboardRootProps = (preset: DashboardPreset) => {
  if (preset === "workbench") {
    return {
      dashTitle: "网络运维工作台",
      displayMode: "scroll_page" as const,
      designWidthPx: 1440,
      designHeightPx: 960,
      pageWidthPx: 1280,
      pageMarginPx: 24,
      gridCols: 12,
      rowH: 44,
      gap: 16,
      showFilterBar: true,
      headerShow: true,
      headerText: "网络运维工作台",
      footerShow: false,
      footerText: "Visual Document OS"
    };
  }
  return {
    dashTitle: "网络运维总览",
    displayMode: "fit_screen" as const,
    designWidthPx: 1920,
    designHeightPx: 1080,
    pageWidthPx: 1280,
    pageMarginPx: 28,
    gridCols: 12,
    rowH: 56,
    gap: 16,
    showFilterBar: true,
    headerShow: true,
    headerText: "网络运维总览",
    footerShow: false,
    footerText: "Visual Document OS"
  };
};

export const createDashboardDoc = (preset: DashboardPreset = "wallboard"): VDoc => ({
  docId: makeId("dash"),
  docType: "dashboard",
  schemaVersion: "1.0.0",
  title: preset === "workbench" ? "网络运维工作台" : "网络运维总览",
  locale: "zh-CN",
  themeId: preset === "workbench" ? "theme.tech.light" : "theme.tech.dark",
  dataSources: [
    {
      id: "ds_alarm",
      type: "static",
      staticData: [
        { day: "Mon", alarm_count: 34, region: "East" },
        { day: "Tue", alarm_count: 23, region: "East" },
        { day: "Wed", alarm_count: 27, region: "West" },
        { day: "Thu", alarm_count: 18, region: "North" },
        { day: "Fri", alarm_count: 30, region: "South" },
        { day: "Sat", alarm_count: 11, region: "South" },
        { day: "Sun", alarm_count: 19, region: "East" }
      ]
    }
  ],
  queries: [{ queryId: "q_alarm_trend", sourceId: "ds_alarm", kind: "static" }],
  filters: [
    {
      filterId: "f_time",
      type: "timeRange",
      title: "时间范围",
      bindParam: "timeRange",
      scope: "global",
      defaultValue: "last_7d"
    }
  ],
  root: {
    id: "root",
    kind: "container",
    name: "Dashboard Root",
    layout: { mode: "grid" },
    props: buildDashboardRootProps(preset),
    children: [mkChartNode("告警趋势", 0, 0), mkChartNode("丢包趋势", 6, 0)]
  }
});

export const createReportDoc = (): VDoc => ({
  docId: makeId("report"),
  docType: "report",
  schemaVersion: "1.0.0",
  title: "网络周报",
  locale: "zh-CN",
  themeId: "theme.business.light",
  root: {
    id: "root",
    kind: "container",
    layout: { mode: "flow" },
    props: {
      reportTitle: "网络周报",
      tocShow: true,
      headerShow: true,
      footerShow: true,
      pageSize: "A4",
      paginationStrategy: "section",
      marginPreset: "normal",
      marginTopMm: 14,
      marginRightMm: 14,
      marginBottomMm: 14,
      marginLeftMm: 14,
      coverEnabled: true,
      coverTitle: "网络周报",
      coverSubtitle: "Network Weekly Operations Report",
      coverNote: "生成时间：自动",
      summaryEnabled: true,
      summaryTitle: "执行摘要",
      summaryText: "本周告警整体下降 12%，核心链路抖动稳定，建议持续关注华北骨干容量。",
      headerText: "网络周报 · 内部资料",
      footerText: "Visual Document OS",
      showPageNumber: true,
      bodyPaddingPx: 12,
      sectionGapPx: 12,
      blockGapPx: 8
    },
    children: [
      {
        id: makeId("section"),
        kind: "section",
        props: { title: "1. 总览" },
        children: [
          {
            id: makeId("text"),
            kind: "text",
            props: { text: "本周告警整体下降 12%，骨干网抖动稳定。", format: "plain" }
          },
          {
            id: makeId("chart"),
            kind: "chart",
            props: defaultChartSpec("本周告警趋势"),
            data: { sourceId: "ds_alarm" }
          }
        ]
      },
      {
        id: makeId("section"),
        kind: "section",
        props: { title: "2. 异常与处置" },
        children: [
          {
            id: makeId("text"),
            kind: "text",
            props: { text: "华北骨干链路在周三出现瞬时抖动，已完成扩容。", format: "plain" }
          }
        ]
      }
    ]
  }
});

export const createPptDoc = (): VDoc => ({
  docId: makeId("deck"),
  docType: "ppt",
  schemaVersion: "1.0.0",
  title: "网络运营汇报",
  locale: "zh-CN",
  themeId: "theme.tech.light",
  root: {
    id: "root",
    kind: "container",
    props: {
      size: "16:9",
      defaultBg: "#ffffff",
      masterShowHeader: true,
      masterHeaderText: "网络运营汇报",
      masterShowFooter: true,
      masterFooterText: "Visual Document OS",
      masterShowSlideNumber: true,
      masterAccentColor: "#1d4ed8",
      masterPaddingXPx: 24,
      masterHeaderTopPx: 12,
      masterHeaderHeightPx: 26,
      masterFooterBottomPx: 10,
      masterFooterHeightPx: 22
    },
    children: [
      {
        id: makeId("slide"),
        kind: "slide",
        props: { title: "总览", layoutTemplateId: "title-double-summary" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: [
          {
            id: makeId("text"),
            kind: "text",
            layout: { mode: "absolute", x: 36, y: 26, w: 320, h: 48, z: 1 },
            props: { text: "网络运营总览", format: "plain" },
            style: { fontSize: 28, bold: true }
          },
          {
            id: makeId("chart"),
            kind: "chart",
            layout: { mode: "absolute", x: 36, y: 94, w: 430, h: 260, z: 1 },
            props: defaultChartSpec("告警趋势")
          },
          {
            id: makeId("text"),
            kind: "text",
            layout: { mode: "absolute", x: 500, y: 94, w: 420, h: 260, z: 1 },
            props: { text: "关键结论：\n1) 告警下降\n2) 延迟稳定\n3) 需补强华北冗余", format: "plain" },
            style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 8 }
          }
        ]
      }
    ]
  }
});

export const createDefaultDoc = (docType: DocType): VDoc => {
  switch (docType) {
    case "dashboard":
      return createDashboardDoc();
    case "report":
      return createReportDoc();
    case "ppt":
      return createPptDoc();
    case "chart":
      return createDashboardDoc();
    default:
      return createDashboardDoc();
  }
};
