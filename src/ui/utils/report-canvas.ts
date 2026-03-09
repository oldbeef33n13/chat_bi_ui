import type { Command, ReportProps, VDoc, VNode } from "../../core/doc/types";
import type { EditorSemanticAction } from "../telemetry/editor-telemetry";
import { findNodeById } from "./node-tree";
import { getSectionBlocks } from "./report-sections";
import { buildReportGridRows, type ReportGridItem, type ReportGridRow } from "./report-layout";
import { resolveGridConflict, resolveGridGroupMove, type GridNodeState, type GridRect } from "./dashboard-grid";
import type { ReportInsertAnchor } from "./report-insert";
import { buildDuplicateNodesPlan } from "./duplicate-nodes";

export const REPORT_CANVAS_COLS = 12;
export const REPORT_CANVAS_WIDTH_PX = 960;
export const REPORT_CANVAS_PAGE_HEIGHT_PX = 960;
export const REPORT_CANVAS_PAGE_GAP_PX = 18;
export const REPORT_CANVAS_PADDING_PX = 24;
export const REPORT_CANVAS_GRID_GAP_PX = 12;
export const REPORT_CANVAS_ROW_UNIT_PX = 84;

export interface ReportSectionCanvasConfig {
  cols: number;
  widthPx: number;
  pageHeightPx: number;
  pageGapPx: number;
  paddingPx: number;
  gridGapPx: number;
  rowGapPx: number;
  snapPx: number;
  rowUnitPx: number;
  overflow: "paginate" | "grow";
}

export interface ReportSectionCanvasRow {
  row: ReportGridRow;
  top: number;
  stackTop: number;
  height: number;
  pageIndex: number;
  topWithinPage: number;
}

export interface ReportSectionCanvasBlock {
  node: VNode;
  rowKey: string;
  rowIndex: number;
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  left: number;
  top: number;
  stackTop: number;
  topWithinPage: number;
  width: number;
  height: number;
  pageIndex: number;
}

export interface ReportSectionCanvasPage {
  index: number;
  stackTop: number;
  height: number;
  blocks: ReportSectionCanvasBlock[];
}

export interface ReportSectionCanvasProjection {
  config: ReportSectionCanvasConfig;
  rows: ReportSectionCanvasRow[];
  blocks: ReportSectionCanvasBlock[];
  pages: ReportSectionCanvasPage[];
  totalHeight: number;
}

