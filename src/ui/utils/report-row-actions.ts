import { defaultChartSpec } from "../../core/doc/defaults";
import type { Command, ChartSpec, VDoc, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import type { EditorSemanticAction } from "../telemetry/editor-telemetry";
import { findNodeById } from "./node-tree";
import { buildReportGridRows, type ReportGridItem, type ReportGridRow } from "./report-layout";
import { getSectionBlocks } from "./report-sections";

export type ReportRowLayoutPresetId = "single" | "two_equal" | "two_wide_left" | "two_wide_right" | "three_equal" | "four_equal";
export type ReportRowMoveDirection = "up" | "down";
export type ReportRowInsertPosition = "before" | "after";

export interface ReportRowLayoutPreset {
  id: ReportRowLayoutPresetId;
  label: string;
  description: string;
  widths: number[];
}

export interface ReportRowActionPlan {
  commands: Command[];
  summary: string;
  semanticAction: EditorSemanticAction;
  primaryNodeId: string;
}

const ROW_LAYOUT_PRESETS: ReportRowLayoutPreset[] = [
  {
    id: "single",
    label: "单列",
    description: "当前行单列通栏。",
    widths: [12]
  },
  {
    id: "two_equal",
    label: "双列",
    description: "当前行双列均分。",
    widths: [6, 6]
  },
  {
    id: "two_wide_left",
    label: "左宽",
    description: "当前行左侧更宽，适合图表 + 结论。",
    widths: [7, 5]
  },
  {
    id: "two_wide_right",
    label: "右宽",
    description: "当前行右侧更宽，适合说明在右侧展开。",
    widths: [5, 7]
  },
  {
    id: "three_equal",
    label: "三列",
    description: "当前行三列均分。",
    widths: [4, 4, 4]
  },
  {
    id: "four_equal",
    label: "四列",
    description: "当前行四列均分。",
    widths: [3, 3, 3, 3]
  }
];

const listAllContentChildIndexes = (section: VNode): number[] =>
  (section.children ?? [])
    .map((child, index) => (child.kind === "section" ? -1 : index))
    .filter((index) => index >= 0);

const resolveAbsoluteInsertIndex = (section: VNode, insertBlockIndex: number): number => {
  const contentChildIndexes = listAllContentChildIndexes(section);
  if (insertBlockIndex >= contentChildIndexes.length) {
    return (section.children ?? []).length;
  }
  return contentChildIndexes[insertBlockIndex] ?? (section.children ?? []).length;
};

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

const makeRowChartNode = (doc: VDoc, row: ReportGridRow, gx: number, gw: number): VNode<ChartSpec> => ({
  id: prefixedId("chart"),
  kind: "chart",
  name: "新增图表",
  layout: { mode: "grid", gx, gy: row.gy, gw, gh: 4 },
  data: resolveDefaultDataBinding(doc),
  props: defaultChartSpec("新增图表")
});

const resolveRowContext = (
  doc: VDoc,
  sectionId: string,
  rowKey: string
): { section: VNode; row: ReportGridRow; rows: ReportGridRow[] } | null => {
  const section = findNodeById(doc.root, sectionId);
  if (!section || section.kind !== "section") {
    return null;
  }
  const rows = buildReportGridRows(getSectionBlocks(section));
  const row = rows.find((item) => item.key === rowKey);
  if (!row) {
    return null;
  }
  return { section, row, rows };
};

const resolveSectionRowsContext = (
  doc: VDoc,
  sectionId: string
): { section: VNode; rows: ReportGridRow[]; itemByNodeId: Map<string, ReportGridItem> } | null => {
  const section = findNodeById(doc.root, sectionId);
  if (!section || section.kind !== "section") {
    return null;
  }
  const rows = buildReportGridRows(getSectionBlocks(section));
  const itemByNodeId = new Map<string, ReportGridItem>();
  rows.forEach((row) => {
    row.items.forEach((item) => {
      itemByNodeId.set(item.node.id, item);
    });
  });
  return { section, rows, itemByNodeId };
};

const buildGridSlots = (widths: number[]): Array<{ gx: number; gw: number }> => {
  let gx = 0;
  return widths.map((gw) => {
    const slot = { gx, gw };
    gx += gw;
    return slot;
  });
};

const buildLayoutCommand = (item: ReportGridItem, gy: number, gx: number, gw: number): Command => ({
  type: "UpdateLayout",
  nodeId: item.node.id,
  layout: {
    mode: "grid",
    gx,
    gy,
    gw
  }
});

const buildRowLayoutCommands = (row: ReportGridRow, items: ReportGridItem[], widths: number[]): Command[] => {
  const slots = buildGridSlots(widths);
  return items.map((item, index) => {
    const slot = slots[index];
    if (!slot) {
      throw new Error(`missing slot for row item ${item.node.id}`);
    }
    return buildLayoutCommand(item, row.gy, slot.gx, slot.gw);
  });
};

const buildSwappedItems = (items: ReportGridItem[], draggedNodeId: string, targetNodeId: string): ReportGridItem[] | null => {
  const draggedIndex = items.findIndex((item) => item.node.id === draggedNodeId);
  const targetIndex = items.findIndex((item) => item.node.id === targetNodeId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return null;
  }
  const next = [...items];
  const temp = next[draggedIndex];
  next[draggedIndex] = next[targetIndex]!;
  next[targetIndex] = temp!;
  return next;
};

const resolvePreset = (presetId: ReportRowLayoutPresetId): ReportRowLayoutPreset | undefined => ROW_LAYOUT_PRESETS.find((item) => item.id === presetId);

const resolveAutoLayoutPreset = (itemCount: number): ReportRowLayoutPreset | undefined => {
  switch (itemCount) {
    case 1:
      return resolvePreset("single");
    case 2:
      return resolvePreset("two_equal");
    case 3:
      return resolvePreset("three_equal");
    case 4:
      return resolvePreset("four_equal");
    default:
      return undefined;
  }
};

const buildFallbackWidths = (itemCount: number): number[] => {
  if (itemCount <= 0) {
    return [];
  }
  const base = Math.floor(12 / itemCount);
  const widths = Array.from({ length: itemCount }, () => Math.max(1, base));
  const used = widths.reduce((sum, value) => sum + value, 0);
  widths[widths.length - 1] = Math.max(1, widths[widths.length - 1]! + (12 - used));
  return widths;
};

const resolveAutoWidths = (itemCount: number): number[] => resolveAutoLayoutPreset(itemCount)?.widths ?? buildFallbackWidths(itemCount);

type RowCommandMode = "preserve" | "auto";

interface RowCommandSpec {
  rowKey: string;
  nodeIds: string[];
  mode: RowCommandMode;
}

const buildCommandsFromRowSpecs = (rowSpecs: RowCommandSpec[], itemByNodeId: Map<string, ReportGridItem>): Command[] => {
  const commands: Command[] = [];
  rowSpecs.forEach((rowSpec, gy) => {
    const widths = rowSpec.mode === "preserve" ? rowSpec.nodeIds.map((nodeId) => itemByNodeId.get(nodeId)?.gw ?? 12) : resolveAutoWidths(rowSpec.nodeIds.length);
    let gx = 0;
    rowSpec.nodeIds.forEach((nodeId, index) => {
      const item = itemByNodeId.get(nodeId);
      if (!item) {
        return;
      }
      const gw = widths[index] ?? Math.max(1, 12 - gx);
      if ((item.node.layout?.mode ?? "grid") !== "grid" || item.gx !== gx || item.gw !== gw || item.node.layout?.gy !== gy) {
        commands.push(buildLayoutCommand(item, gy, gx, gw));
      }
      gx += gw;
    });
  });
  return commands;
};

export const listReportRowLayoutPresets = (itemCount: number): ReportRowLayoutPreset[] =>
  ROW_LAYOUT_PRESETS.filter((preset) => preset.widths.length === itemCount);

export const buildReportRowSwapOrder = (row: ReportGridRow, draggedNodeId: string, targetNodeId: string): string[] | null =>
  buildSwappedItems(row.items, draggedNodeId, targetNodeId)?.map((item) => item.node.id) ?? null;

export const buildReportRowLayoutPresetPlan = (
  doc: VDoc,
  sectionId: string,
  rowKey: string,
  presetId: ReportRowLayoutPresetId
): ReportRowActionPlan | null => {
  const context = resolveRowContext(doc, sectionId, rowKey);
  const preset = resolvePreset(presetId);
  if (!context || !preset || preset.widths.length !== context.row.items.length) {
    return null;
  }
  return {
    commands: buildRowLayoutCommands(context.row, context.row.items, preset.widths),
    summary: `report row layout ${preset.id}`,
    primaryNodeId: context.row.items[0]?.node.id ?? "",
    semanticAction: {
      action: "apply_layout_preset",
      source: "ui",
      target: {
        docId: doc.docId,
        sectionId: context.section.id,
        rowId: context.row.key
      },
      payload: {
        presetId: preset.id,
        rowGy: context.row.gy,
        nodeIds: context.row.items.map((item) => item.node.id)
      }
    }
  };
};

export const buildReportRowAddChartPlan = (doc: VDoc, sectionId: string, rowKey: string): ReportRowActionPlan | null => {
  const context = resolveRowContext(doc, sectionId, rowKey);
  if (!context) {
    return null;
  }
  const autoPreset = resolveAutoLayoutPreset(context.row.items.length + 1);
  if (!autoPreset) {
    return null;
  }
  const newChartSlot = buildGridSlots(autoPreset.widths)[context.row.items.length];
  if (!newChartSlot) {
    return null;
  }
  const newChart = makeRowChartNode(doc, context.row, newChartSlot.gx, newChartSlot.gw);
  const insertBlockIndex = Math.max(...context.row.items.map((item) => item.order)) + 1;
  const absoluteInsertIndex = resolveAbsoluteInsertIndex(context.section, insertBlockIndex);
  const commands: Command[] = [
    ...buildRowLayoutCommands(context.row, context.row.items, autoPreset.widths.slice(0, context.row.items.length)),
    {
      type: "InsertNode",
      parentId: context.section.id,
      index: absoluteInsertIndex,
      node: newChart
    }
  ];
  return {
    commands,
    summary: "report row add chart",
    primaryNodeId: newChart.id,
    semanticAction: {
      action: "insert_block",
      source: "ui",
      target: {
        docId: doc.docId,
        sectionId: context.section.id,
        rowId: context.row.key
      },
      payload: {
        blockKind: "chart",
        anchorKind: "row_append",
        presetId: autoPreset.id,
        rowGy: context.row.gy,
        insertedNodeIds: [newChart.id]
      }
    }
  };
};

export const buildReportRowSwapPlan = (doc: VDoc, sectionId: string, rowKey: string): ReportRowActionPlan | null => {
  const context = resolveRowContext(doc, sectionId, rowKey);
  if (!context || context.row.items.length < 2) {
    return null;
  }
  const reversedItems = [...context.row.items].reverse();
  const commands = buildRowLayoutCommands(context.row, reversedItems, reversedItems.map((item) => item.gw));
  return {
    commands,
    summary: "report row swap",
    primaryNodeId: context.row.items[0]?.node.id ?? "",
    semanticAction: {
      action: "swap_row_blocks",
      source: "ui",
      target: {
        docId: doc.docId,
        sectionId: context.section.id,
        rowId: context.row.key
      },
      payload: {
        rowGy: context.row.gy,
        nodeIds: context.row.items.map((item) => item.node.id),
        reversedNodeIds: reversedItems.map((item) => item.node.id)
      }
    }
  };
};

export const buildReportRowReorderPlan = (
  doc: VDoc,
  sectionId: string,
  rowKey: string,
  draggedNodeId: string,
  targetNodeId: string
): ReportRowActionPlan | null => {
  const context = resolveRowContext(doc, sectionId, rowKey);
  if (!context) {
    return null;
  }
  const swappedItems = buildSwappedItems(context.row.items, draggedNodeId, targetNodeId);
  if (!swappedItems) {
    return null;
  }
  return {
    commands: buildRowLayoutCommands(
      context.row,
      swappedItems,
      context.row.items.map((item) => item.gw)
    ),
    summary: "report row reorder",
    primaryNodeId: draggedNodeId,
    semanticAction: {
      action: "move_block",
      source: "ui",
      target: {
        docId: doc.docId,
        sectionId: context.section.id,
        rowId: context.row.key,
        nodeId: draggedNodeId
      },
      payload: {
        rowGy: context.row.gy,
        targetNodeId,
        nodeIdsBefore: context.row.items.map((item) => item.node.id),
        nodeIdsAfter: swappedItems.map((item) => item.node.id)
      }
    }
  };
};

export const buildReportBlockInsertBetweenRowsPlan = (
  doc: VDoc,
  sectionId: string,
  draggedNodeId: string,
  targetRowKey: string,
  position: ReportRowInsertPosition
): ReportRowActionPlan | null => {
  const context = resolveSectionRowsContext(doc, sectionId);
  if (!context || !context.itemByNodeId.has(draggedNodeId)) {
    return null;
  }
  const targetRowIndex = context.rows.findIndex((row) => row.key === targetRowKey);
  if (targetRowIndex < 0) {
    return null;
  }

  const rowSpecs: RowCommandSpec[] = context.rows.map((row) => ({
    rowKey: row.key,
    nodeIds: row.items.map((item) => item.node.id),
    mode: "preserve"
  }));

  const sourceRowIndex = rowSpecs.findIndex((rowSpec) => rowSpec.nodeIds.includes(draggedNodeId));
  if (sourceRowIndex < 0) {
    return null;
  }

  const sourceSpec = rowSpecs[sourceRowIndex]!;
  sourceSpec.nodeIds = sourceSpec.nodeIds.filter((nodeId) => nodeId !== draggedNodeId);
  if (sourceSpec.nodeIds.length === 0) {
    rowSpecs.splice(sourceRowIndex, 1);
  } else {
    sourceSpec.mode = "auto";
  }

  const nextTargetIndex = rowSpecs.findIndex((rowSpec) => rowSpec.rowKey === targetRowKey);
  if (nextTargetIndex < 0) {
    return null;
  }
  const insertIndex = position === "before" ? nextTargetIndex : nextTargetIndex + 1;
  rowSpecs.splice(insertIndex, 0, {
    rowKey: `insert_${draggedNodeId}_${targetRowKey}_${position}`,
    nodeIds: [draggedNodeId],
    mode: "auto"
  });

  return {
    commands: buildCommandsFromRowSpecs(rowSpecs, context.itemByNodeId),
    summary: `report block insert ${position} row`,
    primaryNodeId: draggedNodeId,
    semanticAction: {
      action: "move_block",
      source: "ui",
      target: {
        docId: doc.docId,
        sectionId: context.section.id,
        rowId: targetRowKey,
        nodeId: draggedNodeId
      },
      payload: {
        placement: position,
        targetRowKey,
        nodeIdsAfter: rowSpecs.flatMap((rowSpec) => rowSpec.nodeIds)
      }
    }
  };
};

export const buildReportRowMovePlan = (
  doc: VDoc,
  sectionId: string,
  rowKey: string,
  direction: ReportRowMoveDirection
): ReportRowActionPlan | null => {
  const context = resolveRowContext(doc, sectionId, rowKey);
  if (!context) {
    return null;
  }
  const rowIndex = context.rows.findIndex((item) => item.key === rowKey);
  if (rowIndex < 0) {
    return null;
  }
  const targetRow = direction === "up" ? context.rows[rowIndex - 1] : context.rows[rowIndex + 1];
  if (!targetRow) {
    return null;
  }
  return {
    commands: [
      ...context.row.items.map((item) => buildLayoutCommand(item, targetRow.gy, item.gx, item.gw)),
      ...targetRow.items.map((item) => buildLayoutCommand(item, context.row.gy, item.gx, item.gw))
    ],
    summary: `report row move ${direction}`,
    primaryNodeId: context.row.items[0]?.node.id ?? "",
    semanticAction: {
      action: "reorder_section",
      source: "ui",
      target: {
        docId: doc.docId,
        sectionId: context.section.id,
        rowId: context.row.key
      },
      payload: {
        direction,
        rowGy: context.row.gy,
        targetRowKey: targetRow.key,
        targetGy: targetRow.gy,
        nodeIds: context.row.items.map((item) => item.node.id)
      }
    }
  };
};
