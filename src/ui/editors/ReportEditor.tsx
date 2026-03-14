import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Command, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { HttpAssetRepository } from "../api/http-asset-repository";
import { FloatingLayer } from "../components/FloatingLayer";
import { EditorInsertPanel, type EditorInsertPanelItem } from "../components/EditorInsertPanel";
import {
  clearCopilotArtifactDrag,
  decodeCopilotArtifact,
  supportsReportArtifactDrop
} from "../copilot/copilot-artifact-dnd";
import { useMaybeCopilot } from "../copilot/copilot-context";
import { buildReportArtifactApplyCommands, withArtifactAppliedNode, type CopilotArtifactResultItem } from "../copilot/copilot-results";
import { useDataEngine } from "../hooks/use-data-engine";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import {
  createEditorTraceId,
  emitEditorTelemetry,
  emitEditorTelemetryError,
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
  type ReportSectionCanvasBlock,
  type ReportSectionCanvasProjection
} from "../utils/report-canvas";
import {
  buildReportBlockInsertBetweenRowsPlan,
  buildReportRowAddChartPlan,
  buildReportRowLayoutPresetPlan,
  buildReportRowMovePlan,
  buildReportRowReorderPlan,
  buildReportRowSwapPlan,
  type ReportRowInsertPosition,
  type ReportRowLayoutPreset,
  type ReportRowMoveDirection
} from "../utils/report-row-actions";
import { cloneNodeWithNewIds, findNodeById, resolveAncestorIdByKind } from "../utils/node-tree";
import { flattenReportSections, getTopReportSections, type FlattenedReportSection } from "../utils/report-sections";
import { buildLayoutBatchCommands, planLayoutBatchTargets, type LayoutBatchAction } from "../utils/layout-batch";
import { buildAlignCommandResult, type AlignKind } from "../utils/alignment";
import { upsertDocAsset } from "../utils/doc-assets";
import { isTypingTarget } from "../utils/editor-input";
import { resolveSideInsertPanelStyle } from "../utils/editor-insert-layout";
import {
  buildReportInsertItemPlan,
  clearReportInsertItemDrag,
  encodeReportInsertItem,
  resolveReportInsertGroups,
  resolveReportInsertPreviewRect,
  type ReportInsertItem
} from "../utils/report-insert-panel";
import { resolveTitleTextStyle } from "../utils/node-style";
import {
  MeasuredEntry,
  ReportInsertPresetBar,
  ReportPageFrame,
  ReportSectionCanvas,
  ReportStructurePanel
} from "./report/components";
import { buildAutoSummary, buildPreviewSectionPageMap, countPages, normalizeReportProps } from "./report/runtime";
import type {
  ExecutableReportPlan,
  ReportCanvasDragState,
  ReportCanvasGuidePreview,
  ReportCanvasInsertPreviewState,
  ReportCanvasResizeState,
  ReportEntry,
  ReportRowDragState,
  ReportRowDropLinePreview,
  ReportRowPreviewState,
  ReportRuntimeProps
} from "./report/types";
import { useNodeDataPrefetch } from "../hooks/use-node-data-prefetch";
import { resolveReportPrefetchNodes } from "../utils/data-fetch-strategy";

interface ReportEditorProps {
  doc: VDoc;
}

type ReportArtifactDropPosition = "before" | "replace" | "after";

interface ReportArtifactDropTarget {
  sectionId: string;
  position: ReportArtifactDropPosition;
}

const sameReportArtifactDropTarget = (left: ReportArtifactDropTarget | null, right: ReportArtifactDropTarget | null): boolean =>
  left?.sectionId === right?.sectionId && left?.position === right?.position;

const sameReportCanvasInsertPreviewState = (
  left: ReportCanvasInsertPreviewState | null,
  right: ReportCanvasInsertPreviewState | null
): boolean =>
  left?.sectionId === right?.sectionId &&
  left?.pageIndex === right?.pageIndex &&
  left?.itemId === right?.itemId &&
  left?.label === right?.label &&
  left?.rect.left === right?.rect.left &&
  left?.rect.top === right?.rect.top &&
  left?.rect.width === right?.rect.width &&
  left?.rect.height === right?.rect.height;

