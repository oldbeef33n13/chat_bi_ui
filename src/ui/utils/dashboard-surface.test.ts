import { describe, expect, it } from "vitest";
import { createDashboardDoc } from "../../core/doc/defaults";
import { resolveDashboardSurfaceMetrics } from "./dashboard-surface";

describe("dashboard-surface", () => {
  it("keeps fit-screen editor scaling bound to width when content grows taller", () => {
    const doc = createDashboardDoc("wallboard");
    const firstChart = doc.root.children?.[0];
    if (!firstChart?.layout || firstChart.layout.mode !== "grid") {
      throw new Error("expected default dashboard chart");
    }
    firstChart.layout = {
      ...firstChart.layout,
      gh: 24
    };

    const containMetrics = resolveDashboardSurfaceMetrics({
      doc,
      containerWidth: 960,
      containerHeight: 540
    });
    const widthMetrics = resolveDashboardSurfaceMetrics({
      doc,
      containerWidth: 960,
      containerHeight: 540,
      scaleMode: "width"
    });

    expect(widthMetrics.scale).toBeCloseTo(0.5, 3);
    expect(containMetrics.scale).toBeLessThan(widthMetrics.scale);
    expect(widthMetrics.canvasHeight).toBeGreaterThan(widthMetrics.designHeightPx);
  });
});
