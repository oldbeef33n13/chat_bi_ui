import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { createDashboardDoc, createPptDoc, createReportDoc } from "../../core/doc/defaults";
import { flattenReportSections, getTopReportSections } from "./report-sections";
import {
  resolveDashboardPrefetchNodes,
  resolvePptPrefetchNodes,
  resolveReportPrefetchNodes,
} from "./data-fetch-strategy";

describe("data fetch strategy", () => {
  it("collects all dashboard chart nodes for first screen prefetch", () => {
    const doc = createDashboardDoc();

    const nodes = resolveDashboardPrefetchNodes(doc);

    expect(nodes).toHaveLength(2);
    expect(nodes.every((node) => node.kind === "chart" || node.kind === "table")).toBe(true);
  });

  it("prefetches the first later ppt slide that actually carries data", () => {
    const doc = createPptDoc();
    const firstSlide = (doc.root.children ?? [])[0];
    const introSlide = {
      id: "slide_prefetch_intro",
      kind: "slide" as const,
      props: { title: "说明页" },
      layout: { mode: "absolute" as const, x: 0, y: 0, w: 960, h: 540 },
      children: [
        {
          id: "text_prefetch_intro",
          kind: "text" as const,
          layout: { mode: "absolute" as const, x: 40, y: 96, w: 420, h: 120, z: 1 },
          props: { text: "说明页", format: "plain" },
        },
      ],
    };
    const secondSlide = {
      id: "slide_prefetch_next",
      kind: "slide" as const,
      props: { title: "第三页" },
      layout: { mode: "absolute" as const, x: 0, y: 0, w: 960, h: 540 },
      children: [
        {
          id: "chart_prefetch_next",
          kind: "chart" as const,
          layout: { mode: "absolute" as const, x: 40, y: 96, w: 420, h: 240, z: 1 },
          data: { endpointId: "ops_alarm_trend" },
          props: {
            titleText: "下一页趋势",
            chartType: "line",
            bindings: [
              { role: "x", field: "ts" },
              { role: "y", field: "critical", agg: "sum" },
            ],
          },
        },
      ],
    };
    if (firstSlide) {
      firstSlide.children = [
        {
          id: "text_prefetch_cover",
          kind: "text",
          layout: { mode: "absolute", x: 40, y: 40, w: 420, h: 120, z: 1 },
          props: { text: "封面页", format: "plain" },
        },
      ];
    }
    doc.root.children = [firstSlide!, introSlide, secondSlide];

    const nodes = resolvePptPrefetchNodes(doc, firstSlide?.id, 1);

    expect(nodes.map((node) => node.id)).toContain("chart_prefetch_next");
  });

  it("prefetches the first later report section that actually carries data", () => {
    const doc = createReportDoc();
    const sections = getTopReportSections(doc.root);
    const flatSections = flattenReportSections(sections);
    const firstChart = flatSections[0]!.blocks.find((node) => node.kind === "chart");
    flatSections[0]!.blocks = flatSections[0]!.blocks.filter((node) => node.id !== firstChart?.id);
    flatSections[1]!.blocks = flatSections[1]!.blocks.filter((node) => node.kind !== "chart" && node.kind !== "table");
    flatSections[1]!.blocks.push({
      id: "text_prefetch_followup",
      kind: "text",
      props: { text: "第二章说明", format: "plain" },
    });
    flatSections.push({
      section: {
        id: "section_prefetch_third",
        kind: "section",
        props: { title: "3. 趋势页" },
      } as VNode,
      title: "3. 趋势页",
      orderLabel: "3",
      level: 1,
      blocks: [
        {
          id: "table_prefetch_followup",
          kind: "table",
          props: {
            titleText: "后续表格",
            columns: [{ key: "day", title: "日期" }],
          },
          data: { sourceId: "ds_alarm", queryId: "q_alarm_trend" },
        },
      ],
    });

    const nodes = resolveReportPrefetchNodes(flatSections, [], 1);

    expect(nodes.map((node) => node.id)).not.toContain(firstChart?.id);
    expect(nodes.map((node) => node.id)).toContain("table_prefetch_followup");
  });

  it("still keeps visible data-bearing report sections and one later data-bearing section", () => {
    const doc = createReportDoc();
    const sections = getTopReportSections(doc.root);
    const flatSections = flattenReportSections(sections);
    flatSections[1]!.blocks.push({
      id: "table_prefetch_followup",
      kind: "table",
      props: {
        titleText: "后续表格",
        columns: [{ key: "day", title: "日期" }],
      },
      data: { sourceId: "ds_alarm", queryId: "q_alarm_trend" },
    });

    const nodes = resolveReportPrefetchNodes(flatSections, [], 1);

    expect(nodes.map((node) => node.id)).toContain(flatSections[0]!.blocks.find((node) => node.kind === "chart")!.id);
    expect(nodes.map((node) => node.id)).toContain("table_prefetch_followup");
  });
});
