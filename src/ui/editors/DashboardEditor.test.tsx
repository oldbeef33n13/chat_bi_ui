import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createDashboardDoc } from "../../core/doc/defaults";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
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

describe("DashboardEditor direct manipulation", () => {
  it("supports marquee multi selection on the dashboard canvas", async () => {
    let latestDoc = createDashboardDoc();

    render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DashboardEditor doc={latestDoc} />
      </EditorProvider>
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
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DashboardEditor doc={latestDoc} />
      </EditorProvider>
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
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DashboardEditor doc={latestDoc} />
      </EditorProvider>
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
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DashboardEditor doc={latestDoc} />
      </EditorProvider>
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
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DashboardEditor doc={latestDoc} />
      </EditorProvider>
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
});
