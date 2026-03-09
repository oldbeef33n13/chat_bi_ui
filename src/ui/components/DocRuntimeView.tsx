import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartSpec, ImageProps, ReportProps, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { EChartView } from "../../runtime/chart/EChartView";
import { TableView } from "../../runtime/table/TableView";
import { useDataEngine } from "../hooks/use-data-engine";
import { useNodeRows } from "../hooks/use-node-rows";
import { ChartAskAssistant } from "./ChartAskAssistant";
import { buildReportGridRows } from "../utils/report-layout";
import { flattenReportSections, getTopReportSections } from "../utils/report-sections";
import { resolveDashboardNodeRect, resolveDashboardSurfaceMetrics, resolveImageAsset } from "../utils/dashboard-surface";
import type { PresentationRuntimeSettings } from "../utils/presentation-settings";

export function DocRuntimeView({
  doc,
  immersive = false,
  presentationSettings
}: {
  doc: VDoc;
  immersive?: boolean;
  presentationSettings?: PresentationRuntimeSettings;
}): JSX.Element {
  const docType = doc.docType === "chart" ? "dashboard" : doc.docType;
  if (docType === "dashboard") {
    return <DashboardRuntimeView doc={doc} immersive={immersive} presentationSettings={presentationSettings} />;
  }
  if (docType === "report") {
    return <ReportRuntimeView doc={doc} immersive={immersive} presentationSettings={presentationSettings} />;
  }
  if (docType === "ppt") {
    return <PptRuntimeView doc={doc} immersive={immersive} presentationSettings={presentationSettings} />;
  }
  return <div className="muted">暂不支持该文档类型</div>;
}

