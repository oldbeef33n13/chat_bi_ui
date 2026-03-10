import { createPortal } from "react-dom";
import type { DataSourceDef } from "../../core/doc/types";
import type { DataEndpointField, DataEndpointMeta } from "../api/data-endpoint-repository";
import { formatSourceFieldLabel, recommendChartConfig, type SourceField } from "../utils/chart-recommend";

type GuideField = Pick<DataEndpointField, "name" | "type" | "label" | "description" | "unit" | "aggAble" | "required" | "defaultValue" | "enumValues">;

const formatValue = (value: unknown): string => {
  if (value === undefined) {
    return "-";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value.length > 0 ? value : '""';
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const extractSampleRows = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
  }
  if (value && typeof value === "object" && "rows" in (value as Record<string, unknown>)) {
    const rows = (value as Record<string, unknown>).rows;
    return Array.isArray(rows)
      ? rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
      : [];
  }
  return [];
};

const summarizeFields = (fields: GuideField[]): string => {
  const timeCount = fields.filter((field) => field.type === "time" || field.type === "date" || field.type === "datetime").length;
  const metricCount = fields.filter((field) => field.type === "number").length;
  const dimensionCount = fields.filter((field) => field.type === "string" || field.type === "boolean").length;
  return `${fields.length} 个字段，其中时间 ${timeCount} 个，指标 ${metricCount} 个，维度 ${dimensionCount} 个`;
};

const describeFieldRole = (field: GuideField): string => {
  const hint = `${field.name} ${field.label ?? ""}`.toLowerCase();
  if (field.type === "time" || field.type === "date" || field.type === "datetime") {
    return "时间";
  }
  if (field.type === "number") {
    return "指标";
  }
  if (/(source|from|caller|upstream)/.test(hint)) {
    return "关系来源";
  }
  if (/(target|to|callee|downstream)/.test(hint)) {
    return "关系目标";
  }
  return "维度";
};

const sampleColumns = (fields: GuideField[], sampleRows: Array<Record<string, unknown>>): string[] => {
  if (fields.length > 0) {
    return fields.slice(0, 8).map((field) => field.name);
  }
  const keys = new Set<string>();
  sampleRows.slice(0, 5).forEach((row) => {
    Object.keys(row).forEach((key) => keys.add(key));
  });
  return Array.from(keys).slice(0, 8);
};

