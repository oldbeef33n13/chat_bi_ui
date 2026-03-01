import type { EChartsOption } from "echarts";
import type { ChartSpec, ChartType, FieldBinding } from "../../core/doc/types";

const valueOf = (row: Record<string, unknown>, binding?: FieldBinding): unknown => (binding ? row[binding.field] : undefined);

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

const inferType = (spec: ChartSpec): ChartType => {
  if (spec.chartType !== "auto") {
    return spec.chartType;
  }
  const hasX = spec.bindings.some((b) => b.role === "x");
  const hasY = spec.bindings.some((b) => b.role === "y");
  const hasCategory = spec.bindings.some((b) => b.role === "category");
  const hasValue = spec.bindings.some((b) => b.role === "value");
  if (hasX && hasY) {
    return "line";
  }
  if (hasCategory && hasValue) {
    return "pie";
  }
  return "bar";
};

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

const uniq = <T,>(items: T[]): T[] => [...new Set(items)];

const quantile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx] ?? 0;
};

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

const resolveChartBg = (spec: ChartSpec): string | undefined => {
  if (!spec.themeRef) {
    return undefined;
  }
  return spec.themeRef.includes("dark") ? "#0f172a" : "#ffffff";
};

export const chartSpecToOption = (spec: ChartSpec, rows: Array<Record<string, unknown>>): EChartsOption => {
  const chartType = inferType(spec);
  const nativeSankey = chartType === "sankey";
  const nativeTreemap = chartType === "treemap";
  const nativeGauge = chartType === "gauge";
  const nativeCalendar = chartType === "calendar";
  const relationLike = chartType === "graph";
  const hierarchyLike = chartType === "sunburst";
  const pieLike = chartType === "pie" || hierarchyLike;
  const barLike = chartType === "bar" || chartType === "funnel" || chartType === "heatmap" || chartType === "boxplot" || relationLike;

  const xBinding = spec.bindings.find((b) => b.role === "x" || b.role === "category" || b.role === "linkSource" || b.role === "node");
  const yBindings = spec.bindings.filter((b) => b.role === "y" || b.role === "value" || b.role === "linkValue");
  const yBinding = yBindings[0];
  const seriesBinding = spec.bindings.find((b) => b.role === "series" || b.role === "color");

  const base: EChartsOption = {
    backgroundColor: resolveChartBg(spec),
    color: resolvePalette(spec),
    title: {
      text: spec.titleText,
      subtext: spec.subtitleText,
      textStyle: { color: spec.themeRef?.includes("dark") ? "#e2e8f0" : "#0f172a" },
      subtextStyle: { color: spec.themeRef?.includes("dark") ? "#94a3b8" : "#64748b" }
    },
    tooltip: { show: spec.tooltipShow ?? true, trigger: pieLike || nativeGauge ? "item" : "axis" },
    legend: {
      show: spec.legendShow ?? true,
      top: spec.legendPos === "top" || !spec.legendPos ? 0 : undefined,
      bottom: spec.legendPos === "bottom" ? 0 : undefined,
      left: spec.legendPos === "left" ? 0 : spec.legendPos === "right" ? undefined : "center",
      right: spec.legendPos === "right" ? 0 : undefined
    },
    grid: { show: spec.gridShow ?? false, top: 60, left: 46, right: 20, bottom: 40 }
  };

  if (nativeSankey) {
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

  let xData = uniq(rows.map((row) => String(valueOf(row, xBinding) ?? "-")));
  const grouped = seriesBinding
    ? groupBy(rows, (row) => String(valueOf(row, seriesBinding) ?? "Series"))
    : new Map<string, Array<Record<string, unknown>>>([["Series", rows]]);

  if (chartType === "funnel" && yBinding) {
    xData = [...xData].sort((a, b) => {
      const sumA = aggregateValues(
        rows
          .filter((row) => String(valueOf(row, xBinding) ?? "-") === a)
          .map((row) => asNumber(valueOf(row, yBinding))),
        yBinding.agg
      );
      const sumB = aggregateValues(
        rows
          .filter((row) => String(valueOf(row, xBinding) ?? "-") === b)
          .map((row) => asNumber(valueOf(row, yBinding))),
        yBinding.agg
      );
      return sumB - sumA;
    });
  }

  const seriesType: "line" | "bar" | "scatter" | "radar" =
    barLike ? "bar" : chartType === "scatter" ? "scatter" : chartType === "radar" ? "radar" : "line";

  const hasSecondAxis = yBindings.length > 1;
  const series = hasSecondAxis
    ? yBindings.map((binding, idx) => ({
        name: binding.as ?? binding.field,
        type: seriesType,
        smooth: spec.smooth ?? false,
        stack: undefined,
        areaStyle: spec.area && idx === 0 ? {} : undefined,
        label: { show: spec.labelShow ?? false },
        yAxisIndex: idx,
        data: xData.map((x) => {
          const values = rows
            .filter((row) => String(valueOf(row, xBinding) ?? "-") === x)
            .map((row) => asNumber(valueOf(row, binding)));
          return aggregateValues(values, binding.agg);
        })
      }))
    : [...grouped.entries()].map(([name, groupRows]) => ({
        name,
        type: seriesType,
        smooth: spec.smooth ?? false,
        stack: spec.stack ? "total" : undefined,
        areaStyle: spec.area ? {} : undefined,
        label: { show: spec.labelShow ?? false },
        data: xData.map((x) => {
          const values = groupRows
            .filter((row) => String(valueOf(row, xBinding) ?? "-") === x)
            .map((row) => asNumber(valueOf(row, yBinding)));
          return aggregateValues(values, yBinding?.agg);
        })
      }));

  const option: EChartsOption = {
    ...base,
    xAxis: {
      show: spec.xAxisShow ?? true,
      type: spec.xAxisType ?? "category",
      name: spec.xAxisTitle,
      data: xData
    },
    yAxis: hasSecondAxis
      ? [
          {
            show: spec.yAxisShow ?? true,
            type: spec.yAxisType ?? "value",
            name: spec.yAxisTitle ?? yBindings[0]?.field,
            position: "left"
          },
          {
            show: spec.yAxisShow ?? true,
            type: spec.yAxisType ?? "value",
            name: yBindings[1]?.field ?? "secondary",
            position: "right"
          }
        ]
      : {
          show: spec.yAxisShow ?? true,
          type: spec.yAxisType ?? "value",
          name: spec.yAxisTitle
        },
    series: series as any
  };

  return deepMerge(option, spec.optionPatch ?? {}) as EChartsOption;
};
