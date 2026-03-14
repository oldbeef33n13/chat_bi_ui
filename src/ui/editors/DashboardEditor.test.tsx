import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createDashboardDoc } from "../../core/doc/defaults";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { encodeCopilotArtifact } from "../copilot/copilot-artifact-dnd";
import { CopilotProvider, useCopilot } from "../copilot/copilot-context";
import type { CopilotArtifactResultItem } from "../copilot/copilot-results";
import { DashboardEditor } from "./DashboardEditor";

vi.mock("../../runtime/chart/EChartView", () => ({
  EChartView: () => <div data-testid="echart-mock" />
}));

function DocObserver({ onDoc }: { onDoc: (doc: VDoc) => void }): null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  useEffect(() => {
    if (doc) {
      onDoc(doc);
    }
  }, [doc, onDoc]);
  return null;
}

function LiveDashboardEditor(): JSX.Element | null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  if (!doc) {
    return null;
  }
  return <DashboardEditor doc={doc} />;
}

function CopilotSpotlightObserver(): JSX.Element {
  const { spotlight } = useCopilot();
  return <span data-testid="copilot-spotlight-node">{spotlight?.nodeId ?? ""}</span>;
}

function CopilotSpotlightTrigger({ docId, nodeId }: { docId: string; nodeId: string }): JSX.Element {
  const { spotlightNode } = useCopilot();
  return <button onClick={() => spotlightNode(docId, nodeId)}>触发 Copilot 高亮</button>;
}

function UiSeed({ insertPanelOpen }: { insertPanelOpen?: boolean }): null {
  const store = useEditorStore();
  useEffect(() => {
    if (insertPanelOpen !== undefined) {
      store.setDashboardInsertPanelOpen(insertPanelOpen);
    }
  }, [insertPanelOpen, store]);
  return null;
}

const createDataTransfer = (): DataTransfer => {
  const store = new Map<string, string>();
  return {
    dropEffect: "copy",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: (format?: string) => {
      if (format) {
        store.delete(format);
        return;
      }
      store.clear();
    },
    getData: (format: string) => store.get(format) ?? "",
    setData: (format: string, data: string) => {
      store.set(format, data);
    },
    setDragImage: () => undefined
  } as DataTransfer;
};

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