export interface ReportCanvasLayoutDraft {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ReportCanvasInsertDraft {
  point?: {
    x: number;
    y: number;
  };
  gw: number;
  gh: number;
}

export interface ReportCanvasPlan {
  commands: Command[];
  summary: string;
  semanticAction: EditorSemanticAction;
  primaryNodeId?: string;
  selectedNodeIds?: string[];
}

export interface ReportCanvasGuide {
  orientation: "vertical" | "horizontal";
  pageIndex: number;
  position: number;
  kind: "safezone" | "page-center" | "block-edge" | "block-center";
}

export interface ReportCanvasSnapResult {
  draft: ReportCanvasLayoutDraft;
  guides: ReportCanvasGuide[];
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const parsePositive = (value: unknown): number | undefined => {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) {
    return undefined;
  }
  return next;
};

const resolveGridHeightUnits = (item: ReportGridItem): number => {
  const explicit = Number(item.node.layout?.gh ?? 0);
  if (Number.isFinite(explicit) && explicit >= 1) {
    return Math.max(1, Math.round(explicit));
  }
  return Math.max(1, Math.round(item.height / REPORT_CANVAS_ROW_UNIT_PX));
};

const normalizeGridWidth = (gw: number, cols: number): number => clamp(Math.round(Number(gw) || 1), 1, cols);

const resolveGridLayoutForItem = (item: ReportGridItem, row: ReportGridRow): GridRect => ({
  mode: "grid",
  gx: item.gx,
  gy: row.gy,
  gw: item.gw,
  gh: resolveGridHeightUnits(item)
});

export const resolveReportSectionCanvasConfig = (
  section: VNode,
  reportProps?: Partial<ReportProps>
): ReportSectionCanvasConfig => {
  const sectionProps = (section.props as Record<string, unknown> | undefined) ?? {};
  const bodyPaddingPx = parsePositive(reportProps?.bodyPaddingPx) ?? REPORT_CANVAS_PADDING_PX;
  const rowGapPx = parsePositive(reportProps?.blockGapPx) ?? REPORT_CANVAS_GRID_GAP_PX;
  return {
    cols: Math.max(4, Math.min(24, Math.round(parsePositive(sectionProps.canvasCols) ?? REPORT_CANVAS_COLS))),
    widthPx: REPORT_CANVAS_WIDTH_PX,
    pageHeightPx: Math.max(480, Math.round(parsePositive(sectionProps.canvasPageHeightPx) ?? REPORT_CANVAS_PAGE_HEIGHT_PX)),
    pageGapPx: REPORT_CANVAS_PAGE_GAP_PX,
    paddingPx: Math.max(12, Math.round(parsePositive(sectionProps.canvasPaddingPx) ?? bodyPaddingPx)),
    gridGapPx: Math.max(8, Math.round(parsePositive(sectionProps.canvasGapPx) ?? REPORT_CANVAS_GRID_GAP_PX)),
    rowGapPx: Math.max(6, Math.round(rowGapPx)),
    snapPx: Math.max(4, Math.round(parsePositive(sectionProps.canvasSnapPx) ?? 8)),
    rowUnitPx: REPORT_CANVAS_ROW_UNIT_PX,
    overflow: sectionProps.canvasOverflow === "grow" ? "grow" : "paginate"
  };
};

const buildCanvasPages = (pageIndexes: number[], config: ReportSectionCanvasConfig, totalContentHeight: number): ReportSectionCanvasPage[] => {
  const count =
    config.overflow === "grow"
      ? 1
      : Math.max(1, pageIndexes.length > 0 ? Math.max(...pageIndexes) + 1 : Math.max(1, Math.ceil(totalContentHeight / config.pageHeightPx)));
  return Array.from({ length: count }, (_, index) => ({
    index,
    stackTop: index * (config.pageHeightPx + config.pageGapPx),
    height: config.pageHeightPx,
    blocks: []
  }));
};

export const buildReportSectionCanvasProjection = (
  blocks: VNode[],
  configInput?: Partial<ReportSectionCanvasConfig>
): ReportSectionCanvasProjection => {
  const config: ReportSectionCanvasConfig = {
    cols: REPORT_CANVAS_COLS,
    widthPx: REPORT_CANVAS_WIDTH_PX,
    pageHeightPx: REPORT_CANVAS_PAGE_HEIGHT_PX,
    pageGapPx: REPORT_CANVAS_PAGE_GAP_PX,
    paddingPx: REPORT_CANVAS_PADDING_PX,
    gridGapPx: REPORT_CANVAS_GRID_GAP_PX,
    rowGapPx: REPORT_CANVAS_GRID_GAP_PX,
    snapPx: 8,
    rowUnitPx: REPORT_CANVAS_ROW_UNIT_PX,
    overflow: "paginate",
    ...configInput
  };
  const rows = buildReportGridRows(blocks);
  const contentWidth = Math.max(240, config.widthPx - config.paddingPx * 2);
  const colWidth = (contentWidth - config.gridGapPx * (config.cols - 1)) / config.cols;

  let cursorTop = 0;
  const rowMetrics: ReportSectionCanvasRow[] = rows.map((row) => {
    const top = cursorTop;
    const pageIndex = config.overflow === "grow" ? 0 : Math.max(0, Math.floor(top / config.pageHeightPx));
    const topWithinPage = config.overflow === "grow" ? top : top - pageIndex * config.pageHeightPx;
    const stackTop = pageIndex * (config.pageHeightPx + config.pageGapPx) + topWithinPage;
    cursorTop += row.maxHeight + config.rowGapPx;
    return {
      row,
      top,
      stackTop,
      height: row.maxHeight,
      pageIndex,
      topWithinPage
    };
  });

  const blocksWithRects: ReportSectionCanvasBlock[] = [];
  rowMetrics.forEach((rowMetric, rowIndex) => {
    rowMetric.row.items.forEach((item) => {
      const layout = resolveGridLayoutForItem(item, rowMetric.row);
      const left = config.paddingPx + item.gx * (colWidth + config.gridGapPx);
      const width = Math.max(96, item.gw * colWidth + Math.max(0, item.gw - 1) * config.gridGapPx);
      blocksWithRects.push({
        node: item.node,
        rowKey: rowMetric.row.key,
        rowIndex,
        gx: layout.gx,
        gy: layout.gy,
        gw: layout.gw,
        gh: layout.gh,
        left,
        top: rowMetric.top,
        stackTop: rowMetric.stackTop,
        topWithinPage: rowMetric.topWithinPage,
        width,
        height: item.height,
        pageIndex: rowMetric.pageIndex
      });
    });
  });

  const pages = buildCanvasPages(rowMetrics.map((row) => row.pageIndex), config, cursorTop);
  blocksWithRects.forEach((block) => {
    const page = pages[block.pageIndex] ?? pages[0];
    page?.blocks.push(block);
  });

  const totalHeight =
    pages.length === 0
      ? config.pageHeightPx
      : pages.length * config.pageHeightPx + Math.max(0, pages.length - 1) * config.pageGapPx;

  return {
    config,
    rows: rowMetrics,
    blocks: blocksWithRects,
    pages,
    totalHeight
  };
};

const resolvePageByStackTop = (projection: ReportSectionCanvasProjection, top: number): ReportSectionCanvasPage => {
  const matched =
    projection.pages.find((page) => top >= page.stackTop && top < page.stackTop + page.height + projection.config.pageGapPx) ??
    projection.pages[0];
  return matched ?? {
    index: 0,
    stackTop: 0,
    height: projection.config.pageHeightPx,
    blocks: []
  };
};

const applyAxisSnap = (
  current: number,
  size: number,
  candidates: Array<{ position: number; anchor: "start" | "center" | "end"; kind: ReportCanvasGuide["kind"] }>,
  snapPx: number
): { next: number; guide?: ReportCanvasGuide["kind"]; guidePosition?: number } => {
  const anchors = [
    { key: "start", value: current },
    { key: "center", value: current + size / 2 },
    { key: "end", value: current + size }
  ] as const;
  let best:
    | {
        delta: number;
        next: number;
        kind: ReportCanvasGuide["kind"];
        position: number;
      }
    | undefined;
  anchors.forEach((anchor) => {
    candidates.forEach((candidate) => {
      const delta = candidate.position - anchor.value;
      if (Math.abs(delta) > snapPx) {
        return;
      }
      const next =
        anchor.key === "start" ? current + delta : anchor.key === "center" ? current + delta : current + delta;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = {
          delta,
          next,
          kind: candidate.kind,
          position: candidate.position
        };
      }
    });
  });
  return best ? { next: best.next, guide: best.kind, guidePosition: best.position } : { next: current };
};

