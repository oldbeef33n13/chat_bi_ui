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
});
