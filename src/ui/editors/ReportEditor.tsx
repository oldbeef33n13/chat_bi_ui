import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import type { ChartSpec, Command, ImageProps, ReportProps, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { EChartView } from "../../runtime/chart/EChartView";
import { TableView } from "../../runtime/table/TableView";
import { HttpAssetRepository } from "../api/http-asset-repository";
import { FloatingLayer } from "../components/FloatingLayer";
import { EditorInsertPanel, type EditorInsertPanelItem } from "../components/EditorInsertPanel";
import { NodeDataState } from "../components/NodeDataState";
import { NodeTextBlock } from "../components/NodeTextBlock";
import { useNodeRows } from "../hooks/use-node-rows";
import { useDataEngine } from "../hooks/use-data-engine";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import {
  createEditorTraceId,
  emitEditorTelemetry,
  emitEditorTelemetryError,
  type EditorSemanticAction,
  type EditorTelemetryTriggerSource
} from "../telemetry/editor-telemetry";
import { computeVirtualWindow } from "../utils/report-virtual";
import { buildReportGridRows, type ReportGridRow } from "../utils/report-layout";
import { buildReportInsertPresetPlan, REPORT_INSERT_PRESETS, type ReportInsertAnchor, type ReportInsertPresetId } from "../utils/report-insert";
import {
  buildReportCanvasAutoTidyPlan,
  buildReportCanvasDuplicatePlan,
  buildReportCanvasMovePlan,
  buildReportCanvasResizePlan,
  buildReportCanvasSelectionDuplicatePlan,
  buildReportCanvasSelectionMovePlan,
  buildReportSectionCanvasProjection,
  resolveReportCanvasSnapPreview,
  resolveReportSectionCanvasConfig,
  type ReportCanvasLayoutDraft,
  type ReportCanvasGuide,
  type ReportSectionCanvasBlock,
  type ReportSectionCanvasProjection
} from "../utils/report-canvas";
import {
  buildReportBlockInsertBetweenRowsPlan,
  buildReportRowAddChartPlan,
  buildReportRowLayoutPresetPlan,
  buildReportRowMovePlan,
  buildReportRowReorderPlan,
  buildReportRowSwapOrder,
  buildReportRowSwapPlan,
  listReportRowLayoutPresets,
  type ReportRowInsertPosition,
  type ReportRowLayoutPreset,
  type ReportRowMoveDirection
} from "../utils/report-row-actions";
import { findNodeById, resolveAncestorIdByKind } from "../utils/node-tree";
import { flattenReportSections, getTopReportSections, type FlattenedReportSection } from "../utils/report-sections";
import { buildLayoutBatchCommands, planLayoutBatchTargets, type LayoutBatchAction } from "../utils/layout-batch";
import { buildAlignCommandResult, type AlignKind } from "../utils/alignment";
import { buildCanvasSelectionRect, isCanvasSelectionGesture, resolveCanvasSelectionIds, type CanvasSelectionRect } from "../utils/canvas-selection";
import { upsertDocAsset } from "../utils/doc-assets";
import { isAdditiveSelectionModifier, isTypingTarget } from "../utils/editor-input";
import { resolveSideInsertPanelStyle } from "../utils/editor-insert-layout";
import {
  buildReportInsertItemPlan,
  clearReportInsertItemDrag,
  decodeReportInsertItem,
  encodeReportInsertItem,
  resolveReportInsertGroups,
  resolveReportInsertPreviewRect,
  type ReportInsertItem
} from "../utils/report-insert-panel";
import { resolveImageAsset, resolveImageNodeTitle } from "../utils/dashboard-surface";
import {
  isRemoteDataNode,
  resolveNodeDisplayTitle,
  resolveNodeSurfaceStyle,
  resolveNodeTitleStyle,
  resolveTitleTextStyle,
  shouldRenderOuterNodeTitle
} from "../utils/node-style";

interface ReportEditorProps {
  doc: VDoc;
}

interface ReportRuntimeProps extends ReportProps {
  reportTitle: string;
  tocShow: boolean;
  coverEnabled: boolean;
  coverTitle: string;
  coverSubtitle: string;
  coverNote: string;
  summaryEnabled: boolean;
  summaryTitle: string;
  summaryText: string;
  headerText: string;
  footerText: string;
  showPageNumber: boolean;
  paginationStrategy: "section" | "continuous";
  marginPreset: "narrow" | "normal" | "wide" | "custom";
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  bodyPaddingPx: number;
  sectionGapPx: number;
  blockGapPx: number;
}

interface ReportEntryBase {
  key: string;
  height: number;
  pageIndex: number;
}

interface CoverEntry extends ReportEntryBase {
  kind: "cover";
}

interface SectionHeaderEntry extends ReportEntryBase {
  kind: "section";
  item: FlattenedReportSection;
  rows: ReportGridRow[];
  canvasHeight: number;
}

interface SummaryEntry extends ReportEntryBase {
  kind: "summary";
}

interface TocEntry extends ReportEntryBase {
  kind: "toc";
}

type ReportEntry = CoverEntry | TocEntry | SectionHeaderEntry | SummaryEntry;

interface ExecutableReportPlan {
  commands: Command[];
  summary: string;
  semanticAction: EditorSemanticAction;
  primaryNodeId?: string;
  selectedNodeIds?: string[];
}

interface ReportRowPreviewState {
  sectionId: string;
  rowKey: string;
  mode: "layout" | "drag";
  label: string;
  widths: number[];
  orderedNodeIds: string[];
}

interface ReportRowDragState {
  sectionId: string;
  rowKey: string;
  nodeId: string;
}

interface ReportRowDropLinePreview {
  sectionId: string;
  rowKey: string;
  position: ReportRowInsertPosition;
  label: string;
}

interface ReportCanvasDragState {
  sectionId: string;
  nodeId: string;
  selectedNodeIds: string[];
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  previewLeft: number;
  previewTop: number;
  width: number;
  height: number;
  duplicateOnDrop: boolean;
}

interface ReportCanvasResizeState {
  sectionId: string;
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
  previewWidth: number;
  previewHeight: number;
}

interface ReportCanvasGuidePreview {
  sectionId: string;
  guides: ReportCanvasGuide[];
}

interface ReportCanvasMarqueeState {
  pageIndex: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
}

interface ReportCanvasInsertPreviewState {
  sectionId: string;
  pageIndex: number;
  itemId: string;
  label: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * Report 编辑器：
 * - 支持封面/目录/页眉页脚/总结页
 * - 支持大文档虚拟化渲染
 * - 支持块级插入与导出
 */
export function ReportEditor({ doc }: ReportEditorProps): JSX.Element {
  const store = useEditorStore();
  const selection = useSignalValue(store.selection);
  const ui = useSignalValue(store.ui);
  const assetRepoRef = useRef(new HttpAssetRepository("/api/v1"));
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const sections = useMemo(() => getTopReportSections(doc.root), [doc.root]);
  const flatSections = useMemo(() => flattenReportSections(sections), [sections]);
  const showReportConfig = Boolean((doc.root.props as Record<string, unknown>)?.editorShowReportConfig);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(620);
  const reportProps = useMemo(() => normalizeReportProps(doc), [doc]);
  const autoSummary = useMemo(() => buildAutoSummary(doc), [doc]);
  const sectionPageMap = useMemo(() => buildPreviewSectionPageMap(reportProps, flatSections), [flatSections, reportProps]);
  const selectedSectionId = useMemo(() => resolveAncestorIdByKind(doc.root, selection.primaryId, "section"), [doc.root, selection.primaryId]);
  const selectedNode = useMemo(() => (selection.primaryId ? findNodeById(doc.root, selection.primaryId) : undefined), [doc.root, selection.primaryId]);
  const lastAutoScrollSectionRef = useRef<string | undefined>(undefined);
  const lastScrollSyncSectionRef = useRef<string | undefined>(undefined);
  const [layoutHint, setLayoutHint] = useState("");
  const [insertSearch, setInsertSearch] = useState("");
  const [rowPreview, setRowPreview] = useState<ReportRowPreviewState | null>(null);
  const [rowDrag, setRowDrag] = useState<ReportRowDragState | null>(null);
  const [rowDropPreview, setRowDropPreview] = useState<ReportRowDropLinePreview | null>(null);
  const [canvasInsertPreview, setCanvasInsertPreview] = useState<ReportCanvasInsertPreviewState | null>(null);
  const [canvasDrag, setCanvasDrag] = useState<ReportCanvasDragState | null>(null);
  const [canvasResize, setCanvasResize] = useState<ReportCanvasResizeState | null>(null);
  const [canvasGuides, setCanvasGuides] = useState<ReportCanvasGuidePreview | null>(null);
  const [structurePanelOpenSections, setStructurePanelOpenSections] = useState<Record<string, boolean>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasDragRef = useRef<ReportCanvasDragState | null>(null);
  const canvasResizeRef = useRef<ReportCanvasResizeState | null>(null);
  const canvasPreviewFrameRef = useRef<number | null>(null);
  const canvasPreviewEventRef = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageInsertRef = useRef<{ sectionId: string; point?: { x: number; y: number } } | null>(null);

  const updateReportProps = (partial: Partial<ReportRuntimeProps>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: doc.root.id,
        props: partial as Record<string, unknown>
      },
      { summary, mergeWindowMs }
    );
  };

  const sectionCanvasMap = useMemo(() => {
    const map = new Map<string, ReportSectionCanvasProjection>();
    flatSections.forEach((item) => {
      map.set(item.section.id, buildReportSectionCanvasProjection(item.blocks, resolveReportSectionCanvasConfig(item.section, reportProps)));
    });
    return map;
  }, [flatSections, reportProps]);
  const reportInsertGroups = useMemo(
    () =>
      resolveReportInsertGroups({
        recentItemIds: ui.reportRecentInsertItemIds
      }).map((group) => ({
        id: group.id,
        label: group.label,
        items: group.items.map(
          (item): EditorInsertPanelItem & { source: ReportInsertItem } => ({
            id: item.id,
            label: item.label,
            description: item.description,
            icon: item.icon,
            badge: item.badge,
            accent: item.kind === "image",
            draggable: item.kind !== "image",
            title: item.kind === "image" ? "点击上传后插入" : "点击插入到当前章节，也可拖到内容区",
            source: item
          })
        )
      })),
    [ui.reportRecentInsertItemIds]
  );
  const activeInsertSectionId = selectedSectionId ?? flatSections[0]?.section.id;

  const setCanvasSelection = useCallback(
    (nodeIds: string[], primaryId?: string, additive = false) => {
      const nextIds = additive ? [...new Set([...selection.selectedIds, ...nodeIds])] : [...new Set(nodeIds)];
      store.setSelectionIds(nextIds, primaryId);
    },
    [selection.selectedIds, store]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || isTypingTarget(event.target)) {
        return;
      }
      if (
        selection.selectedIds.length === 0 &&
        !rowPreview &&
        !rowDrag &&
        !rowDropPreview &&
        !canvasInsertPreview &&
        !canvasDrag &&
        !canvasResize
      ) {
        return;
      }
      setRowPreview(null);
      setRowDrag(null);
      setRowDropPreview(null);
      setCanvasInsertPreview(null);
      setCanvasDrag(null);
      setCanvasResize(null);
      setCanvasGuides(null);
      store.clearSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canvasDrag, canvasInsertPreview, canvasResize, rowDrag, rowDropPreview, rowPreview, selection.selectedIds.length, store]);

  useEffect(() => {
    setStructurePanelOpenSections({});
  }, [doc.docId]);

  const toggleStructurePanel = useCallback((sectionId: string): void => {
    setStructurePanelOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId]
    }));
  }, []);

  const entries = useMemo<ReportEntry[]>(() => {
    const list: ReportEntry[] = [];
    let pageIndex = 0;

    if (reportProps.coverEnabled) {
      pageIndex += 1;
      list.push({
        kind: "cover",
        key: "report_cover",
        pageIndex,
        height: measuredHeights.report_cover ?? 340
      });
    }

    if (reportProps.tocShow) {
      pageIndex += 1;
      list.push({
        kind: "toc",
        key: "report_toc",
        pageIndex,
        height: measuredHeights.report_toc ?? 260
      });
    }

    flatSections.forEach((item) => {
      pageIndex += 1;
      const sectionPage = pageIndex;
      const rows = buildReportGridRows(item.blocks);
      const canvas = sectionCanvasMap.get(item.section.id);
      const fallbackCanvasHeight = Math.max(320, rows.reduce((sum, row) => sum + row.maxHeight + reportProps.blockGapPx, 0) + 56);
      list.push({
        kind: "section",
        key: `section_${item.section.id}`,
        item,
        rows,
        canvasHeight: canvas?.totalHeight ?? fallbackCanvasHeight,
        pageIndex: sectionPage,
        height:
          measuredHeights[`section_${item.section.id}`] ??
          (item.level === 1 ? 108 + reportProps.sectionGapPx : 96 + reportProps.sectionGapPx) +
            (canvas?.totalHeight ?? fallbackCanvasHeight) +
            rows.length * 72
      });
    });

    if (reportProps.summaryEnabled) {
      pageIndex += 1;
      list.push({
        kind: "summary",
        key: "report_summary",
        pageIndex,
        height: measuredHeights.report_summary ?? 260
      });
    }

    return list;
  }, [flatSections, measuredHeights, reportProps.blockGapPx, reportProps.coverEnabled, reportProps.sectionGapPx, reportProps.summaryEnabled, reportProps.tocShow, sectionCanvasMap]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const update = (): void => setViewportHeight(viewport.clientHeight);
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const { totalHeight, visible } = useMemo(() => computeVirtualWindow(entries, scrollTop, viewportHeight, 420), [entries, scrollTop, viewportHeight]);
  const sectionOffsetMap = useMemo(() => {
    const map = new Map<string, number>();
    let runningTop = 0;
    entries.forEach((entry) => {
      if (entry.kind === "section") {
        map.set(entry.item.section.id, runningTop);
      }
      runningTop += entry.height;
    });
    return map;
  }, [entries]);
  const sectionScrollAnchors = useMemo(
    () =>
      flatSections
        .map((item) => ({ id: item.section.id, top: sectionOffsetMap.get(item.section.id) ?? 0 }))
        .sort((a, b) => a.top - b.top),
    [flatSections, sectionOffsetMap]
  );

  const handleMeasuredHeight = useCallback((entryKey: string, height: number): void => {
    setMeasuredHeights((prev) => {
      const current = prev[entryKey];
      if (current !== undefined && Math.abs(current - height) < 2) {
        return prev;
      }
      return { ...prev, [entryKey]: height };
    });
  }, []);

  useEffect(() => {
    if (!selectedSectionId) {
      lastAutoScrollSectionRef.current = undefined;
      lastScrollSyncSectionRef.current = undefined;
      return;
    }
    if (lastAutoScrollSectionRef.current === selectedSectionId) {
      return;
    }
    const targetTop = sectionOffsetMap.get(selectedSectionId);
    if (targetTop === undefined) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    if (Math.abs(viewport.scrollTop - targetTop) < 12) {
      return;
    }
    viewport.scrollTo({ top: Math.max(0, targetTop - 6), behavior: "smooth" });
    lastAutoScrollSectionRef.current = selectedSectionId;
    lastScrollSyncSectionRef.current = selectedSectionId;
  }, [selectedSectionId, sectionOffsetMap]);

  const resolveSectionByScroll = useCallback(
    (scrollTopValue: number): string | undefined => {
      if (sectionScrollAnchors.length === 0) {
        return undefined;
      }
      const anchor = scrollTopValue + 36;
      let active = sectionScrollAnchors[0]?.id;
      for (const item of sectionScrollAnchors) {
        if (item.top <= anchor) {
          active = item.id;
        } else {
          break;
        }
      }
      return active;
    },
    [sectionScrollAnchors]
  );

  const canSyncSelectionByScroll = !selectedNode || selectedNode.kind === "section";

  const runLayoutBatchAction = (anchorNodeId: string, action: LayoutBatchAction): void => {
    const selectedIds = selection.selectedIds.includes(anchorNodeId) ? selection.selectedIds : [anchorNodeId];
    const targetPlan = planLayoutBatchTargets(doc.root, anchorNodeId, selectedIds, action);
    const primary = targetPlan.targetIds.includes(selection.primaryId ?? "") ? (selection.primaryId ?? anchorNodeId) : anchorNodeId;
    const result = buildLayoutBatchCommands(doc.root, targetPlan.targetIds, action, primary);
    if (result.commands.length === 0) {
      setLayoutHint(targetPlan.reason ?? result.reason ?? "当前选择不支持该操作");
      setTimeout(() => setLayoutHint(""), 1600);
      return;
    }
    const summaryMap: Record<LayoutBatchAction, string> = {
      equalWidth: "report quick equal width",
      equalHeight: "report quick equal height",
      hdistribute: "report quick hdistribute",
      vdistribute: "report quick vdistribute"
    };
    store.executeCommand(
      {
        type: "Transaction",
        commands: result.commands
      },
      { summary: summaryMap[action], mergeWindowMs: 120 }
    );
    const actionHint =
      action === "equalWidth" ? "已统一宽度" : action === "equalHeight" ? "已统一高度" : action === "hdistribute" ? "已水平分布" : "已垂直分布";
    setLayoutHint(targetPlan.autoExpanded ? `${actionHint}（自动扩选 ${targetPlan.targetIds.length} 项）` : actionHint);
    setTimeout(() => setLayoutHint(""), 1600);
  };

  const showTransientHint = (message: string): void => {
    setLayoutHint(message);
    setTimeout(() => setLayoutHint(""), 1600);
  };

  useEffect(() => {
    canvasDragRef.current = canvasDrag;
  }, [canvasDrag]);

  useEffect(() => {
    canvasResizeRef.current = canvasResize;
  }, [canvasResize]);

  const clearRowPreview = (sectionId?: string, rowKey?: string, mode?: ReportRowPreviewState["mode"]): void => {
    setRowPreview((current) => {
      if (!current) {
        return null;
      }
      if (sectionId && current.sectionId !== sectionId) {
        return current;
      }
      if (rowKey && current.rowKey !== rowKey) {
        return current;
      }
      if (mode && current.mode !== mode) {
        return current;
      }
      return null;
    });
  };

  const clearRowDropPreview = (sectionId?: string, rowKey?: string, position?: ReportRowInsertPosition): void => {
    setRowDropPreview((current) => {
      if (!current) {
        return null;
      }
      if (sectionId && current.sectionId !== sectionId) {
        return current;
      }
      if (rowKey && current.rowKey !== rowKey) {
        return current;
      }
      if (position && current.position !== position) {
        return current;
      }
      return null;
    });
  };

  const previewRowLayoutPreset = (sectionId: string, row: ReportGridRow, preset: ReportRowLayoutPreset): void => {
    clearRowDropPreview(sectionId, row.key);
    setRowPreview({
      sectionId,
      rowKey: row.key,
      mode: "layout",
      label: `预览：${preset.label}`,
      widths: preset.widths,
      orderedNodeIds: row.items.map((item) => item.node.id)
    });
  };

  const executeReportPlan = (
    plan: ExecutableReportPlan | null,
    options: {
      action: string;
      triggerSource: EditorTelemetryTriggerSource;
      successMessage: string;
      failureMessage: string;
      context: {
        sectionId: string;
        rowId?: string;
        anchorId?: string;
        presetId?: string;
        nodeId?: string;
      };
      meta?: Record<string, unknown>;
    }
  ): void => {
    const traceId = createEditorTraceId();
    const telemetryContext = {
      docId: doc.docId,
      docType: doc.docType,
      sectionId: options.context.sectionId,
      rowId: options.context.rowId,
      anchorId: options.context.anchorId,
      presetId: options.context.presetId,
      nodeId: options.context.nodeId,
      selectionCount: selection.selectedIds.length,
      trigger: options.triggerSource
    } as const;
    if (!plan) {
      const error = new Error(options.failureMessage);
      emitEditorTelemetryError(
        {
          traceId,
          surface: "report_editor",
          action: options.action,
          triggerSource: options.triggerSource,
          context: telemetryContext
        },
        error
      );
      showTransientHint(`操作失败: ${error.message}`);
      return;
    }
    try {
      plan.semanticAction.traceId = traceId;
      emitEditorTelemetry({
        traceId,
        stage: "click",
        surface: "report_editor",
        action: options.action,
        triggerSource: options.triggerSource,
        success: true,
        context: telemetryContext,
        semanticAction: plan.semanticAction,
        meta: options.meta
      });

      const ok = store.executeCommand(
        {
          type: "Transaction",
          commands: plan.commands
        },
        { summary: plan.summary }
      );
      if (!ok) {
        const error = new Error(store.lastError.value ?? options.failureMessage);
        emitEditorTelemetryError(
          {
            traceId,
            surface: "report_editor",
            action: options.action,
            triggerSource: options.triggerSource,
            context: telemetryContext,
            semanticAction: plan.semanticAction
          },
          error
        );
        showTransientHint(`操作失败: ${error.message}`);
        return;
      }

      if (plan.selectedNodeIds && plan.selectedNodeIds.length > 0) {
        store.setSelectionIds(plan.selectedNodeIds, plan.primaryNodeId);
      } else if (plan.primaryNodeId) {
        store.setSelection(plan.primaryNodeId, false);
      }
      emitEditorTelemetry({
        traceId,
        stage: "apply",
        surface: "report_editor",
        action: options.action,
        triggerSource: options.triggerSource,
        success: true,
        context: telemetryContext,
        semanticAction: plan.semanticAction,
        meta: options.meta
      });
      showTransientHint(options.successMessage);
    } catch (error) {
      emitEditorTelemetryError(
        {
          traceId,
          surface: "report_editor",
          action: options.action,
          triggerSource: options.triggerSource,
          context: telemetryContext,
          semanticAction: plan?.semanticAction
        },
        error
      );
      showTransientHint(`操作失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const applyInsertPreset = (sectionId: string, anchor: ReportInsertAnchor, presetId: ReportInsertPresetId): void => {
    const plan = buildReportInsertPresetPlan(doc, sectionId, anchor, presetId);
    const sectionTitle = flatSections.find((item) => item.section.id === sectionId)?.title ?? "当前章节";
    const presetLabel = REPORT_INSERT_PRESETS.find((item) => item.id === presetId)?.label ?? "布局";
    executeReportPlan(plan, {
      action: "insert_row_template",
      triggerSource: "inline_plus",
      successMessage: `已在${sectionTitle}插入${presetLabel}布局`,
      failureMessage: `未找到可插入的章节 ${sectionId}`,
      context: {
        sectionId,
        rowId: anchor.rowKey,
        anchorId: anchor.kind === "after-row" && anchor.rowKey ? `${sectionId}:${anchor.kind}:${anchor.rowKey}` : `${sectionId}:${anchor.kind}`,
        presetId
      },
      meta: {
        insertedKinds: plan?.semanticAction.payload?.insertedKinds,
        insertedCount: Array.isArray(plan?.semanticAction.payload?.insertedNodeIds) ? plan?.semanticAction.payload?.insertedNodeIds.length : undefined
      }
    });
  };

  const applyRowLayoutPreset = (sectionId: string, rowKey: string, preset: ReportRowLayoutPreset): void => {
    executeReportPlan(buildReportRowLayoutPresetPlan(doc, sectionId, rowKey, preset.id), {
      action: "apply_layout_preset",
      triggerSource: "toolbar",
      successMessage: `已将当前行调整为${preset.label}版式`,
      failureMessage: `当前行不支持 ${preset.label} 布局`,
      context: {
        sectionId,
        rowId: rowKey,
        presetId: preset.id
      },
      meta: {
        presetId: preset.id,
        rowKey
      }
    });
    clearRowDropPreview(sectionId, rowKey);
    clearRowPreview(sectionId, rowKey, "layout");
  };

  const addChartToRow = (sectionId: string, rowKey: string): void => {
    const plan = buildReportRowAddChartPlan(doc, sectionId, rowKey);
    executeReportPlan(plan, {
      action: "insert_block",
      triggerSource: "toolbar",
      successMessage: "已为当前行新增图表",
      failureMessage: "当前行最多支持 4 个并排块",
      context: {
        sectionId,
        rowId: rowKey,
        presetId: typeof plan?.semanticAction.payload?.presetId === "string" ? plan.semanticAction.payload.presetId : undefined
      },
      meta: {
        blockKind: "chart",
        presetId: plan?.semanticAction.payload?.presetId
      }
    });
    clearRowDropPreview(sectionId, rowKey);
    clearRowPreview(sectionId, rowKey);
  };

  const swapRowBlocks = (sectionId: string, rowKey: string): void => {
    executeReportPlan(buildReportRowSwapPlan(doc, sectionId, rowKey), {
      action: "swap_row_blocks",
      triggerSource: "toolbar",
      successMessage: "已左右交换当前行",
      failureMessage: "当前行至少需要两个块才能交换",
      context: {
        sectionId,
        rowId: rowKey
      }
    });
    clearRowDropPreview(sectionId, rowKey);
    clearRowPreview(sectionId, rowKey);
  };

  const moveRow = (sectionId: string, rowKey: string, direction: ReportRowMoveDirection): void => {
    executeReportPlan(buildReportRowMovePlan(doc, sectionId, rowKey, direction), {
      action: "reorder_section",
      triggerSource: "toolbar",
      successMessage: direction === "up" ? "已上移当前行" : "已下移当前行",
      failureMessage: direction === "up" ? "当前行已经在最上方" : "当前行已经在最下方",
      context: {
        sectionId,
        rowId: rowKey
      },
      meta: {
        direction
      }
    });
    clearRowDropPreview(sectionId, rowKey);
    clearRowPreview(sectionId, rowKey);
  };

  const reorderRowByDrag = (sectionId: string, rowKey: string, draggedNodeId: string, targetNodeId: string): void => {
    executeReportPlan(buildReportRowReorderPlan(doc, sectionId, rowKey, draggedNodeId, targetNodeId), {
      action: "move_block",
      triggerSource: "drag_drop",
      successMessage: "已完成行内换位",
      failureMessage: "拖拽换位失败",
      context: {
        sectionId,
        rowId: rowKey
      },
      meta: {
        draggedNodeId,
        targetNodeId
      }
    });
    setRowDrag(null);
    clearRowDropPreview(sectionId, rowKey);
    clearRowPreview(sectionId, rowKey);
  };

  const moveBlockBetweenRows = (sectionId: string, draggedNodeId: string, targetRowKey: string, position: ReportRowInsertPosition): void => {
    executeReportPlan(buildReportBlockInsertBetweenRowsPlan(doc, sectionId, draggedNodeId, targetRowKey, position), {
      action: "move_block",
      triggerSource: "drag_drop",
      successMessage: position === "before" ? "已将块插入到目标行前" : "已将块插入到目标行后",
      failureMessage: "跨行移动失败",
      context: {
        sectionId,
        rowId: targetRowKey
      },
      meta: {
        draggedNodeId,
        targetRowKey,
        placement: position
      }
    });
    setRowDrag(null);
    clearRowDropPreview(sectionId, targetRowKey);
    clearRowPreview(sectionId);
  };

  const runCanvasAlignAction = (sectionId: string, nodeIds: string[], kind: AlignKind): void => {
    const result = buildAlignCommandResult(doc.root, nodeIds, kind);
    if (result.commands.length === 0) {
      const reason =
        result.reason === "need_three_for_distribute"
          ? "分布至少需要 3 个块"
          : result.reason === "mixed_scope"
            ? "请选择同一章节中的块"
            : result.reason === "no_change"
              ? "当前布局无需调整"
              : "至少选择 2 个块";
      showTransientHint(reason);
      return;
    }
    executeReportPlan(
      {
        commands: result.commands,
        summary: `report canvas ${kind}`,
        semanticAction: {
          action: kind === "hdistribute" || kind === "vdistribute" ? "distribute_blocks_on_canvas" : "align_blocks_on_canvas",
          target: {
            docId: doc.docId,
            sectionId
          },
          payload: {
            alignKind: kind,
            nodeIds
          },
          source: "ui"
        }
      },
      {
        action: kind === "hdistribute" || kind === "vdistribute" ? "distribute_blocks_on_canvas" : "align_blocks_on_canvas",
        triggerSource: "toolbar",
        successMessage: "已更新所选块布局",
        failureMessage: "画布布局调整失败",
        context: {
          sectionId
        },
        meta: {
          alignKind: kind,
          selectionCount: nodeIds.length
        }
      }
    );
  };

  const runCanvasBatchAction = (sectionId: string, nodeIds: string[], action: LayoutBatchAction): void => {
    const result = buildLayoutBatchCommands(doc.root, nodeIds, action, selection.primaryId);
    if (result.commands.length === 0) {
      showTransientHint(result.reason ?? "当前选择不支持该操作");
      return;
    }
    executeReportPlan(
      {
        commands: result.commands,
        summary: `report canvas ${action}`,
        semanticAction: {
          action: "align_blocks_on_canvas",
          target: {
            docId: doc.docId,
            sectionId
          },
          payload: {
            batchAction: action,
            nodeIds,
            primaryId: selection.primaryId
          },
          source: "ui"
        }
      },
      {
        action: "align_blocks_on_canvas",
        triggerSource: "toolbar",
        successMessage: action === "equalWidth" ? "已统一宽度" : action === "equalHeight" ? "已统一高度" : "已更新布局",
        failureMessage: "画布批量布局失败",
        context: {
          sectionId
        },
        meta: {
          batchAction: action,
          selectionCount: nodeIds.length
        }
      }
    );
  };

  const runCanvasAutoTidy = (sectionId: string): void => {
    const plan = buildReportCanvasAutoTidyPlan(doc, sectionId, reportProps);
    if (!plan) {
      showTransientHint("未找到当前章节");
      return;
    }
    if (plan.commands.length === 0) {
      showTransientHint("当前章节已较整齐");
      return;
    }
    executeReportPlan(plan, {
      action: "auto_tidy_section",
      triggerSource: "toolbar",
      successMessage: "已整理当前章节版式",
      failureMessage: "自动整理失败",
      context: {
        sectionId
      },
      meta: {
        updatedCount: plan.commands.length
      }
    });
  };

  const insertReportItemFromPanel = (item: ReportInsertItem): void => {
    const sectionId = activeInsertSectionId;
    if (!sectionId) {
      showTransientHint("当前没有可插入的章节");
      return;
    }
    if (item.kind === "image") {
      pendingImageInsertRef.current = { sectionId };
      imageInputRef.current?.click();
      return;
    }
    const sectionTitle = flatSections.find((entry) => entry.section.id === sectionId)?.title ?? "当前章节";
    const plan = buildReportInsertItemPlan({
      doc,
      sectionId,
      item
    });
    executeReportPlan(plan, {
      action: "insert_block",
      triggerSource: "toolbar",
      successMessage: `已在${sectionTitle}插入${item.label}`,
      failureMessage: `未找到可插入的章节 ${sectionId}`,
      context: {
        sectionId,
        nodeId: plan?.primaryNodeId
      },
      meta: {
        blockKind: item.kind,
        insertItemId: item.id
      }
    });
    if (plan) {
      store.rememberReportInsertItem(item.id);
      store.setReportInsertPanelOpen(false);
    }
  };

  const updateCanvasInsertPreview = (
    sectionId: string,
    pageIndex: number,
    projection: ReportSectionCanvasProjection,
    item: ReportInsertItem | undefined,
    point?: { x: number; y: number } | null
  ): void => {
    if (!item || !point) {
      setCanvasInsertPreview(null);
      return;
    }
    setCanvasInsertPreview({
      sectionId,
      pageIndex,
      itemId: item.id,
      label: item.label,
      rect: resolveReportInsertPreviewRect(projection, item, point)
    });
  };

  const insertReportItemOnCanvas = (
    sectionId: string,
    item: ReportInsertItem,
    pageIndex: number,
    point: {
      x: number;
      y: number;
    }
  ): void => {
    if (item.kind === "image") {
      pendingImageInsertRef.current = { sectionId, point };
      imageInputRef.current?.click();
      return;
    }
    const sectionTitle = flatSections.find((entry) => entry.section.id === sectionId)?.title ?? "当前章节";
    const plan = buildReportInsertItemPlan({
      doc,
      sectionId,
      item,
      point
    });
    executeReportPlan(plan, {
      action: "insert_block_on_canvas",
      triggerSource: "drag_drop",
      successMessage: `已在${sectionTitle}插入${item.label}`,
      failureMessage: `未找到可插入的章节 ${sectionId}`,
      context: {
        sectionId,
        nodeId: plan?.primaryNodeId
      },
      meta: {
        blockKind: item.kind,
        insertItemId: item.id,
        canvasPageIndex: pageIndex,
        insertedKinds: plan?.semanticAction.payload?.nodeKind
      }
    });
    if (plan) {
      store.rememberReportInsertItem(item.id);
    }
  };

  const handleReportImagePicked = async (file?: File): Promise<void> => {
    const pendingInsert = pendingImageInsertRef.current;
    pendingImageInsertRef.current = null;
    const imageItem = reportInsertGroups.flatMap((group) => group.items).find((item) => item.source.id === "media.image")?.source;
    if (!file || !pendingInsert || !imageItem) {
      return;
    }
    try {
      const uploaded = await assetRepoRef.current.uploadImage(file);
      const plan = buildReportInsertItemPlan({
        doc,
        sectionId: pendingInsert.sectionId,
        item: imageItem,
        point: pendingInsert.point,
        imageAsset: {
          assetId: uploaded.asset.assetId,
          title: file.name
        }
      });
      const insertedNodeId = plan?.commands.find((command) => command.type === "InsertNode" && command.node?.kind === "image")?.node?.id;
      if (!plan) {
        showTransientHint("图片插入失败");
        return;
      }
      const inserted = store.executeCommand(
        {
          type: "Transaction",
          commands: [
            {
              type: "UpdateDoc",
              doc: {
                assets: upsertDocAsset(doc.assets, uploaded.asset)
              }
            },
            ...plan.commands
          ]
        },
        { summary: plan.summary }
      );
      if (!inserted) {
        showTransientHint("图片插入失败");
        return;
      }
      store.rememberReportInsertItem(imageItem.id);
      if (insertedNodeId) {
        store.setSelection(insertedNodeId, false);
      }
      setCanvasInsertPreview(null);
      showTransientHint(`已插入图片：${file.name}`);
    } catch (error) {
      showTransientHint(error instanceof Error ? error.message : "图片插入失败");
    }
  };

  const startCanvasDrag = (
    sectionId: string,
    block: ReportSectionCanvasBlock,
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    if (block.node.layout?.lock) {
      showTransientHint("当前块已锁定，无法拖动");
      return;
    }
    setCanvasInsertPreview(null);
    clearRowPreview(sectionId);
    clearRowDropPreview(sectionId);
    setCanvasGuides(null);
    const sectionSelection = selection.selectedIds.filter((nodeId) => sectionCanvasMap.get(sectionId)?.blocks.some((item) => item.node.id === nodeId));
    const selectedNodeIds =
      sectionSelection.includes(block.node.id) && sectionSelection.length > 1
        ? sectionSelection.filter((nodeId) => !findNodeById(doc.root, nodeId)?.layout?.lock)
        : [block.node.id];
    store.setSelectionIds(selectedNodeIds, block.node.id);
    setCanvasResize(null);
    const startClientX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const startClientY = Number.isFinite(event.clientY) ? event.clientY : 0;
    const duplicateOnDrop = Boolean(event.altKey || event.getModifierState?.("Alt") || event.nativeEvent.altKey);
    setCanvasDrag({
      sectionId,
      nodeId: block.node.id,
      selectedNodeIds,
      startClientX,
      startClientY,
      startLeft: block.left,
      startTop: block.stackTop,
      previewLeft: block.left,
      previewTop: block.stackTop,
      width: block.width,
      height: block.height,
      duplicateOnDrop
    });
  };

  const startCanvasResize = (
    sectionId: string,
    block: ReportSectionCanvasBlock,
    event: ReactPointerEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    if (block.node.layout?.lock) {
      showTransientHint("当前块已锁定，无法缩放");
      return;
    }
    setCanvasInsertPreview(null);
    clearRowPreview(sectionId);
    clearRowDropPreview(sectionId);
    setCanvasGuides(null);
    store.setSelection(block.node.id, false);
    setCanvasDrag(null);
    const startClientX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const startClientY = Number.isFinite(event.clientY) ? event.clientY : 0;
    setCanvasResize({
      sectionId,
      nodeId: block.node.id,
      startClientX,
      startClientY,
      startLeft: block.left,
      startTop: block.stackTop,
      startWidth: block.width,
      startHeight: block.height,
      previewWidth: block.width,
      previewHeight: block.height
    });
  };

  const commitCanvasDrag = (state: ReportCanvasDragState): void => {
    if (Math.abs(state.previewLeft - state.startLeft) < 3 && Math.abs(state.previewTop - state.startTop) < 3) {
      return;
    }
    executeReportPlan(
      state.duplicateOnDrop
        ? state.selectedNodeIds.length > 1
          ? buildReportCanvasSelectionDuplicatePlan(
              doc,
              state.sectionId,
              state.selectedNodeIds,
              state.nodeId,
              {
                left: state.previewLeft,
                top: state.previewTop,
                width: state.width,
                height: state.height
              },
              reportProps
            )
          : buildReportCanvasDuplicatePlan(
              doc,
              state.sectionId,
              state.nodeId,
              {
                left: state.previewLeft,
                top: state.previewTop,
                width: state.width,
                height: state.height
              },
              reportProps
            )
        : state.selectedNodeIds.length > 1
          ? buildReportCanvasSelectionMovePlan(
              doc,
              state.sectionId,
              state.selectedNodeIds,
              state.nodeId,
              {
                left: state.previewLeft,
                top: state.previewTop,
                width: state.width,
                height: state.height
              },
              reportProps
            )
          : buildReportCanvasMovePlan(
              doc,
              state.sectionId,
              state.nodeId,
              {
                left: state.previewLeft,
                top: state.previewTop,
                width: state.width,
                height: state.height
              },
              reportProps
            ),
      {
        action: state.duplicateOnDrop ? "duplicate_block_on_canvas" : "move_block_on_canvas",
        triggerSource: "drag_drop",
        successMessage: state.duplicateOnDrop ? (state.selectedNodeIds.length > 1 ? "已复制当前选择" : "已复制当前块") : state.selectedNodeIds.length > 1 ? "已移动当前选择" : "已在章节画布调整位置",
        failureMessage: state.duplicateOnDrop ? "画布复制失败" : "画布拖动失败",
        context: {
          sectionId: state.sectionId,
          nodeId: state.nodeId
        }
      }
    );
  };

  const commitCanvasResize = (state: ReportCanvasResizeState): void => {
    if (Math.abs(state.previewWidth - state.startWidth) < 3 && Math.abs(state.previewHeight - state.startHeight) < 3) {
      return;
    }
    executeReportPlan(
      buildReportCanvasResizePlan(
        doc,
        state.sectionId,
        state.nodeId,
        {
          left: state.startLeft,
          top: state.startTop,
          width: state.previewWidth,
          height: state.previewHeight
        },
        reportProps
      ),
      {
        action: "resize_block_on_canvas",
        triggerSource: "drag_drop",
        successMessage: "已在章节画布调整尺寸",
        failureMessage: "画布缩放失败",
        context: {
          sectionId: state.sectionId,
          nodeId: state.nodeId
        }
      }
    );
  };

  useEffect(() => {
    if (!canvasDrag && !canvasResize) {
      return;
    }
    const flushCanvasPreview = (): void => {
      const nextEvent = canvasPreviewEventRef.current;
      if (!nextEvent) {
        return;
      }
      const nextClientX = nextEvent.clientX;
      const nextClientY = nextEvent.clientY;
      const activeDrag = canvasDragRef.current;
      if (activeDrag) {
        const deltaX = nextClientX - activeDrag.startClientX;
        const deltaY = nextClientY - activeDrag.startClientY;
        const projection = sectionCanvasMap.get(activeDrag.sectionId);
        const draft = {
          left: Math.max(0, activeDrag.startLeft + deltaX),
          top: Math.max(0, activeDrag.startTop + deltaY),
          width: activeDrag.width,
          height: activeDrag.height
        };
        const snapped = projection ? resolveReportCanvasSnapPreview(projection, activeDrag.nodeId, draft) : { draft, guides: [] };
        setCanvasDrag((current) =>
          current
            ? ((canvasDragRef.current = {
                ...current,
                previewLeft: snapped.draft.left,
                previewTop: snapped.draft.top,
                duplicateOnDrop: current.duplicateOnDrop || nextEvent.altKey
              }),
              canvasDragRef.current)
            : current
        );
        setCanvasGuides({ sectionId: activeDrag.sectionId, guides: snapped.guides });
      }
      const activeResize = canvasResizeRef.current;
      if (activeResize) {
        const deltaX = nextClientX - activeResize.startClientX;
        const deltaY = nextClientY - activeResize.startClientY;
        const projection = sectionCanvasMap.get(activeResize.sectionId);
        const draft = {
          left: activeResize.startLeft,
          top: activeResize.startTop,
          width: Math.max(128, activeResize.startWidth + deltaX),
          height: Math.max(120, activeResize.startHeight + deltaY)
        };
        const snapped = projection ? resolveReportCanvasSnapPreview(projection, activeResize.nodeId, draft) : { draft, guides: [] };
        setCanvasResize((current) =>
          current
            ? ((canvasResizeRef.current = {
                ...current,
                previewWidth: snapped.draft.width,
                previewHeight: snapped.draft.height
              }),
              canvasResizeRef.current)
            : current
        );
        setCanvasGuides({ sectionId: activeResize.sectionId, guides: snapped.guides });
      }
    };
    const scheduleCanvasPreview = (event: PointerEvent | MouseEvent): void => {
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
        return;
      }
      canvasPreviewEventRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        altKey: Boolean("altKey" in event && event.altKey)
      };
      if (canvasPreviewFrameRef.current !== null) {
        return;
      }
      canvasPreviewFrameRef.current = window.requestAnimationFrame(() => {
        canvasPreviewFrameRef.current = null;
        flushCanvasPreview();
      });
    };
    const handlePointerMove = (event: PointerEvent | MouseEvent): void => {
      scheduleCanvasPreview(event);
    };
    const handlePointerUp = (): void => {
      if (canvasPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(canvasPreviewFrameRef.current);
        canvasPreviewFrameRef.current = null;
      }
      flushCanvasPreview();
      const activeDrag = canvasDragRef.current;
      const activeResize = canvasResizeRef.current;
      if (activeDrag) {
        commitCanvasDrag(activeDrag);
      }
      if (activeResize) {
        commitCanvasResize(activeResize);
      }
      setCanvasDrag(null);
      setCanvasResize(null);
      setCanvasGuides(null);
      canvasPreviewEventRef.current = null;
    };
    const handleMouseMove = (event: MouseEvent): void => handlePointerMove(event);
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      if (canvasPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(canvasPreviewFrameRef.current);
        canvasPreviewFrameRef.current = null;
      }
      canvasPreviewEventRef.current = null;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [canvasDrag?.nodeId, canvasDrag?.sectionId, canvasResize?.nodeId, canvasResize?.sectionId, doc, reportProps, sectionCanvasMap]);

  return (
    <div ref={stageRef} className="col report-editor-stage" style={{ height: "100%" }}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        style={{ display: "none" }}
        onChange={(event) => {
          void handleReportImagePicked(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div className="row">
        <span className="chip">{reportProps.reportTitle}</span>
        <span className="chip">{`章节 ${sections.length} / 子章节 ${Math.max(0, flatSections.length - sections.length)}`}</span>
        <span className="chip">页 {Math.max(1, countPages(reportProps, flatSections.length))}</span>
        {ui.reportInsertPanelOpen ? <span className="chip">插入面板已展开</span> : null}
        {layoutHint ? <span className="chip">{layoutHint}</span> : null}
        {showReportConfig ? <span className="chip">结构编辑已开启</span> : null}
      </div>

      {ui.reportInsertPanelOpen ? (
        <FloatingLayer anchorRef={stageRef} className="dashboard-insert-panel-layer" resolveStyle={resolveSideInsertPanelStyle}>
          <EditorInsertPanel
            title="插入组件"
            subtitle="插入到当前章节内容区"
            search={insertSearch}
            placeholder="搜索图表、表格、文本、图片"
            groups={reportInsertGroups}
            testId="report-insert-panel"
            onSearchChange={setInsertSearch}
            onClose={() => store.setReportInsertPanelOpen(false)}
            onInsert={(item) => insertReportItemFromPanel(item.source)}
            onDragStart={(item, event) => {
              if (item.source.kind === "image") {
                event.preventDefault();
                return;
              }
              encodeReportInsertItem(event.dataTransfer, item.source.id);
            }}
            onDragEnd={() => {
              clearReportInsertItemDrag();
              setCanvasInsertPreview(null);
            }}
          />
        </FloatingLayer>
      ) : null}

      {showReportConfig ? (
        <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>封面 / 总结 / 页眉页脚</strong>
            <button className="btn" onClick={() => updateReportProps({ summaryText: autoSummary }, "refresh auto summary")}>
              刷新自动总结
            </button>
          </div>
          <div className="row">
            <label className="row">
              <input type="checkbox" checked={reportProps.tocShow} onChange={(event) => updateReportProps({ tocShow: event.target.checked }, "toggle toc")} />
              <span>目录页</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={reportProps.coverEnabled} onChange={(event) => updateReportProps({ coverEnabled: event.target.checked }, "toggle cover")} />
              <span>封面页</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={reportProps.summaryEnabled} onChange={(event) => updateReportProps({ summaryEnabled: event.target.checked }, "toggle summary")} />
              <span>总结页</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(reportProps.headerShow)} onChange={(event) => updateReportProps({ headerShow: event.target.checked }, "toggle header")} />
              <span>页眉</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(reportProps.footerShow)} onChange={(event) => updateReportProps({ footerShow: event.target.checked }, "toggle footer")} />
              <span>页脚</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={reportProps.showPageNumber} onChange={(event) => updateReportProps({ showPageNumber: event.target.checked }, "toggle page number")} />
              <span>页码</span>
            </label>
          </div>
          <div className="row">
            <label className="col" style={{ flex: 1 }}>
              <span>报告标题</span>
              <input className="input" value={reportProps.reportTitle} onChange={(event) => updateReportProps({ reportTitle: event.target.value }, "edit report title", 160)} />
            </label>
            <label className="col" style={{ width: 180 }}>
              <span>纸张</span>
              <select className="select" value={typeof reportProps.pageSize === "string" ? reportProps.pageSize : "A4"} onChange={(event) => updateReportProps({ pageSize: event.target.value as "A4" | "Letter" }, "change page size")}>
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
            <label className="col" style={{ width: 180 }}>
              <span>分页策略</span>
              <select
                className="select"
                value={reportProps.paginationStrategy}
                onChange={(event) => updateReportProps({ paginationStrategy: event.target.value as "section" | "continuous" }, "change pagination strategy")}
              >
                <option value="section">章节分页</option>
                <option value="continuous">连续流式</option>
              </select>
            </label>
            <label className="col" style={{ width: 180 }}>
              <span>页边距预设</span>
              <select
                className="select"
                value={reportProps.marginPreset}
                onChange={(event) => updateReportProps({ marginPreset: event.target.value as "narrow" | "normal" | "wide" | "custom" }, "change margin preset")}
              >
                <option value="narrow">narrow</option>
                <option value="normal">normal</option>
                <option value="wide">wide</option>
                <option value="custom">custom</option>
              </select>
            </label>
          </div>
          {reportProps.marginPreset === "custom" ? (
            <div className="row">
              <label className="col" style={{ width: 120 }}>
                <span>上(mm)</span>
                <input
                  className="input"
                  type="number"
                  value={reportProps.marginTopMm}
                  onChange={(event) => updateReportProps({ marginTopMm: Math.max(6, Number(event.target.value) || 6) }, "edit margin top", 120)}
                />
              </label>
              <label className="col" style={{ width: 120 }}>
                <span>右(mm)</span>
                <input
                  className="input"
                  type="number"
                  value={reportProps.marginRightMm}
                  onChange={(event) => updateReportProps({ marginRightMm: Math.max(6, Number(event.target.value) || 6) }, "edit margin right", 120)}
                />
              </label>
              <label className="col" style={{ width: 120 }}>
                <span>下(mm)</span>
                <input
                  className="input"
                  type="number"
                  value={reportProps.marginBottomMm}
                  onChange={(event) => updateReportProps({ marginBottomMm: Math.max(6, Number(event.target.value) || 6) }, "edit margin bottom", 120)}
                />
              </label>
              <label className="col" style={{ width: 120 }}>
                <span>左(mm)</span>
                <input
                  className="input"
                  type="number"
                  value={reportProps.marginLeftMm}
                  onChange={(event) => updateReportProps({ marginLeftMm: Math.max(6, Number(event.target.value) || 6) }, "edit margin left", 120)}
                />
              </label>
            </div>
          ) : null}
          <div className="row">
            <label className="col" style={{ flex: 1 }}>
              <span>封面主标题</span>
              <input className="input" value={reportProps.coverTitle} onChange={(event) => updateReportProps({ coverTitle: event.target.value }, "edit cover title", 160)} />
            </label>
            <label className="col" style={{ flex: 1 }}>
              <span>封面副标题</span>
              <input className="input" value={reportProps.coverSubtitle} onChange={(event) => updateReportProps({ coverSubtitle: event.target.value }, "edit cover subtitle", 160)} />
            </label>
          </div>
          <div className="row">
            <label className="col" style={{ flex: 1 }}>
              <span>页眉文案</span>
              <input className="input" value={reportProps.headerText} onChange={(event) => updateReportProps({ headerText: event.target.value }, "edit header text", 160)} />
            </label>
            <label className="col" style={{ flex: 1 }}>
              <span>页脚文案</span>
              <input className="input" value={reportProps.footerText} onChange={(event) => updateReportProps({ footerText: event.target.value }, "edit footer text", 160)} />
            </label>
          </div>
          <label className="col">
            <span>总结页标题</span>
            <input className="input" value={reportProps.summaryTitle} onChange={(event) => updateReportProps({ summaryTitle: event.target.value }, "edit summary title", 160)} />
          </label>
          <label className="col">
            <span>总结内容</span>
            <textarea className="textarea" value={reportProps.summaryText} onChange={(event) => updateReportProps({ summaryText: event.target.value }, "edit summary text", 160)} />
          </label>
          <div className="muted" style={{ fontSize: 12 }}>
            自动总结建议：{autoSummary}
          </div>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className="col"
        style={{ overflow: "auto", minHeight: 0, paddingRight: 4, position: "relative" }}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".report-node-surface") || target.closest(".report-section-head") || target.closest(".report-section-canvas-page")) {
            return;
          }
          setCanvasInsertPreview(null);
          store.setSelection(doc.root.id, false);
        }}
        onScroll={(event) => {
          const nextTop = event.currentTarget.scrollTop;
          setScrollTop(nextTop);
          if (!canSyncSelectionByScroll) {
            return;
          }
          const activeSectionId = resolveSectionByScroll(nextTop);
          if (!activeSectionId || activeSectionId === selectedSectionId || lastScrollSyncSectionRef.current === activeSectionId) {
            return;
          }
          lastScrollSyncSectionRef.current = activeSectionId;
          lastAutoScrollSectionRef.current = activeSectionId;
          store.setSelection(activeSectionId, false);
        }}
      >
        {entries.length === 0 ? <div className="muted">暂无章节内容</div> : null}
        <div style={{ position: "relative", minHeight: totalHeight }}>
          {visible.map(({ item: entry, top }) => (
            <MeasuredEntry
              key={entry.key}
              entryKey={entry.key}
              onHeight={handleMeasuredHeight}
              style={{ position: "absolute", left: 0, right: 0, top, paddingBottom: Math.max(0, reportProps.blockGapPx) }}
            >
              {entry.kind === "cover" ? (
                <ReportPageFrame props={reportProps} pageIndex={entry.pageIndex}>
                  <div className="col" style={{ minHeight: 240, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                    <div style={resolveTitleTextStyle({ fontSize: 30, bold: true, align: "center" }, reportProps.coverTitleStyle)}>
                      {reportProps.coverTitle || reportProps.reportTitle}
                    </div>
                    <div className="muted" style={{ fontSize: 16 }}>
                      {reportProps.coverSubtitle}
                    </div>
                    <div className="muted" style={{ marginTop: 14 }}>
                      {reportProps.coverNote || `生成时间：${new Date().toLocaleDateString()}`}
                    </div>
                  </div>
                </ReportPageFrame>
              ) : null}

              {entry.kind === "toc" ? (
                <ReportPageFrame props={reportProps} pageIndex={entry.pageIndex}>
                  <div className="section">
                    <div className="section-title" style={resolveTitleTextStyle({ fontSize: 24, bold: true }, reportProps.sectionTitleStyle)}>目录</div>
                    <div className="block" style={{ margin: 0 }}>
                      {flatSections.length === 0 ? <div className="muted">暂无章节</div> : null}
                      {flatSections.map((item) => (
                        <div key={item.section.id} className="row" style={{ justifyContent: "space-between", borderBottom: "1px dashed var(--line)", padding: "6px 0" }}>
                          <span style={item.level === 2 ? { paddingLeft: 14, color: "#475569" } : undefined}>{`${item.orderLabel}. ${item.title}`}</span>
                          <span className="muted">Page {sectionPageMap.get(item.section.id) ?? "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </ReportPageFrame>
              ) : null}

              {entry.kind === "section" ? (
                (() => {
                  const sectionProjection = sectionCanvasMap.get(entry.item.section.id) ?? buildReportSectionCanvasProjection(entry.item.blocks);
                  return (
                    <div className="section report-section-canvas-shell">
                      <div className="section-title row report-section-head" style={{ ...resolveTitleTextStyle({ fontSize: 24, bold: true }, reportProps.sectionTitleStyle), justifyContent: "space-between" }}>
                        <div className="row">
                          <span>{`${entry.item.orderLabel}. ${entry.item.title}`}</span>
                          <span className="muted">{entry.item.section.id}</span>
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="chip">章节内容区</span>
                          <span className="muted">从插入面板拖入组件，直接拖动块和缩放</span>
                          <button className={`btn mini-btn ${structurePanelOpenSections[entry.item.section.id] ? "primary" : ""}`} onClick={() => toggleStructurePanel(entry.item.section.id)}>
                            {structurePanelOpenSections[entry.item.section.id] ? "收起高级排版" : "高级排版"}
                          </button>
                        </div>
                      </div>
                      {entry.item.blocks.length === 0 ? (
                        <ReportInsertPresetBar
                          label="本章开头插入"
                          sectionId={entry.item.section.id}
                          anchor={{ kind: "section-start" }}
                          onInsert={applyInsertPreset}
                        />
                      ) : null}
                      <ReportSectionCanvas
                        doc={doc}
                        item={entry.item}
                        projection={sectionProjection}
                        selection={selection.selectedIds}
                        engine={engine}
                        dataVersion={dataVersion}
                        lazyRootRef={viewportRef}
                        canvasInsertPreview={canvasInsertPreview?.sectionId === entry.item.section.id ? canvasInsertPreview : null}
                        canvasDrag={canvasDrag?.sectionId === entry.item.section.id ? canvasDrag : null}
                        canvasResize={canvasResize?.sectionId === entry.item.section.id ? canvasResize : null}
                        canvasGuides={canvasGuides?.sectionId === entry.item.section.id ? canvasGuides.guides : []}
                        onSelectNode={(nodeId, multi) => store.setSelection(nodeId, multi)}
                        onSelectNodes={(nodeIds, primaryId, additive) => setCanvasSelection(nodeIds, primaryId, additive)}
                        onSelectSection={() => store.setSelection(entry.item.section.id, false)}
                        onUpdateInsertPreview={(pageIndex, insertItem, point) => updateCanvasInsertPreview(entry.item.section.id, pageIndex, sectionProjection, insertItem, point)}
                        onDropInsertItem={(pageIndex, insertItem, point) => {
                          const page = sectionProjection.pages[pageIndex];
                          insertReportItemOnCanvas(entry.item.section.id, insertItem, pageIndex, {
                            x: point.x,
                            y: (page?.stackTop ?? 0) + point.y
                          });
                        }}
                        onStartCanvasDrag={startCanvasDrag}
                        onStartCanvasResize={startCanvasResize}
                        onAutoTidy={runCanvasAutoTidy}
                      />
                      {structurePanelOpenSections[entry.item.section.id] ? (
                        <ReportStructurePanel
                          item={entry.item}
                          rows={entry.rows}
                          rowPreview={rowPreview}
                          rowDrag={rowDrag}
                          rowDropPreview={rowDropPreview}
                          selection={selection.selectedIds}
                          onPreviewLayoutPreset={previewRowLayoutPreset}
                          onClearPreview={clearRowPreview}
                          onApplyLayoutPreset={applyRowLayoutPreset}
                          onAddChart={addChartToRow}
                          onSwap={swapRowBlocks}
                          onMove={moveRow}
                          onReorderRowByDrag={reorderRowByDrag}
                          onMoveBlockBetweenRows={moveBlockBetweenRows}
                          onSetRowPreview={setRowPreview}
                          onUpdateRowDropPreview={setRowDropPreview}
                          onClearRowDropPreview={clearRowDropPreview}
                          onSetRowDrag={setRowDrag}
                          onApplyInsertPreset={applyInsertPreset}
                        />
                      ) : null}
                    </div>
                  );
                })()
              ) : null}

              {entry.kind === "summary" ? (
                <ReportPageFrame props={reportProps} pageIndex={entry.pageIndex}>
                  <div className="section">
                    <div className="section-title" style={resolveTitleTextStyle({ fontSize: 24, bold: true }, reportProps.summaryTitleStyle)}>{reportProps.summaryTitle}</div>
                    <div className="block" style={{ margin: 0 }}>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{reportProps.summaryText || autoSummary}</pre>
                    </div>
                  </div>
                </ReportPageFrame>
              ) : null}
            </MeasuredEntry>
          ))}
        </div>
      </div>
    </div>
  );
}

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

const describeReportBlock = (node: VNode | undefined): string => {
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

function ReportRowActionBar({
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

function ReportRowPreviewOverlay({
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

function ReportRowDropLine({
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

function ReportSectionCanvas({
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
  dataVersion: string;
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
                    doc={doc}
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

function ReportStructurePanel({
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

function ReportInsertPresetBar({
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

function ReportBlock({
  doc,
  block,
  selected,
  onSelect,
  engine,
  dataVersion,
  lazyRootRef,
  preferredHeight
}: {
  doc: VDoc;
  block: VNode;
  selected: boolean;
  onSelect: (multi: boolean) => void;
  engine: DataEngine;
  dataVersion: string;
  lazyRootRef: RefObject<HTMLDivElement>;
  preferredHeight: number;
}): JSX.Element {
  const { rows, loading, error } = useNodeRows(doc, block, engine, dataVersion);
  const bodyHeight = Math.max(120, Math.round(preferredHeight - 18));
  const showOuterTitle = shouldRenderOuterNodeTitle(block);
  const blockTitle = block.kind === "image" ? resolveImageNodeTitle(doc, block) : resolveNodeDisplayTitle(block);
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
          <NodeDataState loading={loading} error={error} remote={isRemoteDataNode(doc, block)} />
        ) : (
          <TableView spec={block.props as TableSpec} rows={rows} height={bodyHeight} />
        )
      ) : block.kind === "chart" ? (
        loading || error ? (
          <NodeDataState loading={loading} error={error} remote={isRemoteDataNode(doc, block)} />
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
        <ReportImageBlock doc={doc} block={block} />
      ) : (
        <div className="muted">暂未支持的块类型: {block.kind}</div>
      )}
    </div>
  );
}

function ReportImageBlock({ doc, block }: { doc: VDoc; block: VNode }): JSX.Element {
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

function MeasuredEntry({
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

function ReportPageFrame({
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

const normalizeReportProps = (doc: VDoc): ReportRuntimeProps => {
  const raw = ((doc.root.props as ReportProps | undefined) ?? {}) as ReportProps;
  const reportTitle = raw.reportTitle ?? doc.title ?? "未命名报告";
  const preset = raw.marginPreset ?? "normal";
  const presetMargins =
    preset === "narrow"
      ? { top: 10, right: 10, bottom: 10, left: 10 }
      : preset === "wide"
        ? { top: 20, right: 20, bottom: 20, left: 20 }
        : { top: 14, right: 14, bottom: 14, left: 14 };
  const useCustomMargins = preset === "custom";
  return {
    ...raw,
    reportTitle,
    tocShow: raw.tocShow ?? true,
    coverEnabled: raw.coverEnabled ?? true,
    coverTitle: raw.coverTitle ?? reportTitle,
    coverTitleStyle: raw.coverTitleStyle ?? {},
    coverSubtitle: raw.coverSubtitle ?? "Report",
    coverNote: raw.coverNote ?? `生成时间：${new Date().toLocaleDateString()}`,
    summaryEnabled: raw.summaryEnabled ?? true,
    summaryTitle: raw.summaryTitle ?? "执行摘要",
    summaryTitleStyle: raw.summaryTitleStyle ?? {},
    summaryText: raw.summaryText ?? "",
    headerText: raw.headerText ?? reportTitle,
    headerStyle: raw.headerStyle ?? {},
    footerText: raw.footerText ?? "Visual Document OS",
    footerStyle: raw.footerStyle ?? {},
    showPageNumber: raw.showPageNumber ?? true,
    sectionTitleStyle: raw.sectionTitleStyle ?? {},
    pageSize: raw.pageSize ?? "A4",
    paginationStrategy: raw.paginationStrategy ?? "section",
    marginPreset: preset,
    marginTopMm: Math.max(6, Number(useCustomMargins ? (raw.marginTopMm ?? presetMargins.top) : presetMargins.top) || presetMargins.top),
    marginRightMm: Math.max(6, Number(useCustomMargins ? (raw.marginRightMm ?? presetMargins.right) : presetMargins.right) || presetMargins.right),
    marginBottomMm: Math.max(6, Number(useCustomMargins ? (raw.marginBottomMm ?? presetMargins.bottom) : presetMargins.bottom) || presetMargins.bottom),
    marginLeftMm: Math.max(6, Number(useCustomMargins ? (raw.marginLeftMm ?? presetMargins.left) : presetMargins.left) || presetMargins.left),
    bodyPaddingPx: Math.max(0, Number(raw.bodyPaddingPx ?? 12) || 12),
    sectionGapPx: Math.max(0, Number(raw.sectionGapPx ?? 12) || 12),
    blockGapPx: Math.max(0, Number(raw.blockGapPx ?? 8) || 8)
  };
};

const countPages = (props: ReportRuntimeProps, sectionCount: number): number =>
  sectionCount + (props.coverEnabled ? 1 : 0) + (props.tocShow ? 1 : 0) + (props.summaryEnabled ? 1 : 0);

const buildPreviewSectionPageMap = (props: ReportRuntimeProps, sections: FlattenedReportSection[]): Map<string, number> => {
  let page = 0;
  if (props.coverEnabled) {
    page += 1;
  }
  if (props.tocShow) {
    page += 1;
  }
  const map = new Map<string, number>();
  sections.forEach((section) => {
    page += 1;
    map.set(section.section.id, page);
  });
  return map;
};

const buildAutoSummary = (doc: VDoc): string => {
  const sections = flattenReportSections(getTopReportSections(doc.root));
  const chartCount = sections.reduce((sum, section) => sum + section.blocks.filter((node) => node.kind === "chart").length, 0);
  const textCount = sections.reduce((sum, section) => sum + section.blocks.filter((node) => node.kind === "text").length, 0);
  const titles = sections
    .map((section) => section.title)
    .slice(0, 3)
    .join("、");
  if (sections.length === 0) {
    return "报告暂无章节，建议先新增章节并补充关键图表。";
  }
  return `本报告共 ${sections.length} 个章节，包含 ${chartCount} 张图表与 ${textCount} 段文本。重点章节：${titles}。建议优先核对峰值异常与对应处置动作。`;
};