export const resolveReportCanvasSnapPreview = (
  projection: ReportSectionCanvasProjection,
  nodeId: string,
  draft: ReportCanvasLayoutDraft
): ReportCanvasSnapResult => {
  const page = resolvePageByStackTop(projection, draft.top);
  const boundedLeft = clamp(draft.left, 0, Math.max(0, projection.config.widthPx - draft.width));
  const topWithinPage = clamp(draft.top - page.stackTop, 0, Math.max(0, page.height - draft.height));
  const samePageBlocks = page.blocks.filter((block) => block.node.id !== nodeId);

  const xCandidates = [
    { position: projection.config.paddingPx, anchor: "start" as const, kind: "safezone" as const },
    { position: projection.config.widthPx / 2, anchor: "center" as const, kind: "page-center" as const },
    { position: projection.config.widthPx - projection.config.paddingPx, anchor: "end" as const, kind: "safezone" as const },
    ...samePageBlocks.flatMap((block) => [
      { position: block.left, anchor: "start" as const, kind: "block-edge" as const },
      { position: block.left + block.width / 2, anchor: "center" as const, kind: "block-center" as const },
      { position: block.left + block.width, anchor: "end" as const, kind: "block-edge" as const }
    ])
  ];
  const yCandidates = [
    { position: projection.config.paddingPx, anchor: "start" as const, kind: "safezone" as const },
    { position: page.height / 2, anchor: "center" as const, kind: "page-center" as const },
    { position: page.height - projection.config.paddingPx, anchor: "end" as const, kind: "safezone" as const },
    ...samePageBlocks.flatMap((block) => [
      { position: block.topWithinPage, anchor: "start" as const, kind: "block-edge" as const },
      { position: block.topWithinPage + block.height / 2, anchor: "center" as const, kind: "block-center" as const },
      { position: block.topWithinPage + block.height, anchor: "end" as const, kind: "block-edge" as const }
    ])
  ];

  const xSnap = applyAxisSnap(boundedLeft, draft.width, xCandidates, projection.config.snapPx);
  const ySnap = applyAxisSnap(topWithinPage, draft.height, yCandidates, projection.config.snapPx);

  const guides: ReportCanvasGuide[] = [];
  if (xSnap.guidePosition !== undefined && xSnap.guide) {
    guides.push({
      orientation: "vertical",
      pageIndex: page.index,
      position: xSnap.guidePosition,
      kind: xSnap.guide
    });
  }
  if (ySnap.guidePosition !== undefined && ySnap.guide) {
    guides.push({
      orientation: "horizontal",
      pageIndex: page.index,
      position: ySnap.guidePosition,
      kind: ySnap.guide
    });
  }

  return {
    draft: {
      left: clamp(xSnap.next, 0, Math.max(0, projection.config.widthPx - draft.width)),
      top: page.stackTop + clamp(ySnap.next, 0, Math.max(0, page.height - draft.height)),
      width: draft.width,
      height: draft.height
    },
    guides
  };
};

