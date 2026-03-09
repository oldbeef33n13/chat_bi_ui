import type { ChartSpec } from "../../core/doc/types";

interface ChartQuickActionsProps {
  spec: ChartSpec;
  compact?: boolean;
  onPatch: (patch: Partial<ChartSpec>, summary: string) => void;
}

export function ChartQuickActions({ spec, compact, onPatch }: ChartQuickActionsProps): JSX.Element {
  const isDark = String(spec.themeRef ?? "").includes("dark");
  const gridVisible = spec.gridShow !== false;

  return (
    <div className={`chart-quick-actions ${compact ? "compact" : ""}`}>
      <select
        className="select mini-select"
        value={spec.chartType}
        title="快速切换图表类型"
        onChange={(event) => onPatch({ chartType: event.target.value as ChartSpec["chartType"] }, "quick chart type")}
      >
        <option value="line">line</option>
        <option value="bar">bar</option>
        <option value="pie">pie</option>
        <option value="combo">combo</option>
        <option value="scatter">scatter</option>
      </select>
      <button
        className="btn mini-btn"
        title="一键切换暗色主题/恢复默认主题"
        onClick={() => onPatch(isDark ? { themeRef: "", paletteRef: "" } : { themeRef: "theme.tech.dark", paletteRef: "palette.tech.dark" }, isDark ? "quick reset theme" : "quick dark theme")}
      >
        {isDark ? "恢复主题" : "暗色"}
      </button>
      <button className="btn mini-btn" title="一键切换网格显示" onClick={() => onPatch({ gridShow: !gridVisible }, "quick toggle grid")}>
        {gridVisible ? "无网格" : "开网格"}
      </button>
      <button className="btn mini-btn" title="一键切换数据标签显示" onClick={() => onPatch({ labelShow: !Boolean(spec.labelShow) }, "quick toggle labels")}>
        {spec.labelShow ? "关标签" : "开标签"}
      </button>
    </div>
  );
}
