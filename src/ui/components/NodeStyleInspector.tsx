import type { VNode, VStyle } from "../../core/doc/types";
import { useEditorStore } from "../state/editor-context";
import { ColorField } from "./ColorField";
import { applyTextStylePreset, cleanNodeStyle, TEXT_STYLE_PRESETS } from "../utils/node-style";

const SHADOW_PRESETS = [
  { label: "无阴影", value: "" },
  { label: "柔和", value: "0 8px 24px rgba(15, 23, 42, 0.12)" },
  { label: "强调", value: "0 14px 32px rgba(37, 99, 235, 0.18)" }
] as const;

export function NodeStyleInspector({
  node,
  title = "通用样式",
  showTextControls = node.kind === "text"
}: {
  node: VNode;
  title?: string;
  showTextControls?: boolean;
}): JSX.Element {
  const store = useEditorStore();
  const style = node.style ?? {};

  const commitStyle = (nextStyle: VStyle, summary: string, mergeWindowMs = 140): void => {
    const cleaned = cleanNodeStyle(nextStyle);
    if (!cleaned) {
      store.executeCommand({ type: "ResetStyle", nodeId: node.id }, { summary, mergeWindowMs });
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands: [
          { type: "ResetStyle", nodeId: node.id },
          { type: "UpdateStyle", nodeId: node.id, style: cleaned }
        ]
      },
      { summary, mergeWindowMs }
    );
  };

  const patchStyle = (patch: Partial<VStyle>, summary: string, mergeWindowMs = 140): void => {
    commitStyle({ ...style, ...patch }, summary, mergeWindowMs);
  };

  const updateNumber = (
    key: keyof VStyle,
    value: string,
    summary: string,
    min?: number,
    max?: number
  ): void => {
    const trimmed = value.trim();
    if (!trimmed) {
      const next = { ...style };
      delete next[key];
      commitStyle(next, summary);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      return;
    }
    const bounded = max !== undefined ? Math.min(max, parsed) : parsed;
    patchStyle({ [key]: min !== undefined ? Math.max(min, bounded) : bounded } as Partial<VStyle>, summary);
  };

  const clearStyle = (): void => {
    store.executeCommand({ type: "ResetStyle", nodeId: node.id }, { summary: "reset node style" });
  };

  return (
    <div className="col node-style-inspector">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong>{title}</strong>
        <button className="btn mini-btn" onClick={clearStyle}>
          重置样式
        </button>
      </div>

      {showTextControls ? (
        <div className="col inspector-style-section">
          <strong>文本</strong>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {TEXT_STYLE_PRESETS.map((preset) => (
              <button key={preset.id} className="btn mini-btn" onClick={() => commitStyle(applyTextStylePreset(style, preset.id), `apply ${preset.id} text preset`)}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="col" style={{ minWidth: 92 }}>
              <span>字号</span>
              <input className="input" type="number" value={style.fontSize ?? ""} onChange={(event) => updateNumber("fontSize", event.target.value, "update font size", 8, 96)} />
            </label>
            <label className="col" style={{ minWidth: 92 }}>
              <span>行高</span>
              <input className="input" type="number" step="0.1" value={style.lineHeight ?? ""} onChange={(event) => updateNumber("lineHeight", event.target.value, "update line height", 0.8, 3)} />
            </label>
            <label className="col" style={{ minWidth: 92 }}>
              <span>字距</span>
              <input className="input" type="number" step="0.5" value={style.letterSpacing ?? ""} onChange={(event) => updateNumber("letterSpacing", event.target.value, "update letter spacing", -4, 20)} />
            </label>
          </div>
          <ColorField label="字体颜色" value={style.fg} onChange={(value) => patchStyle({ fg: value }, "update text color")} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="col" style={{ minWidth: 120 }}>
              <span>水平对齐</span>
              <select className="select" value={style.align ?? "left"} onChange={(event) => patchStyle({ align: event.target.value as VStyle["align"] }, "update text align")}>
                <option value="left">左对齐</option>
                <option value="center">居中</option>
                <option value="right">右对齐</option>
              </select>
            </label>
            <label className="col" style={{ minWidth: 120 }}>
              <span>垂直对齐</span>
              <select className="select" value={style.valign ?? "middle"} onChange={(event) => patchStyle({ valign: event.target.value as VStyle["valign"] }, "update text valign")}>
                <option value="top">顶部</option>
                <option value="middle">居中</option>
                <option value="bottom">底部</option>
              </select>
            </label>
            <label className="col" style={{ minWidth: 120 }}>
              <span>文字方向</span>
              <select className="select" value={style.writingMode ?? "horizontal-tb"} onChange={(event) => patchStyle({ writingMode: event.target.value as VStyle["writingMode"] }, "update text writing mode")}>
                <option value="horizontal-tb">横排</option>
                <option value="vertical-rl">竖排</option>
              </select>
            </label>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="row">
              <input type="checkbox" checked={Boolean(style.bold)} onChange={(event) => patchStyle({ bold: event.target.checked }, "toggle bold")} />
              <span>加粗</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(style.italic)} onChange={(event) => patchStyle({ italic: event.target.checked }, "toggle italic")} />
              <span>斜体</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(style.underline)} onChange={(event) => patchStyle({ underline: event.target.checked }, "toggle underline")} />
              <span>下划线</span>
            </label>
          </div>
        </div>
      ) : null}

      <div className="col inspector-style-section">
        <strong>容器</strong>
        <ColorField label="背景色" value={style.bg} opacity={style.bgOpacity ?? 1} onChange={(value) => patchStyle({ bg: value }, "update background color")} onOpacityChange={(value) => patchStyle({ bgOpacity: value }, "update background opacity")} />
        <label className="col">
          <span>{`整体透明度 ${Math.round((style.opacity ?? 1) * 100)}%`}</span>
          <input type="range" min="0" max="1" step="0.05" value={style.opacity ?? 1} onChange={(event) => patchStyle({ opacity: Number(event.target.value) }, "update opacity")} />
        </label>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <label className="col" style={{ minWidth: 96 }}>
            <span>内边距</span>
            <input className="input" type="number" value={typeof style.pad === "number" ? style.pad : ""} onChange={(event) => updateNumber("pad", event.target.value, "update padding", 0, 64)} />
          </label>
          <label className="col" style={{ minWidth: 140 }}>
            <span>阴影</span>
            <select className="select" value={style.shadow ?? ""} onChange={(event) => patchStyle({ shadow: event.target.value || undefined }, "update shadow")}>
              {SHADOW_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="col inspector-style-section">
        <strong>边框</strong>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <label className="col" style={{ minWidth: 96 }}>
            <span>边框宽度</span>
            <input className="input" type="number" value={style.borderW ?? ""} onChange={(event) => updateNumber("borderW", event.target.value, "update border width", 0, 12)} />
          </label>
          <label className="col" style={{ minWidth: 96 }}>
            <span>圆角</span>
            <input className="input" type="number" value={style.radius ?? ""} onChange={(event) => updateNumber("radius", event.target.value, "update radius", 0, 48)} />
          </label>
        </div>
        <ColorField label="边框颜色" value={style.borderC} onChange={(value) => patchStyle({ borderC: value }, "update border color")} />
      </div>
    </div>
  );
}
