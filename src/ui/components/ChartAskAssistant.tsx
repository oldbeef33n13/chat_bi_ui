import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartSpec, VDoc, VNode } from "../../core/doc/types";
import { useEditorStore } from "../state/editor-context";
import { askChartAssistant, type ChartAssistantResult } from "../utils/chart-assistant";

export function ChartAskAssistant({
  doc,
  node,
  rows,
  compact = false
}: {
  doc: VDoc;
  node: VNode;
  rows: Array<Record<string, unknown>>;
  compact?: boolean;
}): JSX.Element {
  const store = useEditorStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("这个图最近的趋势是什么？");
  const [result, setResult] = useState<ChartAssistantResult | null>(null);
  const [hint, setHint] = useState("");

  const spec = useMemo(() => (node.props ?? {}) as ChartSpec, [node.props]);

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
    setPrompt(value);
    const next = askChartAssistant({
      prompt: value,
      nodeId: node.id,
      spec,
      rows
    });
    setResult(next);
    setHint(next.plan ? "已生成分析 + 建议改动" : "已生成分析结论");
  };

  const previewPlan = (): void => {
    if (!result?.plan) {
      return;
    }
    const ok = store.previewPlan(result.plan);
    setHint(ok ? "已生成预览，可在 Chat Bridge 里 Accept/Reject" : store.lastError.value ?? "预览失败");
  };

  const applyPlan = (): void => {
    if (!result?.plan) {
      return;
    }
    const ok = store.executeCommands(result.plan.commands, {
      actor: "ai",
      summary: result.plan.explain ?? "chart assistant apply"
    });
    setHint(ok ? "建议已应用，可按 Ctrl/Cmd+Z 撤销" : store.lastError.value ?? "应用失败");
  };

  return (
    <div
      ref={hostRef}
      className={`chart-ask-assistant ${compact ? "compact" : ""}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button className="mini-btn chart-ask-trigger" onClick={() => setOpen((value) => !value)}>
        智能追问
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
            <button className="btn primary" onClick={() => runAsk()}>
              发送
            </button>
          </div>
          {result ? (
            <>
              <div className="chart-ask-answer">{result.answer}</div>
              <div className="row chart-ask-suggestions">
                {result.suggestions.map((suggestion) => (
                  <button key={suggestion} className="btn mini-btn" onClick={() => runAsk(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
              {result.plan ? (
                <div className="col" style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 8 }}>
                  <div className="muted">{result.planSummary ?? "识别到可执行建议"}</div>
                  <div className="row">
                    <button className="btn" onClick={previewPlan}>
                      预览改动
                    </button>
                    <button className="btn primary" onClick={applyPlan}>
                      直接应用
                    </button>
                  </div>
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
