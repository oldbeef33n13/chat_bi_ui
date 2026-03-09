import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ChartSpec, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { EChartView } from "../../runtime/chart/EChartView";
import { TableView } from "../../runtime/table/TableView";
import { FloatingLayer } from "../components/FloatingLayer";
import { EditorInsertPanel, type EditorInsertPanelItem } from "../components/EditorInsertPanel";
import { useNodeRows } from "../hooks/use-node-rows";
import { useDataEngine } from "../hooks/use-data-engine";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { resolveAncestorIdByKind } from "../utils/node-tree";
import { buildCanvasSelectionRect, isCanvasSelectionGesture, resolveCanvasSelectionIds } from "../utils/canvas-selection";
import { buildDuplicateNodesPlan } from "../utils/duplicate-nodes";
import { isAdditiveSelectionModifier, isTypingTarget } from "../utils/editor-input";
import { resolveSideInsertPanelStyle } from "../utils/editor-insert-layout";
import {
  buildPptInsertNode,
  clearPptInsertItemDrag,
  decodePptInsertItem,
  encodePptInsertItem,
  resolvePptInsertGroups,
  resolvePptInsertRect,
  type PptInsertItem
} from "../utils/ppt-insert";

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

/**
 * PPT 编辑器：
 * - 页面管理（缩略图导航）
 * - 绝对定位拖拽与缩放
 * - 吸附与层级调整
 */
