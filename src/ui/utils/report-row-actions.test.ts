import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { createReportDoc, defaultChartSpec } from "../../core/doc/defaults";
import {
  buildReportBlockInsertBetweenRowsPlan,
  buildReportRowAddChartPlan,
  buildReportRowLayoutPresetPlan,
  buildReportRowMovePlan,
  buildReportRowReorderPlan,
  buildReportRowSwapOrder,
  buildReportRowSwapPlan,
  listReportRowLayoutPresets
} from "./report-row-actions";

const makeGridNode = (id: string, kind: VNode["kind"], gx: number, gy: number, gw: number): VNode => ({
  id,
  kind,
  layout: { mode: "grid", gx, gy, gw, gh: 4 },
  props: kind === "chart" ? defaultChartSpec(id) : { text: id, format: "plain" }
});

const createRowActionDoc = () => {
  const doc = createReportDoc();
  const section = doc.root.children?.[0];
  if (!section) {
    throw new Error("missing section");
  }
  section.children = [
    makeGridNode("chart_left", "chart", 0, 0, 6),
    makeGridNode("chart_right", "chart", 6, 0, 6),
    makeGridNode("text_story", "text", 0, 1, 12)
  ];
  return { doc, sectionId: section.id };
};

describe("report row actions", () => {
  it("lists row layout presets by item count", () => {
    expect(listReportRowLayoutPresets(1).map((item) => item.id)).toEqual(["single"]);
    expect(listReportRowLayoutPresets(2).map((item) => item.id)).toEqual(["two_equal", "two_wide_left", "two_wide_right"]);
    expect(listReportRowLayoutPresets(3).map((item) => item.id)).toEqual(["three_equal"]);
  });

  it("builds add-chart plan and auto distributes the row", () => {
    const doc = createReportDoc();
    const section = doc.root.children?.[0];
    if (!section) {
      throw new Error("missing section");
    }
    section.children = [
      makeGridNode("chart_single", "chart", 0, 0, 12),
      makeGridNode("text_follow", "text", 0, 1, 12)
    ];

    const plan = buildReportRowAddChartPlan(doc, section.id, "gy_0");

    expect(plan).not.toBeNull();
    expect(plan?.semanticAction.action).toBe("insert_block");
    const updateLayoutCommands = plan?.commands.filter((command) => command.type === "UpdateLayout") ?? [];
    const insertCommand = plan?.commands.find((command) => command.type === "InsertNode");

    expect(updateLayoutCommands).toHaveLength(1);
    expect(updateLayoutCommands[0]?.layout?.gw).toBe(6);
    expect(insertCommand?.index).toBe(1);
    expect(insertCommand?.node?.kind).toBe("chart");
    expect(insertCommand?.node?.layout?.gx).toBe(6);
    expect(insertCommand?.node?.layout?.gw).toBe(6);
  });

  it("builds row layout preset plan for a two-column row", () => {
    const { doc, sectionId } = createRowActionDoc();

    const plan = buildReportRowLayoutPresetPlan(doc, sectionId, "gy_0", "two_wide_left");

    expect(plan).not.toBeNull();
    expect(plan?.semanticAction.action).toBe("apply_layout_preset");
    const byNodeId = new Map((plan?.commands ?? []).map((command) => [command.nodeId, command.layout]));
    expect(byNodeId.get("chart_left")?.gx).toBe(0);
    expect(byNodeId.get("chart_left")?.gw).toBe(7);
    expect(byNodeId.get("chart_right")?.gx).toBe(7);
    expect(byNodeId.get("chart_right")?.gw).toBe(5);
  });

  it("builds swap plan for a multi-block row", () => {
    const { doc, sectionId } = createRowActionDoc();

    const plan = buildReportRowSwapPlan(doc, sectionId, "gy_0");

    expect(plan).not.toBeNull();
    expect(plan?.semanticAction.action).toBe("swap_row_blocks");
    const byNodeId = new Map((plan?.commands ?? []).map((command) => [command.nodeId, command.layout]));
    expect(byNodeId.get("chart_left")?.gx).toBe(6);
    expect(byNodeId.get("chart_right")?.gx).toBe(0);
  });

  it("builds drag reorder plan by swapping dragged and target slots", () => {
    const { doc, sectionId } = createRowActionDoc();

    const previewOrder = buildReportRowSwapOrder(
      {
        key: "gy_0",
        gy: 0,
        maxHeight: 300,
        items: [
          { node: makeGridNode("chart_left", "chart", 0, 0, 6), gx: 0, gw: 6, height: 280, order: 0 },
          { node: makeGridNode("chart_right", "chart", 6, 0, 6), gx: 6, gw: 6, height: 280, order: 1 }
        ]
      },
      "chart_left",
      "chart_right"
    );
    expect(previewOrder).toEqual(["chart_right", "chart_left"]);

    const plan = buildReportRowReorderPlan(doc, sectionId, "gy_0", "chart_left", "chart_right");

    expect(plan).not.toBeNull();
    expect(plan?.semanticAction.action).toBe("move_block");
    const byNodeId = new Map((plan?.commands ?? []).map((command) => [command.nodeId, command.layout]));
    expect(byNodeId.get("chart_left")?.gx).toBe(6);
    expect(byNodeId.get("chart_right")?.gx).toBe(0);
  });

  it("builds move plan and swaps row gy with the adjacent row", () => {
    const { doc, sectionId } = createRowActionDoc();

    const plan = buildReportRowMovePlan(doc, sectionId, "gy_0", "down");

    expect(plan).not.toBeNull();
    expect(plan?.semanticAction.action).toBe("reorder_section");
    const byNodeId = new Map((plan?.commands ?? []).map((command) => [command.nodeId, command.layout]));
    expect(byNodeId.get("chart_left")?.gy).toBe(1);
    expect(byNodeId.get("chart_right")?.gy).toBe(1);
    expect(byNodeId.get("text_story")?.gy).toBe(0);
  });

  it("builds cross-row insert plan and compacts the source row", () => {
    const { doc, sectionId } = createRowActionDoc();

    const plan = buildReportBlockInsertBetweenRowsPlan(doc, sectionId, "chart_left", "gy_1", "after");

    expect(plan).not.toBeNull();
    expect(plan?.semanticAction.action).toBe("move_block");
    const byNodeId = new Map((plan?.commands ?? []).map((command) => [command.nodeId, command.layout]));
    expect(byNodeId.get("chart_right")?.gy).toBe(0);
    expect(byNodeId.get("chart_right")?.gw).toBe(12);
    expect(byNodeId.has("text_story")).toBe(false);
    expect(byNodeId.get("chart_left")?.gy).toBe(2);
    expect(byNodeId.get("chart_left")?.gx).toBe(0);
    expect(byNodeId.get("chart_left")?.gw).toBe(12);
  });
});
