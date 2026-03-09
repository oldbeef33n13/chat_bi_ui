import { describe, expect, it } from "vitest";
import { createReportDoc } from "../../core/doc/defaults";
import { buildReportInsertPresetPlan } from "./report-insert";

describe("report insert preset plan", () => {
  it("builds section-start single chart plan and shifts existing rows", () => {
    const doc = createReportDoc();
    const sectionId = doc.root.children?.[0]?.id ?? "";

    const plan = buildReportInsertPresetPlan(doc, sectionId, { kind: "section-start" }, "chart_single");

    expect(plan).not.toBeNull();
    expect(plan?.preset.id).toBe("chart_single");
    expect(plan?.semanticAction.action).toBe("insert_row_template");
    expect(plan?.semanticAction.target.anchorId).toBe(`${sectionId}:section-start`);

    const updateLayoutCommands = plan?.commands.filter((command) => command.type === "UpdateLayout") ?? [];
    const insertCommands = plan?.commands.filter((command) => command.type === "InsertNode") ?? [];

    expect(updateLayoutCommands).toHaveLength(2);
    expect(insertCommands).toHaveLength(1);
    expect(updateLayoutCommands[0]?.layout?.gy).toBe(1);
    expect(updateLayoutCommands[1]?.layout?.gy).toBe(2);
    expect(insertCommands[0]?.index).toBe(0);
    expect(insertCommands[0]?.node?.layout?.gy).toBe(0);
    expect(insertCommands[0]?.node?.layout?.gw).toBe(12);
  });

  it("builds after-row compare plan and inserts nodes between existing rows", () => {
    const doc = createReportDoc();
    const sectionId = doc.root.children?.[0]?.id ?? "";

    const plan = buildReportInsertPresetPlan(doc, sectionId, { kind: "after-row", rowKey: "gy_0" }, "chart_compare");

    expect(plan).not.toBeNull();
    const updateLayoutCommands = plan?.commands.filter((command) => command.type === "UpdateLayout") ?? [];
    const insertCommands = plan?.commands.filter((command) => command.type === "InsertNode") ?? [];

    expect(updateLayoutCommands).toHaveLength(1);
    expect(updateLayoutCommands[0]?.layout?.gy).toBe(2);
    expect(insertCommands).toHaveLength(2);
    expect(insertCommands[0]?.index).toBe(1);
    expect(insertCommands[1]?.index).toBe(2);
    expect(insertCommands[0]?.node?.layout?.gy).toBe(1);
    expect(insertCommands[1]?.node?.layout?.gy).toBe(1);
    expect(insertCommands[0]?.node?.layout?.gw).toBe(6);
    expect(insertCommands[1]?.node?.layout?.gx).toBe(6);
  });

  it("builds section-end plan for empty section without shifting", () => {
    const doc = createReportDoc();
    const emptySection = {
      id: "section_empty",
      kind: "section",
      props: { title: "空章节" },
      children: []
    };
    doc.root.children = [emptySection];

    const plan = buildReportInsertPresetPlan(doc, emptySection.id, { kind: "section-end" }, "chart_text_story");

    expect(plan).not.toBeNull();
    const updateLayoutCommands = plan?.commands.filter((command) => command.type === "UpdateLayout") ?? [];
    const insertCommands = plan?.commands.filter((command) => command.type === "InsertNode") ?? [];

    expect(updateLayoutCommands).toHaveLength(0);
    expect(insertCommands).toHaveLength(2);
    expect(insertCommands[0]?.index).toBe(0);
    expect(insertCommands[0]?.node?.layout?.gy).toBe(0);
    expect(insertCommands[1]?.node?.kind).toBe("text");
  });
});
