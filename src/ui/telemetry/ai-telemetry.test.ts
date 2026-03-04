import { afterEach, describe, expect, it } from "vitest";
import {
  createAiTraceId,
  emitAiTelemetry,
  emitAiTelemetryError,
  registerAiTelemetrySink,
  resetAiTelemetryContext,
  setAiTelemetryContext,
  type AiTelemetryEvent
} from "./ai-telemetry";

afterEach(() => {
  resetAiTelemetryContext();
});

describe("ai telemetry", () => {
  it("emits event with merged global context", () => {
    const events: AiTelemetryEvent[] = [];
    const dispose = registerAiTelemetrySink((event) => events.push(event));
    setAiTelemetryContext({ docId: "doc_1", docType: "dashboard", routeMode: "edit" });
    const traceId = createAiTraceId();

    const emitted = emitAiTelemetry({
      traceId,
      stage: "success",
      surface: "chart_assistant",
      action: "ask",
      source: "local",
      context: {
        nodeId: "chart_1"
      },
      meta: {
        rowCount: 10
      }
    });

    dispose();
    expect(events).toHaveLength(1);
    expect(emitted.traceId).toBe(traceId);
    expect(events[0]?.context.docId).toBe("doc_1");
    expect(events[0]?.context.nodeId).toBe("chart_1");
    expect(events[0]?.stage).toBe("success");
  });

  it("normalizes error telemetry payload", () => {
    const events: AiTelemetryEvent[] = [];
    const dispose = registerAiTelemetrySink((event) => events.push(event));

    emitAiTelemetryError(
      {
        traceId: createAiTraceId(),
        surface: "chat_bridge",
        action: "explain_plan",
        source: "rule",
        context: { docType: "report" }
      },
      new Error("invalid json")
    );

    dispose();
    expect(events).toHaveLength(1);
    expect(events[0]?.stage).toBe("error");
    expect(events[0]?.errorMessage).toBe("invalid json");
  });
});
