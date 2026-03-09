import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createDashboardDoc, createPptDoc, createReportDoc, defaultChartSpec } from "../../core/doc/defaults";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { EditorTopToolbar } from "./EditorTopToolbar";

function SeedSelection({ nodeId, nodeIds }: { nodeId?: string; nodeIds?: string[] }): null {
  const store = useEditorStore();
  useEffect(() => {
    if (Array.isArray(nodeIds) && nodeIds.length > 0) {
      store.setSelection(nodeIds[0]!, false);
      nodeIds.slice(1).forEach((id) => store.setSelection(id, true));
      return;
    }
    if (nodeId) {
      store.setSelection(nodeId, false);
    }
  }, [nodeId, nodeIds, store]);
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

function SelectionObserver({ onSelection }: { onSelection: (primaryId?: string) => void }): null {
  const store = useEditorStore();
  const selection = useSignalValue(store.selection);
  useEffect(() => {
    onSelection(selection.primaryId);
  }, [onSelection, selection.primaryId]);
  return null;
}

function UiObserver({
  onDashboardInsertPanel,
  onReportInsertPanel,
  onPptInsertPanel
}: {
  onDashboardInsertPanel?: (open: boolean) => void;
  onReportInsertPanel?: (open: boolean) => void;
  onPptInsertPanel?: (open: boolean) => void;
}): null {
  const store = useEditorStore();
  const ui = useSignalValue(store.ui);
  useEffect(() => {
    onDashboardInsertPanel?.(ui.dashboardInsertPanelOpen);
    onReportInsertPanel?.(ui.reportInsertPanelOpen);
    onPptInsertPanel?.(ui.pptInsertPanelOpen);
  }, [onDashboardInsertPanel, onPptInsertPanel, onReportInsertPanel, ui.dashboardInsertPanelOpen, ui.pptInsertPanelOpen, ui.reportInsertPanelOpen]);
  return null;
}

const renderToolbar = ({
  doc,
  seedSelectionId,
  seedSelectionIds,
  onDoc,
  onSelection,
  onInsertPanel,
  onReportInsertPanel,
  onPptInsertPanel
}: {
  doc: VDoc;
  seedSelectionId?: string;
  seedSelectionIds?: string[];
  onDoc?: (doc: VDoc) => void;
  onSelection?: (primaryId?: string) => void;
  onInsertPanel?: (open: boolean) => void;
  onReportInsertPanel?: (open: boolean) => void;
  onPptInsertPanel?: (open: boolean) => void;
}): void => {
  const noop = vi.fn();
  render(
    <EditorProvider initialDoc={doc}>
      <SeedSelection nodeId={seedSelectionId} nodeIds={seedSelectionIds} />
      {onDoc ? <DocObserver onDoc={onDoc} /> : null}
      {onSelection ? <SelectionObserver onSelection={onSelection} /> : null}
      {onInsertPanel || onPptInsertPanel || onReportInsertPanel ? (
        <UiObserver onDashboardInsertPanel={onInsertPanel} onReportInsertPanel={onReportInsertPanel} onPptInsertPanel={onPptInsertPanel} />
      ) : null}
      <EditorTopToolbar
        persona="designer"
        showBatchPanel={false}
        onToggleBatchPanel={noop}
        showFilterPanel={false}
        onToggleFilterPanel={noop}
        onOpenCommandPalette={noop}
        onOpenPresentPreview={noop}
      />
    </EditorProvider>
  );
};

describe("EditorTopToolbar menus", () => {
  it("toggles report insert panel from top toolbar", async () => {
    let open = false;
    renderToolbar({
      doc: createReportDoc(),
      onReportInsertPanel: (next) => {
        open = next;
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /^插入$/ }));

    await waitFor(() => {
      expect(open).toBe(true);
    });
  });

  it("supports display settings hover preview and leave close", () => {
    renderToolbar({ doc: createDashboardDoc() });
    const sceneButton = screen.getByRole("button", { name: /展示设置/ });
    const sceneWrapper = sceneButton.closest(".tool-group-menu");
    expect(sceneWrapper).not.toBeNull();

    expect(screen.queryByText("切换为全屏适配")).toBeNull();
    fireEvent.mouseEnter(sceneWrapper!);
    expect(screen.queryByText("切换为全屏适配")).not.toBeNull();
    fireEvent.mouseLeave(sceneWrapper!);
    expect(screen.queryByText("切换为全屏适配")).toBeNull();
  });

  it("supports display settings click lock and unlock", () => {
    renderToolbar({ doc: createDashboardDoc() });
    const sceneButton = screen.getByRole("button", { name: /展示设置/ });
    const sceneWrapper = sceneButton.closest(".tool-group-menu");
    expect(sceneWrapper).not.toBeNull();

    fireEvent.click(sceneButton);
    expect(screen.queryByText("切换为全屏适配")).not.toBeNull();
    fireEvent.mouseLeave(sceneWrapper!);
    expect(screen.queryByText("切换为全屏适配")).not.toBeNull();

    fireEvent.click(sceneButton);
    expect(screen.queryByText("切换为全屏适配")).toBeNull();
  });

  it("shows operation logs in top toolbar audit menu", async () => {
    const doc = createReportDoc();
    let latestDoc = doc;
    renderToolbar({
      doc,
      onDoc: (next) => {
        latestDoc = structuredClone(next);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /场景操作/ }));
    fireEvent.click(screen.getByRole("button", { name: /显示报告结构设置|隐藏报告结构设置/ }));

    await waitFor(() => {
      expect(Boolean((latestDoc.root.props as Record<string, unknown>)?.editorShowReportConfig)).toBe(true);
    });

    const auditButton = screen.getByRole("button", { name: /操作日志/ });
    const auditWrapper = auditButton.closest(".tool-group-menu");
    expect(auditWrapper).not.toBeNull();
    fireEvent.mouseEnter(auditWrapper!);

    await waitFor(() => {
      expect(screen.queryByText(/toolbar toggle report config/)).not.toBeNull();
    });
  });

  it("toggles dashboard insert panel from top toolbar", async () => {
    let open = false;
    renderToolbar({
      doc: createDashboardDoc(),
      onInsertPanel: (next) => {
        open = next;
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /^插入$/ }));

    await waitFor(() => {
      expect(open).toBe(true);
    });
  });

  it("toggles ppt insert panel from top toolbar", async () => {
    let open = false;
    renderToolbar({
      doc: createPptDoc(),
      onPptInsertPanel: (next) => {
        open = next;
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /^插入$/ }));

    await waitFor(() => {
      expect(open).toBe(true);
    });
  });

  it("can jump to document settings by selecting root", async () => {
    const doc = createDashboardDoc();
    const firstNodeId = doc.root.children?.[0]?.id;
    let latestSelection = firstNodeId;
    renderToolbar({
      doc,
      seedSelectionId: firstNodeId,
      onSelection: (primaryId) => {
        latestSelection = primaryId;
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /文档设置/ }));

    await waitFor(() => {
      expect(latestSelection).toBe("root");
    });
  });

  it("can trigger present preview from top toolbar", () => {
    const doc = createDashboardDoc();
    const openPreview = vi.fn();
    const noop = vi.fn();
    render(
      <EditorProvider initialDoc={doc}>
        <EditorTopToolbar
          persona="designer"
          showBatchPanel={false}
          onToggleBatchPanel={noop}
          showFilterPanel={false}
          onToggleFilterPanel={noop}
          onOpenCommandPalette={noop}
          onOpenPresentPreview={openPreview}
        />
      </EditorProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /沉浸预览/ }));
    expect(openPreview).toHaveBeenCalledTimes(1);
  });

  it("shows empty state in arrange menu when nothing is selected", () => {
    renderToolbar({ doc: createDashboardDoc() });
    fireEvent.click(screen.getByRole("button", { name: /排列/ }));
    expect(screen.getByText("先选择一个或多个元素")).toBeTruthy();
  });

  it("supports report arrange actions from the shared arrange menu", async () => {
    const doc = createReportDoc();
    const firstSection = doc.root.children?.find((node) => node.kind === "section");
    if (!firstSection) {
      throw new Error("missing section");
    }
    firstSection.children = [
      {
        id: "report_chart_left",
        kind: "chart",
        layout: { mode: "grid", gx: 0, gy: 0, gw: 7, gh: 4 },
        props: defaultChartSpec("左图")
      },
      {
        id: "report_chart_right",
        kind: "chart",
        layout: { mode: "grid", gx: 7, gy: 0, gw: 5, gh: 4 },
        props: defaultChartSpec("右图")
      }
    ];
    let latestDoc = doc;
    renderToolbar({
      doc,
      seedSelectionIds: ["report_chart_right", "report_chart_left"],
      onDoc: (next) => {
        latestDoc = structuredClone(next);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /排列/ }));
    fireEvent.click(screen.getByRole("button", { name: /等宽/ }));

    await waitFor(() => {
      const updated = latestDoc.root.children?.find((node) => node.kind === "section")?.children?.find((node) => node.id === "report_chart_right");
      expect(updated?.layout?.gw).toBe(7);
    });
  });

  it("supports card arrange actions for dashboard selection", async () => {
    const doc = createDashboardDoc();
    const firstNodeId = doc.root.children?.[0]?.id;
    let latestDoc = doc;
    renderToolbar({
      doc,
      seedSelectionId: firstNodeId,
      onDoc: (next) => {
        latestDoc = structuredClone(next);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /排列/ }));
    fireEvent.click(screen.getByRole("button", { name: /整行/ }));

    await waitFor(() => {
      const updated = latestDoc.root.children?.find((node) => node.id === firstNodeId);
      expect(updated?.layout?.mode).toBe("grid");
      expect(Number(updated?.layout?.gw)).toBe(Number((latestDoc.root.props as Record<string, unknown>)?.gridCols ?? 12));
    });
  });

  it("supports converting a card to floating element from arrange menu", async () => {
    const doc = createDashboardDoc();
    const firstNodeId = doc.root.children?.[0]?.id;
    let latestDoc = doc;
    renderToolbar({
      doc,
      seedSelectionId: firstNodeId,
      onDoc: (next) => {
        latestDoc = structuredClone(next);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /排列/ }));
    fireEvent.click(screen.getByRole("button", { name: /转为浮动元素/ }));

    await waitFor(() => {
      const updated = latestDoc.root.children?.find((node) => node.id === firstNodeId);
      expect(updated?.layout?.mode).toBe("absolute");
      expect(Number(updated?.layout?.w)).toBeGreaterThan(0);
    });
  });

  it("supports switching dashboard display mode from settings menu", async () => {
    const doc = createDashboardDoc();
    let latestDoc = doc;
    renderToolbar({
      doc,
      onDoc: (next) => {
        latestDoc = structuredClone(next);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /展示设置/ }));
    fireEvent.click(screen.getByRole("button", { name: /切换为页面滚动/ }));

    await waitFor(() => {
      expect((latestDoc.root.props as Record<string, unknown>)?.displayMode).toBe("scroll_page");
    });
  });

  it("supports ppt arrange actions from the top toolbar", async () => {
    const doc = createPptDoc();
    const slide = doc.root.children?.[0];
    const [titleNode, chartNode, summaryNode] = slide?.children ?? [];
    if (!chartNode || !summaryNode || !titleNode) {
      throw new Error("missing ppt nodes");
    }
    let latestDoc = doc;
    renderToolbar({
      doc,
      seedSelectionIds: [chartNode.id, summaryNode.id],
      onDoc: (next) => {
        latestDoc = structuredClone(next);
      }
    });

    fireEvent.click(screen.getByRole("button", { name: /排列/ }));
    fireEvent.click(screen.getByRole("button", { name: /等宽/ }));

    await waitFor(() => {
      const nextSlide = latestDoc.root.children?.[0];
      const nextChart = nextSlide?.children?.find((node) => node.id === chartNode.id);
      const nextSummary = nextSlide?.children?.find((node) => node.id === summaryNode.id);
      expect(nextChart?.layout?.mode).toBe("absolute");
      expect(nextSummary?.layout?.mode).toBe("absolute");
      expect(Number(nextChart?.layout?.w)).toBe(Number(nextSummary?.layout?.w));
    });
  });
});