function DashboardRuntimeView({
  doc,
  immersive,
  presentationSettings
}: {
  doc: VDoc;
  immersive: boolean;
  presentationSettings?: PresentationRuntimeSettings;
}): JSX.Element {
  const root = doc.root;
  const children = root.children ?? [];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const metrics = resolveDashboardSurfaceMetrics({
    doc,
    containerWidth: viewportSize.width,
    containerHeight: viewportSize.height,
    scaleMode: immersive && presentationSettings?.fitMode === "fill" ? "width" : "contain"
  });

  useEffect(() => {
    const host = wrapRef.current;
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

  return (
    <div className={`col ${immersive ? "runtime-dashboard-immersive" : ""}`} style={{ height: "100%" }}>
      {!immersive ? (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="chip">{metrics.dashTitle}</span>
          <span className="chip">运行态预览</span>
        </div>
      ) : null}
      {metrics.headerShow ? <div className="dashboard-global-header">{metrics.headerText}</div> : null}
      {metrics.showFilterBar ? (
        <div className="row" style={{ padding: "6px 2px", gap: 10 }}>
          {(doc.filters ?? []).map((filter) => (
            <span key={filter.filterId} className="chip">
              {filter.title ?? filter.filterId}: {String(filter.defaultValue ?? "-")}
            </span>
          ))}
        </div>
      ) : null}
      <div
        ref={wrapRef}
        className={`dashboard-surface-viewport dashboard-mode-${metrics.displayMode} ${immersive && presentationSettings?.fitMode === "fill" ? "runtime-fit-fill" : "runtime-fit-contain"}`}
        style={{ flex: 1, minHeight: 0 }}
      >
        <div
          className="dashboard-surface-stage"
          style={{
            width: Math.round(metrics.canvasWidth * metrics.scale),
            height: Math.round(metrics.canvasHeight * metrics.scale)
          }}
        >
          <div
            className={`dash-grid runtime-grid dashboard-surface dashboard-surface-${metrics.displayMode}`}
            style={{
              width: metrics.canvasWidth,
              height: metrics.canvasHeight,
              transform: `scale(${metrics.scale})`,
              transformOrigin: "top left"
            }}
          >
        {children.map((node) => {
          const rect = resolveDashboardNodeRect(node, metrics);
          const showHeader = node.kind !== "text";
          const title =
            node.kind === "chart"
              ? String((node.props as ChartSpec | undefined)?.titleText ?? node.name ?? node.id)
              : node.kind === "table"
                ? String((node.props as TableSpec | undefined)?.titleText ?? node.name ?? node.id)
                : node.kind === "image"
                  ? String((node.props as ImageProps | undefined)?.title ?? node.name ?? node.id)
                : String(node.name ?? node.id);
          return (
            <div
              key={node.id}
              className={`dash-card runtime-card ${node.kind === "text" ? "dash-card-text" : ""}`}
              style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            >
              {showHeader ? (
                <div className="card-head card-head-floating row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <span className="card-head-title">{title}</span>
                  {node.kind === "chart" ? <RuntimeChartAskHeaderAction doc={doc} node={node} engine={engine} dataVersion={dataVersion} /> : null}
                </div>
              ) : null}
              <div className="card-body" style={{ height: "100%" }}>
                <RuntimeNodeContent doc={doc} node={node} engine={engine} dataVersion={dataVersion} height="100%" />
              </div>
            </div>
          );
        })}
          </div>
        </div>
      </div>
      {metrics.footerShow ? <div className="dashboard-global-footer">{metrics.footerText}</div> : null}
    </div>
  );
}

function ReportRuntimeView({
  doc,
  immersive,
  presentationSettings
}: {
  doc: VDoc;
  immersive: boolean;
  presentationSettings?: PresentationRuntimeSettings;
}): JSX.Element {
  const rootProps = normalizeReportProps(doc);
  const sections = getTopReportSections(doc.root);
  const flatSections = flattenReportSections(sections);
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const outlineHostRef = useRef<HTMLDivElement>(null);
  const sectionRefMap = useRef<Record<string, HTMLDivElement | null>>({});
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineQuery, setOutlineQuery] = useState("");
  const [recentSectionIds, setRecentSectionIds] = useState<string[]>([]);
  const pages = useMemo(() => {
    const list: Array<
      | { key: string; kind: "cover"; pageNumber: number }
      | { key: string; kind: "toc"; pageNumber: number }
      | { key: string; kind: "section"; section: VNode; sectionIndex: number; pageNumber: number }
      | { key: string; kind: "summary"; pageNumber: number }
    > = [];
    let pageNumber = 1;
    if (rootProps.coverEnabled) {
      list.push({ key: "cover", kind: "cover", pageNumber });
      pageNumber += 1;
    }
    if (rootProps.tocShow) {
      list.push({ key: "toc", kind: "toc", pageNumber });
      pageNumber += 1;
    }
    flatSections.forEach((item, index) => {
      list.push({ key: item.section.id, kind: "section", section: item.section, sectionIndex: index, pageNumber });
      pageNumber += 1;
    });
    if (rootProps.summaryEnabled) {
      list.push({ key: "summary", kind: "summary", pageNumber });
    }
    return list;
  }, [flatSections, rootProps.coverEnabled, rootProps.summaryEnabled, rootProps.tocShow]);

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

  useEffect(() => {
    setOutlineQuery("");
    setRecentSectionIds([]);
  }, [doc.docId]);

  const normalizedQuery = outlineQuery.trim().toLowerCase();
  const filteredSections =
    normalizedQuery.length === 0
      ? flatSections
      : flatSections.filter((item) => `${item.orderLabel}. ${item.title}`.toLowerCase().includes(normalizedQuery));
  const recentSections = recentSectionIds
    .map((id) => flatSections.find((item) => item.section.id === id))
    .filter((item): item is (typeof flatSections)[number] => !!item);

  const jumpToSection = (sectionId: string): void => {
    sectionRefMap.current[sectionId]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    setRecentSectionIds((prev) => [sectionId, ...prev.filter((id) => id !== sectionId)].slice(0, 6));
    setOutlineOpen(false);
  };
  const renderPage = (
    page:
      | { key: string; kind: "cover"; pageNumber: number }
      | { key: string; kind: "toc"; pageNumber: number }
      | { key: string; kind: "section"; section: VNode; sectionIndex: number; pageNumber: number }
      | { key: string; kind: "summary"; pageNumber: number }
  ): JSX.Element => {
    const renderFrame = (body: JSX.Element): JSX.Element => (
      <div className="report-page-frame">
        {rootProps.headerShow ? (
          <div className="report-page-header row" style={{ justifyContent: "space-between" }}>
            <span>{rootProps.headerText || rootProps.reportTitle}</span>
            {rootProps.showPageNumber ? <span className="muted">Page {page.pageNumber}</span> : null}
          </div>
        ) : null}
        <div className="report-page-body" style={{ padding: Math.max(0, Number(rootProps.bodyPaddingPx ?? 12)) }}>{body}</div>
        {rootProps.footerShow ? (
          <div className="report-page-footer row" style={{ justifyContent: "space-between" }}>
            <span className="muted">{rootProps.footerText || "Visual Document OS"}</span>
            {rootProps.showPageNumber ? <span className="muted">#{page.pageNumber}</span> : null}
          </div>
        ) : null}
      </div>
    );
    if (page.kind === "cover") {
      return renderFrame(
        <div className="col" style={{ minHeight: 240, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>{rootProps.coverTitle || rootProps.reportTitle}</div>
          <div className="muted">{rootProps.coverSubtitle}</div>
          <div className="muted">{rootProps.coverNote}</div>
        </div>
      );
    }
    if (page.kind === "toc") {
      return renderFrame(
        <div className="section">
          <div className="section-title" style={{ marginBottom: Math.max(0, Number(rootProps.sectionGapPx ?? 12)) }}>目录</div>
          <div className="block" style={{ margin: 0 }}>
            {flatSections.map((item) => (
              <div key={item.section.id} className="row" style={{ justifyContent: "space-between", borderBottom: "1px dashed var(--line)", padding: "6px 0" }}>
                <span style={item.level === 2 ? { paddingLeft: 14, color: "#475569" } : undefined}>{`${item.orderLabel}. ${item.title}`}</span>
                <span className="muted">Section</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (page.kind === "section") {
      const { section, sectionIndex } = page;
      const flat = flatSections.find((item) => item.section.id === section.id);
      const sectionTitle = flat ? `${flat.orderLabel}. ${flat.title}` : String((section.props as Record<string, unknown>)?.title ?? `章节 ${sectionIndex + 1}`);
      const sectionBlocks = flat ? flat.blocks : (section.children ?? []).filter((item) => item.kind !== "section");
      return renderFrame(
        <div className="section">
          <div className="section-title" style={{ marginBottom: Math.max(0, Number(rootProps.sectionGapPx ?? 12)) }}>
            {sectionTitle}
          </div>
          {buildReportGridRows(sectionBlocks).map((row) => (
            <div key={`${section.id}_${row.key}`} className="report-row-grid" style={{ marginBottom: Math.max(0, Number(rootProps.blockGapPx ?? 8)) }}>
              {row.items.map((item) => (
                <div
                  key={item.node.id}
                  className="report-row-cell"
                  style={{ gridColumn: `${item.gx + 1} / span ${item.gw}` }}
                >
                    <div className="block runtime-node-surface" style={{ margin: 0, height: item.height }}>
                      {item.node.kind !== "text" ? (
                        <div className="node-floating-label runtime-node-header row" style={{ justifyContent: "space-between", gap: 6 }}>
                          <span className="node-floating-label-text">
                            {item.node.kind === "chart"
                              ? String((item.node.props as ChartSpec | undefined)?.titleText ?? item.node.name ?? item.node.id)
                              : item.node.kind === "table"
                                ? String((item.node.props as TableSpec | undefined)?.titleText ?? item.node.name ?? item.node.id)
                                : String(item.node.name ?? item.node.id)}
                          </span>
                          {item.node.kind === "chart" ? <RuntimeChartAskHeaderAction doc={doc} node={item.node} engine={engine} dataVersion={dataVersion} /> : null}
                        </div>
                      ) : null}
                    {item.node.kind === "text" ? (
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{String((item.node.props as Record<string, unknown>)?.text ?? "")}</pre>
                    ) : (
                      <RuntimeNodeContent doc={doc} node={item.node} engine={engine} dataVersion={dataVersion} height={Math.max(120, item.height - 18)} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }
    return renderFrame(
      <div className="section">
        <div className="section-title" style={{ marginBottom: Math.max(0, Number(rootProps.sectionGapPx ?? 12)) }}>
          {rootProps.summaryTitle}
        </div>
        <div className="block" style={{ margin: 0 }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{rootProps.summaryText}</pre>
        </div>
      </div>
    );
  };

  if (pages.length === 0) {
    return <div className="muted">暂无报告内容</div>;
  }

  return (
    <div
      ref={outlineHostRef}
      className={`col runtime-report runtime-outline-host ${immersive ? "runtime-report-immersive" : ""} ${immersive && presentationSettings?.paddingMode === "edge" ? "runtime-pad-edge" : ""}`}
    >
      <div className="runtime-outline-toolbar row">
        <span className="chip">报告运行态</span>
        <span className="chip">{`章节 ${flatSections.length}`}</span>
        <button className={`btn mini-btn ${outlineOpen ? "primary" : ""}`} title="打开章节目录" onClick={() => setOutlineOpen((value) => !value)}>
          目录 ▾
        </button>
      </div>
      {outlineOpen ? (
        <div className="runtime-outline-pop">
          <div className="runtime-outline-title">章节跳转</div>
          <input
            className="input runtime-outline-search"
            value={outlineQuery}
            onChange={(event) => setOutlineQuery(event.target.value)}
            placeholder="搜索章节"
          />
          {recentSections.length > 0 ? (
            <div className="runtime-outline-group">
              <div className="runtime-outline-subtitle">最近访问</div>
              {recentSections.map((item) => (
                <button key={`recent_${item.section.id}`} className="runtime-outline-item" title={`${item.orderLabel}. ${item.title}`} onClick={() => jumpToSection(item.section.id)}>
                  <span>{`${item.orderLabel}. ${item.title}`}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="runtime-outline-group">
            <div className="runtime-outline-subtitle">章节列表</div>
            {flatSections.length === 0 ? <div className="muted">暂无章节</div> : null}
            {flatSections.length > 0 && filteredSections.length === 0 ? <div className="muted">未命中章节</div> : null}
            {filteredSections.map((item) => (
              <button key={item.section.id} className="runtime-outline-item" title={`${item.orderLabel}. ${item.title}`} onClick={() => jumpToSection(item.section.id)}>
                <span>{`${item.orderLabel}. ${item.title}`}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {pages.map((page) => (
        <div
          key={page.key}
          ref={(element) => {
            if (page.kind === "section") {
              sectionRefMap.current[page.section.id] = element;
            }
          }}
        >
          {renderPage(page)}
        </div>
      ))}
    </div>
  );
}

function PptRuntimeView({
  doc,
  immersive,
  presentationSettings
}: {
  doc: VDoc;
  immersive: boolean;
  presentationSettings?: PresentationRuntimeSettings;
}): JSX.Element {
  const slides = (doc.root.children ?? []).filter((node) => node.kind === "slide");
  const rootProps = (doc.root.props ?? {}) as Record<string, unknown>;
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
  const recentSlides = recentSlideIds
    .map((id) => slides.find((slide) => slide.id === id))
    .filter((item): item is VNode => !!item);

  const jumpToSlide = (index: number): void => {
    const slide = slides[index];
    if (!slide) {
      return;
    }
    setActiveIndex(index);
    setRecentSlideIds((prev) => [slide.id, ...prev.filter((id) => id !== slide.id)].slice(0, 6));
    setOutlineOpen(false);
  };

  const renderOutlinePop = (): JSX.Element => (
    <div className="runtime-outline-pop">
      <div className="runtime-outline-title">页面跳转</div>
      <input
        className="input runtime-outline-search"
        value={outlineQuery}
        onChange={(event) => setOutlineQuery(event.target.value)}
        placeholder="搜索页面"
      />
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
          <span>{masterHeaderText || String((slide.props as Record<string, unknown>)?.title ?? "")}</span>
          <span>{String((slide.props as Record<string, unknown>)?.title ?? "")}</span>
        </div>
      ) : null}
      {(slide.children ?? []).map((node) => {
        const layout = node.layout ?? { mode: "absolute", x: 80, y: 80, w: 220, h: 140, z: 1 };
        return (
          <div
            key={node.id}
            className={`slide-node runtime-slide-node ${node.kind !== "text" ? "runtime-node-surface" : ""}`}
            style={{
              left: Number(layout.x ?? 80),
              top: Number(layout.y ?? 80),
              width: Number(layout.w ?? 220),
              height: Number(layout.h ?? 140),
              zIndex: Number(layout.z ?? 1)
            }}
          >
            {node.kind !== "text" ? (
              <div className="node-floating-label runtime-node-header row" style={{ justifyContent: "space-between", gap: 6 }}>
                <span className="node-floating-label-text">
                  {node.kind === "chart"
                    ? String((node.props as ChartSpec | undefined)?.titleText ?? node.name ?? node.id)
                    : node.kind === "table"
                      ? String((node.props as TableSpec | undefined)?.titleText ?? node.name ?? node.id)
                      : String(node.name ?? node.id)}
                </span>
                {node.kind === "chart" ? <RuntimeChartAskHeaderAction doc={doc} node={node} engine={engine} dataVersion={dataVersion} /> : null}
              </div>
            ) : null}
            {node.kind === "text" ? (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", width: "100%", height: "100%", overflow: "auto" }}>
                {String((node.props as Record<string, unknown>)?.text ?? "")}
              </pre>
            ) : (
              <RuntimeNodeContent doc={doc} node={node} engine={engine} dataVersion={dataVersion} height="100%" />
            )}
          </div>
        );
      })}
      {masterShowFooter ? (
        <div
          className="runtime-ppt-master-footer"
          style={{ borderTopColor: masterAccentColor, left: masterPaddingXPx, right: masterPaddingXPx, bottom: masterFooterBottomPx, minHeight: masterFooterHeightPx }}
        >
          <span>{masterFooterText}</span>
          {masterShowSlideNumber ? <span>{`#${slides.findIndex((item) => item.id === slide.id) + 1}`}</span> : null}
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
        {outlineOpen ? (
          renderOutlinePop()
        ) : null}
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
      {outlineOpen ? (
        renderOutlinePop()
      ) : null}
      <div className="row" style={{ height: "100%" }}>
      <div style={{ width: 200, borderRight: "1px solid var(--line)", padding: "0 8px", overflow: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between", margin: "8px 0" }}>
          <strong>页面列表</strong>
          <span className="chip">{slides.length} 页</span>
        </div>
        {slides.map((slide, index) => (
          <div key={slide.id} className={`tree-item ${activeIndex === index ? "active" : ""}`} onClick={() => setActiveIndex(index)}>
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

function RuntimeChartAskHeaderAction({
  doc,
  node,
  engine,
  dataVersion
}: {
  doc: VDoc;
  node: VNode;
  engine: ReturnType<typeof useDataEngine>["engine"];
  dataVersion: string;
}): JSX.Element | null {
  const spec = (node.props ?? {}) as ChartSpec;
  const enabled = node.kind === "chart" && spec.runtimeAskEnabled !== false;
  const { rows, loading, error } = useNodeRows(doc, node, engine, dataVersion);
  if (!enabled || loading || error) {
    return null;
  }
  return (
    <div className="runtime-chart-ask-entry">
      <ChartAskAssistant doc={doc} node={node} rows={rows} compact triggerMode="icon" />
    </div>
  );
}

function RuntimeNodeContent({
  doc,
  node,
  engine,
  dataVersion,
  height
}: {
  doc: VDoc;
  node: VNode;
  engine: ReturnType<typeof useDataEngine>["engine"];
  dataVersion: string;
  height: number | string;
}): JSX.Element {
  const { rows, loading, error } = useNodeRows(doc, node, engine, dataVersion);
  if (loading) {
    return <div className="muted">loading...</div>;
  }
  if (error) {
    return <div className="muted">error: {error}</div>;
  }
  if (node.kind === "chart") {
    return <EChartView spec={node.props as ChartSpec} rows={rows} height={height} />;
  }
  if (node.kind === "table") {
    return <TableView spec={node.props as TableSpec} rows={rows} height={height} />;
  }
  if (node.kind === "text") {
    return <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{String((node.props as Record<string, unknown>)?.text ?? "")}</pre>;
  }
  if (node.kind === "image") {
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
  return <div className="muted">暂未支持: {node.kind}</div>;
}

const isTypingTarget = (target: HTMLElement | null): boolean =>
  !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

const normalizeReportProps = (doc: VDoc): Required<Omit<ReportProps, "pageSize">> & Pick<ReportProps, "pageSize"> => {
  const raw = ((doc.root.props as ReportProps | undefined) ?? {}) as ReportProps;
  const reportTitle = raw.reportTitle ?? doc.title ?? "未命名报告";
  return {
    ...raw,
    reportTitle,
    tocShow: raw.tocShow ?? true,
    coverEnabled: raw.coverEnabled ?? true,
    coverTitle: raw.coverTitle ?? reportTitle,
    coverSubtitle: raw.coverSubtitle ?? "Report",
    coverNote: raw.coverNote ?? "",
    summaryEnabled: raw.summaryEnabled ?? true,
    summaryTitle: raw.summaryTitle ?? "执行摘要",
    summaryText: raw.summaryText ?? "",
    headerShow: raw.headerShow ?? true,
    footerShow: raw.footerShow ?? true,
    headerText: raw.headerText ?? reportTitle,
    footerText: raw.footerText ?? "Visual Document OS",
    showPageNumber: raw.showPageNumber ?? true,
    paginationStrategy: raw.paginationStrategy ?? "section",
    marginPreset: raw.marginPreset ?? "normal",
    marginTopMm: raw.marginTopMm ?? 14,
    marginRightMm: raw.marginRightMm ?? 14,
    marginBottomMm: raw.marginBottomMm ?? 14,
    marginLeftMm: raw.marginLeftMm ?? 14,
    bodyPaddingPx: Math.max(0, Number(raw.bodyPaddingPx ?? 12) || 12),
    sectionGapPx: Math.max(0, Number(raw.sectionGapPx ?? 12) || 12),
    blockGapPx: Math.max(0, Number(raw.blockGapPx ?? 8) || 8),
    nativeChartEnabled: raw.nativeChartEnabled ?? true,
    nativeChartWidthEmu: raw.nativeChartWidthEmu ?? 6_000_000,
    nativeChartHeightEmu: raw.nativeChartHeightEmu ?? 3_200_000
  };
};