const resolveCanvasGy = (projection: ReportSectionCanvasProjection, top: number): number => {
  if (projection.rows.length === 0) {
    return 0;
  }
  for (let index = 0; index < projection.rows.length; index += 1) {
    const current = projection.rows[index]!;
    const next = projection.rows[index + 1];
    const boundary = next ? current.stackTop + current.height + projection.config.rowGapPx / 2 : current.stackTop + current.height + projection.config.rowGapPx;
    if (top < boundary) {
      return current.row.gy;
    }
  }
  return projection.rows[projection.rows.length - 1]!.row.gy + 1;
};

export const resolveReportCanvasInsertAnchor = (projection: ReportSectionCanvasProjection, top: number): ReportInsertAnchor => {
  if (projection.rows.length === 0) {
    return { kind: "section-start" };
  }
  const first = projection.rows[0]!;
  if (top < first.stackTop + first.height * 0.4) {
    return { kind: "section-start" };
  }
  let anchorRowKey = first.row.key;
  for (let index = 0; index < projection.rows.length; index += 1) {
    const row = projection.rows[index]!;
    const boundary = row.stackTop + row.height + projection.config.rowGapPx / 2;
    anchorRowKey = row.row.key;
    if (top < boundary) {
      break;
    }
  }
  return { kind: "after-row", rowKey: anchorRowKey };
};

const resolveCanvasGx = (projection: ReportSectionCanvasProjection, left: number, width: number): number => {
  const contentWidth = projection.config.widthPx - projection.config.paddingPx * 2;
  const colWidth = (contentWidth - projection.config.gridGapPx * (projection.config.cols - 1)) / projection.config.cols;
  const step = colWidth + projection.config.gridGapPx;
  const boundedLeft = clamp(left, projection.config.paddingPx, projection.config.paddingPx + contentWidth - width);
  const snapped = Math.round((boundedLeft - projection.config.paddingPx) / step);
  return clamp(snapped, 0, projection.config.cols - 1);
};

const resolveCanvasGw = (projection: ReportSectionCanvasProjection, width: number): number => {
  const contentWidth = projection.config.widthPx - projection.config.paddingPx * 2;
  const colWidth = (contentWidth - projection.config.gridGapPx * (projection.config.cols - 1)) / projection.config.cols;
  const step = colWidth + projection.config.gridGapPx;
  const raw = Math.max(1, Math.round((width + projection.config.gridGapPx) / step));
  return clamp(raw, 1, projection.config.cols);
};

const resolveCanvasGh = (projection: ReportSectionCanvasProjection, height: number): number =>
  Math.max(1, Math.round(Math.max(projection.config.rowUnitPx, height) / projection.config.rowUnitPx));

const resolveCanvasWidthPx = (projection: ReportSectionCanvasProjection, gw: number): number => {
  const contentWidth = projection.config.widthPx - projection.config.paddingPx * 2;
  const colWidth = (contentWidth - projection.config.gridGapPx * (projection.config.cols - 1)) / projection.config.cols;
  return Math.max(96, gw * colWidth + Math.max(0, gw - 1) * projection.config.gridGapPx);
};

