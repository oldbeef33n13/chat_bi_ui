import { useEffect, useMemo, useState } from "react";
import { defaultChartSpec } from "../../core/doc/defaults";
import type { ChartSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { EChartView } from "../../runtime/chart/EChartView";
import { useNodeRows } from "../hooks/use-node-rows";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { ChartQuickActions } from "../components/ChartQuickActions";
import { ChartAskAssistant } from "../components/ChartAskAssistant";
import { buildAlignCommands, type AlignKind } from "../utils/alignment";
import { buildGapGuides, type GapGuide } from "../utils/ppt-gap-guides";
import { prefixedId } from "../../core/utils/id";

interface PptEditorProps {
  doc: VDoc;
}

interface Guides {
  v?: number;
  h?: number;
}

export function PptEditor({ doc }: PptEditorProps): JSX.Element {
  const store = useEditorStore();
  const selection = useSignalValue(store.selection);
  const engine = useMemo(() => new DataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 }), [doc.docId]);
  const slides = (doc.root.children ?? []).filter((node) => node.kind === "slide");
  const [activeSlideId, setActiveSlideId] = useState(slides[0]?.id);
  const activeSlide = slides.find((slide) => slide.id === activeSlideId) ?? slides[0];
  const [guides, setGuides] = useState<Guides>({});
  const [gapGuides, setGapGuides] = useState<GapGuide[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [actionHint, setActionHint] = useState("");

  const addSlide = (): void => {
    store.executeCommand(
      {
        type: "InsertNode",
        parentId: doc.root.id,
        node: {
          id: prefixedId("slide"),
          kind: "slide",
          props: { title: `新页面 ${slides.length + 1}`, layoutTemplateId: "title-double-summary" },
          layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
          children: [
            {
              id: prefixedId("text"),
              kind: "text",
              layout: { mode: "absolute", x: 40, y: 24, w: 300, h: 50, z: 1 },
              props: { text: "新增页面", format: "plain" }
            }
          ]
        }
      },
      { summary: "add slide" }
    );
  };

  const duplicateSlide = (slide: VNode): void => {
    store.executeCommand(
      {
        type: "InsertNode",
        parentId: doc.root.id,
        node: {
          ...structuredClone(slide),
          id: prefixedId("slide"),
          name: `${slide.name ?? "slide"} copy`
        }
      },
      { summary: "duplicate slide" }
    );
  };

  const reorderSlide = (slideId: string, delta: number): void => {
    const index = slides.findIndex((s) => s.id === slideId);
    if (index < 0) {
      return;
    }
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= slides.length) {
      return;
    }
    store.executeCommand(
      {
        type: "MoveNode",
        nodeId: slideId,
        newParentId: doc.root.id,
        newIndex: nextIndex
      },
      { summary: "reorder slide" }
    );
  };

  const activeIds = new Set((activeSlide?.children ?? []).map((item) => item.id));
  const activeSelectedIds = selection.selectedIds.filter((id) => activeIds.has(id));

  const applyAlign = (kind: AlignKind, summary: string): void => {
    const commands = buildAlignCommands(doc.root, activeSelectedIds, kind);
    if (commands.length === 0) {
      setActionHint(kind === "hdistribute" || kind === "vdistribute" ? "等距分布至少需要选择 3 个可移动元素" : "对齐至少需要选择 2 个可移动元素");
      setTimeout(() => setActionHint(""), 1500);
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands
      },
      { summary }
    );
    setActionHint("已完成对齐");
    setTimeout(() => setActionHint(""), 1200);
    if (kind === "hdistribute" || kind === "vdistribute") {
      const movedIds = commands.map((item) => item.nodeId).filter((id): id is string => !!id);
      const hints = buildGapGuides(activeSlide?.children ?? [], movedIds, commands, kind);
      setGapGuides(hints);
      setTimeout(() => setGapGuides([]), 1500);
      return;
    }
    setGapGuides([]);
  };

  return (
    <div className="row" style={{ height: "100%", alignItems: "stretch" }}>
      <div style={{ width: 200, borderRight: "1px solid var(--line)", padding: "0 8px", overflow: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between", margin: "8px 0" }}>
          <strong>缩略图</strong>
          <button className="btn" onClick={addSlide}>
            +页
          </button>
        </div>
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`tree-item ${activeSlide?.id === slide.id ? "active" : ""}`}
            onClick={() => setActiveSlideId(slide.id)}
          >
            <div>#{index + 1}</div>
            <div className="muted">{String((slide.props as Record<string, unknown>)?.title ?? slide.id)}</div>
            <div className="row" style={{ marginTop: 4 }}>
              <button className="btn" onClick={() => duplicateSlide(slide)}>
                复制
              </button>
              <button className="btn" onClick={() => reorderSlide(slide.id, -1)}>
                上
              </button>
              <button className="btn" onClick={() => reorderSlide(slide.id, 1)}>
                下
              </button>
              <button
                className="btn danger"
                onClick={() => store.executeCommand({ type: "RemoveNode", nodeId: slide.id }, { summary: "remove slide" })}
              >
                删
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="canvas-wrap" style={{ flex: 1 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" }}>
          <div className="row">
            <span className="chip">选中: {activeSelectedIds.length}</span>
            <button className={`btn ${snapEnabled ? "primary" : ""}`} onClick={() => setSnapEnabled((value) => !value)}>
              {snapEnabled ? "吸附开启" : "吸附关闭"}
            </button>
            {actionHint ? <span className="chip">{actionHint}</span> : null}
          </div>
          <div className="row">
            <button className="btn" onClick={() => applyAlign("left", "ppt align left")}>
              左对齐
            </button>
            <button className="btn" onClick={() => applyAlign("hcenter", "ppt align hcenter")}>
              水平居中
            </button>
            <button className="btn" onClick={() => applyAlign("right", "ppt align right")}>
              右对齐
            </button>
            <button className="btn" onClick={() => applyAlign("top", "ppt align top")}>
              顶对齐
            </button>
            <button className="btn" onClick={() => applyAlign("vcenter", "ppt align vcenter")}>
              垂直居中
            </button>
            <button className="btn" onClick={() => applyAlign("bottom", "ppt align bottom")}>
              底对齐
            </button>
            <button className="btn" onClick={() => applyAlign("hdistribute", "ppt hdistribute")}>
              水平等距
            </button>
            <button className="btn" onClick={() => applyAlign("vdistribute", "ppt vdistribute")}>
              垂直等距
            </button>
          </div>
        </div>
        {activeSlide ? (
          <div className="slide">
            {guides.v !== undefined ? <div style={{ position: "absolute", left: guides.v, top: 0, bottom: 0, borderLeft: "1px dashed #60a5fa" }} /> : null}
            {guides.h !== undefined ? <div style={{ position: "absolute", top: guides.h, left: 0, right: 0, borderTop: "1px dashed #60a5fa" }} /> : null}
            {gapGuides.map((guide) =>
              guide.orientation === "h" ? (
                <div key={guide.id}>
                  <div style={{ position: "absolute", left: guide.x, top: guide.y, width: guide.length, borderTop: "1px dashed #f59e0b" }} />
                  <div style={{ position: "absolute", left: guide.x + guide.length / 2 - 14, top: guide.y - 16, fontSize: 11, color: "#b45309" }}>{guide.label}</div>
                </div>
              ) : (
                <div key={guide.id}>
                  <div style={{ position: "absolute", left: guide.x, top: guide.y, height: guide.length, borderLeft: "1px dashed #f59e0b" }} />
                  <div style={{ position: "absolute", left: guide.x + 4, top: guide.y + guide.length / 2 - 8, fontSize: 11, color: "#b45309" }}>{guide.label}</div>
                </div>
              )
            )}
            {(activeSlide.children ?? []).map((node) => (
              <SlideNode
                key={node.id}
                doc={doc}
                node={node}
                allNodes={activeSlide.children ?? []}
                selected={selection.selectedIds.includes(node.id)}
                onSelect={(multi) => store.setSelection(node.id, multi)}
                onCommitMove={(from, to) => {
                  const dx = Math.round(to.x - from.x);
                  const dy = Math.round(to.y - from.y);
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
                }}
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
                snapEnabled={snapEnabled}
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
  onBringFront,
  onSendBack,
  onSetGuides,
  engine,
  snapEnabled,
  onQuickChartPatch
}: {
  doc: VDoc;
  node: VNode;
  allNodes: VNode[];
  selected: boolean;
  onSelect: (multi: boolean) => void;
  onCommitMove: (from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }) => void;
  onCommitResize: (rect: { x: number; y: number; w: number; h: number }) => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onSetGuides: (guides: Guides) => void;
  engine: DataEngine;
  snapEnabled: boolean;
  onQuickChartPatch: (patch: Partial<ChartSpec>, summary: string) => void;
}): JSX.Element {
  const { rows, loading, error } = useNodeRows(doc, node, engine);
  const layout = node.layout ?? { mode: "absolute", x: 80, y: 80, w: 200, h: 120, z: 1 };
  const [rect, setRect] = useState({
    x: Number(layout.x ?? 80),
    y: Number(layout.y ?? 80),
    w: Number(layout.w ?? 200),
    h: Number(layout.h ?? 120)
  });
  const [start, setStart] = useState<{ x: number; y: number; rect: typeof rect } | null>(null);
  const [mode, setMode] = useState<"move" | "resize" | null>(null);

  useEffect(() => {
    setRect({
      x: Number(layout.x ?? 80),
      y: Number(layout.y ?? 80),
      w: Number(layout.w ?? 200),
      h: Number(layout.h ?? 120)
    });
  }, [layout.h, layout.w, layout.x, layout.y]);

  const snap = (candidate: typeof rect): typeof rect => {
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
  };

  const onPointerDownMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (node.layout?.lock) {
      return;
    }
    onSelect(event.ctrlKey || event.metaKey);
    setMode("move");
    setStart({ x: event.clientX, y: event.clientY, rect });
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!start || !mode) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (mode === "move") {
      setRect(snap({ ...start.rect, x: Math.max(0, start.rect.x + dx), y: Math.max(0, start.rect.y + dy) }));
      return;
    }
    setRect(snap({ ...start.rect, w: Math.max(80, start.rect.w + dx), h: Math.max(56, start.rect.h + dy) }));
  };

  const onPointerUp = (): void => {
    if (!start || !mode) {
      return;
    }
    if (mode === "move") {
      onCommitMove(start.rect, rect);
    } else {
      onCommitResize(rect);
    }
    setMode(null);
    setStart(null);
    onSetGuides({});
  };

  const onResizeDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (node.layout?.lock) {
      return;
    }
    onSelect(event.ctrlKey || event.metaKey);
    setMode("resize");
    setStart({ x: event.clientX, y: event.clientY, rect });
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  };

  return (
    <div
      className={`slide-node ${selected ? "active" : ""}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: Number(node.layout?.z ?? 1) }}
      onPointerDown={onPointerDownMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onBringFront()}
      onContextMenu={(event) => {
        event.preventDefault();
        onSendBack();
      }}
    >
      {node.kind === "text" ? (
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", width: "100%", height: "100%", overflow: "auto" }}>
          {String((node.props as Record<string, unknown>)?.text ?? "")}
        </pre>
      ) : node.kind === "chart" ? (
        loading ? (
          <div className="muted">loading...</div>
        ) : error ? (
          <div className="muted">error: {error}</div>
        ) : (
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <div
              style={{ position: "absolute", right: 4, top: 4, zIndex: 4 }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <ChartAskAssistant doc={doc} node={node} rows={rows} compact />
            </div>
            {selected ? (
              <div
                style={{ position: "absolute", right: 4, top: 34, zIndex: 4 }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <ChartQuickActions spec={node.props as ChartSpec} compact onPatch={onQuickChartPatch} />
              </div>
            ) : null}
            <EChartView spec={node.props as ChartSpec} rows={rows} height="100%" />
          </div>
        )
      ) : (
        <div className="muted">unsupported: {node.kind}</div>
      )}
      <div className="resize-handle" onPointerDown={onResizeDown} />
    </div>
  );
}
