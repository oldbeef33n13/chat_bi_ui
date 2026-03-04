import type { ChartSpec } from "../../core/doc/types";

/** 容错数值转换。 */
const asNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** 分位数计算（离散下标法）。 */
const quantile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx] ?? 0;
};

/** 聚合函数计算，和图表渲染 agg 语义保持一致。 */
const aggregate = (values: number[], agg: ChartSpec["bindings"][number]["agg"]): number => {
  switch (agg) {
    case "avg":
      return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
    case "min":
      return values.length ? Math.min(...values) : 0;
    case "max":
      return values.length ? Math.max(...values) : 0;
    case "count":
      return values.length;
    case "distinctCount":
      return new Set(values).size;
    case "p50":
      return quantile(values, 0.5);
    case "p95":
      return quantile(values, 0.95);
    case "p99":
      return quantile(values, 0.99);
    case "sum":
    default:
      return values.reduce((sum, item) => sum + item, 0);
  }
};

/** 从图表数据生成一段可直接展示/导出的中文总结。 */
export const summarizeChartRows = (spec: ChartSpec, rows: Array<Record<string, unknown>>): string => {
  if (rows.length === 0) {
    return "当前数据为空，建议先检查数据源或过滤条件。";
  }
  const xBinding = spec.bindings.find((item) => item.role === "x" || item.role === "category");
  const yBinding = spec.bindings.find((item) => item.role === "y" || item.role === "value");
  if (!xBinding || !yBinding) {
    return "当前图表字段绑定不完整，建议先配置 X/Y 轴后再生成总结。";
  }

  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const x = String(row[xBinding.field] ?? "-");
    const y = asNumber(row[yBinding.field]);
    if (!grouped.has(x)) {
      grouped.set(x, []);
    }
    grouped.get(x)!.push(y);
  }

  const points = [...grouped.entries()].map(([x, values]) => ({
    x,
    y: aggregate(values, yBinding.agg)
  }));
  if (points.length === 0) {
    return "当前数据不可用，暂无可生成的结论。";
  }

  const sorted = [...points].sort((a, b) => String(a.x).localeCompare(String(b.x)));
  const latest = sorted[sorted.length - 1]!;
  const max = [...points].sort((a, b) => b.y - a.y)[0]!;
  const min = [...points].sort((a, b) => a.y - b.y)[0]!;
  const avg = points.reduce((sum, item) => sum + item.y, 0) / points.length;

  const metricName = yBinding.as ?? yBinding.field;
  const title = spec.titleText ?? "图表";

  return `${title}：${metricName}最新为 ${latest.y.toFixed(2)}（${latest.x}），峰值 ${max.y.toFixed(2)}（${max.x}），低点 ${min.y.toFixed(2)}（${min.x}），整体均值 ${avg.toFixed(2)}。`;
};
