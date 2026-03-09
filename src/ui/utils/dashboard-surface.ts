import type {
  AssetRef,
  DashboardDisplayMode,
  DashboardProps,
  ImageProps,
  VDoc,
  VNode
} from "../../core/doc/types";
import type { GridRect } from "./dashboard-grid";

export interface DashboardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NormalizedDashboardProps extends Required<
  Pick<
    DashboardProps,
    | "dashTitle"
    | "displayMode"
    | "designWidthPx"
    | "designHeightPx"
    | "pageWidthPx"
    | "pageMarginPx"
    | "gridCols"
    | "rowH"
    | "gap"
    | "showFilterBar"
    | "headerShow"
    | "headerText"
    | "footerShow"
    | "footerText"
  >
> {
  bgMode?: DashboardProps["bgMode"];
  bgAssetId?: string;
}

export interface DashboardSurfaceMetrics extends NormalizedDashboardProps {
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
}

export type DashboardSurfaceScaleMode = "contain" | "width";

const clampPositive = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) {
    return num;
  }
  return fallback;
};

export const normalizeDashboardProps = (doc: VDoc): NormalizedDashboardProps => {
  const raw = (doc.root.props ?? {}) as DashboardProps;
  const dashTitle = raw.dashTitle ?? doc.title ?? "Dashboard";
  const displayMode: DashboardDisplayMode = raw.displayMode === "scroll_page" ? "scroll_page" : "fit_screen";
  const designWidthPx = clampPositive(raw.designWidthPx, displayMode === "fit_screen" ? 1920 : 1440);
  const designHeightPx = clampPositive(raw.designHeightPx, displayMode === "fit_screen" ? 1080 : 960);
  return {
    dashTitle,
    displayMode,
    designWidthPx,
    designHeightPx,
    pageWidthPx: clampPositive(raw.pageWidthPx, displayMode === "fit_screen" ? 1280 : 1280),
    pageMarginPx: clampPositive(raw.pageMarginPx, 24),
    gridCols: Math.max(1, clampPositive(raw.gridCols, 12)),
    rowH: Math.max(16, clampPositive(raw.rowH, displayMode === "fit_screen" ? 56 : 44)),
    gap: Math.max(0, clampPositive(raw.gap, 16)),
    bgMode: raw.bgMode,
    bgAssetId: raw.bgAssetId,
    showFilterBar: raw.showFilterBar !== false,
    headerShow: raw.headerShow !== false,
    headerText: raw.headerText ?? dashTitle,
    footerShow: Boolean(raw.footerShow),
    footerText: raw.footerText ?? "Visual Document OS"
  };
};

const resolveGridCellWidth = (metrics: Pick<DashboardSurfaceMetrics, "canvasWidth" | "pageMarginPx" | "gridCols" | "gap">): number => {
  const usableWidth = Math.max(240, metrics.canvasWidth - metrics.pageMarginPx * 2 - metrics.gap * (metrics.gridCols - 1));
  return usableWidth / metrics.gridCols;
};

export const resolveDashboardNodeRect = (node: VNode, metrics: DashboardSurfaceMetrics): DashboardRect => {
  const layout = node.layout ?? { mode: "grid", gx: 0, gy: 0, gw: 6, gh: 6 };
  if (layout.mode === "absolute") {
    return {
      left: Math.round(Number(layout.x ?? 0)),
      top: Math.round(Number(layout.y ?? 0)),
      width: Math.max(120, Math.round(Number(layout.w ?? 320))),
      height: Math.max(80, Math.round(Number(layout.h ?? 220)))
    };
  }
  const cellW = resolveGridCellWidth(metrics);
  const gx = Math.max(0, Number(layout.gx ?? 0));
  const gy = Math.max(0, Number(layout.gy ?? 0));
  const gw = Math.max(1, Number(layout.gw ?? 6));
  const gh = Math.max(1, Number(layout.gh ?? 6));
  return {
    left: Math.round(metrics.pageMarginPx + gx * (cellW + metrics.gap)),
    top: Math.round(metrics.pageMarginPx + gy * (metrics.rowH + metrics.gap)),
    width: Math.round(gw * cellW + Math.max(0, gw - 1) * metrics.gap),
    height: Math.round(gh * metrics.rowH + Math.max(0, gh - 1) * metrics.gap)
  };
};

