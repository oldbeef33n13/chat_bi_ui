import type { EChartsOption } from "echarts";
import type { ChartSpec, ChartType, FieldBinding, VStyle } from "../../core/doc/types";

/**
 * ChartSpec -> EChartsOption 适配层。
 * 目标：把 DSL 统一映射成可渲染 option，并在复杂图表场景提供保底策略。
 */
/** 从一行数据中按 binding 安全读取字段。 */
const valueOf = (row: Record<string, unknown>, binding?: FieldBinding): unknown => (binding ? row[binding.field] : undefined);

/** 判断绑定是否为度量角色。 */
const isMeasureBindingRole = (role: FieldBinding["role"]): boolean =>
  role === "y" ||
  role === "y1" ||
  role === "y2" ||
  role === "secondary" ||
  role === "ysecondary" ||
  role === "value" ||
  role === "linkValue";

/** 判断绑定是否显式挂到第二轴。 */
const isSecondaryBinding = (binding: FieldBinding): boolean => {
  if (binding.axis === "secondary") {
    return true;
  }
  if (typeof binding.axis === "number") {
    return binding.axis > 0;
  }
  return (
    binding.role === "y2" ||
    binding.role === "secondary" ||
    binding.role === "ysecondary" ||
    binding.as === "secondary"
  );
};

/** 解析绑定的 Y 轴索引，支持 role / axis 双语义。 */
const yAxisIndexOf = (binding: FieldBinding, fallbackIndex = 0): number => {
  if (binding.axis === "primary") {
    return 0;
  }
  if (binding.axis === "secondary") {
    return 1;
  }
  if (typeof binding.axis === "number" && Number.isFinite(binding.axis)) {
    return Math.max(0, Math.floor(binding.axis));
  }
  if (isSecondaryBinding(binding)) {
    return 1;
  }
  return Math.max(0, fallbackIndex);
};

/** 解析绑定的 X 轴键，支持 axis(primary/secondary/number) 与兜底序号。 */
const xAxisKeyOf = (binding: FieldBinding, fallbackIndex = 0): number => {
  if (binding.axis === "primary") {
    return 0;
  }
  if (binding.axis === "secondary") {
    return 1;
  }
  if (typeof binding.axis === "number" && Number.isFinite(binding.axis)) {
    return Math.max(0, Math.floor(binding.axis));
  }
  return Math.max(0, fallbackIndex);
};

/** 通用分组工具，保持输入顺序。 */
const groupBy = <T, K extends string | number>(items: T[], toKey: (item: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>();
  items.forEach((item) => {
    const key = toKey(item);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(item);
  });
  return map;
};

/** 深度合并 optionPatch：对象递归合并，数组以 patch 覆盖。 */
const deepMerge = (base: unknown, patch: unknown): unknown => {
  if (Array.isArray(base) && Array.isArray(patch)) {
    return patch;
  }
  if (
    typeof base === "object" &&
    base !== null &&
    typeof patch === "object" &&
    patch !== null &&
    !Array.isArray(base) &&
    !Array.isArray(patch)
  ) {
    const output: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    Object.entries(patch as Record<string, unknown>).forEach(([key, value]) => {
      output[key] = key in output ? deepMerge(output[key], value) : value;
    });
    return output;
  }
  return patch ?? base;
};

/** chartType=auto 的本地推断规则。 */
const inferType = (spec: ChartSpec): ChartType => {
  if (spec.chartType !== "auto") {
    return spec.chartType;
  }
  const hasSecondary = spec.bindings.some((binding) => isSecondaryBinding(binding));
  const hasX = spec.bindings.some((b) => b.role === "x");
  const hasY = spec.bindings.some((b) => isMeasureBindingRole(b.role));
  const hasCategory = spec.bindings.some((b) => b.role === "category");
  const hasValue = spec.bindings.some((b) => b.role === "value");
  if (hasSecondary) {
    return "combo";
  }
  if (hasX && hasY) {
    return "line";
  }
  if (hasCategory && hasValue) {
    return "pie";
  }
  return "bar";
};

/** 容错数值转换，非法值回退 0。 */
const asNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/** 去重并保持顺序。 */
const uniq = <T,>(items: T[]): T[] => [...new Set(items)];

/** 分位数计算（离散下标法）。 */
const quantile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx] ?? 0;
};

