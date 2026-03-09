import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { cloneNodeWithNewIds, findAncestorByKind, findNodeById, resolveAncestorIdByKind } from "./node-tree";

const sampleTree: VNode = {
  id: "root",
  kind: "root",
  children: [
    {
      id: "section_1",
      kind: "section",
      props: { title: "章节 1" },
      children: [
        {
          id: "chart_1",
          kind: "chart",
          props: { chartType: "line", bindings: [] }
        }
      ]
    },
    {
      id: "slide_1",
      kind: "slide",
      props: { title: "页面 1" },
      children: [
        {
          id: "text_1",
          kind: "text",
          props: { text: "hello", format: "plain" }
        }
      ]
    }
  ]
};

describe("node-tree utils", () => {
  it("finds node and ancestor by id", () => {
    expect(findNodeById(sampleTree, "chart_1")?.kind).toBe("chart");
    expect(findAncestorByKind(sampleTree, "chart_1", "section")?.id).toBe("section_1");
    expect(resolveAncestorIdByKind(sampleTree, "text_1", "slide")).toBe("slide_1");
  });

  it("clones subtree with regenerated ids", () => {
    const slide = findNodeById(sampleTree, "slide_1");
    expect(slide).toBeTruthy();
    const clone = cloneNodeWithNewIds(slide!);
    expect(clone.id).not.toBe("slide_1");
    expect(clone.children?.[0]?.id).not.toBe("text_1");
    expect(clone.kind).toBe("slide");
    expect(clone.children?.[0]?.kind).toBe("text");
  });
});