describe("DashboardEditor direct manipulation", () => {
  it("does not render a duplicate floating title for chart cards with intrinsic titles", async () => {
    let latestDoc = createDashboardDoc();

    render(
      <CopilotProvider>
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveDashboardEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText("告警趋势")).toBeNull();
      expect(screen.getAllByText("卡片布局").length).toBeGreaterThan(0);
    });
  });

  it("supports marquee multi selection on the dashboard canvas", async () => {
    let latestDoc = createDashboardDoc();

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveDashboardEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const canvas = screen.getByTestId("dashboard-canvas");
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(canvas, { clientX: 1200, clientY: 320 });
    fireEvent.mouseUp(canvas, { clientX: 1200, clientY: 320 });

    await waitFor(() => {
      expect(screen.getByText("选中 2")).toBeTruthy();
    });
  });

  it("duplicates a dashboard card via alt drag", async () => {
    let latestDoc = createDashboardDoc();
    const chart = latestDoc.root.children?.[0];
    if (!chart) {
      throw new Error("missing dashboard card");
    }

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveDashboardEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const card = screen.getByTestId(`dashboard-card-${chart.id}`);
    fireEvent.mouseDown(card, { clientX: 120, clientY: 120, altKey: true });
    fireEvent.mouseMove(card, { clientX: 120, clientY: 280, altKey: true });
    fireEvent.mouseUp(card);

    await waitFor(() => {
      const duplicated = (latestDoc.root.children ?? []).find(
        (node) => node.id !== chart.id && node.kind === "chart" && String((node.props as Record<string, unknown> | undefined)?.titleText ?? "") === "告警趋势"
      );
      expect(latestDoc.root.children).toHaveLength(3);
      expect(duplicated).toBeTruthy();
      expect(Number(duplicated?.layout?.gy)).toBeGreaterThan(Number(chart.layout?.gy ?? 0));
    });

    expect(screen.getByText("已复制副本")).toBeTruthy();
  });

  it("supports shift-add selection on the dashboard canvas and clears it with escape", async () => {
    let latestDoc = createDashboardDoc();

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveDashboardEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const canvas = screen.getByTestId("dashboard-canvas");
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(canvas, { clientX: 580, clientY: 320 });
    fireEvent.mouseUp(canvas, { clientX: 580, clientY: 320 });
    fireEvent.mouseDown(canvas, { clientX: 620, clientY: 0, shiftKey: true });
    fireEvent.mouseMove(canvas, { clientX: 1200, clientY: 320, shiftKey: true });
    fireEvent.mouseUp(canvas, { clientX: 1200, clientY: 320, shiftKey: true });

    await waitFor(() => {
      expect(screen.getByText("选中 2")).toBeTruthy();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByText("选中 0")).toBeTruthy();
    });
  });

  it("moves selected dashboard cards together by dragging one selected card", async () => {
    let latestDoc = createDashboardDoc();
    const [firstCard, secondCard] = latestDoc.root.children ?? [];
    if (!firstCard || !secondCard) {
      throw new Error("missing dashboard cards");
    }

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveDashboardEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const canvas = screen.getByTestId("dashboard-canvas");
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(canvas, { clientX: 1200, clientY: 320 });
    fireEvent.mouseUp(canvas, { clientX: 1200, clientY: 320 });

    const card = screen.getByTestId(`dashboard-card-${firstCard.id}`);
    fireEvent.mouseDown(card, { clientX: 120, clientY: 120 });
    fireEvent.mouseMove(card, { clientX: 120, clientY: 280 });
    fireEvent.mouseUp(card);

    await waitFor(() => {
      const nextFirst = latestDoc.root.children?.find((node) => node.id === firstCard.id);
      const nextSecond = latestDoc.root.children?.find((node) => node.id === secondCard.id);
      expect(Number(nextFirst?.layout?.gy)).toBeGreaterThan(0);
      expect(nextFirst?.layout?.gy).toBe(nextSecond?.layout?.gy);
    });
  });

  it("duplicates selected dashboard cards together via alt drag", async () => {
    let latestDoc = createDashboardDoc();
    const [firstCard] = latestDoc.root.children ?? [];
    if (!firstCard) {
      throw new Error("missing dashboard card");
    }

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveDashboardEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const canvas = screen.getByTestId("dashboard-canvas");
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(canvas, { clientX: 1200, clientY: 320 });
    fireEvent.mouseUp(canvas, { clientX: 1200, clientY: 320 });

    const card = screen.getByTestId(`dashboard-card-${firstCard.id}`);
    fireEvent.mouseDown(card, { clientX: 120, clientY: 120, altKey: true });
    fireEvent.mouseMove(card, { clientX: 120, clientY: 280, altKey: true });
    fireEvent.mouseUp(card);

    await waitFor(() => {
      const charts = (latestDoc.root.children ?? []).filter((node) => node.kind === "chart");
      expect(latestDoc.root.children).toHaveLength(4);
      expect(charts).toHaveLength(4);
    });
  });

  it("inserts a dashboard card from the side insert panel", async () => {
    let latestDoc = createDashboardDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <UiSeed insertPanelOpen />
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DashboardEditor doc={latestDoc} />
      </EditorProvider>
    );

    expect(screen.getByTestId("dashboard-insert-panel")).toBeTruthy();
    expect(screen.getByText("推荐组件")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /柱状图/ }));

    await waitFor(() => {
      const charts = (latestDoc.root.children ?? []).filter((node) => node.kind === "chart");
      expect(charts).toHaveLength(3);
      expect(charts.some((node) => String((node.props as Record<string, unknown>)?.chartType) === "bar")).toBe(true);
    });

    expect(screen.getByText("最近使用")).toBeTruthy();
  });

  it("supports dragging an insert item from the side panel onto the canvas", async () => {
    let latestDoc = createDashboardDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <UiSeed insertPanelOpen />
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DashboardEditor doc={latestDoc} />
      </EditorProvider>
    );

    const canvas = screen.getByTestId("dashboard-canvas");
    const item = screen.getAllByRole("button", { name: /基础表/ })[0]!;
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(item, { dataTransfer });
    fireEvent.dragOver(canvas, { dataTransfer, clientX: 680, clientY: 220 });
    fireEvent.drop(canvas, { dataTransfer, clientX: 680, clientY: 220 });

    await waitFor(() => {
      const tables = (latestDoc.root.children ?? []).filter((node) => node.kind === "table");
      expect(tables).toHaveLength(1);
    });
  });

  it("drops a copilot artifact onto the dashboard canvas with regenerated node ids", async () => {
    let latestDoc = createDashboardDoc();
    const dataTransfer = createDataTransfer();
    const artifact: CopilotArtifactResultItem = {
      resultId: "artifact_result_dashboard_1",
      sceneId: "detail:runtime:view",
      threadId: "thread_demo",
      docId: latestDoc.docId,
      docType: "dashboard",
      originSceneKind: "dashboard_runtime",
      originRouteMode: "view",
      originLabel: "Dashboard 运行态",
      kind: "artifact",
      title: "AI 文本模块草稿",
      summary: "已从运行态洞察转成文本模块草稿",
      createdAt: "2026-03-12T00:00:00Z",
      updatedAt: "2026-03-12T00:00:00Z",
      jobId: "job_runtime_artifact",
      unitId: "unit_runtime_artifact",
      artifactId: "artifact_dashboard_demo",
      artifactKind: "block_region",
      node: {
        id: "container_artifact_demo",
        kind: "container",
        layout: { mode: "grid", gx: 0, gy: 0, gw: 4, gh: 4 },
        props: { title: "AI 文本模块草稿" },
        children: [
          {
            id: "text_artifact_demo",
            kind: "text",
            props: { text: "这是来自 Copilot 的运行态结论。", format: "plain" }
          }
        ]
      },
      notes: ["来自运行态深度分析"],
      status: "ready"
    };

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveDashboardEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const canvas = screen.getByTestId("dashboard-canvas");
    encodeCopilotArtifact(dataTransfer, artifact);

    fireEvent.dragOver(canvas, { dataTransfer, clientX: 860, clientY: 260 });
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-insert-preview-artifact_result_dashboard_1")).toBeTruthy();
      expect(screen.getAllByText(/将插入到/).length).toBeGreaterThan(0);
      expect(document.querySelectorAll(".dash-card.is-copilot-drop-guide")).toHaveLength(1);
    });
    fireEvent.drop(canvas, { dataTransfer, clientX: 860, clientY: 260 });

    await waitFor(() => {
      const inserted = (latestDoc.root.children ?? []).find(
        (node) =>
          node.kind === "container" &&
          node.id !== "container_artifact_demo" &&
          String((node.props as Record<string, unknown> | undefined)?.title ?? "") === "AI 文本模块草稿"
      );
      expect(inserted).toBeTruthy();
      expect(inserted?.children?.[0]?.id).not.toBe("text_artifact_demo");
      expect(inserted?.children?.[0]?.props).toMatchObject({ text: "这是来自 Copilot 的运行态结论。" });
    });

    const insertedId = (latestDoc.root.children ?? []).find(
      (node) =>
        node.kind === "container" &&
        String((node.props as Record<string, unknown> | undefined)?.title ?? "") === "AI 文本模块草稿"
    )?.id;
    expect(insertedId).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("copilot-spotlight-node").textContent).toBe(insertedId));
  });

  it("highlights an existing dashboard card when Copilot focuses it", async () => {
    const latestDoc = createDashboardDoc();
    const targetNodeId = latestDoc.root.children?.[0]?.id;
    if (!targetNodeId) {
      throw new Error("missing dashboard card");
    }

    render(
      <CopilotProvider>
        <CopilotSpotlightTrigger docId={latestDoc.docId} nodeId={targetNodeId} />
        <EditorProvider initialDoc={latestDoc}>
          <LiveDashboardEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "触发 Copilot 高亮" }));

    await waitFor(() => {
      expect(screen.getByTestId(`dashboard-card-${targetNodeId}`).classList.contains("is-copilot-spotlight")).toBe(true);
    });
  });

  it("prefetches dashboard endpoint nodes on first editor render", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "ops_alarm_trend",
        rows: [
          { ts: "2026-03-01", critical: 12 },
          { ts: "2026-03-02", critical: 18 }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const latestDoc = createDashboardDoc();
    latestDoc.root.children = [
      {
        id: "dashboard_prefetch_text",
        kind: "text",
        props: { text: "首屏说明", format: "plain" },
        layout: { mode: "grid", gx: 0, gy: 0, gw: 4, gh: 3 }
      },
      {
        id: "dashboard_prefetch_chart",
        kind: "chart",
        props: {
          titleText: "趋势图",
          chartType: "line",
          bindings: [
            { role: "x", field: "ts" },
            { role: "y", field: "critical", agg: "sum" }
          ]
        },
        data: { endpointId: "ops_alarm_trend" },
        layout: { mode: "grid", gx: 4, gy: 0, gw: 8, gh: 6 }
      }
    ];

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DashboardEditor doc={latestDoc} />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("still loads dashboard endpoint data on first render under StrictMode", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "ops_alarm_trend",
        rows: [
          { ts: "2026-03-01", critical: 12 },
          { ts: "2026-03-02", critical: 18 }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const latestDoc = createDashboardDoc();
    latestDoc.root.children = [
      {
        id: "dashboard_strict_prefetch_chart",
        kind: "chart",
        props: {
          titleText: "趋势图",
          chartType: "line",
          bindings: [
            { role: "x", field: "ts" },
            { role: "y", field: "critical", agg: "sum" }
          ]
        },
        data: { endpointId: "ops_alarm_trend" },
        layout: { mode: "grid", gx: 0, gy: 0, gw: 8, gh: 6 }
      }
    ];

    render(
      <StrictMode>
        <EditorProvider initialDoc={latestDoc}>
          <DashboardEditor doc={latestDoc} />
        </EditorProvider>
      </StrictMode>
    );

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
