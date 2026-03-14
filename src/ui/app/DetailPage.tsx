import type { TemplateVariableDef, VDoc } from "../../core/doc/types";
import type { TemplateRun } from "../api/template-runtime-repository";
import type { TemplateMeta } from "../api/template-repository";
import { DocRuntimeView } from "../components/DocRuntimeView";
import { TemplateVariableForm } from "../components/TemplateVariableForm";
import { formatRuntimeValue } from "./shared";

export function DetailPage({
  record,
  doc,
  variablePanelOpen,
  variableDefs,
  variableValues,
  resolvedVariables,
  exportRun,
  onVariableChange
}: {
  record: TemplateMeta;
  doc: VDoc;
  variablePanelOpen: boolean;
  variableDefs: TemplateVariableDef[];
  variableValues: Record<string, unknown>;
  resolvedVariables: Record<string, unknown>;
  exportRun: TemplateRun | null;
  onVariableChange: (key: string, value: unknown, variable?: TemplateVariableDef) => void;
}): JSX.Element {
  const resolvedEntries = Object.entries(resolvedVariables);

  return (
    <div className="runtime-shell">
      <div className="runtime-header">
        <div className="col" style={{ gap: 4 }}>
          <strong>{record.name}</strong>
          <span className="muted">{record.description}</span>
        </div>
        <div className="row">
          <span className="chip">当前查看: 发布版</span>
          <span className="chip">类型: {record.docType}</span>
        </div>
      </div>
      {variablePanelOpen && variableDefs.length > 0 ? (
        <div className="runtime-variable-panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>运行变量</strong>
            <span className="muted">preview / export / schedule 共用同一套变量定义</span>
          </div>
          <TemplateVariableForm
            variables={variableDefs}
            values={variableValues}
            onChange={(key, value) => {
              const variable = variableDefs.find((item) => item.key === key);
              onVariableChange(key, value, variable);
            }}
            compact
          />
        </div>
      ) : null}
      {resolvedEntries.length > 0 ? (
        <div className="runtime-variable-panel" style={{ paddingTop: 0 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <strong>本次预览变量</strong>
            {resolvedEntries.map(([key, value]) => (
              <span key={key} className="chip">
                {key}={formatRuntimeValue(value)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {exportRun ? (
        <div className="runtime-variable-panel" style={{ paddingTop: 0 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>最近导出</strong>
            <span className="chip">状态: {exportRun.status}</span>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {exportRun.artifacts.map((artifact) => (
              <a key={artifact.id} className="runtime-artifact-link" href={artifact.downloadUrl} target="_blank" rel="noreferrer">
                <strong>{artifact.fileName}</strong>
                <span className="muted">{artifact.artifactType}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
      <div className="runtime-body">
        <DocRuntimeView doc={doc} />
      </div>
    </div>
  );
}
