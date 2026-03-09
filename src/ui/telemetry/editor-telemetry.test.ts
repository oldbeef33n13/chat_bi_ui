import { afterEach, describe, expect, it } from "vitest";
import {
  createEditorTraceId,
  emitEditorTelemetry,
  emitEditorTelemetryError,
  registerEditorTelemetrySink,
  resetEditorTelemetryContext,
  setEditorTelemetryContext,
  type EditorTelemetryEvent
} from "./editor-telemetry";

afterEach(() => {
  resetEditorTelemetryContext();
});

describe("editor telemetry", () => {
  it("emits event with merged global context", () => {
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));
    setEditorTelemetryContext({ docId: "doc_report_1", docType: "report", routeMode: "edit" });
    const traceId = createEditorTraceId();

    const emitted = emitEditorTelemetry({
      traceId,
      stage: "apply",
      surface: "report_editor",
      action: "insert_row_template",
      triggerSource: "inline_plus",
      success: true,
      context: {
        sectionId: "section_1",
        presetId: "chart_compare"
      },
      semanticAction: {
        action: "insert_row_template",
        source: "ui",
        traceId,
        target: {
          docId: "doc_report_1",
          sectionId: "section_1",
          anchorId: "section_1:section-start"
        }
      }
    });

    dispose();
    expect(events).toHaveLength(1);
    expect(emitted.traceId).toBe(traceId);
    expect(events[0]?.context.docId).toBe("doc_report_1");
    expect(events[0]?.context.sectionId).toBe("section_1");
    expect(events[0]?.context.presetId).toBe("chart_compare");
  });

  it("normalizes error telemetry payload", () => {
    const events: EditorTelemetryEvent[] = [];
    const dispose = registerEditorTelemetrySink((event) => events.push(event));

    emitEditorTelemetryError(
      {
        traceId: createEditorTraceId(),
        surface: "report_editor",
        action: "insert_row_template",
        triggerSource: "inline_plus",
        context: { docType: "report", sectionId: "section_2" }
      },
      new Error("apply failed")
    );

    dispose();
    expect(events).toHaveLength(1);
    expect(events[0]?.stage).toBe("error");
    expect(events[0]?.errorMessage).toBe("apply failed");
    expect(events[0]?.success).toBe(false);
  });
});
