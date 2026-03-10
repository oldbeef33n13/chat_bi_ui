import type { ChartType, ImageProps, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import { buildChartNode, extractSourceFields } from "./chart-recommend";
import { buildImageNode } from "./image-assets";

export type PptInsertKind = "chart" | "table" | "text" | "image";
export type PptTablePreset = "basic" | "multi-header" | "pivot";
export type PptTextTemplate = "title" | "body" | "note";

export interface PptInsertItem {
  id: string;
  kind: PptInsertKind;
  label: string;
  description: string;
  groupId: "chart" | "table" | "text" | "media";
  icon: string;
  badge: string;
  chartType?: ChartType;
  tablePreset?: PptTablePreset;
  textTemplate?: PptTextTemplate;
  size: { w: number; h: number };
}

export interface PptInsertGroup {
  id: string;
  label: string;
  items: PptInsertItem[];
}

const slideWidth = 960;
const slideHeight = 540;
const slidePad = 20;

export const PPT_INSERT_MIME = "application/x-chatbi-ppt-insert";
let activePptInsertItemId: string | null = null;

const chartItems: PptInsertItem[] = [
  { id: "chart.line", kind: "chart", label: "折线图", description: "趋势变化", groupId: "chart", icon: "∿", badge: "画布元素", chartType: "line", size: { w: 430, h: 260 } },
  { id: "chart.bar", kind: "chart", label: "柱状图", description: "分类对比", groupId: "chart", icon: "▇", badge: "画布元素", chartType: "bar", size: { w: 430, h: 260 } },
  { id: "chart.pie", kind: "chart", label: "饼图", description: "占比结构", groupId: "chart", icon: "◔", badge: "画布元素", chartType: "pie", size: { w: 320, h: 240 } },
  { id: "chart.combo", kind: "chart", label: "组合图", description: "双指标对照", groupId: "chart", icon: "◫", badge: "画布元素", chartType: "combo", size: { w: 460, h: 260 } }
];

const tableItems: PptInsertItem[] = [
  { id: "table.basic", kind: "table", label: "基础表", description: "明细清单", groupId: "table", icon: "▤", badge: "画布元素", tablePreset: "basic", size: { w: 360, h: 220 } },
  { id: "table.multi-header", kind: "table", label: "多级表头", description: "分组字段", groupId: "table", icon: "▥", badge: "画布元素", tablePreset: "multi-header", size: { w: 420, h: 240 } },
  { id: "table.pivot", kind: "table", label: "透视表", description: "交叉汇总", groupId: "table", icon: "◫", badge: "画布元素", tablePreset: "pivot", size: { w: 420, h: 240 } }
];

const textItems: PptInsertItem[] = [
  { id: "text.title", kind: "text", label: "标题", description: "页面标题", groupId: "text", icon: "T", badge: "画布元素", textTemplate: "title", size: { w: 360, h: 72 } },
  { id: "text.body", kind: "text", label: "文本", description: "说明内容", groupId: "text", icon: "¶", badge: "画布元素", textTemplate: "body", size: { w: 360, h: 180 } },
  { id: "text.note", kind: "text", label: "注释", description: "补充备注", groupId: "text", icon: "※", badge: "画布元素", textTemplate: "note", size: { w: 260, h: 96 } }
];

const mediaItems: PptInsertItem[] = [
  { id: "media.image", kind: "image", label: "图片", description: "上传后插入", groupId: "media", icon: "▣", badge: "上传后插入", size: { w: 360, h: 220 } }
];

export const pptInsertGroups: PptInsertGroup[] = [
  { id: "chart", label: "图表", items: chartItems },
  { id: "table", label: "表格", items: tableItems },
  { id: "text", label: "文本", items: textItems },
  { id: "media", label: "媒体", items: mediaItems }
];

const pptInsertItemMap = new Map(pptInsertGroups.flatMap((group) => group.items.map((item) => [item.id, item])));

export const getPptInsertItem = (itemId: string): PptInsertItem | undefined => pptInsertItemMap.get(itemId);

export const encodePptInsertItem = (dataTransfer: DataTransfer, itemId: string): void => {
  activePptInsertItemId = itemId;
  dataTransfer.setData(PPT_INSERT_MIME, itemId);
  dataTransfer.setData("text/plain", itemId);
  dataTransfer.effectAllowed = "copy";
};

export const clearPptInsertItemDrag = (): void => {
  activePptInsertItemId = null;
};

export const decodePptInsertItem = (dataTransfer: DataTransfer | null | undefined): PptInsertItem | undefined => {
  if (!dataTransfer) {
    return activePptInsertItemId ? getPptInsertItem(activePptInsertItemId) : undefined;
  }
  const itemId = dataTransfer.getData(PPT_INSERT_MIME) || dataTransfer.getData("text/plain") || activePptInsertItemId || "";
  return itemId ? getPptInsertItem(itemId) : undefined;
};

const buildTableSpecByPreset = (doc: VDoc, preset: PptTablePreset, sourceId?: string): TableSpec => {
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

const clampRect = (x: number, y: number, w: number, h: number) => ({
  x: Math.round(Math.max(slidePad, Math.min(slideWidth - slidePad - w, x))),
  y: Math.round(Math.max(slidePad, Math.min(slideHeight - slidePad - h, y))),
  w: Math.round(w),
  h: Math.round(h)
});

export const resolvePptInsertRect = ({
  slide,
  item,
  point
}: {
  slide?: VNode;
  item: PptInsertItem;
  point?: { x: number; y: number };
}): { x: number; y: number; w: number; h: number } => {
  const width = Math.round(item.size.w);
  const height = Math.round(item.size.h);
  if (point) {
    return clampRect(point.x - width / 2, point.y - height / 2, width, height);
  }
  const taken = (slide?.children ?? []).length;
  const baseX = item.textTemplate === "title" ? 36 : item.kind === "text" ? 500 : 36;
  const baseY = item.textTemplate === "title" ? 26 : 94;
  const offset = Math.min(taken, 6) * 18;
  return clampRect(baseX + offset, baseY + offset, width, height);
};

export const buildPptInsertNode = ({
  doc,
  slide,
  item,
  point
}: {
  doc: VDoc;
  slide: VNode;
  item: PptInsertItem;
  point?: { x: number; y: number };
}): VNode => {
  const rect = resolvePptInsertRect({ slide, item, point });
  const fallbackSourceId = doc.dataSources?.[0]?.id;
  const fallbackQueryId = doc.queries?.find((query) => query.sourceId === fallbackSourceId)?.queryId;
  if (item.kind === "chart") {
    const node = buildChartNode({
      doc,
      parent: slide,
      chartType: item.chartType ?? "line",
      sourceId: fallbackSourceId,
      title: item.label
    });
    node.layout = { mode: "absolute", x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: 1 };
    return node;
  }
  if (item.kind === "table") {
    return {
      id: prefixedId("table"),
      kind: "table",
      name: item.label,
      props: buildTableSpecByPreset(doc, item.tablePreset ?? "basic", fallbackSourceId),
      data: fallbackSourceId ? { sourceId: fallbackSourceId, queryId: fallbackQueryId } : undefined,
      layout: { mode: "absolute", x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: 1 }
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
    layout: { mode: "absolute", x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: 1 }
  };
};

export const buildPptImageNode = ({
  slide,
  item,
  assetId,
  title,
  point,
  width,
  height
}: {
  slide: VNode;
  item: PptInsertItem;
  assetId: string;
  title?: string;
  point?: { x: number; y: number };
  width?: number;
  height?: number;
}): VNode<ImageProps> => {
  const rect = resolvePptInsertRect({
    slide,
    item: {
      ...item,
      size: {
        w: Math.max(180, Math.round(width ?? item.size.w)),
        h: Math.max(120, Math.round(height ?? item.size.h))
      }
    },
    point
  });
  return buildImageNode({
    assetId,
    title,
    layout: {
      mode: "absolute",
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      z: 1
    }
  });
};

export const resolvePptRecentInsertItems = (recentItemIds: string[], limit = 4): PptInsertItem[] =>
  [...new Set(recentItemIds)]
    .map((itemId) => getPptInsertItem(itemId))
    .filter((item): item is PptInsertItem => Boolean(item))
    .slice(0, limit);

export const resolvePptRecommendedItems = ({
  slide,
  recentItemIds = [],
  limit = 4
}: {
  slide?: VNode;
  recentItemIds?: string[];
  limit?: number;
}): PptInsertItem[] => {
  const nodes = slide?.children ?? [];
  const chartCount = nodes.filter((node) => node.kind === "chart").length;
  const tableCount = nodes.filter((node) => node.kind === "table").length;
  const imageCount = nodes.filter((node) => node.kind === "image").length;
  const textNodes = nodes.filter((node) => node.kind === "text");
  const hasTitle = textNodes.some((node) => Number(node.style?.fontSize ?? 0) >= 20);
  const hasBody = textNodes.some((node) => Number(node.style?.fontSize ?? 0) < 20);
  const blockedIds = new Set(recentItemIds);
  const itemIds: string[] = [];
  const push = (itemId: string): void => {
    if (!blockedIds.has(itemId) && !itemIds.includes(itemId) && pptInsertItemMap.has(itemId)) {
      itemIds.push(itemId);
    }
  };
  if (!hasTitle) {
    push("text.title");
  }
  if (chartCount === 0) {
    push("chart.line");
    push("chart.bar");
  }
  if (!hasBody) {
    push("text.body");
  }
  if (tableCount === 0) {
    push("table.basic");
  }
  if (imageCount === 0) {
    push("media.image");
  }
  ["chart.combo", "table.multi-header", "text.note"].forEach(push);
  return itemIds
    .slice(0, limit)
    .map((itemId) => getPptInsertItem(itemId))
    .filter((item): item is PptInsertItem => Boolean(item));
};

export const resolvePptInsertGroups = ({
  slide,
  recentItemIds = []
}: {
  slide?: VNode;
  recentItemIds?: string[];
}): PptInsertGroup[] => {
  const groups: PptInsertGroup[] = [];
  const recentItems = resolvePptRecentInsertItems(recentItemIds);
  const recommendedItems = resolvePptRecommendedItems({
    slide,
    recentItemIds: recentItems.map((item) => item.id)
  });
  if (recentItems.length > 0) {
    groups.push({ id: "recent", label: "最近使用", items: recentItems });
  }
  if (recommendedItems.length > 0) {
    groups.push({ id: "recommended", label: "推荐组件", items: recommendedItems });
  }
  return [...groups, ...pptInsertGroups];
};