/** 按聚合函数计算数值列表。 */
const aggregateValues = (values: number[], agg?: FieldBinding["agg"]): number => {
  switch (agg) {
    case "avg":
      return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
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
      return values.reduce((sum, v) => sum + v, 0);
  }
};

/** 按 category 聚合，输出饼图/树图可直接消费的数据结构。 */
const aggregateByCategory = (
  rows: Array<Record<string, unknown>>,
  categoryBinding: FieldBinding | undefined,
  valueBinding: FieldBinding | undefined
): Array<{ name: string; value: number }> => {
  const buckets = groupBy(rows, (row) => String(valueOf(row, categoryBinding) ?? "-"));
  return [...buckets.entries()].map(([name, groupRows]) => ({
    name,
    value: aggregateValues(
      groupRows.map((row) => asNumber(valueOf(row, valueBinding))),
      valueBinding?.agg
    )
  }));
};

/** 推断 calendar 图表的年份范围基准。 */
const inferCalendarYear = (rows: Array<Record<string, unknown>>, binding: FieldBinding | undefined): number => {
  for (const row of rows) {
    const raw = String(valueOf(row, binding) ?? "").trim();
    const fullDateMatch = raw.match(/^(\d{4})[-/]\d{2}[-/]\d{2}$/);
    if (fullDateMatch) {
      const year = Number(fullDateMatch[1]);
      if (Number.isFinite(year) && year > 1900) {
        return year;
      }
    }
  }
  return new Date().getFullYear();
};

/** 归一化日期为 YYYY-MM-DD。 */
const normalizeCalendarDate = (value: unknown, fallbackYear: number, index: number): string => {
  const raw = String(value ?? "").trim();
  const fallbackDay = String((index % 28) + 1).padStart(2, "0");
  if (!raw) {
    return `${fallbackYear}-01-${fallbackDay}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) {
    return raw.replace(/\//g, "-");
  }
  if (/^\d{2}-\d{2}$/.test(raw)) {
    return `${fallbackYear}-${raw}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return `${fallbackYear}-01-${fallbackDay}`;
};

const paletteByRef: Record<string, string[]> = {
  "palette.tech": ["#2563eb", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"],
  "palette.tech.dark": ["#60a5fa", "#22d3ee", "#4ade80", "#fbbf24", "#fb7185", "#a78bfa"],
  "palette.business": ["#0f766e", "#ca8a04", "#b45309", "#7c3aed", "#dc2626", "#1d4ed8"]
};

/** 根据主题与 paletteRef 解析调色板。 */
const resolvePalette = (spec: ChartSpec): string[] | undefined => {
  if (spec.paletteRef && paletteByRef[spec.paletteRef]) {
    return paletteByRef[spec.paletteRef];
  }
  if (spec.themeRef?.includes("dark")) {
    return paletteByRef["palette.tech.dark"];
  }
  if (spec.themeRef?.includes("business")) {
    return paletteByRef["palette.business"];
  }
  return paletteByRef["palette.tech"];
};

/** 根据主题解析图表背景色。 */
const resolveChartBg = (spec: ChartSpec): string | undefined => {
  if (!spec.themeRef) {
    return undefined;
  }
  return spec.themeRef.includes("dark") ? "#0f172a" : "#ffffff";
};

const resolveChartTitleTextStyle = (style: VStyle | undefined, fallbackColor: string): Record<string, unknown> => ({
  color: style?.fg ?? fallbackColor,
  fontSize: style?.fontSize,
  fontWeight: style?.bold ? 700 : undefined,
  fontStyle: style?.italic ? "italic" : undefined,
  textDecoration: style?.underline ? "underline" : undefined,
  align: style?.align,
  lineHeight: style?.lineHeight ? Math.round((style.fontSize ?? 14) * style.lineHeight) : undefined
});

const resolveChartTitleContainerStyle = (style: VStyle | undefined): Record<string, unknown> => ({
  backgroundColor: style?.bg,
  borderColor: style?.borderC,
  borderWidth: style?.borderW,
  borderRadius: style?.radius,
  padding: typeof style?.pad === "number" ? style.pad : undefined
});

const hasField = (rows: Array<Record<string, unknown>>, field?: string): boolean => {
  if (!field) {
    return false;
  }
  return rows.some((row) => Object.prototype.hasOwnProperty.call(row, field));
};

/** 判断绑定是否为系列分组维度。 */
const isSeriesBindingRole = (role: FieldBinding["role"]): boolean => role === "series" || role === "color" || role === "facet";

/** 判断绑定是否为 X 轴维度。 */
const isXAxisBindingRole = (role: FieldBinding["role"]): boolean => role === "x" || role === "category";

/** 多维系列键：将多个系列维度拼接为唯一分组键。 */
const seriesKeyOf = (row: Record<string, unknown>, bindings: FieldBinding[]): string => {
  if (bindings.length === 0) {
    return "Series";
  }
  return bindings.map((binding) => String(valueOf(row, binding) ?? "-")).join(" / ");
};

const collectFields = (rows: Array<Record<string, unknown>>): string[] =>
  uniq(
    rows.flatMap((row) => {
      if (!row || typeof row !== "object") {
        return [];
      }
      return Object.keys(row);
    })
  );

const isNumberLike = (value: unknown): boolean => {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed);
  }
  return false;
};