const resolveCanvasHeightPx = (projection: ReportSectionCanvasProjection, gh: number): number =>
  Math.max(projection.config.rowUnitPx, gh * projection.config.rowUnitPx);

const collectGridNodes = (projection: ReportSectionCanvasProjection): GridNodeState[] =>
  projection.blocks.map((block) => ({
    id: block.node.id,
    lock: Boolean(block.node.layout?.lock),
    layout: {
      mode: "grid",
      gx: block.gx,
      gy: block.gy,
      gw: block.gw,
      gh: block.gh
    }
  }));

export const buildReportCanvasInsertNodePlan = (
  doc: VDoc,
  sectionId: string,
  node: VNode,
  draft: ReportCanvasInsertDraft,
  reportProps?: Partial<ReportProps>
): ReportCanvasPlan | null => {
  const located = locateSectionProjection(doc, sectionId, reportProps);
  if (!located) {
    return null;
  }
  const nextGw = clamp(Math.round(draft.gw || 1), 1, located.projection.config.cols);
  const nextGh = Math.max(1, Math.round(draft.gh || 1));
  const width = resolveCanvasWidthPx(located.projection, nextGw);
  const height = resolveCanvasHeightPx(located.projection, nextGh);
  const defaultTop =
    located.projection.rows.length > 0
      ? located.projection.rows[located.projection.rows.length - 1]!.stackTop +
        located.projection.rows[located.projection.rows.length - 1]!.height +
        located.projection.config.rowGapPx
      : located.projection.config.paddingPx;
  const left = draft.point ? draft.point.x - width / 2 : located.projection.config.paddingPx;
  const top = draft.point ? draft.point.y - height / 2 : defaultTop;
  const nextLayout: GridRect = {
    mode: "grid",
    gx: clamp(resolveCanvasGx(located.projection, left, width), 0, located.projection.config.cols - nextGw),
    gy: resolveCanvasGy(located.projection, top),
    gw: nextGw,
    gh: nextGh
  };
  const normalizedNode: VNode = {
    ...node,
    layout: {
      ...(node.layout ?? {}),
      ...nextLayout
    }
  };
  const nodes = [
    ...collectGridNodes(located.projection),
    {
      id: normalizedNode.id,
      lock: Boolean(normalizedNode.layout?.lock),
      layout: nextLayout
    }
  ];
  const result = resolveGridConflict(nodes, normalizedNode.id, nextLayout, nextLayout, located.projection.config.cols, "move");
  return {
    commands: [
      {
        type: "InsertNode",
        parentId: sectionId,
        node: normalizedNode
      },
      ...result.commands
    ],
    summary: "report canvas insert block",
    semanticAction: {
      action: "insert_block_on_canvas",
      target: {
        docId: doc.docId,
        sectionId,
        nodeId: normalizedNode.id
      },
      payload: {
        nodeKind: normalizedNode.kind,
        nextLayout,
        strategy: result.strategy
      },
      source: "ui"
    },
    primaryNodeId: normalizedNode.id,
    selectedNodeIds: [normalizedNode.id]
  };
};

const resolveCanvasGroupDelta = (
  projection: ReportSectionCanvasProjection,
  blocks: ReportSectionCanvasBlock[],
  anchorBlock: ReportSectionCanvasBlock,
  draft: ReportCanvasLayoutDraft
): { deltaGx: number; deltaGy: number } => {
  const rawDeltaGx = resolveCanvasGx(projection, draft.left, draft.width) - anchorBlock.gx;
  const rawDeltaGy = resolveCanvasGy(projection, draft.top) - anchorBlock.gy;
  const minDx = Math.max(...blocks.map((block) => -block.gx));
  const maxDx = Math.min(...blocks.map((block) => projection.config.cols - block.gw - block.gx));
  const minDy = Math.max(...blocks.map((block) => -block.gy));
  return {
    deltaGx: clamp(rawDeltaGx, minDx, maxDx),
    deltaGy: Math.max(minDy, rawDeltaGy)
  };
};

