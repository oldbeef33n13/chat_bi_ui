import type { DocType } from "../../core/doc/types";
import { randomUUID } from "../../core/utils/id";

export const EDITOR_TELEMETRY_EVENT = "chat-bi:editor-telemetry";

export type EditorTelemetrySurface = "report_editor" | "ppt_editor" | "dashboard_editor" | "external_bridge";
export type EditorTelemetryStage = "click" | "preview" | "apply" | "error";
export type EditorTelemetryTriggerSource = "toolbar" | "inline_plus" | "context_menu" | "keyboard" | "external_api" | "drag_drop";

export interface EditorTelemetryContext {
  docId?: string;
  docType?: DocType;
  routeMode?: "view" | "edit" | "present";
  sectionId?: string;
  slideId?: string;
  rowId?: string;
  nodeId?: string;
  anchorId?: string;
  presetId?: string;
  blockKind?: string;
  selectionCount?: number;
  trigger?: string;
}

export interface EditorSemanticActionTarget {
  docId?: string;
  sectionId?: string;
  slideId?: string;
  rowId?: string;
  nodeId?: string;
  anchorId?: string;
}

export interface EditorSemanticAction {
  action: string;
  target: EditorSemanticActionTarget;
  payload?: Record<string, unknown>;
  source?: "ui" | "external_api" | "ai";
  traceId?: string;
}

export interface EditorTelemetryEvent {
  eventId: string;
  traceId: string;
  at: string;
  stage: EditorTelemetryStage;
  surface: EditorTelemetrySurface;
  action: string;
  triggerSource?: EditorTelemetryTriggerSource;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  context: EditorTelemetryContext;
  semanticAction?: EditorSemanticAction;
  meta?: Record<string, unknown>;
}

export interface EmitEditorTelemetryInput extends Omit<EditorTelemetryEvent, "eventId" | "at" | "context"> {
  context?: Partial<EditorTelemetryContext>;
}

type EditorTelemetrySink = (event: EditorTelemetryEvent) => void;

const sinks = new Set<EditorTelemetrySink>();
let globalContext: EditorTelemetryContext = {};

const nowIso = (): string => new Date().toISOString();

const mergeContext = (context?: Partial<EditorTelemetryContext>): EditorTelemetryContext => {
  if (!context) {
    return { ...globalContext };
  }
  return {
    ...globalContext,
    ...context
  };
};

const normalizeError = (error: unknown): { code?: string; message?: string } => {
  if (!error) {
    return {};
  }
  if (typeof error === "string") {
    return { message: error };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  if (typeof error === "object") {
    const raw = error as { code?: unknown; message?: unknown };
    return {
      code: typeof raw.code === "string" ? raw.code : undefined,
      message: typeof raw.message === "string" ? raw.message : undefined
    };
  }
  return { message: String(error) };
};

const dispatchToWindow = (event: EditorTelemetryEvent): void => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof CustomEvent === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<EditorTelemetryEvent>(EDITOR_TELEMETRY_EVENT, { detail: event }));
};

export const createEditorTraceId = (): string => randomUUID();

export const emitEditorTelemetry = (input: EmitEditorTelemetryInput): EditorTelemetryEvent => {
  const event: EditorTelemetryEvent = {
    ...input,
    eventId: randomUUID(),
    at: nowIso(),
    context: mergeContext(input.context)
  };
  sinks.forEach((sink) => {
    try {
      sink(event);
    } catch {
      // Sink failures should never break editing flow.
    }
  });
  dispatchToWindow(event);
  return event;
};

export const emitEditorTelemetryError = (
  input: Omit<EmitEditorTelemetryInput, "stage" | "success" | "errorCode" | "errorMessage">,
  error: unknown
): EditorTelemetryEvent => {
  const info = normalizeError(error);
  return emitEditorTelemetry({
    ...input,
    stage: "error",
    success: false,
    errorCode: info.code,
    errorMessage: info.message
  });
};

export const registerEditorTelemetrySink = (sink: EditorTelemetrySink): (() => void) => {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
};

export const setEditorTelemetryContext = (context: Partial<EditorTelemetryContext>): void => {
  globalContext = {
    ...globalContext,
    ...context
  };
};

export const resetEditorTelemetryContext = (): void => {
  globalContext = {};
};
