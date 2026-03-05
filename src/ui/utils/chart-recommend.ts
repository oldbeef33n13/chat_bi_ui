import type { ChartSpec, ChartType, DataSourceDef, DocType, FieldBinding, VDoc, VNode } from "../../core/doc/types";
import { defaultChartSpec } from "../../core/doc/defaults";
import { prefixedId } from "../../core/utils/id";
import { createAiTimer, createAiTraceId, emitAiTelemetry, emitAiTelemetryError } from "../telemetry/ai-telemetry";

export interface SourceField {
  name: string;
  type: "string" | "number" | "boolean" | "time" | "json";
}

export interface RecommendResult {
  chartType: ChartType;
  bindings: FieldBinding[];
  reasons: string[];
}

export interface AiRecommendContext {
  docType: DocType;
  nodeId?: string;
  sourceId?: string;
  trigger: "create-wizard" | "inspector" | "source-switch";
}

export interface AiRecommendRequest {
  requestedType: ChartType;
  fields: SourceField[];
  currentBindings?: FieldBinding[];
  context: AiRecommendContext;
}

export interface AiRecommendResult extends RecommendResult {
  source: "ai" | "local";
}

type RecommendProvider = (request: AiRecommendRequest) => Promise<Partial<RecommendResult> | null> | Partial<RecommendResult> | null;

/** 可插拔推荐器（后续接真实 AI 服务时只替换这里）。 */
let recommendProvider: RecommendProvider | null = null;

const chartTypes: ChartType[] = [
  "auto",
  "line",
  "bar",
  "pie",
  "combo",
  "scatter",
  "radar",
  "heatmap",
  "kline",
  "boxplot",
  "sankey",
  "graph",
  "treemap",
  "sunburst",
  "parallel",
  "funnel",
  "gauge",
  "calendar",
  "custom"
];

/** 基于字段名+样本值的轻量字段类型推断。 */
const guessFieldType = (key: string, values: unknown[]): SourceField["type"] => {
  const first = values.find((item) => item !== null && item !== undefined);
  const keyLower = key.toLowerCase();
  if (keyLower.includes("time") || keyLower.includes("date") || keyLower.includes("day") || keyLower.includes("hour")) {
    return "time";
  }
  if (typeof first === "number") {
    return "number";
  }
  if (typeof first === "boolean") {
    return "boolean";
  }
  if (typeof first === "string") {
    const parsed = Date.parse(first);
    return Number.isNaN(parsed) ? "string" : "time";
  }
  if (first && typeof first === "object") {
    return "json";
  }
  return "string";
};

/** 从数据源抽取可绑定字段，供新建向导/属性面板共用。 */
export const extractSourceFields = (source?: DataSourceDef): SourceField[] => {
  if (!source) {
    return [];
  }
  if (source.schemaFields?.length) {
    return source.schemaFields.map((field) => ({ name: field.name, type: field.type }));
  }
  if (source.type === "static" && Array.isArray(source.staticData)) {
    const rows = source.staticData.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
    if (rows.length === 0) {
      return [];
    }
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return keys.map((key) => ({
      name: key,
      type: guessFieldType(
        key,
        rows.map((row) => row[key])
      )
    }));
  }
  return [];
};

/** 返回第一个命中类型集合的字段。 */
const firstOfType = (fields: SourceField[], types: SourceField["type"][]): SourceField | undefined => fields.find((field) => types.includes(field.type));

/** 返回全部命中类型集合的字段。 */
const allOfType = (fields: SourceField[], types: SourceField["type"][]): SourceField[] =>
  fields.filter((field) => types.includes(field.type));

/** 本地图表类型推荐策略。 */
export const recommendChartType = (fields: SourceField[]): ChartType => {
  const timeField = firstOfType(fields, ["time"]);
  const metricField = firstOfType(fields, ["number"]);
  const categoryField = firstOfType(fields, ["string"]);
  if (timeField && metricField) {
    return "line";
  }
  if (categoryField && metricField) {
    return "bar";
  }
  return "line";
};

