import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearChartRecommendProvider,
  registerChartRecommendProvider,
  requestAiChartRecommend,
  type SourceField
} from "./chart-recommend";
import { registerAiTelemetrySink, resetAiTelemetryContext, type AiTelemetryEvent } from "../telemetry/ai-telemetry";

/** 测试字段样本。 */
const fields: SourceField[] = [
  { name: "day", type: "time" },
  { name: "alarm_count", type: "number" },
  { name: "region", type: "string" }
];

afterEach(() => {
  clearChartRecommendProvider();
  resetAiTelemetryContext();
  currentDispose?.();
  currentDispose = undefined;
});

let telemetryEvents: AiTelemetryEvent[] = [];
let currentDispose: (() => void) | undefined;

beforeEach(() => {
  telemetryEvents = [];
  currentDispose = registerAiTelemetrySink((event) => telemetryEvents.push(event));
});

/** 图表推荐 AI 链路测试：AI 可用、不可用、异常三种路径。 */
describe("chart recommend ai hook", () => {
  /** provider 缺失时应走本地推荐兜底并上报 fallback。 */
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
    expect(telemetryEvents.some((event) => event.surface === "chart_recommend" && event.stage === "start")).toBe(true);
    expect(telemetryEvents.some((event) => event.surface === "chart_recommend" && event.stage === "fallback")).toBe(true);
  });

  /** provider 返回结果时应优先采用 AI 输出。 */
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
    expect(telemetryEvents.some((event) => event.surface === "chart_recommend" && event.stage === "success" && event.source === "ai")).toBe(true);
  });

  /** provider 抛错时应回退本地推荐并记录 error/fallback。 */
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
    expect(telemetryEvents.some((event) => event.surface === "chart_recommend" && event.stage === "error")).toBe(true);
    expect(telemetryEvents.some((event) => event.surface === "chart_recommend" && event.stage === "fallback")).toBe(true);
  });
});
