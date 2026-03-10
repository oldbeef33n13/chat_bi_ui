import type { CSSProperties } from "react";
import type { ChartSpec, TableSpec, VDoc, VNode, VStyle } from "../../core/doc/types";

export interface ColorPalettePreset {
  id: string;
  label: string;
  colors: string[];
}

export const COLOR_SWATCH_PRESETS = [
  "#0f172a",
  "#1d4ed8",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#7c3aed",
  "#0ea5e9",
  "#14b8a6",
  "#64748b",
  "#ffffff",
  "#111827",
  "#f8fafc"
] as const;

export const COLOR_PALETTE_PRESETS: ColorPalettePreset[] = [
  {
    id: "tech-light",
    label: "科技浅色",
    colors: ["#1d4ed8", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"]
  },
  {
    id: "tech-dark",
    label: "科技深色",
    colors: ["#60a5fa", "#38bdf8", "#4ade80", "#fbbf24", "#f87171", "#a78bfa"]
  },
  {
    id: "ops-wallboard",
    label: "运维大屏",
    colors: ["#22d3ee", "#60a5fa", "#34d399", "#fbbf24", "#fb7185", "#c084fc"]
  },
  {
    id: "business",
    label: "业务分析",
    colors: ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#9333ea", "#0891b2"]
  }
];

export type TextStylePresetId = "title" | "body" | "note";

export const TEXT_STYLE_PRESETS: Array<{ id: TextStylePresetId; label: string; style: VStyle }> = [
  {
    id: "title",
    label: "标题",
    style: {
      fontSize: 24,
      bold: true,
      italic: false,
      underline: false,
      fg: "#0f172a",
      align: "left",
      valign: "middle",
      lineHeight: 1.35,
      letterSpacing: 0
    }
  },
  {
    id: "body",
    label: "正文",
    style: {
      fontSize: 16,
      bold: false,
      italic: false,
      underline: false,
      fg: "#111827",
      align: "left",
      valign: "top",
      lineHeight: 1.6,
      letterSpacing: 0
    }
  },
  {
    id: "note",
    label: "注释",
    style: {
      fontSize: 12,
      bold: false,
      italic: true,
      underline: false,
      fg: "#64748b",
      align: "left",
      valign: "top",
      lineHeight: 1.45,
      letterSpacing: 0
    }
  }
];

const clamp = (value: number | undefined, min: number, max: number): number | undefined => {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  return Math.min(max, Math.max(min, value));
};

const toCssSpacing = (value: VStyle["pad"] | VStyle["mar"]): string | number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value) && value.length === 4) {
    return value.map((item) => `${item}px`).join(" ");
  }
  return undefined;
};

const toHexColor = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3})$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return undefined;
};

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = toHexColor(hex) ?? "#000000";
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const parseRgbColor = (value: string): [number, number, number] | undefined => {
  const match = value.trim().match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[0-9.]+)?\)$/i);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

export const normalizeColorValue = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const normalizeHexColor = (value: string | undefined, fallback = "#2563eb"): string => {
  const normalized = value ? toHexColor(value) : undefined;
  return normalized ?? fallback;
};