/** 按图表类型输出最小可渲染的字段绑定策略。 */
export const recommendBindings = (chartType: ChartType, fields: SourceField[]): FieldBinding[] => {
  const metrics = allOfType(fields, ["number"]);
  const timeField = firstOfType(fields, ["time"]);
  const categoryField = firstOfType(fields, ["string"]);
  const xField = timeField ?? categoryField ?? fields[0];
  const yField = metrics[0] ?? fields.find((field) => field.name !== xField?.name);
  const seriesField = categoryField && xField && categoryField.name !== xField.name ? categoryField : undefined;

  if (!xField || !yField) {
    return [
      { role: "x", field: "x" },
      { role: "y", field: "value", agg: "sum", unit: "count" }
    ];
  }

  if (chartType === "pie") {
    return [
      { role: "category", field: categoryField?.name ?? xField.name },
      { role: "value", field: yField.name, agg: "sum" }
    ];
  }

  if (chartType === "treemap" || chartType === "sunburst" || chartType === "funnel") {
    return [
      { role: "category", field: categoryField?.name ?? xField.name },
      { role: "value", field: yField.name, agg: "sum" }
    ];
  }

  if (chartType === "gauge") {
    return [{ role: "value", field: yField.name, agg: "avg" }];
  }

  if (chartType === "combo") {
    const secondary = metrics.find((field) => field.name !== yField.name && field.name !== xField.name);
    return [
      { role: "x", field: xField.name },
      { role: "y", field: yField.name, agg: "sum", axis: "primary" },
      ...(secondary
        ? [
            {
              role: "y2" as const,
              field: secondary.name,
              agg: "avg" as const,
              axis: "secondary" as const,
              as: "secondary"
            }
          ]
        : [])
    ];
  }

  if (chartType === "calendar") {
    return [
      { role: "x", field: xField.name },
      { role: "y", field: yField.name, agg: "avg" }
    ];
  }

  if (chartType === "sankey") {
    const dimensions = allOfType(fields, ["string", "time"]);
    const source = dimensions[0] ?? xField;
    const target = dimensions[1] ?? dimensions[0] ?? xField;
    return [
      { role: "linkSource", field: source.name },
      { role: "linkTarget", field: target.name },
      { role: "linkValue", field: yField.name, agg: "sum" }
    ];
  }

  if (chartType === "graph") {
    const node = categoryField ?? xField;
    return [
      { role: "node", field: node.name },
      { role: "value", field: yField.name, agg: "sum" }
    ];
  }

  const bindings: FieldBinding[] = [{ role: "x", field: xField.name }];
  bindings.push({ role: "y", field: yField.name, agg: "sum" });
  if (seriesField && seriesField.name !== xField.name) {
    bindings.push({ role: "series", field: seriesField.name });
  }
  return bindings;
};

/** 本地规则推荐：即使 AI 不可用也能返回稳定结果。 */
export const recommendChartConfig = (requestedType: ChartType, fields: SourceField[]): RecommendResult => {
  const autoType = recommendChartType(fields);
  const finalType = requestedType === "auto" ? autoType : requestedType;
  const bindings = recommendBindings(finalType, fields);
  const reasons: string[] = [];
  const hasTime = fields.some((field) => field.type === "time");
  const hasMetric = fields.some((field) => field.type === "number");
  const hasCategory = fields.some((field) => field.type === "string");
  if (requestedType === "auto") {
    reasons.push(`检测到字段结构后自动推荐图表类型: ${finalType}`);
  } else {
    reasons.push(`按你选择的图表类型: ${finalType} 进行推荐绑定`);
  }
  if (hasTime && hasMetric) {
    reasons.push("存在时间字段 + 数值字段，推荐时间趋势分析");
  } else if (hasCategory && hasMetric) {
    reasons.push("存在分类字段 + 数值字段，推荐分类对比分析");
  } else {
    reasons.push("字段信息较少，已使用保守默认绑定策略");
  }
  if (bindings.some((binding) => binding.role === "series")) {
    reasons.push("检测到额外分类维度，自动添加 series 分组");
  }
  return { chartType: finalType, bindings, reasons };
};

export const registerChartRecommendProvider = (provider: RecommendProvider): void => {
  recommendProvider = provider;
};

/** 清理外部 AI 推荐器，回到本地规则模式。 */
export const clearChartRecommendProvider = (): void => {
  recommendProvider = null;
};

/** AI 推荐入口：provider 成功时用 AI，失败时回退本地规则并埋点。 */
export const requestAiChartRecommend = async (request: AiRecommendRequest): Promise<AiRecommendResult> => {
  // 总是先准备 fallback，避免推荐链路失败后页面不可操作。
  const fallback = recommendChartConfig(request.requestedType, request.fields);
  const traceId = createAiTraceId();
  const timer = createAiTimer();
  const context = {
    docType: request.context.docType,
    nodeId: request.context.nodeId,
    sourceId: request.context.sourceId,
    trigger: request.context.trigger
  };
  const baseMeta = {
    requestedType: request.requestedType,
    fieldCount: request.fields.length,
    currentBindingCount: request.currentBindings?.length ?? 0
  };

  emitAiTelemetry({
    traceId,
    stage: "start",
    surface: "chart_recommend",
    action: "request",
    source: "ai",
    context,
    meta: baseMeta
  });

  if (!recommendProvider) {
    emitAiTelemetry({
      traceId,
      stage: "fallback",
      surface: "chart_recommend",
      action: "request",
      source: "local",
      latencyMs: timer(),
      context,
      meta: {
        ...baseMeta,
        reason: "provider_missing"
      }
    });
    return { ...fallback, source: "local" };
  }
  try {
    const next = await recommendProvider(request);
    if (!next) {
      emitAiTelemetry({
        traceId,
        stage: "fallback",
        surface: "chart_recommend",
        action: "request",
        source: "local",
        latencyMs: timer(),
        context,
        meta: {
          ...baseMeta,
          reason: "provider_empty"
        }
      });
      return { ...fallback, source: "local" };
    }
    const chartType = next.chartType ?? fallback.chartType;
    const bindings = next.bindings && next.bindings.length > 0 ? next.bindings : fallback.bindings;
    const reasons = next.reasons && next.reasons.length > 0 ? next.reasons : fallback.reasons;
    emitAiTelemetry({
      traceId,
      stage: "success",
      surface: "chart_recommend",
      action: "request",
      source: "ai",
      latencyMs: timer(),
      context,
      meta: {
        ...baseMeta,
        outputChartType: chartType,
        outputBindingCount: bindings.length,
        outputReasonCount: reasons.length
      }
    });
    return { chartType, bindings, reasons, source: "ai" };
  } catch (error) {
    emitAiTelemetryError(
      {
        traceId,
        surface: "chart_recommend",
        action: "request",
        source: "ai",
        latencyMs: timer(),
        context,
        meta: baseMeta
      },
      error
    );
    emitAiTelemetry({
      traceId,
      stage: "fallback",
      surface: "chart_recommend",
      action: "request",
      source: "local",
      latencyMs: timer(),
      context,
      meta: {
        ...baseMeta,
        reason: "provider_error"
      }
    });
    return { ...fallback, source: "local" };
  }
};