export function PptEditor({ doc, showNavigator = true }: PptEditorProps): JSX.Element {
  const store = useEditorStore();
  const selection = useSignalValue(store.selection);
  const ui = useSignalValue(store.ui);
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const slides = (doc.root.children ?? []).filter((node) => node.kind === "slide");
  const selectedSlideId = resolveAncestorIdByKind(doc.root, selection.primaryId, "slide");
  const [activeSlideId, setActiveSlideId] = useState(selectedSlideId ?? slides[0]?.id);
  const activeSlide = slides.find((slide) => slide.id === activeSlideId) ?? slides.find((slide) => slide.id === selectedSlideId) ?? slides[0];
  const [guides, setGuides] = useState<Guides>({});
  const [marquee, setMarquee] = useState<SlideMarqueeState | null>(null);
  const [groupDragPreview, setGroupDragPreview] = useState<SlideGroupDragPreview | null>(null);
  const [insertSearch, setInsertSearch] = useState("");
  const [insertPreview, setInsertPreview] = useState<{ itemId: string; label: string; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  const snapEnabled = (doc.root.props as Record<string, unknown>)?.editorSnapEnabled === undefined ? true : Boolean((doc.root.props as Record<string, unknown>)?.editorSnapEnabled);
  const rootProps = (doc.root.props ?? {}) as Record<string, unknown>;
  const masterShowHeader = rootProps.masterShowHeader === undefined ? true : Boolean(rootProps.masterShowHeader);
  const masterHeaderText = String(rootProps.masterHeaderText ?? doc.title ?? "");
  const masterShowFooter = rootProps.masterShowFooter === undefined ? true : Boolean(rootProps.masterShowFooter);
  const masterFooterText = String(rootProps.masterFooterText ?? "Visual Document OS");
  const masterShowSlideNumber = rootProps.masterShowSlideNumber === undefined ? true : Boolean(rootProps.masterShowSlideNumber);
  const masterAccentColor = String(rootProps.masterAccentColor ?? "#1d4ed8");
  const masterPaddingXPx = Math.max(0, Number(rootProps.masterPaddingXPx ?? 24) || 24);
  const masterHeaderTopPx = Math.max(0, Number(rootProps.masterHeaderTopPx ?? 12) || 12);
  const masterHeaderHeightPx = Math.max(12, Number(rootProps.masterHeaderHeightPx ?? 26) || 26);
  const masterFooterBottomPx = Math.max(0, Number(rootProps.masterFooterBottomPx ?? 10) || 10);
  const masterFooterHeightPx = Math.max(12, Number(rootProps.masterFooterHeightPx ?? 22) || 22);
  const [layoutHint, setLayoutHint] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedSlideId && selectedSlideId !== activeSlideId) {
      setActiveSlideId(selectedSlideId);
      return;
    }
    if (!activeSlideId && slides[0]) {
      setActiveSlideId(slides[0].id);
    }
  }, [activeSlideId, selectedSlideId, slides]);

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
        title: "点击插入到当前页，也可拖到画布",
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
    setInsertPreview(null);
    setLayoutHint(`已插入${item.label}`);
    setTimeout(() => setLayoutHint(""), 1600);
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
      setInsertPreview(null);
      return;
    }
    setInsertPreview({
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
      if (activeSelectedIds.length === 0 && !marquee && !groupDragPreview && !insertPreview) {
        return;
      }
      setMarquee(null);
      setGroupDragPreview(null);
      setGuides({});
      setInsertPreview(null);
      store.clearSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSelectedIds.length, groupDragPreview, insertPreview, marquee, store]);

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
            <div
              key={slide.id}
              className={`tree-item ${activeSlide?.id === slide.id ? "active" : ""}`}
              onClick={() => {
                setActiveSlideId(slide.id);
                store.setSelection(slide.id, false);
              }}
            >
              <div>#{index + 1}</div>
              <div className="muted">{String((slide.props as Record<string, unknown>)?.title ?? slide.id)}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div ref={stageRef} className="canvas-wrap ppt-editor-stage" style={{ flex: 1 }}>
        {ui.pptInsertPanelOpen ? (
          <FloatingLayer anchorRef={stageRef} className="dashboard-insert-panel-layer" resolveStyle={resolveSideInsertPanelStyle}>
            <EditorInsertPanel
              title="插入组件"
              subtitle="点击插入到当前页，也可拖到画布"
              search={insertSearch}
              placeholder="搜索图表、表格、文本"
              groups={insertPanelGroups}
              testId="ppt-insert-panel"
              onSearchChange={setInsertSearch}
              onClose={() => store.setPptInsertPanelOpen(false)}
              onInsert={(item) => insertPptItem(item.source)}
              onDragStart={(item, event) => encodePptInsertItem(event.dataTransfer, item.source.id)}
              onDragEnd={() => clearPptInsertItemDrag()}
            />
          </FloatingLayer>
        ) : null}
        <div className="row ppt-editor-meta" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          {activeSlide ? <span className="chip">{String((activeSlide.props as Record<string, unknown>)?.title ?? activeSlide.id)}</span> : null}
          <span className="chip">选中: {activeSelectedIds.length}</span>
          <span className="chip">{snapEnabled ? "吸附开" : "吸附关"}</span>
          {ui.pptInsertPanelOpen ? <span className="chip">插入面板已展开</span> : null}
          {layoutHint ? <span className="chip">{layoutHint}</span> : null}
        </div>
        {activeSlide ? (
          <div
            className="slide"
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
              setInsertPreview(null);
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
              setInsertPreview(null);
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
            {masterShowHeader ? (
              <div style={{ position: "absolute", left: masterPaddingXPx, right: masterPaddingXPx, top: masterHeaderTopPx, minHeight: masterHeaderHeightPx, borderBottom: `1px solid ${masterAccentColor}`, display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", paddingBottom: 4, zIndex: 2, pointerEvents: "none" }}>
                <span>{masterHeaderText || String((activeSlide.props as Record<string, unknown>)?.title ?? "")}</span>
                <span>{String((activeSlide.props as Record<string, unknown>)?.title ?? "")}</span>
              </div>
            ) : null}
            {masterShowFooter ? (
              <div style={{ position: "absolute", left: masterPaddingXPx, right: masterPaddingXPx, bottom: masterFooterBottomPx, minHeight: masterFooterHeightPx, borderTop: `1px solid ${masterAccentColor}`, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", paddingTop: 4, zIndex: 2, pointerEvents: "none" }}>
                <span>{masterFooterText}</span>
                {masterShowSlideNumber ? <span>{`#${slides.findIndex((item) => item.id === activeSlide.id) + 1}`}</span> : null}
              </div>
            ) : null}
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
                doc={doc}
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
                  setGroupDragPreview({
                    anchorId: node.id,
                    nodeIds: selectedIds,
                    deltaX,
                    deltaY,
                    duplicateOnDrop
                  });
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
          </div>
        ) : (
          <div className="muted">暂无幻灯片</div>
        )}
      </div>
    </div>
  );
}

function SlideNode({
  doc,
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
  doc: VDoc;
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
  dataVersion: string;
  snapEnabled: boolean;
}): JSX.Element {
  const { rows, loading, error } = useNodeRows(doc, node, engine, dataVersion);
  const layout = node.layout ?? { mode: "absolute", x: 80, y: 80, w: 200, h: 120, z: 1 };
  const nodeTitle =
    node.kind === "chart"
      ? String((node.props as ChartSpec | undefined)?.titleText ?? node.name ?? node.id)
      : node.kind === "table"
        ? String((node.props as TableSpec | undefined)?.titleText ?? node.name ?? node.id)
        : "";
  const [rect, setRect] = useState({
    x: Number(layout.x ?? 80),
    y: Number(layout.y ?? 80),
    w: Number(layout.w ?? 200),
    h: Number(layout.h ?? 120)
  });
  const [start, setStart] = useState<{ x: number; y: number; rect: typeof rect } | null>(null);
  const [mode, setMode] = useState<"move" | "resize" | null>(null);
  const [duplicateOnDrop, setDuplicateOnDrop] = useState(false);
  const rectRef = useRef(rect);
  const startRef = useRef(start);
  const modeRef = useRef(mode);
  const duplicateOnDropRef = useRef(duplicateOnDrop);
  const editorZIndex = Number(node.layout?.z ?? 1) + (selected ? 2000 : 0);

  useEffect(() => {
    setRect({
      x: Number(layout.x ?? 80),
      y: Number(layout.y ?? 80),
      w: Number(layout.w ?? 200),
      h: Number(layout.h ?? 120)
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
    const handleMouseMove = (event: MouseEvent): void => {
      const currentStart = startRef.current;
      const currentMode = modeRef.current;
      if (!currentStart || !currentMode) {
        return;
      }
      const dx = event.clientX - currentStart.x;
      const dy = event.clientY - currentStart.y;
      const nextDuplicateOnDrop = duplicateOnDropRef.current || Boolean(event.altKey);
      duplicateOnDropRef.current = nextDuplicateOnDrop;
      setDuplicateOnDrop(nextDuplicateOnDrop);
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
    const handleMouseUp = (): void => {
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
      onClearGroupDragPreview();
      onSetGuides({});
    };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
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
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: editorZIndex,
        transform: groupPreviewOffset ? `translate(${groupPreviewOffset.x}px, ${groupPreviewOffset.y}px)` : undefined
      }}
      onMouseDown={onPointerDownMove}
      onDoubleClick={() => onBringFront()}
      onContextMenu={(event) => {
        event.preventDefault();
        onSendBack();
      }}
    >
      {selected ? <div className="ppt-node-active-wash" /> : null}
      {node.kind !== "text" ? <div className={`node-floating-label ${selected ? "show" : ""}`}>{nodeTitle}</div> : null}
      <div className="ppt-node-content">
        {node.kind === "text" ? (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", width: "100%", height: "100%", overflow: "auto" }}>
            {String((node.props as Record<string, unknown>)?.text ?? "")}
          </pre>
        ) : node.kind === "table" ? (
          loading ? (
            <div className="muted">loading...</div>
          ) : error ? (
            <div className="muted">error: {error}</div>
          ) : (
            <TableView spec={node.props as TableSpec} rows={rows} height="100%" />
          )
        ) : node.kind === "chart" ? (
          loading ? (
            <div className="muted">loading...</div>
          ) : error ? (
            <div className="muted">error: {error}</div>
          ) : (
            <div style={{ width: "100%", height: "100%", position: "relative" }}>
              <EChartView spec={node.props as ChartSpec} rows={rows} height="100%" />
            </div>
          )
        ) : (
          <div className="muted">unsupported: {node.kind}</div>
        )}
      </div>
      {selected && !node.layout?.lock ? <div className="resize-handle" data-testid={`ppt-resize-handle-${node.id}`} onMouseDown={onResizeDown} /> : null}
    </div>
  );
}
