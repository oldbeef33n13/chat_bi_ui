import type { CommandPlan, ChartSpec } from "../../core/doc/types";
import { summarizeChartRows } from "./chart-summary";

interface Point {
  x: string;
  y: number;
}

export interface ChartAssistantResult {
  answer: string;
  suggestions: string[];
  plan: CommandPlan | null;
  planSummary?: string;
}

const asNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** 统一聚合计算，确保问答与图表绑定的 agg 语义一致。 */
const aggregate = (values: number[], agg: ChartSpec["bindings"][number]["agg"]): number => {
  if (values.length === 0) {
    return 0;
  }
  switch (agg) {
    case "avg":
      return values.reduce((sum, item) => sum + item, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "count":
      return values.length;
    default:
      return values.reduce((sum, item) => sum + item, 0);
  }
};

/** 按 x 维度聚合成问答可读的点位数据。 */
const buildPoints = (spec: ChartSpec, rows: Array<Record<string, unknown>>): Point[] => {
  const xBinding = spec.bindings.find((item) => item.role === "x" || item.role === "category");
  const yBinding = spec.bindings.find((item) => item.role === "y" || item.role === "value");
  if (!xBinding || !yBinding || rows.length === 0) {
    return [];
  }
  const grouped = new Map<string, number[]>();
  rows.forEach((row) => {
    const xValue = String(row[xBinding.field] ?? "-");
    const yValue = asNumber(row[yBinding.field]);
    const values = grouped.get(xValue) ?? [];
    values.push(yValue);
    grouped.set(xValue, values);
  });
  return [...grouped.entries()].map(([x, values]) => ({ x, y: aggregate(values, yBinding.agg) }));
};

/** 从自然语言中抽取“可执行修改”并构造 CommandPlan。 */
const inferPlan = (prompt: string, nodeId: string, spec: ChartSpec, rows: Array<Record<string, unknown>>): { plan: CommandPlan | null; planSummary?: string } => {
  const text = prompt.toLowerCase();
  const nextProps: Partial<ChartSpec> = {};

  if (/折线|line/.test(text)) {
    nextProps.chartType = "line";
  } else if (/柱状|bar/.test(text)) {
    nextProps.chartType = "bar";
  } else if (/饼图|pie/.test(text)) {
    nextProps.chartType = "pie";
  } else if (/散点|scatter/.test(text)) {
    nextProps.chartType = "scatter";
  }

  if (/开启.*标签|显示.*标签|标签开启|label on/.test(text)) {
    nextProps.labelShow = true;
  }
  if (/关闭.*标签|隐藏.*标签|label off/.test(text)) {
    nextProps.labelShow = false;
  }
  if (/无网格|关闭.*网格/.test(text)) {
    nextProps.gridShow = false;
  }
  if (/深色|暗色|dark/.test(text)) {
    nextProps.themeRef = "theme.tech.dark";
    nextProps.paletteRef = "palette.tech.dark";
  }
  if (/开启平滑|平滑/.test(text) && !/关闭平滑|取消平滑/.test(text)) {
    nextProps.smooth = true;
  }
  if (/关闭平滑|取消平滑/.test(text)) {
    nextProps.smooth = false;
  }

  if (/第二轴|双轴/.test(text)) {
    const existingBindings = [...(spec.bindings ?? [])];
    const yBindings = existingBindings.filter((item) => item.role === "y" || item.role === "value");
    if (yBindings.length < 2) {
      const xBinding = existingBindings.find((item) => item.role === "x" || item.role === "category");
      const allKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const numericFields = allKeys.filter((key) => rows.some((row) => typeof row[key] === "number"));
      const primaryY = yBindings[0]?.field;
      const candidate = numericFields.find((field) => field !== primaryY && field !== xBinding?.field);
      if (candidate) {
        nextProps.bindings = [
          ...existingBindings,
          { role: "y2", field: candidate, agg: "sum", axis: "secondary", as: "secondary" }
        ];
      }
    }
  }

  if (Object.keys(nextProps).length === 0) {
    return { plan: null };
  }

  const fields = Object.keys(nextProps);
  return {
    planSummary: `建议修改: ${fields.join(", ")}`,
    plan: {
      intent: "update",
      targets: [nodeId],
      commands: [
        {
          type: "UpdateProps",
          nodeId,
          props: nextProps as Record<string, unknown>
        }
      ],
      explain: `图表智能追问: ${prompt}`,
      preview: {
        summary: `按追问自动建议(${fields.join(", ")})`,
        expectedChangedNodeIds: [nodeId],
        risk: "low"
      }
    }
  };
};

/** 构造分析回答文本：趋势/峰值/低点/均值等。 */
const buildAnswer = (prompt: string, spec: ChartSpec, rows: Array<Record<string, unknown>>): string => {
  if (rows.length === 0) {
    return "当前图表没有可分析的数据，请先检查数据源或筛选条件。";
  }
  const points = buildPoints(spec, rows);
  const text = prompt.toLowerCase();
  const sorted = [...points].sort((a, b) => String(a.x).localeCompare(String(b.x)));

  if (points.length === 0) {
    return summarizeChartRows(spec, rows);
  }
  if (/最高|峰值|max|top/.test(text)) {
    const max = [...points].sort((a, b) => b.y - a.y)[0]!;
    return `峰值出现在 ${max.x}，数值约 ${max.y.toFixed(2)}。你可以继续追问“峰值前后变化原因”。`;
  }
  if (/最低|低点|min/.test(text)) {
    const min = [...points].sort((a, b) => a.y - b.y)[0]!;
    return `低点出现在 ${min.x}，数值约 ${min.y.toFixed(2)}。建议结合对应时段事件做排查。`;
  }
  if (/平均|均值/.test(text)) {
    const avg = points.reduce((sum, item) => sum + item.y, 0) / points.length;
    return `当前样本均值约 ${avg.toFixed(2)}，共 ${points.length} 个分组点。`;
  }
  if (/趋势|变化|上升|下降|环比/.test(text) && sorted.length >= 2) {
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const delta = last.y - first.y;
    const ratio = first.y === 0 ? 0 : (delta / first.y) * 100;
    const trend = delta >= 0 ? "上升" : "下降";
    return `从 ${first.x} 到 ${last.x} 总体${trend} ${Math.abs(delta).toFixed(2)}（约 ${Math.abs(ratio).toFixed(1)}%）。`;
  }
  return summarizeChartRows(spec, rows);
};

/** 给用户生成可继续点击的追问建议。 */
const buildSuggestions = (spec: ChartSpec): string[] => {
  const xBinding = spec.bindings.find((item) => item.role === "x" || item.role === "category");
  return [
    `最高点在${xBinding?.field ?? "时间"}的哪个阶段？`,
    "改成柱状图并开启标签",
    "关闭网格并切换深色主题"
  ];
};

/** 图表智能追问入口：返回分析结论 + 建议问题 + 可执行计划。 */
export const askChartAssistant = ({
  prompt,
  nodeId,
  spec,
  rows
}: {
  prompt: string;
  nodeId: string;
  spec: ChartSpec;
  rows: Array<Record<string, unknown>>;
}): ChartAssistantResult => {
  const answer = buildAnswer(prompt, spec, rows);
  const suggestions = buildSuggestions(spec);
  const { plan, planSummary } = inferPlan(prompt, nodeId, spec, rows);
  return { answer, suggestions, plan, planSummary };
};
