import { describe, expect, it } from "vitest";
import type { VNode } from "../../core/doc/types";
import { buildReportGridRows } from "./report-layout";

const chartNode = (id: string, layout?: VNode["layout"]): VNode => ({
  id,
  kind: "chart",
  layout,
  props: { chartType: "line", bindings: [] }
});

describe("report-layout", () => {
  it("groups grid blocks by gy and keeps horizontal placement", () => {
    const rows = buildReportGridRows([
      chartNode("c1", { mode: "grid", gx: 0, gy: 1, gw: 6 }),
      chartNode("c2", { mode: "grid", gx: 6, gy: 1, gw: 6 }),
      chartNode("c3", { mode: "grid", gx: 0, gy: 2, gw: 12 })
    ]);
    expect(rows.length).toBe(2);
    expect(rows[0]?.items.length).toBe(2);
    expect(rows[0]?.items[0]?.gx).toBe(0);
    expect(rows[0]?.items[1]?.gx).toBe(6);
    expect(rows[1]?.items.length).toBe(1);
  });

  it("falls back flow blocks to full-width rows", () => {
    const rows = buildReportGridRows([
      chartNode("c1"),
      chartNode("c2")
    ]);
    expect(rows.length).toBe(2);
    expect(rows[0]?.items[0]?.gw).toBe(12);
    expect(rows[1]?.items[0]?.gw).toBe(12);
  });
});

