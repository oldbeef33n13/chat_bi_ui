import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ChartSpec, ImageProps, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { EChartView } from "../../runtime/chart/EChartView";
import { TableView } from "../../runtime/table/TableView";
import { FloatingLayer, type FloatingLayerArgs } from "../components/FloatingLayer";
import { EditorInsertPanel, type EditorInsertPanelItem } from "../components/EditorInsertPanel";
import { useNodeRows } from "../hooks/use-node-rows";
import { useDataEngine } from "../hooks/use-data-engine";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { buildCanvasSelectionRect, isCanvasSelectionGesture, resolveCanvasSelectionIds } from "../utils/canvas-selection";
import {
  buildDashboardInsertNode,
  clearDashboardInsertItemDrag,
  decodeDashboardInsertItem,
  encodeDashboardInsertItem,
  getDashboardInsertItem,
  resolveDashboardInsertGroups,
  resolveDashboardInsertPlacement,
  type DashboardInsertItem
} from "../utils/dashboard-insert";
import { resolveGridConflict, resolveGridGroupMove, isGridOverlap, type GridRect } from "../utils/dashboard-grid";
import { buildDuplicateNodesPlan } from "../utils/duplicate-nodes";
import { isAdditiveSelectionModifier, isTypingTarget } from "../utils/editor-input";
import { buildEmbeddedImageAsset, buildImageNode } from "../utils/image-assets";
import { resolveSideInsertPanelStyle } from "../utils/editor-insert-layout";
import {
  resolveDashboardNodeRect,
  resolveDashboardSurfaceMetrics,
  resolveGridRectFromCanvasRect,
  resolveImageAsset,
  resolveImageNodeTitle,
  type DashboardRect,
  type DashboardSurfaceMetrics
} from "../utils/dashboard-surface";

interface DashboardEditorProps {
  doc: VDoc;
}

interface DashboardMarqueeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
}

interface DashboardGroupDragPreview {
  anchorId: string;
  nodeIds: string[];
  deltaX: number;
  deltaY: number;
  duplicateOnDrop: boolean;
}