export const applyColorOpacity = (color: string | undefined, alpha: number | undefined): string | undefined => {
  const normalized = normalizeColorValue(color);
  if (!normalized) {
    return undefined;
  }
  const safeAlpha = clamp(alpha, 0, 1);
  if (safeAlpha === undefined || safeAlpha >= 0.999) {
    return normalized;
  }
  const hex = toHexColor(normalized);
  if (hex) {
    return hexToRgba(hex, safeAlpha);
  }
  const rgb = parseRgbColor(normalized);
  if (rgb) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${safeAlpha})`;
  }
  return normalized;
};

export const cleanNodeStyle = (style: VStyle | undefined): VStyle | undefined => {
  if (!style) {
    return undefined;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      continue;
    }
    next[key] = value;
  }
  return Object.keys(next).length > 0 ? (next as VStyle) : undefined;
};

export const applyTextStylePreset = (current: VStyle | undefined, presetId: TextStylePresetId): VStyle => {
  const preset = TEXT_STYLE_PRESETS.find((item) => item.id === presetId)?.style ?? TEXT_STYLE_PRESETS[0]!.style;
  return {
    ...current,
    ...preset
  };
};

export const mergeTextStyles = (...styles: Array<VStyle | undefined>): VStyle | undefined => {
  const merged = styles.reduce<Record<string, unknown>>((result, item) => {
    if (!item) {
      return result;
    }
    return { ...result, ...item };
  }, {});
  return cleanNodeStyle(merged as VStyle);
};

export const resolveNodeSurfaceStyle = (style: VStyle | undefined, extra?: CSSProperties): CSSProperties => ({
  boxSizing: "border-box",
  backgroundColor: applyColorOpacity(style?.bg, style?.bgOpacity),
  color: normalizeColorValue(style?.fg),
  borderStyle: style?.borderW && style.borderW > 0 ? "solid" : undefined,
  borderWidth: style?.borderW,
  borderColor: normalizeColorValue(style?.borderC),
  borderRadius: style?.radius,
  boxShadow: normalizeColorValue(style?.shadow),
  padding: toCssSpacing(style?.pad),
  margin: toCssSpacing(style?.mar),
  opacity: clamp(style?.opacity, 0, 1),
  ...extra
});

export const resolveTextContainerStyle = (style: VStyle | undefined, extra?: CSSProperties): CSSProperties => ({
  ...resolveNodeSurfaceStyle(style, extra),
  display: "flex",
  alignItems: style?.valign === "top" ? "flex-start" : style?.valign === "bottom" ? "flex-end" : "center",
  overflow: "auto"
});

export const resolveTextContentStyle = (style: VStyle | undefined, extra?: CSSProperties): CSSProperties => ({
  margin: 0,
  width: style?.writingMode === "vertical-rl" ? "auto" : "100%",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: normalizeColorValue(style?.font),
  fontSize: style?.fontSize,
  fontWeight: style?.bold ? 700 : undefined,
  fontStyle: style?.italic ? "italic" : undefined,
  textDecoration: style?.underline ? "underline" : undefined,
  textAlign: style?.align,
  lineHeight: style?.lineHeight,
  letterSpacing: style?.letterSpacing !== undefined ? `${style.letterSpacing}px` : undefined,
  color: normalizeColorValue(style?.fg),
  writingMode: style?.writingMode ?? "horizontal-tb",
  textOrientation: style?.writingMode === "vertical-rl" ? ("mixed" as CSSProperties["textOrientation"]) : undefined,
  ...extra
});

export const resolveNodeTitleStyle = (node: VNode): VStyle | undefined => {
  if (node.kind === "chart") {
    return ((node.props as ChartSpec | undefined)?.titleStyle ?? undefined) as VStyle | undefined;
  }
  if (node.kind === "table") {
    return ((node.props as TableSpec | undefined)?.titleStyle ?? undefined) as VStyle | undefined;
  }
  return undefined;
};

const hasInlineNodeTitle = (node: VNode): boolean => {
  if (node.kind === "chart") {
    return String((node.props as ChartSpec | undefined)?.titleText ?? "").trim().length > 0;
  }
  if (node.kind === "table") {
    return String((node.props as TableSpec | undefined)?.titleText ?? "").trim().length > 0;
  }
  return false;
};

export const shouldRenderOuterNodeTitle = (node: VNode): boolean => {
  if (node.kind === "text") {
    return false;
  }
  if ((node.kind === "chart" || node.kind === "table") && hasInlineNodeTitle(node)) {
    return false;
  }
  return true;
};

export const resolveNodeDisplayTitle = (node: VNode): string => {
  if (node.kind === "chart") {
    const title = String((node.props as ChartSpec | undefined)?.titleText ?? "").trim();
    const fallbackName = String(node.name ?? "").trim();
    return title || fallbackName || "图表";
  }
  if (node.kind === "table") {
    const title = String((node.props as TableSpec | undefined)?.titleText ?? "").trim();
    const fallbackName = String(node.name ?? "").trim();
    return title || fallbackName || "表格";
  }
  return String(node.name ?? node.id).trim() || String(node.id ?? "");
};

export const resolveTitleTextStyle = (defaults: VStyle | undefined, override: VStyle | undefined, extra?: CSSProperties): CSSProperties =>
  resolveTextContentStyle(mergeTextStyles(defaults, override), extra);

export const isRemoteDataNode = (doc: VDoc, node: VNode): boolean => {
  if (node.data?.endpointId) {
    return true;
  }
  const sourceId = node.data?.sourceId ?? doc.dataSources?.[0]?.id;
  const source = sourceId ? doc.dataSources?.find((item) => item.id === sourceId) : undefined;
  return source?.type === "remote";
};
