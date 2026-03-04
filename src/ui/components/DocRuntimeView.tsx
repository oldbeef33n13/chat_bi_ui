import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartSpec, ReportProps, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { EChartView } from "../../runtime/chart/EChartView";
import { TableView } from "../../runtime/table/TableView";
import { useDataEngine } from "../hooks/use-data-engine";
import { useNodeRows } from "../hooks/use-node-rows";
import { resolveContainerWidth } from "../utils/container-width";

export function DocRuntimeView({ doc }: { doc: VDoc }): JSX.Element {
  const docType = doc.docType === "chart" ? "dashboard" : doc.docType;
  if (docType === "dashboard") {
    return <DashboardRuntimeView doc={doc} />;
  }
  if (docType === "report") {
    return <ReportRuntimeView doc={doc} />;
  }
  if (docType === "ppt") {
    return <PptRuntimeView doc={doc} />;
  }
  return <div className="muted">暂不支持该文档类型</div>;
}

function DashboardRuntimeView({ doc }: { doc: VDoc }): JSX.Element {
  const root = doc.root;
  const children = root.children ?? [];
  const gridCols = Number((root.props as Record<string, unknown>)?.gridCols ?? 12);
  const rowH = Number((root.props as Record<string, unknown>)?.rowH ?? 40);
  const gap = Number((root.props as Record<string, unknown>)?.gap ?? 12);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(1200);
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });

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

  const totalHeight = Math.max(
    520,
    ...children.map((node, index) => {
      const rect = calcDashboardRect(node, index, wrapWidth, gridCols, rowH, gap);
      return rect.top + rect.height + gap;
    })
  );

  return (
    <div className="col" style={{ height: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="chip">{String((root.props as Record<string, unknown>)?.dashTitle ?? doc.title ?? "Dashboard")}</span>
        <span className="chip">运行态预览</span>
      </div>
      <div ref={wrapRef} className="dash-grid runtime-grid" style={{ minHeight: totalHeight }}>
        {children.map((node, index) => {
          const rect = calcDashboardRect(node, index, wrapWidth, gridCols, rowH, gap);
          return (
            <div
              key={node.id}
              className="dash-card runtime-card"
              style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            >
              <div className="card-head">
                {String((node.props as ChartSpec | undefined)?.titleText ?? node.name ?? node.id)}
              </div>
              <div className="card-body" style={{ height: rect.height - 32 }}>
                <RuntimeNodeContent doc={doc} node={node} engine={engine} dataVersion={dataVersion} height="100%" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportRuntimeView({ doc }: { doc: VDoc }): JSX.Element {
  const rootProps = normalizeReportProps(doc);
  const sections = (doc.root.children ?? []).filter((item) => item.kind === "section");
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });

  return (
    <div className="col runtime-report">
      {rootProps.coverEnabled ? (
        <div className="report-page-frame">
          <div className="report-page-body">
            <div className="col" style={{ minHeight: 240, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{rootProps.coverTitle || rootProps.reportTitle}</div>
              <div className="muted">{rootProps.coverSubtitle}</div>
              <div className="muted">{rootProps.coverNote}</div>
            </div>
          </div>
        </div>
      ) : null}
      {rootProps.tocShow ? (
        <div className="report-page-frame">
          <div className="report-page-body">
            <div className="section">
              <div className="section-title">目录</div>
              <div className="block" style={{ margin: 0 }}>
                {sections.map((section, index) => (
                  <div key={section.id} className="row" style={{ justifyContent: "space-between", borderBottom: "1px dashed var(--line)", padding: "6px 0" }}>
                    <span>{`${index + 1}. ${String((section.props as Record<string, unknown>)?.title ?? `章节 ${index + 1}`)}`}</span>
                    <span className="muted">Section</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {sections.map((section, index) => (
        <div key={section.id} className="report-page-frame">
          {rootProps.headerShow ? (
            <div className="report-page-header row" style={{ justifyContent: "space-between" }}>
              <span>{rootProps.headerText || rootProps.reportTitle}</span>
              {rootProps.showPageNumber ? <span className="muted">Page {index + 1}</span> : null}
            </div>
          ) : null}
          <div className="report-page-body">
            <div className="section">
              <div className="section-title">{String((section.props as Record<string, unknown>)?.title ?? `章节 ${index + 1}`)}</div>
              {(section.children ?? []).map((block) => (
                <div key={block.id} className="block">
                  {block.kind === "text" ? (
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{String((block.props as Record<string, unknown>)?.text ?? "")}</pre>
                  ) : (
                    <RuntimeNodeContent doc={doc} node={block} engine={engine} dataVersion={dataVersion} height={260} />
                  )}
                </div>
              ))}
            </div>
          </div>
          {rootProps.footerShow ? (
            <div className="report-page-footer row" style={{ justifyContent: "space-between" }}>
              <span className="muted">{rootProps.footerText || "Visual Document OS"}</span>
              {rootProps.showPageNumber ? <span className="muted">#{index + 1}</span> : null}
            </div>
          ) : null}
        </div>
      ))}
      {rootProps.summaryEnabled ? (
        <div className="report-page-frame">
          <div className="report-page-body">
            <div className="section">
              <div className="section-title">{rootProps.summaryTitle}</div>
              <div className="block" style={{ margin: 0 }}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{rootProps.summaryText}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PptRuntimeView({ doc }: { doc: VDoc }): JSX.Element {
  const slides = (doc.root.children ?? []).filter((node) => node.kind === "slide");
  const [activeSlideId, setActiveSlideId] = useState(slides[0]?.id);
  const activeSlide = slides.find((slide) => slide.id === activeSlideId) ?? slides[0];
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });

  useEffect(() => {
    if (!activeSlideId && slides[0]) {
      setActiveSlideId(slides[0].id);
    }
  }, [activeSlideId, slides]);

  return (
    <div className="row" style={{ height: "100%" }}>
      <div style={{ width: 200, borderRight: "1px solid var(--line)", padding: "0 8px", overflow: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between", margin: "8px 0" }}>
          <strong>页面列表</strong>
          <span className="chip">{slides.length} 页</span>
        </div>
        {slides.map((slide, index) => (
          <div key={slide.id} className={`tree-item ${activeSlide?.id === slide.id ? "active" : ""}`} onClick={() => setActiveSlideId(slide.id)}>
            <div>#{index + 1}</div>
            <div className="muted">{String((slide.props as Record<string, unknown>)?.title ?? slide.id)}</div>
          </div>
        ))}
      </div>
      <div className="canvas-wrap" style={{ flex: 1 }}>
        {activeSlide ? (
          <div className="slide runtime-slide">
            {(activeSlide.children ?? []).map((node) => {
              const layout = node.layout ?? { mode: "absolute", x: 80, y: 80, w: 220, h: 140, z: 1 };
              return (
                <div
                  key={node.id}
                  className="slide-node runtime-slide-node"
                  style={{
                    left: Number(layout.x ?? 80),
                    top: Number(layout.y ?? 80),
                    width: Number(layout.w ?? 220),
                    height: Number(layout.h ?? 140),
                    zIndex: Number(layout.z ?? 1)
                  }}
                >
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
          </div>
        ) : (
          <div className="muted">暂无页面</div>
        )}
      </div>
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
  return <div className="muted">暂未支持: {node.kind}</div>;
}

const calcDashboardRect = (
  node: VNode,
  index: number,
  wrapWidth: number,
  gridCols: number,
  rowH: number,
  gap: number
): { left: number; top: number; width: number; height: number } => {
  const layout = node.layout ?? { mode: "grid", gx: 0, gy: index * 4, gw: 6, gh: 4 };
  if (layout.mode === "absolute") {
    return {
      left: Math.round(Number(layout.x ?? 0)),
      top: Math.round(Number(layout.y ?? 0)),
      width: Math.max(180, Math.round(Number(layout.w ?? 280))),
      height: Math.max(120, Math.round(Number(layout.h ?? 220)))
    };
  }
  const gx = Number(layout.gx ?? 0);
  const gy = Number(layout.gy ?? index * 4);
  const gw = Math.max(1, Number(layout.gw ?? 6));
  const gh = Math.max(1, Number(layout.gh ?? 4));
  const cellW = (wrapWidth - gap * (gridCols + 1)) / gridCols;
  return {
    left: Math.round(gap + gx * (cellW + gap)),
    top: Math.round(gap + gy * (rowH + gap)),
    width: Math.round(gw * cellW + (gw - 1) * gap),
    height: Math.round(gh * rowH + (gh - 1) * gap)
  };
};

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
    showPageNumber: raw.showPageNumber ?? true
  };
};
