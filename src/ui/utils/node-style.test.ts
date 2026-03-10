import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { resolveNodeDisplayTitle, shouldRenderOuterNodeTitle } from "./node-style";

describe("node-style title helpers", () => {
  it("suppresses outer titles for chart and table when intrinsic titles exist", () => {
    const chartNode: VNode = {
      id: "chart_1",
      kind: "chart",
      props: { titleText: "告警趋势" }
    };
    const tableNode: VNode = {
      id: "table_1",
      kind: "table",
      props: { titleText: "明细表" }
    };

    expect(shouldRenderOuterNodeTitle(chartNode)).toBe(false);
    expect(shouldRenderOuterNodeTitle(tableNode)).toBe(false);
    expect(resolveNodeDisplayTitle(chartNode)).toBe("告警趋势");
    expect(resolveNodeDisplayTitle(tableNode)).toBe("明细表");
  });

  it("keeps outer titles for untitled non-text nodes and falls back to semantic labels", () => {
    const untitledChart: VNode = {
      id: "chart_2",
      kind: "chart",
      props: {},
      name: ""
    };
    const imageNode: VNode = {
      id: "image_1",
      kind: "image",
      name: "网络拓扑图",
      props: {}
    };
    const textNode: VNode = {
      id: "text_1",
      kind: "text",
      props: { text: "hello" }
    };

    expect(shouldRenderOuterNodeTitle(untitledChart)).toBe(true);
    expect(resolveNodeDisplayTitle(untitledChart)).toBe("图表");
    expect(shouldRenderOuterNodeTitle(imageNode)).toBe(true);
    expect(resolveNodeDisplayTitle(imageNode)).toBe("网络拓扑图");
    expect(shouldRenderOuterNodeTitle(textNode)).toBe(false);
  });
});
