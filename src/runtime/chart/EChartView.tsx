import { useEffect, useRef } from "react";
import { BarChart, GaugeChart, HeatmapChart, LineChart, PieChart, RadarChart, SankeyChart, ScatterChart, TreemapChart } from "echarts/charts";
import { CalendarComponent, GridComponent, LegendComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { init, type ECharts, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { ChartSpec } from "../../core/doc/types";
import { chartSpecToOption } from "./chart-adapter";

use([
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  RadarComponent,
  CalendarComponent,
  VisualMapComponent,
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  RadarChart,
  SankeyChart,
  TreemapChart,
  GaugeChart,
  HeatmapChart,
  CanvasRenderer
]);

interface EChartViewProps {
  spec: ChartSpec;
  rows: Array<Record<string, unknown>>;
  height?: number | string;
}

export function EChartView({ spec, rows, height = 240 }: EChartViewProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }
    const chart = init(rootRef.current);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(rootRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }
    const option = chartSpecToOption(spec, rows);
    chartRef.current.setOption(option, true);
  }, [rows, spec]);

  return <div ref={rootRef} style={{ width: "100%", height }} />;
}
