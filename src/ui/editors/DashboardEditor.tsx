import { useEffect, useRef, useState } from "react";
import type { ChartSpec, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { EChartView } from "../../runtime/chart/EChartView";
import { TableView } from "../../runtime/table/TableView";
import { useNodeRows } from "../hooks/use-node-rows";
import { useDataEngine } from "../hooks/use-data-engine";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { ChartQuickActions } from "../components/ChartQuickActions";
import { ChartAskAssistant } from "../components/ChartAskAssistant";
import { isGridOverlap, resolveGridConflict, type GridRect } from "../utils/dashboard-grid";
import { resolveContainerWidth } from "../utils/container-width";

interface DashboardEditorProps {
  doc: VDoc;
}

export function DashboardEditor({ doc }: DashboardEditorProps): JSX.Element {
  const store = useEditorStore();
  const selection = useSignalValue(store.selection);
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const root = doc.root;
  const children = root.children ?? [];
  const gridCols = Number((root.props as Record<string, unknown>)?.gridCols ?? 12);
  const rowH = Number((root.props as Record<string, unknown>)?.rowH ?? 40);
  const gap = Number((root.props as Record<string, unknown>)?.gap ?? 12);
  const [previewMode, setPreviewMode] = useState(false);
  const [layoutHint, setLayoutHint] = useState("");
  const [gridPreview, setGridPreview] = useState<{ nodeId: string; layout: GridRect; conflictIds: string[] } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(1200);

  useEffect(() => {
    const host = wrapRef.current;
    if (!host) {
      return;
    }
    const updateWidth = (): void => {
      const width = resolveContainerWidth(host.getBoundingClientRect().width || host.clientWidth, 1200, 640);
      setWrapWidth(width);
    };
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="col" style={{ height: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <span className="chip">{(root.props as Record<string, unknown>)?.dashTitle as string}</span>
          {layoutHint ? <span className="chip">{layoutHint}</span> : null}
        </div>
        <div className="row">
          <button className="btn" onClick={() => setPreviewMode((v) => !v)}>
            {previewMode ? "退出预览" : "预览模式"}
          </button>
        </div>
      </div>
      {(root.props as Record<string, unknown>)?.showFilterBar ? (
        <div className="row" style={{ padding: "6px 2px", gap: 10 }}>
          {(doc.filters ?? []).map((filter) => (
            <span key={filter.filterId} className="chip">
              {filter.title ?? filter.filterId}: {String(filter.defaultValue ?? "-")}
            </span>
          ))}
        </div>
      ) : null}
      <div ref={wrapRef} className="dash-grid">
        {children.map((node) => (
          <DashboardCard
            key={node.id}
            doc={doc}
            node={node}
            gridCols={gridCols}
            rowH={rowH}
            gap={gap}
            engine={engine}
            dataVersion={dataVersion}
            wrapWidth={wrapWidth}
            previewMode={previewMode}
            active={selection.selectedIds.includes(node.id)}
            onSelect={(multi) => store.setSelection(node.id, multi)}
            onCommitGrid={(layout, op) => {
              const gridNodes = children
                .filter((item) => item.layout?.mode === "grid")
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
              const resolved = resolveGridConflict(gridNodes, node.id, layout, prev, gridCols, op);
              if (resolved.commands.length === 0) {
                return;
              }
              setGridPreview(null);
              setLayoutHint(resolved.strategy === "swap" ? "已自动换位" : resolved.strategy === "push" ? "已自动挤压避让" : "布局已更新");
              setTimeout(() => setLayoutHint(""), 1400);
              store.executeCommand(
                {
                  type: "Transaction",
                  commands: resolved.commands
                },
                { summary: `${resolved.strategy} ${node.id}`, mergeWindowMs: 180 }
              );
            }}
            onCommitAbsoluteMove={(from, to) => {
              const dx = Math.round(to.left - from.left);
              const dy = Math.round(to.top - from.top);
              const groupId = node.layout?.group;
              if (!groupId || (dx === 0 && dy === 0)) {
                store.executeCommand(
                  {
                    type: "UpdateLayout",
                    nodeId: node.id,
                    layout: { mode: "absolute", x: Math.round(to.left), y: Math.round(to.top), w: Math.round(to.width), h: Math.round(to.height) }
                  },
                  { summary: `move ${node.id}`, mergeWindowMs: 180 }
                );
                return;
              }
              const groupMembers = (children ?? []).filter((item) => item.layout?.group === groupId && item.layout?.mode === "absolute");
              const commands = groupMembers
                .filter((item) => !item.layout?.lock)
                .map((item) => {
                  const ox = Number(item.layout?.x ?? 0);
                  const oy = Number(item.layout?.y ?? 0);
                  const constraint = (item.layout?.groupConstraint ?? node.layout?.groupConstraint ?? "free") as "free" | "x" | "y";
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
            }}
            onCommitAbsoluteResize={(rect) =>
              store.executeCommand(
                {
                  type: "UpdateLayout",
                  nodeId: node.id,
                  layout: { mode: "absolute", x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }
                },
                { summary: `resize ${node.id}`, mergeWindowMs: 180 }
              )
            }
            onQuickChartPatch={(patch, summary) =>
              store.executeCommand(
                {
                  type: "UpdateProps",
                  nodeId: node.id,
                  props: patch as Record<string, unknown>
                },
                { summary }
              )
            }
            onPreviewGrid={(layout) => {
              if (!layout) {
                setGridPreview(null);
                return;
              }
              const normalized = layout;
              const conflictIds = children
                .filter((item) => item.id !== node.id && item.layout?.mode === "grid")
                .filter((item) =>
                  isGridOverlap(normalized, {
                    mode: "grid",
                    gx: Number(item.layout?.gx ?? 0),
                    gy: Number(item.layout?.gy ?? 0),
                    gw: Number(item.layout?.gw ?? 4),
                    gh: Number(item.layout?.gh ?? 4)
                  })
                )
                .map((item) => item.id);
              setGridPreview({ nodeId: node.id, layout: normalized, conflictIds });
            }}
          />
        ))}
        {gridPreview ? (
          <GridPreviewOverlay
            gridCols={gridCols}
            rowH={rowH}
            gap={gap}
            wrapWidth={wrapWidth}
            preview={gridPreview}
            nodes={children}
          />
        ) : null}
      </div>
    </div>
  );
}

interface DashboardCardProps {
  doc: VDoc;
  node: VNode;
  gridCols: number;
  rowH: number;
  gap: number;
  engine: DataEngine;
  dataVersion: string;
  wrapWidth: number;
  previewMode: boolean;
  active: boolean;
  onSelect: (multi: boolean) => void;
  onCommitGrid: (layout: GridRect, op: "move" | "resize") => void;
  onCommitAbsoluteMove: (from: RectState, to: RectState) => void;
  onCommitAbsoluteResize: (rect: RectState) => void;
  onQuickChartPatch: (patch: Partial<ChartSpec>, summary: string) => void;
  onPreviewGrid: (layout: GridRect | null) => void;
}

interface RectState {
  left: number;
  top: number;
  width: number;
  height: number;
}

function DashboardCard({
  doc,
  node,
  gridCols,
  rowH,
  gap,
  engine,
  dataVersion,
  wrapWidth,
  previewMode,
  active,
  onSelect,
  onCommitGrid,
  onCommitAbsoluteMove,
  onCommitAbsoluteResize,
  onQuickChartPatch,
  onPreviewGrid
}: DashboardCardProps): JSX.Element {
  const layout = node.layout ?? { mode: "grid", gx: 0, gy: 0, gw: 6, gh: 6 };
  const isAbsolute = layout.mode === "absolute";
  const gx = Number(layout.gx ?? 0);
  const gy = Number(layout.gy ?? 0);
  const gw = Number(layout.gw ?? 6);
  const gh = Number(layout.gh ?? 6);
  const cellW = (wrapWidth - gap * (gridCols + 1)) / gridCols;
  const baseRect: RectState = isAbsolute
    ? {
        left: Math.round(Number(layout.x ?? 0)),
        top: Math.round(Number(layout.y ?? 0)),
        width: Math.round(Number(layout.w ?? 320)),
        height: Math.round(Number(layout.h ?? 220))
      }
    : {
    left: Math.round(gap + gx * (cellW + gap)),
    top: Math.round(gap + gy * (rowH + gap)),
    width: Math.round(gw * cellW + (gw - 1) * gap),
    height: Math.round(gh * rowH + (gh - 1) * gap)
  };

  const [rect, setRect] = useState(baseRect);
  const [dragMode, setDragMode] = useState<"move" | "resize" | null>(null);
  const [start, setStart] = useState<{ x: number; y: number; rect: typeof baseRect } | null>(null);
  const { rows, loading, error } = useNodeRows(doc, node, engine, dataVersion);

  useEffect(() => {
    setRect(baseRect);
  }, [baseRect.height, baseRect.left, baseRect.top, baseRect.width]);

  const onPointerDownMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (previewMode || layout.lock) {
      return;
    }
    onSelect(event.ctrlKey || event.metaKey);
    setDragMode("move");
    setStart({ x: event.clientX, y: event.clientY, rect });
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  };

  const onPointerDownResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (previewMode || layout.lock) {
      return;
    }
    onSelect(event.ctrlKey || event.metaKey);
    setDragMode("resize");
    setStart({ x: event.clientX, y: event.clientY, rect });
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!start || !dragMode) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dragMode === "move") {
      const nextRect = {
        ...start.rect,
        left: Math.max(gap, start.rect.left + dx),
        top: Math.max(gap, start.rect.top + dy)
      };
      if (!isAbsolute) {
        const nextGx = Math.max(0, Math.round((nextRect.left - gap) / (cellW + gap)));
        const nextGy = Math.max(0, Math.round((nextRect.top - gap) / (rowH + gap)));
        const nextGw = Math.max(2, Math.round((nextRect.width + gap) / (cellW + gap)));
        const nextGh = Math.max(2, Math.round((nextRect.height + gap) / (rowH + gap)));
        onPreviewGrid({ mode: "grid", gx: nextGx, gy: nextGy, gw: nextGw, gh: nextGh });
      }
      setRect({
        ...nextRect
      });
      return;
    }
    const nextRect = {
      ...start.rect,
      width: Math.max(180, start.rect.width + dx),
      height: Math.max(120, start.rect.height + dy)
    };
    if (!isAbsolute) {
      const nextGx = Math.max(0, Math.round((start.rect.left - gap) / (cellW + gap)));
      const nextGy = Math.max(0, Math.round((start.rect.top - gap) / (rowH + gap)));
      const nextGw = Math.max(2, Math.round((nextRect.width + gap) / (cellW + gap)));
      const nextGh = Math.max(2, Math.round((nextRect.height + gap) / (rowH + gap)));
      onPreviewGrid({ mode: "grid", gx: nextGx, gy: nextGy, gw: nextGw, gh: nextGh });
    }
    setRect({
      ...nextRect
    });
  };

  const onPointerUp = (): void => {
    if (!start || !dragMode) {
      return;
    }
    if (isAbsolute) {
      if (dragMode === "move") {
        onCommitAbsoluteMove(start.rect, rect);
      } else {
        onCommitAbsoluteResize(rect);
      }
      setDragMode(null);
      setStart(null);
      onPreviewGrid(null);
      return;
    }
    const nextGx = Math.max(0, Math.round((rect.left - gap) / (cellW + gap)));
    const nextGy = Math.max(0, Math.round((rect.top - gap) / (rowH + gap)));
    const nextGw = Math.max(2, Math.round((rect.width + gap) / (cellW + gap)));
    const nextGh = Math.max(2, Math.round((rect.height + gap) / (rowH + gap)));
    onCommitGrid({ mode: "grid", gx: nextGx, gy: nextGy, gw: nextGw, gh: nextGh }, dragMode);
    setDragMode(null);
    setStart(null);
    onPreviewGrid(null);
  };

  return (
    <div
      className={`dash-card ${active ? "active" : ""}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerDown={onPointerDownMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="card-head row" style={{ justifyContent: "space-between", gap: 6 }}>
        <span>{(node.props as ChartSpec).titleText ?? node.name ?? node.id}</span>
        {active && node.kind === "chart" && !previewMode ? (
          <div onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <ChartQuickActions spec={node.props as ChartSpec} compact onPatch={onQuickChartPatch} />
          </div>
        ) : null}
      </div>
      <div className="card-body">
        {node.kind === "chart" ? (
          loading ? (
            <div className="muted">loading...</div>
          ) : error ? (
            <div className="muted">error: {error}</div>
          ) : (
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <div style={{ position: "absolute", top: 6, right: 6, zIndex: 4 }}>
                <ChartAskAssistant doc={doc} node={node} rows={rows} compact />
              </div>
              <EChartView spec={node.props as ChartSpec} rows={rows} height="100%" />
            </div>
          )
        ) : node.kind === "table" ? (
          loading ? (
            <div className="muted">loading...</div>
          ) : error ? (
            <div className="muted">error: {error}</div>
          ) : (
            <TableView spec={node.props as TableSpec} rows={rows} height="100%" />
          )
        ) : (
          <div className="muted">暂未支持: {node.kind}</div>
        )}
      </div>
      {!previewMode ? <div className="resize-handle" onPointerDown={onPointerDownResize} /> : null}
    </div>
  );
}
function GridPreviewOverlay({
  gridCols,
  rowH,
  gap,
  wrapWidth,
  preview,
  nodes
}: {
  gridCols: number;
  rowH: number;
  gap: number;
  wrapWidth: number;
  preview: { nodeId: string; layout: GridRect; conflictIds: string[] };
  nodes: VNode[];
}): JSX.Element {
  const toRect = (layout: GridRect): { left: number; top: number; width: number; height: number } => {
    const cellW = (wrapWidth - gap * (gridCols + 1)) / gridCols;
    return {
      left: Math.round(gap + layout.gx * (cellW + gap)),
      top: Math.round(gap + layout.gy * (rowH + gap)),
      width: Math.round(layout.gw * cellW + (layout.gw - 1) * gap),
      height: Math.round(layout.gh * rowH + (layout.gh - 1) * gap)
    };
  };

  const previewRect = toRect(preview.layout);
  const conflictRects = nodes
    .filter((node) => preview.conflictIds.includes(node.id) && node.layout?.mode === "grid")
    .map((node) =>
      toRect({
        mode: "grid",
        gx: Number(node.layout?.gx ?? 0),
        gy: Number(node.layout?.gy ?? 0),
        gw: Number(node.layout?.gw ?? 4),
        gh: Number(node.layout?.gh ?? 4)
      })
    );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: previewRect.left,
          top: previewRect.top,
          width: previewRect.width,
          height: previewRect.height,
          border: "2px dashed #2563eb",
          background: "rgba(37,99,235,0.08)",
          borderRadius: 10
        }}
      />
      {conflictRects.map((rect, idx) => (
        <div
          key={`${preview.nodeId}_conflict_${idx}`}
          style={{
            position: "absolute",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            border: "2px dashed #ef4444",
            background: "rgba(239,68,68,0.14)",
            borderRadius: 10
          }}
        />
      ))}
    </div>
  );
}
