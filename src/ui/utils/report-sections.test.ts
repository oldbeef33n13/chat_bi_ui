import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { flattenReportSections, getSectionBlocks, getSubsections, getTopReportSections } from "./report-sections";

const root: VNode = {
  id: "root",
  kind: "container",
  children: [
    {
      id: "sec_1",
      kind: "section",
      props: { title: "总览" },
      children: [
        { id: "sub_1", kind: "section", props: { title: "趋势" }, children: [{ id: "chart_1", kind: "chart", props: { chartType: "line", bindings: [] } }] },
        { id: "text_1", kind: "text", props: { text: "note", format: "plain" } }
      ]
    },
    {
      id: "sec_2",
      kind: "section",
      props: { title: "质量" },
      children: [{ id: "table_1", kind: "table", props: { columns: [] } }]
    }
  ]
};

describe("report-sections utils", () => {
  it("extracts top section/subsection/block correctly", () => {
    const top = getTopReportSections(root);
    expect(top).toHaveLength(2);
    expect(getSubsections(top[0]!).map((item) => item.id)).toEqual(["sub_1"]);
    expect(getSectionBlocks(top[0]!).map((item) => item.id)).toEqual(["text_1"]);
  });

  it("flattens two-level sections with order labels", () => {
    const flat = flattenReportSections(getTopReportSections(root));
    expect(flat.map((item) => `${item.orderLabel}:${item.section.id}`)).toEqual(["1:sec_1", "1.1:sub_1", "2:sec_2"]);
    expect(flat[1]!.level).toBe(2);
    expect(flat[1]!.parentId).toBe("sec_1");
  });
});
