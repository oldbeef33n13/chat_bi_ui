import type { VStyle } from "../../core/doc/types";
import { applyTextStylePreset, cleanNodeStyle, TEXT_STYLE_PRESETS } from "../utils/node-style";
import { ColorField } from "./ColorField";

const SHADOW_PRESETS = [
  { label: "无阴影", value: "" },
  { label: "柔和", value: "0 8px 24px rgba(15, 23, 42, 0.12)" },
  { label: "强调", value: "0 14px 32px rgba(37, 99, 235, 0.18)" }
] as const;

export function TextStyleEditor({
  title,
  value,
  onChange,
  onReset,
  showContainerControls = true
}: {
  title: string;
  value?: VStyle;
  onChange: (style?: VStyle) => void;
  onReset?: () => void;
  showContainerControls?: boolean;
}): JSX.Element {
  const style = value ?? {};

  const commit = (nextStyle: VStyle | undefined): void => {
    onChange(cleanNodeStyle(nextStyle));
  };

  const patchStyle = (patch: Partial<VStyle>): void => {
    commit({ ...style, ...patch });
  };

  const clearKey = (key: keyof VStyle): void => {
    const next = { ...style };
    delete next[key];
    commit(next);
  };

  const updateNumber = (key: keyof VStyle, rawValue: string, min?: number, max?: number): void => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      clearKey(key);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      return;
    }
    const bounded = max !== undefined ? Math.min(max, parsed) : parsed;
    patchStyle({ [key]: min !== undefined ? Math.max(min, bounded) : bounded } as Partial<VStyle>);
  };

  return (
    <div className="col inspector-style-section">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong>{title}</strong>
        {onReset ? (
          <button className="btn mini-btn" onClick={onReset}>
            重置
          </button>
        ) : null}
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {TEXT_STYLE_PRESETS.map((preset) => (
          <button key={`${title}_${preset.id}`} className="btn mini-btn" onClick={() => commit(applyTextStylePreset(style, preset.id))}>
            {preset.label}
          </button>
        ))}
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="col" style={{ minWidth: 92 }}>
          <span>字号</span>
          <input className="input" type="number" value={style.fontSize ?? ""} onChange={(event) => updateNumber("fontSize", event.target.value, 8, 96)} />
        </label>
        <label className="col" style={{ minWidth: 92 }}>
          <span>行高</span>
          <input className="input" type="number" step="0.1" value={style.lineHeight ?? ""} onChange={(event) => updateNumber("lineHeight", event.target.value, 0.8, 3)} />
        </label>
        <label className="col" style={{ minWidth: 92 }}>
          <span>字距</span>
          <input className="input" type="number" step="0.5" value={style.letterSpacing ?? ""} onChange={(event) => updateNumber("letterSpacing", event.target.value, -4, 20)} />
        </label>
      </div>
      <ColorField label="字体颜色" value={style.fg} onChange={(next) => patchStyle({ fg: next })} />
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="col" style={{ minWidth: 120 }}>
          <span>水平对齐</span>
          <select className="select" value={style.align ?? "left"} onChange={(event) => patchStyle({ align: event.target.value as VStyle["align"] })}>
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </label>
        <label className="col" style={{ minWidth: 120 }}>
          <span>垂直对齐</span>
          <select className="select" value={style.valign ?? "middle"} onChange={(event) => patchStyle({ valign: event.target.value as VStyle["valign"] })}>
            <option value="top">顶部</option>
            <option value="middle">居中</option>
            <option value="bottom">底部</option>
          </select>
        </label>
        <label className="col" style={{ minWidth: 120 }}>
          <span>文字方向</span>
          <select className="select" value={style.writingMode ?? "horizontal-tb"} onChange={(event) => patchStyle({ writingMode: event.target.value as VStyle["writingMode"] })}>
            <option value="horizontal-tb">横排</option>
            <option value="vertical-rl">竖排</option>
          </select>
        </label>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="row">
          <input type="checkbox" checked={Boolean(style.bold)} onChange={(event) => patchStyle({ bold: event.target.checked })} />
          <span>加粗</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={Boolean(style.italic)} onChange={(event) => patchStyle({ italic: event.target.checked })} />
          <span>斜体</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={Boolean(style.underline)} onChange={(event) => patchStyle({ underline: event.target.checked })} />
          <span>下划线</span>
        </label>
      </div>
      {showContainerControls ? (
        <>
          <ColorField label="背景色" value={style.bg} opacity={style.bgOpacity ?? 1} onChange={(next) => patchStyle({ bg: next })} onOpacityChange={(next) => patchStyle({ bgOpacity: next })} />
          <label className="col">
            <span>{`整体透明度 ${Math.round((style.opacity ?? 1) * 100)}%`}</span>
            <input type="range" min="0" max="1" step="0.05" value={style.opacity ?? 1} onChange={(event) => patchStyle({ opacity: Number(event.target.value) })} />
          </label>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="col" style={{ minWidth: 96 }}>
              <span>内边距</span>
              <input className="input" type="number" value={typeof style.pad === "number" ? style.pad : ""} onChange={(event) => updateNumber("pad", event.target.value, 0, 64)} />
            </label>
            <label className="col" style={{ minWidth: 96 }}>
              <span>边框宽度</span>
              <input className="input" type="number" value={style.borderW ?? ""} onChange={(event) => updateNumber("borderW", event.target.value, 0, 12)} />
            </label>
            <label className="col" style={{ minWidth: 96 }}>
              <span>圆角</span>
              <input className="input" type="number" value={style.radius ?? ""} onChange={(event) => updateNumber("radius", event.target.value, 0, 48)} />
            </label>
          </div>
          <ColorField label="边框颜色" value={style.borderC} onChange={(next) => patchStyle({ borderC: next })} />
          <label className="col">
            <span>阴影</span>
            <select className="select" value={style.shadow ?? ""} onChange={(event) => patchStyle({ shadow: event.target.value || undefined })}>
              {SHADOW_PRESETS.map((preset) => (
                <option key={`${title}_${preset.label}`} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}
