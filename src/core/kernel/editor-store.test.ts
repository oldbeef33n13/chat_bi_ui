import { describe, expect, it } from "vitest";
import { createDashboardDoc } from "../doc/defaults";
import { EditorStore } from "./editor-store";

describe("EditorStore", () => {
  it("supports command -> undo -> redo", () => {
    const doc = createDashboardDoc();
    const firstChart = doc.root.children?.find((node) => node.kind === "chart");
    expect(firstChart).toBeTruthy();
    const store = new EditorStore(doc);

    const ok = store.executeCommand({
      type: "UpdateProps",
      nodeId: firstChart!.id,
      props: { chartType: "bar", labelShow: true }
    });
    expect(ok).toBe(true);
    expect(store.doc.value?.root.children?.[0]?.props).toMatchObject({ chartType: "bar", labelShow: true });

    const undone = store.undo();
    expect(undone).toBe(true);
    expect(store.doc.value?.root.children?.[0]?.props).toMatchObject({ chartType: "line" });

    const redone = store.redo();
    expect(redone).toBe(true);
    expect(store.doc.value?.root.children?.[0]?.props).toMatchObject({ chartType: "bar", labelShow: true });
  });

  it("previews and accepts command plan", () => {
    const doc = createDashboardDoc();
    const chart = doc.root.children?.find((node) => node.kind === "chart");
    const store = new EditorStore(doc);
    store.setSelection(chart!.id);

    const previewed = store.previewPlan({
      intent: "update",
      targets: [chart!.id],
      commands: [{ type: "UpdateProps", nodeId: chart!.id, props: { smooth: false, labelShow: true } }],
      explain: "关闭平滑并开启标签"
    });
    expect(previewed).toBe(true);
    expect(store.pendingPlan.value).toBeTruthy();
    expect(store.pendingPlanDryRun.value?.patches.length).toBeGreaterThan(0);

    const accepted = store.acceptPreview("ai");
    expect(accepted).toBe(true);
    expect(store.pendingPlan.value).toBeNull();
    expect(store.doc.value?.root.children?.[0]?.props).toMatchObject({ smooth: false, labelShow: true });
  });

  it("replaces selection ids while keeping a valid primary node", () => {
    const doc = createDashboardDoc();
    const [firstChart, secondChart] = doc.root.children ?? [];
    expect(firstChart).toBeTruthy();
    expect(secondChart).toBeTruthy();
    const store = new EditorStore(doc);

    store.setSelectionIds([firstChart!.id, secondChart!.id], firstChart!.id);
    expect(store.selection.value.selectedIds).toEqual([firstChart!.id, secondChart!.id]);
    expect(store.selection.value.primaryId).toBe(firstChart!.id);

    store.setSelectionIds([secondChart!.id], firstChart!.id);
    expect(store.selection.value.selectedIds).toEqual([secondChart!.id]);
    expect(store.selection.value.primaryId).toBe(secondChart!.id);

    store.setSelectionIds([]);
    expect(store.selection.value.selectedIds).toEqual([]);
    expect(store.selection.value.primaryId).toBeUndefined();
  });

  it("toggles dashboard insert panel ui state without touching the doc", () => {
    const doc = createDashboardDoc();
    const store = new EditorStore(doc);

    expect(store.ui.value.dashboardInsertPanelOpen).toBe(false);
    store.toggleDashboardInsertPanel();
    expect(store.ui.value.dashboardInsertPanelOpen).toBe(true);
    store.setDashboardInsertPanelOpen(false);
    expect(store.ui.value.dashboardInsertPanelOpen).toBe(false);
    expect(store.doc.value?.docId).toBe(doc.docId);
  });

  it("keeps recent dashboard insert items deduplicated and trimmed", () => {
    const doc = createDashboardDoc();
    const store = new EditorStore(doc);

    store.rememberDashboardInsertItem("chart.line");
    store.rememberDashboardInsertItem("table.basic");
    store.rememberDashboardInsertItem("chart.line");
    store.rememberDashboardInsertItem("text.title");
    store.rememberDashboardInsertItem("chart.gauge");
    store.rememberDashboardInsertItem("chart.bar");
    store.rememberDashboardInsertItem("media.image");

    expect(store.ui.value.dashboardRecentInsertItemIds).toEqual([
      "media.image",
      "chart.bar",
      "chart.gauge",
      "text.title",
      "chart.line",
      "table.basic"
    ]);

    store.setDoc(createDashboardDoc("workbench"));
    expect(store.ui.value.dashboardRecentInsertItemIds).toEqual([
      "media.image",
      "chart.bar",
      "chart.gauge",
      "text.title",
      "chart.line",
      "table.basic"
    ]);
    expect(store.ui.value.dashboardInsertPanelOpen).toBe(false);
  });

  it("toggles ppt insert panel and keeps recent ppt insert items", () => {
    const doc = createDashboardDoc();
    const store = new EditorStore(doc);

    expect(store.ui.value.pptInsertPanelOpen).toBe(false);
    store.togglePptInsertPanel();
    expect(store.ui.value.pptInsertPanelOpen).toBe(true);

    store.rememberPptInsertItem("chart.line");
    store.rememberPptInsertItem("text.title");
    store.rememberPptInsertItem("chart.line");
    expect(store.ui.value.pptRecentInsertItemIds).toEqual(["chart.line", "text.title"]);

    store.setDoc(createDashboardDoc());
    expect(store.ui.value.pptInsertPanelOpen).toBe(false);
    expect(store.ui.value.pptRecentInsertItemIds).toEqual(["chart.line", "text.title"]);
  });

  it("toggles report insert panel and keeps recent report insert items", () => {
    const doc = createDashboardDoc();
    const store = new EditorStore(doc);

    expect(store.ui.value.reportInsertPanelOpen).toBe(false);
    store.toggleReportInsertPanel();
    expect(store.ui.value.reportInsertPanelOpen).toBe(true);

    store.rememberReportInsertItem("chart.line");
    store.rememberReportInsertItem("text.body");
    store.rememberReportInsertItem("chart.line");
    expect(store.ui.value.reportRecentInsertItemIds).toEqual(["chart.line", "text.body"]);

    store.setDoc(createDashboardDoc());
    expect(store.ui.value.reportInsertPanelOpen).toBe(false);
    expect(store.ui.value.reportRecentInsertItemIds).toEqual(["chart.line", "text.body"]);
  });
});
