import type { CSSProperties } from "react";
import type { FloatingLayerArgs } from "../components/FloatingLayer";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const resolveSideInsertPanelStyle = ({ anchorRect, viewportWidth, viewportHeight }: FloatingLayerArgs): CSSProperties => {
  const pad = 12;
  const width = Math.min(276, Math.max(220, anchorRect.width - 24), viewportWidth - pad * 2);
  const left = clamp(anchorRect.left + 12, pad, viewportWidth - width - pad);
  const top = clamp(anchorRect.top + 10, pad, Math.max(pad, viewportHeight - 240));
  const height = Math.max(220, Math.min(anchorRect.height - 20, viewportHeight - top - pad));
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
    zIndex: 3600
  };
};
