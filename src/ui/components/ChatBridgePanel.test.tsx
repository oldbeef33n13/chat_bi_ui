import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDashboardDoc, createReportDoc } from "../../core/doc/defaults";
import { findNodeById } from "../utils/node-tree";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { ChatBridgePanel } from "./ChatBridgePanel";

vi.mock("../../runtime/chart/EChartView", () => ({
  EChartView: ({ spec }: { spec: { titleText?: string; chartType?: string } }) => (
    <div data-testid="mock-echart">{`${spec.titleText ?? "chart"}:${spec.chartType ?? "line"}`}</div>
  )
}));

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

function SelectionBootstrap({ nodeId }: { nodeId?: string }): null {
  const store = useEditorStore();
  useEffect(() => {
    if (nodeId) {
      store.setSelection(nodeId);
    }
  }, [nodeId, store]);
  return null;
}

function ChartTypeProbe({ nodeId }: { nodeId: string }): JSX.Element | null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  if (!doc) {
    return null;
  }
  const node = findNodeById(doc.root, nodeId);
  const props = (node?.props ?? {}) as Record<string, unknown>;
  return <div data-testid="chart-type">{String(props.chartType ?? "na")}</div>;
}

function ChartCountProbe(): JSX.Element | null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  if (!doc) {
    return null;
  }
  return <div data-testid="chart-count">{String((doc.root.children ?? []).filter((item) => item.kind === "chart").length)}</div>;
}

