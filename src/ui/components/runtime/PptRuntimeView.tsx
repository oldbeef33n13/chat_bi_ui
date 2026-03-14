import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeckProps, VDoc, VNode } from "../../../core/doc/types";
import { nodeTitle } from "../../../core/doc/tree";
import { useDataEngine } from "../../hooks/use-data-engine";
import { useNodeDataPrefetch } from "../../hooks/use-node-data-prefetch";
import { resolvePptPrefetchNodes } from "../../utils/data-fetch-strategy";
import type { PresentationRuntimeSettings } from "../../utils/presentation-settings";
import { RuntimeNodeContent, resolveNodeSurfaceStyle, resolveTitleTextStyle } from "./shared";
import { NodeTextBlock } from "../NodeTextBlock";
import type { RuntimeSelectionTarget } from "./runtime-selection";

export function PptRuntimeView({
  doc,
  immersive,
  presentationSettings,
  selectedNodeId,
  onSelectTarget
}: {
  doc: VDoc;
  immersive: boolean;
  presentationSettings?: PresentationRuntimeSettings;
  selectedNodeId?: string;
  onSelectTarget?: (target: RuntimeSelectionTarget) => void;
}): JSX.Element {
  const slides = (doc.root.children ?? []).filter((node) => node.kind === "slide");
  const rootProps = (doc.root.props ?? {}) as DeckProps & Record<string, unknown>;
  const masterShowHeader = rootProps.masterShowHeader !== false;
  const masterHeaderText = String(rootProps.masterHeaderText ?? doc.title ?? "");
  const masterShowFooter = rootProps.masterShowFooter !== false;
  const masterFooterText = String(rootProps.masterFooterText ?? "Visual Document OS");
  const masterShowSlideNumber = rootProps.masterShowSlideNumber !== false;
  const masterAccentColor = String(rootProps.masterAccentColor ?? "#1d4ed8");
  const masterPaddingXPx = Math.max(0, Number(rootProps.masterPaddingXPx ?? 24) || 24);
  const masterHeaderTopPx = Math.max(0, Number(rootProps.masterHeaderTopPx ?? 12) || 12);
  const masterHeaderHeightPx = Math.max(12, Number(rootProps.masterHeaderHeightPx ?? 26) || 26);
  const masterFooterBottomPx = Math.max(0, Number(rootProps.masterFooterBottomPx ?? 10) || 10);
  const masterFooterHeightPx = Math.max(12, Number(rootProps.masterFooterHeightPx ?? 22) || 22);
  const [activeIndex, setActiveIndex] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineQuery, setOutlineQuery] = useState("");
  const [recentSlideIds, setRecentSlideIds] = useState<string[]>([]);
  const outlineHostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 1280, height: 720 });
  const activeSlide = slides[activeIndex];
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const prefetchNodes = useMemo(
    () => resolvePptPrefetchNodes(doc, activeSlide?.id ?? slides[0]?.id, 1),
    [activeSlide?.id, doc, slides]
  );
  const baseSlideWidth = 960;
  const baseSlideHeight = 540;
  const fitMode = immersive && presentationSettings?.fitMode === "contain" ? "contain" : "fill";
  const slideScale = immersive
    ? Math.max(
        0.2,
        fitMode === "contain"
          ? Math.min(stageSize.width / baseSlideWidth, stageSize.height / baseSlideHeight)
          : Math.max(stageSize.width / baseSlideWidth, stageSize.height / baseSlideHeight)
      )
    : 1;

  useNodeDataPrefetch(doc, prefetchNodes, engine, dataVersion, "ppt runtime");

  useEffect(() => {
    setActiveIndex((value) => Math.min(Math.max(value, 0), Math.max(0, slides.length - 1)));
  }, [slides.length]);

  useEffect(() => {
    setOutlineQuery("");
    setRecentSlideIds([]);
  }, [doc.docId]);

  useEffect(() => {
    if (!immersive) {
      return;
    }
    const host = stageRef.current;
    if (!host) {
      return;
    }
    const updateSize = (): void => {
      const bounds = host.getBoundingClientRect();
      setStageSize({
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
  }, [immersive]);

  const goPrev = useCallback(() => setActiveIndex((value) => Math.max(0, value - 1)), []);
  const goNext = useCallback(() => setActiveIndex((value) => Math.min(slides.length - 1, value + 1)), [slides.length]);

  useEffect(() => {
    if (!immersive || slides.length === 0) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target as HTMLElement | null)) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        goNext();
        return;
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        setOutlineOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, immersive, slides.length]);

  useEffect(() => {
    if (!outlineOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target || !outlineHostRef.current) {
        return;
      }
      if (!outlineHostRef.current.contains(target)) {
        setOutlineOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [outlineOpen]);

  const normalizedQuery = outlineQuery.trim().toLowerCase();
  const filteredSlides =
    normalizedQuery.length === 0
      ? slides
      : slides.filter((slide, index) => `#${index + 1} ${String((slide.props as Record<string, unknown>)?.title ?? slide.id)}`.toLowerCase().includes(normalizedQuery));
  const recentSlides = recentSlideIds.map((id) => slides.find((slide) => slide.id === id)).filter((item): item is VNode => !!item);

  const jumpToSlide = (index: number): void => {
    const slide = slides[index];
    if (!slide) {
      return;
    }
    setActiveIndex(index);
    setRecentSlideIds((prev) => [slide.id, ...prev.filter((id) => id !== slide.id)].slice(0, 6));
    setOutlineOpen(false);
  };

  useEffect(() => {
    if (!activeSlide) {
      return;
    }
    if (activeSlide.children?.some((node) => node.id === selectedNodeId)) {
      return;
    }
    const nextNode = activeSlide.children?.[0];
    if (!nextNode) {
      return;
    }
    onSelectTarget?.({
      nodeId: nextNode.id,
      objectKind: nextNode.kind,
      objectLabel: nodeTitle(nextNode),
      slideLabel: `第 ${activeIndex + 1} 页 · ${String((activeSlide.props as Record<string, unknown>)?.title ?? activeSlide.id)}`
    });
  }, [activeIndex, activeSlide, onSelectTarget, selectedNodeId]);

  const renderOutlinePop = (): JSX.Element => (
    <div className="runtime-outline-pop">
      <div className="runtime-outline-title">页面跳转</div>
      <input className="input runtime-outline-search" value={outlineQuery} onChange={(event) => setOutlineQuery(event.target.value)} placeholder="搜索页面" />
      {recentSlides.length > 0 ? (
        <div className="runtime-outline-group">
          <div className="runtime-outline-subtitle">最近访问</div>
          {recentSlides.map((slide) => {
            const index = slides.findIndex((item) => item.id === slide.id);
            return (
              <button
                key={`recent_${slide.id}`}
                className={`runtime-outline-item ${index === activeIndex ? "active" : ""}`}
                title={`#${index + 1} ${String((slide.props as Record<string, unknown>)?.title ?? slide.id)}`}
                onClick={() => jumpToSlide(index)}
              >
                <span>{`#${index + 1} ${String((slide.props as Record<string, unknown>)?.title ?? slide.id)}`}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="runtime-outline-group">
        <div className="runtime-outline-subtitle">页面列表</div>
        {slides.length === 0 ? <div className="muted">暂无页面</div> : null}
        {slides.length > 0 && filteredSlides.length === 0 ? <div className="muted">未命中页面</div> : null}
        {filteredSlides.map((slide) => {
          const index = slides.findIndex((item) => item.id === slide.id);
          return (
            <button
              key={slide.id}
              className={`runtime-outline-item ${index === activeIndex ? "active" : ""}`}
              title={`#${index + 1} ${String((slide.props as Record<string, unknown>)?.title ?? slide.id)}`}
              onClick={() => jumpToSlide(index)}
            >
              <span>{`#${index + 1} ${String((slide.props as Record<string, unknown>)?.title ?? slide.id)}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderSlide = (slide: VNode): JSX.Element => (
    <div className={`slide runtime-slide ${immersive ? "runtime-slide-immersive" : ""}`}>
      {masterShowHeader ? (
        <div
          className="runtime-ppt-master-header"
          style={{ borderBottomColor: masterAccentColor, left: masterPaddingXPx, right: masterPaddingXPx, top: masterHeaderTopPx, minHeight: masterHeaderHeightPx }}
        >
          <span style={resolveTitleTextStyle({ fontSize: 13, fg: "#64748b" }, rootProps.headerStyle)}>{masterHeaderText || String((slide.props as Record<string, unknown>)?.title ?? "")}</span>
          <span style={resolveTitleTextStyle({ fontSize: 13, fg: "#64748b" }, rootProps.headerStyle)}>{String((slide.props as Record<string, unknown>)?.title ?? "")}</span>
        </div>
      ) : null}
      {(slide.children ?? []).map((node) => {
        const layout = node.layout ?? { mode: "absolute", x: 80, y: 80, w: 220, h: 140, z: 1 };
        return (
          <div
            key={node.id}
            className={`slide-node runtime-slide-node runtime-selectable ${selectedNodeId === node.id ? "is-runtime-selected" : ""} ${
              node.kind !== "text" ? "runtime-node-surface" : ""
            }`}
            data-testid={`runtime-ppt-node-${node.id}`}
            style={resolveNodeSurfaceStyle(node.style, {
              left: Number(layout.x ?? 80),
              top: Number(layout.y ?? 80),
              width: Number(layout.w ?? 220),
              height: Number(layout.h ?? 140),
              zIndex: Number(layout.z ?? 1)
            })}
            onClick={() =>
              onSelectTarget?.({
                nodeId: node.id,
                objectKind: node.kind,
                objectLabel: nodeTitle(node),
                slideLabel: `第 ${slides.findIndex((item) => item.id === slide.id) + 1} 页 · ${String((slide.props as Record<string, unknown>)?.title ?? slide.id)}`
              })
            }
          >
            <div className="ppt-node-content runtime-ppt-node-content">
              {node.kind === "text" ? (
                <NodeTextBlock node={node} style={{ width: "100%", height: "100%" }} />
              ) : (
                <RuntimeNodeContent doc={doc} node={node} engine={engine} dataVersion={dataVersion} height="100%" />
              )}
            </div>
          </div>
        );
      })}
      {masterShowFooter ? (
        <div
          className="runtime-ppt-master-footer"
          style={{ borderTopColor: masterAccentColor, left: masterPaddingXPx, right: masterPaddingXPx, bottom: masterFooterBottomPx, minHeight: masterFooterHeightPx }}
        >
          <span style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, rootProps.footerStyle)}>{masterFooterText}</span>
          {masterShowSlideNumber ? <span style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, rootProps.footerStyle)}>{`#${slides.findIndex((item) => item.id === slide.id) + 1}`}</span> : null}
        </div>
      ) : null}
    </div>
  );

  if (immersive) {
    return (
      <div ref={outlineHostRef} className="col runtime-ppt-immersive runtime-outline-host">
        <div className="runtime-nav">
          <div className="row">
            <span className="chip">PPT 放映</span>
            <span className="chip">
              第 {slides.length === 0 ? 0 : activeIndex + 1} / {slides.length} 页
            </span>
            <button className={`btn mini-btn ${outlineOpen ? "primary" : ""}`} title="打开页面目录" onClick={() => setOutlineOpen((value) => !value)}>
              目录 ▾
            </button>
          </div>
          <div className="row">
            <button className="btn" title="上一页" disabled={activeIndex <= 0} onClick={goPrev}>
              上一页
            </button>
            <button className="btn" title="下一页" disabled={activeIndex >= slides.length - 1} onClick={goNext}>
              下一页
            </button>
          </div>
        </div>
        {outlineOpen ? renderOutlinePop() : null}
        <div ref={stageRef} className={`canvas-wrap runtime-ppt-stage runtime-fit-${fitMode}`}>
          {activeSlide ? (
            <div className={`runtime-ppt-slide-shell runtime-fit-${fitMode}`} style={{ width: Math.round(baseSlideWidth * slideScale), height: Math.round(baseSlideHeight * slideScale) }}>
              <div
                className="runtime-ppt-slide-transform"
                style={{
                  width: baseSlideWidth,
                  height: baseSlideHeight,
                  transform: `scale(${slideScale})`,
                  transformOrigin: "top left"
                }}
              >
                {renderSlide(activeSlide)}
              </div>
            </div>
          ) : (
            <div className="muted">暂无页面</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={outlineHostRef} className="col runtime-outline-host" style={{ height: "100%" }}>
      <div className="runtime-outline-toolbar row">
        <span className="chip">PPT 运行态</span>
        <span className="chip">{`页面 ${slides.length}`}</span>
        <button className={`btn mini-btn ${outlineOpen ? "primary" : ""}`} title="打开页面目录" onClick={() => setOutlineOpen((value) => !value)}>
          目录 ▾
        </button>
      </div>
      {outlineOpen ? renderOutlinePop() : null}
      <div className="row" style={{ height: "100%" }}>
        <div style={{ width: 200, borderRight: "1px solid var(--line)", padding: "0 8px", overflow: "auto" }}>
          <div className="row" style={{ justifyContent: "space-between", margin: "8px 0" }}>
            <strong>页面列表</strong>
            <span className="chip">{slides.length} 页</span>
          </div>
          {slides.map((slide, index) => (
            <div key={slide.id} className={`tree-item ${activeIndex === index ? "active" : ""}`} onClick={() => jumpToSlide(index)}>
              <div>#{index + 1}</div>
              <div className="muted">{String((slide.props as Record<string, unknown>)?.title ?? slide.id)}</div>
            </div>
          ))}
        </div>
        <div className="canvas-wrap" style={{ flex: 1 }}>
          {activeSlide ? renderSlide(activeSlide) : <div className="muted">暂无页面</div>}
        </div>
      </div>
    </div>
  );
}

const isTypingTarget = (target: HTMLElement | null): boolean =>
  !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
