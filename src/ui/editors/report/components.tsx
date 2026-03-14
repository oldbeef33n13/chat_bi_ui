import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import type { ChartSpec, ImageProps, TableSpec, VDoc, VNode } from "../../../core/doc/types";
import { EChartView } from "../../../runtime/chart/EChartView";
import { DataEngine } from "../../../runtime/data/data-engine";
import { TableView } from "../../../runtime/table/TableView";
import { NodeDataState } from "../../components/NodeDataState";
import { NodeTextBlock } from "../../components/NodeTextBlock";
import { useNodeRows } from "../../hooks/use-node-rows";
import { buildCanvasSelectionRect, isCanvasSelectionGesture, resolveCanvasSelectionIds, type CanvasSelectionRect } from "../../utils/canvas-selection";
import { resolveImageAsset, resolveImageNodeTitle } from "../../utils/dashboard-surface";
import { isAdditiveSelectionModifier } from "../../utils/editor-input";
import { REPORT_INSERT_PRESETS, type ReportInsertAnchor, type ReportInsertPresetId } from "../../utils/report-insert";
import type { ReportGridRow } from "../../utils/report-layout";
import { clearReportInsertItemDrag, decodeReportInsertItem, type ReportInsertItem } from "../../utils/report-insert-panel";
import type { ReportSectionCanvasBlock, ReportSectionCanvasProjection, ReportCanvasGuide } from "../../utils/report-canvas";
import {
  buildReportRowSwapOrder,
  listReportRowLayoutPresets,
  type ReportRowInsertPosition,
  type ReportRowLayoutPreset,
  type ReportRowMoveDirection
} from "../../utils/report-row-actions";
import type { FlattenedReportSection } from "../../utils/report-sections";
import {
  isRemoteDataNode,
  resolveNodeDisplayTitle,
  resolveNodeSurfaceStyle,
  resolveNodeTitleStyle,
  resolveTitleTextStyle,
  shouldRenderOuterNodeTitle
} from "../../utils/node-style";
import type {
  ReportCanvasDragState,
  ReportCanvasInsertPreviewState,
  ReportCanvasMarqueeState,
  ReportCanvasResizeState,
  ReportRowDragState,
  ReportRowDropLinePreview,
  ReportRowPreviewState,
  ReportRuntimeProps
} from "./types";

const buildPreviewSlots = (
  row: ReportGridRow,
  preview: ReportRowPreviewState
): Array<{ nodeId: string; gx: number; gw: number; label: string }> => {
  const widthSlots = preview.widths.reduce<Array<{ gx: number; gw: number }>>((list, gw) => {
    const nextGx = list.length === 0 ? 0 : list[list.length - 1]!.gx + list[list.length - 1]!.gw;
    list.push({ gx: nextGx, gw });
    return list;
  }, []);
  return preview.orderedNodeIds.map((nodeId, index) => {
    const item = row.items.find((candidate) => candidate.node.id === nodeId);
    const slot = widthSlots[index] ?? { gx: 0, gw: 12 };
    return {
      nodeId,
      gx: slot.gx,
      gw: slot.gw,
      label: describeReportBlock(item?.node)
    };
  });
};

export const describeReportBlock = (node: VNode | undefined): string => {
  if (!node) {
    return "未命名块";
  }
  if (node.kind === "chart") {
    return String((node.props as ChartSpec | undefined)?.titleText ?? node.name ?? "图表");
  }
  if (node.kind === "table") {
    return String((node.props as TableSpec | undefined)?.titleText ?? node.name ?? "表格");
  }
  if (node.kind === "text") {
    const text = String((node.props as Record<string, unknown> | undefined)?.text ?? "").trim();
    return text ? text.slice(0, 14) : "文本说明";
  }
  return node.name ?? node.kind;
};

