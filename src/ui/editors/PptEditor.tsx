import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ChartSpec, ImageProps, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { EChartView } from "../../runtime/chart/EChartView";
import { TableView } from "../../runtime/table/TableView";
import { HttpAssetRepository } from "../api/http-asset-repository";
import { FloatingLayer } from "../components/FloatingLayer";
import { EditorInsertPanel, type EditorInsertPanelItem } from "../components/EditorInsertPanel";
import { NodeDataState } from "../components/NodeDataState";
import { NodeTextBlock } from "../components/NodeTextBlock";
import {
  normalizePptDeckProps,
  PptSlideFrame,
  resolvePptSlideNodeLayout,
  resolvePptSlideNodeStyle,
  resolvePptSlideTitle
} from "../components/ppt/shared";
import {
  buildPptArtifactDropNode,
  clearCopilotArtifactDrag,
  decodeCopilotArtifact,
  supportsPptArtifactDrop
} from "../copilot/copilot-artifact-dnd";
import { useMaybeCopilot } from "../copilot/copilot-context";
import { withArtifactAppliedNode, type CopilotArtifactResultItem } from "../copilot/copilot-results";
import { useNodeRows } from "../hooks/use-node-rows";
import { useNodeDataPrefetch } from "../hooks/use-node-data-prefetch";
import { useDataEngine } from "../hooks/use-data-engine";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { upsertDocAsset } from "../utils/doc-assets";
import { resolvePptPrefetchNodes } from "../utils/data-fetch-strategy";
import { resolveAncestorIdByKind } from "../utils/node-tree";
import { buildCanvasSelectionRect, isCanvasSelectionGesture, resolveCanvasSelectionIds } from "../utils/canvas-selection";
import { buildDuplicateNodesPlan } from "../utils/duplicate-nodes";
import { isAdditiveSelectionModifier, isTypingTarget } from "../utils/editor-input";
import { resolveSideInsertPanelStyle } from "../utils/editor-insert-layout";
import {
  buildPptImageNode,
  buildPptInsertNode,
  clearPptInsertItemDrag,
  decodePptInsertItem,
  encodePptInsertItem,
  resolvePptInsertGroups,
  resolvePptInsertRect,
  type PptInsertItem
} from "../utils/ppt-insert";
import { resolveImageAsset, resolveImageNodeTitle } from "../utils/dashboard-surface";
import {
  isRemoteDataNode,
  resolveNodeDisplayTitle,
  resolveNodeTitleStyle,
  resolveTitleTextStyle,
  shouldRenderOuterNodeTitle
} from "../utils/node-style";

interface PptEditorProps {
  doc: VDoc;
  showNavigator?: boolean;
}

interface Guides {
  v?: number;
  h?: number;
}

interface SlideMarqueeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
}

interface SlideGroupDragPreview {
  anchorId: string;
  nodeIds: string[];
  deltaX: number;
  deltaY: number;
  duplicateOnDrop: boolean;
}

const sameSlideGroupDragPreview = (
  left: SlideGroupDragPreview | null,
  right: SlideGroupDragPreview | null
): boolean =>
  left?.anchorId === right?.anchorId &&
  left?.duplicateOnDrop === right?.duplicateOnDrop &&
  left?.deltaX === right?.deltaX &&
  left?.deltaY === right?.deltaY &&
  (left?.nodeIds.length ?? 0) === (right?.nodeIds.length ?? 0) &&
  (left?.nodeIds ?? []).every((item, index) => item === right?.nodeIds[index]);

const samePptInsertPreviewState = (
  left: { itemId: string; label: string; rect: { x: number; y: number; w: number; h: number } } | null,
  right: { itemId: string; label: string; rect: { x: number; y: number; w: number; h: number } } | null
): boolean =>
  left?.itemId === right?.itemId &&
  left?.label === right?.label &&
  left?.rect.x === right?.rect.x &&
  left?.rect.y === right?.rect.y &&
  left?.rect.w === right?.rect.w &&
  left?.rect.h === right?.rect.h;

const samePptArtifactDropTarget = (left: PptArtifactDropTarget | null, right: PptArtifactDropTarget | null): boolean =>
  left?.slideId === right?.slideId && left?.position === right?.position;

type PptArtifactDropPosition = "before" | "after";

interface PptArtifactDropTarget {
  slideId: string;
  position: PptArtifactDropPosition;
}

/**
 * PPT 编辑器：
 * - 页面管理（缩略图导航）
 * - 绝对定位拖拽与缩放
 * - 吸附与层级调整
 */
