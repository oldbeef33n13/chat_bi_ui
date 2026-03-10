import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLOR_PALETTE_PRESETS, COLOR_SWATCH_PRESETS, normalizeColorValue, normalizeHexColor } from "../utils/node-style";

interface ColorPaletteFieldProps {
  label: string;
  value: string[];
  onChange: (colors: string[]) => void;
}

export function ColorPaletteField({ label, value, onChange }: ColorPaletteFieldProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string[]>(value.length > 0 ? value : ["#2563eb", "#22c55e", "#f59e0b"]);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 360 });

  useEffect(() => {
    setDraft(value.length > 0 ? value : ["#2563eb", "#22c55e", "#f59e0b"]);
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const updatePosition = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const width = 380;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
      const top = Math.min(window.innerHeight - 12, rect.bottom + 8);
      setPosition({ top, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const commit = (nextDraft: string[]): void => {
    const cleaned = nextDraft.map((item) => normalizeColorValue(item)).filter((item): item is string => Boolean(item));
    setDraft(cleaned.length > 0 ? cleaned : ["#2563eb"]);
    onChange(cleaned);
  };

  const updateDraftColor = (index: number, nextValue: string): void => {
    setDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? nextValue : item)));
  };

  return (
    <div className="color-field">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span>{label}</span>
        <button ref={anchorRef} type="button" className={`color-field-trigger ${open ? "active" : ""}`} onClick={() => setOpen((current) => !current)}>
          <span className="color-palette-preview">
            {value.length > 0 ? value.slice(0, 5).map((item) => <span key={`${label}_${item}`} className="color-field-swatch" style={{ backgroundColor: item }} />) : <span className="muted">默认</span>}
          </span>
          <span className="color-field-value">{value.length > 0 ? `${value.length} 色` : "默认色板"}</span>
        </button>
      </div>
      {open
        ? createPortal(
            <div ref={panelRef} className="color-popover color-palette-popover" role="dialog" aria-label={`${label}调色板`} style={{ top: position.top, left: position.left, width: position.width }}>
              <div className="color-popover-title">{label}</div>
              <div className="color-palette-presets">
                {COLOR_PALETTE_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" className="color-palette-preset" onClick={() => commit(preset.colors)}>
                    <strong>{preset.label}</strong>
                    <span className="color-palette-preview">
                      {preset.colors.map((color) => (
                        <span key={`${preset.id}_${color}`} className="color-field-swatch" style={{ backgroundColor: color }} />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
              <div className="color-palette-editor">
                {draft.map((item, index) => (
                  <div key={`draft_color_${index}`} className="color-popover-row">
                    <input
                      type="color"
                      className="color-native-input"
                      value={normalizeHexColor(item)}
                      onChange={(event) => {
                        const next = draft.map((color, colorIndex) => (colorIndex === index ? event.target.value : color));
                        setDraft(next);
                        onChange(next);
                      }}
                    />
                    <input
                      className="input"
                      value={item}
                      onChange={(event) => updateDraftColor(index, event.target.value)}
                      onBlur={() => commit(draft)}
                    />
                    <div className="color-inline-swatches">
                      {COLOR_SWATCH_PRESETS.slice(0, 6).map((preset) => (
                        <button
                          key={`${index}_${preset}`}
                          type="button"
                          className="color-swatch-btn mini"
                          style={{ backgroundColor: preset }}
                          onClick={() => {
                            const next = draft.map((color, colorIndex) => (colorIndex === index ? preset : color));
                            commit(next);
                          }}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn mini-btn"
                      onClick={() => commit(draft.filter((_, draftIndex) => draftIndex !== index))}
                      disabled={draft.length <= 1}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
              <div className="row color-popover-actions">
                <button type="button" className="btn mini-btn" onClick={() => setDraft((current) => [...current, "#94a3b8"])}>
                  新增颜色
                </button>
                <button type="button" className="btn mini-btn" onClick={() => commit([])}>
                  清空
                </button>
                <button type="button" className="btn mini-btn" onClick={() => commit(draft)}>
                  应用
                </button>
                <button type="button" className="btn mini-btn" onClick={() => setOpen(false)}>
                  关闭
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