/** 网格布局矩形相交判定。 */
const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** 计算 Dashboard 网格下一个可放置位置。 */
const nextGridPosition = (
  nodes: VNode[],
  size: { w: number; h: number },
  cols: number
): { gx: number; gy: number; gw: number; gh: number } => {
  const occupied = nodes
    .map((node) => node.layout)
    .filter((layout): layout is NonNullable<VNode["layout"]> => !!layout && layout.mode === "grid")
    .map((layout) => ({
      x: Number(layout.gx ?? 0),
      y: Number(layout.gy ?? 0),
      w: Number(layout.gw ?? 4),
      h: Number(layout.gh ?? 4)
    }));

  for (let gy = 0; gy < 200; gy += 1) {
    for (let gx = 0; gx <= cols - size.w; gx += 1) {
      const candidate = { x: gx, y: gy, w: size.w, h: size.h };
      if (!occupied.some((item) => intersects(candidate, item))) {
        return { gx, gy, gw: size.w, gh: size.h };
      }
    }
  }
  return { gx: 0, gy: occupied.length * size.h, gw: size.w, gh: size.h };
};

/** 推荐新图表初始布局（Dashboard 网格 / PPT 绝对定位）。 */
export const recommendLayout = (
  docType: DocType,
  parent: VNode,
  chartType: ChartType
): NonNullable<VNode["layout"]> | undefined => {
  // 新建图表默认布局策略：Dashboard 走网格，PPT 走绝对定位。
  if (docType === "dashboard") {
    const compact = chartType === "pie" || chartType === "gauge" || chartType === "treemap" || chartType === "sunburst";
    const size = compact ? { w: 4, h: 5 } : { w: 6, h: 6 };
    const gridCols = Number((parent.props as Record<string, unknown>)?.gridCols ?? 12);
    return {
      mode: "grid",
      ...nextGridPosition(parent.children ?? [], size, gridCols)
    };
  }
  if (docType === "ppt") {
    const idx = (parent.children ?? []).length;
    const wide = !(chartType === "pie" || chartType === "gauge" || chartType === "treemap" || chartType === "sunburst");
    return {
      mode: "absolute",
      x: wide ? (idx % 2 === 0 ? 36 : 492) : 340,
      y: wide ? 90 : 170,
      w: wide ? 430 : 280,
      h: wide ? 250 : 220,
      z: 1
    };
  }
  return undefined;
};

/** 构造图表节点：类型、绑定、布局、数据源一次性补齐。 */
export const buildChartNode = ({
  doc,
  parent,
  chartType,
  sourceId,
  title,
  forcedRecommend
}: {
  doc: VDoc;
  parent: VNode;
  chartType: ChartType;
  sourceId?: string;
  title?: string;
  forcedRecommend?: RecommendResult;
}): VNode<ChartSpec> => {
  // 图表节点初始化统一走推荐链路，保证类型/绑定/布局一次成型。
  const source = doc.dataSources?.find((item) => item.id === sourceId) ?? doc.dataSources?.[0];
  const fields = extractSourceFields(source);
  const recommend = forcedRecommend ?? recommendChartConfig(chartType, fields);
  const finalType = recommend.chartType;
  const spec = defaultChartSpec(title ?? "新图表");
  spec.chartType = finalType;
  spec.bindings = recommend.bindings;
  spec.themeRef = doc.themeId;
  const queryId = doc.queries?.find((query) => query.sourceId === source?.id)?.queryId;
  return {
    id: prefixedId("chart"),
    kind: "chart",
    name: title ?? "新图表",
    layout: recommendLayout(doc.docType, parent, finalType),
    data: source
      ? {
          sourceId: source.id,
          queryId
        }
      : undefined,
    props: spec
  };
};

export const chartTypeOptions = chartTypes;
