import type { VDoc, VNode } from "../../core/doc/types";
import { themes } from "../../runtime/theme/themes";
import { useEditorStore } from "../state/editor-context";
import { resolveStyleTrace } from "../utils/style-inheritance";

export function StyleInheritancePanel({ doc, node }: { doc: VDoc; node: VNode }): JSX.Element {
  const store = useEditorStore();
  const trace = resolveStyleTrace(doc.themeId, node.style);

  const applyToken = (tokenId: string): void => {
    store.executeCommand(
      {
        type: "UpdateStyle",
        nodeId: node.id,
        style: { tokenId }
      },
      { summary: "apply style token" }
    );
  };

  const resetOverrides = (): void => {
    store.executeCommand(
      {
        type: "ResetStyle",
        nodeId: node.id,
        style: trace.tokenThemeId ? { tokenId: trace.tokenThemeId } : undefined
      },
      { summary: "reset style overrides" }
    );
  };

  return (
    <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>样式继承链</strong>
        <span className="chip">覆盖 {trace.overrideCount}</span>
      </div>
      <div className="row">
        <span className="chip">Doc: {doc.themeId ?? "-"}</span>
        <span className="chip">Token: {trace.tokenThemeId}</span>
      </div>
      <label className="col">
        <span>节点 Token</span>
        <select className="select" value={node.style?.tokenId ?? trace.tokenThemeId} onChange={(event) => applyToken(event.target.value)}>
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.id}
            </option>
          ))}
        </select>
      </label>
      <div className="col" style={{ maxHeight: 140, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 6 }}>
        {trace.entries.map((entry) => (
          <div key={String(entry.key)} className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
            <span>
              {entry.key} <span className="muted">({entry.source})</span>
            </span>
            <span>{String(entry.value ?? "")}</span>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        回归继承会移除节点覆盖样式，仅保留 token。
      </div>
      <button className="btn" onClick={resetOverrides}>
        回归继承（清空覆盖）
      </button>
    </div>
  );
}
