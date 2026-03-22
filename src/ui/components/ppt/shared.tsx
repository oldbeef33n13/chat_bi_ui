import type { CSSProperties, ComponentPropsWithoutRef, ReactNode } from "react";
import type { DeckProps, VDoc, VNode } from "../../../core/doc/types";
import { resolveNodeSurfaceStyle, resolveTitleTextStyle } from "../../utils/node-style";

export interface NormalizedPptDeckProps {
  rootProps: DeckProps & Record<string, unknown>;
  masterShowHeader: boolean;
  masterHeaderText: string;
  masterShowFooter: boolean;
  masterFooterText: string;
  masterShowSlideNumber: boolean;
  masterAccentColor: string;
  masterPaddingXPx: number;
  masterHeaderTopPx: number;
  masterHeaderHeightPx: number;
  masterFooterBottomPx: number;
  masterFooterHeightPx: number;
}

export interface PptSlideNodeLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface PptSlideNodeStyleOverrides {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
  zIndex?: number;
  transform?: CSSProperties["transform"];
}

const DEFAULT_RUNTIME_NODE_LAYOUT: PptSlideNodeLayout = {
  x: 80,
  y: 80,
  w: 220,
  h: 140,
  z: 1
};

const joinClassNames = (...values: Array<string | false | null | undefined>): string => values.filter(Boolean).join(" ");

export const normalizePptDeckProps = (doc: Pick<VDoc, "root" | "title">): NormalizedPptDeckProps => {
  const rootProps = (doc.root.props ?? {}) as DeckProps & Record<string, unknown>;
  return {
    rootProps,
    masterShowHeader: rootProps.masterShowHeader !== false,
    masterHeaderText: String(rootProps.masterHeaderText ?? doc.title ?? ""),
    masterShowFooter: rootProps.masterShowFooter !== false,
    masterFooterText: String(rootProps.masterFooterText ?? "Visual Document OS"),
    masterShowSlideNumber: rootProps.masterShowSlideNumber !== false,
    masterAccentColor: String(rootProps.masterAccentColor ?? "#1d4ed8"),
    masterPaddingXPx: Math.max(0, Number(rootProps.masterPaddingXPx ?? 24) || 24),
    masterHeaderTopPx: Math.max(0, Number(rootProps.masterHeaderTopPx ?? 12) || 12),
    masterHeaderHeightPx: Math.max(12, Number(rootProps.masterHeaderHeightPx ?? 26) || 26),
    masterFooterBottomPx: Math.max(0, Number(rootProps.masterFooterBottomPx ?? 10) || 10),
    masterFooterHeightPx: Math.max(12, Number(rootProps.masterFooterHeightPx ?? 22) || 22)
  };
};

export const resolvePptSlideTitle = (slide: VNode): string => String((slide.props as Record<string, unknown>)?.title ?? slide.id);

export const resolvePptSlideLabel = (slide: VNode, slideIndex: number): string => `第 ${slideIndex + 1} 页 · ${resolvePptSlideTitle(slide)}`;

export const resolvePptSlideNodeLayout = (
  node: VNode,
  fallbackLayout: PptSlideNodeLayout = DEFAULT_RUNTIME_NODE_LAYOUT
): PptSlideNodeLayout => ({
  x: Number(node.layout?.x ?? fallbackLayout.x),
  y: Number(node.layout?.y ?? fallbackLayout.y),
  w: Number(node.layout?.w ?? fallbackLayout.w),
  h: Number(node.layout?.h ?? fallbackLayout.h),
  z: Number(node.layout?.z ?? fallbackLayout.z)
});

export const resolvePptSlideNodeStyle = (
  node: VNode,
  overrides?: PptSlideNodeStyleOverrides,
  fallbackLayout?: PptSlideNodeLayout
): CSSProperties => {
  const layout = resolvePptSlideNodeLayout(node, fallbackLayout);
  return resolveNodeSurfaceStyle(node.style, {
    position: "absolute",
    left: overrides?.x ?? layout.x,
    top: overrides?.y ?? layout.y,
    width: overrides?.w ?? layout.w,
    height: overrides?.h ?? layout.h,
    zIndex: overrides?.zIndex ?? overrides?.z ?? layout.z,
    transform: overrides?.transform
  });
};

export function PptSlideFrame({
  deck,
  slide,
  slideIndex,
  className,
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  deck: NormalizedPptDeckProps;
  slide: VNode;
  slideIndex: number;
  children?: ReactNode;
}): JSX.Element {
  const slideTitle = resolvePptSlideTitle(slide);
  return (
    <div className={joinClassNames("slide", className)} {...rest}>
      {deck.masterShowHeader ? (
        <div
          className="runtime-ppt-master-header"
          style={{
            borderBottomColor: deck.masterAccentColor,
            left: deck.masterPaddingXPx,
            right: deck.masterPaddingXPx,
            top: deck.masterHeaderTopPx,
            minHeight: deck.masterHeaderHeightPx
          }}
        >
          <span style={resolveTitleTextStyle({ fontSize: 13, fg: "#64748b" }, deck.rootProps.headerStyle)}>
            {deck.masterHeaderText || slideTitle}
          </span>
          <span style={resolveTitleTextStyle({ fontSize: 13, fg: "#64748b" }, deck.rootProps.headerStyle)}>{slideTitle}</span>
        </div>
      ) : null}
      {children}
      {deck.masterShowFooter ? (
        <div
          className="runtime-ppt-master-footer"
          style={{
            borderTopColor: deck.masterAccentColor,
            left: deck.masterPaddingXPx,
            right: deck.masterPaddingXPx,
            bottom: deck.masterFooterBottomPx,
            minHeight: deck.masterFooterHeightPx
          }}
        >
          <span style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, deck.rootProps.footerStyle)}>{deck.masterFooterText}</span>
          {deck.masterShowSlideNumber ? (
            <span style={resolveTitleTextStyle({ fontSize: 12, fg: "#64748b" }, deck.rootProps.footerStyle)}>{`#${slideIndex + 1}`}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
