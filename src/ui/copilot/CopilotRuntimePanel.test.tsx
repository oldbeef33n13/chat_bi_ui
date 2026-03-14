import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportDoc } from "../../core/doc/defaults";
import { aiOrchestrationRepo } from "../utils/ai-edit-orchestration";
import { CopilotProvider, useCopilot, type CopilotRouteScene } from "./copilot-context";
import { CopilotRuntimePanel } from "./CopilotRuntimePanel";

function RouteSceneBootstrap({ scene }: { scene: CopilotRouteScene }): null {
  const { updateRouteScene } = useCopilot();
  useEffect(() => {
    updateRouteScene(scene);
  }, [scene, updateRouteScene]);
  return null;
}

describe("CopilotRuntimePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("uses backend ui metadata for runtime story summaries", async () => {
    const doc = createReportDoc();
    const summarizeSpy = vi.spyOn(aiOrchestrationRepo, "summarizeStory").mockResolvedValue({
      source: "rule",
      headline: "网络运行周报 - 关键结论",
      conclusion: "旧的总结正文",
      evidence: ["证据 1"],
      advice: ["建议 1"],
      ui: {
        message: "我先整理了一版总结：网络运行周报 - 关键结论",
        bullets: ["先看这一版核心结论"],
        confirmHint: "确认后只会生成一份草稿，不会直接覆盖当前内容。",
        confirmLabel: "保存章节草稿",
        appliedMessage: "已为你保存一份章节草稿。"
      }
    });

    const routeScene: CopilotRouteScene = {
      sceneId: `detail:${doc.docId}:view`,
      sceneKind: "report_runtime",
      title: "Report 运行态",
      routeMode: "view",
      docId: doc.docId,
      docType: "report",
      docTitle: doc.title,
      variableSummary: [],
      capabilities: ["总结当前对象", "总结整份文档", "深度分析文档"],
      supportsChat: true,
      supportsDropArtifacts: false
    };

    render(
      <CopilotProvider>
        <RouteSceneBootstrap scene={routeScene} />
        <CopilotRuntimePanel doc={doc} />
      </CopilotProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "总结整份文档" }));

    await waitFor(() => {
      expect(summarizeSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("我先整理了一版总结：网络运行周报 - 关键结论")).toBeTruthy();
    expect(screen.getByText("先看这一版核心结论")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "保存章节草稿" }));

    await waitFor(() => {
      expect(screen.getByText("已为你保存一份章节草稿。")).toBeTruthy();
    });
  });
});
