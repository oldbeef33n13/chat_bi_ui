import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createDashboardDoc, createPptDoc, createReportDoc } from "../../core/doc/defaults";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { InspectorPanel } from "./InspectorPanel";

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      createJsonResponse({
        items: [],
        total: 0
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function SeedSelection({ nodeId }: { nodeId?: string }): null {
  const store = useEditorStore();
  useEffect(() => {
    if (nodeId) {
      store.setSelection(nodeId, false);
    }
  }, [nodeId, store]);
  return null;
}

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

const findInputByLabelText = (label: string): HTMLInputElement => {
  const labelNode = screen.getByText(label).closest("label");
  if (!labelNode) {
    throw new Error(`missing label: ${label}`);
  }
  const input = labelNode.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`missing input for label: ${label}`);
  }
  return input;
};

describe("InspectorPanel", () => {
  it("shows document-level inspector on blank selection", async () => {
    await act(async () => {
      render(
        <EditorProvider initialDoc={createDashboardDoc()}>
          <InspectorPanel persona="analyst" />
        </EditorProvider>
      );
      await Promise.resolve();
    });

    expect(screen.queryByText("doc · dashboard")).not.toBeNull();
    expect(screen.queryByText("文档标题")).not.toBeNull();
    expect(screen.queryByText("文档 ID")).toBeNull();
    expect(screen.queryByText("文档类型")).toBeNull();
    expect(screen.queryByRole("button", { name: "快捷" })).toBeNull();
    expect(screen.queryByRole("button", { name: "标准" })).toBeNull();
    expect(screen.queryByRole("button", { name: "专家" })).toBeNull();
  });

  it("uses structured advanced chart controls without raw JSON editor", async () => {
    const doc = createDashboardDoc();
    const chartId = doc.root.children?.find((item) => item.kind === "chart")?.id;
    render(
      <EditorProvider initialDoc={doc}>
        <SeedSelection nodeId={chartId} />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/chart ·/)).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "高级" }));
    await waitFor(() => {
      expect(screen.queryByText("高级配置")).not.toBeNull();
    });
    expect(screen.queryByText("Raw ChartSpec(JSON)")).toBeNull();
    expect(screen.queryByText("Raw DataBinding(JSON)")).toBeNull();
  });

  it("does not render readonly id/kind/name inputs in node basic tab", async () => {
    const doc = createDashboardDoc();
    const chartId = doc.root.children?.find((item) => item.kind === "chart")?.id;
    render(
      <EditorProvider initialDoc={doc}>
        <SeedSelection nodeId={chartId} />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/chart ·/)).not.toBeNull();
    });
    expect(screen.queryByText("Node ID")).toBeNull();
    expect(screen.queryByText("Kind")).toBeNull();
    expect(screen.queryByText("Name")).toBeNull();
    expect(screen.queryByText("技术信息")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "技术信息" }));
    await waitFor(() => {
      expect(screen.queryByText("技术信息")).not.toBeNull();
      expect(screen.queryByText("元素ID")).not.toBeNull();
    });
  });

  it("supports chart multi-series controls in data tab", async () => {
    const doc = createDashboardDoc();
    const chartId = doc.root.children?.find((item) => item.kind === "chart")?.id;
    render(
      <EditorProvider initialDoc={doc}>
        <SeedSelection nodeId={chartId} />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/chart ·/)).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "数据" }));
    await waitFor(() => {
      expect(screen.queryByText("系列维度（可多个）")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "+系列" }));
    await waitFor(() => {
      expect(screen.queryByText("未配置系列维度，当前仅单系列渲染。")).toBeNull();
    });
  });

  it("supports true multi-x-axis controls in chart data tab", async () => {
    const doc = createDashboardDoc();
    const chartId = doc.root.children?.find((item) => item.kind === "chart")?.id;
    render(
      <EditorProvider initialDoc={doc}>
        <SeedSelection nodeId={chartId} />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/chart ·/)).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "数据" }));
    await waitFor(() => {
      expect(screen.queryByText("默认单 X 轴，适合大多数场景")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "显示高级X轴" }));
    await waitFor(() => {
      expect(screen.queryByText("多 X 轴配置（高级）")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "+X 轴" }));
    await waitFor(() => {
      const axisLabels = screen.getAllByText((text) => text.startsWith("X 轴字段 #"));
      expect(axisLabels.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("can toggle runtime ask entry switch in chart basic tab", async () => {
    const doc = createDashboardDoc();
    const chartId = doc.root.children?.find((item) => item.kind === "chart")?.id;
    let latestDoc = doc;
    render(
      <EditorProvider initialDoc={doc}>
        <SeedSelection nodeId={chartId} />
        <DocObserver
          onDoc={(next) => {
            latestDoc = structuredClone(next);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/chart ·/)).not.toBeNull();
    });
    const toggle = screen.getByRole("checkbox", { name: /运行态显示智能追问入口/ });
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() => {
      const node = latestDoc.root.children?.find((item) => item.id === chartId);
      expect((node?.props as Record<string, unknown>)?.runtimeAskEnabled).toBe(false);
    });
  });

  it("provides visual multi-header table designer", async () => {
    const doc = createDashboardDoc();
    const tableNodeId = "table_test";
    doc.root.children = [
      ...(doc.root.children ?? []),
      {
        id: tableNodeId,
        kind: "table",
        data: { sourceId: "ds_alarm", queryId: "q_alarm_trend" },
        props: {
          titleText: "分区明细",
          columns: [
            { key: "region", title: "区域" },
            { key: "day", title: "日期" },
            { key: "alarm_count", title: "告警数" }
          ],
          headerRows: []
        }
      }
    ];

    render(
      <EditorProvider initialDoc={doc}>
        <SeedSelection nodeId={tableNodeId} />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/table ·/)).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "高级" }));
    await waitFor(() => {
      expect(screen.queryByText("多级表头设计器")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "从列生成" }));
    await waitFor(() => {
      expect(screen.queryByText("表头实时预览")).not.toBeNull();
    });
  });

  it("supports report header/footer quick editing in doc scope", async () => {
    let latestDoc = createReportDoc();
    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    const headerInput = screen.getByDisplayValue(String((latestDoc.root.props as Record<string, unknown>)?.headerText ?? ""));
    fireEvent.change(headerInput, { target: { value: "周报页眉-测试" } });

    await waitFor(() => {
      expect((latestDoc.root.props as Record<string, unknown>)?.headerText).toBe("周报页眉-测试");
    });
  });

  it("syncs dashboard visible titles when editing doc title", async () => {
    let latestDoc = createDashboardDoc();
    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    fireEvent.change(findInputByLabelText("文档标题"), { target: { value: "新的大盘标题" } });

    await waitFor(() => {
      expect(latestDoc.title).toBe("新的大盘标题");
      expect((latestDoc.root.props as Record<string, unknown>)?.dashTitle).toBe("新的大盘标题");
      expect((latestDoc.root.props as Record<string, unknown>)?.headerText).toBe("新的大盘标题");
    });
  });

  it("syncs report title while preserving custom header text", async () => {
    let latestDoc = createReportDoc();
    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    fireEvent.change(findInputByLabelText("文档标题"), { target: { value: "新的周报标题" } });

    await waitFor(() => {
      const rootProps = (latestDoc.root.props as Record<string, unknown>) ?? {};
      expect(latestDoc.title).toBe("新的周报标题");
      expect(rootProps.reportTitle).toBe("新的周报标题");
      expect(rootProps.coverTitle).toBe("新的周报标题");
      expect(rootProps.headerText).toBe("网络周报 · 内部资料");
    });
  });

  it("shows common text style controls and can apply note preset", async () => {
    const doc = createPptDoc();
    const slide = (doc.root.children ?? []).find((item) => item.kind === "slide");
    const textNodeId = slide?.children?.find((item) => item.kind === "text")?.id;
    let latestDoc = doc;
    render(
      <EditorProvider initialDoc={doc}>
        <SeedSelection nodeId={textNodeId} />
        <DocObserver
          onDoc={(next) => {
            latestDoc = structuredClone(next);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/text ·/)).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "样式" }));
    await waitFor(() => {
      expect(screen.queryByText("文本")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "注释" }));

    await waitFor(() => {
      const textNode = (latestDoc.root.children ?? [])
        .filter((item) => item.kind === "slide")
        .flatMap((item) => item.children ?? [])
        .find((item) => item.id === textNodeId);
      expect(textNode?.style?.fontSize).toBe(12);
      expect(textNode?.style?.italic).toBe(true);
      expect(textNode?.style?.fg).toBe("#64748b");
    });
  });

  it("supports ppt master footer quick editing in doc scope", async () => {
    let latestDoc = createPptDoc();
    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    const footerInput = screen.getByDisplayValue(String((latestDoc.root.props as Record<string, unknown>)?.masterFooterText ?? ""));
    fireEvent.change(footerInput, { target: { value: "PPT页脚-测试" } });

    await waitFor(() => {
      expect((latestDoc.root.props as Record<string, unknown>)?.masterFooterText).toBe("PPT页脚-测试");
    });
  });

  it("supports binding chart to dynamic data endpoint in data tab", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/data-endpoints")) {
        return createJsonResponse({
          items: [
            {
              id: "ops_alarm_trend",
              name: "告警趋势",
              category: "ops",
              providerType: "mock_rest",
              origin: "system",
              method: "GET",
              path: "/mock/ops/alarm-trend",
              description: "告警趋势",
              paramSchema: [{ name: "region", type: "string", label: "区域" }],
              resultSchema: [
                { name: "ts", type: "date", label: "日期", description: "统计日期" },
                { name: "critical", type: "number", label: "严重告警", description: "严重级别告警数", aggAble: true }
              ],
              sampleRequest: {},
              sampleResponse: [{ ts: "2026-03-01", critical: 12 }],
              enabled: true
            }
          ],
          total: 1
        });
      }
      return createJsonResponse({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const doc = createDashboardDoc();
    const chartId = doc.root.children?.find((item) => item.kind === "chart")?.id;
    let latestDoc = doc;
    render(
      <EditorProvider initialDoc={doc}>
        <SeedSelection nodeId={chartId} />
        <DocObserver
          onDoc={(next) => {
            latestDoc = structuredClone(next);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: "数据" }));
    await waitFor(() => {
      expect(screen.queryByText("数据来源")).not.toBeNull();
    });

    const endpointSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    fireEvent.change(endpointSelect, { target: { value: "ops_alarm_trend" } });

    await waitFor(() => {
      const node = latestDoc.root.children?.find((item) => item.id === chartId);
      expect(node?.data?.endpointId).toBe("ops_alarm_trend");
      expect(node?.data?.paramBindings?.region).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: "编辑参数映射" })).not.toBeNull();
    expect(screen.queryByText("取值来源")).toBeNull();
    expect(screen.queryByRole("option", { name: "日期 (ts)" })).not.toBeNull();
    expect(screen.queryByText("聚合方式")).toBeNull();
    expect(screen.queryByText("统计口径")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "查看数据说明" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "编辑参数映射" }));
    await waitFor(() => {
      expect(screen.queryByText("告警趋势参数映射")).not.toBeNull();
      expect(screen.queryByText("取值来源")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "查看数据说明" }));
    await waitFor(() => {
      expect(screen.queryByText("参数定义")).not.toBeNull();
      expect(screen.queryByText("字段定义")).not.toBeNull();
      expect(screen.queryByText("样例数据")).not.toBeNull();
      expect(screen.queryByText("严重级别告警数")).not.toBeNull();
      expect(screen.queryByText("2026-03-01")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑统计口径" }));
    await waitFor(() => {
      expect(screen.queryByText("统计口径设置")).not.toBeNull();
      expect(screen.queryByText("主指标")).not.toBeNull();
    });
    const aggSelect = document.querySelector(".inspector-stat-card .select");
    if (!(aggSelect instanceof HTMLSelectElement)) {
      throw new Error("missing agg select");
    }
    fireEvent.change(aggSelect, { target: { value: "avg" } });

    await waitFor(() => {
      const node = latestDoc.root.children?.find((item) => item.id === chartId);
      const bindings = ((node?.props as Record<string, unknown>)?.bindings ?? []) as Array<Record<string, unknown>>;
      expect(bindings.find((item) => item.role === "y")?.agg).toBe("avg");
    });
  });

  it("edits template variable definitions in document advanced tab", async () => {
    const doc = createReportDoc();
    let latestDoc = doc;
    render(
      <EditorProvider initialDoc={doc}>
        <DocObserver
          onDoc={(next) => {
            latestDoc = structuredClone(next);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "高级" }));
    fireEvent.click(screen.getByRole("button", { name: "新增变量" }));

    await waitFor(() => {
      expect(latestDoc.templateVariables).toHaveLength(1);
      expect(latestDoc.templateVariables?.[0]?.key).toBe("var_1");
    });

    fireEvent.change(screen.getByDisplayValue("var_1"), { target: { value: "region" } });
    fireEvent.change(screen.getByDisplayValue("变量 1"), { target: { value: "区域" } });

    await waitFor(() => {
      expect(latestDoc.templateVariables?.[0]).toMatchObject({
        key: "region",
        label: "区域"
      });
    });
  });

  it("uploads a dashboard background image in document style tab", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/assets/images")) {
        return createJsonResponse({
          id: "asset_dashboard_bg",
          name: "背景图",
          originalFileName: "dashboard-bg.png",
          fileUrl: "/files/assets/asset_dashboard_bg",
          mimeType: "image/png",
          widthPx: 1920,
          heightPx: 1080,
          sizeBytes: 8192
        });
      }
      return createJsonResponse({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestDoc = createDashboardDoc();
    const { container } = render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "样式" }));
    fireEvent.click(screen.getByRole("button", { name: "上传背景图" }));
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("missing dashboard background input");
    }
    fireEvent.change(input, {
      target: {
        files: [new File(["png"], "dashboard-bg.png", { type: "image/png" })]
      }
    });

    await waitFor(() => {
      expect((latestDoc.root.props as Record<string, unknown>)?.bgMode).toBe("image");
      expect((latestDoc.root.props as Record<string, unknown>)?.bgAssetId).toBe("asset_dashboard_bg");
      expect(latestDoc.assets?.some((asset) => asset.assetId === "asset_dashboard_bg")).toBe(true);
    });
  });
});
