import { describe, expect, it } from "vitest";
import { resolveGridConflict, type GridNodeState, type GridRect } from "./dashboard-grid";

/** 构造网格布局节点。 */
const grid = (gx: number, gy: number, gw: number, gh: number): GridRect => ({
  mode: "grid",
  gx,
  gy,
  gw,
  gh
});

/** Dashboard 网格冲突算法测试（swap/push/lock）。 */
describe("resolveGridConflict", () => {
  /** 单碰撞且可复用旧位时，优先换位。 */
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

  /** resize 扩张碰撞时，应推动受影响节点下移。 */
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

  /** 碰撞到锁定节点时，应保持锁定节点不动并重定位活动节点。 */
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