const locateSectionProjection = (
  doc: VDoc,
  sectionId: string,
  reportProps?: Partial<ReportProps>
): { section: VNode; projection: ReportSectionCanvasProjection } | null => {
  const section = findNodeById(doc.root, sectionId);
  if (!section || section.kind !== "section") {
    return null;
  }
  const blocks = getSectionBlocks(section);
  const config = resolveReportSectionCanvasConfig(section, reportProps);
  return {
    section,
    projection: buildReportSectionCanvasProjection(blocks, config)
  };
};

export const buildReportCanvasMovePlan = (
  doc: VDoc,
  sectionId: string,
  nodeId: string,
  draft: ReportCanvasLayoutDraft,
  reportProps?: Partial<ReportProps>
): ReportCanvasPlan | null => {
  const located = locateSectionProjection(doc, sectionId, reportProps);
  if (!located) {
    return null;
  }
  const block = located.projection.blocks.find((item) => item.node.id === nodeId);
  if (!block) {
    return null;
  }
  const nextLayout: GridRect = {
    mode: "grid",
    gx: clamp(resolveCanvasGx(located.projection, draft.left, draft.width), 0, located.projection.config.cols - block.gw),
    gy: resolveCanvasGy(located.projection, draft.top),
    gw: block.gw,
    gh: block.gh
  };
  const currentLayout: GridRect = { mode: "grid", gx: block.gx, gy: block.gy, gw: block.gw, gh: block.gh };
  const result = resolveGridConflict(collectGridNodes(located.projection), nodeId, nextLayout, currentLayout, located.projection.config.cols, "move");
  return {
    commands: result.commands,
    summary: "report canvas move block",
    semanticAction: {
      action: "move_block_on_canvas",
      target: {
        docId: doc.docId,
        sectionId,
        nodeId
      },
      payload: {
        nextLayout,
        strategy: result.strategy
      },
      source: "ui"
    },
    primaryNodeId: nodeId
  };
};

export const buildReportCanvasResizePlan = (
  doc: VDoc,
  sectionId: string,
  nodeId: string,
  draft: ReportCanvasLayoutDraft,
  reportProps?: Partial<ReportProps>
): ReportCanvasPlan | null => {
  const located = locateSectionProjection(doc, sectionId, reportProps);
  if (!located) {
    return null;
  }
  const block = located.projection.blocks.find((item) => item.node.id === nodeId);
  if (!block) {
    return null;
  }
  const nextGw = resolveCanvasGw(located.projection, draft.width);
  const nextGh = resolveCanvasGh(located.projection, draft.height);
  const nextLayout: GridRect = {
    mode: "grid",
    gx: clamp(resolveCanvasGx(located.projection, draft.left, draft.width), 0, located.projection.config.cols - nextGw),
    gy: resolveCanvasGy(located.projection, draft.top),
    gw: nextGw,
    gh: nextGh
  };
  const currentLayout: GridRect = { mode: "grid", gx: block.gx, gy: block.gy, gw: block.gw, gh: block.gh };
  const result = resolveGridConflict(collectGridNodes(located.projection), nodeId, nextLayout, currentLayout, located.projection.config.cols, "resize");
  return {
    commands: result.commands,
    summary: "report canvas resize block",
    semanticAction: {
      action: "resize_block_on_canvas",
      target: {
        docId: doc.docId,
        sectionId,
        nodeId
      },
      payload: {
        nextLayout,
        strategy: result.strategy
      },
      source: "ui"
    },
    primaryNodeId: nodeId
  };
};

