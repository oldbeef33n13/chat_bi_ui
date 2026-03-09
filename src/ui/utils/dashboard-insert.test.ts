import { describe, expect, it } from "vitest";
import { createDashboardDoc } from "../../core/doc/defaults";
import {
  resolveDashboardInsertGroups,
  resolveDashboardRecentInsertItems,
  resolveDashboardRecommendedItems
} from "./dashboard-insert";

describe("dashboard insert helpers", () => {
  it("resolves recent dashboard insert items in order and skips unknown ids", () => {
    const items = resolveDashboardRecentInsertItems(["chart.line", "missing.item", "table.basic", "chart.line"]);

    expect(items.map((item) => item.id)).toEqual(["chart.line", "table.basic"]);
  });

  it("recommends fit-screen dashboard components from missing content", () => {
    const doc = createDashboardDoc("wallboard");

    const items = resolveDashboardRecommendedItems({ doc });

    expect(items.map((item) => item.id)).toEqual(["text.title", "table.basic", "media.image", "chart.gauge"]);
  });

  it("recommends scroll-page dashboard components and avoids recent duplicates", () => {
    const doc = createDashboardDoc("workbench");
    doc.root.children = [];

    const items = resolveDashboardRecommendedItems({
      doc,
      recentItemIds: ["text.title"]
    });

    expect(items.map((item) => item.id)).toEqual(["chart.line", "table.basic", "chart.combo", "text.note"]);
  });

  it("prepends recent and recommended groups ahead of category groups", () => {
    const doc = createDashboardDoc("workbench");
    doc.root.children = [];

    const groups = resolveDashboardInsertGroups({
      doc,
      recentItemIds: ["media.image", "chart.bar"]
    });

    expect(groups.slice(0, 2).map((group) => group.id)).toEqual(["recent", "recommended"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["media.image", "chart.bar"]);
    expect(groups[1]?.items.map((item) => item.id)).not.toContain("media.image");
    expect(groups[1]?.items.map((item) => item.id)).not.toContain("chart.bar");
  });
});
