import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReportProps, VDoc, VNode } from "../../../core/doc/types";
import { nodeTitle } from "../../../core/doc/tree";
import { useDataEngine } from "../../hooks/use-data-engine";
import { useNodeDataPrefetch } from "../../hooks/use-node-data-prefetch";
import { resolveReportPrefetchNodes } from "../../utils/data-fetch-strategy";
import { buildReportGridRows } from "../../utils/report-layout";
import { computeVirtualWindow } from "../../utils/report-virtual";
import { flattenReportSections, getTopReportSections } from "../../utils/report-sections";
import type { PresentationRuntimeSettings } from "../../utils/presentation-settings";
import { renderRuntimeNodeHeader, resolveNodeSurfaceStyle, resolveTitleTextStyle, RuntimeNodeContent } from "./shared";
import { NodeTextBlock } from "../NodeTextBlock";
import type { RuntimeSelectionTarget } from "./runtime-selection";

const RUNTIME_REPORT_PAGE_GAP_PX = 10;

type RuntimeReportEntry =
  | { key: string; kind: "cover"; pageNumber: number; height: number }
  | { key: string; kind: "toc"; pageNumber: number; height: number }
  | {
      key: string;
      kind: "section";
      section: VNode;
      sectionTitle: string;
      rows: ReturnType<typeof buildReportGridRows>;
      pageNumber: number;
      height: number;
    }
  | { key: string; kind: "summary"; pageNumber: number; height: number };

