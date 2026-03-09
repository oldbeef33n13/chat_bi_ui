import { useEffect, useRef, useState } from "react";
import { BarChart, GaugeChart, HeatmapChart, LineChart, PieChart, RadarChart, SankeyChart, ScatterChart, TreemapChart } from "echarts/charts";
import { CalendarComponent, GridComponent, LegendComponent, RadarComponent, TitleComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { init, type ECharts, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { ChartSpec } from "../../core/doc/types";
import { chartSpecToOption } from "./chart-adapter";

// 只注册当前业务使用到的组件，避免全量引入 ECharts 体积。
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

/** 图表运行态组件：负责实例生命周期与 option 更新。 */
export function EChartView({ spec, rows, height = 240 }: EChartViewProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

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
    // spec 或数据变化时全量覆盖 option，保证和编辑器 DSL 同步。
    try {
      const option = chartSpecToOption(spec, rows);
      chartRef.current.setOption(option, true);
      setRenderError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[EChartView] 图表渲染失败：${spec.titleText ?? spec.chartType} -> ${message}`);
      try {
        chartRef.current.clear();
      } catch {
        // clear 失败不影响页面主流程。
      }
      setRenderError(message);
    }
  }, [rows, spec]);

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <div ref={rootRef} style={{ width: "100%", height: "100%" }} />
      {renderError ? (
        <div
          className="muted"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 12,
            background: "rgba(255,255,255,0.86)"
          }}
        >
          图表渲染失败，请检查字段绑定或图表类型
        </div>
      ) : null}
    </div>
  );
}