describe("ChatBridgePanel", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders an inline chart preview card and updates the selected chart", async () => {
    const doc = createDashboardDoc();
    const chartId = doc.root.children?.find((node) => node.kind === "chart")?.id;
    expect(chartId).toBeTruthy();
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        route: {
          intent: "ask_edit",
          scene: "command_plan",
          resolvedObjects: [{ objectId: chartId, kind: "chart", title: "告警趋势", confidence: 1 }],
          needsClarification: false,
          clarificationQuestion: null,
          workingContext: {
            docId: doc.docId,
            docType: doc.docType,
            selectedObjectIds: chartId ? [chartId] : [],
            activeSectionId: null,
            activeSlideId: null,
            lastResolvedObjectId: chartId,
            currentIntent: "ask_edit",
            activeJobId: null,
            templateVariables: {}
          }
        },
        proposal: {
          proposalId: "proposal_1",
          threadId: "thread_demo",
          docId: doc.docId,
          docType: doc.docType,
          baseRevision: 7,
          scopeType: "chart",
          scopeId: chartId,
          risk: "low",
          summary: "将当前图表切换为柱状图并开启标签",
          explanation: ["命中当前选中图表", "切换 chartType 并开启标签展示"],
          commandPlan: {
            intent: "update",
            targets: chartId ? [chartId] : [],
            commands: [
              {
                type: "UpdateProps",
                nodeId: chartId,
                props: { chartType: "bar", labelShow: true }
              }
            ],
            explain: "将当前图表改成柱状图并开启标签"
          },
          previewChangedObjectIds: chartId ? [chartId] : [],
          source: "rule",
          accepted: false,
          rejected: false,
          createdAt: "2026-03-11T00:00:00Z"
        },
        ui: {
          message: "我先按当前图表做了一版修改预览。",
          bullets: ["命中当前选中图表", "切换 chartType 并开启标签展示"],
          confirmHint: "确认后会直接更新左侧当前对象。",
          confirmLabel: "确认更新",
          appliedMessage: "已更新左侧主图：将当前图表切换为柱状图并开启标签"
        },
        unsupported: null
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EditorProvider initialDoc={doc} baseRevision={7}>
        <SelectionBootstrap nodeId={chartId} />
        <ChartTypeProbe nodeId={chartId!} />
        <ChatBridgePanel />
      </EditorProvider>
    );

    expect(screen.getByLabelText("Copilot 输入")).toBeTruthy();
    expect(screen.getByRole("button", { name: "改标题" })).toBeTruthy();
    expect(screen.getByTestId("chart-type").textContent).toBe("line");

    fireEvent.change(screen.getByLabelText("Copilot 输入"), {
      target: { value: "把当前图表改成柱状图并开启标签" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("我先按当前图表做了一版修改预览。")).toBeTruthy());
    expect(screen.getByText("确认后会直接更新左侧当前对象。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认更新" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "确认更新" }));

    await waitFor(() => expect(screen.getByTestId("chart-type").textContent).toBe("bar"));
    expect(screen.getByText("已更新左侧主图：将当前图表切换为柱状图并开启标签")).toBeTruthy();
  });

  it("creates a generated chart card from current data and inserts it into the main scene", async () => {
    const doc = createDashboardDoc();
    const chartId = doc.root.children?.find((node) => node.kind === "chart")?.id;
    expect(chartId).toBeTruthy();

    render(
      <EditorProvider initialDoc={doc} baseRevision={7}>
        <SelectionBootstrap nodeId={chartId} />
        <ChartCountProbe />
        <ChatBridgePanel />
      </EditorProvider>
    );

    expect(screen.getByTestId("chart-count").textContent).toBe("2");

    fireEvent.change(screen.getByLabelText("Copilot 输入"), {
      target: { value: "帮我查询当前数据，生成一个占比图" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByText(/我先基于当前数据生成了一张候选图/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "插入到当前位置" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "插入到当前位置" }));

    await waitFor(() => expect(screen.getByTestId("chart-count").textContent).toBe("3"));
    expect(screen.getByText(/已把候选图插入左侧主场景/)).toBeTruthy();
  });

  it("still creates an outline through the chat flow", async () => {
    const doc = createReportDoc();
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
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
              {
                title: "总体结论",
                goal: "先给出本次汇报的核心结论和业务判断",
                unitType: "section",
                orderIndex: 1
              },
              {
                title: "关键指标概览",
                goal: "概览关键指标现状和变化",
                unitType: "section",
                orderIndex: 2
              }
            ],
            notes: ["先确认目录，再逐章生成内容。"]
          },
          units: [
            { unitId: "unit_1", title: "总体结论", goal: "先给出本次汇报的核心结论和业务判断", unitType: "section", orderIndex: 1, status: "queued" },
            { unitId: "unit_2", title: "关键指标概览", goal: "概览关键指标现状和变化", unitType: "section", orderIndex: 2, status: "queued" }
          ],
          createdAt: "2026-03-11T00:00:00Z",
          updatedAt: "2026-03-11T00:00:00Z"
        },
        ui: {
          message: "我先生成了一版大纲：经营分析周报",
          bullets: ["1. 总体结论", "2. 关键指标概览"],
          confirmHint: "确认后会把这版章节骨架插入左侧文档。",
          confirmLabel: "确认插入章节骨架"
        },
        unsupported: null
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EditorProvider initialDoc={doc} baseRevision={11}>
        <ChatBridgePanel />
      </EditorProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "生成大纲" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("我先生成了一版大纲：经营分析周报")).toBeTruthy());
    expect(screen.getByText("确认后会把这版章节骨架插入左侧文档。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认插入章节骨架" })).toBeTruthy();
  });

  it("blocks unsupported traditional requests locally", async () => {
    const doc = createDashboardDoc();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EditorProvider initialDoc={doc} baseRevision={7}>
        <ChatBridgePanel />
      </EditorProvider>
    );

    fireEvent.change(screen.getByLabelText("Copilot 输入"), {
      target: { value: "帮我直接发布这个模板并导出 PDF 后发邮件" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/我还在成长中/)).toBeTruthy());
  });

  it("renders backend unsupported responses in the conversation", async () => {
    const doc = createDashboardDoc();
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        route: {
          intent: "ask_edit",
          scene: "command_plan",
          resolvedObjects: [],
          needsClarification: false,
          clarificationQuestion: null,
          workingContext: {
            docId: doc.docId,
            docType: doc.docType,
            selectedObjectIds: [],
            activeSectionId: null,
            activeSlideId: null,
            lastResolvedObjectId: null,
            currentIntent: "ask_edit",
            activeJobId: null,
            templateVariables: {}
          }
        },
        proposal: null,
        unsupported: {
          code: "traditional_flow_only",
          message: "我还在成长中，当前 AI 编排不负责发布、导出、调度或数据接口这类传统操作。",
          recommendations: ["改当前图表", "生成新图表", "调整布局"]
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EditorProvider initialDoc={doc} baseRevision={7}>
        <ChatBridgePanel />
      </EditorProvider>
    );

    fireEvent.change(screen.getByLabelText("Copilot 输入"), {
      target: { value: "把当前图表改成柱状图" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/当前 AI 编排不负责发布、导出、调度或数据接口/)).toBeTruthy();
    expect(screen.getByText("改当前图表")).toBeTruthy();
  });
});
