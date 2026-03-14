import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardDoc, createReportDoc } from "../../core/doc/defaults";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { CopilotEditorBridge } from "./CopilotEditorBridge";
import { CopilotProvider, useCopilot, type CopilotRouteScene } from "./copilot-context";
import { CopilotShell } from "./CopilotShell";

function RouteSceneBootstrap({ scene }: { scene: CopilotRouteScene }): null {
  const { updateRouteScene } = useCopilot();
  useEffect(() => {
    updateRouteScene(scene);
  }, [scene, updateRouteScene]);
  return null;
}

function SelectionController({
  firstId,
  secondId
}: {
  firstId: string;
  secondId: string;
}): JSX.Element {
  const store = useEditorStore();
  useEffect(() => {
    store.setSelection(firstId);
  }, [firstId, store]);
  return (
    <div>
      <button onClick={() => store.setSelection(firstId)}>选中图表A</button>
      <button onClick={() => store.setSelection(secondId)}>选中图表B</button>
    </div>
  );
}

const contextText = (): string => document.querySelector(".copilot-context-summary")?.textContent ?? "";
const titleCopy = (): string => document.querySelector(".copilot-shell-title-copy")?.textContent ?? "";

describe("CopilotShell", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens from launcher and supports minimize and restore with simplified header", async () => {
    const routeScene: CopilotRouteScene = {
      sceneId: "library",
      sceneKind: "library",
      title: "文档中心",
      routeMode: "library",
      variableSummary: [],
      capabilities: ["打开模板", "查看场景能力", "启动 Copilot"],
      supportsChat: false,
      supportsDropArtifacts: false
    };

    render(
      <CopilotProvider>
        <RouteSceneBootstrap scene={routeScene} />
        <CopilotShell />
      </CopilotProvider>
    );

    fireEvent.click(screen.getByLabelText("打开 Copilot"));
    await waitFor(() => expect(screen.getByRole("button", { name: "最小化" })).toBeTruthy());
    expect(titleCopy()).toContain("文档中心");
    expect(contextText()).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "最小化" }));
    await waitFor(() => expect(screen.getByLabelText("恢复 Copilot")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("恢复 Copilot"));
    await waitFor(() => expect(screen.getByRole("button", { name: "关闭" })).toBeTruthy());
  });

  it("follows selection and keeps locked context when disabled", async () => {
    const doc = createDashboardDoc();
    const [firstChart, secondChart] = doc.root.children ?? [];
    expect(firstChart?.id).toBeTruthy();
    expect(secondChart?.id).toBeTruthy();

    const routeScene: CopilotRouteScene = {
      sceneId: `detail:${doc.docId}:edit`,
      sceneKind: "dashboard_edit",
      title: "Dashboard 编辑",
      routeMode: "edit",
      docId: doc.docId,
      docType: "dashboard",
      docTitle: doc.title,
      variableSummary: [],
      capabilities: ["改当前图表", "生成新图表", "调整布局", "生成总结"],
      supportsChat: true,
      supportsDropArtifacts: true
    };

    render(
      <CopilotProvider>
        <RouteSceneBootstrap scene={routeScene} />
        <EditorProvider initialDoc={doc} baseRevision={3}>
          <CopilotEditorBridge />
          <SelectionController firstId={firstChart!.id} secondId={secondChart!.id} />
          <CopilotShell />
        </EditorProvider>
      </CopilotProvider>
    );

    fireEvent.click(screen.getByLabelText("打开 Copilot"));
    await waitFor(() => expect(titleCopy()).toContain("告警趋势"));

    fireEvent.click(screen.getByRole("button", { name: "选中图表B" }));
    await waitFor(() => expect(titleCopy()).toContain("丢包趋势"));

    fireEvent.click(screen.getByRole("button", { name: "锁定当前" }));
    fireEvent.click(screen.getByRole("button", { name: "选中图表A" }));
    await waitFor(() => expect(titleCopy()).toContain("丢包趋势"));
    expect(contextText()).toContain("已锁定");
  });

  it("keeps outline actions inside the chat flow instead of a separate results area", async () => {
    const doc = createReportDoc();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          job: {
            jobId: "job_outline_1",
            threadId: "thread_outline",
            docId: doc.docId,
            docType: doc.docType,
            baseRevision: 11,
            flowType: "report_generate",
            goal: "生成一份面向管理层的经营分析周报",
            status: "ready",
            outline: {
              title: "经营分析周报",
              audience: "management",
              goal: "生成一份面向管理层的经营分析周报",
              units: [
                { title: "总体结论", goal: "先给出本次汇报的核心结论和业务判断", unitType: "section", orderIndex: 1 }
              ],
              notes: ["先确认目录，再逐章生成内容。"]
            },
            units: [{ unitId: "unit_1", title: "总体结论", goal: "先给出本次汇报的核心结论和业务判断", unitType: "section", orderIndex: 1, status: "queued" }],
            createdAt: "2026-03-11T00:00:00Z",
            updatedAt: "2026-03-11T00:00:00Z"
          },
          unsupported: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const routeScene: CopilotRouteScene = {
      sceneId: `detail:${doc.docId}:edit`,
      sceneKind: "report_edit",
      title: "Report 编辑",
      routeMode: "edit",
      docId: doc.docId,
      docType: "report",
      docTitle: doc.title,
      variableSummary: [],
      capabilities: ["生成大纲", "逐章生成", "修改章节", "沉淀结果"],
      supportsChat: true,
      supportsDropArtifacts: true
    };

    render(
      <CopilotProvider>
        <RouteSceneBootstrap scene={routeScene} />
        <EditorProvider initialDoc={doc} baseRevision={11}>
          <CopilotShell />
        </EditorProvider>
      </CopilotProvider>
    );

    fireEvent.click(screen.getByLabelText("打开 Copilot"));
    fireEvent.click(screen.getByRole("button", { name: "生成大纲" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("最近结果")).toBeNull());
    expect(screen.getByText("经营分析周报")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认插入章节骨架" })).toBeTruthy();
  });
});