export function DashboardEditor({ doc }: DashboardEditorProps): JSX.Element {
  const store = useEditorStore();
  const selection = useSignalValue(store.selection);
  const ui = useSignalValue(store.ui);
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const root = doc.root;
  const children = root.children ?? [];
  const [layoutHint, setLayoutHint] = useState("");
  const [gridPreview, setGridPreview] = useState<{ nodeId: string; layout: GridRect; conflictIds: string[] } | null>(null);
  const [insertPreview, setInsertPreview] = useState<{ itemId: string; label: string; layoutMode: "grid" | "absolute"; rect: DashboardRect } | null>(null);
  const [insertSearch, setInsertSearch] = useState("");
  const [marquee, setMarquee] = useState<DashboardMarqueeState | null>(null);
  const [groupDragPreview, setGroupDragPreview] = useState<DashboardGroupDragPreview | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePointRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const metrics = resolveDashboardSurfaceMetrics({
    doc,
    containerWidth: viewportSize.width,
    containerHeight: viewportSize.height,
    scaleMode: "width"
  });
  const selectedNodeIds = selection.selectedIds.filter((id) => children.some((node) => node.id === id));
  const insertGroups = resolveDashboardInsertGroups({
    doc,
    recentItemIds: ui.dashboardRecentInsertItemIds
  });
  const insertPanelGroups = insertGroups.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map(
      (item): EditorInsertPanelItem & { source: DashboardInsertItem } => ({
        id: item.id,
        label: item.label,
        description: item.description,
        icon: item.icon,
        badge: item.placement === "card" ? "卡片布局" : item.placement === "floating" ? "浮动元素" : "上传后插入",
        accent: item.placement === "upload",
        draggable: item.placement !== "upload",
        title: item.placement === "upload" ? "点击上传后插入" : "点击自动插入，也可拖到画布",
        source: item
      })
    )
  }));
  const displayModeLabel = metrics.displayMode === "fit_screen" ? "全屏适配" : "页面滚动";
  const filterSummary = (doc.filters ?? []).map((filter) => filter.title ?? filter.filterId).slice(0, 2).join(" / ");

  useEffect(() => {
    const host = viewportRef.current;
    if (!host) {
      return;
    }
    const updateSize = (): void => {
      const bounds = host.getBoundingClientRect();
      setViewportSize({
        width: Math.max(320, Math.round(bounds.width || host.clientWidth || 1280)),
        height: Math.max(240, Math.round(bounds.height || host.clientHeight || 720))
      });
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const pushHint = (text: string): void => {
    setLayoutHint(text);
    window.setTimeout(() => setLayoutHint(""), 1400);
  };

  const insertDashboardItem = (item: DashboardInsertItem, point?: { x: number; y: number }): void => {
    if (item.kind === "image") {
      pendingImagePointRef.current = point;
      imageInputRef.current?.click();
      return;
    }
    const node = buildDashboardInsertNode({
      doc,
      root,
      metrics,
      item,
      point
    });
    if (!node) {
      pushHint("插入失败");
      return;
    }
    const inserted = store.executeCommand(
      {
        type: "InsertNode",
        parentId: root.id,
        node
      },
      { summary: `dashboard insert ${item.id}` }
    );
    if (!inserted) {
      pushHint("插入失败");
      return;
    }
    store.rememberDashboardInsertItem(item.id);
    store.setSelection(node.id, false);
    pushHint(`已插入${item.label}`);
    setInsertPreview(null);
  };

  const handleDashboardImagePicked = async (file?: File): Promise<void> => {
    const imageItem = getDashboardInsertItem("media.image");
    const point = pendingImagePointRef.current;
    pendingImagePointRef.current = undefined;
    if (!file || !imageItem) {
      return;
    }
    try {
      const embedded = await buildEmbeddedImageAsset(file);
      const baseWidth = Math.min(420, Math.max(180, embedded.width));
      const baseHeight = Math.max(120, Math.round(baseWidth * ((embedded.height || 1) / (embedded.width || 1))));
      const placement = resolveDashboardInsertPlacement({
        root,
        metrics,
        item: {
          ...imageItem,
          absoluteSize: {
            width: baseWidth,
            height: baseHeight
          }
        },
        point
      });
      const node = buildImageNode({
        assetId: embedded.asset.assetId,
        title: file.name,
        layout: {
          ...placement.layout,
          mode: "absolute",
          z: 1
        }
      });
      const inserted = store.executeCommand(
        {
          type: "Transaction",
          commands: [
            {
              type: "UpdateDoc",
              doc: {
                assets: [...(doc.assets ?? []), embedded.asset]
              }
            },
            {
              type: "InsertNode",
              parentId: root.id,
              node
            }
          ]
        },
        { summary: `dashboard insert image ${file.name}` }
      );
      if (!inserted) {
        pushHint("图片插入失败");
        return;
      }
      store.rememberDashboardInsertItem(imageItem.id);
      store.setSelection(node.id, false);
      pushHint(`已插入图片：${file.name}`);
    } catch (error) {
      pushHint(error instanceof Error ? error.message : "图片插入失败");
    }
  };

  const updateInsertPreview = (item: DashboardInsertItem | undefined, point?: { x: number; y: number } | null): void => {
    if (!item || item.kind === "image" || !point) {
      setInsertPreview(null);
      return;
    }
    const placement = resolveDashboardInsertPlacement({
      root,
      metrics,
      item,
      point
    });
    setInsertPreview({
      itemId: item.id,
      label: item.label,
      layoutMode: placement.layout.mode === "absolute" ? "absolute" : "grid",
      rect: placement.rect
    });
  };

  const applyDashboardSelection = (nodeIds: string[], additive: boolean): void => {
    const nextIds = additive ? [...new Set([...selectedNodeIds, ...nodeIds])] : [...new Set(nodeIds)];
    store.setSelectionIds(nextIds, nextIds[nextIds.length - 1]);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || isTypingTarget(event.target)) {
        return;
      }
      if (selectedNodeIds.length === 0 && !marquee && !groupDragPreview && !gridPreview && !insertPreview) {
        return;
      }
      setMarquee(null);
      setGroupDragPreview(null);
      setGridPreview(null);
      setInsertPreview(null);
      store.clearSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gridPreview, groupDragPreview, insertPreview, marquee, selectedNodeIds.length, store]);

  const resolveSelectedDashboardNodeIds = (anchorNode: VNode, includeLocked = false): string[] => {
    const layoutMode = anchorNode.layout?.mode ?? "grid";
    const selectedIds = selectedNodeIds.includes(anchorNode.id) ? selectedNodeIds : [anchorNode.id];
    return selectedIds.filter((id) =>
      children.some(
        (node) =>
          node.id === id &&
          (node.layout?.mode ?? "grid") === layoutMode &&
          (includeLocked || !node.layout?.lock)
      )
    );
  };

  const duplicateDashboardNode = (node: VNode, layout: GridRect | DashboardRect, mode: "grid" | "absolute"): void => {
    const selectedIds = resolveSelectedDashboardNodeIds(node, true);
    const plan =
      mode === "absolute"
        ? buildDuplicateNodesPlan(doc.root, root.id, selectedIds, (currentLayout, sourceNode) => {
            const sourceRect = resolveDashboardNodeRect(sourceNode, metrics);
            const deltaX = Math.round((layout as DashboardRect).left - sourceRect.left);
            const deltaY = Math.round((layout as DashboardRect).top - sourceRect.top);
            return {
              ...currentLayout,
              mode: "absolute",
              x: Math.round(Number(sourceNode.layout?.x ?? 0) + deltaX),
              y: Math.round(Number(sourceNode.layout?.y ?? 0) + deltaY),
              w: Math.round(Number(sourceNode.layout?.w ?? sourceRect.width)),
              h: Math.round(Number(sourceNode.layout?.h ?? sourceRect.height)),
              z: Number(currentLayout.z ?? sourceNode.layout?.z ?? 1) + 1
            };
          })
        : buildDuplicateNodesPlan(doc.root, root.id, selectedIds, (currentLayout, sourceNode) => {
            const sourceGrid = {
              gx: Math.round(Number(sourceNode.layout?.gx ?? 0)),
              gy: Math.round(Number(sourceNode.layout?.gy ?? 0)),
              gw: Math.max(2, Math.round(Number(sourceNode.layout?.gw ?? 4))),
              gh: Math.max(2, Math.round(Number(sourceNode.layout?.gh ?? 4)))
            };
            const nextGrid = layout as GridRect;
            return {
              ...currentLayout,
              mode: "grid",
              gx: Math.max(0, Math.min(metrics.gridCols - sourceGrid.gw, sourceGrid.gx + (nextGrid.gx - sourceGrid.gx))),
              gy: Math.max(0, sourceGrid.gy + (nextGrid.gy - sourceGrid.gy)),
              gw: sourceGrid.gw,
              gh: sourceGrid.gh
            };
          });
    if (!plan || plan.commands.length === 0) {
      pushHint("复制元素失败");
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
    pushHint(plan.clonedNodes.length > 1 ? `已复制 ${plan.clonedNodes.length} 项` : "已复制副本");
  };

  const moveDashboardSelection = (node: VNode, nextLayout: GridRect | DashboardRect, mode: "grid" | "absolute"): boolean => {
    if (mode === "absolute") {
      const rect = nextLayout as DashboardRect;
      const currentRect = resolveDashboardNodeRect(node, metrics);
      const dx = Math.round(rect.left - currentRect.left);
      const dy = Math.round(rect.top - currentRect.top);
      const selectedIds = resolveSelectedDashboardNodeIds(node);
      if (selectedIds.length <= 1 || (dx === 0 && dy === 0)) {
        return false;
      }
      const commands = children
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
        return true;
      }
      store.executeCommand(
        {
          type: "Transaction",
          commands
        },
        { summary: `move selection ${node.id}`, mergeWindowMs: 160 }
      );
      store.setSelectionIds(selectedIds, node.id);
      return true;
    }
    const selectedIds = resolveSelectedDashboardNodeIds(node);
    if (selectedIds.length <= 1) {
      return false;
    }
    const result = resolveGridGroupMove(
      children
        .filter((item) => (item.layout?.mode ?? "grid") === "grid")
        .map((item) => ({
          id: item.id,
          lock: Boolean(item.layout?.lock),
          layout: {
            mode: "grid" as const,
            gx: Number(item.layout?.gx ?? 0),
            gy: Number(item.layout?.gy ?? 0),
            gw: Number(item.layout?.gw ?? 4),
            gh: Number(item.layout?.gh ?? 4)
          }
        })),
      selectedIds,
      {
        gx: Math.round((nextLayout as GridRect).gx - Number(node.layout?.gx ?? 0)),
        gy: Math.round((nextLayout as GridRect).gy - Number(node.layout?.gy ?? 0))
      },
      metrics.gridCols
    );
    if (result.commands.length === 0) {
      return true;
    }
    setGridPreview(null);
    store.executeCommand(
      {
        type: "Transaction",
        commands: result.commands
      },
      { summary: `move selection ${node.id}`, mergeWindowMs: 160 }
    );
    store.setSelectionIds(result.movedIds, node.id);
    return true;
  };

  const getCanvasPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const bounds = canvas.getBoundingClientRect();
    const point = {
      x: (clientX - bounds.left) / metrics.scale,
      y: (clientY - bounds.top) / metrics.scale
    };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }
    return point;
  };

  return (
    <div className="col dashboard-editor-shell" style={{ height: "100%" }}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        style={{ display: "none" }}
        onChange={(event) => {
          void handleDashboardImagePicked(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div className="dashboard-editor-meta row">
        <span className="chip">{metrics.dashTitle}</span>
        <span className="chip">{displayModeLabel}</span>
        <span className="chip">{`选中 ${selectedNodeIds.length}`}</span>
        {metrics.showFilterBar ? <span className="chip">{filterSummary ? `筛选栏: ${filterSummary}` : "筛选栏已启用"}</span> : null}
        {metrics.headerShow ? <span className="chip">页眉已启用</span> : null}
        {ui.dashboardInsertPanelOpen ? <span className="chip">插入面板已展开</span> : null}
        {layoutHint ? <span className="chip">{layoutHint}</span> : null}
      </div>
      <div ref={stageRef} className="dashboard-editor-stage">
        {ui.dashboardInsertPanelOpen ? (
          <FloatingLayer anchorRef={stageRef} className="dashboard-insert-panel-layer" resolveStyle={resolveSideInsertPanelStyle}>
            <EditorInsertPanel
              title="插入组件"
              subtitle="点击自动插入，也可拖到画布"
              search={insertSearch}
              placeholder="搜索图表、表格、文本、图片"
              groups={insertPanelGroups}
              testId="dashboard-insert-panel"
              onSearchChange={setInsertSearch}
              onClose={() => store.setDashboardInsertPanelOpen(false)}
              onInsert={(item) => insertDashboardItem(item.source)}
              onDragStart={(item, event) => {
                encodeDashboardInsertItem(event.dataTransfer, item.source.id);
              }}
              onDragEnd={() => clearDashboardInsertItemDrag()}
            />
          </FloatingLayer>
        ) : null}
        <div ref={viewportRef} className={`dashboard-surface-viewport dashboard-editor-viewport dashboard-mode-${metrics.displayMode}`} style={{ flex: 1, minHeight: 0 }}>
          <div
            className="dashboard-surface-stage"
            style={{
              width: Math.round(metrics.canvasWidth * metrics.scale),
              height: Math.round(metrics.canvasHeight * metrics.scale)
            }}
          >
            <div
              ref={canvasRef}
              className={`dash-grid dashboard-surface dashboard-surface-${metrics.displayMode}`}
              data-testid="dashboard-canvas"
              style={{
                width: metrics.canvasWidth,
                height: metrics.canvasHeight,
                transform: `scale(${metrics.scale})`,
                transformOrigin: "top left"
              }}
              onDragOver={(event) => {
                const item = decodeDashboardInsertItem(event.dataTransfer);
                if (!item || item.kind === "image") {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                const point = getCanvasPoint(event.clientX, event.clientY);
                updateInsertPreview(item, point);
              }}
              onDrop={(event) => {
                const item = decodeDashboardInsertItem(event.dataTransfer);
                clearDashboardInsertItemDrag();
                if (!item) {
                  return;
                }
                event.preventDefault();
                const point = getCanvasPoint(event.clientX, event.clientY) ?? undefined;
                insertDashboardItem(item, point);
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
                const point = getCanvasPoint(event.clientX, event.clientY);
                if (!point) {
                  return;
                }
                setInsertPreview(null);
                setMarquee({
                  startX: point.x,
                  startY: point.y,
                  currentX: point.x,
                  currentY: point.y,
                  additive: isAdditiveSelectionModifier(event)
                });
              }}
              onMouseMove={(event) => {
                if (!marquee) {
                  return;
                }
                const point = getCanvasPoint(event.clientX, event.clientY);
                if (!point) {
                  return;
                }
                setMarquee((current) =>
                  current
                    ? {
                        ...current,
                        currentX: point.x,
                        currentY: point.y
                      }
                    : current
                );
              }}
              onMouseUp={(event) => {
                if (!marquee || event.target !== event.currentTarget) {
                  return;
                }
                const point = getCanvasPoint(event.clientX, event.clientY);
                if (!point) {
                  return;
                }
                const rect = buildCanvasSelectionRect(marquee.startX, marquee.startY, point.x, point.y);
                setMarquee(null);
                if (!isCanvasSelectionGesture(rect)) {
                  store.setSelection(root.id, false);
                  return;
                }
                const ids = resolveCanvasSelectionIds(
                  children.map((childNode) => {
                    const nextRect = resolveDashboardNodeRect(childNode, metrics);
                    return {
                      id: childNode.id,
                      left: nextRect.left,
                      top: nextRect.top,
                      width: nextRect.width,
                      height: nextRect.height
                    };
                  }),
                  rect
                );
                if (ids.length === 0) {
                  store.setSelection(root.id, false);
                  return;
                }
                applyDashboardSelection(ids, marquee.additive);
              }}
            >
              {marquee ? <div className="canvas-selection-rect" style={buildCanvasSelectionRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY)} /> : null}
              {children.map((node) => (
                <DashboardCard
                  key={node.id}
                  doc={doc}
                  node={node}
                  metrics={metrics}
                  engine={engine}
                  dataVersion={dataVersion}
                  active={selection.selectedIds.includes(node.id)}
                  onSelect={(multi) => store.setSelection(node.id, multi)}
                  onCommitGrid={(layout, op) => {
                    if (op === "move" && moveDashboardSelection(node, layout, "grid")) {
                      return;
                    }
                    const gridNodes = children
                      .filter((item) => (item.layout?.mode ?? "grid") === "grid")
                      .map((item) => ({
                        id: item.id,
                        lock: Boolean(item.layout?.lock),
                        layout: {
                          mode: "grid" as const,
                          gx: Number(item.layout?.gx ?? 0),
                          gy: Number(item.layout?.gy ?? 0),
                          gw: Number(item.layout?.gw ?? 4),
                          gh: Number(item.layout?.gh ?? 4)
                        }
                      }));
                    const prev = {
                      mode: "grid" as const,
                      gx: Number(node.layout?.gx ?? 0),
                      gy: Number(node.layout?.gy ?? 0),
                      gw: Number(node.layout?.gw ?? 4),
                      gh: Number(node.layout?.gh ?? 4)
                    };
                    const resolved = resolveGridConflict(gridNodes, node.id, layout, prev, metrics.gridCols, op);
                    if (resolved.commands.length === 0) {
                      return;
                    }
                    setGridPreview(null);
                    pushHint(resolved.strategy === "swap" ? "已自动换位" : resolved.strategy === "push" ? "已自动避让" : "布局已更新");
                    store.executeCommand(
                      {
                        type: "Transaction",
                        commands: resolved.commands
                      },
                      { summary: `${resolved.strategy} ${node.id}`, mergeWindowMs: 160 }
                    );
                  }}
                  onDuplicateGrid={(layout) => duplicateDashboardNode(node, layout, "grid")}
                  onCommitAbsoluteMove={(from, to) => {
                    if (moveDashboardSelection(node, to, "absolute")) {
                      return;
                    }
                    const dx = Math.round(to.left - from.left);
                    const dy = Math.round(to.top - from.top);
                    if (dx === 0 && dy === 0) {
                      return;
                    }
                    store.executeCommand(
                      {
                        type: "UpdateLayout",
                        nodeId: node.id,
                        layout: { mode: "absolute", x: Math.round(to.left), y: Math.round(to.top), w: Math.round(to.width), h: Math.round(to.height) }
                      },
                      { summary: `move ${node.id}`, mergeWindowMs: 160 }
                    );
                  }}
                  onDuplicateAbsolute={(rect) => duplicateDashboardNode(node, rect, "absolute")}
                  groupPreviewOffset={
                    groupDragPreview && groupDragPreview.anchorId !== node.id && groupDragPreview.nodeIds.includes(node.id)
                      ? { x: groupDragPreview.deltaX, y: groupDragPreview.deltaY }
                      : undefined
                  }
                  onPreviewGroupDrag={(deltaX, deltaY, duplicateOnDrop) => {
                    const selectedIds = resolveSelectedDashboardNodeIds(node);
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
                  onClearGroupDragPreview={() => setGroupDragPreview((current) => (current?.anchorId === node.id ? null : current))}
                  onCommitAbsoluteResize={(rect) =>
                    store.executeCommand(
                      {
                        type: "UpdateLayout",
                        nodeId: node.id,
                        layout: {
                          mode: "absolute",
                          x: Math.round(rect.left),
                          y: Math.round(rect.top),
                          w: Math.round(rect.width),
                          h: Math.round(rect.height)
                        }
                      },
                      { summary: `resize ${node.id}`, mergeWindowMs: 160 }
                    )
                  }
                  onPreviewGrid={(layout) => {
                    if (!layout) {
                      setGridPreview(null);
                      return;
                    }
                    const conflictIds = children
                      .filter((item) => item.id !== node.id && (item.layout?.mode ?? "grid") === "grid")
                      .filter((item) =>
                        isGridOverlap(layout, {
                          mode: "grid",
                          gx: Number(item.layout?.gx ?? 0),
                          gy: Number(item.layout?.gy ?? 0),
                          gw: Number(item.layout?.gw ?? 4),
                          gh: Number(item.layout?.gh ?? 4)
                        })
                      )
                      .map((item) => item.id);
                    setGridPreview({ nodeId: node.id, layout, conflictIds });
                  }}
                />
              ))}
              {insertPreview ? <DashboardInsertPreviewOverlay preview={insertPreview} /> : null}
              {gridPreview ? <GridPreviewOverlay metrics={metrics} preview={gridPreview} nodes={children} /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardInsertPreviewOverlay({
  preview
}: {
  preview: { itemId: string; label: string; layoutMode: "grid" | "absolute"; rect: DashboardRect };
}): JSX.Element {
  return (
    <div
      className={`dashboard-insert-preview ${preview.layoutMode === "absolute" ? "floating" : "card"}`}
      style={{
        left: preview.rect.left,
        top: preview.rect.top,
        width: preview.rect.width,
        height: preview.rect.height
      }}
    >
      <span className="dashboard-insert-preview-label">{preview.label}</span>
    </div>
  );
}

interface DashboardCardProps {
  doc: VDoc;
  node: VNode;
  metrics: DashboardSurfaceMetrics;
  engine: DataEngine;
  dataVersion: string;
  active: boolean;
  onSelect: (multi: boolean) => void;
  onCommitGrid: (layout: GridRect, op: "move" | "resize") => void;
  onDuplicateGrid: (layout: GridRect) => void;
  onCommitAbsoluteMove: (from: DashboardRect, to: DashboardRect) => void;
  onDuplicateAbsolute: (rect: DashboardRect) => void;
  groupPreviewOffset?: { x: number; y: number };
  onPreviewGroupDrag: (deltaX: number, deltaY: number, duplicateOnDrop: boolean) => void;
  onClearGroupDragPreview: () => void;
  onCommitAbsoluteResize: (rect: DashboardRect) => void;
  onPreviewGrid: (layout: GridRect | null) => void;
}

type CardDragMode = "move" | "resize-east" | "resize-south" | "resize-corner" | null;

function DashboardCard({
  doc,
  node,
  metrics,
  engine,
  dataVersion,
  active,
  onSelect,
  onCommitGrid,
  onDuplicateGrid,
  onCommitAbsoluteMove,
  onDuplicateAbsolute,
  groupPreviewOffset,
  onPreviewGroupDrag,
  onClearGroupDragPreview,
  onCommitAbsoluteResize,
  onPreviewGrid
}: DashboardCardProps): JSX.Element {
  const layout = node.layout ?? { mode: "grid", gx: 0, gy: 0, gw: 6, gh: 6 };
  const isAbsolute = layout.mode === "absolute";
  const baseRect = resolveDashboardNodeRect(node, metrics);
  const [rect, setRect] = useState(baseRect);
  const [dragMode, setDragMode] = useState<CardDragMode>(null);
  const [start, setStart] = useState<{ x: number; y: number; rect: DashboardRect } | null>(null);
  const [duplicateOnDrop, setDuplicateOnDrop] = useState(false);
  const rectRef = useRef(rect);
  const startRef = useRef(start);
  const dragModeRef = useRef(dragMode);
  const duplicateOnDropRef = useRef(duplicateOnDrop);
  const { rows, loading, error } = useNodeRows(doc, node, engine, dataVersion);
  const placementLabel = isAbsolute ? "浮动元素" : "卡片布局";
  const title =
    node.kind === "chart"
      ? String((node.props as ChartSpec | undefined)?.titleText ?? node.name ?? node.id)
      : node.kind === "table"
        ? String((node.props as TableSpec | undefined)?.titleText ?? node.name ?? node.id)
        : node.kind === "image"
          ? resolveImageNodeTitle(doc, node)
          : String(node.name ?? node.id);

  useEffect(() => {
    setRect(baseRect);
  }, [baseRect.height, baseRect.left, baseRect.top, baseRect.width]);

  useEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    dragModeRef.current = dragMode;
  }, [dragMode]);

  useEffect(() => {
    duplicateOnDropRef.current = duplicateOnDrop;
  }, [duplicateOnDrop]);

  const beginDrag = (event: ReactMouseEvent<HTMLDivElement>, nextMode: Exclude<CardDragMode, null>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (layout.lock) {
      return;
    }
    const additive = isAdditiveSelectionModifier(event);
    if (!active || additive) {
      onSelect(additive);
    }
    setDragMode(nextMode);
    setDuplicateOnDrop(nextMode === "move" && Boolean(event.altKey || event.getModifierState?.("Alt")));
    setStart({ x: event.clientX, y: event.clientY, rect });
  };

  useEffect(() => {
    if (!start || !dragMode) {
      return;
    }
    const handleMouseMove = (event: MouseEvent): void => {
      const currentStart = startRef.current;
      const currentDragMode = dragModeRef.current;
      if (!currentStart || !currentDragMode) {
        return;
      }
      const dx = (event.clientX - currentStart.x) / metrics.scale;
      const dy = (event.clientY - currentStart.y) / metrics.scale;
      const nextDuplicateOnDrop = currentDragMode === "move" && (duplicateOnDropRef.current || Boolean(event.altKey));
      duplicateOnDropRef.current = nextDuplicateOnDrop;
      setDuplicateOnDrop(nextDuplicateOnDrop);

      if (currentDragMode === "move") {
        onPreviewGroupDrag(dx, dy, nextDuplicateOnDrop);
        const nextRect = {
          ...currentStart.rect,
          left: Math.max(0, currentStart.rect.left + dx),
          top: Math.max(0, currentStart.rect.top + dy)
        };
        if (!isAbsolute) {
          onPreviewGrid(resolveGridRectFromCanvasRect(nextRect, metrics));
        }
        rectRef.current = nextRect;
        setRect(nextRect);
        return;
      }

      const nextRect = {
        ...currentStart.rect,
        width: currentDragMode === "resize-south" ? currentStart.rect.width : Math.max(120, currentStart.rect.width + dx),
        height: currentDragMode === "resize-east" ? currentStart.rect.height : Math.max(80, currentStart.rect.height + dy)
      };
      if (!isAbsolute) {
        onPreviewGrid(resolveGridRectFromCanvasRect(nextRect, metrics));
      }
      rectRef.current = nextRect;
      setRect(nextRect);
    };

    const handleMouseUp = (): void => {
      const currentStart = startRef.current;
      const currentDragMode = dragModeRef.current;
      const currentRect = rectRef.current;
      const currentDuplicateOnDrop = duplicateOnDropRef.current;
      if (!currentStart || !currentDragMode) {
        return;
      }

      if (isAbsolute) {
        if (currentDragMode === "move" && currentDuplicateOnDrop) {
          if (Math.abs(currentRect.left - currentStart.rect.left) >= 3 || Math.abs(currentRect.top - currentStart.rect.top) >= 3) {
            onDuplicateAbsolute(currentRect);
          }
        } else if (currentDragMode === "move") {
          onCommitAbsoluteMove(currentStart.rect, currentRect);
        } else {
          onCommitAbsoluteResize(currentRect);
        }
      } else {
        const nextGrid = resolveGridRectFromCanvasRect(currentRect, metrics);
        if (currentDragMode === "move" && currentDuplicateOnDrop) {
          onDuplicateGrid(nextGrid);
        } else {
          onCommitGrid(nextGrid, currentDragMode === "move" ? "move" : "resize");
        }
      }

      setDragMode(null);
      setStart(null);
      setDuplicateOnDrop(false);
      dragModeRef.current = null;
      startRef.current = null;
      duplicateOnDropRef.current = false;
      onClearGroupDragPreview();
      onPreviewGrid(null);
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
  }, [
    dragMode,
    isAbsolute,
    layout.lock,
    metrics,
    onClearGroupDragPreview,
    onCommitAbsoluteMove,
    onCommitAbsoluteResize,
    onCommitGrid,
    onDuplicateAbsolute,
    onDuplicateGrid,
    onPreviewGrid,
    onPreviewGroupDrag,
    start
  ]);

  return (
    <div
      className={`dash-card ${active ? "active" : ""} ${layout.lock ? "is-locked" : ""} ${node.kind === "text" ? "dash-card-text" : ""} ${node.kind === "image" ? "dash-card-image" : ""}`}
      data-testid={`dashboard-card-${node.id}`}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        transform: groupPreviewOffset ? `translate(${groupPreviewOffset.x}px, ${groupPreviewOffset.y}px)` : undefined
      }}
      onMouseDown={(event) => beginDrag(event, "move")}
    >
      {node.kind !== "text" ? (
        <div className="card-head card-head-floating row" style={{ justifyContent: "space-between", gap: 8 }}>
          <span className="card-head-title">{title}</span>
          <span className="chip dashboard-card-mode-chip">{placementLabel}</span>
        </div>
      ) : null}
      <div className="card-body" style={{ height: "100%" }}>
        {node.kind === "chart" ? (
          loading ? (
            <div className="muted">loading...</div>
          ) : error ? (
            <div className="muted">error: {error}</div>
          ) : (
            <EChartView spec={node.props as ChartSpec} rows={rows} height="100%" />
          )
        ) : node.kind === "table" ? (
          loading ? (
            <div className="muted">loading...</div>
          ) : error ? (
            <div className="muted">error: {error}</div>
          ) : (
            <TableView spec={node.props as TableSpec} rows={rows} height="100%" />
          )
        ) : node.kind === "text" ? (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", height: "100%", overflow: "auto" }}>
            {String((node.props as Record<string, unknown>)?.text ?? "")}
          </pre>
        ) : node.kind === "image" ? (
          <DashboardImageNode doc={doc} node={node} />
        ) : (
          <div className="muted">暂未支持: {node.kind}</div>
        )}
      </div>
      <div className="dashboard-resize-hit dashboard-resize-hit-east" onMouseDown={(event) => beginDrag(event, "resize-east")} />
      <div className="dashboard-resize-hit dashboard-resize-hit-south" onMouseDown={(event) => beginDrag(event, "resize-south")} />
      <div className="dashboard-resize-hit dashboard-resize-hit-corner" onMouseDown={(event) => beginDrag(event, "resize-corner")} />
    </div>
  );
}

function DashboardImageNode({ doc, node }: { doc: VDoc; node: VNode }): JSX.Element {
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

function GridPreviewOverlay({
  metrics,
  preview,
  nodes
}: {
  metrics: DashboardSurfaceMetrics;
  preview: { nodeId: string; layout: GridRect; conflictIds: string[] };
  nodes: VNode[];
}): JSX.Element {
  const previewRect = resolveDashboardNodeRect(
    {
      id: "__preview__",
      kind: "container",
      layout: preview.layout
    },
    metrics
  );
  return (
    <>
      <div
        className="dashboard-grid-preview"
        style={{
          left: previewRect.left,
          top: previewRect.top,
          width: previewRect.width,
          height: previewRect.height
        }}
      />
      {preview.conflictIds.map((nodeId) => {
        const target = nodes.find((item) => item.id === nodeId);
        if (!target) {
          return null;
        }
        const rect = resolveDashboardNodeRect(target, metrics);
        return (
          <div
            key={nodeId}
            className="dashboard-grid-conflict"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }}
          />
        );
      })}
    </>
  );
}
