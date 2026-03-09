import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartSpec, VDoc, VNode } from "../../core/doc/types";
import { useMaybeEditorStore } from "../state/editor-context";
import { askChartAssistant, type ChartAssistantResult } from "../utils/chart-assistant";
import { createAiTimer, createAiTraceId, emitAiTelemetry } from "../telemetry/ai-telemetry";

/**
 * 图表级智能追问面板：
 * 1) 问答分析；2) 生成可执行计划；3) 预览或直接应用改动。
 */
export function ChartAskAssistant({
  doc,
  node,
  rows,
  compact = false,
  triggerMode = "text"
}: {
  doc: VDoc;
  node: VNode;
  rows: Array<Record<string, unknown>>;
  compact?: boolean;
  triggerMode?: "text" | "icon";
}): JSX.Element {
  const store = useMaybeEditorStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("这个图最近的趋势是什么？");
  const [result, setResult] = useState<ChartAssistantResult | null>(null);
  const [hint, setHint] = useState("");

  const spec = useMemo(() => (node.props ?? {}) as ChartSpec, [node.props]);
  const telemetryContext = useMemo(
    () => ({
      docType: doc.docType,
      nodeId: node.id,
      sourceId: node.data?.sourceId
    }),
    [doc.docType, node.data?.sourceId, node.id]
  );

  useEffect(() => {
    setResult(null);
    setHint("");
    setOpen(false);
  }, [node.id]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!hostRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const runAsk = (nextPrompt?: string): void => {
    const value = (nextPrompt ?? prompt).trim();
    if (!value) {
      return;
    }
    const traceId = createAiTraceId();
    const timer = createAiTimer();
    emitAiTelemetry({
      traceId,
      stage: "start",
      surface: "chart_assistant",
      action: "ask",
      source: "local",
      context: telemetryContext,
      meta: {
        promptLength: value.length,
        rowCount: rows.length
      }
    });
    setPrompt(value);
    const next = askChartAssistant({
      prompt: value,
      nodeId: node.id,
      spec,
      rows
    });
    emitAiTelemetry({
      traceId,
      stage: "success",
      surface: "chart_assistant",
      action: "ask",
      source: "local",
      latencyMs: timer(),
      context: telemetryContext,
      meta: {
        promptLength: value.length,
        rowCount: rows.length,
        hasPlan: Boolean(next.plan),
        suggestionCount: next.suggestions.length
      }
    });
    setResult(next);
    setHint(next.plan ? "已生成分析 + 建议改动" : "已生成分析结论");
  };

  const previewPlan = (): void => {
    if (!result?.plan || !store) {
      return;
    }
    // 走统一预览链路，后续可在 ChatBridge 继续 Accept/Reject。
    const ok = store.previewPlan(result.plan);
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "preview",
      surface: "chart_assistant",
      action: "plan_preview",
      source: "rule",
      context: telemetryContext,
      meta: {
        ok,
        commandCount: result.plan.commands.length
      }
    });
    setHint(ok ? "已生成预览，可在 Chat Bridge 里 Accept/Reject" : store.lastError.value ?? "预览失败");
  };

  const applyPlan = (): void => {
    if (!result?.plan || !store) {
      return;
    }
    // 直接应用属于“快捷通道”，但仍保留可撤销能力。
    const ok = store.executeCommands(result.plan.commands, {
      actor: "ai",
      summary: result.plan.explain ?? "chart assistant apply"
    });
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "apply",
      surface: "chart_assistant",
      action: "plan_apply",
      source: "rule",
      context: telemetryContext,
      meta: {
        ok,
        commandCount: result.plan.commands.length
      }
    });
    setHint(ok ? "建议已应用，可按 Ctrl/Cmd+Z 撤销" : store.lastError.value ?? "应用失败");
  };

  const toggleOpen = (): void => {
    setOpen((value) => {
      const next = !value;
      emitAiTelemetry({
        traceId: createAiTraceId(),
        stage: "click",
        surface: "chart_assistant",
        action: "panel_toggle",
        source: "local",
        context: telemetryContext,
        meta: { open: next }
      });
      return next;
    });
  };

  return (
    <div
      ref={hostRef}
      className={`chart-ask-assistant ${compact ? "compact" : ""}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className={`mini-btn chart-ask-trigger ${triggerMode === "icon" ? "icon" : ""}`}
        title="打开图表智能追问"
        aria-label="图表智能追问"
        onClick={toggleOpen}
      >
        {triggerMode === "icon" ? "✦" : "智能追问"}
      </button>
      {open ? (
        <div className="chart-ask-pop col">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>图表智能追问</strong>
            <span className="muted">{doc.docType}</span>
          </div>
          <div className="row">
            <input
              className="input"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runAsk();
                }
              }}
              placeholder="继续追问数据，或说“改成柱状图并开标签”"
            />
            <button className="btn primary" title="发送问题" onClick={() => runAsk()}>
              发送
            </button>
          </div>
          {result ? (
            <>
              <div className="chart-ask-answer">{result.answer}</div>
              <div className="row chart-ask-suggestions">
                {result.suggestions.map((suggestion) => (
                  <button key={suggestion} className="btn mini-btn" title="使用建议追问" onClick={() => runAsk(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
              {result.plan ? (
                <div className="col" style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 8 }}>
                  <div className="muted">{result.planSummary ?? "识别到可执行建议"}</div>
                  {store ? (
                    <div className="row">
                      <button className="btn" title="预览建议改动，不立即执行" onClick={previewPlan}>
                        预览改动
                      </button>
                      <button className="btn primary" title="直接应用建议改动（可撤销）" onClick={applyPlan}>
                        直接应用
                      </button>
                    </div>
                  ) : (
                    <div className="muted">当前为运行态，仅提供分析问答，不直接修改图表。</div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>
              你可以问：趋势变化、峰值时段、异常点，也可以直接让它改图。
            </div>
          )}
          {hint ? <div className="muted">{hint}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
