import { describe, expect, it } from "vitest";
import { createPptDoc } from "../../core/doc/defaults";
import { buildDuplicateNodesPlan } from "./duplicate-nodes";

describe("duplicate-nodes", () => {
  it("duplicates sibling nodes with regenerated ids and transformed layout", () => {
    const doc = createPptDoc();
    const slide = doc.root.children?.[0];
    const chart = slide?.children?.find((node) => node.kind === "chart");
    if (!slide || !chart) {
      throw new Error("missing slide chart");
    }

    const plan = buildDuplicateNodesPlan(doc.root, slide.id, [chart.id], (layout) => ({
      ...layout,
      x: Number(layout.x ?? 0) + 36,
      y: Number(layout.y ?? 0) + 24
    }));

    expect(plan?.commands).toHaveLength(1);
    expect(plan?.clonedNodes[0]?.id).not.toBe(chart.id);
    expect(plan?.clonedNodes[0]?.layout?.x).toBe(Number(chart.layout?.x ?? 0) + 36);
    expect(plan?.clonedNodes[0]?.layout?.y).toBe(Number(chart.layout?.y ?? 0) + 24);
  });
});
