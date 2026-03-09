import { defaultChartSpec } from "../../core/doc/defaults";
import type { ChartType, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import { buildChartNode } from "./chart-recommend";
import { findNodeById } from "./node-tree";
import {
  buildReportCanvasInsertNodePlan,
  type ReportCanvasPlan,
  type ReportSectionCanvasProjection
} from "./report-canvas";

export interface ReportInsertItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  badge: string;
  kind: "chart" | "table" | "text";
  chartType?: ChartType;
  tablePreset?: "basic" | "multi-header" | "pivot";
  textTemplate?: "title" | "body" | "note";
  defaultSpan: {
    gw: number;
    gh: number;
  };
}

export interface ReportInsertGroup {
  id: string;
  label: string;
  items: ReportInsertItem[];
}

export const REPORT_INSERT_MIME = "application/x-chatbi-report-insert";
let activeReportInsertItemId: string | null = null;

const REPORT_INSERT_LIBRARY: ReportInsertItem[] = [
  {
    id: "chart.line",
    label: "折线图",
    description: "趋势变化",
    icon: "∿",
    badge: "图表",
    kind: "chart",
    chartType: "line",
    defaultSpan: { gw: 7, gh: 4 }
  },
  {
    id: "chart.bar",
    label: "柱状图",
    description: "分类对比",
    icon: "▇",
    badge: "图表",
    kind: "chart",
    chartType: "bar",
    defaultSpan: { gw: 7, gh: 4 }
  },
  {
    id: "chart.pie",
    label: "饼图",
    description: "占比结构",
    icon: "◔",
    badge: "图表",
    kind: "chart",
    chartType: "pie",
    defaultSpan: { gw: 5, gh: 4 }
  },
  {
    id: "chart.combo",
    label: "组合图",
    description: "多指标对照",
    icon: "◫",
    badge: "图表",
    kind: "chart",
    chartType: "combo",
    defaultSpan: { gw: 8, gh: 4 }
  },
  {
    id: "table.basic",
    label: "基础表",
    description: "明细清单",
    icon: "▤",
    badge: "表格",
    kind: "table",
    tablePreset: "basic",
    defaultSpan: { gw: 6, gh: 4 }
  },
  {
    id: "table.multi-header",
    label: "多级表头",
    description: "分组字段",
    icon: "▥",
    badge: "表格",
    kind: "table",
    tablePreset: "multi-header",
    defaultSpan: { gw: 6, gh: 4 }
  },
  {
    id: "table.pivot",
    label: "透视表",
    description: "交叉汇总",
    icon: "◫",
    badge: "表格",
    kind: "table",
    tablePreset: "pivot",
    defaultSpan: { gw: 7, gh: 4 }
  },
  {
    id: "text.title",
    label: "标题文本",
    description: "强调结论标题",
    icon: "T",
    badge: "文本",
    kind: "text",
    textTemplate: "title",
    defaultSpan: { gw: 6, gh: 2 }
  },
  {
    id: "text.body",
    label: "正文文本",
    description: "补充说明",
    icon: "¶",
    badge: "文本",
    kind: "text",
    textTemplate: "body",
    defaultSpan: { gw: 5, gh: 4 }
  },
  {
    id: "text.note",
    label: "注释文本",
    description: "轻量备注",
    icon: "✎",
    badge: "文本",
    kind: "text",
    textTemplate: "note",
    defaultSpan: { gw: 4, gh: 3 }
  }
];

const resolveDefaultDataBinding = (doc: VDoc): VNode["data"] | undefined => {
  const source = doc.dataSources?.[0];
  if (!source?.id) {
    return undefined;
  }
  const queryId = doc.queries?.find((item) => item.sourceId === source.id)?.queryId;
  return {
    sourceId: source.id,
    queryId
  };
};

const buildTableSpecByPreset = (preset: NonNullable<ReportInsertItem["tablePreset"]>, doc: VDoc): TableSpec => {
  if (preset === "multi-header") {
    return {
      titleText: "多级表头",
      repeatHeader: true,
      zebra: true,
      columns: [
        { key: "region", title: "区域", width: 120 },
        { key: "owner", title: "负责人", width: 120 },
        { key: "current", title: "当前值", width: 120, align: "right" },
        { key: "target", title: "目标值", width: 120, align: "right" }
      ],
      rows: [
        { region: "华东", owner: "A组", current: 128, target: 132 },
        { region: "华南", owner: "B组", current: 96, target: 102 }
      ]
    };
  }
  if (preset === "pivot") {
    return {
      titleText: "透视汇总",
      repeatHeader: true,
      zebra: true,
      columns: [],
      pivot: {
        enabled: true,
        rowFields: ["region"],
        columnField: "service",
        valueField: "value",
        agg: "sum",
        fill: 0,
        valueTitle: "汇总值"
      }
    };
  }
  return {
    titleText: "基础表",
    repeatHeader: true,
    zebra: true,
    columns: [
      { key: "metric", title: "指标", width: 120 },
      { key: "current", title: "当前值", width: 120, align: "right" },
      { key: "trend", title: "趋势", width: 120 }
    ],
    rows: [
      { metric: "指标A", current: 128, trend: "上升" },
      { metric: "指标B", current: 92, trend: "稳定" }
    ]
  };
};

