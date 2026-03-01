import { useMemo, useState } from "react";
import type { CommandPlan } from "../../core/doc/types";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import type { Persona } from "../types/persona";

export function ChatBridgePanel({ persona = "analyst" }: { persona?: Persona }): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const pendingPlan = useSignalValue(store.pendingPlan);
  const preview = useSignalValue(store.pendingPlanDryRun);
  const auditLogs = useSignalValue(store.auditLogs);
  const [prompt, setPrompt] = useState("将当前图表改为折线并开启平滑与标签");
  const [rawPlan, setRawPlan] = useState("");
  const [explainText, setExplainText] = useState("");

  const inferredPlan = useMemo(() => inferCommandPlan(prompt, selection.primaryId, doc?.root), [doc?.root, prompt, selection.primaryId]);

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
            onClick={() => {
              setRawPlan(JSON.stringify(inferredPlan, null, 2));
              setExplainText(explainPlan(inferredPlan));
            }}
          >
            生成命令计划
          </button>
          <button className="btn primary" onClick={() => store.previewPlan(rawPlan || inferredPlan)}>
            预览 Diff
          </button>
          <button
            className="btn"
            onClick={() => {
              try {
                const plan = rawPlan.trim() ? (JSON.parse(rawPlan) as CommandPlan) : inferredPlan;
                setExplainText(explainPlan(plan));
              } catch {
                setExplainText("命令解释失败：CommandPlan JSON 不合法。");
              }
            }}
          >
            命令解释
          </button>
        </div>

        <label className="col">
          <span>CommandPlan JSON</span>
          <textarea className="textarea" value={rawPlan} onChange={(event) => setRawPlan(event.target.value)} />
        </label>

        <div className="row">
          <button className="btn primary" disabled={!pendingPlan} onClick={() => store.acceptPreview("ai")}>
            Accept
          </button>
          <button className="btn" disabled={!pendingPlan} onClick={() => store.rejectPreview()}>
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

        <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          <strong>Audit Log</strong>
          <div style={{ maxHeight: 220, overflow: "auto" }}>
            {auditLogs.slice(0, 20).map((item) => (
              <div key={item.id} className="block" style={{ margin: "6px 0" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="chip">{item.actor}</span>
                  <span className="muted">{item.at}</span>
                </div>
                <div>{item.summary}</div>
                {item.changedPaths.length > 0 ? <div className="muted">{item.changedPaths.slice(0, 2).join(" | ")}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

const inferCommandPlan = (input: string, currentNodeId?: string, root?: { id: string; kind: string; children?: any[] }): CommandPlan => {
  const nodeId = currentNodeId ?? "node_123";
  const commands: CommandPlan["commands"] = [];

  if (/折线|line/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { chartType: "line" } });
  }
  if (/柱状|bar/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { chartType: "bar" } });
  }
  if (/饼图|pie/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { chartType: "pie" } });
  }
  if (/平滑|smooth/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { smooth: true } });
  }
  if (/标签|label/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { labelShow: true } });
  }
  if (/暗色|dark/i.test(input)) {
    commands.push({ type: "ApplyTheme", scope: "doc", themeId: "theme.tech.dark" });
  }
  if (/所有图表.*标签|全部图表.*标签/i.test(input)) {
    const chartIds = collectChartIds(root);
    commands.push({
      type: "Transaction",
      commands: (chartIds.length > 0 ? chartIds : [nodeId]).map((id) => ({ type: "UpdateProps", nodeId: id, props: { labelShow: true } }))
    });
  }

  if (commands.length === 0) {
    commands.push({ type: "UpdateProps", nodeId, props: { smooth: true } });
  }

  return {
    intent: "update",
    targets: [nodeId],
    commands,
    explain: input
  };
};

const explainPlan = (plan: CommandPlan): string => {
  const lines: string[] = [];
  lines.push(`意图: ${plan.intent}`);
  if (plan.explain) {
    lines.push(`描述: ${plan.explain}`);
  }
  lines.push(`命令数: ${plan.commands.length}`);
  plan.commands.forEach((command, index) => {
    const i = index + 1;
    if (command.type === "UpdateProps") {
      lines.push(`${i}. UpdateProps -> node=${command.nodeId ?? "-"} fields=${Object.keys(command.props ?? {}).join(", ") || "-"}`);
      return;
    }
    if (command.type === "UpdateLayout") {
      lines.push(`${i}. UpdateLayout -> node=${command.nodeId ?? "-"} fields=${Object.keys(command.layout ?? {}).join(", ") || "-"}`);
      return;
    }
    if (command.type === "UpdateStyle") {
      lines.push(`${i}. UpdateStyle -> node=${command.nodeId ?? "-"} fields=${Object.keys(command.style ?? {}).join(", ") || "-"}`);
      return;
    }
    if (command.type === "ApplyTheme") {
      lines.push(`${i}. ApplyTheme -> scope=${typeof command.scope === "string" ? command.scope : command.scope?.nodeId ?? "doc"} theme=${command.themeId ?? "-"}`);
      return;
    }
    if (command.type === "Transaction") {
      lines.push(`${i}. Transaction -> 子命令 ${command.commands?.length ?? 0} 条`);
      return;
    }
    lines.push(`${i}. ${command.type}`);
  });
  return lines.join("\n");
};

const collectChartIds = (root?: { id: string; kind: string; children?: any[] }): string[] => {
  if (!root) {
    return [];
  }
  const ids: string[] = [];
  const walk = (node: { id: string; kind: string; children?: any[] }): void => {
    if (node.kind === "chart") {
      ids.push(node.id);
    }
    node.children?.forEach((child) => walk(child));
  };
  walk(root);
  return ids;
};