export function PptEditor({ doc, showNavigator = true }: PptEditorProps): JSX.Element {
  const store = useEditorStore();
  const copilot = useMaybeCopilot();
  const selection = useSignalValue(store.selection);
  const ui = useSignalValue(store.ui);
  const assetRepoRef = useRef(new HttpAssetRepository("/api/v1"));
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? []);
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
  const slides = (doc.root.children ?? []).filter((node) => node.kind === "slide");
  const selectedSlideId = resolveAncestorIdByKind(doc.root, selection.primaryId, "slide");
  const [activeSlideId, setActiveSlideId] = useState(selectedSlideId ?? slides[0]?.id);
  const activeSlide = slides.find((slide) => slide.id === activeSlideId) ?? slides.find((slide) => slide.id === selectedSlideId) ?? slides[0];
  const [guides, setGuides] = useState<Guides>({});
  const [marquee, setMarquee] = useState<SlideMarqueeState | null>(null);
  const [groupDragPreview, setGroupDragPreview] = useState<SlideGroupDragPreview | null>(null);
  const [insertSearch, setInsertSearch] = useState("");
  const [insertPreview, setInsertPreview] = useState<{ itemId: string; label: string; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  const deck = useMemo(() => normalizePptDeckProps(doc), [doc]);
  const rootProps = deck.rootProps;
  const snapEnabled = rootProps.editorSnapEnabled === undefined ? true : Boolean(rootProps.editorSnapEnabled);
  const [layoutHint, setLayoutHint] = useState("");
  const [artifactDropTarget, setArtifactDropTarget] = useState<PptArtifactDropTarget | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePointRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const insertPreviewFrameRef = useRef<number | null>(null);
  const pendingInsertPreviewRef = useRef<{ itemId: string; label: string; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  const spotlight = copilot?.spotlight?.docId === doc.docId ? copilot.spotlight : null;
  const spotlightSlideId =
    spotlight
      ? slides.find((slide) => slide.id === spotlight.nodeId)?.id ?? resolveAncestorIdByKind(doc.root, spotlight.nodeId, "slide")
      : undefined;
  const spotlightPulseClass = spotlight ? `spotlight-pulse-${spotlight.pulseKey % 2}` : undefined;

  useEffect(() => {
    if (selectedSlideId && selectedSlideId !== activeSlideId) {
      setActiveSlideId(selectedSlideId);
      return;
    }
    if (!activeSlideId && slides[0]) {
      setActiveSlideId(slides[0].id);
    }
  }, [activeSlideId, selectedSlideId, slides]);

  const prefetchNodes = useMemo(
    () => resolvePptPrefetchNodes(doc, activeSlide?.id ?? activeSlideId ?? slides[0]?.id, 1),
    [activeSlide?.id, activeSlideId, doc, slides]
  );
  useNodeDataPrefetch(doc, prefetchNodes, engine, dataVersion, "ppt editor");

  const flushInsertPreview = (): void => {
    const next = pendingInsertPreviewRef.current;
    if (!next) {
      return;
    }
    pendingInsertPreviewRef.current = null;
    setInsertPreview((current) => (samePptInsertPreviewState(current, next) ? current : next));
  };

  const scheduleInsertPreview = (next: { itemId: string; label: string; rect: { x: number; y: number; w: number; h: number } } | null): void => {
    pendingInsertPreviewRef.current = next;
    if (insertPreviewFrameRef.current !== null) {
      return;
    }
    insertPreviewFrameRef.current = window.requestAnimationFrame(() => {
      insertPreviewFrameRef.current = null;
      flushInsertPreview();
    });
  };

  const clearInsertPreviewState = (): void => {
    if (insertPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(insertPreviewFrameRef.current);
      insertPreviewFrameRef.current = null;
    }
    pendingInsertPreviewRef.current = null;
    setInsertPreview((current) => (current ? null : current));
  };

  useEffect(
    () => () => {
      if (insertPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(insertPreviewFrameRef.current);
      }
    },
    []
  );

  const activeIds = new Set((activeSlide?.children ?? []).map((item) => item.id));
  const activeSelectedIds = selection.selectedIds.filter((id) => activeIds.has(id));
  const insertGroups = resolvePptInsertGroups({
    slide: activeSlide,
    recentItemIds: ui.pptRecentInsertItemIds
  });
  const insertPanelGroups = insertGroups.map((group) => ({
    id: group.id,
    label: group.label,
        items: group.items.map(
          (item): EditorInsertPanelItem & { source: PptInsertItem } => ({
            id: item.id,
            label: item.label,
            description: item.description,
            icon: item.icon,
            badge: item.badge,
            accent: item.kind === "image",
            draggable: item.kind !== "image",
            title: item.kind === "image" ? "点击上传后插入" : "点击插入到当前页，也可拖到画布",
            source: item
          })
        )
  }));

  const insertPptItem = (item: PptInsertItem, point?: { x: number; y: number }): void => {
    if (!activeSlide) {
      setLayoutHint("当前没有可插入的页面");
      setTimeout(() => setLayoutHint(""), 1600);
      return;
    }
    if (item.kind === "image") {
      pendingImagePointRef.current = point;
      imageInputRef.current?.click();
      return;
    }
    const node = buildPptInsertNode({
      doc,
      slide: activeSlide,
      item,
      point
    });
    const inserted = store.executeCommand(
      {
        type: "InsertNode",
        parentId: activeSlide.id,
        node
      },
      { summary: `ppt insert ${item.id}` }
    );
    if (!inserted) {
      setLayoutHint("插入失败");
      setTimeout(() => setLayoutHint(""), 1600);
      return;
    }
    store.rememberPptInsertItem(item.id);
    store.setSelection(node.id, false);
    clearInsertPreviewState();
    setLayoutHint(`已插入${item.label}`);
    setTimeout(() => setLayoutHint(""), 1600);
  };

  const insertPptArtifact = (
    anchorSlideId: string,
    artifact: NonNullable<ReturnType<typeof decodeCopilotArtifact>>,
    position: PptArtifactDropPosition = "after"
  ): void => {
    if (!supportsPptArtifactDrop(artifact)) {
      return;
    }
    const anchorIndex = slides.findIndex((slide) => slide.id === anchorSlideId);
    const node = buildPptArtifactDropNode(artifact);
    const inserted = store.executeCommand(
      {
        type: "InsertNode",
        parentId: doc.root.id,
        index: anchorIndex >= 0 ? anchorIndex + (position === "after" ? 1 : 0) : slides.length,
        node
      },
      { summary: `ppt insert artifact ${artifact.artifactId}` }
    );
    if (!inserted) {
      setLayoutHint("页面插入失败");
      setTimeout(() => setLayoutHint(""), 1600);
      return;
    }
    const result = copilot?.results.find(
      (item): item is CopilotArtifactResultItem => item.kind === "artifact" && item.resultId === artifact.resultId
    );
    if (result && copilot) {
      copilot.upsertResult(withArtifactAppliedNode(result, node.id));
    }
    setActiveSlideId(node.id);
    store.setSelection(node.id, false);
    copilot?.spotlightNode(doc.docId, node.id);
    setLayoutHint(`已${position === "before" ? "前插" : "后插"}页面：${artifact.title}`);
    setTimeout(() => setLayoutHint(""), 1600);
  };

  const getPptArtifactDropLabel = useCallback((position: PptArtifactDropPosition): string => {
    return position === "before" ? "松开后插入到此页前" : "松开后插入到此页后";
  }, []);

  const handlePptImagePicked = async (file?: File): Promise<void> => {
    const point = pendingImagePointRef.current;
    pendingImagePointRef.current = undefined;
    const imageItem = insertGroups.flatMap((group) => group.items).find((item) => item.id === "media.image");
    if (!file || !activeSlide || !imageItem) {
      return;
    }
    try {
      const uploaded = await assetRepoRef.current.uploadImage(file);
      const naturalWidth = Math.max(180, uploaded.width || imageItem.size.w);
      const naturalHeight = Math.max(120, uploaded.height || imageItem.size.h);
      const maxWidth = Math.min(420, naturalWidth);
      const scaledHeight = Math.max(120, Math.round(maxWidth * (naturalHeight / Math.max(1, naturalWidth))));
      const node = buildPptImageNode({
        slide: activeSlide,
        item: imageItem,
        assetId: uploaded.asset.assetId,
        title: file.name,
        point,
        width: maxWidth,
        height: scaledHeight
      });
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
            {
              type: "InsertNode",
              parentId: activeSlide.id,
              node
            }
          ]
        },
        { summary: `ppt insert image ${file.name}` }
      );
      if (!inserted) {
        setLayoutHint("图片插入失败");
        setTimeout(() => setLayoutHint(""), 1600);
        return;
      }
      store.rememberPptInsertItem(imageItem.id);
      store.setSelection(node.id, false);
      setInsertPreview(null);
      setLayoutHint(`已插入图片：${file.name}`);
      setTimeout(() => setLayoutHint(""), 1600);
    } catch (error) {
      setLayoutHint(error instanceof Error ? error.message : "图片插入失败");
      setTimeout(() => setLayoutHint(""), 1600);
    }
  };

  const getSlidePoint = (target: HTMLDivElement, clientX: number, clientY: number): { x: number; y: number } => {
    const bounds = target.getBoundingClientRect();
    const safeClientX = Number.isFinite(clientX) ? clientX : bounds.left + bounds.width / 2;
    const safeClientY = Number.isFinite(clientY) ? clientY : bounds.top + bounds.height / 2;
    return {
      x: Math.round(safeClientX - bounds.left),
      y: Math.round(safeClientY - bounds.top)
    };
  };

  const updateInsertPreview = (item: PptInsertItem | undefined, point?: { x: number; y: number } | null): void => {
    if (!item || !activeSlide || !point) {
      clearInsertPreviewState();
      return;
    }
    scheduleInsertPreview({
      itemId: item.id,
      label: item.label,
      rect: resolvePptInsertRect({ slide: activeSlide, item, point })
    });
  };

  const applySlideSelection = (nodeIds: string[], additive: boolean): void => {
    const nextIds = additive ? [...new Set([...activeSelectedIds, ...nodeIds])] : [...new Set(nodeIds)];
    store.setSelectionIds(nextIds, nextIds[nextIds.length - 1]);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || isTypingTarget(event.target)) {
        return;
      }
      if (activeSelectedIds.length === 0 && !marquee && !groupDragPreview && !insertPreview && !artifactDropTarget) {
        return;
      }
      setMarquee(null);
      setGroupDragPreview(null);
      setGuides({});
      clearInsertPreviewState();
      setArtifactDropTarget(null);
      store.clearSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSelectedIds.length, artifactDropTarget, groupDragPreview, insertPreview, marquee, store]);

  const resolveSelectedSlideNodeIds = (anchorNodeId: string): string[] => {
    const selectedIds = activeSelectedIds.includes(anchorNodeId) ? activeSelectedIds : [anchorNodeId];
    return selectedIds.filter((id) =>
      (activeSlide?.children ?? []).some((node) => node.id === id && node.layout?.mode === "absolute" && !node.layout?.lock)
    );
  };

  const duplicateSlideNode = (node: VNode, rect: { x: number; y: number; w: number; h: number }): void => {
    if (!activeSlide) {
      return;
    }
    const selectedIds = resolveSelectedSlideNodeIds(node.id);
    const deltaX = Math.round(rect.x - Number(node.layout?.x ?? 0));
    const deltaY = Math.round(rect.y - Number(node.layout?.y ?? 0));
    const plan = buildDuplicateNodesPlan(doc.root, activeSlide.id, selectedIds, (layout, sourceNode) => ({
      ...layout,
      mode: "absolute",
      x: Math.round(Number(sourceNode.layout?.x ?? 0) + deltaX),
      y: Math.round(Number(sourceNode.layout?.y ?? 0) + deltaY),
      w: Math.round(Number(sourceNode.layout?.w ?? 200)),
      h: Math.round(Number(sourceNode.layout?.h ?? 120)),
      z: Number(layout.z ?? sourceNode.layout?.z ?? 1) + 1
    }));
    if (!plan || plan.commands.length === 0) {
      setLayoutHint("复制副本失败");
      setTimeout(() => setLayoutHint(""), 1600);
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands: plan.commands
      },
      { summary: `duplicate ${node.id}` }
    );
    store.setSelectionIds(plan.clonedNodes.map((item) => item.id), plan.primaryNodeId);
    setLayoutHint(plan.clonedNodes.length > 1 ? `已复制 ${plan.clonedNodes.length} 项` : "已复制副本");
    setTimeout(() => setLayoutHint(""), 1600);
  };

  const moveSlideNodes = (
    node: VNode,
    from: { x: number; y: number; w: number; h: number },
    to: { x: number; y: number; w: number; h: number }
  ): void => {
    if (!activeSlide) {
      return;
    }
    const dx = Math.round(to.x - from.x);
    const dy = Math.round(to.y - from.y);
    const selectedIds = resolveSelectedSlideNodeIds(node.id);
    if (selectedIds.length > 1 && (dx !== 0 || dy !== 0)) {
      const commands = (activeSlide.children ?? [])
        .filter((item) => selectedIds.includes(item.id) && item.layout?.mode === "absolute" && !item.layout?.lock)
        .map((item) => ({
          type: "UpdateLayout" as const,
          nodeId: item.id,
          layout: {
            mode: "absolute" as const,
            x: Math.round(Number(item.layout?.x ?? 0) + dx),
            y: Math.round(Number(item.layout?.y ?? 0) + dy)
          }
        }));
      if (commands.length === 0) {
        return;
      }
      store.executeCommand(
        {
          type: "Transaction",
          commands
        },
        { summary: `move selection ${node.id}`, mergeWindowMs: 180 }
      );
      store.setSelectionIds(selectedIds, node.id);
      return;
    }
    const groupId = node.layout?.group;
    if (!groupId || (dx === 0 && dy === 0)) {
      store.executeCommand(
        {
          type: "UpdateLayout",
          nodeId: node.id,
          layout: { mode: "absolute", x: Math.round(to.x), y: Math.round(to.y), w: Math.round(to.w), h: Math.round(to.h) }
        },
        { summary: `move ${node.id}`, mergeWindowMs: 180 }
      );
      return;
    }
    const groupMembers = (activeSlide.children ?? []).filter((item) => item.layout?.group === groupId && item.layout?.mode === "absolute");
    const commands = groupMembers
      .filter((item) => !item.layout?.lock)
      .map((item) => {
        const constraint = (item.layout?.groupConstraint ?? node.layout?.groupConstraint ?? "free") as "free" | "x" | "y";
        const ox = Number(item.layout?.x ?? 0);
        const oy = Number(item.layout?.y ?? 0);
        return {
          type: "UpdateLayout" as const,
          nodeId: item.id,
          layout: {
            mode: "absolute" as const,
            x: constraint === "y" ? ox : ox + dx,
            y: constraint === "x" ? oy : oy + dy
          }
        };
      });
    if (commands.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands
      },
      { summary: `move group ${groupId}`, mergeWindowMs: 180 }
    );
  };

  return (
    <div className="row" style={{ height: "100%", alignItems: "stretch" }}>
      {showNavigator ? (
        <div style={{ width: 200, borderRight: "1px solid var(--line)", padding: "0 8px", overflow: "auto" }}>
          <div className="row" style={{ justifyContent: "space-between", margin: "8px 0" }}>
            <strong>缩略图</strong>
            <span className="chip">{slides.length}</span>
          </div>
          {slides.map((slide, index) => (
            (() => {
              const activeArtifactDrop = artifactDropTarget?.slideId === slide.id ? artifactDropTarget : null;
              return (
                <div key={slide.id} className="ppt-nav-drop-stack">
                  <div
                    className={`ppt-nav-drop-anchor ${activeArtifactDrop?.position === "before" ? "active" : ""}`}
                    data-testid={`ppt-artifact-drop-before-${slide.id}`}
                    onDragOver={(event) => {
                      const artifact = decodeCopilotArtifact(event.dataTransfer);
                      if (!artifact || !supportsPptArtifactDrop(artifact)) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      const nextTarget = { slideId: slide.id, position: "before" as const };
                      setArtifactDropTarget((current) => (samePptArtifactDropTarget(current, nextTarget) ? current : nextTarget));
                    }}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        return;
                      }
                      setArtifactDropTarget((current) => (current?.slideId === slide.id && current.position === "before" ? null : current));
                    }}
                    onDrop={(event) => {
                      const artifact = decodeCopilotArtifact(event.dataTransfer);
                      clearCopilotArtifactDrag();
                      setArtifactDropTarget(null);
                      if (!artifact || !supportsPptArtifactDrop(artifact)) {
                        return;
                      }
                      event.preventDefault();
                      insertPptArtifact(slide.id, artifact, "before");
                    }}
                  >
                    <span className="ppt-nav-drop-anchor-line" />
                    <span className="ppt-nav-drop-anchor-label">
                      {activeArtifactDrop?.position === "before" ? getPptArtifactDropLabel("before") : "拖到此处可前插页面"}
                    </span>
                  </div>
                  <div
                    className={`tree-item ${activeSlide?.id === slide.id ? "active" : ""} ${activeArtifactDrop ? "is-drop-target" : ""} ${spotlightSlideId === slide.id ? `is-copilot-spotlight ${spotlightPulseClass ?? ""}` : ""}`}
                    style={
                      activeArtifactDrop
                        ? {
                            borderColor: "#1d4ed8",
                            background: "rgba(29, 78, 216, 0.08)"
                          }
                        : undefined
                    }
                    onClick={() => {
                      setActiveSlideId(slide.id);
                      store.setSelection(slide.id, false);
                    }}
                  >
                    <div>#{index + 1}</div>
                    <div className="muted">{resolvePptSlideTitle(slide)}</div>
                  </div>
                  <div
                    className={`ppt-nav-drop-anchor ${activeArtifactDrop?.position === "after" ? "active" : ""}`}
                    data-testid={`ppt-artifact-drop-after-${slide.id}`}
                    onDragOver={(event) => {
                      const artifact = decodeCopilotArtifact(event.dataTransfer);
                      if (!artifact || !supportsPptArtifactDrop(artifact)) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      const nextTarget = { slideId: slide.id, position: "after" as const };
                      setArtifactDropTarget((current) => (samePptArtifactDropTarget(current, nextTarget) ? current : nextTarget));
                    }}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        return;
                      }
                      setArtifactDropTarget((current) => (current?.slideId === slide.id && current.position === "after" ? null : current));
                    }}
                    onDrop={(event) => {
                      const artifact = decodeCopilotArtifact(event.dataTransfer);
                      clearCopilotArtifactDrag();
                      setArtifactDropTarget(null);
                      if (!artifact || !supportsPptArtifactDrop(artifact)) {
                        return;
                      }
                      event.preventDefault();
                      insertPptArtifact(slide.id, artifact, "after");
                    }}
                  >
                    <span className="ppt-nav-drop-anchor-line" />
                    <span className="ppt-nav-drop-anchor-label">
                      {activeArtifactDrop?.position === "after" ? getPptArtifactDropLabel("after") : "拖到此处可后插页面"}
                    </span>
                  </div>
                </div>
              );
            })()
          ))}
        </div>
      ) : null}

      <div ref={stageRef} className="canvas-wrap ppt-editor-stage" style={{ flex: 1 }}>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          style={{ display: "none" }}
          onChange={(event) => {
            void handlePptImagePicked(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        {ui.pptInsertPanelOpen ? (
          <FloatingLayer anchorRef={stageRef} className="dashboard-insert-panel-layer" resolveStyle={resolveSideInsertPanelStyle}>
            <EditorInsertPanel
              title="插入组件"
              subtitle="点击插入到当前页，也可拖到画布"
              search={insertSearch}
              placeholder="搜索图表、表格、文本、图片"
              groups={insertPanelGroups}
              testId="ppt-insert-panel"
              onSearchChange={setInsertSearch}
              onClose={() => store.setPptInsertPanelOpen(false)}
              onInsert={(item) => insertPptItem(item.source)}
              onDragStart={(item, event) => {
                if (item.source.kind === "image") {
                  event.preventDefault();
                  return;
                }
                encodePptInsertItem(event.dataTransfer, item.source.id);
              }}
              onDragEnd={() => {
                clearPptInsertItemDrag();
                clearInsertPreviewState();
              }}
            />
          </FloatingLayer>
        ) : null}
        <div className="row ppt-editor-meta" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          {activeSlide ? <span className="chip">{resolvePptSlideTitle(activeSlide)}</span> : null}
          <span className="chip">选中: {activeSelectedIds.length}</span>
          <span className="chip">{snapEnabled ? "吸附开" : "吸附关"}</span>
          {ui.pptInsertPanelOpen ? <span className="chip">插入面板已展开</span> : null}
          {layoutHint ? <span className="chip">{layoutHint}</span> : null}
        </div>
        {activeSlide ? (
          <PptSlideFrame
            deck={deck}
            slide={activeSlide}
            slideIndex={Math.max(0, slides.findIndex((item) => item.id === activeSlide.id))}
            className={spotlightSlideId === activeSlide.id ? `is-copilot-spotlight ${spotlightPulseClass ?? ""}` : ""}
            data-testid={`ppt-slide-canvas-${activeSlide.id}`}
            onDragOver={(event) => {
              const item = decodePptInsertItem(event.dataTransfer);
              if (!item) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              updateInsertPreview(item, getSlidePoint(event.currentTarget, event.clientX, event.clientY));
            }}
            onDrop={(event) => {
              const item = decodePptInsertItem(event.dataTransfer);
              clearPptInsertItemDrag();
              clearInsertPreviewState();
              if (!item) {
                return;
              }
              event.preventDefault();
              insertPptItem(item, getSlidePoint(event.currentTarget, event.clientX, event.clientY));
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                return;
              }
              clearInsertPreviewState();
            }}
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
                setMarquee({
                  startX: event.clientX - bounds.left,
                  startY: event.clientY - bounds.top,
                  currentX: event.clientX - bounds.left,
                  currentY: event.clientY - bounds.top,
                  additive: isAdditiveSelectionModifier(event)
                });
              }}
            onMouseMove={(event) => {
              if (!marquee) {
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              setMarquee((current) =>
                current
                  ? {
                      ...current,
                      currentX: event.clientX - bounds.left,
                      currentY: event.clientY - bounds.top
                    }
                  : current
              );
            }}
            onMouseUp={(event) => {
              if (!marquee || event.target !== event.currentTarget) {
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              const rect = buildCanvasSelectionRect(marquee.startX, marquee.startY, event.clientX - bounds.left, event.clientY - bounds.top);
              setMarquee(null);
              if (!isCanvasSelectionGesture(rect)) {
                store.setSelection(activeSlide.id, false);
                return;
              }
              const ids = resolveCanvasSelectionIds(
                (activeSlide.children ?? []).map((node) => ({
                  id: node.id,
                  left: Number(node.layout?.x ?? 0),
                  top: Number(node.layout?.y ?? 0),
                  width: Number(node.layout?.w ?? 100),
                  height: Number(node.layout?.h ?? 60)
                })),
                rect
              );
              if (ids.length === 0) {
                store.setSelection(activeSlide.id, false);
                return;
              }
              applySlideSelection(ids, marquee.additive);
            }}
          >
            {insertPreview ? (
              <div
                className="dashboard-insert-preview"
                style={{
                  left: insertPreview.rect.x,
                  top: insertPreview.rect.y,
                  width: insertPreview.rect.w,
                  height: insertPreview.rect.h
                }}
              >
                <span className="dashboard-insert-preview-label">{insertPreview.label}</span>
              </div>
            ) : null}
            {marquee ? <div className="canvas-selection-rect" style={buildCanvasSelectionRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY)} /> : null}
            {guides.v !== undefined ? <div style={{ position: "absolute", left: guides.v, top: 0, bottom: 0, borderLeft: "1px dashed #60a5fa" }} /> : null}
            {guides.h !== undefined ? <div style={{ position: "absolute", top: guides.h, left: 0, right: 0, borderTop: "1px dashed #60a5fa" }} /> : null}
            {(activeSlide.children ?? []).map((node) => (
              <SlideNode
                key={node.id}
                dataDoc={nodeDataDoc}
                assetDoc={assetDoc}
                node={node}
                allNodes={activeSlide.children ?? []}
                selected={selection.selectedIds.includes(node.id)}
                onSelect={(multi) => store.setSelection(node.id, multi)}
                onCommitMove={(from, to) => moveSlideNodes(node, from, to)}
                onCommitResize={(rect) =>
                  store.executeCommand(
                    {
                      type: "UpdateLayout",
                      nodeId: node.id,
                      layout: { mode: "absolute", x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }
                    },
                    { summary: `resize ${node.id}`, mergeWindowMs: 180 }
                  )
                }
                onDuplicateMove={(rect) => duplicateSlideNode(node, rect)}
                groupPreviewOffset={
                  groupDragPreview && groupDragPreview.anchorId !== node.id && groupDragPreview.nodeIds.includes(node.id)
                    ? { x: groupDragPreview.deltaX, y: groupDragPreview.deltaY }
                    : undefined
                }
                onPreviewGroupDrag={(deltaX, deltaY, duplicateOnDrop) => {
                  const selectedIds = resolveSelectedSlideNodeIds(node.id);
                  if (selectedIds.length <= 1) {
                    setGroupDragPreview(null);
                    return;
                  }
                  const nextPreview = {
                    anchorId: node.id,
                    nodeIds: selectedIds,
                    deltaX,
                    deltaY,
                    duplicateOnDrop
                  };
                  setGroupDragPreview((current) => (sameSlideGroupDragPreview(current, nextPreview) ? current : nextPreview));
                }}
                onClearGroupDragPreview={() =>
                  setGroupDragPreview((current) => (current?.anchorId === node.id ? null : current))
                }
                onBringFront={() =>
                  store.executeCommand(
                    {
                      type: "UpdateLayout",
                      nodeId: node.id,
                      layout: { z: 999 }
                    },
                    { summary: "bring front" }
                  )
                }
                onSendBack={() =>
                  store.executeCommand(
                    {
                      type: "UpdateLayout",
                      nodeId: node.id,
                      layout: { z: 0 }
                    },
                    { summary: "send back" }
                  )
                }
                onSetGuides={setGuides}
                engine={engine}
                dataVersion={dataVersion}
                snapEnabled={snapEnabled}
              />
            ))}
          </PptSlideFrame>
        ) : (
          <div className="muted">暂无幻灯片</div>
        )}
      </div>
    </div>
  );
}