/**
 * Report 编辑器：
 * - 支持封面/目录/页眉页脚/总结页
 * - 支持大文档虚拟化渲染
 * - 支持块级插入与导出
 */
export function ReportEditor({ doc }: ReportEditorProps): JSX.Element {
  const store = useEditorStore();
  const copilot = useMaybeCopilot();
  const selection = useSignalValue(store.selection);
  const ui = useSignalValue(store.ui);
  const assetRepoRef = useRef(new HttpAssetRepository("/api/v1"));
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? []);
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
  const [artifactDropTarget, setArtifactDropTarget] = useState<ReportArtifactDropTarget | null>(null);
  const [structurePanelOpenSections, setStructurePanelOpenSections] = useState<Record<string, boolean>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasDragRef = useRef<ReportCanvasDragState | null>(null);
  const canvasResizeRef = useRef<ReportCanvasResizeState | null>(null);
  const canvasPreviewFrameRef = useRef<number | null>(null);
  const canvasPreviewEventRef = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageInsertRef = useRef<{ sectionId: string; point?: { x: number; y: number } } | null>(null);
  const spotlight = copilot?.spotlight?.docId === doc.docId ? copilot.spotlight : null;
  const spotlightSectionId =
    spotlight
      ? sections.find((section) => section.id === spotlight.nodeId)?.id ?? resolveAncestorIdByKind(doc.root, spotlight.nodeId, "section")
      : undefined;
  const spotlightPulseClass = spotlight ? `spotlight-pulse-${spotlight.pulseKey % 2}` : undefined;

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
        !canvasResize &&
        !artifactDropTarget
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
      setArtifactDropTarget(null);
      store.clearSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [artifactDropTarget, canvasDrag, canvasInsertPreview, canvasResize, rowDrag, rowDropPreview, rowPreview, selection.selectedIds.length, store]);

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
  const visibleSectionIds = useMemo(
    () =>
      visible.flatMap((entry) =>
        entry.item.kind === "section" ? [entry.item.item.section.id] : []
      ),
    [visible]
  );
  const prefetchNodes = useMemo(() => resolveReportPrefetchNodes(flatSections, visibleSectionIds, 1), [flatSections, visibleSectionIds]);
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

  useNodeDataPrefetch(doc, prefetchNodes, engine, dataVersion, "report editor");
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
    const nextPreview = {
      sectionId,
      pageIndex,
      itemId: item.id,
      label: item.label,
      rect: resolveReportInsertPreviewRect(projection, item, point)
    };
    setCanvasInsertPreview((current) => (sameReportCanvasInsertPreviewState(current, nextPreview) ? current : nextPreview));
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

  const applyDraggedReportArtifact = (
    sectionId: string,
    artifact: NonNullable<ReturnType<typeof decodeCopilotArtifact>>,
    position: ReportArtifactDropPosition = "replace"
  ): void => {
    if (!supportsReportArtifactDrop(artifact)) {
      return;
    }
    const existing = copilot?.results.find(
      (item): item is CopilotArtifactResultItem => item.kind === "artifact" && item.resultId === artifact.resultId
    );
    const nextArtifact: CopilotArtifactResultItem =
      existing
        ? {
            ...existing,
            node: cloneNodeWithNewIds(existing.node)
          }
        : {
            resultId: artifact.resultId,
            sceneId: copilot?.scene.sceneId ?? `detail:${doc.docId}:edit`,
            threadId: copilot?.currentThreadId,
            docId: doc.docId,
            docType: "report",
            kind: "artifact",
            title: artifact.title,
            summary: artifact.title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            jobId: "dragged_artifact",
            unitId: artifact.resultId,
            artifactId: artifact.artifactId,
            artifactKind: "section",
            node: cloneNodeWithNewIds(artifact.node),
            notes: [],
            status: "ready"
          };
    let appliedNodeId = nextArtifact.node.id;
    let commands: Command[];
    if (position === "replace") {
      const result = buildReportArtifactApplyCommands(doc, nextArtifact, undefined, sectionId);
      commands = result.commands;
      appliedNodeId = result.appliedNodeId;
    } else {
      const targetIndex = (doc.root.children ?? []).findIndex((child) => child.id === sectionId);
      const nextNode = structuredClone(nextArtifact.node);
      if (targetIndex >= 0) {
        commands = [
          {
            type: "InsertNode",
            parentId: doc.root.id,
            index: position === "before" ? targetIndex : targetIndex + 1,
            node: nextNode
          }
        ];
        appliedNodeId = nextNode.id;
      } else {
        commands = [
          {
            type: "InsertNode",
            parentId: doc.root.id,
            index: (doc.root.children ?? []).length,
            node: nextNode
          }
        ];
        appliedNodeId = nextNode.id;
      }
    }
    const ok = store.executeCommand(
      {
        type: "Transaction",
        commands
      },
      {
        actor: "ai",
        summary: "copilot drop report section"
      }
    );
    if (!ok) {
      setLayoutHint("章节替换失败");
      setTimeout(() => setLayoutHint(""), 1600);
      return;
    }
    if (existing && copilot) {
      copilot.upsertResult(withArtifactAppliedNode(existing, appliedNodeId));
    }
    store.setSelection(appliedNodeId, false);
    copilot?.spotlightNode(doc.docId, appliedNodeId);
    const sectionTitle = flatSections.find((entry) => entry.section.id === sectionId)?.title ?? "当前章节";
    setLayoutHint(position === "replace" ? `已替换${sectionTitle}` : `已插入到${sectionTitle}${position === "before" ? "前" : "后"}`);
    setTimeout(() => setLayoutHint(""), 1600);
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

  const reportArtifactDropLabel = useCallback((position: ReportArtifactDropPosition): string => {
    switch (position) {
      case "before":
        return "松开插入到本章节前";
      case "after":
        return "松开插入到本章节后";
      default:
        return "松开替换当前章节";
    }
  }, []);

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
                  const activeArtifactDrop = artifactDropTarget?.sectionId === entry.item.section.id ? artifactDropTarget : null;
                  return (
                    <div className="report-section-drop-stack">
                      <div
                        className={`report-section-drop-anchor ${activeArtifactDrop?.position === "before" ? "active" : ""}`}
                        data-testid={`report-artifact-drop-before-${entry.item.section.id}`}
                        onDragOver={(event) => {
                          const artifact = decodeCopilotArtifact(event.dataTransfer);
                          if (!artifact || !supportsReportArtifactDrop(artifact)) {
                            return;
                          }
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                          const nextTarget = { sectionId: entry.item.section.id, position: "before" as const };
                          setArtifactDropTarget((current) => (sameReportArtifactDropTarget(current, nextTarget) ? current : nextTarget));
                        }}
                        onDragLeave={(event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            return;
                          }
                          setArtifactDropTarget((current) => (current?.sectionId === entry.item.section.id && current.position === "before" ? null : current));
                        }}
                        onDrop={(event) => {
                          const artifact = decodeCopilotArtifact(event.dataTransfer);
                          clearCopilotArtifactDrag();
                          if (!artifact || !supportsReportArtifactDrop(artifact)) {
                            return;
                          }
                          event.preventDefault();
                          setArtifactDropTarget(null);
                          applyDraggedReportArtifact(entry.item.section.id, artifact, "before");
                        }}
                      >
                        <span className="report-section-drop-anchor-line" />
                        <span className="report-section-drop-anchor-label">
                          {activeArtifactDrop?.position === "before" ? reportArtifactDropLabel("before") : "拖到此处可前插章节草稿"}
                        </span>
                      </div>
                      <div
                        className={`section report-section-canvas-shell ${spotlightSectionId === entry.item.section.id ? `is-copilot-spotlight ${spotlightPulseClass ?? ""}` : ""}`}
                        style={
                          activeArtifactDrop
                            ? { position: "relative", outline: "2px dashed #1d4ed8", outlineOffset: 4, borderRadius: 12 }
                            : undefined
                        }
                        onDragOver={(event) => {
                          const artifact = decodeCopilotArtifact(event.dataTransfer);
                          if (!artifact || !supportsReportArtifactDrop(artifact)) {
                            return;
                          }
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                          const nextTarget = { sectionId: entry.item.section.id, position: "replace" as const };
                          setArtifactDropTarget((current) => (sameReportArtifactDropTarget(current, nextTarget) ? current : nextTarget));
                        }}
                        onDragLeave={(event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            return;
                          }
                          setArtifactDropTarget((current) => (current?.sectionId === entry.item.section.id ? null : current));
                        }}
                        onDrop={(event) => {
                          const artifact = decodeCopilotArtifact(event.dataTransfer);
                          clearCopilotArtifactDrag();
                          if (!artifact || !supportsReportArtifactDrop(artifact)) {
                            return;
                          }
                          event.preventDefault();
                          setArtifactDropTarget(null);
                          applyDraggedReportArtifact(entry.item.section.id, artifact, activeArtifactDrop?.position ?? "replace");
                        }}
                      >
                        {activeArtifactDrop ? (
                          <div className="report-section-drop-banner" data-testid={`report-artifact-drop-banner-${entry.item.section.id}`}>
                            <strong>Copilot 章节草稿</strong>
                            <span>{reportArtifactDropLabel(activeArtifactDrop.position)}</span>
                          </div>
                        ) : null}
                        <div className="section-title row report-section-head" style={{ ...resolveTitleTextStyle({ fontSize: 24, bold: true }, reportProps.sectionTitleStyle), justifyContent: "space-between" }}>
                          <div className="row">
                            <span>{`${entry.item.orderLabel}. ${entry.item.title}`}</span>
                            <span className="muted">{entry.item.section.id}</span>
                          </div>
                          <div className="row" style={{ gap: 6 }}>
                            <span className="chip">章节内容区</span>
                            {activeArtifactDrop ? <span className="chip">{reportArtifactDropLabel(activeArtifactDrop.position)}</span> : null}
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
                      <div
                        className={`report-section-drop-anchor ${activeArtifactDrop?.position === "after" ? "active" : ""}`}
                        data-testid={`report-artifact-drop-after-${entry.item.section.id}`}
                        onDragOver={(event) => {
                          const artifact = decodeCopilotArtifact(event.dataTransfer);
                          if (!artifact || !supportsReportArtifactDrop(artifact)) {
                            return;
                          }
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                          const nextTarget = { sectionId: entry.item.section.id, position: "after" as const };
                          setArtifactDropTarget((current) => (sameReportArtifactDropTarget(current, nextTarget) ? current : nextTarget));
                        }}
                        onDragLeave={(event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            return;
                          }
                          setArtifactDropTarget((current) => (current?.sectionId === entry.item.section.id && current.position === "after" ? null : current));
                        }}
                        onDrop={(event) => {
                          const artifact = decodeCopilotArtifact(event.dataTransfer);
                          clearCopilotArtifactDrag();
                          if (!artifact || !supportsReportArtifactDrop(artifact)) {
                            return;
                          }
                          event.preventDefault();
                          setArtifactDropTarget(null);
                          applyDraggedReportArtifact(entry.item.section.id, artifact, "after");
                        }}
                      >
                        <span className="report-section-drop-anchor-line" />
                        <span className="report-section-drop-anchor-label">
                          {activeArtifactDrop?.position === "after" ? reportArtifactDropLabel("after") : "拖到此处可后插章节草稿"}
                        </span>
                      </div>
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
