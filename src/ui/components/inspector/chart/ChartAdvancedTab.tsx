import type { ChartSpec } from "../../../../core/doc/types";

export function ChartAdvancedTab({
  props,
  onToggleLegend,
  onToggleTooltip,
  onToggleGrid,
  onToggleSmooth,
  onToggleStack,
  onToggleArea,
  onToggleXAxis,
  onToggleYAxis,
  onToggleLabel,
  onChangeXAxisTitle,
  onChangeYAxisTitle,
  onChangeValueFormat,
  onChangeTimeFormat
}: {
  props: ChartSpec;
  onToggleLegend: (checked: boolean) => void;
  onToggleTooltip: (checked: boolean) => void;
  onToggleGrid: (checked: boolean) => void;
  onToggleSmooth: (checked: boolean) => void;
  onToggleStack: (checked: boolean) => void;
  onToggleArea: (checked: boolean) => void;
  onToggleXAxis: (checked: boolean) => void;
  onToggleYAxis: (checked: boolean) => void;
  onToggleLabel: (checked: boolean) => void;
  onChangeXAxisTitle: (value: string) => void;
  onChangeYAxisTitle: (value: string) => void;
  onChangeValueFormat: (value: string) => void;
  onChangeTimeFormat: (value: string) => void;
}): JSX.Element {
  return (
    <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
      <strong>高级配置</strong>
      <div className="row">
        <label className="row">
          <input type="checkbox" checked={Boolean(props.legendShow)} onChange={(event) => onToggleLegend(event.target.checked)} />
          <span>图例</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={props.tooltipShow !== false} onChange={(event) => onToggleTooltip(event.target.checked)} />
          <span>提示框</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={props.gridShow !== false} onChange={(event) => onToggleGrid(event.target.checked)} />
          <span>网格</span>
        </label>
      </div>
      <div className="row">
        <label className="row">
          <input type="checkbox" checked={Boolean(props.smooth)} onChange={(event) => onToggleSmooth(event.target.checked)} />
          <span>平滑</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={Boolean(props.stack)} onChange={(event) => onToggleStack(event.target.checked)} />
          <span>堆叠</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={Boolean(props.area)} onChange={(event) => onToggleArea(event.target.checked)} />
          <span>面积</span>
        </label>
      </div>
      <div className="row">
        <label className="row">
          <input type="checkbox" checked={props.xAxisShow !== false} onChange={(event) => onToggleXAxis(event.target.checked)} />
          <span>X 轴</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={props.yAxisShow !== false} onChange={(event) => onToggleYAxis(event.target.checked)} />
          <span>Y 轴</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={Boolean(props.labelShow)} onChange={(event) => onToggleLabel(event.target.checked)} />
          <span>标签</span>
        </label>
      </div>
      <label className="col">
        <span>X 轴标题</span>
        <input className="input" value={String(props.xAxisTitle ?? "")} onChange={(event) => onChangeXAxisTitle(event.target.value)} />
      </label>
      <label className="col">
        <span>Y 轴标题</span>
        <input className="input" value={String(props.yAxisTitle ?? "")} onChange={(event) => onChangeYAxisTitle(event.target.value)} />
      </label>
      <label className="col">
        <span>值格式（valueFormat）</span>
        <input className="input" value={String(props.valueFormat ?? "")} onChange={(event) => onChangeValueFormat(event.target.value)} />
      </label>
      <label className="col">
        <span>时间格式（timeFormat）</span>
        <input className="input" value={String(props.timeFormat ?? "")} onChange={(event) => onChangeTimeFormat(event.target.value)} />
      </label>
    </div>
  );
}
