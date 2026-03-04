import type { DocType } from "../../core/doc/types";
import { randomUUID } from "../../core/utils/id";

/** 浏览器侧统一 AI 事件总线名称，可被宿主系统监听并转发到后端。 */
export const AI_TELEMETRY_EVENT = "chat-bi:ai-telemetry";

export type AiTelemetrySurface = "chart_recommend" | "chart_assistant" | "chat_bridge" | "runtime_qa";

export type AiTelemetryStage = "start" | "success" | "fallback" | "error" | "preview" | "apply" | "accept" | "reject" | "click";

export interface AiTelemetryContext {
  docId?: string;
  docType?: DocType;
  routeMode?: "view" | "edit";
  nodeId?: string;
  sourceId?: string;
  trigger?: string;
}

export interface AiTelemetryEvent {
  eventId: string;
  traceId: string;
  at: string;
  stage: AiTelemetryStage;
  surface: AiTelemetrySurface;
  action: string;
  source?: "ai" | "local" | "rule";
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  context: AiTelemetryContext;
  meta?: Record<string, unknown>;
}

export interface EmitAiTelemetryInput extends Omit<AiTelemetryEvent, "eventId" | "at" | "context"> {
  context?: Partial<AiTelemetryContext>;
}

type AiTelemetrySink = (event: AiTelemetryEvent) => void;

const sinks = new Set<AiTelemetrySink>();
let globalContext: AiTelemetryContext = {};

const nowIso = (): string => new Date().toISOString();

const perfNow = (): number => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

const mergeContext = (context?: Partial<AiTelemetryContext>): AiTelemetryContext => {
  if (!context) {
    return { ...globalContext };
  }
  return {
    ...globalContext,
    ...context
  };
};

/** 允许宿主在不侵入业务代码的前提下，通过 window 事件桥接埋点。 */
const dispatchToWindow = (event: AiTelemetryEvent): void => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof CustomEvent === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<AiTelemetryEvent>(AI_TELEMETRY_EVENT, { detail: event }));
};

/** 统一错误信息提取，避免上报出现非结构化对象。 */
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
    const code = typeof raw.code === "string" ? raw.code : undefined;
    const message = typeof raw.message === "string" ? raw.message : undefined;
    return { code, message };
  }
  return { message: String(error) };
};

/** 单次 AI 链路的追踪 ID。 */
export const createAiTraceId = (): string => randomUUID();

/** 轻量计时器，返回调用时到起点的毫秒耗时。 */
export const createAiTimer = (): (() => number) => {
  const startedAt = perfNow();
  return () => Math.max(0, Math.round(perfNow() - startedAt));
};

/** 发送一条标准化 AI 埋点事件。 */
export const emitAiTelemetry = (input: EmitAiTelemetryInput): AiTelemetryEvent => {
  const event: AiTelemetryEvent = {
    ...input,
    eventId: randomUUID(),
    at: nowIso(),
    context: mergeContext(input.context)
  };
  sinks.forEach((sink) => {
    try {
      sink(event);
    } catch {
      // Sink errors should never break editing flow.
    }
  });
  dispatchToWindow(event);
  return event;
};

/** 错误事件快捷方法：自动补全 stage/error 字段。 */
export const emitAiTelemetryError = (
  input: Omit<EmitAiTelemetryInput, "stage" | "errorCode" | "errorMessage">,
  error: unknown
): AiTelemetryEvent => {
  const info = normalizeError(error);
  return emitAiTelemetry({
    ...input,
    stage: "error",
    errorCode: info.code,
    errorMessage: info.message
  });
};

/** 注册自定义 sink（如上报器、调试面板）。 */
export const registerAiTelemetrySink = (sink: AiTelemetrySink): (() => void) => {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
};

/** 写入全局上下文（文档、路由模式等），用于所有后续事件自动继承。 */
export const setAiTelemetryContext = (context: Partial<AiTelemetryContext>): void => {
  globalContext = {
    ...globalContext,
    ...context
  };
};

/** 清空全局上下文，避免跨文档串脏数据。 */
export const resetAiTelemetryContext = (): void => {
  globalContext = {};
};
