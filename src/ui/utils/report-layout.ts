import type { VNode } from "../../core/doc/types";

export interface ReportGridItem {
  node: VNode;
  gx: number;
  gw: number;
  height: number;
  order: number;
}

export interface ReportGridRow {
  key: string;
  gy: number;
  items: ReportGridItem[];
  maxHeight: number;
}

const REPORT_GRID_COLS = 12;

const clampInt = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
};

const parseNumber = (value: unknown): number | undefined => {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return undefined;
  }
  return next;
};

const estimateTextHeight = (node: VNode): number => {
  const text = String((node.props as Record<string, unknown> | undefined)?.text ?? "");
  const lines = Math.max(2, Math.min(10, Math.ceil(text.length / 30)));
  return 72 + lines * 20;
};

const resolveBlockHeight = (node: VNode): number => {
  const layout = node.layout;
  const explicitHeight = parseNumber(layout?.h);
  if (explicitHeight !== undefined && explicitHeight >= 80) {
    return Math.round(explicitHeight);
  }
  const gridHeight = parseNumber(layout?.gh);
  if (gridHeight !== undefined && gridHeight >= 1) {
    return Math.round(gridHeight * 84);
  }
  if (node.kind === "chart" || node.kind === "table") {
    return 312;
  }
  if (node.kind === "text") {
    return estimateTextHeight(node);
  }
  return 180;
};

interface Placement {
  gy: number;
  gx: number;
  gw: number;
  height: number;
}

const resolvePlacement = (node: VNode, fallbackGy: number): { placement: Placement; nextFallbackGy: number } => {
  const layout = node.layout;
  const height = resolveBlockHeight(node);
  if (layout?.mode === "grid") {
    const gy = clampInt(parseNumber(layout.gy) ?? fallbackGy, 0, 9999);
    const gx = clampInt(parseNumber(layout.gx) ?? 0, 0, REPORT_GRID_COLS - 1);
    const maxGw = REPORT_GRID_COLS - gx;
    const gw = clampInt(parseNumber(layout.gw) ?? maxGw, 1, maxGw);
    const rowSpan = Math.max(1, Math.floor(parseNumber(layout.gh) ?? 1));
    return {
      placement: { gy, gx, gw, height },
      nextFallbackGy: Math.max(fallbackGy, gy + rowSpan)
    };
  }
  return {
    placement: { gy: fallbackGy, gx: 0, gw: REPORT_GRID_COLS, height },
    nextFallbackGy: fallbackGy + 1
  };
};

export const buildReportGridRows = (blocks: VNode[]): ReportGridRow[] => {
  const rowMap = new Map<number, ReportGridRow>();
  let fallbackGy = 0;

  blocks.forEach((node, index) => {
    const { placement, nextFallbackGy } = resolvePlacement(node, fallbackGy);
    fallbackGy = nextFallbackGy;
    const existing = rowMap.get(placement.gy);
    const item: ReportGridItem = {
      node,
      gx: placement.gx,
      gw: placement.gw,
      height: placement.height,
      order: index
    };
    if (!existing) {
      rowMap.set(placement.gy, {
        key: `gy_${placement.gy}`,
        gy: placement.gy,
        items: [item],
        maxHeight: placement.height
      });
      return;
    }
    existing.items.push(item);
    existing.maxHeight = Math.max(existing.maxHeight, placement.height);
  });

  return [...rowMap.values()]
    .sort((a, b) => a.gy - b.gy)
    .map((row) => ({
      ...row,
      items: [...row.items].sort((a, b) => (a.gx === b.gx ? a.order - b.order : a.gx - b.gx))
    }));
};

