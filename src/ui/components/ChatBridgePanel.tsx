import { useMemo, useState } from "react";
import type { CommandPlan } from "../../core/doc/types";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import type { Persona } from "../types/persona";
import { createAiTraceId, emitAiTelemetry } from "../telemetry/ai-telemetry";
import { explainPlan, inferCommandPlan } from "../utils/ai-command-plan";

/**
 * 通用 Chat Bridge：
 * - 支持自然语言 -> CommandPlan
 * - 支持计划预览/解释/Accept/Reject
 * - 与预览态/执行态联动，保证可回退可确认
 */
export function ChatBridgePanel({ persona = "analyst" }: { persona?: Persona }): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const pendingPlan = useSignalValue(store.pendingPlan);
  const preview = useSignalValue(store.pendingPlanDryRun);
  const [prompt, setPrompt] = useState("将当前图表改为折线并开启平滑与标签");
  const [rawPlan, setRawPlan] = useState("");
  const [explainText, setExplainText] = useState("");

  const inferredPlan = useMemo(() => inferCommandPlan(prompt, selection.primaryId, doc?.root), [doc?.root, prompt, selection.primaryId]);
  const telemetryContext = {
    docType: doc?.docType,
    nodeId: selection.primaryId
  };

  const handleGeneratePlan = (): void => {
    setRawPlan(JSON.stringify(inferredPlan, null, 2));
    setExplainText(explainPlan(inferredPlan));
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "success",
      surface: "chat_bridge",
      action: "generate_plan",
      source: "rule",
      context: telemetryContext,
      meta: {
        promptLength: prompt.trim().length,
        commandCount: inferredPlan.commands.length
      }
    });
  };

  const handlePreview = (): void => {
    const sourcePlan = rawPlan || inferredPlan;
    // 预览阶段不落库，仅生成 dry-run diff。
    const ok = store.previewPlan(sourcePlan);
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "preview",
      surface: "chat_bridge",
      action: "preview_plan",
      source: "rule",
      context: telemetryContext,
      meta: {
        ok,
        promptLength: prompt.trim().length
      }
    });
  };

  const handleExplain = (): void => {
    try {
      const plan = rawPlan.trim() ? (JSON.parse(rawPlan) as CommandPlan) : inferredPlan;
      setExplainText(explainPlan(plan));
      emitAiTelemetry({
        traceId: createAiTraceId(),
        stage: "success",
        surface: "chat_bridge",
        action: "explain_plan",
        source: "rule",
        context: telemetryContext,
        meta: {
          fromRawPlan: Boolean(rawPlan.trim()),
          commandCount: plan.commands.length
        }
      });
    } catch {
      setExplainText("命令解释失败：CommandPlan JSON 不合法。");
      emitAiTelemetry({
        traceId: createAiTraceId(),
        stage: "error",
        surface: "chat_bridge",
        action: "explain_plan",
        source: "rule",
        context: telemetryContext,
        errorCode: "invalid_plan_json",
        errorMessage: "CommandPlan JSON parse failed"
      });
    }
  };

  const handleAccept = (): void => {
    // Accept 才会把 pendingPlan 真正写入文档状态。
    const ok = store.acceptPreview("ai");
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "accept",
      surface: "chat_bridge",
      action: "accept_preview",
      source: "rule",
      context: telemetryContext,
      meta: { ok }
    });
  };

  const handleReject = (): void => {
    const hadPending = Boolean(store.pendingPlan.value);
    store.rejectPreview();
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "reject",
      surface: "chat_bridge",
      action: "reject_preview",
      source: "rule",
      context: telemetryContext,
      meta: { hadPending }
    });
  };

  return (
    <>
      <div className="panel-header">
        <span>Chat Bridge</span>
      </div>
      <div className="panel-body col">
        <label className="col">
          <span>自然语言输入</span>
          <input className="input" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <div className="row">
          <button
            className="btn"
            onClick={handleGeneratePlan}
          >
            生成命令计划
          </button>
          <button className="btn primary" onClick={handlePreview}>
            预览 Diff
          </button>
          <button className="btn" onClick={handleExplain}>
            命令解释
          </button>
        </div>

        <label className="col">
          <span>CommandPlan JSON</span>
          <textarea className="textarea" value={rawPlan} onChange={(event) => setRawPlan(event.target.value)} />
        </label>

        <div className="row">
          <button className="btn primary" disabled={!pendingPlan} onClick={handleAccept}>
            Accept
          </button>
          <button className="btn" disabled={!pendingPlan} onClick={handleReject}>
            Reject
          </button>
        </div>

        {preview ? (
          <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
            <strong>Diff Preview</strong>
            <span className="muted">{preview.summary}</span>
            <span className="muted">patches: {preview.patches.length}</span>
            <span className="muted">risk: {pendingPlan?.preview?.risk ?? "low"}</span>
            <ul className="diff-list">
              {preview.changedPaths.slice(0, 20).map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {explainText ? (
          <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
            <strong>{persona === "ai" ? "命令解释（AI协作）" : "命令解释"}</strong>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{explainText}</pre>
          </div>
        ) : null}
      </div>
    </>
  );
}

// infer/explain 逻辑已抽到 utils/ai-command-plan，保证多个 AI 入口行为一致。
