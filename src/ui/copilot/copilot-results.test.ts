import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { createDashboardDoc, createPptDoc } from "../../core/doc/defaults";
import type { CopilotArtifactResultItem, CopilotInsightResultItem } from "./copilot-results";
import { buildArtifactFromInsight, buildDashboardArtifactApplyCommands, buildPptArtifactApplyCommands } from "./copilot-results";

const buildArtifactResult = (node: VNode, artifactKind: CopilotArtifactResultItem["artifactKind"]): CopilotArtifactResultItem => ({
  resultId: `artifact:${node.id}`,
  sceneId: "scene_demo",
  docId: "doc_demo",
  docType: artifactKind === "slide" ? "ppt" : "dashboard",
  kind: "artifact",
  title: "生成结果",
  summary: "生成结果摘要",
  createdAt: "2026-03-11T00:00:00Z",
  updatedAt: "2026-03-11T00:00:00Z",
  jobId: "job_demo",
  unitId: "unit_demo",
  artifactId: "artifact_demo",
  artifactKind,
  node,
  notes: [],
  status: "ready"
});

describe("copilot results builders", () => {
  it("builds ppt replace commands and preserves target slide title", () => {
    const doc = createPptDoc();
    const targetSlide = doc.root.children?.[0];
    expect(targetSlide?.id).toBeTruthy();

    const result = buildArtifactResult(
      {
        id: "slide_generated_1",
        kind: "slide",
        props: { title: "新页面标题", layoutTemplateId: "title-double-summary" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: []
      },
      "slide"
    );

    const plan = buildPptArtifactApplyCommands(doc, result, targetSlide!.id);
    expect(plan.appliedNodeId).toBe("slide_generated_1");
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands[0]).toMatchObject({ type: "RemoveNode", nodeId: targetSlide!.id });
    expect(plan.commands[1]).toMatchObject({ type: "InsertNode", parentId: "root", index: 0 });
    expect((plan.commands[1]?.node?.props as Record<string, unknown> | undefined)?.title).toBe(
      (targetSlide!.props as Record<string, unknown> | undefined)?.title
    );
  });

  it("builds dashboard insert commands after the selected anchor node", () => {
    const doc = createDashboardDoc();
    const anchor = doc.root.children?.[0];
    expect(anchor?.id).toBeTruthy();

    const result = buildArtifactResult(
      {
        id: "container_generated_1",
        kind: "container",
        layout: { mode: "grid", gx: 0, gy: 8, gw: 12, gh: 4 },
        props: { title: "新模块" },
        children: []
      },
      "block_region"
    );

    const plan = buildDashboardArtifactApplyCommands(doc, result, anchor!.id);
    expect(plan.appliedNodeId).toBe("container_generated_1");
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]).toMatchObject({ type: "InsertNode", parentId: "root", index: 1 });
  });

  it("builds report artifacts from analysis insights with a result table", () => {
    const insight: CopilotInsightResultItem = {
      resultId: "insight_analysis_1",
      sceneId: "scene_runtime",
      docId: "doc_report_1",
      docType: "report",
      kind: "insight",
      title: "告警趋势 - 深度分析",
      summary: "告警趋势在周一到周五整体回落，峰值集中在周一。",
      createdAt: "2026-03-11T00:00:00Z",
      updatedAt: "2026-03-11T00:00:00Z",
      sourceType: "analysis",
      scopeType: "chart",
      scopeId: "chart_1",
      headline: "告警趋势 - 深度分析",
      conclusion: "告警趋势在周一到周五整体回落，峰值集中在周一。",
      evidence: ["本次分析共执行 2 个步骤"],
      advice: ["建议继续查看峰值对象和时间分布"],
      prompt: "请继续分析这个图",
      analysisMeta: {
        analysisMode: "single_source",
        executionStatus: "succeeded",
        executedSteps: ["step_01", "step_02"],
        inputRows: 7,
        outputRows: 5,
        resultTables: [
          {
            name: "summary_table",
            columns: ["label", "value"],
            rows: [
              { label: "item_1", value: 100 },
              { label: "item_2", value: 93 }
            ],
            rowCount: 5
          }
        ]
      }
    };

    const artifact = buildArtifactFromInsight("scene_runtime", insight);
    expect(artifact.docType).toBe("report");
    expect(artifact.node.kind).toBe("section");
    expect(artifact.node.children?.some((node) => node.kind === "table")).toBe(true);
    const tableNode = artifact.node.children?.find((node) => node.kind === "table");
    expect((tableNode?.props as Record<string, unknown> | undefined)?.titleText).toBe("告警趋势 - 深度分析 - 结果表");
  });
});
