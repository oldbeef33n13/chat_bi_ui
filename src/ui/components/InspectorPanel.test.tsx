import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createDashboardDoc, createPptDoc, createReportDoc } from "../../core/doc/defaults";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { InspectorPanel } from "./InspectorPanel";

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

describe("InspectorPanel", () => {
  it("shows document-level inspector on blank selection", () => {
    render(
      <EditorProvider initialDoc={createDashboardDoc()}>
        <InspectorPanel persona="analyst" />
      </EditorProvider>
    );

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
});
