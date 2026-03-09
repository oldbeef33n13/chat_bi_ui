import { defaultChartSpec } from "../../core/doc/defaults";
import type { ChartSpec, Command, TableSpec, VNode, VDoc } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import type { EditorSemanticAction } from "../telemetry/editor-telemetry";
import { findNodeById } from "./node-tree";
import { buildReportGridRows, type ReportGridItem, type ReportGridRow } from "./report-layout";
import { getSectionBlocks } from "./report-sections";

export type ReportInsertPresetId = "chart_single" | "chart_compare" | "chart_text_story" | "table_chart_story";

export interface ReportInsertAnchor {
  kind: "section-start" | "section-end" | "after-row";
  rowKey?: string;
}

export interface ReportInsertPreset {
  id: ReportInsertPresetId;
  label: string;
  description: string;
}

export interface ReportInsertPlan {
  commands: Command[];
  semanticAction: EditorSemanticAction;
  summary: string;
  primaryNodeId: string;
  insertedNodeIds: string[];
  preset: ReportInsertPreset;
}

interface ResolvedAnchorPlacement {
  insertBlockIndex: number;
  newGy: number;
  shiftFromGy?: number;
  rowId?: string;
}

const REPORT_GRID_COLS = 12;

export const REPORT_INSERT_PRESETS: ReportInsertPreset[] = [
  {
    id: "chart_single",
    label: "单图",
    description: "在当前锚点插入一个全宽图表区。"
  },
  {
    id: "chart_compare",
    label: "双图",
    description: "插入左右对比的双图布局。"
  },
  {
    id: "chart_text_story",
    label: "图文",
    description: "插入一个图表加结论说明的版式。"
  },
  {
    id: "table_chart_story",
    label: "表图",
    description: "插入一个表格加图表的联动版式。"
  }
];

const resolvePreset = (presetId: ReportInsertPresetId): ReportInsertPreset =>
  REPORT_INSERT_PRESETS.find((item) => item.id === presetId) ?? REPORT_INSERT_PRESETS[0]!;

const resolveDefaultDataBinding = (doc: VDoc): VNode["data"] | undefined => {
  const firstSource = doc.dataSources?.[0];
  if (!firstSource?.id) {
    return undefined;
  }
  const query = doc.queries?.find((item) => item.sourceId === firstSource.id);
  return {
    sourceId: firstSource.id,
    queryId: query?.queryId
  };
};

const makeChartNode = (title: string, gx: number, gy: number, gw: number, chartType: ChartSpec["chartType"], doc: VDoc): VNode => ({
  id: prefixedId("chart"),
  kind: "chart",
  name: title,
  layout: { mode: "grid", gx, gy, gw, gh: 4 },
  data: resolveDefaultDataBinding(doc),
  props: {
    ...defaultChartSpec(title),
    chartType
  }
});

const makeTextNode = (text: string, gx: number, gy: number, gw: number): VNode => ({
  id: prefixedId("text"),
  kind: "text",
  name: "分析说明",
  layout: { mode: "grid", gx, gy, gw, gh: 4 },
  props: {
    text,
    format: "plain"
  }
});

const makeTableNode = (titleText: string, gx: number, gy: number, gw: number, doc: VDoc): VNode<TableSpec> => ({
  id: prefixedId("table"),
  kind: "table",
  name: titleText,
  layout: { mode: "grid", gx, gy, gw, gh: 4 },
  data: resolveDefaultDataBinding(doc),
  props: {
    titleText,
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
  }
});

const buildPresetNodes = (doc: VDoc, presetId: ReportInsertPresetId, gy: number): VNode[] => {
  switch (presetId) {
    case "chart_compare":
      return [
        makeChartNode("对比图 A", 0, gy, 6, "line", doc),
        makeChartNode("对比图 B", 6, gy, 6, "bar", doc)
      ];
    case "chart_text_story":
      return [
        makeChartNode("关键指标趋势", 0, gy, 7, "line", doc),
        makeTextNode("结论：\n1) 这里填写关键发现。\n2) 这里填写异常解释。\n3) 这里填写建议动作。", 7, gy, 5)
      ];
    case "table_chart_story":
      return [
        makeTableNode("关键指标明细", 0, gy, 6, doc),
        makeChartNode("配套趋势图", 6, gy, 6, "bar", doc)
      ];
    case "chart_single":
    default:
      return [makeChartNode("新增图表", 0, gy, REPORT_GRID_COLS, "line", doc)];
  }
};