const buildReportInsertNode = (doc: VDoc, section: VNode, item: ReportInsertItem): VNode => {
  const binding = resolveDefaultDataBinding(doc);
  if (item.kind === "chart") {
    const chartNode = buildChartNode({
      doc,
      parent: section,
      chartType: item.chartType ?? "line",
      sourceId: binding?.sourceId,
      title: item.label
    });
    return {
      ...chartNode,
      props: {
        ...defaultChartSpec(item.label),
        ...(chartNode.props ?? {}),
        chartType: item.chartType ?? "line"
      },
      layout: {
        mode: "grid",
        gx: 0,
        gy: 0,
        gw: item.defaultSpan.gw,
        gh: item.defaultSpan.gh
      }
    };
  }
  if (item.kind === "table") {
    return {
      id: prefixedId("table"),
      kind: "table",
      name: item.label,
      data: binding,
      props: buildTableSpecByPreset(item.tablePreset ?? "basic", doc),
      layout: {
        mode: "grid",
        gx: 0,
        gy: 0,
        gw: item.defaultSpan.gw,
        gh: item.defaultSpan.gh
      }
    };
  }
  const textValue =
    item.textTemplate === "title"
      ? "请输入章节标题"
      : item.textTemplate === "note"
        ? "补充说明：填写备注或结论。"
        : "请输入文本内容";
  const textStyle =
    item.textTemplate === "title"
      ? { fontSize: 24, bold: true }
      : item.textTemplate === "note"
        ? { fontSize: 12, italic: true, fg: "#64748b" }
        : undefined;
  return {
    id: prefixedId("text"),
    kind: "text",
    name: item.label,
    props: {
      text: textValue,
      format: "plain"
    },
    style: textStyle,
    layout: {
      mode: "grid",
      gx: 0,
      gy: 0,
      gw: item.defaultSpan.gw,
      gh: item.defaultSpan.gh
    }
  };
};

export const getReportInsertItem = (itemId: string): ReportInsertItem | undefined =>
  REPORT_INSERT_LIBRARY.find((item) => item.id === itemId);

export const encodeReportInsertItem = (dataTransfer: DataTransfer, itemId: string): void => {
  activeReportInsertItemId = itemId;
  dataTransfer.setData(REPORT_INSERT_MIME, itemId);
  dataTransfer.setData("text/plain", itemId);
  dataTransfer.effectAllowed = "copy";
};

export const clearReportInsertItemDrag = (): void => {
  activeReportInsertItemId = null;
};

export const decodeReportInsertItem = (dataTransfer: DataTransfer | null | undefined): ReportInsertItem | undefined => {
  if (!dataTransfer) {
    return activeReportInsertItemId ? getReportInsertItem(activeReportInsertItemId) : undefined;
  }
  const itemId = dataTransfer.getData(REPORT_INSERT_MIME) || dataTransfer.getData("text/plain") || activeReportInsertItemId || "";
  return itemId ? getReportInsertItem(itemId) : undefined;
};

export const resolveReportInsertGroups = ({
  recentItemIds
}: {
  recentItemIds: string[];
}): ReportInsertGroup[] => {
  const recent = recentItemIds
    .map((itemId) => getReportInsertItem(itemId))
    .filter((item): item is ReportInsertItem => Boolean(item));
  const groups: ReportInsertGroup[] = [];
  if (recent.length > 0) {
    groups.push({
      id: "recent",
      label: "最近使用",
      items: recent
    });
  }
  groups.push(
    {
      id: "chart",
      label: "图表",
      items: REPORT_INSERT_LIBRARY.filter((item) => item.kind === "chart")
    },
    {
      id: "table",
      label: "表格",
      items: REPORT_INSERT_LIBRARY.filter((item) => item.kind === "table")
    },
    {
      id: "text",
      label: "文本",
      items: REPORT_INSERT_LIBRARY.filter((item) => item.kind === "text")
    }
  );
  return groups;
};

export const buildReportInsertItemPlan = ({
  doc,
  sectionId,
  item,
  point
}: {
  doc: VDoc;
  sectionId: string;
  item: ReportInsertItem;
  point?: {
    x: number;
    y: number;
  };
}): ReportCanvasPlan | null => {
  const section = findNodeById(doc.root, sectionId);
  if (!section || section.kind !== "section") {
    return null;
  }
  const node = buildReportInsertNode(doc, section, item);
  return buildReportCanvasInsertNodePlan(
    doc,
    sectionId,
    node,
    {
      point,
      gw: item.defaultSpan.gw,
      gh: item.defaultSpan.gh
    }
  );
};

export const resolveReportInsertPreviewRect = (
  projection: ReportSectionCanvasProjection,
  item: ReportInsertItem,
  point: { x: number; y: number }
): { left: number; top: number; width: number; height: number } => {
  const contentWidth = projection.config.widthPx - projection.config.paddingPx * 2;
  const colWidth = (contentWidth - projection.config.gridGapPx * (projection.config.cols - 1)) / projection.config.cols;
  const width = Math.max(96, item.defaultSpan.gw * colWidth + Math.max(0, item.defaultSpan.gw - 1) * projection.config.gridGapPx);
  const height = Math.max(projection.config.rowUnitPx, item.defaultSpan.gh * projection.config.rowUnitPx);
  const left = Math.max(0, Math.min(projection.config.widthPx - width, point.x - width / 2));
  const top = Math.max(0, Math.min(Math.max(projection.config.pageHeightPx - height, 0), point.y - height / 2));
  return {
    left,
    top,
    width,
    height
  };
};
