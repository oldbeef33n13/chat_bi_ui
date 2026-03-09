import { describe, expect, it } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createReportDoc, defaultChartSpec } from "../../core/doc/defaults";
import {
  buildReportCanvasAutoTidyPlan,
  buildReportCanvasDuplicatePlan,
  buildReportCanvasMovePlan,
  buildReportCanvasResizePlan,
  buildReportCanvasSelectionDuplicatePlan,
  buildReportCanvasSelectionMovePlan,
  buildReportSectionCanvasProjection,
  resolveReportCanvasInsertAnchor,
  resolveReportCanvasSnapPreview
} from "./report-canvas";

const createCanvasDoc = (): VDoc => {
  const doc = createReportDoc();
  doc.dataSources = [
    {
      id: "ds_alarm",
      type: "static",
      staticData: [
        { day: "Mon", alarm_count: 12 },
        { day: "Tue", alarm_count: 16 }
      ]
    }
  ];
  doc.queries = [{ queryId: "q_alarm", sourceId: "ds_alarm", kind: "static" }];
  const firstSection = doc.root.children?.[0];
  if (!firstSection) {
    throw new Error("missing first section");
  }
  firstSection.children = [
    {
      id: "chart_left",
      kind: "chart",
      layout: { mode: "grid", gx: 0, gy: 0, gw: 6, gh: 4 },
      data: { sourceId: "ds_alarm", queryId: "q_alarm" },
      props: defaultChartSpec("左图")
    },
    {
      id: "chart_right",
      kind: "chart",
      layout: { mode: "grid", gx: 6, gy: 0, gw: 6, gh: 4 },
      data: { sourceId: "ds_alarm", queryId: "q_alarm" },
      props: defaultChartSpec("右图")
    },
    {
      id: "text_story",
      kind: "text",
      layout: { mode: "grid", gx: 0, gy: 1, gw: 12, gh: 3 },
      props: { text: "这里是说明文字。", format: "plain" }
    }
  ];
  return doc;
};

