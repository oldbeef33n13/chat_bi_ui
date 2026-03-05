import type { ChartSpec } from "../../core/doc/types";

interface ChartQuickActionsProps {
  spec: ChartSpec;
  compact?: boolean;
  onPatch: (patch: Partial<ChartSpec>, summary: string) => void;
}

export function ChartQuickActions({ spec, compact, onPatch }: ChartQuickActionsProps): JSX.Element {
  return (
    <div className={`chart-quick-actions ${compact ? "compact" : ""}`}>
      <select className="select mini-select" value={spec.chartType} onChange={(event) => onPatch({ chartType: event.target.value as ChartSpec["chartType"] }, "quick chart type")}>
        <option value="line">line</option>
        <option value="bar">bar</option>
        <option value="pie">pie</option>
        <option value="combo">combo</option>
        <option value="scatter">scatter</option>
      </select>
      <button className="btn mini-btn" onClick={() => onPatch({ themeRef: "theme.tech.dark", paletteRef: "palette.tech.dark" }, "quick dark theme")}>
        暗色
      </button>
      <button className="btn mini-btn" onClick={() => onPatch({ gridShow: false }, "quick no grid")}>
        无网格
      </button>
      <button className="btn mini-btn" onClick={() => onPatch({ labelShow: !Boolean(spec.labelShow) }, "quick toggle labels")}>
        {spec.labelShow ? "关标签" : "开标签"}
      </button>
    </div>
  );
}