export function ReportRowActionBar({
  row,
  rowIndex,
  rowCount,
  sectionId,
  previewLabel,
  onPreviewLayoutPreset,
  onClearPreview,
  onApplyLayoutPreset,
  onAddChart,
  onSwap,
  onMove
}: {
  row: ReportGridRow;
  rowIndex: number;
  rowCount: number;
  sectionId: string;
  previewLabel?: string;
  onPreviewLayoutPreset: (sectionId: string, row: ReportGridRow, preset: ReportRowLayoutPreset) => void;
  onClearPreview: (sectionId?: string, rowKey?: string, mode?: ReportRowPreviewState["mode"]) => void;
  onApplyLayoutPreset: (sectionId: string, rowKey: string, preset: ReportRowLayoutPreset) => void;
  onAddChart: (sectionId: string, rowKey: string) => void;
  onSwap: (sectionId: string, rowKey: string) => void;
  onMove: (sectionId: string, rowKey: string, direction: ReportRowMoveDirection) => void;
}): JSX.Element {
  const presets = listReportRowLayoutPresets(row.items.length);
  return (
    <div
      className="report-row-toolbar"
      data-testid={`report-row-actions-${row.key}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onMouseLeave={() => onClearPreview(sectionId, row.key, "layout")}
    >
      <div className="report-row-toolbar-group">
        <span className="report-row-toolbar-label">{`第 ${rowIndex + 1} 行`}</span>
        {previewLabel ? <span className="chip report-row-preview-chip">{previewLabel}</span> : null}
        {presets.map((preset) => (
          <button
            key={`${row.key}_${preset.id}`}
            className="btn mini-btn"
            title={preset.description}
            onMouseEnter={() => onPreviewLayoutPreset(sectionId, row, preset)}
            onFocus={() => onPreviewLayoutPreset(sectionId, row, preset)}
            onBlur={() => onClearPreview(sectionId, row.key, "layout")}
            onClick={() => onApplyLayoutPreset(sectionId, row.key, preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="report-row-toolbar-group">
        <button className="btn mini-btn" title="向当前行追加一个图表并自动均分版式" onClick={() => onAddChart(sectionId, row.key)} disabled={row.items.length >= 4}>
          加一张图
        </button>
        <button className="btn mini-btn" title="左右交换当前行内容顺序" onClick={() => onSwap(sectionId, row.key)} disabled={row.items.length < 2}>
          左右交换
        </button>
        <button className="btn mini-btn" title="将当前行与上一行交换位置" onClick={() => onMove(sectionId, row.key, "up")} disabled={rowIndex === 0}>
          上移
        </button>
        <button className="btn mini-btn" title="将当前行与下一行交换位置" onClick={() => onMove(sectionId, row.key, "down")} disabled={rowIndex >= rowCount - 1}>
          下移
        </button>
      </div>
    </div>
  );
}

export function ReportRowPreviewOverlay({
  row,
  preview
}: {
  row: ReportGridRow;
  preview: ReportRowPreviewState;
}): JSX.Element {
  const slots = buildPreviewSlots(row, preview);
  return (
    <div className="report-row-preview-overlay" data-testid={`report-row-preview-${row.key}`}>
      {slots.map((slot) => (
        <div key={`${preview.rowKey}_${slot.nodeId}`} className="report-row-preview-card" style={{ gridColumn: `${slot.gx + 1} / span ${slot.gw}` }}>
          <span className="report-row-preview-card-title">{slot.label}</span>
          <span className="report-row-preview-card-meta">{`${slot.gw}/12`}</span>
        </div>
      ))}
    </div>
  );
}

export function ReportRowDropLine({
  sectionId,
  rowKey,
  position,
  active,
  label,
  onDragOver,
  onDragLeave,
  onDrop
}: {
  sectionId: string;
  rowKey: string;
  position: ReportRowInsertPosition;
  active: boolean;
  label?: string;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}): JSX.Element {
  return (
    <div
      className={`report-row-drop-line ${active ? "active" : ""}`}
      data-testid={`report-row-drop-${position}-${rowKey}`}
      data-section-id={sectionId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className="report-row-drop-line-bar" />
      {active ? <span className="report-row-drop-line-label">{label ?? "拖拽插入"}</span> : null}
    </div>
  );
}

export function ReportSectionCanvas({
  doc,
  item,
  projection,
  selection,
  engine,
  dataVersion,
  lazyRootRef,
  canvasInsertPreview,
  canvasDrag,
  canvasResize,
  canvasGuides,
  onSelectNode,
  onSelectNodes,
  onSelectSection,
  onUpdateInsertPreview,
  onDropInsertItem,
  onStartCanvasDrag,
  onStartCanvasResize,
  onAutoTidy
}: {
  doc: VDoc;
  item: FlattenedReportSection;
  projection: ReportSectionCanvasProjection;
  selection: string[];
  engine: DataEngine;
  dataVersion: number | string;
  lazyRootRef: RefObject<HTMLDivElement>;
  canvasInsertPreview: ReportCanvasInsertPreviewState | null;
  canvasDrag: ReportCanvasDragState | null;
  canvasResize: ReportCanvasResizeState | null;
  canvasGuides: ReportCanvasGuide[];
  onSelectNode: (nodeId: string, multi: boolean) => void;
  onSelectNodes: (nodeIds: string[], primaryId: string | undefined, additive: boolean) => void;
  onSelectSection: () => void;
  onUpdateInsertPreview: (pageIndex: number, item: ReportInsertItem | undefined, point?: { x: number; y: number } | null) => void;
  onDropInsertItem: (pageIndex: number, item: ReportInsertItem, point: { x: number; y: number }) => void;
  onStartCanvasDrag: (sectionId: string, block: ReportSectionCanvasBlock, event: ReactPointerEvent<HTMLDivElement>) => void;
  onStartCanvasResize: (sectionId: string, block: ReportSectionCanvasBlock, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onAutoTidy: (sectionId: string) => void;
}): JSX.Element {
  const selectedBlockIds = selection.filter((nodeId) => projection.blocks.some((block) => block.node.id === nodeId));
  const nodeDataDoc = useMemo(
    () => ({
      dataSources: doc.dataSources ?? [],
      queries: doc.queries ?? [],
      filters: doc.filters ?? [],
      templateVariables: doc.templateVariables ?? []
    }),
    [doc.dataSources, doc.filters, doc.queries, doc.templateVariables]
  );
  const assetDoc = useMemo(() => ({ assets: doc.assets ?? [] }), [doc.assets]);
  const [marquee, setMarquee] = useState<ReportCanvasMarqueeState | null>(null);
  const getCanvasPagePoint = (target: HTMLDivElement, clientX: number, clientY: number): { x: number; y: number } => {
    const bounds = target.getBoundingClientRect();
    const safeClientX = Number.isFinite(clientX) ? clientX : bounds.left + bounds.width / 2;
    const safeClientY = Number.isFinite(clientY) ? clientY : bounds.top + bounds.height / 2;
    return {
      x: Math.round(safeClientX - bounds.left),
      y: Math.round(safeClientY - bounds.top)
    };
  };
  const resolvePageSelection = (pageBlocks: ReportSectionCanvasBlock[], rect: CanvasSelectionRect, additive: boolean): void => {
    const ids = resolveCanvasSelectionIds(
      pageBlocks.map((block) => ({
        id: block.node.id,
        left: block.left,
        top: block.topWithinPage,
        width: block.width,
        height: block.height
      })),
      rect
    );
    if (ids.length === 0) {
      if (!additive) {
        onSelectSection();
      }
      return;
    }
    onSelectNodes(ids, ids[ids.length - 1], additive);
  };
  return (
    <div className="report-section-canvas-stage">
      <div className="report-section-canvas-toolbar" data-testid={`report-canvas-toolbar-${item.section.id}`}>
        <div className="report-section-canvas-toolbar-group">
          <span className="report-section-canvas-toolbar-title">章节画布</span>
          {selectedBlockIds.length >= 2 ? <span className="chip report-section-canvas-toolbar-chip">{`已选 ${selectedBlockIds.length} 项`}</span> : null}
          <button className="btn mini-btn" onClick={() => onAutoTidy(item.section.id)}>
            自动整理
          </button>
        </div>
      </div>
      {projection.pages.map((page) => (
        <div key={`${item.section.id}_canvas_${page.index}`} className="report-section-canvas-page-wrap">
          <div className="report-section-canvas-page-meta row" style={{ justifyContent: "space-between" }}>
            <span>{`画布页 ${page.index + 1}`}</span>
            <span className="muted">从插入面板拖入组件，拖动块即可移动，拖右下角缩放</span>
          </div>
          <div
            className="report-section-canvas-page"
            data-testid={`report-canvas-page-${item.section.id}-${page.index}`}
            style={{ width: projection.config.widthPx, minHeight: page.height, height: page.height }}
            onDragOver={(event) => {
              const insertItem = decodeReportInsertItem(event.dataTransfer);
              if (!insertItem) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              onUpdateInsertPreview(page.index, insertItem, getCanvasPagePoint(event.currentTarget, event.clientX, event.clientY));
            }}
            onDrop={(event) => {
              const insertItem = decodeReportInsertItem(event.dataTransfer);
              clearReportInsertItemDrag();
              onUpdateInsertPreview(page.index, undefined, null);
              if (!insertItem) {
                return;
              }
              event.preventDefault();
              onDropInsertItem(page.index, insertItem, getCanvasPagePoint(event.currentTarget, event.clientX, event.clientY));
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                return;
              }
              onUpdateInsertPreview(page.index, undefined, null);
            }}
            onMouseDown={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest(".report-canvas-block-frame")) {
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              setMarquee({
                pageIndex: page.index,
                startX: event.clientX - bounds.left,
                startY: event.clientY - bounds.top,
                currentX: event.clientX - bounds.left,
                currentY: event.clientY - bounds.top,
                additive: isAdditiveSelectionModifier(event)
              });
            }}
            onMouseMove={(event) => {
              if (!marquee || marquee.pageIndex !== page.index) {
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              setMarquee((current) =>
                current && current.pageIndex === page.index
                  ? {
                      ...current,
                      currentX: event.clientX - bounds.left,
                      currentY: event.clientY - bounds.top
                    }
                  : current
              );
            }}
            onMouseUp={(event) => {
              if (!marquee || marquee.pageIndex !== page.index) {
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              const currentX = event.clientX - bounds.left;
              const currentY = event.clientY - bounds.top;
              const rect = buildCanvasSelectionRect(marquee.startX, marquee.startY, currentX, currentY);
              setMarquee(null);
              if (!isCanvasSelectionGesture(rect)) {
                onSelectSection();
                return;
              }
              resolvePageSelection(page.blocks, rect, marquee.additive);
            }}
          >
            <div
              className="report-section-canvas-safezone"
              style={{
                top: projection.config.paddingPx,
                left: projection.config.paddingPx,
                right: projection.config.paddingPx,
                bottom: projection.config.paddingPx
              }}
            />
            {canvasGuides
              .filter((guide) => guide.pageIndex === page.index)
              .map((guide, index) => (
                <span
                  key={`${page.index}_${guide.orientation}_${guide.position}_${index}`}
                  className={`report-canvas-guide-line ${guide.orientation === "vertical" ? "is-vertical" : "is-horizontal"}`}
                  data-testid={`report-canvas-guide-${guide.orientation}-${page.index}`}
                  style={guide.orientation === "vertical" ? { left: guide.position } : { top: guide.position }}
                />
              ))}
            {page.blocks.length === 0 ? <div className="report-section-canvas-empty muted">从插入面板拖入图表、表格或文本到本章内容区</div> : null}
            {marquee && marquee.pageIndex === page.index ? (
              <div
                className="canvas-selection-rect canvas-selection-rect-report"
                data-testid={`report-canvas-marquee-${item.section.id}-${page.index}`}
                style={buildCanvasSelectionRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY)}
              />
            ) : null}
            {page.blocks.map((block) => {
              const activeDrag = Boolean(canvasDrag?.selectedNodeIds.includes(block.node.id));
              const activeResize = canvasResize?.nodeId === block.node.id;
              const dragDx = activeDrag ? (canvasDrag?.previewLeft ?? 0) - (canvasDrag?.startLeft ?? 0) : 0;
              const dragDy = activeDrag ? (canvasDrag?.previewTop ?? 0) - (canvasDrag?.startTop ?? 0) : 0;
              const width = activeResize ? canvasResize.previewWidth : block.width;
              const height = activeResize ? canvasResize.previewHeight : block.height;
              return (
                <div
                  key={`${item.section.id}_${block.node.id}`}
                  className={`report-canvas-block-frame ${
                    selection.includes(block.node.id) ? "is-selected" : ""
                  } ${activeDrag || activeResize ? "is-transforming" : ""}`}
                  data-testid={`report-canvas-block-${block.node.id}`}
                  style={{
                    left: block.left,
                    top: block.topWithinPage,
                    width,
                    height,
                    transform: activeDrag ? `translate(${dragDx}px, ${dragDy}px)` : undefined,
                    zIndex: activeDrag || activeResize ? 6 : selection.includes(block.node.id) ? 4 : 2
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest(".report-canvas-resize-handle")) {
                      return;
                    }
                    onStartCanvasDrag(item.section.id, block, event);
                  }}
                >
                  <button
                    className="report-canvas-resize-handle"
                    aria-label={`缩放画布块：${describeReportBlock(block.node)}`}
                    onPointerDown={(event) => onStartCanvasResize(item.section.id, block, event)}
                  />
                  <ReportBlock
                    dataDoc={nodeDataDoc}
                    assetDoc={assetDoc}
                    block={block.node}
                    selected={selection.includes(block.node.id)}
                    onSelect={(multi) => onSelectNode(block.node.id, multi)}
                    engine={engine}
                    dataVersion={dataVersion}
                    lazyRootRef={lazyRootRef}
                    preferredHeight={Math.max(120, Math.round(height))}
                  />
                </div>
              );
            })}
            {canvasInsertPreview && canvasInsertPreview.pageIndex === page.index ? (
              <div
                className="dashboard-insert-preview card"
                data-testid={`report-insert-preview-${item.section.id}-${page.index}`}
                style={{
                  left: canvasInsertPreview.rect.left,
                  top: canvasInsertPreview.rect.top,
                  width: canvasInsertPreview.rect.width,
                  height: canvasInsertPreview.rect.height
                }}
              >
                <span className="dashboard-insert-preview-label">{canvasInsertPreview.label}</span>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportStructurePanel({
  item,
  rows,
  rowPreview,
  rowDrag,
  rowDropPreview,
  selection,
  onPreviewLayoutPreset,
  onClearPreview,
  onApplyLayoutPreset,
  onAddChart,
  onSwap,
  onMove,
  onReorderRowByDrag,
  onMoveBlockBetweenRows,
  onSetRowPreview,
  onUpdateRowDropPreview,
  onClearRowDropPreview,
  onSetRowDrag,
  onApplyInsertPreset
}: {
  item: FlattenedReportSection;
  rows: ReportGridRow[];
  rowPreview: ReportRowPreviewState | null;
  rowDrag: ReportRowDragState | null;
  rowDropPreview: ReportRowDropLinePreview | null;
  selection: string[];
  onPreviewLayoutPreset: (sectionId: string, row: ReportGridRow, preset: ReportRowLayoutPreset) => void;
  onClearPreview: (sectionId?: string, rowKey?: string, mode?: ReportRowPreviewState["mode"]) => void;
  onApplyLayoutPreset: (sectionId: string, rowKey: string, preset: ReportRowLayoutPreset) => void;
  onAddChart: (sectionId: string, rowKey: string) => void;
  onSwap: (sectionId: string, rowKey: string) => void;
  onMove: (sectionId: string, rowKey: string, direction: ReportRowMoveDirection) => void;
  onReorderRowByDrag: (sectionId: string, rowKey: string, draggedNodeId: string, targetNodeId: string) => void;
  onMoveBlockBetweenRows: (sectionId: string, draggedNodeId: string, targetRowKey: string, position: ReportRowInsertPosition) => void;
  onSetRowPreview: (preview: ReportRowPreviewState | null) => void;
  onUpdateRowDropPreview: (preview: ReportRowDropLinePreview | null) => void;
  onClearRowDropPreview: (sectionId?: string, rowKey?: string, position?: ReportRowInsertPosition) => void;
  onSetRowDrag: (state: ReportRowDragState | null) => void;
  onApplyInsertPreset: (sectionId: string, anchor: ReportInsertAnchor, presetId: ReportInsertPresetId) => void;
}): JSX.Element {
  return (
    <div className="report-structure-panel">
      <div className="row report-structure-panel-head" style={{ justifyContent: "space-between" }}>
        <strong>结构整理</strong>
        <span className="muted">需要更精细的排版时，再用这一层进行行级调整</span>
      </div>
      {rows.length === 0 ? <div className="muted">当前章节暂无块内容</div> : null}
      {rows.map((row, rowIndex) => (
        <div key={`${item.section.id}_${row.key}`} className="report-row-stack">
          {rowIndex === 0 ? (
            <ReportRowDropLine
              sectionId={item.section.id}
              rowKey={row.key}
              position="before"
              active={Boolean(rowDrag && rowDropPreview?.sectionId === item.section.id && rowDropPreview.rowKey === row.key && rowDropPreview.position === "before")}
              label={rowDropPreview?.sectionId === item.section.id && rowDropPreview.rowKey === row.key && rowDropPreview.position === "before" ? rowDropPreview.label : undefined}
              onDragOver={(event) => {
                if (!rowDrag || rowDrag.sectionId !== item.section.id) {
                  return;
                }
                event.preventDefault();
                onClearPreview(item.section.id);
                onUpdateRowDropPreview({
                  sectionId: item.section.id,
                  rowKey: row.key,
                  position: "before",
                  label: "插入到此行前"
                });
              }}
              onDragLeave={() => onClearRowDropPreview(item.section.id, row.key, "before")}
              onDrop={(event) => {
                if (!rowDrag || rowDrag.sectionId !== item.section.id) {
                  return;
                }
                event.preventDefault();
                onMoveBlockBetweenRows(item.section.id, rowDrag.nodeId, row.key, "before");
              }}
            />
          ) : null}
          <ReportRowActionBar
            row={row}
            rowIndex={rowIndex}
            rowCount={rows.length}
            sectionId={item.section.id}
            previewLabel={rowPreview && rowPreview.sectionId === item.section.id && rowPreview.rowKey === row.key ? rowPreview.label : undefined}
            onPreviewLayoutPreset={onPreviewLayoutPreset}
            onClearPreview={onClearPreview}
            onApplyLayoutPreset={onApplyLayoutPreset}
            onAddChart={onAddChart}
            onSwap={onSwap}
            onMove={onMove}
          />
          <div className={`report-row-grid report-row-grid-compact ${rowPreview && rowPreview.sectionId === item.section.id && rowPreview.rowKey === row.key ? "is-previewing" : ""}`}>
            {rowPreview && rowPreview.sectionId === item.section.id && rowPreview.rowKey === row.key ? <ReportRowPreviewOverlay row={row} preview={rowPreview} /> : null}
            {row.items.map((rowItem) => (
              <div
                key={rowItem.node.id}
                className={`report-row-cell report-row-cell-compact is-draggable ${
                  rowDrag?.sectionId === item.section.id && rowDrag.rowKey === row.key && rowDrag.nodeId === rowItem.node.id ? "is-dragging" : ""
                } ${selection.includes(rowItem.node.id) ? "is-selected" : ""}`}
                data-testid={`report-row-cell-${row.key}-${rowItem.node.id}`}
                style={{ gridColumn: `${rowItem.gx + 1} / span ${rowItem.gw}` }}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer?.setData("text/plain", rowItem.node.id);
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                  }
                  onClearPreview(item.section.id);
                  onClearRowDropPreview(item.section.id);
                  onSetRowDrag({ sectionId: item.section.id, rowKey: row.key, nodeId: rowItem.node.id });
                }}
                onDragEnd={() => {
                  onSetRowDrag(null);
                  onClearRowDropPreview(item.section.id);
                  onClearPreview(item.section.id, row.key, "drag");
                }}
                onDragOver={(event) => {
                  if (!rowDrag || rowDrag.sectionId !== item.section.id || rowDrag.rowKey !== row.key || rowDrag.nodeId === rowItem.node.id) {
                    return;
                  }
                  const previewOrder = buildReportRowSwapOrder(row, rowDrag.nodeId, rowItem.node.id);
                  if (!previewOrder) {
                    return;
                  }
                  event.preventDefault();
                  onClearRowDropPreview(item.section.id);
                  onSetRowPreview({
                    sectionId: item.section.id,
                    rowKey: row.key,
                    mode: "drag",
                    label: "拖拽预览",
                    widths: row.items.map((candidate) => candidate.gw),
                    orderedNodeIds: previewOrder
                  });
                }}
                onDrop={(event) => {
                  if (!rowDrag || rowDrag.sectionId !== item.section.id || rowDrag.rowKey !== row.key) {
                    return;
                  }
                  event.preventDefault();
                  onReorderRowByDrag(item.section.id, row.key, rowDrag.nodeId, rowItem.node.id);
                }}
              >
                <ReportStructureMiniCard node={rowItem.node} />
              </div>
            ))}
          </div>
          <ReportRowDropLine
            sectionId={item.section.id}
            rowKey={row.key}
            position="after"
            active={Boolean(rowDrag && rowDropPreview?.sectionId === item.section.id && rowDropPreview.rowKey === row.key && rowDropPreview.position === "after")}
            label={rowDropPreview?.sectionId === item.section.id && rowDropPreview.rowKey === row.key && rowDropPreview.position === "after" ? rowDropPreview.label : undefined}
            onDragOver={(event) => {
              if (!rowDrag || rowDrag.sectionId !== item.section.id) {
                return;
              }
              event.preventDefault();
              onClearPreview(item.section.id);
              onUpdateRowDropPreview({
                sectionId: item.section.id,
                rowKey: row.key,
                position: "after",
                label: "插入到此行后"
              });
            }}
            onDragLeave={() => onClearRowDropPreview(item.section.id, row.key, "after")}
            onDrop={(event) => {
              if (!rowDrag || rowDrag.sectionId !== item.section.id) {
                return;
              }
              event.preventDefault();
              onMoveBlockBetweenRows(item.section.id, rowDrag.nodeId, row.key, "after");
            }}
          />
          <ReportInsertPresetBar label="在此后插入" compact sectionId={item.section.id} anchor={{ kind: "after-row", rowKey: row.key }} onInsert={onApplyInsertPreset} />
        </div>
      ))}
    </div>
  );
}

function ReportStructureMiniCard({ node }: { node: VNode }): JSX.Element {
  return (
    <div className="report-structure-mini-card">
      <span className="report-structure-mini-kind">{node.kind}</span>
      <strong>{describeReportBlock(node)}</strong>
    </div>
  );
}

export function ReportInsertPresetBar({
  label,
  sectionId,
  anchor,
  compact = false,
  onInsert
}: {
  label: string;
  sectionId: string;
  anchor: ReportInsertAnchor;
  compact?: boolean;
  onInsert: (sectionId: string, anchor: ReportInsertAnchor, presetId: ReportInsertPresetId) => void;
}): JSX.Element {
  return (
    <div
      className={`report-insert-bar ${compact ? "compact" : ""}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="report-insert-bar-label">{label}</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {REPORT_INSERT_PRESETS.map((preset) => (
          <button
            key={`${sectionId}_${anchor.kind}_${anchor.rowKey ?? "na"}_${preset.id}`}
            className="btn mini-btn report-insert-btn"
            title={preset.description}
            aria-label={`${label}：${preset.label}`}
            onClick={() => onInsert(sectionId, anchor, preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const areReportBlockPropsEqual = (
  prev: Parameters<typeof ReportBlockInner>[0],
  next: Parameters<typeof ReportBlockInner>[0]
): boolean =>
  prev.dataDoc === next.dataDoc &&
  prev.assetDoc === next.assetDoc &&
  prev.block === next.block &&
  prev.selected === next.selected &&
  prev.engine === next.engine &&
  prev.dataVersion === next.dataVersion &&
  prev.lazyRootRef === next.lazyRootRef &&
  prev.preferredHeight === next.preferredHeight;

function ReportBlockInner({
  dataDoc,
  assetDoc,
  block,
  selected,
  onSelect,
  engine,
  dataVersion,
  lazyRootRef,
  preferredHeight
}: {
  dataDoc: {
    dataSources: VDoc["dataSources"];
    queries: VDoc["queries"];
    filters: VDoc["filters"];
    templateVariables: VDoc["templateVariables"];
  };
  assetDoc: Pick<VDoc, "assets">;
  block: VNode;
  selected: boolean;
  onSelect: (multi: boolean) => void;
  engine: DataEngine;
  dataVersion: number | string;
  lazyRootRef: RefObject<HTMLDivElement>;
  preferredHeight: number;
}): JSX.Element {
  const { rows, loading, error } = useNodeRows(dataDoc, block, engine, dataVersion);
  const bodyHeight = Math.max(120, Math.round(preferredHeight - 18));
  const showOuterTitle = shouldRenderOuterNodeTitle(block);
  const blockTitle = block.kind === "image" ? resolveImageNodeTitle(assetDoc, block) : resolveNodeDisplayTitle(block);
  const style = {
    margin: 0,
    height: preferredHeight,
    ...resolveNodeSurfaceStyle(block.style),
    ...(selected ? { borderColor: "#2563eb", boxShadow: "0 0 0 2px rgba(37, 99, 235, .2)" } : {})
  };

  return (
    <div className={`block report-node-surface ${block.layout?.lock ? "is-locked" : ""}`} style={style} onClick={(event) => onSelect(isAdditiveSelectionModifier(event))}>
      {selected ? <div className="report-node-active-wash" /> : null}
      {block.kind !== "text" && showOuterTitle ? (
        <div className={`node-floating-label ${selected ? "show" : ""}`} style={resolveTitleTextStyle({ fontSize: 12, bold: true }, resolveNodeTitleStyle(block))}>
          {blockTitle}
        </div>
      ) : null}
      {block.kind === "text" ? (
        <NodeTextBlock node={block} />
      ) : block.kind === "table" ? (
        loading || error ? (
          <NodeDataState loading={loading} error={error} remote={isRemoteDataNode(dataDoc, block)} />
        ) : (
          <TableView spec={block.props as TableSpec} rows={rows} height={bodyHeight} />
        )
      ) : block.kind === "chart" ? (
        loading || error ? (
          <NodeDataState loading={loading} error={error} remote={isRemoteDataNode(dataDoc, block)} />
        ) : (
          <div className="col">
            <LazyChartPanel rootRef={lazyRootRef} height={bodyHeight}>
              <div style={{ width: "100%", height: bodyHeight, position: "relative" }}>
                {selected ? (
                  <div style={{ position: "absolute", top: 6, left: 6, zIndex: 5 }}>
                    <span className="chip">已选中</span>
                  </div>
                ) : null}
                <EChartView spec={block.props as ChartSpec} rows={rows} height={bodyHeight} />
              </div>
            </LazyChartPanel>
          </div>
        )
      ) : block.kind === "image" ? (
        <ReportImageBlock doc={assetDoc} block={block} />
      ) : (
        <div className="muted">暂未支持的块类型: {block.kind}</div>
      )}
    </div>
  );
}

export const ReportBlock = memo(ReportBlockInner, areReportBlockPropsEqual);

function ReportImageBlock({ doc, block }: { doc: Pick<VDoc, "assets">; block: VNode }): JSX.Element {
  const props = (block.props ?? {}) as ImageProps;
  const asset = resolveImageAsset(doc, props.assetId);
  if (!asset?.uri) {
    return <div className="muted">图片资源缺失</div>;
  }
  return (
    <img
      src={asset.uri}
      alt={props.alt ?? asset.name ?? props.title ?? "图片"}
      style={{
        width: "100%",
        height: "100%",
        objectFit: props.fit === "stretch" ? "fill" : props.fit ?? "contain",
        opacity: Math.max(0, Math.min(1, Number(props.opacity ?? 1)))
      }}
    />
  );
}

function LazyChartPanel({
  rootRef,
  height,
  children
}: {
  rootRef: RefObject<HTMLDivElement>;
  height: number;
  children: ReactNode;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) {
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      {
        root: rootRef.current,
        rootMargin: "220px"
      }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [mounted, rootRef]);

  return (
    <div ref={hostRef} style={{ minHeight: height }}>
      {mounted ? children : <div className="muted" style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>图表离屏，滚动到可视区后加载</div>}
    </div>
  );
}

export function MeasuredEntry({
  entryKey,
  onHeight,
  style,
  children
}: {
  entryKey: string;
  onHeight: (entryKey: string, height: number) => void;
  style?: CSSProperties;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const report = (): void => onHeight(entryKey, node.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [entryKey, onHeight]);

  return (
    <div ref={ref} style={style}>
      {children}
    </div>
  );
}

export function ReportPageFrame({
  props,
  pageIndex,
  children
}: {
  props: ReportRuntimeProps;
  pageIndex: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="report-page-frame">
      {props.headerShow ? (
        <div className="report-page-header row" style={{ justifyContent: "space-between" }}>
          <span style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, props.headerStyle)}>{props.headerText || props.reportTitle}</span>
          {props.showPageNumber ? <span className="muted" style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, props.headerStyle)}>Page {pageIndex}</span> : null}
        </div>
      ) : null}
      <div className="report-page-body" style={{ padding: Math.max(0, props.bodyPaddingPx) }}>
        {children}
      </div>
      {props.footerShow ? (
        <div className="report-page-footer row" style={{ justifyContent: "space-between" }}>
          <span className="muted" style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, props.footerStyle)}>{props.footerText || "Visual Document OS"}</span>
          {props.showPageNumber ? <span className="muted" style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, props.footerStyle)}>#{pageIndex}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
