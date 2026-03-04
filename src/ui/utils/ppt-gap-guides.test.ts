import { describe, expect, it } from "vitest";
import type { Command, VNode } from "../../core/doc/types";
import { buildGapGuides } from "./ppt-gap-guides";

/** 构造绝对定位节点。 */
const absNode = (id: string, x: number, y: number, w: number, h: number): VNode => ({
  id,
  kind: "text",
  layout: { mode: "absolute", x, y, w, h },
  props: { text: id }
});

/** PPT 等距分布辅助线测试。 */
describe("buildGapGuides", () => {
  /** 分布后应产出两条间距标注线。 */
  it("builds horizontal gap guides after distribute update", () => {
    const nodes: VNode[] = [absNode("a", 0, 0, 100, 80), absNode("b", 150, 0, 100, 80), absNode("c", 300, 0, 100, 80)];
    const commands: Command[] = [
      { type: "UpdateLayout", nodeId: "a", layout: { x: 0 } },
      { type: "UpdateLayout", nodeId: "b", layout: { x: 220 } },
      { type: "UpdateLayout", nodeId: "c", layout: { x: 440 } }
    ];

    const guides = buildGapGuides(nodes, ["a", "b", "c"], commands, "hdistribute");

    expect(guides).toHaveLength(2);
    expect(guides[0]?.label).toBe("120px");
    expect(guides[1]?.label).toBe("120px");
  });

  /** 选中元素少于 3 个时不生成间距辅助线。 */
  it("returns empty guides when selected nodes < 3", () => {
    const nodes: VNode[] = [absNode("a", 0, 0, 100, 80), absNode("b", 220, 0, 100, 80)];
    const guides = buildGapGuides(nodes, ["a", "b"], [], "hdistribute");
    expect(guides).toEqual([]);
  });
});