export const buildReportCanvasDuplicatePlan = (
  doc: VDoc,
  sectionId: string,
  nodeId: string,
  draft: ReportCanvasLayoutDraft,
  reportProps?: Partial<ReportProps>
): ReportCanvasPlan | null => {
  const located = locateSectionProjection(doc, sectionId, reportProps);
  if (!located) {
    return null;
  }
  const block = located.projection.blocks.find((item) => item.node.id === nodeId);
  if (!block) {
    return null;
  }
  const nextLayout: GridRect = {
    mode: "grid",
    gx: clamp(resolveCanvasGx(located.projection, draft.left, draft.width), 0, located.projection.config.cols - block.gw),
    gy: resolveCanvasGy(located.projection, draft.top),
    gw: block.gw,
    gh: block.gh
  };
  const duplicatePlan = buildDuplicateNodesPlan(doc.root, sectionId, [nodeId], (layout) => ({
    ...layout,
    mode: "grid",
    gx: nextLayout.gx,
    gy: nextLayout.gy,
    gw: nextLayout.gw,
    gh: nextLayout.gh
  }));
  if (!duplicatePlan || duplicatePlan.commands.length === 0) {
    return null;
  }
  return {
    commands: duplicatePlan.commands,
    summary: "report canvas duplicate block",
    semanticAction: {
      action: "duplicate_block_on_canvas",
      target: {
        docId: doc.docId,
        sectionId,
        nodeId
      },
      payload: {
        sourceNodeId: nodeId,
        duplicatedNodeIds: duplicatePlan.clonedNodes.map((item) => item.id),
        nextLayout
      },
      source: "ui"
    },
    primaryNodeId: duplicatePlan.primaryNodeId
  };
};

export const buildReportCanvasSelectionMovePlan = (
  doc: VDoc,
  sectionId: string,
  nodeIds: string[],
  anchorNodeId: string,
  draft: ReportCanvasLayoutDraft,
  reportProps?: Partial<ReportProps>
): ReportCanvasPlan | null => {
  const located = locateSectionProjection(doc, sectionId, reportProps);
  if (!located) {
    return null;
  }
  const selectedBlocks = located.projection.blocks.filter((item) => nodeIds.includes(item.node.id) && !item.node.layout?.lock);
  const anchorBlock = selectedBlocks.find((item) => item.node.id === anchorNodeId);
  if (!anchorBlock || selectedBlocks.length === 0) {
    return null;
  }
  const delta = resolveCanvasGroupDelta(located.projection, selectedBlocks, anchorBlock, draft);
  const result = resolveGridGroupMove(
    collectGridNodes(located.projection),
    selectedBlocks.map((item) => item.node.id),
    { gx: delta.deltaGx, gy: delta.deltaGy },
    located.projection.config.cols
  );
  return {
    commands: result.commands,
    summary: "report canvas move selection",
    semanticAction: {
      action: "move_block_on_canvas",
      target: {
        docId: doc.docId,
        sectionId,
        nodeId: anchorNodeId
      },
      payload: {
        anchorNodeId,
        nodeIds: result.movedIds,
        delta: {
          gx: result.deltaGx,
          gy: result.deltaGy
        },
        strategy: result.strategy
      },
      source: "ui"
    },
    primaryNodeId: anchorNodeId,
    selectedNodeIds: result.movedIds
  };
};

export const buildReportCanvasSelectionDuplicatePlan = (
  doc: VDoc,
  sectionId: string,
  nodeIds: string[],
  anchorNodeId: string,
  draft: ReportCanvasLayoutDraft,
  reportProps?: Partial<ReportProps>
): ReportCanvasPlan | null => {
  const located = locateSectionProjection(doc, sectionId, reportProps);
  if (!located) {
    return null;
  }
  const selectedBlocks = located.projection.blocks.filter((item) => nodeIds.includes(item.node.id));
  const anchorBlock = selectedBlocks.find((item) => item.node.id === anchorNodeId);
  if (!anchorBlock || selectedBlocks.length === 0) {
    return null;
  }
  const delta = resolveCanvasGroupDelta(located.projection, selectedBlocks, anchorBlock, draft);
  const duplicatePlan = buildDuplicateNodesPlan(doc.root, sectionId, selectedBlocks.map((item) => item.node.id), (layout, sourceNode) => {
    const sourceBlock = selectedBlocks.find((item) => item.node.id === sourceNode.id);
    if (!sourceBlock) {
      return layout;
    }
    return {
      ...layout,
      mode: "grid",
      gx: clamp(sourceBlock.gx + delta.deltaGx, 0, located.projection.config.cols - sourceBlock.gw),
      gy: Math.max(0, sourceBlock.gy + delta.deltaGy),
      gw: sourceBlock.gw,
      gh: sourceBlock.gh
    };
  });
  if (!duplicatePlan || duplicatePlan.commands.length === 0) {
    return null;
  }
  return {
    commands: duplicatePlan.commands,
    summary: "report canvas duplicate selection",
    semanticAction: {
      action: "duplicate_block_on_canvas",
      target: {
        docId: doc.docId,
        sectionId,
        nodeId: anchorNodeId
      },
      payload: {
        anchorNodeId,
        sourceNodeIds: selectedBlocks.map((item) => item.node.id),
        duplicatedNodeIds: duplicatePlan.clonedNodes.map((item) => item.id),
        delta
      },
      source: "ui"
    },
    primaryNodeId: duplicatePlan.primaryNodeId,
    selectedNodeIds: duplicatePlan.clonedNodes.map((item) => item.id)
  };
};