export function ReportRuntimeView({
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
  const rootProps = normalizeReportProps(doc);
  const sections = getTopReportSections(doc.root);
  const flatSections = flattenReportSections(sections);
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? []);
  const outlineHostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineQuery, setOutlineQuery] = useState("");
  const [recentSectionIds, setRecentSectionIds] = useState<string[]>([]);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(720);
  const entries = useMemo<RuntimeReportEntry[]>(() => {
    const list: RuntimeReportEntry[] = [];
    let pageNumber = 1;
    if (rootProps.coverEnabled) {
      list.push({
        key: "cover",
        kind: "cover",
        pageNumber,
        height: measuredHeights.cover ?? 340 + RUNTIME_REPORT_PAGE_GAP_PX
      });
      pageNumber += 1;
    }
    if (rootProps.tocShow) {
      list.push({
        key: "toc",
        kind: "toc",
        pageNumber,
        height: measuredHeights.toc ?? 260 + RUNTIME_REPORT_PAGE_GAP_PX
      });
      pageNumber += 1;
    }
    flatSections.forEach((item, index) => {
      const sectionTitle = `${item.orderLabel}. ${item.title}`;
      const rows = buildReportGridRows(item.blocks);
      const fallbackCanvasHeight = Math.max(320, rows.reduce((sum, row) => sum + row.maxHeight + rootProps.blockGapPx, 0) + 56);
      list.push({
        key: item.section.id,
        kind: "section",
        section: item.section,
        sectionTitle,
        rows,
        pageNumber,
        height: measuredHeights[item.section.id] ?? 108 + rootProps.sectionGapPx + fallbackCanvasHeight + rows.length * 24 + RUNTIME_REPORT_PAGE_GAP_PX
      });
      pageNumber += 1;
    });
    if (rootProps.summaryEnabled) {
      list.push({
        key: "summary",
        kind: "summary",
        pageNumber,
        height: measuredHeights.summary ?? 260 + RUNTIME_REPORT_PAGE_GAP_PX
      });
    }
    return list;
  }, [flatSections, measuredHeights, rootProps.blockGapPx, rootProps.coverEnabled, rootProps.sectionGapPx, rootProps.summaryEnabled, rootProps.tocShow]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const update = (): void => setViewportHeight(Math.max(320, viewport.clientHeight || 720));
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const { totalHeight, visible } = useMemo(() => computeVirtualWindow(entries, scrollTop, viewportHeight, 480), [entries, scrollTop, viewportHeight]);
  const visibleSectionIds = useMemo(
    () =>
      visible.flatMap((entry) =>
        entry.item.kind === "section" ? [entry.item.section.id] : []
      ),
    [visible]
  );
  const prefetchNodes = useMemo(
    () => resolveReportPrefetchNodes(flatSections, visibleSectionIds.length > 0 ? visibleSectionIds : flatSections[0] ? [flatSections[0].section.id] : [], 1),
    [flatSections, visibleSectionIds]
  );
  const sectionOffsetMap = useMemo(() => {
    const map = new Map<string, number>();
    let runningTop = 0;
    entries.forEach((entry) => {
      if (entry.kind === "section") {
        map.set(entry.section.id, runningTop);
      }
      runningTop += entry.height;
    });
    return map;
  }, [entries]);

  useNodeDataPrefetch(doc, prefetchNodes, engine, dataVersion, "report runtime");

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

  const handleMeasuredHeight = useCallback((entryKey: string, height: number): void => {
    setMeasuredHeights((current) => {
      const nextValue = Math.round(height);
      if (nextValue <= 0) {
        return current;
      }
      if (current[entryKey] !== undefined && Math.abs(current[entryKey]! - nextValue) < 2) {
        return current;
      }
      return { ...current, [entryKey]: nextValue };
    });
  }, []);

  const normalizedQuery = outlineQuery.trim().toLowerCase();
  const filteredSections =
    normalizedQuery.length === 0
      ? flatSections
      : flatSections.filter((item) => `${item.orderLabel}. ${item.title}`.toLowerCase().includes(normalizedQuery));
  const recentSections = recentSectionIds.map((id) => flatSections.find((item) => item.section.id === id)).filter((item): item is (typeof flatSections)[number] => !!item);

  const jumpToSection = (sectionId: string): void => {
    const targetTop = sectionOffsetMap.get(sectionId);
    const viewport = viewportRef.current;
    if (targetTop !== undefined && viewport) {
      const nextTop = Math.max(0, targetTop - 6);
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({ top: nextTop, behavior: "smooth" });
      } else {
        viewport.scrollTop = nextTop;
        viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    }
    setRecentSectionIds((prev) => [sectionId, ...prev.filter((id) => id !== sectionId)].slice(0, 6));
    const currentSection = flatSections.find((item) => item.section.id === sectionId);
    const targetNode = currentSection?.blocks[0];
    if (currentSection && targetNode) {
      onSelectTarget?.({
        nodeId: targetNode.id,
        objectKind: targetNode.kind,
        objectLabel: nodeTitle(targetNode),
        sectionLabel: `${currentSection.orderLabel}. ${currentSection.title}`
      });
    }
    setOutlineOpen(false);
  };

  const renderPage = (page: RuntimeReportEntry): JSX.Element => {
    const renderFrame = (body: JSX.Element): JSX.Element => (
      <div className="report-page-frame">
        {rootProps.headerShow ? (
          <div className="report-page-header row" style={{ justifyContent: "space-between" }}>
            <span style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, rootProps.headerStyle)}>{rootProps.headerText || rootProps.reportTitle}</span>
            {rootProps.showPageNumber ? <span className="muted" style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, rootProps.headerStyle)}>Page {page.pageNumber}</span> : null}
          </div>
        ) : null}
        <div className="report-page-body" style={{ padding: Math.max(0, Number(rootProps.bodyPaddingPx ?? 12)) }}>{body}</div>
        {rootProps.footerShow ? (
          <div className="report-page-footer row" style={{ justifyContent: "space-between" }}>
            <span className="muted" style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, rootProps.footerStyle)}>{rootProps.footerText || "Visual Document OS"}</span>
            {rootProps.showPageNumber ? <span className="muted" style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, rootProps.footerStyle)}>#{page.pageNumber}</span> : null}
          </div>
        ) : null}
      </div>
    );
    if (page.kind === "cover") {
      return renderFrame(
        <div className="col" style={{ minHeight: 240, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div style={resolveTitleTextStyle({ fontSize: 30, bold: true, align: "center" }, rootProps.coverTitleStyle)}>{rootProps.coverTitle || rootProps.reportTitle}</div>
          <div className="muted">{rootProps.coverSubtitle}</div>
          <div className="muted">{rootProps.coverNote}</div>
        </div>
      );
    }
    if (page.kind === "toc") {
      return renderFrame(
        <div className="section">
          <div className="section-title" style={{ ...resolveTitleTextStyle({ fontSize: 24, bold: true }, rootProps.sectionTitleStyle), marginBottom: Math.max(0, Number(rootProps.sectionGapPx ?? 12)) }}>
            目录
          </div>
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
      const { rows, sectionTitle } = page;
      return renderFrame(
        <div className="section">
          <div className="section-title" style={{ ...resolveTitleTextStyle({ fontSize: 24, bold: true }, rootProps.sectionTitleStyle), marginBottom: Math.max(0, Number(rootProps.sectionGapPx ?? 12)) }}>
            {sectionTitle}
          </div>
          {rows.map((row) => (
            <div key={`${page.section.id}_${row.key}`} className="report-row-grid" style={{ marginBottom: Math.max(0, Number(rootProps.blockGapPx ?? 8)) }}>
              {row.items.map((item) => (
                <div key={item.node.id} className="report-row-cell" style={{ gridColumn: `${item.gx + 1} / span ${item.gw}` }}>
                  <div
                    className={`block runtime-node-surface runtime-selectable ${selectedNodeId === item.node.id ? "is-runtime-selected" : ""}`}
                    data-testid={`runtime-report-node-${item.node.id}`}
                    style={resolveNodeSurfaceStyle(item.node.style, { margin: 0, height: item.height })}
                    onClick={() =>
                      onSelectTarget?.({
                        nodeId: item.node.id,
                        objectKind: item.node.kind,
                        objectLabel: nodeTitle(item.node),
                        sectionLabel: sectionTitle
                      })
                    }
                  >
                    {renderRuntimeNodeHeader(doc, item.node, engine, dataVersion)}
                    {item.node.kind === "text" ? (
                      <NodeTextBlock node={item.node} />
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
        <div className="section-title" style={{ ...resolveTitleTextStyle({ fontSize: 24, bold: true }, rootProps.summaryTitleStyle), marginBottom: Math.max(0, Number(rootProps.sectionGapPx ?? 12)) }}>
          {rootProps.summaryTitle}
        </div>
        <div className="block" style={{ margin: 0 }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{rootProps.summaryText}</pre>
        </div>
      </div>
    );
  };

  if (entries.length === 0) {
    return <div className="muted">暂无报告内容</div>;
  }

  return (
    <div
      ref={outlineHostRef}
      className={`col runtime-report runtime-outline-host ${immersive ? "runtime-report-immersive" : ""} ${immersive && presentationSettings?.paddingMode === "edge" ? "runtime-pad-edge" : ""}`}
      style={{ height: "100%", minHeight: 0 }}
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
          <input className="input runtime-outline-search" value={outlineQuery} onChange={(event) => setOutlineQuery(event.target.value)} placeholder="搜索章节" />
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
      <div
        ref={viewportRef}
        className="runtime-report-viewport"
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
        }}
      >
        <div className="runtime-report-virtual-stage" style={{ height: totalHeight }}>
          {visible.map((page) => (
            <div key={page.item.key} className="runtime-report-virtual-item" style={{ top: page.top }}>
              <MeasuredRuntimeReportPage entryKey={page.item.key} onMeasure={handleMeasuredHeight} style={{ paddingBottom: RUNTIME_REPORT_PAGE_GAP_PX }}>
                {renderPage(page.item)}
              </MeasuredRuntimeReportPage>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MeasuredRuntimeReportPage({
  entryKey,
  onMeasure,
  style,
  children
}: {
  entryKey: string;
  onMeasure: (entryKey: string, height: number) => void;
  style?: React.CSSProperties;
  children: JSX.Element;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const measure = (): void => {
      onMeasure(entryKey, host.getBoundingClientRect().height);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [entryKey, onMeasure]);

  return (
    <div ref={hostRef} style={style}>
      {children}
    </div>
  );
}

const normalizeReportProps = (doc: VDoc): Required<Omit<ReportProps, "pageSize">> & Pick<ReportProps, "pageSize"> => {
  const raw = ((doc.root.props as ReportProps | undefined) ?? {}) as ReportProps;
  const reportTitle = raw.reportTitle ?? doc.title ?? "未命名报告";
  return {
    ...raw,
    reportTitle,
    tocShow: raw.tocShow ?? true,
    coverEnabled: raw.coverEnabled ?? true,
    coverTitle: raw.coverTitle ?? reportTitle,
    coverTitleStyle: raw.coverTitleStyle ?? {},
    coverSubtitle: raw.coverSubtitle ?? "Report",
    coverNote: raw.coverNote ?? "",
    summaryEnabled: raw.summaryEnabled ?? true,
    summaryTitle: raw.summaryTitle ?? "执行摘要",
    summaryTitleStyle: raw.summaryTitleStyle ?? {},
    summaryText: raw.summaryText ?? "",
    headerShow: raw.headerShow ?? true,
    footerShow: raw.footerShow ?? true,
    headerText: raw.headerText ?? reportTitle,
    headerStyle: raw.headerStyle ?? {},
    footerText: raw.footerText ?? "Visual Document OS",
    footerStyle: raw.footerStyle ?? {},
    showPageNumber: raw.showPageNumber ?? true,
    sectionTitleStyle: raw.sectionTitleStyle ?? {},
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
