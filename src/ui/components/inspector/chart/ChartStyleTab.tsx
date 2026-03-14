import type { ChartSpec, VNode } from "../../../../core/doc/types";
import { themes } from "../../../../runtime/theme/themes";
import { ColorPaletteField } from "../../ColorPaletteField";
import { NodeStyleInspector } from "../../NodeStyleInspector";
import { TextStyleEditor } from "../../TextStyleEditor";

export function ChartStyleTab({
  node,
  props,
  paletteColors,
  onToggleQuickDarkTheme,
  onToggleQuickGrid,
  onToggleLabels,
  onChangeThemeRef,
  onChangePaletteRef,
  onChangePaletteColors,
  onChangeTitleStyle,
  onChangeSubtitleStyle
}: {
  node: VNode;
  props: ChartSpec;
  paletteColors: string[];
  onToggleQuickDarkTheme: () => void;
  onToggleQuickGrid: () => void;
  onToggleLabels: () => void;
  onChangeThemeRef: (value: string) => void;
  onChangePaletteRef: (value: string) => void;
  onChangePaletteColors: (colors: string[]) => void;
  onChangeTitleStyle: (style: ChartSpec["titleStyle"]) => void;
  onChangeSubtitleStyle: (style: ChartSpec["subtitleStyle"]) => void;
}): JSX.Element {
  return (
    <>
      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <strong>快捷样式</strong>
        <div className="row">
          <button className="btn" title="一键切换暗色主题/恢复默认主题" onClick={onToggleQuickDarkTheme}>
            {String(props.themeRef ?? "").includes("dark") ? "恢复主题" : "一键深色主题"}
          </button>
          <button className="btn" title="一键切换网格显示" onClick={onToggleQuickGrid}>
            {props.gridShow === false ? "开启网格" : "一键无网格"}
          </button>
          <button className="btn" onClick={onToggleLabels}>
            {props.labelShow ? "一键数据标签关闭" : "一键数据标签开启"}
          </button>
        </div>
      </div>

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <strong>主题与配色</strong>
        <label className="col">
          <span>主题</span>
          <select className="select" value={props.themeRef ?? ""} onChange={(event) => onChangeThemeRef(event.target.value)}>
            <option value="">跟随文档</option>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
        <label className="col">
          <span>配色</span>
          <select className="select" value={props.paletteRef ?? ""} onChange={(event) => onChangePaletteRef(event.target.value)}>
            <option value="">默认</option>
            <option value="palette.tech">palette.tech</option>
            <option value="palette.tech.dark">palette.tech.dark</option>
            <option value="palette.business">palette.business</option>
          </select>
        </label>
        <ColorPaletteField label="自定义调色板" value={paletteColors} onChange={onChangePaletteColors} />
      </div>
      <TextStyleEditor title="图表标题样式" value={props.titleStyle} onChange={onChangeTitleStyle} />
      <TextStyleEditor title="图表副标题样式" value={props.subtitleStyle} onChange={onChangeSubtitleStyle} />
      <NodeStyleInspector node={node} title="图表容器样式" showTextControls={false} />
    </>
  );
}
