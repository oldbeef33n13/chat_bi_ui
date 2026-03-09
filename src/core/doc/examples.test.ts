import { describe, expect, it } from "vitest";
import { createBuiltInDoc, listBuiltInDocExamples } from "./examples";
import type { DataSourceDef, FilterDef, VDoc } from "./types";

const findDataSource = (doc: VDoc, id: string): DataSourceDef | undefined =>
  (doc.dataSources ?? []).find((item) => item.id === id);

const findFilter = (doc: VDoc, id: string): FilterDef | undefined => (doc.filters ?? []).find((item) => item.filterId === id);

const countChartsInSection = (doc: VDoc, sectionTitle: string): number => {
  const sections = doc.root.children ?? [];
  const section = sections.find((node) => node.kind === "section" && String((node.props as { title?: string })?.title ?? "") === sectionTitle);
  if (!section?.children) {
    return 0;
  }
  return section.children.filter((node) => node.kind === "chart").length;
};

const hasHorizontalGridInSection = (doc: VDoc, sectionTitle: string): boolean => {
  const sections = doc.root.children ?? [];
  const section = sections.find((node) => node.kind === "section" && String((node.props as { title?: string })?.title ?? "") === sectionTitle);
  if (!section?.children) {
    return false;
  }
  return section.children.some(
    (node) =>
      node.kind === "chart" &&
      node.layout?.mode === "grid" &&
      Number(node.layout?.gw ?? 12) < 12
  );
};

describe("built-in doc examples", () => {
  it("keeps dashboard.capacity rich enough for region comparison", () => {
    const doc = createBuiltInDoc("dashboard", "dashboard.capacity");
    const ds = findDataSource(doc, "ds_capacity");
    expect(ds?.type).toBe("static");
    const rows = (ds?.staticData as Array<Record<string, unknown>>) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(20);
    const regionSet = new Set(rows.map((row) => String(row.region ?? "")));
    const daySet = new Set(rows.map((row) => String(row.day ?? "")));
    expect(regionSet.size).toBeGreaterThanOrEqual(4);
    expect(daySet.size).toBeGreaterThanOrEqual(7);

    const regionFilter = findFilter(doc, "f_region");
    expect(regionFilter?.defaultValue).toBe("");
  });

  it("contains rich built-in examples for dashboard/report/ppt", () => {
    const dashboardIds = listBuiltInDocExamples("dashboard").map((item) => item.id);
    const reportIds = listBuiltInDocExamples("report").map((item) => item.id);
    const pptIds = listBuiltInDocExamples("ppt").map((item) => item.id);

    expect(dashboardIds).toContain("dashboard.command.center");
    expect(reportIds).toContain("report.ops.table.playbook");
    expect(reportIds).toContain("report.ops.multi.chapter");
    expect(reportIds).toContain("report.ops.subchapter.multichart");
    expect(pptIds).toContain("ppt.ops.table.story");
  });

  it("provides report demos with multi-chart chapter and subchapter layouts", () => {
    const chapterDoc = createBuiltInDoc("report", "report.ops.multi.chapter");
    const subchapterDoc = createBuiltInDoc("report", "report.ops.subchapter.multichart");

    expect(countChartsInSection(chapterDoc, "1. 总览（同章节多图）")).toBeGreaterThanOrEqual(3);
    expect(countChartsInSection(chapterDoc, "2. 质量诊断（同章节四图）")).toBeGreaterThanOrEqual(4);
    expect(countChartsInSection(subchapterDoc, "2.1 区域健康分解")).toBeGreaterThanOrEqual(2);
    expect(countChartsInSection(subchapterDoc, "2.2 告警结构与收敛")).toBeGreaterThanOrEqual(3);
    expect(countChartsInSection(subchapterDoc, "2.3 处置效率与SLA")).toBeGreaterThanOrEqual(3);
    expect(hasHorizontalGridInSection(chapterDoc, "1. 总览（同章节多图）")).toBe(true);
    expect(hasHorizontalGridInSection(subchapterDoc, "2.1 区域健康分解")).toBe(true);
  });
});
