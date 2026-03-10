import { createPortal } from "react-dom";
import type { FieldBinding, VDoc, VNode } from "../../../core/doc/types";
import type { DataEndpointField, DataEndpointMeta } from "../../api/data-endpoint-repository";
import { inferRecommendedAgg } from "../../utils/chart-recommend";

export type InspectorTab = "basic" | "data" | "style" | "advanced";
export type ParamBindingValue = { from: "const" | "templateVar" | "systemVar" | "filter"; value?: unknown; key?: string };

export const inspectorTabLabel: Record<InspectorTab, string> = {
  basic: "基础",
  data: "数据",
  style: "样式",
  advanced: "高级"
};

export const isMeasureRole = (role: FieldBinding["role"]): boolean =>
  role === "y" ||
  role === "y1" ||
  role === "y2" ||
  role === "secondary" ||
  role === "ysecondary" ||
  role === "value";

export const isSeriesRole = (role: FieldBinding["role"]): boolean => role === "series" || role === "color" || role === "facet";

export const SYSTEM_VARIABLE_OPTIONS = [
  { key: "bizDate", label: "业务日期 (bizDate)" },
  { key: "today", label: "当前日期 (today)" },
  { key: "currentDateTime", label: "当前时间 (currentDateTime)" },
  { key: "currentMonth", label: "当前月份 (currentMonth)" },
  { key: "currentYear", label: "当前年份 (currentYear)" }
] as const;

export const AGG_LABELS: Record<NonNullable<FieldBinding["agg"]>, string> = {
  sum: "求和",
  avg: "平均值",
  min: "最小值",
  max: "最大值",
  count: "计数",
  distinctCount: "去重计数",
  p50: "P50",
  p95: "P95",
  p99: "P99"
};

export const AGG_OPTIONS: Array<{ value: NonNullable<FieldBinding["agg"]>; label: string; help: string }> = [
  { value: "sum", label: "求和", help: "适合总量、流量、次数、容量等累加指标。" },
  { value: "avg", label: "平均值", help: "适合时延、成功率、可用率、利用率等比例型指标。" },
  { value: "min", label: "最小值", help: "适合看最优情况或保底表现。" },
  { value: "max", label: "最大值", help: "适合看峰值、最高告警、最大延迟。" },
  { value: "count", label: "计数", help: "适合统计记录条数。" },
  { value: "distinctCount", label: "去重计数", help: "适合统计去重对象数，如设备数、用户数。" },
  { value: "p50", label: "P50", help: "适合看典型中位水平。" },
  { value: "p95", label: "P95", help: "适合看高位尾部表现。" },
  { value: "p99", label: "P99", help: "适合看极端尾部表现。" }
];

export const formatNamedLabel = (name: string, label?: string): string =>
  label && label.trim() && label.trim() !== name ? `${label} (${name})` : name;

