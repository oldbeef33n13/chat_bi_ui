import { describe, expect, it } from "vitest";
import { resolveGridConflict, type GridNodeState, type GridRect } from "./dashboard-grid";

const grid = (gx: number, gy: number, gw: number, gh: number): GridRect => ({
  mode: "grid",
  gx,
  gy,
  gw,
  gh
});

describe("resolveGridConflict", () => {
  it("swaps when one collision and previous slot is reusable", () => {
    const nodes: GridNodeState[] = [
      { id: "a", lock: false, layout: grid(0, 0, 4, 4) },
      { id: "b", lock: false, layout: grid(4, 0, 4, 4) },
      { id: "c", lock: false, layout: grid(8, 0, 4, 4) }
    ];

    const result = resolveGridConflict(nodes, "a", grid(4, 0, 4, 4), grid(0, 0, 4, 4), 12, "move");

    expect(result.strategy).toBe("swap");
    const updateA = result.commands.find((cmd) => cmd.type === "UpdateLayout" && cmd.nodeId === "a");
    const updateB = result.commands.find((cmd) => cmd.type === "UpdateLayout" && cmd.nodeId === "b");
    expect(updateA).toMatchObject({ type: "UpdateLayout", nodeId: "a", layout: { gx: 4, gy: 0 } });
    expect(updateB).toMatchObject({ type: "UpdateLayout", nodeId: "b", layout: { gx: 0, gy: 0 } });
  });

  it("pushes collided nodes on resize", () => {
    const nodes: GridNodeState[] = [
      { id: "a", lock: false, layout: grid(0, 0, 4, 4) },
      { id: "b", lock: false, layout: grid(4, 0, 4, 4) },
      { id: "c", lock: false, layout: grid(8, 0, 4, 4) }
    ];

    const result = resolveGridConflict(nodes, "a", grid(0, 0, 8, 4), grid(0, 0, 4, 4), 12, "resize");

    expect(result.strategy).toBe("push");
    const updateB = result.commands.find((cmd) => cmd.type === "UpdateLayout" && cmd.nodeId === "b");
    expect(updateB).toBeDefined();
    expect((updateB?.layout as Record<string, unknown>).gy).toBeGreaterThan(0);
  });

  it("keeps locked collision target unchanged and relocates active node", () => {
    const nodes: GridNodeState[] = [
      { id: "a", lock: false, layout: grid(0, 0, 4, 4) },
      { id: "b", lock: true, layout: grid(4, 0, 4, 4) },
      { id: "c", lock: false, layout: grid(8, 0, 4, 4) }
    ];

    const result = resolveGridConflict(nodes, "a", grid(4, 0, 4, 4), grid(0, 0, 4, 4), 12, "move");

    const updateLocked = result.commands.find((cmd) => cmd.type === "UpdateLayout" && cmd.nodeId === "b");
    const updateActive = result.commands.find((cmd) => cmd.type === "UpdateLayout" && cmd.nodeId === "a");
    expect(updateLocked).toBeUndefined();
    expect(updateActive).toBeDefined();
    expect((updateActive?.layout as Record<string, unknown>).gy).toBeGreaterThan(0);
  });
});