function SlideNode({
  dataDoc,
  assetDoc,
  node,
  allNodes,
  selected,
  onSelect,
  onCommitMove,
  onCommitResize,
  onDuplicateMove,
  groupPreviewOffset,
  onPreviewGroupDrag,
  onClearGroupDragPreview,
  onBringFront,
  onSendBack,
  onSetGuides,
  engine,
  dataVersion,
  snapEnabled
}: {
  dataDoc: {
    dataSources: VDoc["dataSources"];
    queries: VDoc["queries"];
    filters: VDoc["filters"];
    templateVariables: VDoc["templateVariables"];
  };
  assetDoc: Pick<VDoc, "assets">;
  node: VNode;
  allNodes: VNode[];
  selected: boolean;
  onSelect: (multi: boolean) => void;
  onCommitMove: (from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }) => void;
  onCommitResize: (rect: { x: number; y: number; w: number; h: number }) => void;
  onDuplicateMove: (rect: { x: number; y: number; w: number; h: number }) => void;
  groupPreviewOffset?: { x: number; y: number };
  onPreviewGroupDrag: (deltaX: number, deltaY: number, duplicateOnDrop: boolean) => void;
  onClearGroupDragPreview: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onSetGuides: (guides: Guides) => void;
  engine: DataEngine;
  dataVersion: number | string;
  snapEnabled: boolean;
}): JSX.Element {
  const { rows, loading, error } = useNodeRows(dataDoc, node, engine, dataVersion);
  const layout = resolvePptSlideNodeLayout(node, { x: 80, y: 80, w: 200, h: 120, z: 1 });
  const showOuterTitle = shouldRenderOuterNodeTitle(node);
  const nodeTitle = node.kind === "image" ? resolveImageNodeTitle(assetDoc, node) : resolveNodeDisplayTitle(node);
  const [rect, setRect] = useState({
    x: layout.x,
    y: layout.y,
    w: layout.w,
    h: layout.h
  });
  const [start, setStart] = useState<{ x: number; y: number; rect: typeof rect } | null>(null);
  const [mode, setMode] = useState<"move" | "resize" | null>(null);
  const [duplicateOnDrop, setDuplicateOnDrop] = useState(false);
  const rectRef = useRef(rect);
  const startRef = useRef(start);
  const modeRef = useRef(mode);
  const duplicateOnDropRef = useRef(duplicateOnDrop);
  const previewEventRef = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const editorZIndex = Number(node.layout?.z ?? 1) + (selected ? 2000 : 0);

  useEffect(() => {
    setRect({
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: layout.h
    });
  }, [layout.h, layout.w, layout.x, layout.y]);

  useEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    duplicateOnDropRef.current = duplicateOnDrop;
  }, [duplicateOnDrop]);

  const snap = useCallback((candidate: typeof rect): typeof rect => {
    if (!snapEnabled) {
      onSetGuides({});
      return candidate;
    }
    const threshold = 6;
    let next = { ...candidate };
    let vGuide: number | undefined;
    let hGuide: number | undefined;

    const centerX = next.x + next.w / 2;
    const centerY = next.y + next.h / 2;
    if (Math.abs(centerX - 480) <= threshold) {
      next.x = 480 - next.w / 2;
      vGuide = 480;
    }
    if (Math.abs(centerY - 270) <= threshold) {
      next.y = 270 - next.h / 2;
      hGuide = 270;
    }

    allNodes
      .filter((item) => item.id !== node.id)
      .forEach((other) => {
        const ox = Number(other.layout?.x ?? 0);
        const oy = Number(other.layout?.y ?? 0);
        if (Math.abs(next.x - ox) <= threshold) {
          next.x = ox;
          vGuide = ox;
        }
        if (Math.abs(next.y - oy) <= threshold) {
          next.y = oy;
          hGuide = oy;
        }
      });

    onSetGuides({ v: vGuide, h: hGuide });
    return next;
  }, [allNodes, node.id, onSetGuides, snapEnabled]);

  const onPointerDownMove = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (node.layout?.lock) {
      return;
    }
    event.preventDefault();
    const additive = isAdditiveSelectionModifier(event);
    if (!selected || additive) {
      onSelect(additive);
    }
    setMode("move");
    setDuplicateOnDrop(Boolean(event.altKey || event.getModifierState?.("Alt")));
    setStart({ x: event.clientX, y: event.clientY, rect });
  };

  useEffect(() => {
    if (!start || !mode) {
      return;
    }
    const flushPreview = (): void => {
      const event = previewEventRef.current;
      const currentStart = startRef.current;
      const currentMode = modeRef.current;
      if (!event || !currentStart || !currentMode) {
        return;
      }
      const dx = event.clientX - currentStart.x;
      const dy = event.clientY - currentStart.y;
      const nextDuplicateOnDrop = duplicateOnDropRef.current || Boolean(event.altKey);
      duplicateOnDropRef.current = nextDuplicateOnDrop;
      setDuplicateOnDrop((current) => (current === nextDuplicateOnDrop ? current : nextDuplicateOnDrop));
      if (currentMode === "move") {
        onPreviewGroupDrag(dx, dy, nextDuplicateOnDrop);
        const nextRect = snap({ ...currentStart.rect, x: Math.max(0, currentStart.rect.x + dx), y: Math.max(0, currentStart.rect.y + dy) });
        rectRef.current = nextRect;
        setRect(nextRect);
        return;
      }
      const nextRect = snap({ ...currentStart.rect, w: Math.max(80, currentStart.rect.w + dx), h: Math.max(56, currentStart.rect.h + dy) });
      rectRef.current = nextRect;
      setRect(nextRect);
    };
    const schedulePreview = (event: MouseEvent): void => {
      previewEventRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        altKey: Boolean(event.altKey)
      };
      if (previewFrameRef.current !== null) {
        return;
      }
      previewFrameRef.current = window.requestAnimationFrame(() => {
        previewFrameRef.current = null;
        flushPreview();
      });
    };
    const handleMouseMove = (event: MouseEvent): void => {
      schedulePreview(event);
    };
    const handleMouseUp = (): void => {
      if (previewFrameRef.current !== null) {
        window.cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = null;
      }
      flushPreview();
      const currentStart = startRef.current;
      const currentMode = modeRef.current;
      const currentRect = rectRef.current;
      const currentDuplicateOnDrop = duplicateOnDropRef.current;
      if (!currentStart || !currentMode) {
        return;
      }
      if (currentMode === "move" && currentDuplicateOnDrop) {
        if (Math.abs(currentRect.x - currentStart.rect.x) >= 3 || Math.abs(currentRect.y - currentStart.rect.y) >= 3) {
          onDuplicateMove(currentRect);
        }
      } else if (currentMode === "move") {
        onCommitMove(currentStart.rect, currentRect);
      } else {
        onCommitResize(currentRect);
      }
      setMode(null);
      setStart(null);
      setDuplicateOnDrop(false);
      modeRef.current = null;
      startRef.current = null;
      duplicateOnDropRef.current = false;
      previewEventRef.current = null;
      onClearGroupDragPreview();
      onSetGuides({});
    };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      if (previewFrameRef.current !== null) {
        window.cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = null;
      }
      previewEventRef.current = null;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [mode, onClearGroupDragPreview, onCommitMove, onCommitResize, onDuplicateMove, onPreviewGroupDrag, onSetGuides, snap, start]);

  const onResizeDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (node.layout?.lock) {
      return;
    }
    event.preventDefault();
    const additive = isAdditiveSelectionModifier(event);
    if (!selected || additive) {
      onSelect(additive);
    }
    setMode("resize");
    setStart({ x: event.clientX, y: event.clientY, rect });
    setDuplicateOnDrop(false);
  };

  return (
    <div
      className={`slide-node ${selected ? "active" : ""} ${node.layout?.lock ? "is-locked" : ""}`}
      data-testid={`ppt-node-${node.id}`}
      style={resolvePptSlideNodeStyle(
        node,
        {
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
          zIndex: editorZIndex,
          transform: groupPreviewOffset ? `translate(${groupPreviewOffset.x}px, ${groupPreviewOffset.y}px)` : undefined
        },
        { x: 80, y: 80, w: 200, h: 120, z: 1 }
      )}
      onMouseDown={onPointerDownMove}
      onDoubleClick={() => onBringFront()}
      onContextMenu={(event) => {
        event.preventDefault();
        onSendBack();
      }}
    >
      {selected ? <div className="ppt-node-active-wash" /> : null}
      {node.kind !== "text" && showOuterTitle ? (
        <div className={`node-floating-label ${selected ? "show" : ""}`} style={resolveTitleTextStyle({ fontSize: 12, bold: true }, resolveNodeTitleStyle(node))}>
          {nodeTitle}
        </div>
      ) : null}
      <div className="ppt-node-content">
        {node.kind === "text" ? (
          <NodeTextBlock node={node} style={{ width: "100%", height: "100%" }} />
        ) : node.kind === "table" ? (
          loading || error ? <NodeDataState loading={loading} error={error} remote={isRemoteDataNode(dataDoc, node)} /> : <TableView spec={node.props as TableSpec} rows={rows} height="100%" />
        ) : node.kind === "chart" ? (
          loading || error ? (
            <NodeDataState loading={loading} error={error} remote={isRemoteDataNode(dataDoc, node)} />
          ) : (
            <div style={{ width: "100%", height: "100%", position: "relative" }}>
              <EChartView spec={node.props as ChartSpec} rows={rows} height="100%" />
            </div>
          )
        ) : node.kind === "image" ? (
          <PptImageNode doc={assetDoc} node={node} />
        ) : (
          <div className="muted">unsupported: {node.kind}</div>
        )}
      </div>
      {selected && !node.layout?.lock ? <div className="resize-handle" data-testid={`ppt-resize-handle-${node.id}`} onMouseDown={onResizeDown} /> : null}
    </div>
  );
}

function PptImageNode({ doc, node }: { doc: Pick<VDoc, "assets">; node: VNode }): JSX.Element {
  const props = (node.props ?? {}) as ImageProps;
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