const buildAnchorId = (sectionId: string, anchor: ReportInsertAnchor): string => {
  if (anchor.kind === "after-row" && anchor.rowKey) {
    return `${sectionId}:${anchor.kind}:${anchor.rowKey}`;
  }
  return `${sectionId}:${anchor.kind}`;
};

const resolveAnchorPlacement = (rows: ReportGridRow[], anchor: ReportInsertAnchor): ResolvedAnchorPlacement => {
  if (rows.length === 0) {
    return {
      insertBlockIndex: 0,
      newGy: 0
    };
  }

  if (anchor.kind === "section-start") {
    const firstRow = rows[0]!;
    const firstOrder = Math.min(...firstRow.items.map((item) => item.order));
    return {
      insertBlockIndex: firstOrder,
      newGy: firstRow.gy,
      shiftFromGy: firstRow.gy,
      rowId: firstRow.key
    };
  }

  if (anchor.kind === "after-row" && anchor.rowKey) {
    const targetRow = rows.find((item) => item.key === anchor.rowKey);
    if (targetRow) {
      const lastOrder = Math.max(...targetRow.items.map((item) => item.order));
      return {
        insertBlockIndex: lastOrder + 1,
        newGy: targetRow.gy + 1,
        shiftFromGy: targetRow.gy + 1,
        rowId: targetRow.key
      };
    }
  }

  const lastRow = rows[rows.length - 1]!;
  return {
    insertBlockIndex: rows.reduce((sum, row) => sum + row.items.length, 0),
    newGy: lastRow.gy + 1,
    rowId: lastRow.key
  };
};

const resolveAbsoluteInsertIndex = (section: VNode, insertBlockIndex: number): number => {
  const contentChildIndexes = (section.children ?? [])
    .map((child, index) => (child.kind === "section" ? -1 : index))
    .filter((index) => index >= 0);
  if (insertBlockIndex >= contentChildIndexes.length) {
    return (section.children ?? []).length;
  }
  return contentChildIndexes[insertBlockIndex] ?? (section.children ?? []).length;
};

const buildShiftCommands = (rows: ReportGridRow[], shiftFromGy: number | undefined): Command[] => {
  if (shiftFromGy === undefined) {
    return [];
  }
  const commands: Command[] = [];
  rows
    .filter((row) => row.gy >= shiftFromGy)
    .forEach((row) => {
      row.items.forEach((item) => {
        commands.push({
          type: "UpdateLayout",
          nodeId: item.node.id,
          layout: buildShiftedLayout(item, row.gy + 1)
        });
      });
    });
  return commands;
};

const buildShiftedLayout = (item: ReportGridItem, nextGy: number): Partial<NonNullable<VNode["layout"]>> => ({
  ...(item.node.layout ?? {}),
  mode: "grid",
  gx: item.gx,
  gy: nextGy,
  gw: item.gw
});

export const buildReportInsertPresetPlan = (
  doc: VDoc,
  sectionId: string,
  anchor: ReportInsertAnchor,
  presetId: ReportInsertPresetId
): ReportInsertPlan | null => {
  const section = findNodeById(doc.root, sectionId);
  if (!section || section.kind !== "section") {
    return null;
  }

  const preset = resolvePreset(presetId);
  const blocks = getSectionBlocks(section);
  const rows = buildReportGridRows(blocks);
  const placement = resolveAnchorPlacement(rows, anchor);
  const absoluteInsertIndex = resolveAbsoluteInsertIndex(section, placement.insertBlockIndex);
  const insertedNodes = buildPresetNodes(doc, presetId, placement.newGy);

  const commands: Command[] = [
    ...buildShiftCommands(rows, placement.shiftFromGy),
    ...insertedNodes.map((node, index) => ({
      type: "InsertNode" as const,
      parentId: section.id,
      index: absoluteInsertIndex + index,
      node
    }))
  ];

  const anchorId = buildAnchorId(section.id, anchor);
  const insertedNodeIds = insertedNodes.map((node) => node.id);
  return {
    commands,
    summary: `report insert ${preset.id}`,
    primaryNodeId: insertedNodeIds[0]!,
    insertedNodeIds,
    preset,
    semanticAction: {
      action: "insert_row_template",
      traceId: undefined,
      source: "ui",
      target: {
        docId: doc.docId,
        sectionId: section.id,
        rowId: placement.rowId,
        anchorId
      },
      payload: {
        presetId: preset.id,
        insertedNodeIds,
        insertedKinds: insertedNodes.map((node) => node.kind),
        anchorKind: anchor.kind,
        rowKey: anchor.rowKey,
        rowGy: placement.newGy
      }
    }
  };
};

export const getReportInsertPresetLabel = (presetId: ReportInsertPresetId): string => resolvePreset(presetId).label;
