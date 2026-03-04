import { afterEach, describe, expect, it } from "vitest";
import {
  clearChartRecommendProvider,
  registerChartRecommendProvider,
  requestAiChartRecommend,
  type SourceField
} from "./chart-recommend";

const fields: SourceField[] = [
  { name: "day", type: "time" },
  { name: "alarm_count", type: "number" },
  { name: "region", type: "string" }
];

afterEach(() => {
  clearChartRecommendProvider();
});

describe("chart recommend ai hook", () => {
  it("falls back to local recommendation when no provider is registered", async () => {
    const result = await requestAiChartRecommend({
      requestedType: "auto",
      fields,
      context: {
        docType: "dashboard",
        trigger: "create-wizard"
      }
    });
    expect(result.source).toBe("local");
    expect(result.bindings.length).toBeGreaterThan(0);
  });

  it("uses provider result when provider returns recommendation", async () => {
    registerChartRecommendProvider(async () => ({
      chartType: "bar",
      bindings: [{ role: "x", field: "region" }, { role: "y", field: "alarm_count", agg: "sum" }],
      reasons: ["AI override"]
    }));
    const result = await requestAiChartRecommend({
      requestedType: "line",
      fields,
      context: {
        docType: "dashboard",
        trigger: "inspector",
        nodeId: "chart_1"
      }
    });
    expect(result.source).toBe("ai");
    expect(result.chartType).toBe("bar");
    expect(result.reasons[0]).toContain("AI");
  });

  it("falls back to local recommendation when provider throws", async () => {
    registerChartRecommendProvider(async () => {
      throw new Error("network unavailable");
    });
    const result = await requestAiChartRecommend({
      requestedType: "auto",
      fields,
      context: {
        docType: "report",
        trigger: "source-switch",
        sourceId: "ds_1"
      }
    });
    expect(result.source).toBe("local");
    expect(result.bindings.length).toBeGreaterThan(0);
  });
});
