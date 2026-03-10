import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDashboardDoc, createPptDoc, createReportDoc } from "../../core/doc/defaults";
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

describe("DocRuntimeView global props", () => {
  it("does not render a duplicate runtime header for chart cards with intrinsic titles", async () => {
    const doc = createDashboardDoc();

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(screen.queryByText("告警趋势")).toBeNull();
      expect(screen.getAllByTestId("echart-mock").length).toBeGreaterThan(0);
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
      masterFooterText: "PPT 页脚测试"
    };

    render(<DocRuntimeView doc={doc} />);

    await waitFor(() => {
      expect(screen.queryByText("PPT 页眉测试")).not.toBeNull();
      expect(screen.queryByText("PPT 页脚测试")).not.toBeNull();
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
});
