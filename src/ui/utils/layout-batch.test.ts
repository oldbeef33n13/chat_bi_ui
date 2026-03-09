import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { buildLayoutBatchCommands, planLayoutBatchTargets } from "./layout-batch";

const rootWithChildren = (children: VNode[]): VNode => ({
  id: "root",
  kind: "root",
  children
});

describe("buildLayoutBatchCommands", () => {
  it("equal width for absolute nodes uses primary node width", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "absolute", x: 0, y: 0, w: 320, h: 120 } },
      { id: "b", kind: "chart", layout: { mode: "absolute", x: 360, y: 0, w: 180, h: 120 } }
    ]);
    const result = buildLayoutBatchCommands(root, ["a", "b"], "equalWidth", "a");
    expect(result.reason).toBeUndefined();
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({ type: "UpdateLayout", nodeId: "b", layout: { w: 320 } });
  });

  it("equal height for grid nodes uses primary node height", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "grid", gx: 0, gy: 0, gw: 4, gh: 6 } },
      { id: "b", kind: "chart", layout: { mode: "grid", gx: 5, gy: 0, gw: 4, gh: 3 } }
    ]);
    const result = buildLayoutBatchCommands(root, ["a", "b"], "equalHeight", "a");
    expect(result.reason).toBeUndefined();
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({ type: "UpdateLayout", nodeId: "b", layout: { gh: 6 } });
  });

  it("supports horizontal distribute for absolute nodes", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "absolute", x: 0, y: 0, w: 100, h: 100 } },
      { id: "b", kind: "chart", layout: { mode: "absolute", x: 180, y: 0, w: 100, h: 100 } },
      { id: "c", kind: "chart", layout: { mode: "absolute", x: 400, y: 0, w: 100, h: 100 } }
    ]);
    const result = buildLayoutBatchCommands(root, ["a", "b", "c"], "hdistribute", "a");
    expect(result.reason).toBeUndefined();
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({ type: "UpdateLayout", nodeId: "b", layout: { x: 200 } });
  });

  it("returns reason when mixed layout mode selected", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "absolute", x: 0, y: 0, w: 120, h: 120 } },
      { id: "b", kind: "chart", layout: { mode: "grid", gx: 0, gy: 0, gw: 4, gh: 4 } }
    ]);
    const result = buildLayoutBatchCommands(root, ["a", "b"], "equalWidth", "a");
    expect(result.commands).toEqual([]);
    expect(result.reason).toContain("相同布局模式");
  });
});

describe("planLayoutBatchTargets", () => {
  it("auto expands to sibling nodes when current selection is insufficient", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "absolute", x: 0, y: 0, w: 120, h: 100 } },
      { id: "b", kind: "chart", layout: { mode: "absolute", x: 180, y: 0, w: 120, h: 100 } },
      { id: "c", kind: "chart", layout: { mode: "absolute", x: 360, y: 0, w: 120, h: 100 } }
    ]);
    const plan = planLayoutBatchTargets(root, "a", ["a"], "hdistribute");
    expect(plan.autoExpanded).toBe(true);
    expect(plan.targetIds).toEqual(["a", "b", "c"]);
  });

  it("keeps current selection when already executable", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "absolute", x: 0, y: 0, w: 120, h: 100 } },
      { id: "b", kind: "chart", layout: { mode: "absolute", x: 180, y: 0, w: 120, h: 100 } }
    ]);
    const plan = planLayoutBatchTargets(root, "a", ["a", "b"], "equalWidth");
    expect(plan.autoExpanded).toBe(false);
    expect(plan.targetIds).toEqual(["a", "b"]);
  });
});
