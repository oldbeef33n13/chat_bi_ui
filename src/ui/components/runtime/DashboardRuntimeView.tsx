import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardProps, VDoc } from "../../../core/doc/types";
import { useDataEngine } from "../../hooks/use-data-engine";
import { useNodeDataPrefetch } from "../../hooks/use-node-data-prefetch";
import { resolveDashboardNodeRect, resolveDashboardSurfaceMetrics, resolveImageNodeTitle } from "../../utils/dashboard-surface";
import { resolveDashboardPrefetchNodes } from "../../utils/data-fetch-strategy";
import type { PresentationRuntimeSettings } from "../../utils/presentation-settings";
import { resolveNodeDisplayTitle } from "../../utils/node-style";
import {
  renderDashboardCardHeader,
  resolveDashboardBackgroundStyle,
  resolveNodeSurfaceStyle,
  resolveTitleTextStyle,
  RuntimeNodeContent
} from "./shared";
import type { RuntimeSelectionTarget } from "./runtime-selection";

export function DashboardRuntimeView({
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
  const root = doc.root;
  const rootProps = (root.props ?? {}) as DashboardProps;
  const children = root.children ?? [];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const prefetchNodes = useMemo(() => resolveDashboardPrefetchNodes(doc), [doc]);
  const metrics = resolveDashboardSurfaceMetrics({
    doc,
    containerWidth: viewportSize.width,
    containerHeight: viewportSize.height,
    scaleMode: immersive && presentationSettings?.fitMode === "fill" ? "width" : "contain"
  });
  const backgroundStyle = resolveDashboardBackgroundStyle(doc);

  useNodeDataPrefetch(doc, prefetchNodes, engine, dataVersion, "dashboard runtime");

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
          <span className="chip" style={resolveTitleTextStyle({ fontSize: 13, bold: true }, rootProps.titleStyle)}>
            {metrics.dashTitle}
          </span>
          <span className="chip">运行态预览</span>
        </div>
      ) : null}
      {metrics.headerShow ? <div className="dashboard-global-header" style={resolveTitleTextStyle({ fontSize: 16, bold: true }, rootProps.headerStyle)}>{metrics.headerText}</div> : null}
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
              ...backgroundStyle,
              transform: `scale(${metrics.scale})`,
              transformOrigin: "top left"
            }}
          >
            {children.map((node) => {
              const rect = resolveDashboardNodeRect(node, metrics);
              return (
                <div
                  key={node.id}
                  className={`dash-card runtime-card runtime-selectable ${selectedNodeId === node.id ? "is-runtime-selected" : ""} ${
                    node.kind === "text" ? "dash-card-text" : ""
                  }`}
                  data-testid={`runtime-dashboard-node-${node.id}`}
                  style={resolveNodeSurfaceStyle(node.style, { left: rect.left, top: rect.top, width: rect.width, height: rect.height })}
                  onClick={() =>
                    onSelectTarget?.({
                      nodeId: node.id,
                      objectKind: node.kind,
                      objectLabel: node.kind === "image" ? resolveImageNodeTitle(doc, node) : resolveNodeDisplayTitle(node)
                    })
                  }
                >
                  {renderDashboardCardHeader(doc, node, engine, dataVersion)}
                  <div className="card-body" style={{ height: "100%" }}>
                    <RuntimeNodeContent doc={doc} node={node} engine={engine} dataVersion={dataVersion} height="100%" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {metrics.footerShow ? <div className="dashboard-global-footer" style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, rootProps.footerStyle)}>{metrics.footerText}</div> : null}
    </div>
  );
}