export const resolveDashboardContentHeight = (nodes: VNode[], metrics: Omit<DashboardSurfaceMetrics, "canvasHeight" | "scale">): number => {
  const bottom = nodes.reduce((acc, node) => {
    const rect = resolveDashboardNodeRect(node, { ...metrics, canvasHeight: metrics.designHeightPx, scale: 1 });
    return Math.max(acc, rect.top + rect.height);
  }, metrics.pageMarginPx * 2);
  return Math.max(metrics.designHeightPx, Math.ceil(bottom + metrics.pageMarginPx));
};

export const resolveDashboardSurfaceMetrics = ({
  doc,
  containerWidth,
  containerHeight,
  scaleMode = "contain"
}: {
  doc: VDoc;
  containerWidth: number;
  containerHeight: number;
  scaleMode?: DashboardSurfaceScaleMode;
}): DashboardSurfaceMetrics => {
  const props = normalizeDashboardProps(doc);
  const canvasWidth = props.displayMode === "fit_screen" ? props.designWidthPx : props.pageWidthPx;
  const contentHeight = resolveDashboardContentHeight(doc.root.children ?? [], {
    ...props,
    canvasWidth
  });
  const canvasHeight = props.displayMode === "fit_screen" ? Math.max(props.designHeightPx, contentHeight) : contentHeight;
  const safeWidth = Math.max(320, containerWidth || canvasWidth);
  const safeHeight = Math.max(240, containerHeight || canvasHeight);
  const scale =
    props.displayMode === "fit_screen"
      ? Math.max(
          0.2,
          scaleMode === "width" ? safeWidth / canvasWidth : Math.min(safeWidth / canvasWidth, safeHeight / canvasHeight)
        )
      : 1;
  return {
    ...props,
    canvasWidth,
    canvasHeight,
    scale
  };
};

export const resolveGridRectFromCanvasRect = (rect: DashboardRect, metrics: DashboardSurfaceMetrics): GridRect => {
  const cellW = resolveGridCellWidth(metrics);
  const gx = Math.max(0, Math.round((rect.left - metrics.pageMarginPx) / (cellW + metrics.gap)));
  const gy = Math.max(0, Math.round((rect.top - metrics.pageMarginPx) / (metrics.rowH + metrics.gap)));
  const gw = Math.max(2, Math.round((rect.width + metrics.gap) / (cellW + metrics.gap)));
  const gh = Math.max(2, Math.round((rect.height + metrics.gap) / (metrics.rowH + metrics.gap)));
  return {
    mode: "grid",
    gx: Math.min(metrics.gridCols - Math.min(metrics.gridCols, gw), gx),
    gy,
    gw: Math.min(metrics.gridCols, gw),
    gh
  };
};

export const resolveNextFloatingRect = (
  nodes: VNode[],
  metrics: DashboardSurfaceMetrics,
  baseWidth: number,
  baseHeight: number
): DashboardRect => {
  const floatingNodes = nodes.filter((node) => node.layout?.mode === "absolute");
  if (floatingNodes.length === 0) {
    return {
      left: metrics.pageMarginPx,
      top: metrics.pageMarginPx,
      width: baseWidth,
      height: baseHeight
    };
  }
  const nextLeft = Math.min(
    metrics.canvasWidth - metrics.pageMarginPx - baseWidth,
    Math.max(
      metrics.pageMarginPx,
      ...floatingNodes.map((node) => {
        const rect = resolveDashboardNodeRect(node, metrics);
        return rect.left + 28;
      })
    )
  );
  const nextTop = Math.min(
    metrics.canvasHeight - metrics.pageMarginPx - baseHeight,
    Math.max(
      metrics.pageMarginPx,
      ...floatingNodes.map((node) => {
        const rect = resolveDashboardNodeRect(node, metrics);
        return rect.top + 28;
      })
    )
  );
  return {
    left: Math.round(nextLeft),
    top: Math.round(nextTop),
    width: Math.round(baseWidth),
    height: Math.round(baseHeight)
  };
};

export const resolveImageAsset = (doc: VDoc, assetId: string | undefined): AssetRef | undefined =>
  (doc.assets ?? []).find((asset) => asset.assetId === assetId && asset.type === "image");

export const resolveImageNodeTitle = (doc: VDoc, node: VNode): string => {
  const props = (node.props ?? {}) as ImageProps;
  const asset = resolveImageAsset(doc, props.assetId);
  return props.title ?? asset?.name ?? node.name ?? "图片";
};
