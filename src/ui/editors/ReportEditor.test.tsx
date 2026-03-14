import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createReportDoc, defaultChartSpec } from "../../core/doc/defaults";
import { encodeCopilotArtifact } from "../copilot/copilot-artifact-dnd";
import { CopilotProvider, useCopilot } from "../copilot/copilot-context";
import type { CopilotArtifactResultItem } from "../copilot/copilot-results";
import { findNodeById } from "../utils/node-tree";
import { registerEditorTelemetrySink, resetEditorTelemetryContext, type EditorTelemetryEvent } from "../telemetry/editor-telemetry";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { ReportEditor } from "./ReportEditor";

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

function LiveReportEditor(): JSX.Element | null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  if (!doc) {
    return null;
  }
  return <ReportEditor doc={doc} />;
}

function CopilotSpotlightObserver(): JSX.Element {
  const { spotlight } = useCopilot();
  return <span data-testid="copilot-spotlight-node">{spotlight?.nodeId ?? ""}</span>;
}

function CopilotSpotlightTrigger({ docId, nodeId }: { docId: string; nodeId: string }): JSX.Element {
  const { spotlightNode } = useCopilot();
  return <button onClick={() => spotlightNode(docId, nodeId)}>触发 Copilot 高亮</button>;
}

function UiSeeder({ openReportInsertPanel = false }: { openReportInsertPanel?: boolean }): null {
  const store = useEditorStore();
  useEffect(() => {
    if (openReportInsertPanel) {
      store.setReportInsertPanelOpen(true);
    }
  }, [openReportInsertPanel, store]);
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

afterEach(() => {
  resetEditorTelemetryContext();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  disconnect(): void {}
  observe(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
});

const openAdvancedLayout = (): void => {
  const toggle = screen.getAllByRole("button", { name: /高级排版|收起高级排版/ })[0];
  if (toggle && /高级排版/.test(toggle.textContent ?? "")) {
    fireEvent.click(toggle);
  }
};

const createRowActionDoc = (): VDoc => {
  const doc = createReportDoc();
  doc.dataSources = [
    {
      id: "ds_alarm",
      type: "static",
      staticData: [
        { day: "Mon", alarm_count: 12 },
        { day: "Tue", alarm_count: 16 }
      ]
    }
  ];
  doc.queries = [{ queryId: "q_alarm", sourceId: "ds_alarm", kind: "static" }];
  const firstSection = doc.root.children?.[0];
  if (!firstSection) {
    throw new Error("missing first section");
  }
  firstSection.children = [
    {
      id: "chart_left",
      kind: "chart",
      layout: { mode: "grid", gx: 0, gy: 0, gw: 6, gh: 4 },
      data: { sourceId: "ds_alarm", queryId: "q_alarm" },
      props: defaultChartSpec("左图")
    },
    {
      id: "chart_right",
      kind: "chart",
      layout: { mode: "grid", gx: 6, gy: 0, gw: 6, gh: 4 },
      data: { sourceId: "ds_alarm", queryId: "q_alarm" },
      props: defaultChartSpec("右图")
    },
    {
      id: "text_story",
      kind: "text",
      layout: { mode: "grid", gx: 0, gy: 1, gw: 12, gh: 4 },
      props: { text: "这里是说明文字。", format: "plain" }
    }
  ];
  doc.root.children?.forEach((section) => {
    section.children?.forEach((node) => {
      if (node.kind !== "section") {
        node.data = { sourceId: "ds_alarm", queryId: "q_alarm" };
      }
    });
  });
  return doc;
};

const createGapCanvasDoc = (): VDoc => {
  const doc = createRowActionDoc();
  const chartRight = findNodeById(doc.root, "chart_right");
  if (chartRight?.layout) {
    chartRight.layout.gy = 3;
  }
  return doc;
};

describe("ReportEditor insertion anchors", () => {
  it("inserts preset blocks from the section preset bar and emits semantic telemetry", async () => {
    let latestDoc = createReportDoc();
    latestDoc.root.children = [structuredClone(latestDoc.root.children?.[0]!)];
    latestDoc.dataSources = [
      {
        id: "ds_alarm",
        type: "static",
        staticData: [
          { day: "Mon", alarm_count: 12 },
          { day: "Tue", alarm_count: 16 }
        ]
      }
    ];
    latestDoc.queries = [{ queryId: "q_alarm", sourceId: "ds_alarm", kind: "static" }];
    const firstSection = latestDoc.root.children?.[0];
    if (firstSection) {
      firstSection.children = [];
    }
    firstSection?.children?.forEach((node) => {
      node.data = { sourceId: "ds_alarm", queryId: "q_alarm" };
    });
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveReportEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "本章开头插入：单图" }));

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      expect(firstSection?.kind).toBe("section");
      expect(firstSection?.children).toHaveLength(1);
      expect(firstSection?.children?.[0]?.kind).toBe("chart");
      expect(firstSection?.children?.[0]?.layout?.gy).toBe(0);
    });

    dispose();
    expect(events.some((event) => event.surface === "report_editor" && event.stage === "apply" && event.action === "insert_row_template")).toBe(true);
    const applied = events.find((event) => event.stage === "apply" && event.action === "insert_row_template");
    expect(applied?.context.presetId).toBe("chart_single");
    expect(applied?.semanticAction?.action).toBe("insert_row_template");
  });

  it("adds a chart from row toolbar and emits row semantic telemetry", async () => {
    let latestDoc = createRowActionDoc();
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <CopilotProvider>
        <CopilotSpotlightObserver />
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <LiveReportEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    openAdvancedLayout();
    fireEvent.click(within(screen.getAllByTestId("report-row-actions-gy_0")[0]!).getByRole("button", { name: "加一张图" }));

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      expect(firstSection?.children).toHaveLength(4);
      const rowZeroNodes = firstSection?.children?.filter((node) => node.layout?.gy === 0) ?? [];
      expect(rowZeroNodes).toHaveLength(3);
      expect(rowZeroNodes.map((node) => node.layout?.gw)).toEqual([4, 4, 4]);
    });

    dispose();
    expect(events.some((event) => event.stage === "apply" && event.action === "insert_block")).toBe(true);
    expect(events.find((event) => event.stage === "apply" && event.action === "insert_block")?.context.rowId).toBe("gy_0");
  });

  it("does not open a blank-click insert popover on the section canvas", async () => {
    let latestDoc = createRowActionDoc();

    await act(async () => {
      render(
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <ReportEditor doc={latestDoc} />
        </EditorProvider>
      );
      await Promise.resolve();
    });

    const page = screen.getByTestId(`report-canvas-page-${latestDoc.root.children?.[0]?.id}-0`);
    fireEvent.mouseDown(page, { clientX: 120, clientY: 32 });
    fireEvent.mouseUp(page, { clientX: 120, clientY: 32 });

    expect(screen.queryByText("在这里插入")).toBeNull();
    expect(screen.queryByTestId(`report-insert-preview-${latestDoc.root.children?.[0]?.id}-0`)).toBeNull();
  });

  it("inserts a report block from the shared side insert panel", async () => {
    let latestDoc = createRowActionDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <UiSeeder openReportInsertPanel />
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    fireEvent.click(within(screen.getByTestId("report-insert-panel")).getByRole("button", { name: /折线图/ }));

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      const inserted = firstSection?.children?.find((node) => node.id !== "chart_left" && node.id !== "chart_right" && node.kind === "chart");
      expect(inserted?.kind).toBe("chart");
      expect(String((inserted?.props as Record<string, unknown> | undefined)?.titleText ?? "")).toContain("折线图");
    });
  });

  it("supports dragging an insert item onto the section canvas", async () => {
    let latestDoc = createRowActionDoc();
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <EditorProvider initialDoc={latestDoc}>
        <UiSeeder openReportInsertPanel />
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const panel = screen.getByTestId("report-insert-panel");
    const page = screen.getByTestId(`report-canvas-page-${latestDoc.root.children?.[0]?.id}-0`);
    const item = within(panel).getAllByRole("button", { name: /柱状图/ })[0]!;
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(item, { dataTransfer });
    fireEvent.dragOver(page, { dataTransfer, clientX: 360, clientY: 240 });

    await waitFor(() => {
      expect(screen.getByTestId(`report-insert-preview-${latestDoc.root.children?.[0]?.id}-0`)).toBeTruthy();
    });

    fireEvent.drop(page, { dataTransfer, clientX: 360, clientY: 240 });

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      const inserted = (firstSection?.children ?? []).find(
        (node) => node.id !== "chart_left" && node.id !== "chart_right" && node.kind === "chart" && String((node.props as Record<string, unknown> | undefined)?.chartType ?? "") === "bar"
      );
      expect(inserted?.kind).toBe("chart");
    });

    dispose();
    expect(events.some((event) => event.stage === "apply" && event.action === "insert_block_on_canvas")).toBe(true);
  });

  it("replaces the target report section when dropping a copilot section artifact onto it", async () => {
    let latestDoc = createReportDoc();
    const originalSectionId = latestDoc.root.children?.[0]?.id;
    if (!originalSectionId) {
      throw new Error("missing first section");
    }
    const dataTransfer = createDataTransfer();
    const artifact: CopilotArtifactResultItem = {
      resultId: "artifact_result_report_1",
      sceneId: "detail:runtime:view",
      threadId: "thread_report_demo",
      docId: latestDoc.docId,
      docType: "report",
      originSceneKind: "report_runtime",
      originRouteMode: "view",
      originLabel: "Report 运行态",
      kind: "artifact",
      title: "AI 风险总结",
      summary: "已从运行态洞察转成章节草稿",
      createdAt: "2026-03-12T00:00:00Z",
      updatedAt: "2026-03-12T00:00:00Z",
      jobId: "job_runtime_report",
      unitId: "unit_runtime_report",
      artifactId: "artifact_report_demo",
      artifactKind: "section",
      node: {
        id: "section_artifact_demo",
        kind: "section",
        props: { title: "AI 风险总结" },
        children: [
          {
            id: "text_artifact_demo",
            kind: "text",
            props: { text: "这是来自 Copilot 的章节替换内容。", format: "plain" }
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
          <LiveReportEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const sectionShell = document.querySelectorAll(".report-section-canvas-shell")[0];
    if (!(sectionShell instanceof HTMLDivElement)) {
      throw new Error("missing first report section shell");
    }
    encodeCopilotArtifact(dataTransfer, artifact);

    fireEvent.dragOver(sectionShell, { dataTransfer });
    expect(screen.getByTestId(`report-artifact-drop-banner-${originalSectionId}`)).toBeTruthy();
    expect(screen.getByText("Copilot 章节草稿")).toBeTruthy();
    fireEvent.drop(sectionShell, { dataTransfer });

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      expect(firstSection?.kind).toBe("section");
      expect(firstSection?.id).not.toBe(originalSectionId);
      expect(firstSection?.id).not.toBe("section_artifact_demo");
      expect((firstSection?.props as Record<string, unknown> | undefined)?.title).toBe("1. 总览");
      expect(firstSection?.children?.[0]?.id).not.toBe("text_artifact_demo");
      expect(firstSection?.children?.[0]?.props).toMatchObject({ text: "这是来自 Copilot 的章节替换内容。" });
    });

    const appliedSectionId = latestDoc.root.children?.[0]?.id;
    await waitFor(() => expect(screen.getByTestId("copilot-spotlight-node").textContent).toBe(appliedSectionId));
  });

  it("inserts a copilot section artifact before the target report section", async () => {
    let latestDoc = createReportDoc();
    const originalSectionId = latestDoc.root.children?.[0]?.id;
    if (!originalSectionId) {
      throw new Error("missing first section");
    }
    const dataTransfer = createDataTransfer();
    const artifact: CopilotArtifactResultItem = {
      resultId: "artifact_result_report_before_1",
      sceneId: "detail:runtime:view",
      threadId: "thread_report_demo",
      docId: latestDoc.docId,
      docType: "report",
      originSceneKind: "report_runtime",
      originRouteMode: "view",
      originLabel: "Report 运行态",
      kind: "artifact",
      title: "AI 前插章节",
      summary: "已从运行态洞察转成章节草稿",
      createdAt: "2026-03-12T00:00:00Z",
      updatedAt: "2026-03-12T00:00:00Z",
      jobId: "job_runtime_report_before",
      unitId: "unit_runtime_report_before",
      artifactId: "artifact_report_before_demo",
      artifactKind: "section",
      node: {
        id: "section_artifact_before_demo",
        kind: "section",
        props: { title: "AI 前插章节" },
        children: [
          {
            id: "text_artifact_before_demo",
            kind: "text",
            props: { text: "这是来自 Copilot 的前插章节内容。", format: "plain" }
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
          <LiveReportEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    const beforeAnchor = screen.getByTestId(`report-artifact-drop-before-${originalSectionId}`);
    encodeCopilotArtifact(dataTransfer, artifact);

    fireEvent.dragOver(beforeAnchor, { dataTransfer });
    expect(beforeAnchor.textContent).toContain("松开插入到本章节前");
    fireEvent.drop(beforeAnchor, { dataTransfer });

    await waitFor(() => {
      expect(latestDoc.root.children).toHaveLength(3);
      const firstSection = latestDoc.root.children?.[0];
      const secondSection = latestDoc.root.children?.[1];
      expect(firstSection?.kind).toBe("section");
      expect(firstSection?.id).not.toBe(originalSectionId);
      expect(firstSection?.id).not.toBe("section_artifact_before_demo");
      expect((firstSection?.props as Record<string, unknown> | undefined)?.title).toBe("AI 前插章节");
      expect(firstSection?.children?.[0]?.id).not.toBe("text_artifact_before_demo");
      expect(firstSection?.children?.[0]?.props).toMatchObject({ text: "这是来自 Copilot 的前插章节内容。" });
      expect(secondSection?.id).toBe(originalSectionId);
    });

    const appliedSectionId = latestDoc.root.children?.[0]?.id;
    await waitFor(() => expect(screen.getByTestId("copilot-spotlight-node").textContent).toBe(appliedSectionId));
  });

  it("highlights the focused report section when Copilot targets it", async () => {
    const latestDoc = createReportDoc();
    const targetSectionId = latestDoc.root.children?.[0]?.id;
    if (!targetSectionId) {
      throw new Error("missing first section");
    }

    render(
      <CopilotProvider>
        <CopilotSpotlightTrigger docId={latestDoc.docId} nodeId={targetSectionId} />
        <EditorProvider initialDoc={latestDoc}>
          <LiveReportEditor />
        </EditorProvider>
      </CopilotProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "触发 Copilot 高亮" }));

    await waitFor(() => {
      expect(document.querySelector(".report-section-canvas-shell.is-copilot-spotlight")).toBeTruthy();
    });
  });

  it("uploads an image from the side insert panel and inserts it into the section canvas", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "asset_report_image",
        name: "拓扑图",
        originalFileName: "report-topology.png",
        fileUrl: "/files/assets/asset_report_image",
        mimeType: "image/png",
        widthPx: 800,
        heightPx: 480,
        sizeBytes: 4096
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    let latestDoc = createRowActionDoc();

    const { container } = render(
      <EditorProvider initialDoc={latestDoc}>
        <UiSeeder openReportInsertPanel />
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const panel = screen.getByTestId("report-insert-panel");
    fireEvent.click(within(panel).getAllByRole("button", { name: /图片/ })[0]!);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("missing image file input");
    }
    fireEvent.change(input, {
      target: {
        files: [new File(["png"], "report-topology.png", { type: "image/png" })]
      }
    });

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      const imageNode = (firstSection?.children ?? []).find((node) => node.kind === "image");
      expect(imageNode?.kind).toBe("image");
      expect((imageNode?.props as Record<string, unknown> | undefined)?.assetId).toBe("asset_report_image");
      expect(latestDoc.assets?.some((asset) => asset.assetId === "asset_report_image")).toBe(true);
    });
  });

  it("still loads report endpoint data on first render under StrictMode", async () => {
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

    const latestDoc = createReportDoc();
    latestDoc.root.children = [
      {
        id: "report_strict_prefetch_section",
        kind: "section",
        props: { title: "趋势页" },
        children: [
          {
            id: "report_strict_prefetch_chart",
            kind: "chart",
            props: {
              ...defaultChartSpec("趋势图"),
              bindings: [
                { role: "x", field: "ts" },
                { role: "y", field: "critical", agg: "sum" }
              ]
            },
            data: { endpointId: "ops_alarm_trend" }
          }
        ]
      }
    ];

    render(
      <StrictMode>
        <EditorProvider initialDoc={latestDoc}>
          <ReportEditor doc={latestDoc} />
        </EditorProvider>
      </StrictMode>
    );

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it("shows row layout preview on preset hover", async () => {
    let latestDoc = createRowActionDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    openAdvancedLayout();
    fireEvent.mouseEnter(within(screen.getAllByTestId("report-row-actions-gy_0")[0]!).getByRole("button", { name: "左宽" }));

    await waitFor(() => {
      const preview = screen.getAllByTestId("report-row-preview-gy_0")[0];
      expect(preview?.textContent ?? "").toContain("左图");
      expect(preview?.textContent ?? "").toContain("7/12");
    });
  });

  it("reorders row blocks by drag and drop and emits move telemetry", async () => {
    let latestDoc = createRowActionDoc();
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    openAdvancedLayout();
    const leftCell = screen.getAllByTestId("report-row-cell-gy_0-chart_left")[0]!;
    const rightCell = screen.getAllByTestId("report-row-cell-gy_0-chart_right")[0]!;

    fireEvent.dragStart(leftCell);
    fireEvent.dragOver(rightCell);

    await waitFor(() => {
      expect(screen.getAllByText("拖拽预览")[0]).toBeTruthy();
    });

    fireEvent.drop(rightCell);
    fireEvent.dragEnd(leftCell);

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      const chartLeft = firstSection?.children?.find((node) => node.id === "chart_left");
      const chartRight = firstSection?.children?.find((node) => node.id === "chart_right");
      expect(chartLeft?.layout?.gx).toBe(6);
      expect(chartRight?.layout?.gx).toBe(0);
    });

    dispose();
    expect(events.some((event) => event.stage === "apply" && event.action === "move_block")).toBe(true);
    expect(events.find((event) => event.stage === "apply" && event.action === "move_block")?.triggerSource).toBe("drag_drop");
  });

  it("moves a canvas block by dragging the selected block itself", async () => {
    let latestDoc = createRowActionDoc();
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const block = screen.getByTestId("report-canvas-block-chart_left");
    fireEvent.pointerDown(block, { clientX: 120, clientY: 140 });
    fireEvent.mouseMove(window, { clientX: 520, clientY: 160 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const chartLeft = findNodeById(latestDoc.root, "chart_left");
      expect(chartLeft).toBeTruthy();
      expect(Number(chartLeft?.layout?.gx)).toBeGreaterThanOrEqual(5);
    });

    dispose();
    expect(events.some((event) => event.stage === "apply" && event.action === "move_block_on_canvas")).toBe(true);
  });

  it("supports marquee multi selection on the section canvas", async () => {
    let latestDoc = createRowActionDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const sectionId = latestDoc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section id");
    }
    const page = screen.getByTestId(`report-canvas-page-${sectionId}-0`);
    fireEvent.mouseDown(page, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(page, { clientX: 920, clientY: 340 });
    fireEvent.mouseUp(page, { clientX: 920, clientY: 340 });

    await waitFor(() => {
      const toolbar = screen.getByTestId(`report-canvas-toolbar-${sectionId}`);
      expect(within(toolbar).getByText("已选 2 项")).toBeTruthy();
    });
  });

  it("duplicates a canvas block via alt drag", async () => {
    let latestDoc = createRowActionDoc();
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const block = screen.getByTestId("report-canvas-block-chart_left");
    fireEvent.pointerDown(block, { clientX: 120, clientY: 140, altKey: true, getModifierState: (key: string) => key === "Alt" });
    fireEvent.mouseMove(window, { clientX: 520, clientY: 160, altKey: true });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      const duplicated = (firstSection?.children ?? []).find(
        (node) => node.id !== "chart_left" && node.kind === "chart" && String((node.props as Record<string, unknown> | undefined)?.titleText ?? "") === "左图"
      );
      expect(firstSection?.children).toHaveLength(4);
      expect(duplicated).toBeTruthy();
      expect(Number(duplicated?.layout?.gx)).toBeGreaterThanOrEqual(5);
      const original = findNodeById(latestDoc.root, "chart_left");
      expect(Number(original?.layout?.gx)).toBe(0);
    });

    dispose();
    expect(events.some((event) => event.stage === "apply" && event.action === "duplicate_block_on_canvas")).toBe(true);
  });

  it("supports shift-add canvas selection and clears it with escape", async () => {
    let latestDoc = createRowActionDoc();
    const sectionId = latestDoc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section id");
    }

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const page = screen.getByTestId(`report-canvas-page-${sectionId}-0`);
    fireEvent.mouseDown(page, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(page, { clientX: 430, clientY: 330 });
    fireEvent.mouseUp(page, { clientX: 430, clientY: 330 });
    fireEvent.mouseDown(page, { clientX: 20, clientY: 360, shiftKey: true });
    fireEvent.mouseMove(page, { clientX: 920, clientY: 660, shiftKey: true });
    fireEvent.mouseUp(page, { clientX: 920, clientY: 660, shiftKey: true });

    await waitFor(() => {
      const toolbar = screen.getByTestId(`report-canvas-toolbar-${sectionId}`);
      expect(within(toolbar).getByText("已选 2 项")).toBeTruthy();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("已选 2 项")).toBeNull();
    });
  });

  it("moves selected canvas blocks together by dragging one selected block", async () => {
    let latestDoc = createRowActionDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const sectionId = latestDoc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section id");
    }
    const page = screen.getByTestId(`report-canvas-page-${sectionId}-0`);
    fireEvent.mouseDown(page, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(page, { clientX: 920, clientY: 340 });
    fireEvent.mouseUp(page, { clientX: 920, clientY: 340 });

    const block = screen.getByTestId("report-canvas-block-chart_left");
    fireEvent.pointerDown(block, { clientX: 120, clientY: 140 });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 420 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const chartLeft = findNodeById(latestDoc.root, "chart_left");
      const chartRight = findNodeById(latestDoc.root, "chart_right");
      expect(Number(chartLeft?.layout?.gy)).toBeGreaterThan(0);
      expect(chartLeft?.layout?.gy).toBe(chartRight?.layout?.gy);
    });
  });

  it("duplicates selected canvas blocks together via alt drag", async () => {
    let latestDoc = createRowActionDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const sectionId = latestDoc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section id");
    }
    const page = screen.getByTestId(`report-canvas-page-${sectionId}-0`);
    fireEvent.mouseDown(page, { clientX: 20, clientY: 20 });
    fireEvent.mouseMove(page, { clientX: 920, clientY: 340 });
    fireEvent.mouseUp(page, { clientX: 920, clientY: 340 });

    const block = screen.getByTestId("report-canvas-block-chart_left");
    fireEvent.pointerDown(block, { clientX: 120, clientY: 140, altKey: true, getModifierState: (key: string) => key === "Alt" });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 420, altKey: true });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      const leftCharts = (firstSection?.children ?? []).filter(
        (node) => node.kind === "chart" && String((node.props as Record<string, unknown> | undefined)?.titleText ?? "") === "左图"
      );
      const rightCharts = (firstSection?.children ?? []).filter(
        (node) => node.kind === "chart" && String((node.props as Record<string, unknown> | undefined)?.titleText ?? "") === "右图"
      );
      expect(firstSection?.children).toHaveLength(5);
      expect(leftCharts).toHaveLength(2);
      expect(rightCharts).toHaveLength(2);
    });
  });

  it("resizes a canvas block via the resize handle", async () => {
    let latestDoc = createRowActionDoc();
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const resizeHandle = screen.getByRole("button", { name: "缩放画布块：左图" });
    fireEvent.pointerDown(resizeHandle, { clientX: 360, clientY: 320 });
    fireEvent.mouseMove(window, { clientX: 620, clientY: 430 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const chartLeft = findNodeById(latestDoc.root, "chart_left");
      expect(chartLeft).toBeTruthy();
      expect(Number(chartLeft?.layout?.gw)).toBeGreaterThan(6);
    });

    dispose();
    expect(events.some((event) => event.stage === "apply" && event.action === "resize_block_on_canvas")).toBe(true);
  });

  it("keeps the section canvas toolbar lightweight for multi selection", async () => {
    let latestDoc = createRowActionDoc();

    await act(async () => {
      render(
        <EditorProvider initialDoc={latestDoc}>
          <DocObserver
            onDoc={(doc) => {
              latestDoc = structuredClone(doc);
            }}
          />
          <ReportEditor doc={latestDoc} />
        </EditorProvider>
      );
      await Promise.resolve();
    });

    const chartSurface = screen.getByTestId("report-canvas-block-chart_left").querySelector(".report-node-surface");
    const textSurface = screen.getByTestId("report-canvas-block-text_story").querySelector(".report-node-surface");
    if (!(chartSurface instanceof HTMLElement) || !(textSurface instanceof HTMLElement)) {
      throw new Error("missing block surfaces");
    }

    fireEvent.click(textSurface);
    fireEvent.click(chartSurface, { ctrlKey: true });

    const sectionId = latestDoc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section id");
    }
    const toolbar = screen.getByTestId(`report-canvas-toolbar-${sectionId}`);
    expect(within(toolbar).getByText("已选 2 项")).toBeTruthy();
    expect(within(toolbar).queryByRole("button", { name: "等宽" })).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: "等高" })).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: "横向均分" })).toBeNull();
  });

  it("auto tidies a section canvas from the toolbar", async () => {
    let latestDoc = createGapCanvasDoc();
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    const sectionId = latestDoc.root.children?.[0]?.id;
    if (!sectionId) {
      throw new Error("missing section id");
    }
    const toolbar = screen.getByTestId(`report-canvas-toolbar-${sectionId}`);
    fireEvent.click(within(toolbar).getByRole("button", { name: "自动整理" }));

    await waitFor(() => {
      const chartRight = findNodeById(latestDoc.root, "chart_right");
      expect(Number(chartRight?.layout?.gy)).toBe(2);
    });

    dispose();
    expect(events.some((event) => event.stage === "apply" && event.action === "auto_tidy_section")).toBe(true);
  });

  it("moves a block across rows via insertion line", async () => {
    let latestDoc = createRowActionDoc();
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <ReportEditor doc={latestDoc} />
      </EditorProvider>
    );

    openAdvancedLayout();
    const leftCell = screen.getAllByTestId("report-row-cell-gy_0-chart_left")[0]!;
    const afterLine = screen.getAllByTestId("report-row-drop-after-gy_1")[0]!;

    fireEvent.dragStart(leftCell);
    fireEvent.dragOver(afterLine);

    await waitFor(() => {
      expect(screen.getAllByText("插入到此行后")[0]).toBeTruthy();
    });

    fireEvent.drop(afterLine);
    fireEvent.dragEnd(leftCell);

    await waitFor(() => {
      const firstSection = latestDoc.root.children?.[0];
      const chartLeft = firstSection?.children?.find((node) => node.id === "chart_left");
      const chartRight = firstSection?.children?.find((node) => node.id === "chart_right");
      const textStory = firstSection?.children?.find((node) => node.id === "text_story");
      expect(chartRight?.layout?.gy).toBe(0);
      expect(chartRight?.layout?.gw).toBe(12);
      expect(textStory?.layout?.gy).toBe(1);
      expect(chartLeft?.layout?.gy).toBe(2);
      expect(chartLeft?.layout?.gw).toBe(12);
    });

    dispose();
    const applied = events.find((event) => event.stage === "apply" && event.action === "move_block" && event.meta?.placement === "after");
    expect(applied?.triggerSource).toBe("drag_drop");
    expect(applied?.context.rowId).toBe("gy_1");
  });
});
