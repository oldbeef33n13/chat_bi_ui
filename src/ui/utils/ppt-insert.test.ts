import { describe, expect, it } from "vitest";
import { createPptDoc } from "../../core/doc/defaults";
import {
  buildPptInsertNode,
  getPptInsertItem,
  resolvePptInsertGroups,
  resolvePptRecentInsertItems,
  resolvePptRecommendedItems
} from "./ppt-insert";

describe("ppt insert helpers", () => {
  it("resolves recent ppt insert items in order and skips unknown ids", () => {
    const items = resolvePptRecentInsertItems(["chart.line", "missing.item", "table.basic", "chart.line"]);

    expect(items.map((item) => item.id)).toEqual(["chart.line", "table.basic"]);
  });

  it("recommends missing content for the active slide", () => {
    const doc = createPptDoc();
    const items = resolvePptRecommendedItems({
      slide: doc.root.children?.[0]
    });

    expect(items.map((item) => item.id)).toEqual(["table.basic", "chart.combo", "table.multi-header", "text.note"]);
  });

  it("prioritizes title and core content on an empty slide", () => {
    const doc = createPptDoc();
    const slide = doc.root.children?.[0];
    if (!slide) {
      throw new Error("missing slide");
    }
    slide.children = [];

    const items = resolvePptRecommendedItems({
      slide,
      recentItemIds: ["text.title"]
    });

    expect(items.map((item) => item.id)).toEqual(["chart.line", "chart.bar", "text.body", "table.basic"]);
  });

  it("prepends recent and recommended groups ahead of category groups", () => {
    const doc = createPptDoc();
    const slide = doc.root.children?.[0];

    const groups = resolvePptInsertGroups({
      slide,
      recentItemIds: ["chart.bar", "text.note"]
    });

    expect(groups.slice(0, 2).map((group) => group.id)).toEqual(["recent", "recommended"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["chart.bar", "text.note"]);
    expect(groups[1]?.items.map((item) => item.id)).not.toContain("chart.bar");
    expect(groups[1]?.items.map((item) => item.id)).not.toContain("text.note");
  });

  it("builds absolute ppt nodes with clamped placement", () => {
    const doc = createPptDoc();
    const slide = doc.root.children?.[0];
    const item = getPptInsertItem("chart.bar");
    if (!slide || !item) {
      throw new Error("missing slide or insert item");
    }

    const node = buildPptInsertNode({
      doc,
      slide,
      item,
      point: { x: 940, y: 520 }
    });

    expect(node.kind).toBe("chart");
    expect(node.layout).toMatchObject({
      mode: "absolute",
      x: 510,
      y: 260,
      w: 430,
      h: 260
    });
  });
});