export function DataGuideDialog({
  open,
  title,
  endpoint,
  source,
  fields,
  sampleRows,
  paramSummary = [],
  onClose
}: {
  open: boolean;
  title: string;
  endpoint?: DataEndpointMeta;
  source?: DataSourceDef;
  fields: GuideField[];
  sampleRows: Array<Record<string, unknown>>;
  paramSummary?: string[];
  onClose: () => void;
}): JSX.Element | null {
  if (!open) {
    return null;
  }

  const normalizedFields: SourceField[] = fields.map((field) => ({
    name: field.name,
    label: field.label,
    type:
      field.type === "number" || field.type === "boolean" || field.type === "json"
        ? field.type
        : field.type === "time" || field.type === "date" || field.type === "datetime"
          ? "time"
          : "string",
    unit: field.unit ?? null
  }));
  const recommend = recommendChartConfig("auto", normalizedFields);
  const effectiveSampleRows =
    sampleRows.length > 0 ? sampleRows : extractSampleRows(endpoint?.sampleResponse ?? source?.staticData);
  const columns = sampleColumns(fields, effectiveSampleRows);

  return createPortal(
    <div className="overlay-shell" role="presentation">
      <div className="overlay-backdrop" onClick={onClose} />
      <aside className="data-guide-dialog" role="dialog" aria-modal="true" aria-label={`${title}数据说明`}>
        <div className="data-guide-dialog-header row">
          <div className="col" style={{ gap: 4 }}>
            <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong>{title}</strong>
              {endpoint ? <span className="chip">{endpoint.providerType}</span> : null}
              {source ? <span className="chip">{source.type}</span> : null}
            </div>
            <span className="muted">
              {endpoint ? endpoint.description || `${endpoint.method} ${endpoint.path}` : source ? `数据源 ${source.id}` : "查看字段、参数与样例数据"}
            </span>
          </div>
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="data-guide-dialog-body">
          <section className="data-guide-card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>概览</strong>
              <span className="muted">{summarizeFields(fields)}</span>
            </div>
            <div className="data-guide-summary">
              推荐展示：{recommend.chartType}。{recommend.reasons.join("；")}
            </div>
            {endpoint ? (
              <div className="data-guide-meta-grid">
                <div><span className="muted">请求方式</span><strong>{endpoint.method}</strong></div>
                <div><span className="muted">接口路径</span><strong>{endpoint.path}</strong></div>
                <div><span className="muted">参数数量</span><strong>{endpoint.paramSchema.length}</strong></div>
                <div><span className="muted">字段数量</span><strong>{endpoint.resultSchema.length}</strong></div>
              </div>
            ) : null}
            {source ? (
              <div className="data-guide-meta-grid">
                <div><span className="muted">数据源 ID</span><strong>{source.id}</strong></div>
                <div><span className="muted">来源类型</span><strong>{source.type}</strong></div>
                <div><span className="muted">字段数量</span><strong>{fields.length}</strong></div>
                <div><span className="muted">样例行数</span><strong>{effectiveSampleRows.length}</strong></div>
              </div>
            ) : null}
          </section>

          {endpoint ? (
            <section className="data-guide-card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>参数定义</strong>
                <span className="muted">{endpoint.paramSchema.length} 个参数</span>
              </div>
              {endpoint.paramSchema.length === 0 ? <div className="muted">当前接口没有参数。</div> : null}
              {endpoint.paramSchema.length > 0 ? (
                <div className="data-guide-field-table">
                  <div className="data-guide-field-row data-guide-field-head">
                    <span>参数</span>
                    <span>类型</span>
                    <span>默认值</span>
                    <span>当前映射</span>
                  </div>
                  {endpoint.paramSchema.map((field) => (
                    <div key={`param_${field.name}`} className="data-guide-field-row">
                      <div>
                        <strong>{formatSourceFieldLabel(field)}</strong>
                        {field.description ? <div className="muted">{field.description}</div> : null}
                      </div>
                      <span>{field.type}</span>
                      <span>{formatValue(field.defaultValue)}</span>
                      <span>{paramSummary.find((item) => item.startsWith(formatSourceFieldLabel(field))) ?? "未映射"}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {endpoint.sampleRequest && Object.keys(endpoint.sampleRequest).length > 0 ? (
                <div className="data-guide-json">
                  <strong>样例请求</strong>
                  <pre>{JSON.stringify(endpoint.sampleRequest, null, 2)}</pre>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="data-guide-card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>字段定义</strong>
              <span className="muted">建议先看中文标签，再看英文名</span>
            </div>
            {fields.length === 0 ? <div className="muted">当前没有字段定义。</div> : null}
            {fields.length > 0 ? (
              <div className="data-guide-field-table">
                <div className="data-guide-field-row data-guide-field-head">
                  <span>字段</span>
                  <span>类型</span>
                  <span>推荐角色</span>
                  <span>统计</span>
                </div>
                {fields.map((field) => (
                  <div key={`field_${field.name}`} className="data-guide-field-row">
                    <div>
                      <strong>{formatSourceFieldLabel(field)}</strong>
                      {field.description ? <div className="muted">{field.description}</div> : null}
                    </div>
                    <span>{field.type}{field.unit ? ` · ${field.unit}` : ""}</span>
                    <span>{describeFieldRole(field)}</span>
                    <span>{field.aggAble === false ? "不建议统计" : field.type === "number" ? "可统计" : "维度字段"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="data-guide-card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>样例数据</strong>
              <span className="muted">{effectiveSampleRows.length > 0 ? `${effectiveSampleRows.length} 行样例` : "暂无样例"}</span>
            </div>
            {effectiveSampleRows.length === 0 ? <div className="muted">当前还没有样例数据，可先点“测试取数”。</div> : null}
            {effectiveSampleRows.length > 0 ? (
              <div className="data-guide-sample-wrap">
                <table className="data-guide-sample-table">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={`sample_head_${column}`}>{formatSourceFieldLabel(fields.find((field) => field.name === column) ?? { name: column })}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveSampleRows.slice(0, 10).map((row, rowIndex) => (
                      <tr key={`sample_row_${rowIndex}`}>
                        {columns.map((column) => (
                          <td key={`sample_${rowIndex}_${column}`}>{formatValue(row[column])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </aside>
    </div>,
    document.body
  );
}