export const formatParamValue = (value: unknown): string => {
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

export const findFieldMeta = <T extends { name: string; label?: string }>(fields: T[], fieldName?: string): T | undefined =>
  fieldName ? fields.find((field) => field.name === fieldName) : undefined;

export const describeParamBinding = (
  doc: VDoc,
  field: DataEndpointField,
  binding: ParamBindingValue | undefined
): string => {
  const safeBinding = binding ?? { from: "const", value: field.defaultValue };
  const fieldLabel = formatNamedLabel(field.name, field.label);
  if (safeBinding.from === "const") {
    const value = safeBinding.value === undefined ? field.defaultValue : safeBinding.value;
    return `${fieldLabel} = 固定值(${formatParamValue(value)})`;
  }
  if (safeBinding.from === "templateVar") {
    const variable = (doc.templateVariables ?? []).find((item) => item.key === safeBinding.key);
    return `${fieldLabel} = 模板变量(${formatNamedLabel(safeBinding.key ?? field.name, variable?.label)})`;
  }
  if (safeBinding.from === "systemVar") {
    const systemVar = SYSTEM_VARIABLE_OPTIONS.find((item) => item.key === safeBinding.key);
    return `${fieldLabel} = 系统变量(${systemVar?.label ?? (safeBinding.key ?? field.name)})`;
  }
  const filter = (doc.filters ?? []).find((item) => item.filterId === safeBinding.key || item.bindParam === safeBinding.key);
  return `${fieldLabel} = 筛选默认值(${formatNamedLabel(safeBinding.key ?? field.name, filter?.title)})`;
};

export const describeResolvedParams = (endpoint: DataEndpointMeta | undefined, resolvedParams: Record<string, unknown>): string => {
  if (!endpoint || endpoint.paramSchema.length === 0) {
    return "无参数";
  }
  const parts = endpoint.paramSchema
    .filter((field) => Object.prototype.hasOwnProperty.call(resolvedParams, field.name))
    .map((field) => `${formatNamedLabel(field.name, field.label)}=${formatParamValue(resolvedParams[field.name])}`);
  return parts.length > 0 ? parts.join("；") : "当前没有可用参数值";
};

export const formatAggLabel = (agg?: FieldBinding["agg"]): string =>
  AGG_LABELS[(agg ?? "sum") as NonNullable<FieldBinding["agg"]>] ?? String(agg ?? "sum");

export const describeStatNarrative = (
  fields: Array<{ name: string; label?: string; type?: string; unit?: string | null }>,
  metric?: FieldBinding,
  xBinding?: FieldBinding,
  seriesBindings: FieldBinding[] = []
): string => {
  if (!metric?.field) {
    return "先选择要统计的指标字段，系统会自动推荐统计口径。";
  }
  const metricMeta = findFieldMeta(fields, metric.field);
  const metricLabel = formatNamedLabel(metric.field, metricMeta?.label);
  const xMeta = xBinding ? findFieldMeta(fields, xBinding.field) : undefined;
  const xLabel = xBinding ? formatNamedLabel(xBinding.field, xMeta?.label) : undefined;
  const seriesText =
    seriesBindings.length > 0
      ? `，并按 ${seriesBindings
          .map((binding) => formatNamedLabel(binding.field, findFieldMeta(fields, binding.field)?.label))
          .join(" / ")} 分组`
      : "";
  if (!xLabel) {
    return `对 ${metricLabel} 做${formatAggLabel(metric.agg)}统计${seriesText}。`;
  }
  return `按 ${xLabel} 统计 ${metricLabel}，口径为${formatAggLabel(metric.agg)}${seriesText}。`;
};

export const extractSourceSampleRows = (source?: { staticData?: unknown }): Array<Record<string, unknown>> =>
  Array.isArray(source?.staticData)
    ? source.staticData.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    : [];

export const coerceParamInput = (raw: string, type?: string): unknown => {
  if (type === "number") {
    const next = Number(raw);
    return Number.isFinite(next) ? next : 0;
  }
  if (type === "boolean") {
    return raw === "true" || raw === "1";
  }
  return raw;
};

export const formatMetaValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : "-";
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

export const tabsByNode = (node: VNode): InspectorTab[] => {
  if (node.kind === "chart" || node.kind === "table") {
    return ["basic", "data", "style", "advanced"];
  }
  if (node.kind === "text") {
    return ["basic", "style", "advanced"];
  }
  return ["basic", "advanced"];
};

export function ChartStatModeDialog({
  open,
  fields,
  xBinding,
  seriesBindings,
  primaryY,
  secondaryY,
  onChangePrimaryAgg,
  onChangeSecondaryAgg,
  onClose
}: {
  open: boolean;
  fields: Array<{ name: string; label?: string; type?: string; unit?: string | null }>;
  xBinding?: FieldBinding;
  seriesBindings?: FieldBinding[];
  primaryY?: FieldBinding;
  secondaryY?: FieldBinding;
  onChangePrimaryAgg: (agg: FieldBinding["agg"]) => void;
  onChangeSecondaryAgg: (agg: FieldBinding["agg"]) => void;
  onClose: () => void;
}): JSX.Element | null {
  if (!open) {
    return null;
  }

  const renderMeasureCard = (
    title: string,
    measure: FieldBinding | undefined,
    onChange: (agg: FieldBinding["agg"]) => void
  ): JSX.Element => {
    if (!measure?.field) {
      return (
        <div className="inspector-stat-card">
          <strong>{title}</strong>
          <div className="muted">当前还没有配置这个统计指标。</div>
        </div>
      );
    }
    const fieldMeta = findFieldMeta(fields, measure.field);
    const recommendedAgg = inferRecommendedAgg({
      name: measure.field,
      label: fieldMeta?.label,
      type: (fieldMeta?.type as "string" | "number" | "boolean" | "time" | "json" | undefined) ?? "number",
      unit: fieldMeta && "unit" in fieldMeta ? (fieldMeta.unit as string | null | undefined) : null
    });
    return (
      <div className="inspector-stat-card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>{title}</strong>
          <span className="chip">{formatAggLabel(measure.agg)}</span>
        </div>
        <div className="inspector-stat-narrative">{describeStatNarrative(fields, measure, xBinding, seriesBindings ?? [])}</div>
        <label className="col">
          <span>统计口径</span>
          <select className="select" value={measure.agg ?? recommendedAgg} onChange={(event) => onChange(event.target.value as FieldBinding["agg"])}>
            {AGG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="muted">
          系统推荐：{formatAggLabel(recommendedAgg)}。{
            AGG_OPTIONS.find((option) => option.value === (measure.agg ?? recommendedAgg))?.help ?? ""
          }
        </div>
        {(measure.agg ?? recommendedAgg) !== recommendedAgg ? (
          <button className="btn mini-btn" onClick={() => onChange(recommendedAgg)}>
            恢复系统推荐
          </button>
        ) : null}
      </div>
    );
  };

  return createPortal(
    <div className="overlay-shell" role="presentation">
      <div className="overlay-backdrop" onClick={onClose} />
      <aside className="inspector-param-dialog" role="dialog" aria-modal="true" aria-label="统计口径设置">
        <div className="inspector-param-dialog-header row">
          <div className="col" style={{ gap: 4 }}>
            <strong>统计口径设置</strong>
            <span className="muted">
              统计口径决定同一分析维度下，指标字段如何汇总。数量/流量通常求和，比例/时延通常取平均。
            </span>
          </div>
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="inspector-param-dialog-body" style={{ display: "flex", flexDirection: "column" }}>
          {renderMeasureCard("主指标", primaryY, onChangePrimaryAgg)}
          {secondaryY ? renderMeasureCard("第二指标", secondaryY, onChangeSecondaryAgg) : null}
        </div>
      </aside>
    </div>,
    document.body
  );
}

export function ParamBindingEditorDialog({
  open,
  title,
  doc,
  endpoint,
  paramBindings,
  resolvedParams,
  onChangeBinding,
  onClose
}: {
  open: boolean;
  title: string;
  doc: VDoc;
  endpoint?: DataEndpointMeta;
  paramBindings: Record<string, ParamBindingValue>;
  resolvedParams: Record<string, unknown>;
  onChangeBinding: (paramName: string, patch: Partial<ParamBindingValue>) => void;
  onClose: () => void;
}): JSX.Element | null {
  if (!open || !endpoint) {
    return null;
  }
  return createPortal(
    <div className="overlay-shell" role="presentation">
      <div className="overlay-backdrop" onClick={onClose} />
      <aside className="inspector-param-dialog" role="dialog" aria-modal="true" aria-label={`${title}参数映射`}>
        <div className="inspector-param-dialog-header row">
          <div className="col" style={{ gap: 4 }}>
            <strong>{`${title}参数映射`}</strong>
            <span className="muted">
              设计器测试使用模板默认值、系统变量和筛选默认值；运行预览、导出与定时任务会用运行变量覆盖模板变量。
            </span>
          </div>
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="inspector-param-dialog-body">
          {endpoint.paramSchema.length === 0 ? <div className="muted">当前接口无参数。</div> : null}
          {endpoint.paramSchema.map((field) => {
            const binding = paramBindings[field.name] ?? { from: "const", value: field.defaultValue ?? "" };
            const templateVariables = doc.templateVariables ?? [];
            const filters = doc.filters ?? [];
            return (
              <div key={`param_editor_${field.name}`} className="inspector-param-card">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{formatNamedLabel(field.name, field.label)}</strong>
                  <span className="muted">{field.type}</span>
                </div>
                <label className="col">
                  <span>取值来源</span>
                  <select
                    className="select"
                    value={binding.from}
                    onChange={(event) =>
                      onChangeBinding(field.name, {
                        from: event.target.value as "const" | "templateVar" | "systemVar" | "filter",
                        key: event.target.value === "const" ? undefined : binding.key
                      })
                    }
                  >
                    <option value="const">固定值</option>
                    <option value="templateVar">模板变量</option>
                    <option value="systemVar">系统变量</option>
                    <option value="filter">筛选器默认值</option>
                  </select>
                </label>
                {binding.from === "const" ? (
                  <label className="col">
                    <span>参数值</span>
                    {field.enumValues?.length ? (
                      <select
                        className="select"
                        value={String(binding.value ?? field.defaultValue ?? "")}
                        onChange={(event) => onChangeBinding(field.name, { value: coerceParamInput(event.target.value, field.type) })}
                      >
                        {field.enumValues.map((value) => (
                          <option key={`${field.name}_${value}`} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        value={String(binding.value ?? field.defaultValue ?? "")}
                        onChange={(event) => onChangeBinding(field.name, { value: coerceParamInput(event.target.value, field.type) })}
                      />
                    )}
                  </label>
                ) : null}
                {binding.from === "templateVar" ? (
                  <label className="col">
                    <span>模板变量</span>
                    <select className="select" value={String(binding.key ?? "")} onChange={(event) => onChangeBinding(field.name, { key: event.target.value })}>
                      <option value="">请选择模板变量</option>
                      {templateVariables.map((item) => (
                        <option key={`var_${item.key}`} value={item.key}>
                          {formatNamedLabel(item.key, item.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {binding.from === "systemVar" ? (
                  <label className="col">
                    <span>系统变量</span>
                    <select className="select" value={String(binding.key ?? "")} onChange={(event) => onChangeBinding(field.name, { key: event.target.value })}>
                      <option value="">请选择系统变量</option>
                      {SYSTEM_VARIABLE_OPTIONS.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {binding.from === "filter" ? (
                  <label className="col">
                    <span>筛选器</span>
                    <select className="select" value={String(binding.key ?? "")} onChange={(event) => onChangeBinding(field.name, { key: event.target.value })}>
                      <option value="">请选择筛选器</option>
                      {filters.map((item) => (
                        <option key={`filter_${item.filterId}`} value={item.bindParam ?? item.filterId}>
                          {formatNamedLabel(item.bindParam ?? item.filterId, item.title)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="muted inspector-param-effective">生效值：{formatParamValue(resolvedParams[field.name])}</div>
                {field.description ? <div className="muted">{field.description}</div> : null}
              </div>
            );
          })}
        </div>
      </aside>
    </div>,
    document.body
  );
}
