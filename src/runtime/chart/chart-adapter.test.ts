import { describe, expect, it } from "vitest";
import type { ChartSpec } from "../../core/doc/types";
import { chartSpecToOption } from "./chart-adapter";

describe("chart-adapter radar", () => {
  it("builds native radar option with indicator instead of cartesian axes", () => {
    const spec: ChartSpec = {
      chartType: "radar",
      titleText: "区域质量雷达",
      bindings: [
        { role: "x", field: "region" },
        { role: "y", field: "score", agg: "avg" }
      ]
    };
    const rows = [
      { region: "East", score: 86 },
      { region: "North", score: 78 },
      { region: "South", score: 92 }
    ];
    const option = chartSpecToOption(spec, rows) as Record<string, any>;

    expect(option.radar).toBeTruthy();
    expect(Array.isArray(option.radar.indicator)).toBe(true);
    expect(option.radar.indicator.length).toBe(3);
    expect(option.xAxis).toBeUndefined();
    expect(option.yAxis).toBeUndefined();
    expect(option.series?.[0]?.type).toBe("radar");
    expect(Array.isArray(option.series?.[0]?.data?.[0]?.value)).toBe(true);
    expect(option.series?.[0]?.data?.[0]?.value?.length).toBe(3);
  });
});

describe("chart-adapter multi-series", () => {
  it("supports multiple series dimensions via composite legend key", () => {
    const spec: ChartSpec = {
      chartType: "line",
      bindings: [
        { role: "x", field: "day" },
        { role: "y", field: "value", agg: "sum" },
        { role: "series", field: "region" },
        { role: "color", field: "channel" }
      ]
    };
    const rows = [
      { day: "Mon", region: "East", channel: "A", value: 10 },
      { day: "Mon", region: "East", channel: "B", value: 5 },
      { day: "Mon", region: "West", channel: "A", value: 7 },
      { day: "Tue", region: "East", channel: "A", value: 12 },
      { day: "Tue", region: "East", channel: "B", value: 6 },
      { day: "Tue", region: "West", channel: "A", value: 8 }
    ];

    const option = chartSpecToOption(spec, rows) as Record<string, any>;
    expect(option.xAxis?.data).toEqual(["Mon", "Tue"]);
    expect(option.series?.length).toBe(3);
    const names = option.series.map((item: any) => item.name);
    expect(names).toContain("East / A");
    expect(names).toContain("East / B");
    expect(names).toContain("West / A");
  });

  it("expands grouped series under dual-axis combo", () => {
    const spec: ChartSpec = {
      chartType: "combo",
      bindings: [
        { role: "x", field: "day" },
        { role: "y", field: "orders", agg: "sum", axis: "primary" },
        { role: "y2", field: "revenue", agg: "sum", axis: "secondary", as: "收入" },
        { role: "series", field: "region" }
      ]
    };
    const rows = [
      { day: "Mon", region: "East", orders: 120, revenue: 350 },
      { day: "Mon", region: "West", orders: 90, revenue: 220 },
      { day: "Tue", region: "East", orders: 160, revenue: 420 },
      { day: "Tue", region: "West", orders: 110, revenue: 260 }
    ];

    const option = chartSpecToOption(spec, rows) as Record<string, any>;
    expect(Array.isArray(option.yAxis)).toBe(true);
    expect(option.yAxis.length).toBe(2);
    expect(option.series?.length).toBe(4);
    const names = option.series.map((item: any) => item.name);
    expect(names).toContain("East · orders");
    expect(names).toContain("East · 收入");
    expect(names).toContain("West · orders");
    expect(names).toContain("West · 收入");
  });

  it("renders true parallel xAxis array and maps series.xAxisIndex", () => {
    const spec: ChartSpec = {
      chartType: "line",
      bindings: [
        { role: "x", field: "day", axis: 0 },
        { role: "x", field: "week", axis: 1 },
        { role: "y", field: "orders", agg: "sum", xAxis: 0 },
        { role: "y2", field: "capacity", agg: "avg", axis: "secondary", xAxis: 1 }
      ]
    };
    const rows = [
      { day: "Mon", week: "W1", orders: 100, capacity: 70 },
      { day: "Tue", week: "W1", orders: 120, capacity: 72 },
      { day: "Wed", week: "W1", orders: 90, capacity: 68 },
      { day: "Thu", week: "W2", orders: 140, capacity: 74 }
    ];

    const option = chartSpecToOption(spec, rows) as Record<string, any>;
    expect(Array.isArray(option.xAxis)).toBe(true);
    expect(option.xAxis.length).toBe(2);
    expect(option.xAxis[0].data).toEqual(["Mon", "Tue", "Wed", "Thu"]);
    expect(option.xAxis[1].data).toEqual(["W1", "W2"]);
    const firstSeries = option.series?.find((item: any) => item.name?.includes("orders"));
    const secondSeries = option.series?.find((item: any) => item.name?.includes("capacity"));
    expect(firstSeries?.xAxisIndex).toBe(0);
    expect(secondSeries?.xAxisIndex).toBe(1);
  });
});

describe("chart-adapter grid toggle", () => {
  it("maps gridShow to axis splitLine without forcing grid container style", () => {
    const spec: ChartSpec = {
      chartType: "line",
      gridShow: false,
      bindings: [
        { role: "x", field: "day" },
        { role: "y", field: "value", agg: "sum" }
      ]
    };
    const rows = [
      { day: "Mon", value: 10 },
      { day: "Tue", value: 14 }
    ];
    const option = chartSpecToOption(spec, rows) as Record<string, any>;
    expect(option.grid?.show).toBeUndefined();
    expect(option.xAxis?.splitLine?.show).toBe(false);
    expect(option.yAxis?.splitLine?.show).toBe(false);
  });
});

describe("chart-adapter title style", () => {
  it("maps titleStyle and subtitleStyle into echarts title config", () => {
    const spec: ChartSpec = {
      chartType: "line",
      titleText: "告警趋势",
      subtitleText: "最近7天",
      titleStyle: {
        fg: "#ef4444",
        fontSize: 20,
        bold: true,
        bg: "#fef2f2",
        borderC: "#fecaca",
        borderW: 1,
        radius: 10,
        pad: 8
      },
      subtitleStyle: {
        fg: "#64748b",
        fontSize: 12,
        italic: true
      },
      bindings: [
        { role: "x", field: "day" },
        { role: "y", field: "value", agg: "sum" }
      ]
    };
    const rows = [
      { day: "Mon", value: 10 },
      { day: "Tue", value: 12 }
    ];

    const option = chartSpecToOption(spec, rows) as Record<string, any>;
    expect(option.title?.textStyle?.color).toBe("#ef4444");
    expect(option.title?.textStyle?.fontSize).toBe(20);
    expect(option.title?.backgroundColor).toBe("#fef2f2");
    expect(option.title?.borderColor).toBe("#fecaca");
    expect(option.title?.subtextStyle?.color).toBe("#64748b");
    expect(option.title?.subtextStyle?.fontSize).toBe(12);
  });
});