const numericFieldsFromRows = (rows: Array<Record<string, unknown>>, fields: string[]): string[] =>
  fields.filter((field) => rows.some((row) => isNumberLike(row[field])));

const preferTimeLikeField = (fields: string[]): string | undefined =>
  fields.find((field) => {
    const lower = field.toLowerCase();
    return (
      lower.includes("time") ||
      lower.includes("date") ||
      lower.includes("day") ||
      lower.includes("week") ||
      lower.includes("month") ||
      lower.includes("minute") ||
      lower.includes("hour")
    );
  });

/** 主入口：将图表 DSL + 数据行映射为 ECharts option。 */
export const chartSpecToOption = (spec: ChartSpec, rows: Array<Record<string, unknown>>): EChartsOption => {
  // 先归一化图表族，后续分支共用同一套绑定提取逻辑。
  const chartType = inferType(spec);
  const nativeSankey = chartType === "sankey";
  const nativeTreemap = chartType === "treemap";
  const nativeGauge = chartType === "gauge";
  const nativeCalendar = chartType === "calendar";
  const relationLike = chartType === "graph";
  const hierarchyLike = chartType === "sunburst";
  const pieLike = chartType === "pie" || hierarchyLike;
  const barLike = chartType === "bar" || chartType === "funnel" || chartType === "heatmap" || chartType === "boxplot" || relationLike;

  let xBindings = spec.bindings.filter((b) => isXAxisBindingRole(b.role));
  if (xBindings.length === 0) {
    const fallbackXBinding = spec.bindings.find((b) => b.role === "x" || b.role === "category" || b.role === "linkSource" || b.role === "node");
    if (fallbackXBinding) {
      xBindings = [fallbackXBinding];
    }
  }
  let xBinding = xBindings[0];
  let yBindings = spec.bindings.filter((b) => isMeasureBindingRole(b.role));
  let yBinding = yBindings[0];
  let seriesBindings = spec.bindings.filter((b) => isSeriesBindingRole(b.role));

  // 常见故障兜底：绑定字段在数据中不存在时，自动回退到可用字段并给出控制台提示。
  if (!nativeSankey && !nativeTreemap && !nativeGauge && !nativeCalendar && !pieLike && rows.length > 0) {
    const allFields = collectFields(rows);
    const numericFields = numericFieldsFromRows(rows, allFields);
    const dimensionFields = allFields.filter((field) => !numericFields.includes(field));
    const fallbackX = preferTimeLikeField(dimensionFields) ?? dimensionFields[0] ?? allFields[0];
    const fallbackY =
      numericFields.find((field) => field !== fallbackX) ??
      numericFields[0] ??
      allFields.find((field) => field !== fallbackX);

    const warnings: string[] = [];
    const validXBindings = xBindings.filter((binding) => hasField(rows, binding.field));
    if (validXBindings.length === 0 && fallbackX) {
      warnings.push(`x:${xBindings.map((item) => item.field).join(",") || "-"}->${fallbackX}`);
      xBindings = [
        {
          ...(xBindings[0] ?? { role: "x", field: fallbackX }),
          role: xBindings[0]?.role ?? "x",
          field: fallbackX
        }
      ];
    } else {
      if (validXBindings.length !== xBindings.length) {
        const invalid = xBindings.filter((binding) => !hasField(rows, binding.field)).map((binding) => binding.field);
        warnings.push(`x:${invalid.join(",")}->(disabled)`);
      }
      xBindings = validXBindings;
    }
    xBinding = xBindings[0];

    const validYBindings = yBindings.filter((binding) => hasField(rows, binding.field));
    if (validYBindings.length === 0 && fallbackY) {
      warnings.push(`y:${yBindings.map((item) => item.field).join(",") || "-"}->${fallbackY}`);
      yBindings = [
        {
          role: yBindings[0]?.role ?? "y",
          field: fallbackY,
          agg: yBindings[0]?.agg ?? "sum",
          axis: yBindings[0]?.axis,
          as: yBindings[0]?.as
        }
      ];
    } else {
      yBindings = validYBindings;
    }
    yBinding = yBindings[0];

    if (seriesBindings.length > 0) {
      const validSeriesBindings = seriesBindings.filter((binding) => hasField(rows, binding.field));
      if (validSeriesBindings.length !== seriesBindings.length) {
        const invalid = seriesBindings
          .filter((binding) => !hasField(rows, binding.field))
          .map((binding) => binding.field);
        warnings.push(`series:${invalid.join(",")}->(disabled)`);
      }
      seriesBindings = validSeriesBindings;
    }

    if (warnings.length > 0) {
      console.warn(
        `[chart-adapter] 图表字段绑定与数据不匹配，已自动回退。title=${spec.titleText ?? "-"}，调整=${warnings.join(" | ")}`
      );
    }
  }

  const base: EChartsOption = {
    backgroundColor: resolveChartBg(spec),
    color: resolvePalette(spec),
    title: {
      text: spec.titleText,
      subtext: spec.subtitleText,
      ...resolveChartTitleContainerStyle(spec.titleStyle),
      textStyle: resolveChartTitleTextStyle(spec.titleStyle, spec.themeRef?.includes("dark") ? "#e2e8f0" : "#0f172a"),
      subtextStyle: resolveChartTitleTextStyle(spec.subtitleStyle, spec.themeRef?.includes("dark") ? "#94a3b8" : "#64748b")
    },
    tooltip: { show: spec.tooltipShow ?? true, trigger: pieLike || nativeGauge ? "item" : "axis" },
    legend: {
      show: spec.legendShow ?? true,
      top: spec.legendPos === "top" || !spec.legendPos ? 0 : undefined,
      bottom: spec.legendPos === "bottom" ? 0 : undefined,
      left: spec.legendPos === "left" ? 0 : spec.legendPos === "right" ? undefined : "center",
      right: spec.legendPos === "right" ? 0 : undefined
    },
    // 仅保留布局网格边距；网格线显示由 x/yAxis.splitLine 控制，避免与主题样式冲突。
    grid: { top: 60, left: 46, right: 20, bottom: 40 }
  };

  if (nativeSankey) {
    // Sankey：按 source/target 聚合 linkValue。
    const sourceBinding = spec.bindings.find((b) => b.role === "linkSource" || b.role === "category" || b.role === "x");
    const targetBinding = spec.bindings.find((b) => b.role === "linkTarget");
    const valueBinding = spec.bindings.find((b) => b.role === "linkValue" || b.role === "value" || b.role === "y");
    const nodeBinding = spec.bindings.find((b) => b.role === "node");

    const linkAgg = new Map<string, number>();
    rows.forEach((row) => {
      const source = String(valueOf(row, sourceBinding) ?? "").trim();
      const target = String(valueOf(row, targetBinding) ?? "").trim();
      if (!source || !target) {
        return;
      }
      const key = `${source}>>${target}`;
      linkAgg.set(key, (linkAgg.get(key) ?? 0) + asNumber(valueOf(row, valueBinding)));
    });

    const links = [...linkAgg.entries()]
      .map(([key, value]) => {
        const [source = "", target = ""] = key.split(">>");
        return { source, target, value };
      })
      .filter((link) => link.source && link.target);

    const nodeNames = new Set<string>();
    links.forEach((link) => {
      nodeNames.add(link.source);
      nodeNames.add(link.target);
    });
    rows.forEach((row) => {
      const explicitNode = String(valueOf(row, nodeBinding) ?? "").trim();
      if (explicitNode) {
        nodeNames.add(explicitNode);
      }
    });

    const option: EChartsOption = {
      ...base,
      series: [
        {
          type: "sankey",
          data: [...nodeNames].map((name) => ({ name })),
          links,
          lineStyle: { curveness: 0.5 },
          emphasis: { focus: "adjacency" },
          label: { show: true }
        }
      ]
    };
    return deepMerge(option, spec.optionPatch ?? {}) as EChartsOption;
  }

  if (nativeTreemap) {
    // Treemap：按 category 聚合 value。
    const categoryBinding = spec.bindings.find((b) => b.role === "category" || b.role === "x");
    const valueBinding = spec.bindings.find((b) => b.role === "value" || b.role === "y");
    const data = aggregateByCategory(rows, categoryBinding, valueBinding);
    const option: EChartsOption = {
      ...base,
      series: [
        {
          type: "treemap",
          roam: false,
          breadcrumb: { show: false },
          label: { show: true },
          data
        }
      ]
    };
    return deepMerge(option, spec.optionPatch ?? {}) as EChartsOption;
  }

  if (nativeGauge) {
    // Gauge：输出 0~100 的单值，支持 0~1 比例自动转百分比。
    const valueBinding = spec.bindings.find((b) => b.role === "value" || b.role === "y" || b.role === "linkValue");
    const rawValue = aggregateValues(
      rows.map((row) => asNumber(valueOf(row, valueBinding))),
      valueBinding?.agg
    );
    const value = Math.max(0, Math.min(100, rawValue <= 1 ? rawValue * 100 : rawValue));
    const option: EChartsOption = {
      ...base,
      series: [
        {
          type: "gauge",
          min: 0,
          max: 100,
          progress: { show: true, width: 14 },
          axisLine: { lineStyle: { width: 14 } },
          detail: { valueAnimation: true, formatter: "{value}%" },
          data: [{ value: Number(value.toFixed(2)), name: spec.titleText ?? "Gauge" }]
        }
      ]
    };
    return deepMerge(option, spec.optionPatch ?? {}) as EChartsOption;
  }

  if (nativeCalendar) {
    // Calendar：日期聚合 + visualMap，自动推断年度范围。
    const dateBinding = spec.bindings.find((b) => b.role === "x" || b.role === "category");
    const valueBinding = spec.bindings.find((b) => b.role === "y" || b.role === "value");
    const year = inferCalendarYear(rows, dateBinding);

    const dateAgg = new Map<string, number[]>();
    rows.forEach((row, idx) => {
      const date = normalizeCalendarDate(valueOf(row, dateBinding), year, idx);
      if (!dateAgg.has(date)) {
        dateAgg.set(date, []);
      }
      dateAgg.get(date)!.push(asNumber(valueOf(row, valueBinding)));
    });

    const calendarData = [...dateAgg.entries()]
      .map(([date, values]) => [date, aggregateValues(values, valueBinding?.agg)] as [string, number])
      .sort((a, b) => a[0].localeCompare(b[0]));
    const values = calendarData.map((item) => item[1]);
    const min = values.length ? Math.min(...values) : 0;
    const maxRaw = values.length ? Math.max(...values) : 100;
    const max = maxRaw === min ? min + 1 : maxRaw;
    const start = calendarData[0]?.[0] ?? `${year}-01-01`;
    const end = calendarData[calendarData.length - 1]?.[0] ?? `${year}-12-31`;

    const option: EChartsOption = {
      ...base,
      legend: { show: false },
      visualMap: {
        min,
        max,
        calculable: true,
        orient: "horizontal",
        left: "center",
        top: 36
      },
      calendar: {
        top: 86,
        left: 28,
        right: 28,
        range: [start, end],
        cellSize: ["auto", 14]
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: calendarData
        }
      ]
    };
    return deepMerge(option, spec.optionPatch ?? {}) as EChartsOption;
  }

  if (pieLike) {
    // Pie/Sunburst 降级同路：统一走分类聚合渲染。
    const category = spec.bindings.find((b) => b.role === "category" || b.role === "x" || b.role === "linkSource" || b.role === "node");
    const value = spec.bindings.find((b) => b.role === "value" || b.role === "y" || b.role === "linkValue");
    const data = aggregateByCategory(rows, category, value);
    const option: EChartsOption = {
      ...base,
      series: [
        {
          type: "pie",
          radius: ["34%", "68%"],
          label: { show: spec.labelShow ?? false },
          data
        }
      ]
    };
    return deepMerge(option, spec.optionPatch ?? {}) as EChartsOption;
  }

  const xBindingByKey = new Map<number, FieldBinding>();
  xBindings.forEach((binding, index) => {
    const key = xAxisKeyOf(binding, index);
    if (!xBindingByKey.has(key)) {
      xBindingByKey.set(key, binding);
    }
  });
  if (xBindingByKey.size === 0) {
    xBindingByKey.set(0, xBinding ?? { role: "x", field: "" });
  }
  const xAxisEntries = [...xBindingByKey.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([axisKey, binding], index) => ({ axisKey, binding, index }));
  const xAxisIndexByKey = new Map<number, number>(xAxisEntries.map((entry) => [entry.axisKey, entry.index]));
  const xDataByAxisIndex = new Map<number, string[]>();
  xAxisEntries.forEach((entry) => {
    xDataByAxisIndex.set(entry.index, uniq(rows.map((row) => String(valueOf(row, entry.binding) ?? "-"))));
  });
  const primaryXAxis = xAxisEntries[0];
  const primaryXBinding = primaryXAxis?.binding ?? xBinding;
  let xData = xDataByAxisIndex.get(0) ?? uniq(rows.map((row) => String(valueOf(row, primaryXBinding) ?? "-")));
  const grouped = seriesBindings.length > 0
    ? groupBy(rows, (row) => seriesKeyOf(row, seriesBindings))
    : new Map<string, Array<Record<string, unknown>>>([["Series", rows]]);
  const groupedEntries = [...grouped.entries()];

  if (chartType === "radar") {
    // Radar 必须显式声明 indicator，且不能混用 xAxis/yAxis（否则 ECharts 内部会异常）。
    const indicators = (xData.length > 0 ? xData : ["-"]).map((name) => ({ name }));
    const radarXBinding = primaryXBinding;
    const valuesByBinding = (binding: FieldBinding, sourceRows: Array<Record<string, unknown>>): number[] =>
      indicators.map((indicator) => {
        const values = sourceRows
          .filter((row) => String(valueOf(row, radarXBinding) ?? "-") === indicator.name)
          .map((row) => asNumber(valueOf(row, binding)));
        return aggregateValues(values, binding.agg);
      });

    let radarData: Array<{ name: string; value: number[] }> = [];
    if (yBindings.length > 1) {
      if (seriesBindings.length > 0) {
        radarData = yBindings.flatMap((binding) =>
          groupedEntries.map(([name, groupRows]) => ({
            name: `${name} · ${binding.as ?? binding.field}`,
            value: valuesByBinding(binding, groupRows)
          }))
        );
      } else {
        radarData = yBindings.map((binding) => ({
          name: binding.as ?? binding.field,
          value: valuesByBinding(binding, rows)
        }));
      }
    } else if (seriesBindings.length > 0 && yBinding) {
      radarData = groupedEntries.map(([name, groupRows]) => ({
        name,
        value: valuesByBinding(yBinding, groupRows)
      }));
    } else if (yBinding) {
      radarData = [
        {
          name: yBinding.as ?? yBinding.field,
          value: valuesByBinding(yBinding, rows)
        }
      ];
    }
    if (radarData.length === 0) {
      radarData = [{ name: "Series", value: indicators.map(() => 0) }];
    }

    const maxValue = Math.max(0, ...radarData.flatMap((item) => item.value));
    const indicatorMax = maxValue > 0 ? Math.ceil(maxValue * 1.2) : 1;
    const option: EChartsOption = {
      ...base,
      tooltip: { show: spec.tooltipShow ?? true, trigger: "item" },
      legend: {
        ...(base.legend as Record<string, unknown>),
        show: spec.legendShow ?? true,
        data: radarData.map((item) => item.name)
      },
      radar: {
        radius: "58%",
        splitNumber: 5,
        indicator: indicators.map((item) => ({ name: item.name, max: indicatorMax }))
      },
      series: [
        {
          type: "radar",
          data: radarData,
          symbol: "circle",
          areaStyle: spec.area ? {} : undefined,
          label: { show: spec.labelShow ?? false }
        }
      ]
    };
    return deepMerge(option, spec.optionPatch ?? {}) as EChartsOption;
  }

  if (chartType === "funnel" && yBinding) {
    xData = [...xData].sort((a, b) => {
      const sumA = aggregateValues(
        rows
          .filter((row) => String(valueOf(row, primaryXBinding) ?? "-") === a)
          .map((row) => asNumber(valueOf(row, yBinding))),
        yBinding.agg
      );
      const sumB = aggregateValues(
        rows
          .filter((row) => String(valueOf(row, primaryXBinding) ?? "-") === b)
          .map((row) => asNumber(valueOf(row, yBinding))),
        yBinding.agg
      );
      return sumB - sumA;
    });
  }

  const seriesType: "line" | "bar" | "scatter" =
    chartType === "combo" ? "bar" : barLike ? "bar" : chartType === "scatter" ? "scatter" : "line";

  const yBindingEntries = yBindings.map((binding, index) => ({
    binding,
    yAxisIndex: yAxisIndexOf(binding, index)
  }));
  const yAxisCount = yBindingEntries.reduce((max, entry) => Math.max(max, entry.yAxisIndex), 0) + 1;
  const hasSecondAxis = yAxisCount > 1;
  const axisLabelByIndex = new Map<number, string>();
  yBindingEntries.forEach((entry) => {
    if (!axisLabelByIndex.has(entry.yAxisIndex)) {
      axisLabelByIndex.set(entry.yAxisIndex, entry.binding.as ?? entry.binding.field);
    }
  });
  const groupEntries = seriesBindings.length > 0 ? groupedEntries : ([["Series", rows]] as Array<[string, Array<Record<string, unknown>>]>);
  const includeGroupInSeriesName = seriesBindings.length > 0;
  const includeBindingInSeriesName = yBindingEntries.length > 1;
  const resolveXAxisKeyForMeasure = (binding: FieldBinding, measureIndex: number): number => {
    if (typeof binding.xAxis === "number" && Number.isFinite(binding.xAxis)) {
      return Math.max(0, Math.floor(binding.xAxis));
    }
    const fallback = xAxisEntries[Math.min(measureIndex, Math.max(0, xAxisEntries.length - 1))];
    return fallback?.axisKey ?? 0;
  };
  const series = yBindingEntries.flatMap(({ binding, yAxisIndex }, idx) =>
    groupEntries.map(([groupName, groupRows]) => {
      const xAxisKey = resolveXAxisKeyForMeasure(binding, idx);
      const xAxisIndex = xAxisIndexByKey.get(xAxisKey) ?? 0;
      const xAxisBinding = xAxisEntries[xAxisIndex]?.binding ?? primaryXBinding;
      const xAxisData = xDataByAxisIndex.get(xAxisIndex) ?? xData;
      const nameParts: string[] = [];
      if (includeGroupInSeriesName) {
        nameParts.push(groupName);
      }
      if (includeBindingInSeriesName || !includeGroupInSeriesName) {
        nameParts.push(binding.as ?? binding.field);
      }
      const name = nameParts.filter(Boolean).join(" · ") || binding.as || binding.field || groupName;
      const item = {
        name,
        type: chartType === "combo" ? (yAxisIndex === 0 ? "bar" : "line") : seriesType,
        smooth: spec.smooth ?? false,
        stack: hasSecondAxis ? undefined : spec.stack ? "total" : undefined,
        areaStyle: chartType === "combo" ? undefined : spec.area && (!hasSecondAxis || idx === 0) ? {} : undefined,
        label: { show: spec.labelShow ?? false },
        data: xAxisData.map((x) => {
          const values = groupRows
            .filter((row) => String(valueOf(row, xAxisBinding) ?? "-") === x)
            .map((row) => asNumber(valueOf(row, binding)));
          return aggregateValues(values, binding.agg);
        })
      } as Record<string, unknown>;
      if (xAxisEntries.length > 1) {
        item.xAxisIndex = xAxisIndex;
      }
      if (hasSecondAxis) {
        item.yAxisIndex = yAxisIndex;
      }
      return item;
    })
  );

  const option: EChartsOption = {
    ...base,
    // 网格开关同时映射到坐标轴 splitLine，避免与主题默认轴线冲突造成“看似未切换”。
    // undefined 表示保持 ECharts 默认行为；true/false 则显式强制。
    xAxis:
      xAxisEntries.length > 1
        ? xAxisEntries.map((entry, index) => ({
            show: spec.xAxisShow ?? true,
            type: spec.xAxisType ?? "category",
            name: spec.xAxisTitle ? `${spec.xAxisTitle} · ${entry.binding.as ?? entry.binding.field}` : entry.binding.as ?? entry.binding.field,
            data: xDataByAxisIndex.get(index) ?? [],
            position: index % 2 === 0 ? "bottom" : "top",
            offset: index > 1 ? Math.floor((index - 1) / 2) * 28 : 0,
            splitLine: spec.gridShow === undefined ? undefined : { show: spec.gridShow }
          }))
        : {
            show: spec.xAxisShow ?? true,
            type: spec.xAxisType ?? "category",
            name: spec.xAxisTitle,
            data: xData,
            splitLine: spec.gridShow === undefined ? undefined : { show: spec.gridShow }
          },
    yAxis: hasSecondAxis
      ? Array.from({ length: yAxisCount }, (_, index) => ({
          show: spec.yAxisShow ?? true,
          type: spec.yAxisType ?? "value",
          name: index === 0 ? spec.yAxisTitle ?? axisLabelByIndex.get(0) : axisLabelByIndex.get(index) ?? `y${index + 1}`,
          position: index % 2 === 0 ? "left" : "right",
          offset: index > 1 ? Math.floor((index - 1) / 2) * 42 : 0,
          splitLine: spec.gridShow === undefined ? undefined : { show: spec.gridShow }
        }))
      : {
          show: spec.yAxisShow ?? true,
          type: spec.yAxisType ?? "value",
          name: spec.yAxisTitle,
          splitLine: spec.gridShow === undefined ? undefined : { show: spec.gridShow }
        },
    series: series as any
  };

  return deepMerge(option, spec.optionPatch ?? {}) as EChartsOption;
};