const buildAutoTidyRows = (
  projection: ReportSectionCanvasProjection
): Array<Array<{ nodeId: string; gw: number; gh: number; top: number; left: number }>> => {
  const sorted = [...projection.blocks]
    .map((block) => ({
      nodeId: block.node.id,
      gw: normalizeGridWidth(block.gw, projection.config.cols),
      gh: Math.max(1, Math.round(block.gh)),
      top: block.stackTop,
      left: block.left
    }))
    .sort((a, b) => (Math.abs(a.top - b.top) < 12 ? a.left - b.left : a.top - b.top));

  const rows: Array<Array<{ nodeId: string; gw: number; gh: number; top: number; left: number }>> = [];
  const threshold = Math.max(24, projection.config.rowUnitPx * 0.55);

  sorted.forEach((item) => {
    const current = rows[rows.length - 1];
    if (!current) {
      rows.push([item]);
      return;
    }
    const currentTop = current[0]!.top;
    const currentWidth = current.reduce((sum, candidate) => sum + candidate.gw, 0);
    if (current.length < 4 && currentWidth + item.gw <= projection.config.cols && Math.abs(item.top - currentTop) <= threshold) {
      current.push(item);
      return;
    }
    rows.push([item]);
  });
  return rows;
};

const resolveTidyWidths = (items: Array<{ gw: number }>, cols: number): number[] => {
  if (items.length <= 1) {
    return [cols];
  }
  const total = items.reduce((sum, item) => sum + item.gw, 0);
  if (total === cols) {
    return items.map((item) => normalizeGridWidth(item.gw, cols));
  }
  const equal = Math.floor(cols / items.length);
  const widths = items.map((_, index) => (index === items.length - 1 ? cols - equal * (items.length - 1) : equal));
  return widths.map((width) => normalizeGridWidth(width, cols));
};

export const buildReportCanvasAutoTidyPlan = (
  doc: VDoc,
  sectionId: string,
  reportProps?: Partial<ReportProps>
): ReportCanvasPlan | null => {
  const located = locateSectionProjection(doc, sectionId, reportProps);
  if (!located) {
    return null;
  }
  const rows = buildAutoTidyRows(located.projection);
  const commands: Command[] = [];
  rows.forEach((row, rowIndex) => {
    const widths = resolveTidyWidths(row, located.projection.config.cols);
    let cursor = 0;
    row.forEach((item, index) => {
      const layout = {
        mode: "grid" as const,
        gx: cursor,
        gy: rowIndex,
        gw: widths[index] ?? 1,
        gh: item.gh
      };
      cursor += layout.gw;
      commands.push({
        type: "UpdateLayout",
        nodeId: item.nodeId,
        layout
      });
    });
  });

  const deduped = commands.filter((command) => {
    const node = findNodeById(doc.root, command.nodeId ?? "");
    return Boolean(
      node &&
        (node.layout?.gx !== command.layout?.gx ||
          node.layout?.gy !== command.layout?.gy ||
          node.layout?.gw !== command.layout?.gw ||
          node.layout?.gh !== command.layout?.gh)
    );
  });
  if (deduped.length === 0) {
    return {
      commands: [],
      summary: "report canvas auto tidy",
      semanticAction: {
        action: "auto_tidy_section",
        target: {
          docId: doc.docId,
          sectionId
        },
        payload: {
          rowCount: rows.length
        },
        source: "ui"
      }
    };
  }
  return {
    commands: deduped,
    summary: "report canvas auto tidy",
    semanticAction: {
      action: "auto_tidy_section",
      target: {
        docId: doc.docId,
        sectionId
      },
      payload: {
        rowCount: rows.length,
        updatedNodeIds: deduped.map((command) => command.nodeId)
      },
      source: "ui"
    }
  };
};
