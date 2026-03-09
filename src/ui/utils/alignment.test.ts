import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { buildAlignCommandResult, buildAlignCommands, buildAlignToContainerCommandResult } from "./alignment";

const rootWithChildren = (children: VNode[]): VNode => ({
  id: "root",
  kind: "root",
  children
});

describe("buildAlignCommands", () => {
  it("supports left align for grid nodes", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "grid", gx: 1, gy: 0, gw: 4, gh: 4 } },
      { id: "b", kind: "chart", layout: { mode: "grid", gx: 6, gy: 1, gw: 4, gh: 4 } }
    ]);
    const commands = buildAlignCommands(root, ["a", "b"], "left");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: "UpdateLayout", nodeId: "b", layout: { gx: 1 } });
  });

  it("supports horizontal distribute for grid nodes", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "grid", gx: 0, gy: 0, gw: 2, gh: 3 } },
      { id: "b", kind: "chart", layout: { mode: "grid", gx: 4, gy: 0, gw: 2, gh: 3 } },
      { id: "c", kind: "chart", layout: { mode: "grid", gx: 10, gy: 0, gw: 2, gh: 3 } }
    ]);
    const commands = buildAlignCommands(root, ["a", "b", "c"], "hdistribute");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: "UpdateLayout", nodeId: "b", layout: { gx: 5 } });
  });

  it("returns empty commands when selection mixes layout mode", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "grid", gx: 0, gy: 0, gw: 4, gh: 4 } },
      { id: "b", kind: "chart", layout: { mode: "absolute", x: 200, y: 0, w: 120, h: 80 } }
    ]);
    const commands = buildAlignCommands(root, ["a", "b"], "left");
    expect(commands).toEqual([]);
  });

  it("returns precise reason for distribute with only two elements", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "grid", gx: 0, gy: 0, gw: 2, gh: 3 } },
      { id: "b", kind: "chart", layout: { mode: "grid", gx: 4, gy: 0, gw: 2, gh: 3 } }
    ]);
    const result = buildAlignCommandResult(root, ["a", "b"], "hdistribute");
    expect(result.commands).toEqual([]);
    expect(result.reason).toBe("need_three_for_distribute");
  });

  it("returns no_change when opposite align does not change layout", () => {
    const root = rootWithChildren([
      { id: "a", kind: "chart", layout: { mode: "grid", gx: 1, gy: 0, gw: 4, gh: 4 } },
      { id: "b", kind: "chart", layout: { mode: "grid", gx: 1, gy: 1, gw: 4, gh: 4 } }
    ]);
    const result = buildAlignCommandResult(root, ["a", "b"], "right");
    expect(result.commands).toEqual([]);
    expect(result.reason).toBe("no_change");
  });

  it("supports align to container right for absolute nodes", () => {
    const root: VNode = {
      id: "root",
      kind: "container",
      layout: { mode: "absolute", x: 0, y: 0, w: 100, h: 80 },
      children: [{ id: "a", kind: "chart", layout: { mode: "absolute", x: 10, y: 10, w: 20, h: 20 } }]
    };
    const result = buildAlignToContainerCommandResult(root, ["a"], "right");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({ type: "UpdateLayout", nodeId: "a", layout: { x: 80 } });
  });

  it("returns mixed_scope when container align selection crosses parents", () => {
    const root: VNode = {
      id: "root",
      kind: "container",
      children: [
        { id: "p1", kind: "container", layout: { mode: "absolute", x: 0, y: 0, w: 100, h: 80 }, children: [{ id: "a", kind: "chart", layout: { mode: "absolute", x: 10, y: 10, w: 20, h: 20 } }] },
        { id: "p2", kind: "container", layout: { mode: "absolute", x: 0, y: 0, w: 100, h: 80 }, children: [{ id: "b", kind: "chart", layout: { mode: "absolute", x: 10, y: 10, w: 20, h: 20 } }] }
      ]
    };
    const result = buildAlignToContainerCommandResult(root, ["a", "b"], "left");
    expect(result.commands).toEqual([]);
    expect(result.reason).toBe("mixed_scope");
  });
});
