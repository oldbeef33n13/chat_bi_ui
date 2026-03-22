import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardDoc, createPptDoc, createReportDoc } from "../../core/doc/defaults";
import { CopilotProvider, useCopilot } from "../copilot/copilot-context";
import { DocRuntimeView } from "./DocRuntimeView";

vi.mock("../../runtime/chart/EChartView", () => ({
  EChartView: () => <div data-testid="echart-mock" />
}));

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function CopilotSceneObserver(): JSX.Element {
  const { scene } = useCopilot();
  return (
    <div data-testid="copilot-runtime-scene">
      {JSON.stringify({
        objectId: scene.objectId ?? null,
        objectLabel: scene.objectLabel ?? null,
        sectionLabel: scene.sectionLabel ?? null,
        slideLabel: scene.slideLabel ?? null
      })}
    </div>
  );
}

describe("DocRuntimeView global props", () => {
  it("does not render a duplicate runtime header for chart cards with intrinsic titles", async () => {
    const doc = createDashboardDoc();

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(screen.queryByText("告警趋势")).toBeNull();
      expect(screen.getAllByTestId("echart-mock").length).toBeGreaterThan(0);
    });
  });

  it("renders the built-in report chart with sample data", async () => {
    const doc = createReportDoc();

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(screen.getAllByTestId("echart-mock").length).toBeGreaterThan(0);
    });
  });

  it("renders the built-in ppt chart with sample data", async () => {
    const doc = createPptDoc();

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(screen.getAllByTestId("echart-mock").length).toBeGreaterThan(0);
    });
  });

  it("syncs dashboard runtime card selection into Copilot context", async () => {
    const doc = createDashboardDoc();
    const targetNode = doc.root.children?.[1];
    expect(targetNode).toBeTruthy();

    render(
      <CopilotProvider>
        <CopilotSceneObserver />
        <DocRuntimeView doc={doc} />
      </CopilotProvider>
    );

    const targetCard = await screen.findByTestId(`runtime-dashboard-node-${targetNode!.id}`);
    fireEvent.click(targetCard);

    await waitFor(() => {
      expect(targetCard.classList.contains("is-runtime-selected")).toBe(true);
      expect(screen.getByTestId("copilot-runtime-scene").textContent).toContain(targetNode!.id);
    });
  });

  it("renders dashboard header/footer from root props", async () => {
    const doc = createDashboardDoc();
    doc.root.children = [
      {
        id: "text_dashboard_runtime",
        kind: "text",
        props: { text: "runtime dashboard text", format: "plain" },
        layout: { mode: "grid", gx: 0, gy: 0, gw: 6, gh: 4 }
      }
    ];
    doc.root.props = {
      ...(doc.root.props ?? {}),
      headerShow: true,
      headerText: "Dashboard 页眉测试",
      footerShow: true,
      footerText: "Dashboard 页脚测试"
    };

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(screen.queryByText("Dashboard 页眉测试")).not.toBeNull();
      expect(screen.queryByText("Dashboard 页脚测试")).not.toBeNull();
    });
  });

  it("renders report header/footer on non-section pages", async () => {
    const doc = createReportDoc();
    doc.root.children = [
      {
        id: "section_runtime_report",
        kind: "section",
        props: { title: "章节1" },
        children: [
          {
            id: "text_runtime_report",
            kind: "text",
            props: { text: "report text", format: "plain" }
          }
        ]
      }
    ];
    doc.root.props = {
      ...(doc.root.props ?? {}),
      headerShow: true,
      footerShow: true,
      headerText: "Report 页眉测试",
      footerText: "Report 页脚测试",
      tocShow: true,
      coverEnabled: true,
      summaryEnabled: true
    };

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(screen.getAllByText("Report 页眉测试").length).toBeGreaterThanOrEqual(4);
      expect(screen.getAllByText("Report 页脚测试").length).toBeGreaterThanOrEqual(4);
    });
  });

  it("syncs report runtime block selection into Copilot context", async () => {
    const doc = createReportDoc();
    const section = doc.root.children?.find((node) => node.kind === "section");
    const targetNode = section?.children?.find((node) => node.kind === "chart" || node.kind === "text" || node.kind === "table");
    expect(section).toBeTruthy();
    expect(targetNode).toBeTruthy();

    render(
      <CopilotProvider>
        <CopilotSceneObserver />
        <DocRuntimeView doc={doc} />
      </CopilotProvider>
    );

    const targetBlock = await screen.findByTestId(`runtime-report-node-${targetNode!.id}`);
    fireEvent.click(targetBlock);

    await waitFor(() => {
      expect(targetBlock.classList.contains("is-runtime-selected")).toBe(true);
      expect(screen.getByTestId("copilot-runtime-scene").textContent).toContain(targetNode!.id);
      expect(screen.getByTestId("copilot-runtime-scene").textContent).toContain(String((section?.props as Record<string, unknown>)?.title ?? ""));
    });
  });

  it("applies report header/footer text styles in runtime", async () => {
    const doc = createReportDoc();
    doc.root.children = [
      {
        id: "section_runtime_report_style",
        kind: "section",
        props: { title: "章节1" },
        children: [{ id: "text_runtime_report_style", kind: "text", props: { text: "report text", format: "plain" } }]
      }
    ];
    doc.root.props = {
      ...(doc.root.props ?? {}),
      headerShow: true,
      footerShow: true,
      headerText: "Report 样式页眉",
      footerText: "Report 样式页脚",
      headerStyle: { fg: "#ef4444", fontSize: 18, bold: true },
      footerStyle: { fg: "#0f766e", fontSize: 14 },
      tocShow: false,
      coverEnabled: false,
      summaryEnabled: false
    };

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      const header = screen.getByText("Report 样式页眉");
      const footer = screen.getByText("Report 样式页脚");
      expect(header.getAttribute("style") ?? "").toContain("font-size: 18px");
      expect(footer.getAttribute("style") ?? "").toContain("font-size: 14px");
    });
  });

  it("renders ppt master header/footer in runtime", async () => {
    const doc = createPptDoc();
    const firstSlide = (doc.root.children ?? []).find((item) => item.kind === "slide");
    if (firstSlide) {
      firstSlide.children = [
        {
          id: "text_runtime_ppt",
          kind: "text",
          props: { text: "ppt text", format: "plain" },
          layout: { mode: "absolute", x: 80, y: 120, w: 300, h: 120, z: 1 }
        }
      ];
    }
    doc.root.props = {
      ...(doc.root.props ?? {}),
      masterShowHeader: true,
      masterHeaderText: "PPT 页眉测试",
      masterShowFooter: true,
      masterFooterText: "PPT 页脚测试",
      masterPaddingXPx: 40,
      masterHeaderTopPx: 18,
      masterFooterBottomPx: 16
    };

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      const header = screen.getByText("PPT 页眉测试");
      const footer = screen.getByText("PPT 页脚测试");
      expect(header).not.toBeNull();
      expect(footer).not.toBeNull();
      const headerHost = header.closest(".runtime-ppt-master-header") as HTMLDivElement | null;
      const footerHost = footer.closest(".runtime-ppt-master-footer") as HTMLDivElement | null;
      expect(headerHost?.style.left).toBe("40px");
      expect(headerHost?.style.top).toBe("18px");
      expect(footerHost?.style.bottom).toBe("16px");
    });
  });

  it("renders ppt runtime without editor overlay chrome and keeps parallel node positions", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "ops_alarm_trend",
        rows: [
          { time: "2026-03-01", value: 12 },
          { time: "2026-03-02", value: 18 }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const doc = createPptDoc();
    const firstSlide = (doc.root.children ?? []).find((item) => item.kind === "slide");
    if (!firstSlide) {
      throw new Error("missing slide");
    }
    firstSlide.children = [
      {
        id: "chart_runtime_ppt_left",
        kind: "chart",
        props: {
          titleText: "左侧图表",
          chartType: "line",
          bindings: [
            { role: "x", field: "time" },
            { role: "y", field: "value", agg: "sum" }
          ]
        },
        data: { endpointId: "ops_alarm_trend" },
        layout: { mode: "absolute", x: 40, y: 96, w: 400, h: 220, z: 1 }
      },
      {
        id: "chart_runtime_ppt_right",
        kind: "chart",
        props: {
          titleText: "右侧图表",
          chartType: "bar",
          bindings: [
            { role: "x", field: "time" },
            { role: "y", field: "value", agg: "sum" }
          ]
        },
        data: { endpointId: "ops_alarm_trend" },
        layout: { mode: "absolute", x: 480, y: 96, w: 400, h: 220, z: 1 }
      }
    ];

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(screen.queryAllByTestId("echart-mock")).toHaveLength(2);
    });

    expect(screen.queryByRole("button", { name: "图表智能追问" })).toBeNull();
    const nodes = Array.from(document.querySelectorAll(".runtime-slide-node")) as HTMLDivElement[];
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.style.position).toBe("absolute");
    expect(nodes[1]?.style.position).toBe("absolute");
    expect(nodes[0]?.style.top).toBe("96px");
    expect(nodes[1]?.style.top).toBe("96px");
  });

  it("shows runtime ask icon in chart header and supports switch off", async () => {
    const originalResizeObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    };
    const doc = createDashboardDoc();
    const charts = (doc.root.children ?? []).filter((item) => item.kind === "chart");
    charts.forEach((chart) => {
      chart.props = { ...(chart.props as Record<string, unknown>), runtimeAskEnabled: true };
    });
    const view = render(<DocRuntimeView doc={doc} />);
    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: "图表智能追问" }).length).toBeGreaterThan(0);
    });

    const doc2 = createDashboardDoc();
    const charts2 = (doc2.root.children ?? []).filter((item) => item.kind === "chart");
    charts2.forEach((chart) => {
      chart.props = { ...(chart.props as Record<string, unknown>), runtimeAskEnabled: false };
    });
    view.rerender(<DocRuntimeView doc={doc2} />);
    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: "图表智能追问" })).toHaveLength(0);
    });
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalResizeObserver;
  });

  it("renders dashboard embedded image assets in runtime", async () => {
    const doc = createDashboardDoc();
    doc.assets = [
      {
        assetId: "asset_runtime_image",
        type: "image",
        name: "runtime.png",
        uri: "data:image/png;base64,ZmFrZQ=="
      }
    ];
    doc.root.children = [
      {
        id: "image_runtime_node",
        kind: "image",
        props: { assetId: "asset_runtime_image", title: "运行态图片", fit: "contain" },
        layout: { mode: "absolute", x: 24, y: 24, w: 240, h: 120, z: 1 }
      }
    ];

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      const image = screen.getByAltText("runtime.png") as HTMLImageElement;
      expect(image.src).toContain("data:image/png;base64,ZmFrZQ==");
    });
  });

  it("loads rows from dynamic data endpoint in runtime", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "ops_alarm_trend",
        requestEcho: { region: "north" },
        resultSchema: [
          { name: "ts", type: "date", label: "日期" },
          { name: "critical", type: "number", label: "严重告警" }
        ],
        rows: [
          { ts: "2026-03-01", critical: 12 },
          { ts: "2026-03-02", critical: 18 }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const doc = createDashboardDoc();
    const chart = (doc.root.children ?? []).find((item) => item.kind === "chart");
    if (!chart) {
      throw new Error("missing chart");
    }
    chart.data = {
      endpointId: "ops_alarm_trend",
      paramBindings: {
        region: { from: "const", value: "north" }
      }
    };

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(screen.queryAllByTestId("echart-mock").length).toBeGreaterThan(0);
    });
  });

  it("still loads visible runtime endpoint nodes under StrictMode", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("ops_alarm_trend")) {
        return createJsonResponse({
          id: "ops_alarm_trend",
          rows: [
            { ts: "2026-03-01", critical: 12 },
            { ts: "2026-03-02", critical: 18 }
          ]
        });
      }
      if (url.includes("ops_capacity_topn")) {
        return createJsonResponse({
          id: "ops_capacity_topn",
          rows: [{ linkName: "NORTH-CORE-01", utilizationPct: 93.5 }]
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const doc = createPptDoc();
    const slides = (doc.root.children ?? []).filter((item) => item.kind === "slide");
    const firstSlide = slides[0];
    if (!firstSlide) {
      throw new Error("missing first slide");
    }
    const secondSlide: NonNullable<typeof firstSlide> = {
      id: "slide_runtime_later",
      kind: "slide" as const,
      props: { title: "后续页" },
      layout: { mode: "absolute" as const, x: 0, y: 0, w: 960, h: 540 },
      children: []
    };
    doc.root.children = [firstSlide, secondSlide];
    firstSlide.children = [
      {
        id: "chart_runtime_visible_slide",
        kind: "chart",
        props: {
          titleText: "当前页趋势",
          chartType: "line",
          bindings: [
            { role: "x", field: "ts" },
            { role: "y", field: "critical", agg: "sum" }
          ]
        },
        data: { endpointId: "ops_alarm_trend" },
        layout: { mode: "absolute", x: 40, y: 96, w: 400, h: 220, z: 1 }
      }
    ];
    secondSlide.children = [
      {
        id: "chart_runtime_later_slide",
        kind: "chart",
        props: {
          titleText: "后页容量",
          chartType: "bar",
          bindings: [
            { role: "x", field: "linkName" },
            { role: "y", field: "utilizationPct", agg: "avg" }
          ]
        },
        data: { endpointId: "ops_capacity_topn" },
        layout: { mode: "absolute", x: 480, y: 96, w: 400, h: 220, z: 1 }
      }
    ];

    render(
      <StrictMode>
        <DocRuntimeView doc={doc} />
      </StrictMode>
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("/api/v1/data-endpoints/ops_alarm_trend/test"))
      ).toBe(true);
      expect(screen.queryAllByTestId("echart-mock")).toHaveLength(1);
    });
  });

  it("prefetches dashboard endpoint nodes on first runtime render", async () => {
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

    const doc = createDashboardDoc();
    doc.root.children = [
      {
        id: "runtime_dashboard_prefetch_text",
        kind: "text",
        props: { text: "说明", format: "plain" },
        layout: { mode: "grid", gx: 0, gy: 0, gw: 4, gh: 3 }
      },
      {
        id: "runtime_dashboard_prefetch_chart",
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

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows remote loading state while endpoint rows are pending", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const doc = createDashboardDoc();
    const chart = (doc.root.children ?? []).find((item) => item.kind === "chart");
    if (!chart) {
      throw new Error("missing chart");
    }
    chart.data = {
      endpointId: "ops_alarm_trend",
      paramBindings: {
        region: { from: "const", value: "north" }
      }
    };

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(screen.queryAllByText("远程数据加载中").length).toBeGreaterThan(0);
    });

    resolveResponse?.(
      createJsonResponse({
        id: "ops_alarm_trend",
        rows: [{ ts: "2026-03-01", critical: 12 }]
      })
    );

    await waitFor(() => {
      expect(screen.queryAllByTestId("echart-mock").length).toBeGreaterThan(0);
    });
  });

  it("supports report outline quick access in runtime", async () => {
    const doc = createReportDoc();
    doc.root.children = [
      {
        id: "section_runtime_report_a",
        kind: "section",
        props: { title: "总览" },
        children: [{ id: "text_a", kind: "text", props: { text: "a", format: "plain" } }]
      },
      {
        id: "section_runtime_report_b",
        kind: "section",
        props: { title: "趋势" },
        children: [{ id: "text_b", kind: "text", props: { text: "b", format: "plain" } }]
      }
    ];

    render(<DocRuntimeView doc={doc} />);

    fireEvent.click(screen.getByRole("button", { name: /目录/ }));
    await waitFor(() => {
      expect(screen.queryByText("章节跳转")).not.toBeNull();
      expect(screen.queryByPlaceholderText("搜索章节")).not.toBeNull();
      expect(screen.queryAllByText("1. 总览").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("2. 趋势").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "2. 趋势" }));
    fireEvent.click(screen.getByRole("button", { name: /目录/ }));
    await waitFor(() => {
      expect(screen.queryByText("最近访问")).not.toBeNull();
    });
    fireEvent.change(screen.getByPlaceholderText("搜索章节"), { target: { value: "不存在章节" } });
    await waitFor(() => {
      expect(screen.queryByText("未命中章节")).not.toBeNull();
    });
  });

  it("renders a later report section after outline jump under virtualization", async () => {
    const doc = createReportDoc();
    doc.root.props = {
      ...(doc.root.props ?? {}),
      coverEnabled: false,
      tocShow: false,
      summaryEnabled: false,
      headerShow: false,
      footerShow: false
    };
    doc.root.children = Array.from({ length: 12 }, (_, index) => ({
      id: `section_runtime_virtual_${index + 1}`,
      kind: "section",
      props: { title: `章节${index + 1}` },
      children: [
        {
          id: `text_runtime_virtual_${index + 1}`,
          kind: "text",
          props: { text: `内容-章节${index + 1}`, format: "plain" }
        }
      ]
    }));

    render(
      <div style={{ height: 560 }}>
        <DocRuntimeView doc={doc} />
      </div>
    );

    expect(screen.queryByText("内容-章节10")).toBeNull();
    expect(screen.queryByText("内容-章节1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /目录/ }));
    fireEvent.click(screen.getByRole("button", { name: "10. 章节10" }));

    await waitFor(() => {
      expect(screen.queryByText("内容-章节10")).not.toBeNull();
    });
  });

  it("updates Copilot context after report outline navigation", async () => {
    const doc = createReportDoc();
    doc.root.children = [
      {
        id: "section_runtime_report_nav_a",
        kind: "section",
        props: { title: "总览" },
        children: [{ id: "text_nav_a", kind: "text", props: { text: "a", format: "plain" } }]
      },
      {
        id: "section_runtime_report_nav_b",
        kind: "section",
        props: { title: "趋势" },
        children: [{ id: "text_nav_b", kind: "text", props: { text: "b", format: "plain" } }]
      }
    ];

    render(
      <CopilotProvider>
        <CopilotSceneObserver />
        <DocRuntimeView doc={doc} />
      </CopilotProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /目录/ }));
    fireEvent.click(screen.getByRole("button", { name: "2. 趋势" }));

    await waitFor(() => {
      expect(screen.getByTestId("copilot-runtime-scene").textContent).toContain("text_nav_b");
      expect(screen.getByTestId("copilot-runtime-scene").textContent).toContain("2. 趋势");
    });
  });

  it("supports ppt outline quick access in runtime", async () => {
    const doc = createPptDoc();
    const firstSlide = (doc.root.children ?? []).find((item) => item.kind === "slide");
    if (firstSlide) {
      firstSlide.children = [
        {
          id: "text_outline_ppt",
          kind: "text",
          props: { text: "outline", format: "plain" },
          layout: { mode: "absolute", x: 60, y: 80, w: 220, h: 100, z: 1 }
        }
      ];
    }
    render(<DocRuntimeView doc={doc} />);

    fireEvent.click(screen.getByRole("button", { name: /目录/ }));
    await waitFor(() => {
      expect(screen.queryByText("页面跳转")).not.toBeNull();
      expect(screen.queryByPlaceholderText("搜索页面")).not.toBeNull();
      expect(screen.queryAllByText("#1 总览").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "#1 总览" }));
    fireEvent.click(screen.getByRole("button", { name: /目录/ }));
    await waitFor(() => {
      expect(screen.queryByText("最近访问")).not.toBeNull();
    });
    fireEvent.change(screen.getByPlaceholderText("搜索页面"), { target: { value: "不存在页面" } });
    await waitFor(() => {
      expect(screen.queryByText("未命中页面")).not.toBeNull();
    });
  });

  it("prefetches the first later data ppt slide on first render", async () => {
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

    const doc = createPptDoc();
    const firstSlide = (doc.root.children ?? []).find((item) => item.kind === "slide");
    if (!firstSlide) {
      throw new Error("missing slide");
    }
    firstSlide.children = [
      {
        id: "text_prefetch_cover_runtime",
        kind: "text",
        props: { text: "封面", format: "plain" },
        layout: { mode: "absolute", x: 60, y: 80, w: 220, h: 100, z: 1 }
      }
    ];
    const introSlide = {
      id: "slide_prefetch_runtime_intro",
      kind: "slide" as const,
      props: { title: "说明页" },
      layout: { mode: "absolute" as const, x: 0, y: 0, w: 960, h: 540 },
      children: [
        {
          id: "text_prefetch_runtime_intro",
          kind: "text" as const,
          props: { text: "说明", format: "plain" },
          layout: { mode: "absolute" as const, x: 60, y: 80, w: 220, h: 100, z: 1 }
        }
      ]
    };
    doc.root.children = [
      firstSlide,
      introSlide,
      {
        id: "slide_prefetch_runtime_two",
        kind: "slide",
        props: { title: "趋势页" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: [
          {
            id: "chart_prefetch_runtime_two",
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
            layout: { mode: "absolute", x: 40, y: 96, w: 400, h: 220, z: 1 }
          }
        ]
      }
    ];

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("prefetches the first later data report section on first render", async () => {
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

    const doc = createReportDoc();
    doc.root.children = [
      {
        id: "section_runtime_prefetch_cover",
        kind: "section",
        props: { title: "总览说明" },
        children: [{ id: "text_runtime_prefetch_cover", kind: "text", props: { text: "说明", format: "plain" } }]
      },
      {
        id: "section_runtime_prefetch_intro",
        kind: "section",
        props: { title: "口径说明" },
        children: [{ id: "text_runtime_prefetch_intro", kind: "text", props: { text: "口径", format: "plain" } }]
      },
      {
        id: "section_runtime_prefetch_data",
        kind: "section",
        props: { title: "趋势页" },
        children: [
          {
            id: "chart_runtime_prefetch_data",
            kind: "chart",
            props: {
              titleText: "趋势图",
              chartType: "line",
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

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("updates Copilot context after switching ppt slides", async () => {
    const doc = createPptDoc();
    doc.root.children = [
      {
        id: "slide_runtime_nav_1",
        kind: "slide",
        props: { title: "总览" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: [{ id: "text_runtime_nav_1", kind: "text", props: { text: "第一页", format: "plain" }, layout: { mode: "absolute", x: 60, y: 80, w: 220, h: 100, z: 1 } }]
      },
      {
        id: "slide_runtime_nav_2",
        kind: "slide",
        props: { title: "趋势" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: [{ id: "text_runtime_nav_2", kind: "text", props: { text: "第二页", format: "plain" }, layout: { mode: "absolute", x: 60, y: 80, w: 220, h: 100, z: 1 } }]
      }
    ];

    render(
      <CopilotProvider>
        <CopilotSceneObserver />
        <DocRuntimeView doc={doc} />
      </CopilotProvider>
    );

    fireEvent.click(screen.getByText("趋势"));

    await waitFor(() => {
      expect(screen.getByTestId("copilot-runtime-scene").textContent).toContain("text_runtime_nav_2");
      expect(screen.getByTestId("copilot-runtime-scene").textContent).toContain("第 2 页");
    });
  });
});