describe("report-canvas", () => {
  it("projects section blocks into canvas pages", () => {
    const doc = createCanvasDoc();
    const section = doc.root.children?.[0];
    if (!section) {
      throw new Error("missing section");
    }
    const projection = buildReportSectionCanvasProjection(section.children ?? [], {
      pageHeightPx: 260
    });
    expect(projection.blocks).toHaveLength(3);
    expect(projection.pages.length).toBeGreaterThanOrEqual(2);
    expect(projection.blocks[0]).toMatchObject({
      node: { id: "chart_left" },
      pageIndex: 0,
      gx: 0,
      gw: 6
    });
    expect(projection.blocks[2]?.pageIndex).toBeGreaterThanOrEqual(1);
  });

  it("resolves canvas insert anchor by click height", () => {
    const doc = createCanvasDoc();
    const section = doc.root.children?.[0];
    if (!section) {
      throw new Error("missing section");
    }
    const projection = buildReportSectionCanvasProjection(section.children ?? []);
    expect(resolveReportCanvasInsertAnchor(projection, 12)).toEqual({ kind: "section-start" });
    expect(resolveReportCanvasInsertAnchor(projection, projection.rows[1]!.stackTop + 20)).toEqual({ kind: "after-row", rowKey: "gy_1" });
  });

  it("builds a move plan for dragging a canvas block", () => {
    const doc = createCanvasDoc();
    const sectionId = doc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section");
    }
    const plan = buildReportCanvasMovePlan(doc, sectionId, "chart_left", {
      left: 460,
      top: 12,
      width: 450,
      height: 312
    });
    expect(plan?.semanticAction.action).toBe("move_block_on_canvas");
    expect(plan?.commands.some((command) => command.type === "UpdateLayout" && command.nodeId === "chart_left")).toBe(true);
  });

  it("builds a resize plan for stretching a canvas block", () => {
    const doc = createCanvasDoc();
    const sectionId = doc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section");
    }
    const plan = buildReportCanvasResizePlan(doc, sectionId, "chart_left", {
      left: 24,
      top: 0,
      width: 700,
      height: 420
    });
    const update = plan?.commands.find((command) => command.type === "UpdateLayout" && command.nodeId === "chart_left");
    expect(plan?.semanticAction.action).toBe("resize_block_on_canvas");
    expect((update?.layout as Record<string, unknown> | undefined)?.gw).toBeGreaterThan(6);
  });

  it("builds a duplicate plan for copying a canvas block to a new position", () => {
    const doc = createCanvasDoc();
    const sectionId = doc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section");
    }
    const plan = buildReportCanvasDuplicatePlan(doc, sectionId, "chart_left", {
      left: 468,
      top: 16,
      width: 450,
      height: 312
    });
    expect(plan?.semanticAction.action).toBe("duplicate_block_on_canvas");
    expect(plan?.commands).toHaveLength(1);
    expect(plan?.primaryNodeId).toBeTruthy();
    expect((plan?.commands[0]?.node as Record<string, unknown> | undefined)?.id).not.toBe("chart_left");
    expect(((plan?.commands[0]?.node as { layout?: Record<string, unknown> } | undefined)?.layout?.gx as number | undefined) ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("builds a grouped move plan for dragging multiple canvas blocks", () => {
    const doc = createCanvasDoc();
    const sectionId = doc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section");
    }
    const plan = buildReportCanvasSelectionMovePlan(
      doc,
      sectionId,
      ["chart_left", "chart_right"],
      "chart_left",
      {
        left: 24,
        top: 360,
        width: 450,
        height: 312
      }
    );
    const leftUpdate = plan?.commands.find((command) => command.type === "UpdateLayout" && command.nodeId === "chart_left");
    const rightUpdate = plan?.commands.find((command) => command.type === "UpdateLayout" && command.nodeId === "chart_right");
    expect(plan?.semanticAction.action).toBe("move_block_on_canvas");
    expect(plan?.selectedNodeIds).toEqual(["chart_left", "chart_right"]);
    expect((leftUpdate?.layout as Record<string, unknown> | undefined)?.gy).toBeGreaterThan(0);
    expect((rightUpdate?.layout as Record<string, unknown> | undefined)?.gy).toBeGreaterThan(0);
  });

  it("builds a grouped duplicate plan for duplicating multiple canvas blocks", () => {
    const doc = createCanvasDoc();
    const sectionId = doc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section");
    }
    const plan = buildReportCanvasSelectionDuplicatePlan(
      doc,
      sectionId,
      ["chart_left", "chart_right"],
      "chart_left",
      {
        left: 24,
        top: 360,
        width: 450,
        height: 312
      }
    );
    expect(plan?.semanticAction.action).toBe("duplicate_block_on_canvas");
    expect(plan?.commands).toHaveLength(2);
    expect(plan?.selectedNodeIds).toHaveLength(2);
  });

  it("snaps canvas preview to nearby guides", () => {
    const doc = createCanvasDoc();
    const section = doc.root.children?.[0];
    if (!section) {
      throw new Error("missing section");
    }
    const projection = buildReportSectionCanvasProjection(section.children ?? []);
    const chartRight = projection.blocks.find((block) => block.node.id === "chart_right");
    if (!chartRight) {
      throw new Error("missing chart_right");
    }
    const snapped = resolveReportCanvasSnapPreview(projection, "chart_left", {
      left: chartRight.left + 5,
      top: chartRight.stackTop,
      width: chartRight.width,
      height: chartRight.height
    });
    expect(snapped.draft.left).toBe(chartRight.left);
    expect(snapped.guides.some((guide) => guide.orientation === "vertical")).toBe(true);
  });

  it("builds an auto tidy plan that compacts row gaps", () => {
    const doc = createCanvasDoc();
    const section = doc.root.children?.[0];
    if (!section) {
      throw new Error("missing section");
    }
    const chartRight = section.children?.find((node) => node.id === "chart_right");
    if (!chartRight?.layout) {
      throw new Error("missing chart_right layout");
    }
    chartRight.layout.gy = 3;
    const plan = buildReportCanvasAutoTidyPlan(doc, section.id);
    const update = plan?.commands.find((command) => command.nodeId === "chart_right");
    expect(plan?.semanticAction.action).toBe("auto_tidy_section");
    expect((update?.layout as Record<string, unknown> | undefined)?.gy).toBe(2);
  });
});
