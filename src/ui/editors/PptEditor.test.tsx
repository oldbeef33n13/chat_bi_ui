import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createPptDoc } from "../../core/doc/defaults";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { encodeCopilotArtifact } from "../copilot/copilot-artifact-dnd";
import { CopilotProvider, useCopilot } from "../copilot/copilot-context";
import type { CopilotArtifactResultItem } from "../copilot/copilot-results";
import { PptEditor } from "./PptEditor";

vi.mock("../../runtime/chart/EChartView", () => ({
  EChartView: () => <div data-testid="echart-mock" />
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

function LivePptEditor(): JSX.Element | null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  if (!doc) {
    return null;
  }
  return <PptEditor doc={doc} />;
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
      store.setPptInsertPanelOpen(insertPanelOpen);
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

describe("PptEditor direct manipulation", () => {
  it("supports marquee multi selection on the active slide", async () => {
    let latestDoc = createPptDoc();
    const activeSlideId = latestDoc.root.children?.[0]?.id;
    if (!activeSlideId) {
      throw new Error("missing slide");
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
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const slide = screen.getByTestId(`ppt-slide-canvas-${activeSlideId}`);
    fireEvent.mouseDown(slide, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(slide, { clientX: 940, clientY: 380 });
    fireEvent.mouseUp(slide, { clientX: 940, clientY: 380 });

    await waitFor(() => {
      expect(screen.getByText("选中: 3")).toBeTruthy();
    });
  });

  it("duplicates a slide node via alt drag", async () => {
    let latestDoc = createPptDoc();
    const slide = latestDoc.root.children?.[0];
    const chartNode = slide?.children?.find((node) => node.kind === "chart");
    if (!slide || !chartNode) {
      throw new Error("missing slide chart");
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
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const node = screen.getByTestId(`ppt-node-${chartNode.id}`);
    fireEvent.mouseDown(node, { clientX: 120, clientY: 140, altKey: true });
    fireEvent.mouseMove(node, { clientX: 320, clientY: 180, altKey: true });
    fireEvent.mouseUp(node);

    await waitFor(() => {
      const firstSlide = latestDoc.root.children?.[0];
      const duplicated = (firstSlide?.children ?? []).find(
        (candidate) => candidate.id !== chartNode.id && candidate.kind === "chart" && String((candidate.props as Record<string, unknown> | undefined)?.titleText ?? "") === "告警趋势"
      );
      expect(firstSlide?.children).toHaveLength(4);
      expect(duplicated).toBeTruthy();
      expect(Number(duplicated?.layout?.x)).toBeGreaterThan(Number(chartNode.layout?.x ?? 0));
    });

    expect(screen.getByText("已复制副本")).toBeTruthy();
  });

  it("supports shift-add selection on the active slide and clears it with escape", async () => {
    let latestDoc = createPptDoc();
    const activeSlideId = latestDoc.root.children?.[0]?.id;
    if (!activeSlideId) {
      throw new Error("missing slide");
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
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const slide = screen.getByTestId(`ppt-slide-canvas-${activeSlideId}`);
    fireEvent.mouseDown(slide, { clientX: 20, clientY: 80 });
    fireEvent.mouseMove(slide, { clientX: 470, clientY: 380 });
    fireEvent.mouseUp(slide, { clientX: 470, clientY: 380 });
    fireEvent.mouseDown(slide, { clientX: 490, clientY: 80, shiftKey: true });
    fireEvent.mouseMove(slide, { clientX: 940, clientY: 380, shiftKey: true });
    fireEvent.mouseUp(slide, { clientX: 940, clientY: 380, shiftKey: true });

    await waitFor(() => {
      expect(screen.getByText("选中: 2")).toBeTruthy();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByText("选中: 0")).toBeTruthy();
    });
  });

  it("moves selected slide nodes together by dragging one selected node", async () => {
    let latestDoc = createPptDoc();
    const slide = latestDoc.root.children?.[0];
    const chartNode = slide?.children?.find((node) => node.kind === "chart");
    const summaryNode = slide?.children?.find((node) => node.id !== chartNode?.id && node.kind === "text" && Number(node.layout?.y ?? 0) >= 90);
    if (!slide || !chartNode || !summaryNode) {
      throw new Error("missing slide nodes");
    }
    const initialSummaryX = Number(summaryNode.layout?.x ?? 0);

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const slideCanvas = screen.getByTestId(`ppt-slide-canvas-${slide.id}`);
    fireEvent.mouseDown(slideCanvas, { clientX: 20, clientY: 80 });
    fireEvent.mouseMove(slideCanvas, { clientX: 470, clientY: 380 });
    fireEvent.mouseUp(slideCanvas, { clientX: 470, clientY: 380 });
    fireEvent.mouseDown(slideCanvas, { clientX: 490, clientY: 80, shiftKey: true });
    fireEvent.mouseMove(slideCanvas, { clientX: 940, clientY: 380, shiftKey: true });
    fireEvent.mouseUp(slideCanvas, { clientX: 940, clientY: 380, shiftKey: true });

    const node = screen.getByTestId(`ppt-node-${chartNode.id}`);
    fireEvent.mouseDown(node, { clientX: 120, clientY: 140 });
    fireEvent.mouseMove(node, { clientX: 220, clientY: 180 });
    fireEvent.mouseUp(node);

    await waitFor(() => {
      const nextSlide = latestDoc.root.children?.[0];
      const nextChart = nextSlide?.children?.find((candidate) => candidate.id === chartNode.id);
      const nextSummary = nextSlide?.children?.find((candidate) => candidate.id === summaryNode.id);
      expect(Number(nextChart?.layout?.x)).toBeGreaterThan(Number(chartNode.layout?.x ?? 0));
      expect(Number(nextSummary?.layout?.x)).toBeGreaterThan(initialSummaryX);
    });
  });

  it("duplicates selected slide nodes together via alt drag", async () => {
    let latestDoc = createPptDoc();
    const slide = latestDoc.root.children?.[0];
    const chartNode = slide?.children?.find((node) => node.kind === "chart");
    const summaryNode = slide?.children?.find((node) => node.id !== chartNode?.id && node.kind === "text" && Number(node.layout?.y ?? 0) >= 90);
    if (!slide || !chartNode || !summaryNode) {
      throw new Error("missing slide nodes");
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
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const slideCanvas = screen.getByTestId(`ppt-slide-canvas-${slide.id}`);
    fireEvent.mouseDown(slideCanvas, { clientX: 20, clientY: 80 });
    fireEvent.mouseMove(slideCanvas, { clientX: 470, clientY: 380 });
    fireEvent.mouseUp(slideCanvas, { clientX: 470, clientY: 380 });
    fireEvent.mouseDown(slideCanvas, { clientX: 490, clientY: 80, shiftKey: true });
    fireEvent.mouseMove(slideCanvas, { clientX: 940, clientY: 380, shiftKey: true });
    fireEvent.mouseUp(slideCanvas, { clientX: 940, clientY: 380, shiftKey: true });

    const node = screen.getByTestId(`ppt-node-${chartNode.id}`);
    fireEvent.mouseDown(node, { clientX: 120, clientY: 140, altKey: true });
    fireEvent.mouseMove(node, { clientX: 220, clientY: 180, altKey: true });
    fireEvent.mouseUp(node);

    await waitFor(() => {
      const firstSlide = latestDoc.root.children?.[0];
      const charts = (firstSlide?.children ?? []).filter((candidate) => candidate.kind === "chart");
      const summaryTexts = (firstSlide?.children ?? []).filter(
        (candidate) => candidate.kind === "text" && String((candidate.props as Record<string, unknown> | undefined)?.text ?? "").includes("关键结论")
      );
      expect(firstSlide?.children).toHaveLength(5);
      expect(charts).toHaveLength(2);
      expect(summaryTexts).toHaveLength(2);
    });
  });

  it("keeps the selected overlapping node above siblings and exposes only its resize handle", async () => {
    let latestDoc = createPptDoc();
    const slide = latestDoc.root.children?.[0];
    const chartNode = slide?.children?.find((node) => node.kind === "chart");
    const summaryNode = slide?.children?.find((node) => node.kind === "text" && node.id !== chartNode?.id && Number(node.layout?.y ?? 0) >= 90);
    if (!slide || !chartNode || !summaryNode) {
      throw new Error("missing slide nodes");
    }
    chartNode.layout = { ...(chartNode.layout ?? {}), mode: "absolute", x: 120, y: 120, w: 320, h: 220, z: 1 };
    summaryNode.layout = { ...(summaryNode.layout ?? {}), mode: "absolute", x: 180, y: 160, w: 320, h: 220, z: 5 };

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const chart = screen.getByTestId(`ppt-node-${chartNode.id}`);
    const summary = screen.getByTestId(`ppt-node-${summaryNode.id}`);
    fireEvent.mouseDown(chart, { clientX: 180, clientY: 180 });
    fireEvent.mouseUp(chart);

    await waitFor(() => {
      expect(screen.getByTestId(`ppt-resize-handle-${chartNode.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`ppt-resize-handle-${summaryNode.id}`)).toBeNull();
      expect(Number((chart as HTMLDivElement).style.zIndex)).toBeGreaterThan(Number((summary as HTMLDivElement).style.zIndex));
      expect(chart.querySelector(".ppt-node-active-wash")).toBeTruthy();
      expect(chart.querySelector(".node-floating-tools")).toBeNull();
      expect(summary.querySelector(".node-floating-tools")).toBeNull();
    });
  });

  it("inserts a ppt element from the side insert panel", async () => {
    let latestDoc = createPptDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <UiSeed insertPanelOpen />
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <PptEditor doc={latestDoc} />
      </EditorProvider>
    );

    const panel = screen.getByTestId("ppt-insert-panel");
    expect(panel).toBeTruthy();
    fireEvent.click(within(panel).getAllByRole("button", { name: /基础表/ })[0]!);

    await waitFor(() => {
      const slide = latestDoc.root.children?.[0];
      const tables = (slide?.children ?? []).filter((node) => node.kind === "table");
      expect(tables).toHaveLength(1);
    });
  });

  it("supports dragging an insert item onto the ppt slide", async () => {
    let latestDoc = createPptDoc();
    const activeSlideId = latestDoc.root.children?.[0]?.id;
    if (!activeSlideId) {
      throw new Error("missing slide");
    }

    render(
      <EditorProvider initialDoc={latestDoc}>
        <UiSeed insertPanelOpen />
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <PptEditor doc={latestDoc} />
      </EditorProvider>
    );

    const slide = screen.getByTestId(`ppt-slide-canvas-${activeSlideId}`);
    const item = screen.getAllByRole("button", { name: /柱状图/ })[0]!;
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(item, { dataTransfer });
    fireEvent.dragOver(slide, { dataTransfer, clientX: 420, clientY: 260 });
    fireEvent.drop(slide, { dataTransfer, clientX: 420, clientY: 260 });

    await waitFor(() => {
      const firstSlide = latestDoc.root.children?.[0];
      const bars = (firstSlide?.children ?? []).filter((node) => node.kind === "chart" && String((node.props as Record<string, unknown> | undefined)?.chartType ?? "") === "bar");
      expect(bars).toHaveLength(1);
    });
  });

  it("drops a copilot slide artifact onto the navigator and inserts a new slide", async () => {
    let latestDoc = createPptDoc();
    const dataTransfer = createDataTransfer();
    const artifact: CopilotArtifactResultItem = {
      resultId: "artifact_result_ppt_1",
      sceneId: "detail:runtime:view",
      threadId: "thread_ppt_demo",
      docId: latestDoc.docId,
      docType: "ppt",
      originSceneKind: "ppt_runtime",
      originRouteMode: "view",
      originLabel: "PPT 运行态",
      kind: "artifact",
      title: "AI 结论页",
      summary: "已从运行态洞察转成页面草稿",
      createdAt: "2026-03-12T00:00:00Z",
      updatedAt: "2026-03-12T00:00:00Z",
      jobId: "job_runtime_ppt",
      unitId: "unit_runtime_ppt",
      artifactId: "artifact_ppt_demo",
      artifactKind: "slide",
      node: {
        id: "slide_artifact_demo",
        kind: "slide",
        props: { title: "AI 结论页", layoutTemplateId: "title-double-summary" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: [
          {
            id: "text_artifact_demo",
            kind: "text",
            layout: { mode: "absolute", x: 42, y: 34, w: 860, h: 180, z: 1 },
            props: { text: "这是来自 Copilot 的 PPT 结论页。", format: "plain" }
          }
        ]
      },
      notes: ["来自运行态洞察"],
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
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const firstSlideAfterAnchor = screen.getByTestId(`ppt-artifact-drop-after-${latestDoc.root.children?.[0]?.id}`);
    encodeCopilotArtifact(dataTransfer, artifact);

    fireEvent.dragOver(firstSlideAfterAnchor, { dataTransfer });
    expect(screen.getByText("松开后插入到此页后")).toBeTruthy();
    fireEvent.drop(firstSlideAfterAnchor, { dataTransfer });

    await waitFor(() => {
      const inserted = (latestDoc.root.children ?? []).find(
        (node) =>
          node.kind === "slide" &&
          node.id !== "slide_artifact_demo" &&
          String((node.props as Record<string, unknown> | undefined)?.title ?? "") === "AI 结论页"
      );
      expect(inserted).toBeTruthy();
      expect(inserted?.children?.[0]?.id).not.toBe("text_artifact_demo");
      expect(inserted?.children?.[0]?.props).toMatchObject({ text: "这是来自 Copilot 的 PPT 结论页。" });
    });

    const insertedSlideId = (latestDoc.root.children ?? []).find(
      (node) =>
        node.kind === "slide" &&
        String((node.props as Record<string, unknown> | undefined)?.title ?? "") === "AI 结论页"
    )?.id;
    expect(insertedSlideId).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("copilot-spotlight-node").textContent).toBe(insertedSlideId));
  });

  it("prefetches the first later data slide on first load without waiting for slide switch", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "ops_alarm_trend",
        rows: [
          { ts: "2026-03-01", critical: 12 },
          { ts: "2026-03-02", critical: 18 },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const latestDoc = createPptDoc();
    const firstSlide = latestDoc.root.children?.[0];
    if (!firstSlide) {
      throw new Error("missing first slide");
    }
    firstSlide.children = [
      {
        id: "ppt_prefetch_cover_text",
        kind: "text",
        props: { text: "封面", format: "plain" },
        layout: { mode: "absolute", x: 40, y: 60, w: 420, h: 120, z: 1 },
      },
    ];
    const introSlide = {
      id: "slide_prefetch_intro_editor",
      kind: "slide" as const,
      props: { title: "说明页" },
      layout: { mode: "absolute" as const, x: 0, y: 0, w: 960, h: 540 },
      children: [
        {
          id: "ppt_prefetch_intro_text",
          kind: "text" as const,
          props: { text: "说明", format: "plain" },
          layout: { mode: "absolute" as const, x: 40, y: 96, w: 420, h: 120, z: 1 },
        },
      ],
    };
    latestDoc.root.children = [
      firstSlide,
      introSlide,
      {
        id: "slide_prefetch_runtime",
        kind: "slide",
        props: { title: "趋势页" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: [
          {
            id: "chart_prefetch_runtime",
            kind: "chart",
            props: {
              titleText: "趋势图",
              chartType: "line",
              bindings: [
                { role: "x", field: "ts" },
                { role: "y", field: "critical", agg: "sum" },
              ],
            },
            data: { endpointId: "ops_alarm_trend" },
            layout: { mode: "absolute", x: 40, y: 96, w: 420, h: 220, z: 1 },
          },
        ],
      },
    ];

    render(
      <EditorProvider initialDoc={latestDoc}>
        <PptEditor doc={latestDoc} />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("still loads ppt endpoint data on first render under StrictMode", async () => {
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

    const latestDoc = createPptDoc();
    const firstSlide = latestDoc.root.children?.[0];
    if (!firstSlide) {
      throw new Error("missing first slide");
    }
    firstSlide.children = [
      {
        id: "ppt_strict_prefetch_chart",
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
        layout: { mode: "absolute", x: 40, y: 96, w: 420, h: 220, z: 1 }
      }
    ];

    render(
      <StrictMode>
        <EditorProvider initialDoc={latestDoc}>
          <PptEditor doc={latestDoc} />
        </EditorProvider>
      </StrictMode>
    );

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it("inserts a copilot slide artifact before the target slide when dropped on the upper anchor", async () => {
    let latestDoc = createPptDoc();
    const originalFirstSlideId = latestDoc.root.children?.[0]?.id;
    if (!originalFirstSlideId) {
      throw new Error("missing first slide");
    }
    const dataTransfer = createDataTransfer();
    const artifact: CopilotArtifactResultItem = {
      resultId: "artifact_result_ppt_before_1",
      sceneId: "detail:runtime:view",
      threadId: "thread_ppt_demo",
      docId: latestDoc.docId,
      docType: "ppt",
      originSceneKind: "ppt_runtime",
      originRouteMode: "view",
      originLabel: "PPT 运行态",
      kind: "artifact",
      title: "AI 封面前置页",
      summary: "已从运行态洞察转成页面草稿",
      createdAt: "2026-03-12T00:00:00Z",
      updatedAt: "2026-03-12T00:00:00Z",
      jobId: "job_runtime_ppt_before",
      unitId: "unit_runtime_ppt_before",
      artifactId: "artifact_ppt_before_demo",
      artifactKind: "slide",
      node: {
        id: "slide_artifact_before_demo",
        kind: "slide",
        props: { title: "AI 封面前置页", layoutTemplateId: "title-double-summary" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: [
          {
            id: "text_artifact_before_demo",
            kind: "text",
            layout: { mode: "absolute", x: 42, y: 34, w: 860, h: 180, z: 1 },
            props: { text: "这是插入到目标页面前的 Copilot 页面。", format: "plain" }
          }
        ]
      },
      notes: ["来自运行态洞察"],
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
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const firstSlideBeforeAnchor = screen.getByTestId(`ppt-artifact-drop-before-${originalFirstSlideId}`);
    encodeCopilotArtifact(dataTransfer, artifact);

    fireEvent.dragOver(firstSlideBeforeAnchor, { dataTransfer });
    expect(screen.getByText("松开后插入到此页前")).toBeTruthy();
    fireEvent.drop(firstSlideBeforeAnchor, { dataTransfer });

    await waitFor(() => {
      const firstSlide = latestDoc.root.children?.[0];
      const secondSlide = latestDoc.root.children?.[1];
      expect(firstSlide?.kind).toBe("slide");
      expect(firstSlide?.id).not.toBe(originalFirstSlideId);
      expect(firstSlide?.id).not.toBe("slide_artifact_before_demo");
      expect((firstSlide?.props as Record<string, unknown> | undefined)?.title).toBe("AI 封面前置页");
      expect(firstSlide?.children?.[0]?.id).not.toBe("text_artifact_before_demo");
      expect(firstSlide?.children?.[0]?.props).toMatchObject({ text: "这是插入到目标页面前的 Copilot 页面。" });
      expect(secondSlide?.id).toBe(originalFirstSlideId);
    });

    const insertedSlideId = latestDoc.root.children?.[0]?.id;
    expect(insertedSlideId).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("copilot-spotlight-node").textContent).toBe(insertedSlideId));
  });

  it("highlights the active slide when Copilot focuses it", async () => {
    const latestDoc = createPptDoc();
    const targetSlideId = latestDoc.root.children?.[0]?.id;
    if (!targetSlideId) {
      throw new Error("missing slide");
    }

    render(
      <CopilotProvider>
        <CopilotSpotlightTrigger docId={latestDoc.docId} nodeId={targetSlideId} />
        <EditorProvider initialDoc={latestDoc}>
          <LivePptEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "触发 Copilot 高亮" }));

    await waitFor(() => {
      expect(screen.getByTestId(`ppt-slide-canvas-${targetSlideId}`).classList.contains("is-copilot-spotlight")).toBe(true);
    });
  });

  it("uploads an image from the side insert panel and inserts it onto the slide", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "asset_ppt_image",
        name: "示意图",
        originalFileName: "topology.png",
        fileUrl: "/files/assets/asset_ppt_image",
        mimeType: "image/png",
        widthPx: 640,
        heightPx: 360,
        sizeBytes: 2048
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    let latestDoc = createPptDoc();

    const { container } = render(
      <EditorProvider initialDoc={latestDoc}>
        <UiSeed insertPanelOpen />
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <PptEditor doc={latestDoc} />
      </EditorProvider>
    );

    const panel = screen.getByTestId("ppt-insert-panel");
    fireEvent.click(within(panel).getAllByRole("button", { name: /图片/ })[0]!);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("missing image file input");
    }
    fireEvent.change(input, {
      target: {
        files: [new File(["png"], "topology.png", { type: "image/png" })]
      }
    });

    await waitFor(() => {
      const slide = latestDoc.root.children?.[0];
      const imageNode = (slide?.children ?? []).find((node) => node.kind === "image");
      expect(imageNode?.kind).toBe("image");
      expect((imageNode?.props as Record<string, unknown> | undefined)?.assetId).toBe("asset_ppt_image");
      expect(latestDoc.assets?.some((asset) => asset.assetId === "asset_ppt_image")).toBe(true);
    });
  });
});
