import type { ChartSpec, ChartType, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import { buildChartNode, extractSourceFields } from "./chart-recommend";
import { recommendDashboardCardLayout, recommendDashboardCardLayoutAtPoint } from "./dashboard-arrange";
import { resolveDashboardNodeRect, resolveNextFloatingRect, type DashboardRect, type DashboardSurfaceMetrics } from "./dashboard-surface";

export type DashboardInsertKind = "chart" | "table" | "text" | "image";
export type DashboardTablePreset = "basic" | "multi-header" | "pivot";
export type DashboardTextTemplate = "title" | "body" | "note";
export type DashboardInsertPlacement = "card" | "floating" | "upload";

export interface DashboardInsertItem {
  id: string;
  kind: DashboardInsertKind;
  label: string;
  description: string;
  groupId: "chart" | "table" | "text" | "media";
  icon: string;
  placement: DashboardInsertPlacement;
  chartType?: ChartType;
  tablePreset?: DashboardTablePreset;
  textTemplate?: DashboardTextTemplate;
  cardSize?: { gw: number; gh: number };
  absoluteSize?: { width: number; height: number };
}

export interface DashboardInsertGroup {
  id: string;
  label: string;
  items: DashboardInsertItem[];
}

export const DASHBOARD_INSERT_MIME = "application/x-chatbi-dashboard-insert";
let activeDashboardInsertItemId: string | null = null;

const chartItems: DashboardInsertItem[] = [
  { id: "chart.line", kind: "chart", label: "折线图", description: "趋势变化", groupId: "chart", icon: "∿", placement: "card", chartType: "line", cardSize: { gw: 6, gh: 6 } },
  { id: "chart.bar", kind: "chart", label: "柱状图", description: "分类对比", groupId: "chart", icon: "▇", placement: "card", chartType: "bar", cardSize: { gw: 6, gh: 6 } },
  { id: "chart.pie", kind: "chart", label: "饼图", description: "占比结构", groupId: "chart", icon: "◔", placement: "card", chartType: "pie", cardSize: { gw: 4, gh: 6 } },
  { id: "chart.combo", kind: "chart", label: "组合图", description: "双指标对照", groupId: "chart", icon: "◫", placement: "card", chartType: "combo", cardSize: { gw: 8, gh: 6 } },
  { id: "chart.scatter", kind: "chart", label: "散点图", description: "相关分布", groupId: "chart", icon: "⋰", placement: "card", chartType: "scatter", cardSize: { gw: 6, gh: 6 } },
  { id: "chart.gauge", kind: "chart", label: "仪表盘", description: "KPI 达成", groupId: "chart", icon: "◠", placement: "card", chartType: "gauge", cardSize: { gw: 4, gh: 4 } }
];

const tableItems: DashboardInsertItem[] = [
  { id: "table.basic", kind: "table", label: "基础表", description: "明细清单", groupId: "table", icon: "▤", placement: "card", tablePreset: "basic", cardSize: { gw: 6, gh: 5 } },
  { id: "table.multi-header", kind: "table", label: "多级表头", description: "分组字段", groupId: "table", icon: "▥", placement: "card", tablePreset: "multi-header", cardSize: { gw: 8, gh: 6 } },
  { id: "table.pivot", kind: "table", label: "透视表", description: "交叉汇总", groupId: "table", icon: "◫", placement: "card", tablePreset: "pivot", cardSize: { gw: 8, gh: 6 } }
];

const textItems: DashboardInsertItem[] = [
  { id: "text.title", kind: "text", label: "标题", description: "章节标题", groupId: "text", icon: "T", placement: "card", textTemplate: "title", cardSize: { gw: 4, gh: 3 } },
  { id: "text.body", kind: "text", label: "文本", description: "说明内容", groupId: "text", icon: "¶", placement: "card", textTemplate: "body", cardSize: { gw: 4, gh: 4 } },
  { id: "text.note", kind: "text", label: "注释", description: "补充说明", groupId: "text", icon: "※", placement: "floating", textTemplate: "note", absoluteSize: { width: 260, height: 96 } }
];

const mediaItems: DashboardInsertItem[] = [
  { id: "media.image", kind: "image", label: "图片", description: "上传后插入", groupId: "media", icon: "▣", placement: "upload", absoluteSize: { width: 360, height: 220 } }
];

export const dashboardInsertGroups: DashboardInsertGroup[] = [
  { id: "chart", label: "图表", items: chartItems },
  { id: "table", label: "表格", items: tableItems },
  { id: "text", label: "文本", items: textItems },
  { id: "media", label: "媒体", items: mediaItems }
];

const dashboardInsertItemMap = new Map(dashboardInsertGroups.flatMap((group) => group.items.map((item) => [item.id, item])));

const pushDashboardInsertItemId = (itemIds: string[], itemId: string | undefined, blockedIds = new Set<string>()): void => {
  if (!itemId || blockedIds.has(itemId) || itemIds.includes(itemId) || !dashboardInsertItemMap.has(itemId)) {
    return;
  }
  itemIds.push(itemId);
};

export const getDashboardInsertItem = (itemId: string): DashboardInsertItem | undefined => dashboardInsertItemMap.get(itemId);

export const resolveDashboardRecentInsertItems = (recentItemIds: string[], limit = 4): DashboardInsertItem[] =>
  [...new Set(recentItemIds)]
    .map((itemId) => getDashboardInsertItem(itemId))
    .filter((item): item is DashboardInsertItem => Boolean(item))
    .slice(0, limit);

export const resolveDashboardRecommendedItems = ({
  doc,
  recentItemIds = [],
  limit = 4
}: {
  doc: VDoc;
  recentItemIds?: string[];
  limit?: number;
}): DashboardInsertItem[] => {
  const rootProps = (doc.root.props ?? {}) as Record<string, unknown>;
  const displayMode = rootProps.displayMode === "fit_screen" ? "fit_screen" : "scroll_page";
  const nodes = doc.root.children ?? [];
  const chartNodes = nodes.filter((node) => node.kind === "chart");
  const tableNodes = nodes.filter((node) => node.kind === "table");
  const textNodes = nodes.filter((node) => node.kind === "text");
  const imageNodes = nodes.filter((node) => node.kind === "image");
  const hasFloatingNode = nodes.some((node) => node.layout?.mode === "absolute");
  const usedChartTypes = new Set(
    chartNodes
      .map((node) => String((node.props as ChartSpec | undefined)?.chartType ?? ""))
      .filter(Boolean)
  );
  const hasTitleText = textNodes.some((node) => {
    const text = String((node.props as Record<string, unknown> | undefined)?.text ?? "");
    const fontSize = Number(node.style?.fontSize ?? 0);
    return fontSize >= 20 || /标题|总览|概览|工作台|看板/.test(text);
  });
  const blockedIds = new Set(recentItemIds);
  const itemIds: string[] = [];

  if (!hasTitleText) {
    pushDashboardInsertItemId(itemIds, "text.title", blockedIds);
  }
  if (chartNodes.length === 0) {
    pushDashboardInsertItemId(itemIds, displayMode === "fit_screen" ? "chart.bar" : "chart.line", blockedIds);
  }
  if (tableNodes.length === 0) {
    pushDashboardInsertItemId(itemIds, "table.basic", blockedIds);
  }
  if (imageNodes.length === 0 && displayMode === "fit_screen") {
    pushDashboardInsertItemId(itemIds, "media.image", blockedIds);
  }
  if (displayMode === "fit_screen" && !usedChartTypes.has("gauge")) {
    pushDashboardInsertItemId(itemIds, "chart.gauge", blockedIds);
  }
  if (displayMode === "scroll_page" && !usedChartTypes.has("combo")) {
    pushDashboardInsertItemId(itemIds, "chart.combo", blockedIds);
  }
  if (!hasFloatingNode) {
    pushDashboardInsertItemId(itemIds, displayMode === "fit_screen" ? "media.image" : "text.note", blockedIds);
  }

  const fallbackItemIds =
    displayMode === "fit_screen"
      ? ["chart.bar", "chart.line", "chart.gauge", "table.basic", "media.image", "text.note"]
      : ["text.title", "chart.line", "table.basic", "chart.bar", "chart.combo", "text.body", "media.image"];
  fallbackItemIds.forEach((itemId) => pushDashboardInsertItemId(itemIds, itemId, blockedIds));

  return itemIds
    .slice(0, limit)
    .map((itemId) => getDashboardInsertItem(itemId))
    .filter((item): item is DashboardInsertItem => Boolean(item));
};

export const resolveDashboardInsertGroups = ({
  doc,
  recentItemIds = []
}: {
  doc: VDoc;
  recentItemIds?: string[];
}): DashboardInsertGroup[] => {
  const groups: DashboardInsertGroup[] = [];
  const recentItems = resolveDashboardRecentInsertItems(recentItemIds);
  const recommendedItems = resolveDashboardRecommendedItems({
    doc,
    recentItemIds: recentItems.map((item) => item.id)
  });
  if (recentItems.length > 0) {
    groups.push({ id: "recent", label: "最近使用", items: recentItems });
  }
  if (recommendedItems.length > 0) {
    groups.push({ id: "recommended", label: "推荐组件", items: recommendedItems });
  }
  return [...groups, ...dashboardInsertGroups];
};

export const encodeDashboardInsertItem = (dataTransfer: DataTransfer, itemId: string): void => {
  activeDashboardInsertItemId = itemId;
  dataTransfer.setData(DASHBOARD_INSERT_MIME, itemId);
  dataTransfer.setData("text/plain", itemId);
  dataTransfer.effectAllowed = "copy";
};

export const clearDashboardInsertItemDrag = (): void => {
  activeDashboardInsertItemId = null;
};

export const decodeDashboardInsertItem = (dataTransfer: DataTransfer | null | undefined): DashboardInsertItem | undefined => {
  if (!dataTransfer) {
    return activeDashboardInsertItemId ? getDashboardInsertItem(activeDashboardInsertItemId) : undefined;
  }
  const itemId = dataTransfer.getData(DASHBOARD_INSERT_MIME) || dataTransfer.getData("text/plain") || activeDashboardInsertItemId || "";
  return itemId ? getDashboardInsertItem(itemId) : undefined;
};

const buildTableSpecByPreset = (doc: VDoc, preset: DashboardTablePreset, sourceId?: string): TableSpec => {
  if (preset === "multi-header") {
    return {
      titleText: "多级表头",
      repeatHeader: true,
      zebra: true,
      columns: [
        { key: "region", title: "区域" },
        { key: "qoq", title: "环比" },
        { key: "yoy", title: "同比" },
        { key: "latency", title: "时延(ms)" },
        { key: "availability", title: "可用性(%)" }
      ],
      headerRows: [
        [
          { text: "维度", colSpan: 1, rowSpan: 2, align: "center" },
          { text: "趋势", colSpan: 2, align: "center" },
          { text: "质量", colSpan: 2, align: "center" }
        ],
        [
          { text: "环比", align: "center" },
          { text: "同比", align: "center" },
          { text: "时延", align: "center" },
          { text: "可用性", align: "center" }
        ]
      ],
      mergeCells: [{ row: 0, col: 0, rowSpan: 2, colSpan: 1, scope: "header" }]
    };
  }
  if (preset === "pivot") {
    const source = doc.dataSources?.find((item) => item.id === sourceId);
    const fields = extractSourceFields(source);
    const rowField = fields.find((field) => field.type === "string" || field.type === "time")?.name ?? "region";
    const colField = fields.find((field) => field.name !== rowField && (field.type === "string" || field.type === "time"))?.name ?? "service";
    const valueField = fields.find((field) => field.type === "number")?.name ?? "value";
    return {
      titleText: "透视汇总",
      repeatHeader: true,
      zebra: true,
      columns: [],
      pivot: {
        enabled: true,
        rowFields: [rowField],
        columnField: colField,
        valueField,
        agg: "sum",
        fill: 0,
        valueTitle: "汇总值"
      }
    };
  }
  return { titleText: "基础表", columns: [], repeatHeader: true, zebra: true };
};

const resolveFloatingRect = (
  root: VNode,
  metrics: DashboardSurfaceMetrics,
  point: { x: number; y: number } | undefined,
  size: { width: number; height: number }
): DashboardRect => {
  const width = Math.max(180, Math.round(size.width));
  const height = Math.max(96, Math.round(size.height));
  if (!point) {
    return resolveNextFloatingRect(root.children ?? [], metrics, width, height);
  }
  const minLeft = metrics.pageMarginPx;
  const minTop = metrics.pageMarginPx;
  const maxLeft = Math.max(minLeft, metrics.canvasWidth - metrics.pageMarginPx - width);
  const maxTop = Math.max(minTop, metrics.canvasHeight - metrics.pageMarginPx - height);
  return {
    left: Math.round(Math.max(minLeft, Math.min(maxLeft, point.x - width / 2))),
    top: Math.round(Math.max(minTop, Math.min(maxTop, point.y - height / 2))),
    width,
    height
  };
};

export const resolveDashboardInsertPlacement = ({
  root,
  metrics,
  item,
  point
}: {
  root: VNode;
  metrics: DashboardSurfaceMetrics;
  item: DashboardInsertItem;
  point?: { x: number; y: number };
}): { layout: NonNullable<VNode["layout"]>; rect: DashboardRect } => {
  if (item.placement === "floating") {
    const rect = resolveFloatingRect(root, metrics, point, item.absoluteSize ?? { width: 320, height: 140 });
    return {
      layout: {
        mode: "absolute",
        x: rect.left,
        y: rect.top,
        w: rect.width,
        h: rect.height,
        z: 1
      },
      rect
    };
  }

  const size = item.cardSize ?? { gw: 6, gh: 6 };
  const layout =
    point
      ? recommendDashboardCardLayoutAtPoint(root, metrics, point, size)
      : recommendDashboardCardLayout(root, size, metrics.gridCols);
  const rect = resolveDashboardNodeRect(
    {
      id: "__dashboard_insert_preview__",
      kind: "container",
      layout
    },
    metrics
  );
  return { layout, rect };
};

export const buildDashboardInsertNode = ({
  doc,
  root,
  metrics,
  item,
  point
}: {
  doc: VDoc;
  root: VNode;
  metrics: DashboardSurfaceMetrics;
  item: DashboardInsertItem;
  point?: { x: number; y: number };
}): VNode | null => {
  if (item.kind === "image") {
    return null;
  }
  const fallbackSourceId = doc.dataSources?.[0]?.id;
  const fallbackQueryId = doc.queries?.find((query) => query.sourceId === fallbackSourceId)?.queryId;
  const placement = resolveDashboardInsertPlacement({ root, metrics, item, point });

  if (item.kind === "chart") {
    const node = buildChartNode({
      doc,
      parent: root,
      chartType: item.chartType ?? "line",
      sourceId: fallbackSourceId,
      title: item.label
    });
    node.layout = placement.layout;
    return node;
  }

  if (item.kind === "table") {
    return {
      id: prefixedId("table"),
      kind: "table",
      name: item.label,
      props: buildTableSpecByPreset(doc, item.tablePreset ?? "basic", fallbackSourceId),
      data: fallbackSourceId ? { sourceId: fallbackSourceId, queryId: fallbackQueryId } : undefined,
      layout: placement.layout
    };
  }

  const template = item.textTemplate ?? "body";
  const text = template === "title" ? "请输入标题" : template === "note" ? "注释：补充说明" : "请输入文本";
  const style =
    template === "title"
      ? { fontSize: 24, bold: true }
      : template === "note"
        ? { fontSize: 12, italic: true, fg: "#64748b" }
        : undefined;
  return {
    id: prefixedId("text"),
    kind: "text",
    name: item.label,
    props: { text, format: "plain" },
    style,
    layout: placement.layout
  };
};
